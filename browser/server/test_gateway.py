import importlib.util
import json
import re
from html.parser import HTMLParser
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

    def test_actual_web_entrypoint_and_transitive_modules_are_served(self):
        class References(HTMLParser):
            def __init__(self):
                super().__init__(); self.paths = []
            def handle_starttag(self, tag, attrs):
                attrs = dict(attrs)
                if tag == 'script' and attrs.get('type') == 'module': self.paths.append(attrs.get('src', ''))
                if tag == 'link' and attrs.get('rel') in ('stylesheet', 'icon'): self.paths.append(attrs.get('href', ''))
                if tag == 'img': self.paths.append(attrs.get('src', ''))
        status, html, _ = self.call('/browser/', token='')
        self.assertEqual(status, 200)
        parser = References(); parser.feed(html.decode('utf-8'))
        pending, seen = parser.paths, set()
        while pending:
            asset = pending.pop()
            self.assertRegex(asset, r'^(?:assets/)?[A-Za-z0-9_.-]+$')
            if asset in seen: continue
            seen.add(asset)
            status, body, headers = self.call('/browser/' + asset, token='')
            self.assertEqual(status, 200, f'Browser dependency not served: {asset}')
            if asset.endswith('.mjs'):
                self.assertTrue(headers.get_content_type() in ('text/javascript', 'application/javascript'))
                pending.extend(re.findall(r"\bfrom\s+['\"]\./([^'\"]+)['\"]", body.decode('utf-8')))
        self.assertIn('app.mjs', seen)
        self.assertIn('actions.mjs', seen)
        self.assertIn('memory-ui.mjs', seen)
        self.assertIn('profile-transfer.mjs', seen)
        self.assertEqual(self.call('/browser/server/gateway.py', token='')[0], 404)
        self.assertEqual(self.call('/browser/docs/MEMORY.md', token='')[0], 404)

    def test_speech_rules_name_two_fixed_providers_and_bounded_requests(self):
        speech = g.SPEECH
        self.assertEqual(set(speech['providers']), {'elevenlabs', 'fish'})
        self.assertEqual({p['host'] for p in speech['providers'].values()}, {'api.elevenlabs.io', 'api.fish.audio'})
        for rules in speech['providers'].values():
            self.assertEqual(set(rules) - {'library'}, {'host', 'speak', 'list', 'keyHeader', 'keyPrefix', 'model'})
            self.assertTrue(rules.get('library', '/').startswith('/'))
            self.assertTrue(rules['speak'].startswith('/') and rules['list'].startswith('/'))
        self.assertTrue(speech['path'].startswith('/v1/') and speech['voicesPath'].startswith('/v1/'), 'so both need the token')
        good = {'provider': 'fish', 'key': 'k' * 32, 'voice': 'a' * 32, 'text': 'Hello.'}
        self.assertEqual(g.validate_speech(dict(good)), good)
        self.assertEqual(g.validate_speech({'provider': 'fish', 'key': 'k' * 32}, listing=True), {'provider': 'fish', 'key': 'k' * 32})
        for bad in ({**good, 'voice': '../x'}, {**good, 'key': 'k' * 32 + '\r\nX: 1'}, {**good, 'provider': 'api.fish.audio'}, {**good, 'text': ' '},
                    {**good, 'text': 'x' * (speech['textCharacters'] + 1)}, {**good, 'text': 'lone \ud800'}, {**good, 'extra': 1}, good | {'text': 7}):
            with self.assertRaises(ValueError, msg=repr(bad)[:60]):
                g.validate_speech(bad)
        with self.assertRaises(ValueError):
            g.validate_speech(good, listing=True)
        shared = {'provider': 'fish', 'key': 'k' * 32, 'library': True}
        self.assertEqual(g.validate_speech(dict(shared), listing=True), shared)
        for bad in ({**shared, 'library': False}, {**shared, 'library': 1}, {**shared, 'library': 'true'}, {**shared, 'provider': 'elevenlabs'}, {**shared, 'page': 2}):
            with self.assertRaises(ValueError, msg=repr(bad)[:60]):
                g.validate_speech(bad, listing=True)
        with self.assertRaises(ValueError, msg='a library is only ever listed'):
            g.validate_speech({**good, 'library': True})
        listed = g.speech_voices('fish', json.dumps({'items': [{'_id': 'a' * 32, 'title': ' Bo\n ', 'type': 'tts'}, {'_id': 'b' * 32, 'title': 'Song', 'type': 'svc'}, {'_id': 'c' * 32, 'title': 'Unfinished', 'type': 'tts', 'state': 'training'}, 7]}).encode())
        self.assertEqual(listed, {'voices': [{'id': 'a' * 32, 'name': 'Bo'}]})
        for junk in (b'not json', b'{"voices":[]}', b'{"items":{}}', b'[]'):
            with self.assertRaises(g.SpeechRefusal):
                g.speech_voices('fish', junk)
        self.assertEqual(set(g.SPEECH_REASONS.values()) | {'failed'}, set(g.SPEECH_REFUSALS))

    def test_every_rule_comes_from_the_shared_contract(self):
        contract = json.loads(Path(g.__file__).with_name('contract.json').read_text())
        self.assertEqual(contract['version'], 1)
        self.assertEqual(set(contract), {'version', 'about', 'assets', 'headers', 'streamHeaders', 'limits', 'chatFields', 'roles', 'reminders', 'reader', 'speech', 'search', 'updates', 'projects'})
        self.assertEqual(g.UPDATES, contract['updates'])
        self.assertEqual(g.READER, contract['reader'])
        self.assertEqual(g.SPEECH, contract['speech'])
        self.assertEqual(g.REMINDERS, contract['reminders'])
        self.assertEqual(set(contract['reminders']), {'about', 'path', 'fields', 'items', 'idPattern', 'titleCharacters', 'dueMax'})
        self.assertTrue(contract['reminders']['path'].startswith('/v1/'), 'so it needs the token like the model routes')
        self.assertEqual(g.ASSETS, frozenset(contract['assets']))
        self.assertEqual(len(contract['assets']), len(set(contract['assets'])))
        for name in contract['assets']:
            self.assertRegex(name, r'^[A-Za-z0-9][A-Za-z0-9._/-]*$')
            self.assertNotIn('..', name)
            self.assertFalse(name.startswith('server/'), 'server source is never served')
        limits = contract['limits']
        self.assertEqual((g.MAX_REQUEST, g.CLIENT_SLOTS, g.REQUEST_DEADLINE, g.BUILD_INFO_TTL),
                         (limits['requestBytes'], limits['connections'], limits['requestDeadlineSeconds'], limits['buildInfoSeconds']))
        self.assertTrue(all(type(v) in (int, float, str) for v in limits.values()))
        # The values the review settled on. Changing one is a deliberate contract change.
        self.assertEqual({k: limits[k] for k in ('requestBytes', 'messages', 'messageCharacters', 'maxTokens', 'concurrentModelRequests', 'connections', 'acceptBacklog', 'requestDeadlineSeconds', 'streamBytes')},
                         {'requestBytes': 128000, 'messages': 64, 'messageCharacters': 64000, 'maxTokens': 4096, 'concurrentModelRequests': 2, 'connections': 64, 'acceptBacklog': 128, 'requestDeadlineSeconds': 20, 'streamBytes': 2000000})
        with urllib.request.urlopen(self.base + '/') as response:
            for name, value in contract['headers'].items():
                self.assertEqual(response.headers[name], value, name)
        self.assertIn("frame-ancestors 'none'", contract['headers']['Content-Security-Policy'])
        with self.assertRaises(urllib.error.HTTPError) as blocked:
            urllib.request.urlopen(self.base + '/server/contract.json')
        self.assertEqual(blocked.exception.code, 404, 'the contract file itself is not served')
    def test_static_security_headers(self):
        status, data, headers = self.call('/browser/')
        self.assertEqual(status, 200)
        self.assertIn(b'PEA', data)
        self.assertIn("frame-ancestors 'none'", headers['Content-Security-Policy'])
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertEqual(headers['X-Frame-Options'], 'DENY')
        self.assertEqual(headers['Cross-Origin-Resource-Policy'], 'same-origin')
        self.assertEqual(headers['Cross-Origin-Opener-Policy'], 'same-origin-allow-popups')
    def test_idle_browser_connections_do_not_block_page_loads(self):
        # Browsers keep spare connections open that send nothing. Twenty of them must not stop the next request.
        import socket
        idle = [socket.create_connection(('127.0.0.1', self.server.server_port), timeout=5) for _ in range(20)]
        try:
            for _ in range(12):
                with urllib.request.urlopen(self.base + '/app.mjs', timeout=5) as response:
                    self.assertEqual(response.status, 200)
        finally:
            for connection in idle:
                connection.close()

    def test_connections_beyond_the_limit_are_closed_unanswered(self):
        import socket
        held = []
        try:
            for _ in range(g.CLIENT_SLOTS + 4):
                held.append(socket.create_connection(('127.0.0.1', self.server.server_port), timeout=5))
            extra = held[-1]
            extra.settimeout(5)
            extra.sendall(b'GET / HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n')
            try:
                answered = extra.recv(1)
            except OSError:
                answered = b''
            self.assertEqual(answered, b'')
        finally:
            for connection in held:
                connection.close()

    def test_trickling_client_is_cut_off_at_the_request_deadline(self):
        import socket, time
        previous, g.REQUEST_DEADLINE = g.REQUEST_DEADLINE, 1
        try:
            with socket.create_connection(('127.0.0.1', self.server.server_port), timeout=6) as client:
                started = time.monotonic()
                client.sendall(b'GET /browser/ HTTP/1.1\r\nHost: ')
                while client.recv(4096):
                    pass  # an error page may arrive before the close
                self.assertLess(time.monotonic() - started, 4)
            # A complete request is unaffected.
            self.assertEqual(self.call('/browser/')[0], 200)
        finally:
            g.REQUEST_DEADLINE = previous
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
    def test_project_engine_address_and_request_rules(self):
        with tempfile.TemporaryDirectory() as tmp:
            token = Path(tmp) / 'engine'
            local = g.projects_settings('http://127.0.0.1:8800', token)
            self.assertEqual((local['address'], local['tls']), (('127.0.0.1', 8800), False))
            self.assertEqual(g.projects_settings('http://localhost:8800/', token)['address'], ('127.0.0.1', 8800))
            away = g.projects_settings('https://Engine.Synthetic-Net.example:9443', token)
            self.assertEqual((away['address'], away['tls']), (('engine.synthetic-net.example', 9443), True))
            self.assertEqual(g.projects_settings('https://engine.synthetic-net.example', token)['address'][1], 443)
            stand_in = g.projects_settings('https://engine.synthetic-net.example', token, {'engine.synthetic-net.example': 4321})
            self.assertEqual((stand_in['address'], stand_in['tls']), (('127.0.0.1', 4321), False))
            for url in ['http://10.0.0.2:8800', 'http://engine.synthetic-net.example', 'http://127.0.0.1:8800/api', 'http://127.0.0.1:8800?x=1', 'http://a:b@127.0.0.1:8800',
                        'https://engine.synthetic-net.example/x', 'https://a@engine.synthetic-net.example', 'https://engine_x.example', 'https://single', 'https://engine.synthetic-net.example:0',
                        'https://engine.synthetic-net.example:99999', 'ftp://127.0.0.1', '']:
                with self.assertRaises(ValueError, msg=url):
                    g.projects_settings(url, token)
            self.assertIsNone(g.project_token(token), 'no file')
            token.write_text('e' * 64 + '\n')
            token.chmod(0o600)
            self.assertEqual(g.project_token(token), 'e' * 64)
            token.chmod(0o640)
            self.assertIsNone(g.project_token(token))
        draft = {'action': 'draft', 'type': 'other', 'title': 'Synthetic', 'brief': 'Synthetic brief'}
        for good in ({'action': 'types'}, {'action': 'list'}, {'action': 'get', 'project': 1}, {'action': 'status', 'project': 9}, draft, {**draft, 'constraints': ''}):
            self.assertEqual(g.validate_project(good), good)
        for bad in ({'action': 'start'}, {'action': 'get', 'project': True}, {'action': 'get', 'project': 1.0}, {**draft, 'working_dir': '/x'}, {**draft, 'title': ' \t'},
                    {'action': 'types', 'constraints': ''}, {'action': 'toString'}, {'action': ['types']}):
            with self.assertRaises(ValueError, msg=str(bad)):
                g.validate_project(bad)
        self.assertEqual(set(g.PROJECTS['actions']), {'types', 'list', 'get', 'status', 'draft'}, 'nothing here can start, approve or pay for work')

    def test_chat_bounds(self):
        base = {'model': 'tiny:test', 'stream': True, 'messages': [{'role': 'user', 'content': 'test'}]}
        self.assertEqual(g.validate_chat({**base, 'max_tokens': 3500})['max_tokens'], 3500)
        for body in [{**base, 'max_tokens': 4097}, {**base, 'max_tokens': True}, {**base, 'messages': [{'role': 'tool', 'content': 'test'}]}, {**base, 'temperature': float('nan')}, {**base, 'messages': [{'role': 'user', 'content': 'x'*64001}]}]:
            with self.assertRaises(ValueError):
                g.validate_chat(body)


if __name__ == '__main__':
    unittest.main()
