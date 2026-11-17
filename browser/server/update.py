#!/usr/bin/env python3
"""Update an installed PEA Web checkout from its official repository, on the owner's command.

    python3 browser/server/update.py check
    python3 browser/server/update.py apply --launchd-label LABEL --confirm
    python3 browser/server/update.py rollback --launchd-label LABEL --confirm

It moves a clean git checkout forward to the newest commit of the official repository's main
branch, restarts the service, and checks that PEA came back reporting exactly that commit and
version. If it did not, the previous commit is put back and restarted. Nothing runs on a timer and
nothing here is reachable from the web app or a model: a person runs it.

This is the development channel: it trusts the official repository over HTTPS and names an exact
commit, and it verifies no signature. Signed releases are a separate, stricter path (releases.py).
Browser data, the connection token and every setting live outside the checkout and are not touched.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

from build_identity import COMMIT, release_config

HERE = Path(__file__).resolve()
LABEL = re.compile(r'[A-Za-z0-9._-]{1,100}\Z')
LOCAL = re.compile(r'http://(?:127\.0\.0\.1|localhost):([1-9]\d{0,4})\Z')


class Refusal(Exception):
    """A plain reason nothing was changed."""


def official_urls(repository):
    return {f'https://github.com/{repository}.git', f'https://github.com/{repository}',
            f'git@github.com:{repository}.git', f'ssh://git@github.com/{repository}.git'}


def git(checkout, *args, timeout=120):
    environment = {**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'LC_ALL': 'C'}
    try:
        done = subprocess.run(['git', '-C', str(checkout), *args], capture_output=True, text=True, timeout=timeout, env=environment)
    except FileNotFoundError:
        raise Refusal('git is not installed.') from None
    except subprocess.TimeoutExpired:
        raise Refusal('git did not answer in time. Nothing was changed.') from None
    if done.returncode != 0:
        raise Refusal('git refused: ' + (done.stderr.strip().splitlines() or ['no reason given'])[-1][:200])
    return done.stdout.strip()


def identity_at(checkout, commit):
    """The version a commit carries, read from that commit and not from the working files."""
    value = json.loads(git(checkout, 'show', f'{commit}:browser/release.json'))
    if not isinstance(value, dict) or not isinstance(value.get('version'), str) or len(value['version']) > 80:
        raise Refusal('That commit has no readable version.')
    return value['version']


def inspect(checkout, official=None):
    """What is installed, after checking it is a clean checkout of the official repository."""
    checkout = Path(checkout).resolve()
    if not (checkout / 'browser' / 'release.json').is_file():
        raise Refusal('That folder is not a PEA Web checkout.')
    if git(checkout, 'rev-parse', '--show-toplevel') != str(checkout):
        raise Refusal('That folder is not the top of its own git checkout.')
    repository = release_config(checkout / 'browser')['repository']
    if not repository:
        raise Refusal('This copy names no official repository, so it cannot be updated this way.')
    accepted = {official} if official else official_urls(repository)
    if git(checkout, 'remote', 'get-url', 'origin') not in accepted:
        raise Refusal(f'This checkout does not come from the official repository ({repository}). Forks and other remotes are not updated this way.')
    if git(checkout, 'status', '--porcelain', '--untracked-files=no'):
        raise Refusal('This checkout has changes to tracked files. Commit, stash or discard them first; nothing was changed.')
    current = git(checkout, 'rev-parse', 'HEAD')
    if not COMMIT.fullmatch(current):
        raise Refusal('The installed commit could not be read.')
    return {'checkout': checkout, 'repository': repository, 'commit': current, 'version': identity_at(checkout, current)}


def find_target(installed):
    """The newest commit of the official main branch, and how far ahead of the installed one it is."""
    checkout = installed['checkout']
    git(checkout, 'fetch', '--no-tags', '--prune', 'origin', '+refs/heads/main:refs/remotes/origin/main')
    target = git(checkout, 'rev-parse', 'refs/remotes/origin/main')
    if not COMMIT.fullmatch(target):
        raise Refusal('The official main branch could not be read.')
    if target == installed['commit']:
        return {'commit': target, 'version': installed['version'], 'ahead': 0, 'notes': []}
    try:
        git(checkout, 'merge-base', '--is-ancestor', installed['commit'], target)
    except Refusal:
        raise Refusal('The installed copy has commits the official main branch does not. It is not moved; sort that out by hand.') from None
    ahead = int(git(checkout, 'rev-list', '--count', f"{installed['commit']}..{target}"))
    notes = git(checkout, 'log', '--format=%s', '--max-count=20', f"{installed['commit']}..{target}").splitlines()
    return {'commit': target, 'version': identity_at(checkout, target), 'ahead': ahead, 'notes': [n[:160] for n in notes]}


def healthy(url, commit, version, wait=40.0, pause=0.5):
    """Whether PEA at `url` reports exactly this commit and version, unmodified, within `wait` seconds."""
    deadline = time.monotonic() + wait
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    while True:
        try:
            with opener.open(url + '/api/build-info', timeout=3) as answer:
                info = json.loads(answer.read(4096))
            if isinstance(info, dict) and info.get('commit') == commit and info.get('version') == version and info.get('modified') is False:
                return True
        except urllib.error.HTTPError as error:
            error.close()
        except (OSError, ValueError):
            pass
        if time.monotonic() >= deadline:
            return False
        time.sleep(pause)


def launchd_restart(label):
    """A function that restarts one loaded launchd job of this user. Refuses up front if it is not loaded."""
    if not LABEL.fullmatch(label):
        raise Refusal('That is not a launchd label.')
    target = f'gui/{os.getuid()}/{label}'
    if subprocess.run(['launchctl', 'print', target], capture_output=True, timeout=10).returncode != 0:
        raise Refusal(f'The service {label} is not loaded for this user, so PEA could not be restarted. Nothing was changed.')

    def restart():
        if subprocess.run(['launchctl', 'kickstart', '-k', target], capture_output=True, timeout=30).returncode != 0:
            raise Refusal('The service did not restart.')
    return restart


def record(state, entry):
    """Keeps the last update where a rollback can find it. Private to the owner."""
    state = Path(state).expanduser()
    state.mkdir(mode=0o700, parents=True, exist_ok=True)
    temporary = state / 'last-update.json.new'
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(entry, stream)
    os.replace(temporary, state / 'last-update.json')


def last(state):
    try:
        entry = json.loads((Path(state).expanduser() / 'last-update.json').read_text())
    except (OSError, ValueError):
        raise Refusal('No earlier update is recorded, so there is nothing to go back to.') from None
    if not isinstance(entry, dict) or not all(isinstance(entry.get(k), str) and COMMIT.fullmatch(entry[k]) for k in ('previous', 'target')):
        raise Refusal('The record of the last update is not readable.')
    return entry


def move(installed, commit, version, *, url, restart, state, wait, kind):
    """Moves the checkout to `commit`, restarts, and puts the old commit back if PEA is not healthy on it."""
    checkout, before = installed['checkout'], installed['commit']
    entry = {'kind': kind, 'previous': before, 'previousVersion': installed['version'], 'target': commit, 'targetVersion': version,
             'at': int(time.time()), 'outcome': 'started'}
    record(state, entry)
    # --keep moves the branch and files but refuses rather than overwrite a local change.
    git(checkout, 'reset', '--keep', commit)
    try:
        restart()
        good = healthy(url, commit, version, wait)
        why = 'PEA did not come back reporting the new commit and version.'
    except Refusal as refusal:
        good, why = False, str(refusal)
    if good:
        record(state, {**entry, 'outcome': 'succeeded'})
        return entry
    git(checkout, 'reset', '--keep', before)
    restored = False
    try:
        restart()
        restored = healthy(url, before, installed['version'], wait)
    except Refusal:
        pass
    record(state, {**entry, 'outcome': 'rolled back' if restored else 'rolled back, not confirmed healthy'})
    raise Refusal(f'{why} The previous version ({installed["version"]}, {before[:12]}) was put back'
                  + ('.' if restored else ', but PEA did not confirm it is running. Check the service.'))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('command', choices=('check', 'apply', 'rollback'))
    parser.add_argument('--checkout', default=str(HERE.parents[2]), help='The installed git checkout; defaults to the one this script is in.')
    parser.add_argument('--url', default='http://127.0.0.1:18770', help='Where this PEA answers on this machine, for the health check.')
    parser.add_argument('--launchd-label', help='The launchd job of this user that runs PEA; it is restarted after the files change.')
    parser.add_argument('--state-dir', default=str(Path.home() / '.config' / 'pea' / 'updates'), help='Private folder for the record of the last update.')
    parser.add_argument('--wait', type=float, default=40.0, help='Seconds to wait for PEA to report the expected version.')
    parser.add_argument('--confirm', action='store_true', help='Required to change anything.')
    args = parser.parse_args(argv)
    try:
        if not LOCAL.fullmatch(args.url) or not 1 <= args.wait <= 300:
            raise Refusal('The health check asks only this machine: use http://127.0.0.1:PORT, and a wait of 1 to 300 seconds.')
        installed = inspect(args.checkout)
        print(f"Installed: {installed['version']} ({installed['commit'][:12]}) from {installed['repository']}")
        if args.command == 'rollback':
            entry = last(args.state_dir)
            if entry['target'] != installed['commit']:
                raise Refusal('The installed copy is not the one the last update left, so going back is not safe to do automatically.')
            target = {'commit': entry['previous'], 'version': identity_at(installed['checkout'], entry['previous']), 'ahead': 0, 'notes': []}
            print(f"Going back to: {target['version']} ({target['commit'][:12]})")
        else:
            target = find_target(installed)
            if not target['ahead']:
                print('Already up to date with the official main branch. Nothing to do.')
                return 0
            print(f"Available: {target['version']} ({target['commit'][:12]}), {target['ahead']} change{'s' if target['ahead'] != 1 else ''} ahead:")
            for line in target['notes']:
                print('  - ' + line)
            print('This is a development update: the exact commit above from the official repository, with no signature check.')
            if args.command == 'check':
                print('Nothing was changed. Run apply with --launchd-label and --confirm to install it.')
                return 0
        if not args.launchd_label:
            raise Refusal('Name the service to restart with --launchd-label. Nothing was changed.')
        restart = launchd_restart(args.launchd_label)
        if not args.confirm:
            raise Refusal('Add --confirm to go ahead. Nothing was changed.')
        if not healthy(args.url, installed['commit'], installed['version'], wait=6):
            raise Refusal(f'PEA at {args.url} is not running the installed version right now, so a failed update could not be told from this. Start it, or check --url. Nothing was changed.')
        move(installed, target['commit'], target['version'], url=args.url, restart=restart, state=args.state_dir, wait=args.wait, kind=args.command)
        print(f"Done: PEA is running {target['version']} ({target['commit'][:12]}). Reload the page in your browser. Your settings and data were not touched.")
        return 0
    except Refusal as refusal:
        print(f'PEA update: {refusal}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
