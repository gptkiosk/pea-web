"""Checks for the update command against throwaway repositories and a stand-in PEA on this machine.
No network, no real service, nothing installed."""
import contextlib
import io
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import releases
import update
from build_identity import build_identity

ENV = {**os.environ, 'GIT_AUTHOR_NAME': 'Synthetic', 'GIT_AUTHOR_EMAIL': 'synthetic@example.invalid',
       'GIT_COMMITTER_NAME': 'Synthetic', 'GIT_COMMITTER_EMAIL': 'synthetic@example.invalid', 'GIT_CONFIG_GLOBAL': os.devnull,
       'GIT_CONFIG_SYSTEM': os.devnull}


def run(folder, *args):
    return subprocess.run(['git', '-C', str(folder), *args], check=True, capture_output=True, text=True, env=ENV).stdout.strip()


def release(folder, version, channel='development'):
    browser = Path(folder) / 'browser'
    browser.mkdir(exist_ok=True)
    (browser / 'release.json').write_text(json.dumps({'schema': 1, 'version': version, 'channel': channel, 'product': 'PEA',
                                                      'organization': 'Synthetic', 'repository': 'synthetic-owner/pea-web'}))
    (browser / 'index.html').write_text(f'<p>{version}</p>')
    run(folder, 'add', '-A')
    run(folder, 'commit', '-m', f'Synthetic release {version}')
    return run(folder, 'rev-parse', 'HEAD')


class Stand(BaseHTTPRequestHandler):
    """A stand-in PEA: reports the identity of the checkout as it is on disk, unless told to be broken."""
    checkout = None
    broken_on = None

    def log_message(self, *_args):
        pass

    def do_GET(self):
        info = build_identity(type(self).checkout / 'browser')
        if info['commit'] == type(self).broken_on:
            self.send_response(500); self.end_headers(); return
        data = json.dumps(info).encode()
        self.send_response(200); self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)


