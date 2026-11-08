"""Offline packaging/switching tests. All signing keys and repositories are temporary."""
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_identity as identity
import releases as r


def command(*args, cwd=None):
    return subprocess.run(args, cwd=cwd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.decode().strip()


@unittest.skipUnless(shutil.which('git') and shutil.which('ssh-keygen'), 'Git and OpenSSH required')
class ReleaseChecks(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name).resolve()
        self.source = self.base / 'source' / 'browser'
        self.source.mkdir(parents=True)
        self.config = dict(schema=1, version='0.1.0-dev.1', channel='development', product='PEA', organization='', repository=None)
        self.write_source()
        command('git', 'init', '-q', cwd=self.source.parent)
        command('git', 'config', 'user.name', 'Synthetic release test', cwd=self.source)
        command('git', 'config', 'user.email', 'release@example.invalid', cwd=self.source)
        self.commit()
        self.key = self.base / 'synthetic_signer'
        command('ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', str(self.key))
        self.signers = self.base / 'allowed_signers'
        self.signers.write_text('pea-release namespaces="pea-release" ' + self.key.with_suffix('.pub').read_text())
        self.root = self.base / 'install'
        with r.locked(self.root) as root:
            r.initialize(root, self.signers)
        self.archive, self.manifest, self.sig = self.package('one')
    def tearDown(self):
        self.tmp.cleanup()
    def write_source(self):
        (self.source / 'server').mkdir(exist_ok=True)
        (self.source / 'server/gateway.py').write_text('# synthetic test program\n')
        (self.source / 'release.json').write_text(json.dumps(self.config))
        (self.source / 'CHANGELOG.md').write_text('## [' + self.config['version'] + '] - 2026-11-07\n\nSynthetic test release.\n')
        (self.source / 'WEB-FILES.json').write_text(json.dumps(['release.json', 'CHANGELOG.md', 'WEB-FILES.json', 'server/gateway.py']))
    def commit(self):
        command('git', 'add', 'browser', cwd=self.source.parent)
        command('git', 'commit', '-qm', 'Synthetic fixture', cwd=self.source)
    def sign(self, manifest):
        sig = Path(str(manifest) + '.sig')
        sig.unlink(missing_ok=True)
        command('ssh-keygen', '-Y', 'sign', '-f', str(self.key), '-n', 'pea-release', str(manifest))
        return sig
    def package(self, name):
        manifest = r.build(self.source, self.base / name, development=True)
        return manifest.with_name('pea-web-' + self.config['version'] + '.tar.gz'), manifest, self.sign(manifest)
    def stage(self, archive=None, manifest=None, sig=None):
        return r.stage(self.root, archive or self.archive, manifest or self.manifest, sig or self.sig)
    def altered_archive(self, mode):
        manifest = json.loads(self.manifest.read_text())
        entries = []
        with tarfile.open(self.archive, 'r:gz') as tar:
            for member in tar:
                entries.append((member, tar.extractfile(member).read()))
        archive = self.base / ('altered-' + mode) / self.archive.name
        archive.parent.mkdir()
        with tarfile.open(archive, 'w:gz') as tar:
            for i, (member, data) in enumerate(entries):
                if mode == 'missing' and i == 0:
                    continue
                if mode == 'link' and i == 0:
                    member.type = tarfile.SYMTYPE; member.linkname = '/tmp/outside'; member.size = 0
                    tar.addfile(member)
                else:
                    tar.addfile(member, io.BytesIO(data))
            if mode in ('duplicate', 'traversal'):
                entry, data = entries[0]
                if mode == 'traversal':
                    entry = tarfile.TarInfo('../outside'); entry.size = len(data)
                tar.addfile(entry, io.BytesIO(data))
        data = archive.read_bytes()
        manifest['archive'].update(size=len(data), sha256=r.digest(data))
        path = archive.parent / self.manifest.name
        path.write_text(json.dumps(manifest))
        return archive, path, self.sign(path)
    def test_reproducible_build_and_clean_source_requirement(self):
        archive, manifest, _ = self.package('two')
        self.assertEqual(archive.read_bytes(), self.archive.read_bytes())
        self.assertEqual(manifest.read_bytes(), self.manifest.read_bytes())
        (self.source / 'server/gateway.py').write_text('# edited\n')
        with self.assertRaises(ValueError): r.build(self.source, self.base / 'dirty', True)
        self.assertTrue(identity.build_identity(self.source)['modified'])
    def test_stable_build_needs_upstream_and_matching_tag(self):
        with self.assertRaises(ValueError): r.build(self.source, self.base / 'bad-stable')
        self.config.update(version='0.1.0', channel='stable', repository='example/pea-web')
        self.write_source(); self.commit()
        with self.assertRaises(subprocess.CalledProcessError): r.build(self.source, self.base / 'untagged')
        command('git', 'tag', 'v0.1.0', cwd=self.source)
        manifest = r.build(self.source, self.base / 'stable')
        self.assertEqual(json.loads(manifest.read_text())['version'], '0.1.0')
    def test_signature_hash_and_independent_trust_required(self):
        self.sig.write_text('invalid signature')
        with self.assertRaises(ValueError): self.stage()
        self.sign(self.manifest)
        self.archive.write_bytes(self.archive.read_bytes() + b'tamper')
        with self.assertRaises(ValueError): self.stage()
        self.assertFalse((self.root / 'current').exists())
    def test_signed_links_traversal_duplicate_and_missing_entries_refused(self):
        for mode in ('link', 'traversal', 'duplicate', 'missing'):
            with self.subTest(mode=mode):
                args = self.altered_archive(mode)
                with self.assertRaises(ValueError): self.stage(*args)
        self.assertFalse(list(self.root.glob('.stage-*')))
        self.assertFalse((self.base / 'outside').exists())
    def test_activate_previous_rollback_preserves_separate_user_data(self):
        data = self.base / 'customer-data'; data.mkdir(); (data / 'archive').write_bytes(b'unchanged user data')
        first = self.stage(); r.activate(self.root, first)
        self.config['version'] = '0.1.0-dev.2'; self.write_source(); self.commit()
        second = r.stage(self.root, *self.package('next'))
        r.activate(self.root, second)
        self.assertEqual(r.target(self.root, 'previous'), 'releases/' + first)
        script = Path(r.__file__).resolve()
        refusal = subprocess.run([sys.executable, str(script), 'rollback', '--root', str(self.root)], capture_output=True)
        self.assertNotEqual(refusal.returncode, 0)
        self.assertEqual(r.target(self.root, 'current'), 'releases/' + second)
        command(sys.executable, str(script), 'rollback', '--root', str(self.root), '--confirm')
        self.assertEqual(r.target(self.root, 'current'), 'releases/' + first)
        self.assertEqual((data / 'archive').read_bytes(), b'unchanged user data')
    def test_modified_program_refuses_reactivation_and_reports_modified(self):
        release = self.stage(); r.activate(self.root, release)
        browser = self.root / 'current/browser'
        self.assertFalse(identity.build_identity(browser)['modified'])
        (browser / 'server/gateway.py').write_text('# tampered\n')
        self.assertTrue(identity.build_identity(browser)['modified'])
        with self.assertRaises(ValueError): r.verify_staged(self.root, release)
    def test_recovery_before_and_after_atomic_current_switch(self):
        release = self.stage(); new = 'releases/' + release
        r.atomic_json(self.root / 'pending.json', dict(old=None, previous=None, new=new))
        r.set_pointer(self.root, 'previous', new)
        r.recover(self.root)
        self.assertIsNone(r.target(self.root, 'previous'))
        r.set_pointer(self.root, 'current', new)
        r.atomic_json(self.root / 'pending.json', dict(old=None, previous=None, new=new))
        r.recover(self.root)
        self.assertEqual(r.target(self.root, 'current'), new)
        self.assertFalse((self.root / 'pending.json').exists())
    def test_bad_manifests_and_source_symlinks_fail_closed(self):
        for field, value in [('files', []), ('archive', None), ('version', None), ('dataSchema', 99)]:
            doc = json.loads(self.manifest.read_text()); doc[field] = value; self.manifest.write_text(json.dumps(doc)); self.sign(self.manifest)
            with self.assertRaises(ValueError): self.stage()
            # Restore a valid signed source package for the next case.
            self.manifest.write_text(json.dumps(json.loads(r.build(self.source, self.base / ('restore-' + field), True).read_text()))); self.sign(self.manifest)
        for name in ['browser/../secret', '/browser/a', 'browser//a', 'browser/.env', 'browser/a\\b', None]:
            self.assertFalse(r.safe_path(name))
        (self.source / 'server/gateway.py').unlink(); (self.source / 'server/gateway.py').symlink_to(self.signers)
        with self.assertRaises(ValueError): r.source_files(self.source)
    def test_build_identity_unknown_without_git_and_metadata_allowlisted(self):
        source = self.base / 'standalone'; source.mkdir()
        config = {**self.config, 'doNotExpose': 'private arbitrary field'}
        (source / 'release.json').write_text(json.dumps(config))
        value = identity.build_identity(source)
        self.assertIsNone(value['commit']); self.assertNotIn('doNotExpose', value)
        for malformed in [[], {'schema': 1, 'version': None}]:
            (source / 'release.json').write_text(json.dumps(malformed))
            with self.assertRaises(ValueError): identity.build_identity(source)
    def test_private_install_lock_and_trust_not_silently_replaced(self):
        with r.locked(self.root):
            with self.assertRaises(BlockingIOError):
                with r.locked(self.root): pass
        with self.assertRaises(ValueError): r.initialize(self.root, self.signers)
        link = self.base / 'install-link'; link.symlink_to(self.root)
        with self.assertRaises(ValueError):
            with r.locked(link): pass


if __name__ == '__main__': unittest.main()
