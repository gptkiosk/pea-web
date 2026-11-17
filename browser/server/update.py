#!/usr/bin/env python3
"""Update an installed PEA Web checkout from its official repository, on the owner's command.

    python3 browser/server/update.py check
    python3 browser/server/update.py apply --launchd-label LABEL --confirm
    python3 browser/server/update.py rollback --launchd-label LABEL --confirm

It moves a clean git checkout forward to the newest commit of the official repository's main
branch, restarts the service, and checks that PEA came back reporting exactly that commit and
version. If it did not, the previous commit is put back and restarted. Nothing runs on a timer and
nothing here is reachable from the web app or a model: a person runs it.

There are two channels. `--channel release` installs only a published release whose manifest is
signed by the key in this checkout's own browser/server/allowed_signers, and whose tag is exactly
the commit that signature names. `--channel development` (the default) follows the official main
branch by exact commit and checks no signature. Either way, browser data, the connection token and
every setting live outside the checkout and are not touched.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

from build_identity import COMMIT, VERSION, release_config
import releases

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


class OnlyGitHub(urllib.request.HTTPRedirectHandler):
    """A download may be passed on only to GitHub's own file hosts, over HTTPS."""
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        if not re.fullmatch(r'https://[a-z0-9-]+\.githubusercontent\.com/[^\s]*', newurl):
            raise urllib.error.HTTPError(newurl, code, 'Redirect refused.', headers, fp)
        return super().redirect_request(request, fp, code, msg, headers, newurl)


def download(url, limit):
    """Reads at most `limit` bytes of a public GitHub address. Sends no credentials."""
    if not re.fullmatch(r'https://(?:api\.github\.com|github\.com)/[A-Za-z0-9_.~/%?=&+-]{1,400}', url):
        raise Refusal('That is not a GitHub address this command reads.')
    opener = urllib.request.build_opener(OnlyGitHub())
    request = urllib.request.Request(url, headers={'User-Agent': 'PEA-Web-Update', 'Accept': 'application/vnd.github+json' if 'api.github.com' in url else 'application/octet-stream'})
    try:
        with opener.open(request, timeout=20) as answer:
            data = answer.read(limit + 1)
    except (OSError, ValueError):
        raise Refusal('GitHub could not be read. Nothing was changed.') from None
    if len(data) > limit:
        raise Refusal('GitHub sent more than expected. Nothing was changed.')
    return data


def published(repository, read=download):
    """The releases GitHub lists for the official repository: [{tag, prerelease, manifest, signature}]."""
    try:
        rows = json.loads(read(f'https://api.github.com/repos/{repository}/releases?per_page=30', 2000000))
    except ValueError:
        raise Refusal('GitHub did not give a readable list of releases.') from None
    found = []
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, dict) or row.get('draft') is not False or not isinstance(row.get('tag_name'), str):
            continue
        tag = row['tag_name']
        if not tag.startswith('v') or not VERSION.fullmatch(tag[1:]):
            continue
        assets = {a.get('name'): a.get('browser_download_url') for a in row.get('assets', []) if isinstance(a, dict)}
        stem = f'pea-web-{tag[1:]}.manifest.json'
        prefix = f'https://github.com/{repository}/releases/download/{tag}/'
        if assets.get(stem) == prefix + stem and assets.get(stem + '.sig') == prefix + stem + '.sig':
            found.append({'tag': tag, 'prerelease': row.get('prerelease') is True, 'manifest': prefix + stem, 'signature': prefix + stem + '.sig'})
    return found


def find_release(installed, *, prerelease=False, read=download, withdrawn=None, allow_older=False):
    """The newest published release this copy may move to, proven by the signer this checkout trusts.

    Only the signed manifest and its signature are downloaded, never the package: the files come
    from git, at exactly the commit the signature names.
    """
    checkout = installed['checkout']
    signers = checkout / 'browser' / 'server' / 'allowed_signers'
    if not signers.is_file() or signers.is_symlink():
        raise Refusal('This copy has no release signer to check against (browser/server/allowed_signers). It is too old for signed updates; update it once on the development channel.')
    withdrawn = withdrawn or {}
    mine = withdrawn.get(installed['version'])
    rows = [r for r in published(installed['repository'], read) if (prerelease or not r['prerelease']) and r['tag'][1:] not in withdrawn]
    if not rows:
        raise Refusal('No published release is available' + ('.' if prerelease else '. Pre-releases are considered only with --prerelease.')
                      + (f" The installed release was withdrawn by the publisher: {mine}" if mine else ''))
    newest = max(rows, key=lambda r: releases.version_key(r['tag'][1:]))
    tag, version = newest['tag'], newest['tag'][1:]
    with tempfile.TemporaryDirectory() as folder:
        manifest, signature = Path(folder) / 'manifest.json', Path(folder) / 'manifest.json.sig'
        manifest.write_bytes(read(newest['manifest'], 200000))
        signature.write_bytes(read(newest['signature'], 20000))
        try:
            signed = releases.verify_signature(manifest, signature, signers)
        except (ValueError, OSError, subprocess.SubprocessError):
            raise Refusal(f'The release {tag} is not signed by the release key this copy trusts. Nothing was changed.') from None
    if signed.get('version') != version or signed.get('channel') not in (('stable', 'prerelease') if prerelease else ('stable',)):
        raise Refusal(f'The signed manifest of {tag} is for another version or channel. Nothing was changed.')
    commit = signed['commit']
    if commit == installed['commit']:
        return {'commit': commit, 'version': version, 'tag': tag, 'ahead': 0, 'notes': []}
    older = releases.version_key(version) <= releases.version_key(installed['version'])
    if older and not (mine and allow_older):
        return {'commit': installed['commit'], 'version': installed['version'], 'tag': tag, 'ahead': 0, 'notes': [], 'newer': True, 'withdrawn': mine}
    # The tag must be exactly the commit that was signed. A tag that was moved afterwards is refused.
    git(checkout, 'fetch', '--no-tags', 'origin', f'+refs/tags/{tag}:refs/pea-update/{tag}')
    if git(checkout, 'rev-parse', f'refs/pea-update/{tag}^{{commit}}') != commit:
        raise Refusal(f'The tag {tag} does not point at the commit its signature names. Nothing was changed.')
    # Forward only, except when leaving a withdrawn release for the newest good one before it.
    first, second = (commit, installed['commit']) if older else (installed['commit'], commit)
    try:
        git(checkout, 'merge-base', '--is-ancestor', first, second)
    except Refusal:
        raise Refusal(f'The installed copy and {tag} are not on the same line of history. It is not moved; sort that out by hand.') from None
    if identity_at(checkout, commit) != version:
        raise Refusal(f'The commit signed for {tag} carries another version. Nothing was changed.')
    ahead = int(git(checkout, 'rev-list', '--count', f'{first}..{second}'))
    return {'commit': commit, 'version': version, 'tag': tag, 'ahead': ahead, 'notes': [], 'back': older, 'withdrawn': mine}