class UpdateChecks(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name).resolve()
        self.official, self.installed, self.state = root / 'official', root / 'installed', root / 'state'
        self.official.mkdir()
        run(self.official, 'init', '-q', '-b', 'main')
        self.first = release(self.official, '0.1.0-dev.1')
        subprocess.run(['git', 'clone', '-q', str(self.official), str(self.installed)], check=True, capture_output=True, env=ENV)
        self.second = release(self.official, '0.1.0-dev.2')
        self.origin = str(self.official)
        Stand.checkout, Stand.broken_on = self.installed, None
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Stand)
        self.server.daemon_threads = True
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.url = f'http://127.0.0.1:{self.server.server_port}'
        self.restarts = 0

    def tearDown(self):
        self.server.shutdown(); self.server.server_close()
        self.tmp.cleanup()

    def restart(self):
        self.restarts += 1

    def head(self):
        return run(self.installed, 'rev-parse', 'HEAD')

    def move(self, target, **more):
        installed = update.inspect(self.installed, official=self.origin)
        return update.move(installed, target['commit'], target['version'], url=self.url, restart=more.pop('restart', self.restart),
                           state=self.state, wait=2, kind=more.pop('kind', 'apply'))

    def test_only_a_clean_checkout_of_the_official_repository_is_touched(self):
        installed = update.inspect(self.installed, official=self.origin)
        self.assertEqual((installed['commit'], installed['version'], installed['repository']), (self.first, '0.1.0-dev.1', 'synthetic-owner/pea-web'))
        with self.assertRaisesRegex(update.Refusal, 'does not come from the official repository'):
            update.inspect(self.installed)  # its origin is a local folder, not the official address
        with self.assertRaisesRegex(update.Refusal, 'does not come from the official repository'):
            update.inspect(self.installed, official='https://github.com/someone-else/pea-web.git')
        with self.assertRaisesRegex(update.Refusal, 'not a PEA Web checkout'):
            update.inspect(self.tmp.name, official=self.origin)
        with self.assertRaisesRegex(update.Refusal, 'not the top of its own git checkout'):
            nested = self.installed / 'nested'
            (nested / 'browser').mkdir(parents=True)
            (nested / 'browser' / 'release.json').write_text('{}')
            update.inspect(nested, official=self.origin)
        (self.installed / 'browser' / 'index.html').write_text('<p>edited by hand</p>')
        with self.assertRaisesRegex(update.Refusal, 'changes to tracked files'):
            update.inspect(self.installed, official=self.origin)
        self.assertEqual(update.official_urls('a/b'), {'https://github.com/a/b.git', 'https://github.com/a/b', 'git@github.com:a/b.git', 'ssh://git@github.com/a/b.git'})

    def test_the_newest_official_commit_is_found_and_a_diverged_copy_is_left_alone(self):
        installed = update.inspect(self.installed, official=self.origin)
        target = update.find_target(installed)
        self.assertEqual(target, {'commit': self.second, 'version': '0.1.0-dev.2', 'ahead': 1, 'notes': ['Synthetic release 0.1.0-dev.2']})
        self.assertEqual(self.head(), self.first, 'looking changes nothing')
        run(self.installed, 'merge', '-q', '--ff-only', self.second)
        self.assertEqual(update.find_target(update.inspect(self.installed, official=self.origin))['ahead'], 0)
        (self.installed / 'local.txt').write_text('a local commit')
        run(self.installed, 'add', '-A'); run(self.installed, 'commit', '-q', '-m', 'Local work')
        release(self.official, '0.1.0-dev.3')
        with self.assertRaisesRegex(update.Refusal, 'commits the official main branch does not'):
            update.find_target(update.inspect(self.installed, official=self.origin))

    def test_an_update_moves_restarts_and_is_kept_only_when_pea_reports_the_new_version(self):
        target = update.find_target(update.inspect(self.installed, official=self.origin))
        self.move(target)
        self.assertEqual(self.head(), self.second)
        self.assertEqual(self.restarts, 1)
        self.assertEqual((self.installed / 'browser' / 'index.html').read_text(), '<p>0.1.0-dev.2</p>')
        entry = json.loads((self.state / 'last-update.json').read_text())
        self.assertEqual((entry['previous'], entry['target'], entry['outcome']), (self.first, self.second, 'succeeded'))
        self.assertEqual(stat.S_IMODE((self.state / 'last-update.json').stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(self.state.stat().st_mode), 0o700)
        # Each stage it went through is on record, in order, in this program's own words.
        self.assertEqual(entry['stage'], 'done')
        said = [line['text'] for line in entry['log']]
        self.assertEqual(len(said), 5)
        self.assertRegex(said[0], r'^Updating from 0\.1\.0-dev\.1 \(.{12}\) to 0\.1\.0-dev\.2 \(.{12}\)\. Settings and saved data are not touched')
        self.assertEqual(said[1:], ['Program files are now 0.1.0-dev.2.', 'Restarting PEA.', 'Waiting for PEA to report 0.1.0-dev.2.',
                                    'PEA is running 0.1.0-dev.2. Reload the page to use it.'])
        shown = update.last_record(self.state)
        self.assertEqual((shown['stage'], len(shown['log']), set(shown['log'][0])), ('done', 5, {'at', 'text'}))
        # Going back uses the record of that update.
        back = update.last(self.state)
        self.move({'commit': back['previous'], 'version': '0.1.0-dev.1'}, kind='rollback')
        self.assertEqual(self.head(), self.first)

    def test_a_copy_that_does_not_come_back_healthy_is_put_back(self):
        target = update.find_target(update.inspect(self.installed, official=self.origin))
        Stand.broken_on = self.second
        with self.assertRaisesRegex(update.Refusal, r'did not come back reporting the new commit and version\. The previous version \(0\.1\.0-dev\.1, .{12}\) was put back\.$'):
            self.move(target)
        self.assertEqual(self.head(), self.first)
        self.assertEqual(self.restarts, 2, 'restarted for the new copy and again for the old')
        entry = json.loads((self.state / 'last-update.json').read_text())
        self.assertEqual((entry['outcome'], entry['stage']), ('rolled back', 'put back'))
        self.assertEqual([line['text'] for line in entry['log']][-2:], [
            'PEA did not come back reporting the new commit and version. Putting 0.1.0-dev.1 back.', entry['message']])
        self.assertEqual(update.inspect(self.installed, official=self.origin)['version'], '0.1.0-dev.1', 'and it is clean again')

    def test_a_service_that_will_not_restart_is_also_put_back_and_said_so(self):
        target = update.find_target(update.inspect(self.installed, official=self.origin))

        def failing():
            raise update.Refusal('The service did not restart.')
        with self.assertRaisesRegex(update.Refusal, 'The service did not restart.*put back, but PEA did not confirm'):
            self.move(target, restart=failing)
        self.assertEqual(self.head(), self.first)
        self.assertIn('not confirmed', json.loads((self.state / 'last-update.json').read_text())['outcome'])

    def test_a_local_change_made_meanwhile_is_never_overwritten(self):
        target = update.find_target(update.inspect(self.installed, official=self.origin))
        installed = update.inspect(self.installed, official=self.origin)
        (self.installed / 'browser' / 'index.html').write_text('<p>edited after the check</p>')
        with self.assertRaisesRegex(update.Refusal, 'git refused'):
            update.move(installed, target['commit'], target['version'], url=self.url, restart=self.restart, state=self.state, wait=1, kind='apply')
        self.assertEqual(self.head(), self.first)
        self.assertEqual((self.installed / 'browser' / 'index.html').read_text(), '<p>edited after the check</p>')
        self.assertEqual(self.restarts, 0)

    def test_health_is_exactly_the_expected_commit_version_and_an_unmodified_copy(self):
        self.assertTrue(update.healthy(self.url, self.first, '0.1.0-dev.1', wait=1))
        self.assertFalse(update.healthy(self.url, self.second, '0.1.0-dev.1', wait=0.6))
        self.assertFalse(update.healthy(self.url, self.first, '0.1.0-dev.2', wait=0.6))
        (self.installed / 'browser' / 'index.html').write_text('<p>modified</p>')
        self.assertFalse(update.healthy(self.url, self.first, '0.1.0-dev.1', wait=0.6), 'a modified copy is not healthy')
        self.assertFalse(update.healthy('http://127.0.0.1:9', self.first, '0.1.0-dev.1', wait=0.6))

    def test_the_command_refuses_before_touching_anything(self):
        def call(*args):
            out, err = io.StringIO(), io.StringIO()
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                code = update.main(list(args))
            return code, out.getvalue() + err.getvalue()
        for url in ('https://example.invalid', 'http://example.invalid:80', 'http://127.0.0.1', 'http://127.0.0.1:18770/x', 'http://10.0.0.5:18770'):
            code, said = call('check', '--checkout', str(self.installed), '--url', url)
            self.assertEqual(code, 1, url)
            self.assertIn('asks only this machine', said)
        code, said = call('apply', '--checkout', str(self.installed), '--url', self.url, '--confirm')
        self.assertEqual(code, 1)
        self.assertIn('does not come from the official repository', said, 'a local clone is not the official repository')
        self.assertEqual(self.head(), self.first)
        with self.assertRaisesRegex(update.Refusal, 'not a launchd label'):
            update.launchd_restart('bad label; rm -rf')
        with self.assertRaisesRegex(update.Refusal, 'nothing to go back to'):
            update.last(self.state)
        self.state.mkdir()
        (self.state / 'last-update.json').write_text(json.dumps({'previous': '../x', 'target': self.first}))
        with self.assertRaisesRegex(update.Refusal, 'not readable'):
            update.last(self.state)


@unittest.skipUnless(shutil.which('ssh-keygen'), 'OpenSSH required')
class SignedChannelChecks(unittest.TestCase):
    """The release channel, with a key made for the test and a stand-in list of published releases."""
    REPO = 'synthetic-owner/pea-web'

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name).resolve()
        self.official, self.installed, self.keys = root / 'official', root / 'installed', root / 'keys'
        self.official.mkdir(); self.keys.mkdir()
        subprocess.run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', str(self.keys / 'signer')], check=True, capture_output=True)
        subprocess.run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', str(self.keys / 'stranger')], check=True, capture_output=True)
        run(self.official, 'init', '-q', '-b', 'main')
        (self.official / 'browser' / 'server').mkdir(parents=True)
        (self.official / 'browser' / 'server' / 'allowed_signers').write_text(
            'pea-release namespaces="pea-release" ' + (self.keys / 'signer.pub').read_text())
        self.first = release(self.official, '0.1.0-rc.1', channel='prerelease')
        subprocess.run(['git', 'clone', '-q', str(self.official), str(self.installed)], check=True, capture_output=True, env=ENV)
        self.files, self.listed = {}, []
        self.installed_now = update.inspect(self.installed, official=str(self.official))

    def tearDown(self):
        self.tmp.cleanup()

    def publish(self, version, commit, *, channel='stable', prerelease=False, signer='signer', tag_at=None, manifest_version=None, draft=False):
        tag = 'v' + version
        run(self.official, 'tag', tag, tag_at or commit)
        digest = 'a' * 64
        manifest = json.dumps({'schema': 1, 'product': 'pea-web', 'dataSchema': 1, 'version': manifest_version or version, 'commit': commit, 'channel': channel,
                               'archive': {'name': f'pea-web-{version}.tar.gz', 'size': 10, 'sha256': digest},
                               'files': {name: {'size': 1, 'sha256': digest} for name in
                                         ('browser/build-info.json', 'browser/server/gateway.py', 'browser/release.json', 'browser/WEB-FILES.json')}}).encode()
        path = self.keys / f'{version}.manifest.json'
        path.write_bytes(manifest)
        subprocess.run(['ssh-keygen', '-Y', 'sign', '-f', str(self.keys / signer), '-n', 'pea-release', str(path)], check=True, capture_output=True)
        base = f'https://github.com/{self.REPO}/releases/download/{tag}/pea-web-{version}.manifest.json'
        self.files[base], self.files[base + '.sig'] = manifest, Path(str(path) + '.sig').read_bytes()
        self.listed.append({'tag_name': tag, 'draft': draft, 'prerelease': prerelease,
                            'assets': [{'name': f'pea-web-{version}.manifest.json', 'browser_download_url': base},
                                       {'name': f'pea-web-{version}.manifest.json.sig', 'browser_download_url': base + '.sig'},
                                       {'name': f'pea-web-{version}.tar.gz', 'browser_download_url': base.replace('.manifest.json', '.tar.gz')}]})

    def read(self, url, limit):
        if url == f'https://api.github.com/repos/{self.REPO}/releases?per_page=30':
            return json.dumps(self.listed).encode()
        self.asked = getattr(self, 'asked', []) + [url]
        return self.files[url]

    def find(self, **more):
        return update.find_release(update.inspect(self.installed, official=str(self.official)), read=self.read, **more)

    def test_the_newest_signed_release_is_chosen_and_only_its_manifest_is_downloaded(self):
        second = release(self.official, '0.1.0', channel='stable')
        third = release(self.official, '0.2.0', channel='stable')
        self.publish('0.1.0', second)
        self.publish('0.2.0', third)
        target = self.find()
        self.assertEqual((target['commit'], target['version'], target['tag'], target['ahead']), (third, '0.2.0', 'v0.2.0', 2))
        self.assertTrue(all(url.endswith(('.manifest.json', '.manifest.json.sig')) for url in self.asked), 'the package itself is never downloaded')
        self.assertEqual(run(self.installed, 'rev-parse', 'HEAD'), self.first, 'looking changes nothing')

    def test_a_pre_release_is_considered_only_when_asked(self):
        second = release(self.official, '0.2.0-rc.1', channel='prerelease')
        self.publish('0.2.0-rc.1', second, channel='prerelease', prerelease=True)
        with self.assertRaisesRegex(update.Refusal, 'Pre-releases are considered only with --prerelease'):
            self.find()
        self.assertEqual(self.find(prerelease=True)['commit'], second)
        self.listed[0]['draft'] = True
        with self.assertRaisesRegex(update.Refusal, 'No published release'):
            self.find(prerelease=True)

    def test_a_release_not_signed_by_the_trusted_key_is_refused(self):
        second = release(self.official, '0.2.0', channel='stable')
        self.publish('0.2.0', second, signer='stranger')
        with self.assertRaisesRegex(update.Refusal, 'not signed by the release key this copy trusts'):
            self.find()
        # A good signature over other bytes is refused too.
        self.listed.clear(); self.files.clear()
        third = release(self.official, '0.3.0', channel='stable')
        self.publish('0.3.0', third)
        key = next(k for k in self.files if k.endswith('.manifest.json'))
        self.files[key] = self.files[key].replace(third.encode(), self.first.encode())
        with self.assertRaisesRegex(update.Refusal, 'not signed by the release key'):
            self.find()

    def test_a_moved_tag_or_a_mislabelled_manifest_is_refused(self):
        second = release(self.official, '0.2.0', channel='stable')
        third = release(self.official, '0.2.1', channel='stable')
        self.publish('0.2.1', second, tag_at=third)
        with self.assertRaisesRegex(update.Refusal, 'does not point at the commit its signature names'):
            self.find()
        self.listed.clear(); self.files.clear()
        self.publish('0.3.0', third, manifest_version='0.2.1')
        with self.assertRaisesRegex(update.Refusal, 'another version or channel'):
            self.find()
        self.listed.clear(); self.files.clear()
        fourth = release(self.official, '0.4.0', channel='stable')
        self.publish('0.5.0', fourth)
        with self.assertRaisesRegex(update.Refusal, 'carries another version'):
            self.find()

    def test_a_copy_already_on_or_past_the_newest_release_is_left_alone(self):
        self.publish('0.1.0-rc.1', self.first, channel='prerelease', prerelease=True)
        self.assertEqual(self.find(prerelease=True)['ahead'], 0)
        newer = release(self.official, '0.1.0-rc.1.dev.1')
        run(self.installed, 'pull', '-q', '--ff-only')
        self.assertEqual(run(self.installed, 'rev-parse', 'HEAD'), newer)
        target = self.find(prerelease=True)
        self.assertEqual((target.get('newer'), target['ahead']), (True, 0), 'a development build past the release is not moved back')

    def test_a_copy_with_no_signer_file_cannot_use_the_release_channel(self):
        (self.installed / 'browser' / 'server' / 'allowed_signers').unlink()
        run(self.installed, 'commit', '-q', '-am', 'Remove the signer')
        with self.assertRaisesRegex(update.Refusal, 'no release signer to check against'):
            self.find()

    def notice(self, version, reason='Synthetic fault.', signer='signer', sign=True):
        """The publisher lists a version as withdrawn on the official main branch."""
        path = self.official / 'browser' / 'server' / 'withdrawn.json'
        serial = releases.withdraw(path, version, reason, '2026-11-17')
        signature = Path(str(path) + '.sig')
        signature.unlink(missing_ok=True)
        if sign:
            subprocess.run(['ssh-keygen', '-Y', 'sign', '-f', str(self.keys / signer), '-n', 'pea-release', str(path)], check=True, capture_output=True)
        run(self.official, 'add', '-A'); run(self.official, 'commit', '-q', '-m', f'Withdraw {version}')
        return serial

    def test_a_withdrawn_release_is_never_offered_and_its_users_are_told(self):
        state = Path(self.tmp.name) / 'state'
        self.assertEqual(update.withdrawals(self.installed, state), {}, 'no list yet means nothing is withdrawn')
        second = release(self.official, '0.2.0', channel='stable')
        third = release(self.official, '0.3.0', channel='stable')
        self.publish('0.2.0', second)
        self.publish('0.3.0', third)
        self.assertEqual(self.notice('0.3.0', 'Breaks  saved\tboards.'), 1)
        listed = update.withdrawals(self.installed, state)
        self.assertEqual(listed, {'0.3.0': 'Breaks saved boards.'})
        self.assertEqual((state / 'withdrawn-serial').read_text(), '1')
        target = self.find(withdrawn=listed)
        self.assertEqual((target['tag'], target['commit']), ('v0.2.0', second), 'the newest release that was not withdrawn')
        # A copy already on the withdrawn release is told, and goes back only when asked to.
        run(self.installed, 'fetch', '-q', 'origin', 'main'); run(self.installed, 'reset', '-q', '--keep', third)
        stuck = self.find(withdrawn=listed)
        self.assertEqual((stuck.get('newer'), stuck['withdrawn'], stuck['commit']), (True, 'Breaks saved boards.', third))
        back = self.find(withdrawn=listed, allow_older=True)
        self.assertEqual((back['commit'], back['back'], back['ahead'], back['withdrawn']), (second, True, 1, 'Breaks saved boards.'))
        # A newer good release is simply offered, with the warning.
        fourth = release(self.official, '0.4.0', channel='stable')
        self.publish('0.4.0', fourth)
        forward = self.find(withdrawn=listed)
        self.assertEqual((forward['commit'], forward.get('back'), forward['withdrawn']), (fourth, False, 'Breaks saved boards.'))
        self.listed[:] = [row for row in self.listed if row['tag_name'] == 'v0.3.0']
        with self.assertRaisesRegex(update.Refusal, 'No published release is available.*withdrawn by the publisher: Breaks saved boards'):
            self.find(withdrawn=listed)

    def test_the_withdrawal_list_must_be_signed_and_can_never_go_backwards(self):
        state = Path(self.tmp.name) / 'state'
        self.notice('0.9.0', signer='stranger')
        with self.assertRaisesRegex(update.Refusal, 'not signed by the release key this copy trusts'):
            update.withdrawals(self.installed, state)
        self.notice('0.9.1', sign=False)
        with self.assertRaisesRegex(update.Refusal, 'not signed by the release key'):
            update.withdrawals(self.installed, state)
        self.assertFalse((state / 'withdrawn-serial').exists(), 'an unverified list is not remembered')
        self.notice('0.9.2')
        self.assertEqual(sorted(update.withdrawals(self.installed, state)), ['0.9.0', '0.9.1', '0.9.2'])
        self.assertEqual((state / 'withdrawn-serial').read_text(), '3')
        # The publisher's repository is wound back to an earlier, validly signed list.
        earlier = run(self.official, 'rev-parse', 'HEAD~1')
        good = run(self.official, 'rev-parse', 'HEAD')
        run(self.official, 'reset', '-q', '--hard', earlier)
        (self.official / 'browser' / 'server' / 'withdrawn.json').write_text(json.dumps(
            {'schema': 1, 'product': 'pea-web', 'kind': 'withdrawn-releases', 'serial': 1, 'withdrawn': {}}))
        subprocess.run(['ssh-keygen', '-Y', 'sign', '-f', str(self.keys / 'signer'), '-n', 'pea-release',
                        str(self.official / 'browser' / 'server' / 'withdrawn.json')], check=True, capture_output=True)
        run(self.official, 'add', '-A'); run(self.official, 'commit', '-q', '-m', 'An older list')
        with self.assertRaisesRegex(update.Refusal, 'older than one this machine has already seen'):
            update.withdrawals(self.installed, state)
        run(self.official, 'rm', '-q', 'browser/server/withdrawn.json', 'browser/server/withdrawn.json.sig'); run(self.official, 'commit', '-q', '-m', 'No list')
        with self.assertRaisesRegex(update.Refusal, 'is no longer published'):
            update.withdrawals(self.installed, state)
        self.assertTrue(good)

    def test_a_signed_release_manifest_cannot_pass_as_a_withdrawal_list_or_the_reverse(self):
        for bad in ({'schema': 1, 'product': 'pea-web', 'kind': 'withdrawn-releases', 'serial': 1, 'withdrawn': {'not a version': {'reason': 'x', 'date': '2026-11-17'}}},
                    {'schema': 1, 'product': 'pea-web', 'kind': 'withdrawn-releases', 'serial': -1, 'withdrawn': {}},
                    {'schema': 1, 'product': 'pea-web', 'kind': 'withdrawn-releases', 'serial': 1, 'withdrawn': {'1.0.0': {'reason': 'x'}}},
                    {'schema': 1, 'product': 'pea-web', 'kind': 'release', 'serial': 1, 'withdrawn': {}},
                    {'schema': 1, 'product': 'pea-web', 'version': '1.0.0', 'commit': 'a' * 40, 'channel': 'stable', 'files': {}}, []):
            with self.assertRaises(ValueError, msg=str(bad)[:60]):
                releases.read_notice(json.dumps(bad))
        path = Path(self.tmp.name) / 'list.json'
        self.assertEqual(releases.withdraw(path, '1.0.0', 'First.', '2026-11-17'), 1)
        self.assertEqual(releases.withdraw(path, '1.0.1', 'Second.', '2026-11-18'), 2)
        with self.assertRaisesRegex(ValueError, 'not already withdrawn'):
            releases.withdraw(path, '1.0.0', 'Again.', '2026-11-19')
        with self.assertRaises(ValueError):
            releases.withdraw(path, 'one', 'Bad version.', '2026-11-19')
        subprocess.run(['ssh-keygen', '-Y', 'sign', '-f', str(self.keys / 'signer'), '-n', 'pea-release', str(path)], check=True, capture_output=True)
        with self.assertRaises(ValueError):
            releases.verify_signature(path, Path(str(path) + '.sig'), self.official / 'browser' / 'server' / 'allowed_signers')

    def test_only_github_addresses_are_read_and_release_rows_must_be_exact(self):
        for url in ('http://github.com/a/b', 'https://example.invalid/x', 'https://github.com.evil.example/a', 'https://api.github.com/../x y'):
            with self.assertRaisesRegex(update.Refusal, 'not a GitHub address'):
                update.download(url, 10)
        rows = [{'tag_name': 'v1.0.0', 'draft': False, 'prerelease': False, 'assets': [
                    {'name': 'pea-web-1.0.0.manifest.json', 'browser_download_url': 'https://evil.example/pea-web-1.0.0.manifest.json'},
                    {'name': 'pea-web-1.0.0.manifest.json.sig', 'browser_download_url': f'https://github.com/{self.REPO}/releases/download/v1.0.0/pea-web-1.0.0.manifest.json.sig'}]},
                {'tag_name': 'nightly', 'draft': False, 'assets': []}, 'text', {'tag_name': 'v1.0.1', 'draft': False, 'assets': []}]
        self.assertEqual(update.published(self.REPO, lambda url, limit: json.dumps(rows).encode()), [], 'an asset served from elsewhere is not a release')
        with self.assertRaisesRegex(update.Refusal, 'readable list'):
            update.published(self.REPO, lambda url, limit: b'not json')


