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
        self.assertEqual(json.loads((self.state / 'last-update.json').read_text())['outcome'], 'rolled back')
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


if __name__ == '__main__':
    unittest.main()