def withdrawals(checkout, state):
    """The publisher's signed list of releases that must not be installed: {version: reason}.

    It is read from the official main branch and must be signed by the key this checkout trusts.
    Its serial number only goes up; a list older than one this machine has already seen, or one
    that has gone missing, is refused, so a withdrawal cannot be quietly taken back.
    """
    checkout, state = Path(checkout), Path(state).expanduser()
    git(checkout, 'fetch', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main')
    mark = state / 'withdrawn-serial'
    try:
        seen = int(mark.read_text())
    except (OSError, ValueError):
        seen = 0
    parts = []
    for name in ('withdrawn.json', 'withdrawn.json.sig'):
        done = subprocess.run(['git', '-C', str(checkout), 'show', f'refs/remotes/origin/main:browser/server/{name}'], capture_output=True, timeout=30)
        parts.append(done.stdout if done.returncode == 0 else None)
    if parts[0] is None:
        if seen:
            raise Refusal('The list of withdrawn releases this machine has seen before is no longer published. Nothing was changed; ask the publisher.')
        return {}
    with tempfile.TemporaryDirectory() as folder:
        notice, signature = Path(folder) / 'withdrawn.json', Path(folder) / 'withdrawn.json.sig'
        notice.write_bytes(parts[0])
        signature.write_bytes(parts[1] or b'')
        try:
            value = releases.verify_notice(notice, signature, checkout / 'browser' / 'server' / 'allowed_signers')
        except (ValueError, OSError, subprocess.SubprocessError):
            raise Refusal('The list of withdrawn releases is not signed by the release key this copy trusts. Nothing was changed.') from None
    if value['serial'] < seen:
        raise Refusal('The list of withdrawn releases is older than one this machine has already seen. Nothing was changed.')
    if value['serial'] > seen:
        state.mkdir(mode=0o700, parents=True, exist_ok=True)
        mark.write_text(str(value['serial']))
    return {version: row['reason'] for version, row in value['withdrawn'].items()}


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
    parser.add_argument('--channel', choices=('development', 'release'), default='development',
                        help='development follows the official main branch, unsigned; release installs only a signed published release.')
    parser.add_argument('--prerelease', action='store_true', help='With --channel release: also consider signed pre-releases.')
    parser.add_argument('--allow-older', action='store_true',
                        help='With --channel release: if the installed release was withdrawn and nothing newer is published, go back to the newest release that was not.')
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
        elif args.channel == 'release':
            target = find_release(installed, prerelease=args.prerelease, withdrawn=withdrawals(installed['checkout'], args.state_dir), allow_older=args.allow_older)
            if target.get('withdrawn'):
                print(f"WITHDRAWN: the publisher has withdrawn the installed release {installed['version']}: {target['withdrawn']}")
            if target.get('newer'):
                if target.get('withdrawn'):
                    print(f"Nothing newer is published. The newest release that was not withdrawn is {target['tag']}; add --allow-older to go back to it. An older program may refuse data saved by a newer one, so make backups first.")
                    return 1
                print(f"The newest signed release is {target['tag']}, and this copy is already newer than it. Nothing to do.")
                return 0
            if not target['ahead']:
                print(f"Already on the newest signed release, {target['tag']}. Nothing to do.")
                return 0
            print(f"Available: {target['version']} ({target['commit'][:12]}), release {target['tag']}, {target['ahead']} change{'s' if target['ahead'] != 1 else ''} {'back' if target.get('back') else 'ahead'}.")
            print('Its manifest is signed by the release key this copy trusts, and the tag is exactly the signed commit.')
            if args.command == 'check':
                print('Nothing was changed. Run apply with --launchd-label and --confirm to install it.')
                return 0
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