class GatewayUpdateChecks(unittest.TestCase):
    """The gateway's own update route, turned on for a throwaway checkout, with the helper replaced."""

    def setUp(self):
        import gateway
        self.gateway = gateway
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name).resolve()
        self.official, self.installed, self.state = root / 'official', root / 'installed', root / 'state'
        self.official.mkdir()
        run(self.official, 'init', '-q', '-b', 'main')
        (self.official / 'browser' / 'server').mkdir(parents=True)
        (self.official / 'browser' / 'server' / 'update.py').write_text('# stands in for the update command\n')
        self.first = release(self.official, '0.1.0-dev.1')
        subprocess.run(['git', 'clone', '-q', str(self.official), str(self.installed)], check=True, capture_output=True, env=ENV)
        self.second = release(self.official, '0.1.0-dev.2')
        self.started = []
        settings = gateway.update_settings(self.installed, 'synthetic.pea.service', 'development', False, self.state,
                                           official=str(self.official), start=lambda **given: self.started.append(given))
        self.server = gateway.Gateway(('127.0.0.1', 0), token='t' * 43, upstream='http://127.0.0.1:9', update=settings)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.plain = gateway.Gateway(('127.0.0.1', 0), token='t' * 43, upstream='http://127.0.0.1:9')
        threading.Thread(target=self.plain.serve_forever, daemon=True).start()

    def tearDown(self):
        for server in (self.server, self.plain):
            server.shutdown(); server.server_close()
        self.tmp.cleanup()

    def call(self, method, body=None, server=None, token='t' * 43):
        import http.client
        server = server or self.server
        connection = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=30)
        try:
            headers = {'Authorization': 'Bearer ' + token}
            if body is not None:
                headers['Content-Type'] = 'application/json'
            connection.request(method, '/v1/update', body=json.dumps(body) if body is not None else None, headers=headers)
            answer = connection.getresponse()
            return answer.status, json.loads(answer.read())
        finally:
            connection.close()

    def test_status_and_check_say_what_is_installed_and_what_is_on_offer(self):
        status, answer = self.call('GET')
        self.assertEqual((status, answer), (200, {'available': True, 'channel': 'development', 'prerelease': False,
                                                  'installed': {'version': '0.1.0-dev.1', 'commit': self.first}, 'operation': None}))
        status, found = self.call('POST', {'action': 'check'})
        self.assertEqual(status, 200)
        self.assertEqual(found, {'installed': {'version': '0.1.0-dev.1', 'commit': self.first}, 'channel': 'development', 'signed': False,
                                 'upToDate': False, 'withdrawn': None,
                                 'target': {'version': '0.1.0-dev.2', 'commit': self.second, 'tag': None, 'ahead': 1, 'notes': ['Synthetic release 0.1.0-dev.2']}})
        self.assertEqual(run(self.installed, 'rev-parse', 'HEAD'), self.first, 'looking changes nothing')
        self.assertEqual(self.started, [])
        self.assertEqual(self.call('GET', server=self.plain), (200, {'available': False}))
        self.assertEqual(self.call('POST', {'action': 'check'}, server=self.plain)[0], 409)
        self.assertEqual(self.call('GET', token='x' * 43)[0], 401)

    def test_apply_starts_the_helper_only_for_exactly_the_commit_on_offer(self):
        status, answer = self.call('POST', {'action': 'apply', 'commit': self.first})
        self.assertEqual(status, 409, 'the installed commit is not an update')
        self.assertIn('changed after it was reviewed', answer['error'])
        self.assertEqual(self.call('POST', {'action': 'apply', 'commit': 'f' * 40})[0], 409)
        self.assertEqual(self.started, [], 'nothing was started for a commit that is not on offer')
        status, answer = self.call('POST', {'action': 'apply', 'commit': self.second})
        self.assertEqual((status, answer), (202, {'started': True, 'commit': self.second}))
        self.assertEqual(len(self.started), 1)
        given = self.started[0]
        self.assertEqual((given['checkout'], given['label'], given['channel'], given['commit'], given['state']),
                         (self.installed, 'synthetic.pea.service', 'development', self.second, self.state))
        self.assertEqual(given['url'], f'http://127.0.0.1:{self.server.server_port}', 'the health check asks this gateway, on this machine')
        self.assertEqual(run(self.installed, 'rev-parse', 'HEAD'), self.first, 'the gateway itself moves nothing')

    def test_going_back_is_only_to_the_commit_the_last_update_replaced_while_that_update_is_installed(self):
        none = self.call('POST', {'action': 'rollback', 'commit': self.first})
        self.assertEqual(none[0], 409, 'nothing recorded, nothing to go back to')
        self.assertIn('No earlier update is recorded', none[1]['error'])
        # The installed copy is moved to the second commit and a finished update is on record.
        run(self.installed, 'fetch', '-q', 'origin')
        run(self.installed, 'reset', '-q', '--keep', self.second)
        done = {'kind': 'apply', 'previous': self.first, 'previousVersion': '0.1.0-dev.1', 'target': self.second, 'targetVersion': '0.1.0-dev.2', 'at': 5, 'outcome': 'succeeded'}
        update.record(self.state, done)
        for wrong in ('f' * 40, self.second):
            status, answer = self.call('POST', {'action': 'rollback', 'commit': wrong})
            self.assertEqual(status, 409, wrong)
            self.assertIn('no earlier version to go back to', answer['error'])
        for changed in ({'outcome': 'rolled back'}, {'kind': 'rollback'}, {'target': self.first}):
            update.record(self.state, {**done, **changed})
            self.assertEqual(self.call('POST', {'action': 'rollback', 'commit': self.first})[0], 409, str(changed))
        self.assertEqual(self.started, [])
        update.record(self.state, done)
        self.assertEqual(self.call('POST', {'action': 'rollback', 'commit': self.first}), (202, {'started': True, 'commit': self.first}))
        self.assertEqual(len(self.started), 1)
        self.assertEqual((self.started[0]['command'], self.started[0]['commit'], self.started[0]['label']), ('rollback', self.first, 'synthetic.pea.service'))
        self.assertEqual(run(self.installed, 'rev-parse', 'HEAD'), self.second, 'the gateway itself moves nothing')
        self.assertEqual(self.call('POST', {'action': 'rollback', 'commit': self.first}, server=self.plain)[0], 409)
        self.assertEqual(self.call('POST', {'action': 'rollback'})[0], 400)

    def test_a_copy_that_cannot_be_updated_says_why_and_starts_nothing(self):
        (self.installed / 'browser' / 'index.html').write_text('<p>edited by hand</p>')
        status, answer = self.call('POST', {'action': 'check'})
        self.assertEqual(status, 409)
        self.assertIn('changes to tracked files', answer['error'])
        self.assertEqual(self.call('POST', {'action': 'apply', 'commit': self.second})[0], 409)
        self.assertEqual(self.started, [])
        self.assertEqual(self.call('GET')[1]['installed'], None, 'and the status does not pretend to know what is installed')

    def test_the_helper_job_is_built_only_from_the_operators_settings(self):
        helper, job = update.helper_plist(python='/usr/bin/python3', checkout=self.installed, url='http://127.0.0.1:18770', label='synthetic.pea.service',
                                          state=self.state, channel='release', prerelease=True, commit=self.second, path='/usr/bin:/bin')
        self.assertEqual(helper, 'synthetic.pea.service.update')
        self.assertEqual(job['Label'], helper)
        self.assertEqual(job['ProgramArguments'][:3], ['/usr/bin/python3', str(self.installed / 'browser' / 'server' / 'update.py'), 'apply'])
        arguments = job['ProgramArguments']
        for flag, value in (('--checkout', str(self.installed)), ('--launchd-label', 'synthetic.pea.service'), ('--channel', 'release'),
                            ('--expect', self.second), ('--self-label', helper), ('--url', 'http://127.0.0.1:18770')):
            self.assertEqual(arguments[arguments.index(flag) + 1], value, flag)
        self.assertTrue({'--confirm', '--report', '--prerelease'} <= set(arguments))
        self.assertNotIn('--allow-older', arguments)
        back = update.helper_plist(python='/usr/bin/python3', checkout=self.installed, url='http://127.0.0.1:18770', label='synthetic.pea.service',
                                   state=self.state, channel='development', prerelease=False, commit=self.first, path='/usr/bin', command='rollback')[1]['ProgramArguments']
        self.assertEqual((back[2], back[back.index('--expect') + 1]), ('rollback', self.first))
        with self.assertRaises(update.Refusal):
            update.helper_plist(python='/usr/bin/python3', checkout=self.installed, url='http://127.0.0.1:18770', label='synthetic.pea.service',
                                state=self.state, channel='development', prerelease=False, commit=self.first, path='/usr/bin', command='check; rm')
        for bad in ({'label': 'bad label; rm'}, {'commit': 'main'}, {'url': 'https://example.invalid'}, {'channel': 'nightly'}):
            settings = dict(python='/usr/bin/python3', checkout=self.installed, url='http://127.0.0.1:18770', label='synthetic.pea.service',
                            state=self.state, channel='release', prerelease=False, commit=self.second, path='/usr/bin')
            with self.assertRaises(update.Refusal, msg=str(bad)):
                update.helper_plist(**{**settings, **bad})
        with self.assertRaises(ValueError):
            self.gateway.update_settings(self.tmp.name, 'synthetic.pea.service')
        with self.assertRaises(ValueError):
            self.gateway.update_settings(self.installed, 'bad label')

    def test_a_refused_or_finished_update_is_shown_with_bounded_known_fields_only(self):
        self.assertIsNone(update.last_record(self.state))
        update.record(self.state, {'kind': 'apply', 'outcome': 'refused', 'message': 'x' * 900, 'at': 5, 'token': 'SECRET', 'previous': '../x'})
        shown = update.last_record(self.state)
        self.assertEqual(set(shown), {'kind', 'outcome', 'at', 'previous', 'target', 'previousVersion', 'targetVersion', 'message', 'stage', 'log', 'note', 'noteAt'})
        self.assertEqual((shown['stage'], shown['log'], shown['note']), (None, [], None))
        # A stage this program does not write, and log lines of the wrong shape or too many, are not shown.
        update.record(self.state, {'kind': 'apply', 'outcome': 'started', 'at': 5, 'stage': 'rm -rf', 'log': [{'at': 1, 'text': 'y' * 900}, {'at': 'x', 'text': 'no'}, 'no', {'at': 2}] + [{'at': 3, 'text': 'line'}] * 40})
        odd = update.last_record(self.state)
        self.assertEqual((odd['stage'], len(odd['log']), max(len(line['text']) for line in odd['log'])), (None, 30, 4))
        update.record(self.state, {'kind': 'apply', 'outcome': 'refused', 'message': 'x' * 900, 'at': 5, 'token': 'SECRET', 'previous': '../x'})
        self.assertEqual((shown['outcome'], len(shown['message']), shown['previous']), ('refused', 400, None))
        self.assertEqual(self.call('GET')[1]['operation'], shown)
        (self.state / 'last-update.json').write_text('not json')
        self.assertIsNone(update.last_record(self.state))


if __name__ == '__main__':
    unittest.main()
