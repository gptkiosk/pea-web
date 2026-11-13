"""Synthetic local quickstart checks; no accounts, model requests, or persistent installs."""
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import unittest
import urllib.request

SCRIPT = Path(__file__).with_name('local.py')


class LocalQuickstartChecks(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.folder = Path(self.tmp.name) / 'private-config'

    def tearDown(self):
        self.tmp.cleanup()

    def call(self, *args):
        return subprocess.run([sys.executable, str(SCRIPT), *args, '--config-dir', str(self.folder)],
                              capture_output=True, text=True, timeout=10)

    def test_explicit_setup_is_private_and_never_overwrites_or_prints_token(self):
        self.assertNotEqual(self.call('check').returncode, 0)
        result = self.call('setup')
        self.assertEqual(result.returncode, 0, result.stderr)
        token = (self.folder / 'connection-token').read_text().strip()
        self.assertNotIn(token, result.stdout + result.stderr)
        self.assertEqual((self.folder / 'connection-token').stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.call('check').returncode, 0)
        self.assertNotEqual(self.call('setup').returncode, 0)
        self.assertEqual((self.folder / 'connection-token').read_text().strip(), token)

    def test_refuses_insecure_directory_and_token_or_symlink(self):
        self.folder.mkdir(mode=0o777); self.folder.chmod(0o777)
        self.assertNotEqual(self.call('setup').returncode, 0)
        self.folder.chmod(0o700)
        target = self.folder / 'target'; target.write_text('synthetic-existing-data')
        (self.folder / 'connection-token').symlink_to(target)
        self.assertNotEqual(self.call('setup').returncode, 0)
        self.assertNotEqual(self.call('check').returncode, 0)
        self.assertEqual(target.read_text(), 'synthetic-existing-data')
        (self.folder / 'connection-token').unlink()
        self.assertEqual(self.call('setup').returncode, 0)
        (self.folder / 'connection-token').chmod(0o644)
        self.assertNotEqual(self.call('check').returncode, 0)

    def test_starts_foreground_gateway_with_no_model_or_provider(self):
        self.assertEqual(self.call('setup').returncode, 0)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
        process = subprocess.Popen([sys.executable, str(SCRIPT), 'start', '--config-dir', str(self.folder), '--port', str(port)],
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            self.assertIn('foreground process', process.stdout.readline())
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/browser/', timeout=5) as response:
                self.assertEqual(response.status, 200)
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/browser/memory-ui.mjs', timeout=5) as response:
                self.assertEqual(response.status, 200)
        finally:
            process.terminate(); process.communicate(timeout=5)

    def test_bad_upstream_and_port_fail_before_serving(self):
        self.assertEqual(self.call('setup').returncode, 0)
        self.assertNotEqual(self.call('start', '--port', '0').returncode, 0)
        self.assertNotEqual(self.call('start', '--upstream', 'https://example.invalid').returncode, 0)


if __name__ == '__main__':
    unittest.main()
