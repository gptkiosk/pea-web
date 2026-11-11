import importlib.util
import json
from pathlib import Path
import tempfile
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
import threading
import unittest
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

spec = importlib.util.spec_from_file_location('pea_gateway', Path(__file__).with_name('gateway.py'))
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)
TOKEN = 'synthetic_gateway_test_token_00000000000'


class Upstream(BaseHTTPRequestHandler):
    requests = []
    def log_message(self, *_args):
        pass
    def do_GET(self):
        self.requests.append((self.path, self.headers.get('Authorization')))
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"data":[{"id":"tiny:test"},{"id":"bad model"}]}')
    def do_POST(self):
        self.requests.append((self.path, self.headers.get('Authorization')))
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.end_headers()
        self.wfile.write(b'data: {"choices":[{"delta":{"content":"Synthetic"}}]}\n\ndata: [DONE]\n\n')


class GatewayChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.upstream = ThreadingHTTPServer(('127.0.0.1', 0), Upstream)
        cls.server = g.Gateway(('127.0.0.1', 0), token=TOKEN, upstream=f'http://127.0.0.1:{cls.upstream.server_port}')
        for server in (cls.upstream, cls.server):
            threading.Thread(target=server.serve_forever, daemon=True).start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'
    @classmethod
    def tearDownClass(cls):
        for server in (cls.server, cls.upstream):
            server.shutdown()
            server.server_close()
    def call(self, path, data=None, token=TOKEN, extra=None):
        headers = {'Authorization': 'Bearer ' + token, **(extra or {})}
        if data is not None:
            headers['Content-Type'] = 'application/json'
        request = urllib.request.Request(self.base + path, data=json.dumps(data).encode() if data is not None else None, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                return response.status, response.read(), response.headers
        except urllib.error.HTTPError as e:
            with e:
                return e.code, e.read(), e.headers
    def test_auth_origin_and_host_required(self):
        self.assertEqual(self.call('/v1/models', token='wrong')[0], 401)
        self.assertEqual(self.call('/v1/models', extra={'Origin': 'https://evil.example'})[0], 403)
        self.assertEqual(self.call('/v1/models', extra={'Host': 'evil.example'})[0], 403)
    def test_model_list_stream_and_native_contract(self):
        status, data, _ = self.call('/v1/models')
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(data)['data'][0]['id'], 'tiny:test')
        body = {'model': 'tiny:test', 'messages': [{'role': 'user', 'content': 'synthetic'}], 'stream': True, 'max_tokens': 384}
        status, data, headers = self.call('/v1/chat/completions', body)
        self.assertEqual(status, 200)
        self.assertIn(b'[DONE]', data)
        self.assertEqual(headers['X-Accel-Buffering'], 'no')
        self.assertTrue(all(auth is None for _, auth in Upstream.requests))
    def test_no_proxy_tools_unlisted_models_or_config_files(self):
        body = {'model': 'tiny:test', 'messages': [{'role': 'user', 'content': 'test'}], 'stream': True}
        self.assertEqual(self.call('/v1/chat/completions', {**body, 'tools': []})[0], 400)
        self.assertEqual(self.call('/v1/chat/completions', {**body, 'model': 'unlisted'})[0], 409)
        self.assertEqual(self.call('/v1/other', body)[0], 404)
        for path in ['/server/gateway.py', '/README.md', '/../HANDOFF.md', '/.env', '/tests/local-model.test.mjs']:
            self.assertEqual(self.call(path)[0], 404)
    def test_public_build_identity_exposes_no_private_state(self):
        status, data, _ = self.call('/api/build-info', token='')
        self.assertEqual(status, 200)
        value = json.loads(data)
        self.assertEqual(set(value), {'schema', 'version', 'channel', 'product', 'organization', 'repository', 'commit', 'modified', 'environment'})
        self.assertEqual(self.call('/api/build-info', extra={'Origin': 'https://evil.example'})[0], 403)
        for asset in ('release.json', 'releases.mjs', 'release-ui.mjs', 'CHANGELOG.md'):
            self.assertEqual(self.call('/browser/' + asset)[0], 200)

    def test_build_identity_is_computed_at_most_once_a_minute(self):
        calls, real = [], g.build_identity
        def counted(root):
            calls.append(root)
            return real(root)
        g.build_identity, self.server.identity = counted, None
        try:
            first = self.call('/api/build-info', token='')
            for _ in range(5):
                self.assertEqual(self.call('/api/build-info', token='')[1], first[1])
            self.assertEqual(len(calls), 1)
            self.server.identity_at -= g.BUILD_INFO_TTL + 1
            self.assertEqual(self.call('/api/build-info', token='')[0], 200)
            self.assertEqual(len(calls), 2)
        finally:
            g.build_identity = real
    def test_deeply_nested_json_is_a_plain_rejection(self):
        raw = b'[' * 100_000
        request = urllib.request.Request(self.base + '/v1/chat/completions', data=raw, headers={'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json'})
        with self.assertRaises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(request, timeout=5)
        with caught.exception as e:
            self.assertEqual(e.code, 400)
        self.assertEqual(self.call('/v1/models')[0], 200)

    def test_static_security_headers(self):
        status, data, headers = self.call('/browser/')
        self.assertEqual(status, 200)
        self.assertIn(b'PEA', data)
        self.assertIn("frame-ancestors 'none'", headers['Content-Security-Policy'])
        self.assertEqual(headers['Cache-Control'], 'no-store')
    def test_upstream_loopback_only_and_token_file_permissions(self):
        for url in ['https://api.example', 'http://10.0.0.2:11434', 'http://127.0.0.1:11434/v1?key=x', 'http://a:b@localhost']:
            with self.assertRaises(ValueError):
                g.upstream_url(url)
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'token'
            p.write_text(TOKEN)
            p.chmod(0o600)
            self.assertEqual(g.read_token(p), TOKEN)
            p.chmod(0o644)
            with self.assertRaises(ValueError):
                g.read_token(p)
    def test_chat_bounds(self):
        base = {'model': 'tiny:test', 'stream': True, 'messages': [{'role': 'user', 'content': 'test'}]}
        for body in [{**base, 'max_tokens': True}, {**base, 'messages': [{'role': 'tool', 'content': 'test'}]}, {**base, 'temperature': float('nan')}, {**base, 'messages': [{'role': 'user', 'content': 'x'*64001}]}]:
            with self.assertRaises(ValueError):
                g.validate_chat(body)


if __name__ == '__main__':
    unittest.main()
