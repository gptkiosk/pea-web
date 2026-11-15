#!/usr/bin/env python3
"""Black-box conformance tests for a PEA gateway.

They talk plain HTTP to a gateway started as a separate process, with a synthetic model server
behind it, and check the behavior every PEA gateway must have. The rules come from
../contract.json. Nothing here imports the gateway, so the same tests run against the Python
gateway and against the Mac app's Swift gateway.

    python3 browser/server/conformance/run.py                       # the Python gateway
    PEA_GATEWAY_COMMAND='["/path/to/pea-gateway"]' python3 browser/server/conformance/run.py

The command receives: --port N --upstream http://127.0.0.1:M --token-file PATH --root BROWSER_DIR
No real model, account or network is used. The token is made for the run and deleted afterwards.
"""
import http.client
import json
import os
from pathlib import Path
import re
import secrets
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SERVER = Path(__file__).resolve().parents[1]
BROWSER = SERVER.parent
CONTRACT = json.loads((SERVER / 'contract.json').read_text())
LIMITS = CONTRACT['limits']
TOKEN = secrets.token_urlsafe(32)


class Upstream(BaseHTTPRequestHandler):
    """A synthetic OpenAI-compatible model server. Tests set `mode` to make it misbehave."""
    seen = []
    mode = 'normal'
    release = threading.Event()

    def log_message(self, *_args):
        pass

    def do_GET(self):
        type(self).seen.append(('GET', self.path, dict(self.headers), b''))
        if self.mode == 'down':
            self.send_response(500); self.end_headers(); return
        rows = [{'id': 'tiny:test'}, {'id': 'bad model'}, {'id': 'x' * 101}, {'id': 7}, 'text', {'id': 'tiny:test'}, {'id': 'second/model@v1'}]
        if self.mode == 'many':
            rows = [{'id': 'm%03d' % i} for i in range(150)]
        data = json.dumps({'data': rows}).encode()
        if self.mode == 'huge-list':
            data = b'{"data":[' + b' ' * (LIMITS['modelListBytes'] + 10) + b']}'
        self.send_response(200); self.send_header('Content-Length', str(len(data))); self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', '0')))
        type(self).seen.append(('POST', self.path, dict(self.headers), body))
        if self.mode == 'error':
            self.send_response(500); self.end_headers(); self.wfile.write(b'SYNTHETIC UPSTREAM DETAIL'); return
        if self.mode == 'not-stream':
            data = b'{"choices":[]}'
            self.send_response(200); self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data); return
        self.send_response(200); self.send_header('Content-Type', 'text/event-stream'); self.end_headers()
        if self.mode == 'hold':
            self.wfile.write(b'data: {"choices":[{"delta":{"content":"held"}}]}\n\n'); self.wfile.flush()
            self.release.wait(15)
        if self.mode == 'flood':
            chunk = b'data: ' + b'x' * 65000 + b'\n\n'
            try:
                for _ in range(60):
                    self.wfile.write(chunk)
            except OSError:
                return
            return
        self.wfile.write(b'data: {"choices":[{"delta":{"content":"Synthetic"}}]}\n\ndata: [DONE]\n\n')


def free_port():
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        return probe.getsockname()[1]


class Conformance(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.upstream = ThreadingHTTPServer(('127.0.0.1', 0), Upstream)
        cls.upstream.daemon_threads = True
        threading.Thread(target=cls.upstream.serve_forever, daemon=True).start()
        cls.folder = tempfile.TemporaryDirectory()
        token_file = Path(cls.folder.name) / 'connection-token'
        fd = os.open(token_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as stream:
            stream.write(TOKEN + '\n')
        cls.port = free_port()
        command = json.loads(os.environ.get('PEA_GATEWAY_COMMAND') or json.dumps([sys.executable, str(SERVER / 'gateway.py')]))
        cls.process = subprocess.Popen(
            [*command, '--port', str(cls.port), '--upstream', f'http://127.0.0.1:{cls.upstream.server_port}',
             '--token-file', str(token_file), *(['--root', str(BROWSER)] if os.environ.get('PEA_GATEWAY_COMMAND') else [])],
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        cls.host = f'127.0.0.1:{cls.port}'
        cls.origin = 'http://' + cls.host
        for _ in range(200):
            if cls.process.poll() is not None:
                raise RuntimeError('The gateway under test exited: ' + cls.process.stderr.read().decode()[-400:])
            try:
                socket.create_connection(('127.0.0.1', cls.port), timeout=0.2).close()
                break
            except OSError:
                time.sleep(0.05)
        else:
            raise RuntimeError('The gateway under test did not start listening.')

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate()
        try:
            cls.process.wait(5)
        except subprocess.TimeoutExpired:
            cls.process.kill()
        cls.process.stderr.close()
        cls.upstream.shutdown(); cls.upstream.server_close()
        cls.folder.cleanup()

    def setUp(self):
        Upstream.mode = 'normal'
        Upstream.seen.clear()
        Upstream.release.clear()

    # --- helpers -------------------------------------------------------------------------
    def call(self, method, path, body=None, headers=None, token=None, timeout=10):
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=timeout)
        try:
            all_headers = dict(headers or {})
            if token:
                all_headers['Authorization'] = 'Bearer ' + token
            if isinstance(body, (dict, list)):
                body = json.dumps(body).encode()
                all_headers.setdefault('Content-Type', 'application/json')
            connection.request(method, path, body=body, headers=all_headers)
            response = connection.getresponse()
            return response.status, {k.lower(): v for k, v in response.getheaders()}, response.read()
        finally:
            connection.close()

    def raw(self, text, timeout=5):
        """Sends bytes exactly as given and returns the status code, or None if nothing came back."""
        with socket.create_connection(('127.0.0.1', self.port), timeout=timeout) as connection:
            connection.sendall(text if isinstance(text, bytes) else text.encode())
            try:
                first = connection.recv(64)
            except OSError:
                return None
        match = re.match(rb'HTTP/1\.[01] (\d{3})', first)
        return int(match.group(1)) if match else None

    def list_models(self):
        status, _, body = self.call('GET', '/v1/models', token=TOKEN)
        self.assertEqual(status, 200)
        return [row['id'] for row in json.loads(body)['data']]

    def chat(self, **changes):
        body = {'model': 'tiny:test', 'stream': True, 'messages': [{'role': 'user', 'content': 'Synthetic question'}]}
        body.update(changes)
        return {k: v for k, v in body.items() if v is not ...}

    def assert_contract_headers(self, headers, where):
        for name, value in CONTRACT['headers'].items():
            self.assertEqual(headers.get(name.lower()), value, f'{name} on {where}')

    # --- static files --------------------------------------------------------------------
    def test_index_and_every_listed_file_are_served_exactly(self):
        for path in ('/', '/browser/', '/browser'):
            status, headers, body = self.call('GET', path)
            self.assertEqual(status, 200, path)
            self.assertEqual(body, (BROWSER / 'index.html').read_bytes())
            self.assertTrue(headers['content-type'].startswith('text/html'))
            self.assertEqual(headers['content-length'], str(len(body)))
        for name in CONTRACT['assets']:
            file = BROWSER / name
            for prefix in ('/', '/browser/'):
                status, headers, body = self.call('GET', prefix + name)
                if not file.is_file():
                    self.assertEqual(status, 404, name)
                    continue
                self.assertEqual(status, 200, name)
                self.assertEqual(body, file.read_bytes(), name)
                if name.endswith('.mjs'):
                    self.assertEqual(headers['content-type'].split(';')[0], 'text/javascript', name)
                self.assert_contract_headers(headers, name)

    def test_nothing_outside_the_list_is_served(self):
        for path in ('/server/gateway.py', '/server/contract.json', '/browser/server/gateway.py', '/docs/PARITY.md',
                     '/tests/policy.test.mjs', '/WEB-FILES.json', '/README.md', '/../README.md', '/browser/../../README.md',
                     '/%2e%2e/README.md', '/assets/../server/gateway.py', '/.git/config', '/app.mjs/', '/app.mjs?x=1',
                     '//app.mjs', '//v1/models', '///', '/APP.MJS', '/index.html%00', '/assets', '/assets/'):
            status, headers, body = self.call('GET', path)
            self.assertEqual(status, 404, path)
            self.assert_contract_headers(headers, path)
            self.assertNotIn(b'import ', body)

    def test_the_app_can_load_every_module_it_imports(self):
        seen, queue = set(), ['app.mjs']
        while queue:
            name = queue.pop()
            if name in seen:
                continue
            seen.add(name)
            status, _, body = self.call('GET', '/' + name)
            self.assertEqual(status, 200, name + ' is imported by the app but not served')
            queue += re.findall(r"from '\./([A-Za-z0-9-]+\.mjs)'", body.decode())
        self.assertGreater(len(seen), 15)

    # --- who may ask ---------------------------------------------------------------------
    def test_foreign_host_or_origin_is_refused(self):
        for headers in ({'Host': 'evil.example'}, {'Host': f'evil.example:{self.port}'}, {'Host': '127.0.0.1'},
                        {'Origin': 'http://evil.example'}, {'Origin': f'https://127.0.0.1:{self.port}'},
                        {'Origin': 'null'}, {'Origin': self.origin + '.evil.example'}):
            for path, token in (('/', None), ('/api/build-info', None), ('/v1/models', TOKEN)):
                status, got, _ = self.call('GET', path, headers=headers, token=token)
                self.assertEqual(status, 403, f'{headers} {path}')
                self.assert_contract_headers(got, f'403 {path}')
        self.assertEqual(Upstream.seen, [], 'a refused request never reaches the model server')
        for headers in ({'Origin': self.origin}, {'Host': f'localhost:{self.port}'}, {'Origin': f'http://localhost:{self.port}'}):
            self.assertEqual(self.call('GET', '/', headers=headers)[0], 200, str(headers))

    def test_model_routes_need_the_token_in_the_authorization_header(self):
        for path in ('/v1/models', '/v1/anything'):
            for token in (None, 'wrong' * 8, TOKEN[:-1], TOKEN + 'x', TOKEN.upper() if TOKEN.upper() != TOKEN else TOKEN.lower()):
                status, headers, _ = self.call('GET', path, token=token)
                self.assertEqual(status, 401, f'{path} {token!r}')
                self.assert_contract_headers(headers, '401')
        self.assertEqual(self.call('GET', '/v1/models?token=' + TOKEN)[0], 401, 'a token in the address is not accepted')
        self.assertEqual(self.call('GET', '/v1/models', headers={'Authorization': TOKEN})[0], 401)
        self.assertEqual(self.call('GET', '/v1/models', headers={'Authorization': 'Basic ' + TOKEN})[0], 401)
        self.assertEqual(self.call('GET', '/v1/models', headers={'Cookie': 'token=' + TOKEN})[0], 401)
        self.assertEqual(self.call('POST', '/v1/chat/completions', body=self.chat())[0], 401)
        self.assertEqual(Upstream.seen, [])

    # --- model list ----------------------------------------------------------------------
    def test_model_list_is_filtered_bounded_and_sent_without_credentials(self):
        status, headers, body = self.call('GET', '/v1/models', token=TOKEN)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {'data': [
            {'id': 'tiny:test', 'object': 'model', 'owned_by': 'customer-local'},
            {'id': 'second/model@v1', 'object': 'model', 'owned_by': 'customer-local'}]})
        self.assert_contract_headers(headers, 'model list')
        method, path, sent, _ = Upstream.seen[-1]
        self.assertEqual((method, path), ('GET', '/v1/models'))
        self.assertNotIn('authorization', {k.lower() for k in sent}, 'the token is never forwarded')
        self.assertNotIn('cookie', {k.lower() for k in sent})
        Upstream.mode = 'many'
        self.assertEqual(len(self.list_models()), LIMITS['models'])

    def test_a_broken_model_server_is_reported_the_same_way_every_time(self):
        for mode in ('down', 'huge-list'):
            Upstream.mode = mode
            status, headers, body = self.call('GET', '/v1/models', token=TOKEN)
            self.assertEqual(status, 502, mode)
            self.assert_contract_headers(headers, '502')
            self.assertNotIn(b'SYNTHETIC', body)

    # --- chat ----------------------------------------------------------------------------
    def test_a_valid_chat_is_streamed_through_with_only_the_allowed_fields(self):
        self.list_models()
        status, headers, body = self.call('POST', '/v1/chat/completions', token=TOKEN,
                                          body=self.chat(max_tokens=LIMITS['maxTokens'], temperature=LIMITS['temperatureMax']))
        self.assertEqual(status, 200)
        for name, value in CONTRACT['streamHeaders'].items():
            self.assertEqual(headers.get(name.lower()), value, name)
        self.assertEqual(body, b'data: {"choices":[{"delta":{"content":"Synthetic"}}]}\n\ndata: [DONE]\n\n')
        method, path, sent, forwarded = Upstream.seen[-1]
        self.assertEqual((method, path), ('POST', '/v1/chat/completions'))
        self.assertNotIn('authorization', {k.lower() for k in sent})
        forwarded = json.loads(forwarded)
        self.assertEqual(set(forwarded), set(CONTRACT['chatFields']))
        self.assertEqual(forwarded['max_tokens'], LIMITS['maxTokens'])
        self.call('POST', '/v1/chat/completions', token=TOKEN, body=self.chat())
        defaults = json.loads(Upstream.seen[-1][3])
        text = 'Caf\u00e9 \U0001F331 "quoted" \\ back\nline\ttab \u0000 end'
        self.call('POST', '/v1/chat/completions', token=TOKEN, body=self.chat(messages=[{'role': 'system', 'content': ''}, {'role': 'user', 'content': text}], temperature=0.25))
        passed = json.loads(Upstream.seen[-1][3])
        self.assertEqual(passed['messages'][1]['content'], text, 'text reaches the model unchanged')
        self.assertEqual(passed['temperature'], 0.25)
        self.assertEqual((defaults['max_tokens'], defaults['temperature']), (LIMITS['defaultMaxTokens'], LIMITS['defaultTemperature']))

    def test_every_malformed_or_oversized_chat_is_refused_before_the_model_server(self):
        self.list_models()
        Upstream.seen.clear()
        message = {'role': 'user', 'content': 'x'}
        deep = '{"model":"tiny:test","stream":true,"messages":' + '[' * 5000 + ']' * 5000 + '}'
        bad = [
            self.chat(tools=[]), self.chat(provider={'order': ['x']}), self.chat(stream=False), self.chat(stream=...),
            self.chat(model='bad model'), self.chat(model='x' * 101), self.chat(model=7), self.chat(model=...),
            self.chat(messages=[]), self.chat(messages=[message] * (LIMITS['messages'] + 1)), self.chat(messages='text'),
            self.chat(messages=[{'role': 'tool', 'content': 'x'}]), self.chat(messages=[{'role': 'user', 'content': ['x']}]),
            self.chat(messages=[{'role': 'user', 'content': 'x', 'name': 'y'}]), self.chat(messages=[{'role': 'user'}]),
            self.chat(messages=[{'role': 'user', 'content': 'x' * (LIMITS['messageCharacters'] + 1)}]),
            self.chat(max_tokens=0), self.chat(max_tokens=LIMITS['maxTokens'] + 1), self.chat(max_tokens=1.5),
            self.chat(max_tokens='10'), self.chat(max_tokens=True),
            self.chat(temperature=-0.1), self.chat(temperature=LIMITS['temperatureMax'] + 0.1), self.chat(temperature='hot'),
            [self.chat()], 'text', None,
        ]
        for body in bad:
            status, headers, _ = self.call('POST', '/v1/chat/completions', token=TOKEN, body=json.dumps(body).encode(),
                                           headers={'Content-Type': 'application/json'})
            self.assertEqual(status, 400, json.dumps(body)[:90])
            self.assert_contract_headers(headers, '400')
        for body, headers in (
            (b'{not json', {'Content-Type': 'application/json'}),
            (deep.encode(), {'Content-Type': 'application/json'}),
            (json.dumps(self.chat()).encode(), {'Content-Type': 'text/plain'}),
            (json.dumps(self.chat()).encode(), {}),
            (b'', {'Content-Type': 'application/json'}),
            (b'{"model":"tiny:test","model":"tiny:test","stream":true,"messages":[{"role":"user","content":"x"}]}', {'Content-Type': 'application/json'}),
            (b'{"model":"tiny:test","stream":true,"messages":[{"role":"user","content":"x","role":"user"}]}', {'Content-Type': 'application/json'}),
            (b'{"model":"tiny:test","stream":true,"temperature":NaN,"messages":[{"role":"user","content":"x"}]}', {'Content-Type': 'application/json'}),
            (b'{"model":"tiny:test","stream":true,"temperature":Infinity,"messages":[{"role":"user","content":"x"}]}', {'Content-Type': 'application/json'}),
            (b'{"model":"tiny:test","stream":true,"max_tokens":10.0,"messages":[{"role":"user","content":"x"}]}', {'Content-Type': 'application/json'}),
            (b'{"model":"tiny:test","stream":true,"max_tokens":1e1,"messages":[{"role":"user","content":"x"}]}', {'Content-Type': 'application/json'}),
            (b'{"model":"tiny:test","stream":true,"messages":[{"role":"user","content":"\\ud83d"}]}', {'Content-Type': 'application/json'}),
            (b'{"model":"tiny:test","stream":true,"messages":[{"role":"user","content":"\xff"}]}', {'Content-Type': 'application/json'}),
            (b'\xef\xbb\xbf' + json.dumps(self.chat()).encode(), {'Content-Type': 'application/json'}),
            (json.dumps(self.chat()).encode('utf-16'), {'Content-Type': 'application/json'}),
            (json.dumps(self.chat()).encode() + b' x', {'Content-Type': 'application/json'}),
        ):
            self.assertEqual(self.call('POST', '/v1/chat/completions', token=TOKEN, body=body, headers=headers)[0], 400, str(headers))
        self.assertEqual(self.raw(
            f'POST /v1/chat/completions HTTP/1.1\r\nHost: {self.host}\r\nAuthorization: Bearer {TOKEN}\r\n'
            f'Content-Type: application/json\r\nContent-Length: {LIMITS["requestBytes"] + 1}\r\n\r\n'), 400, 'an oversized body is refused from its length alone')
        self.assertEqual(self.raw(
            f'POST /v1/chat/completions HTTP/1.1\r\nHost: {self.host}\r\nAuthorization: Bearer {TOKEN}\r\n'
            'Content-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n'), 400, 'chunked bodies are refused')
        for repeated in (f'Host: {self.host}\r\nHost: evil.example\r\n', f'Host: evil.example\r\nHost: {self.host}\r\n',
                         f'Host: {self.host}\r\nAuthorization: Bearer wrong\r\n', f'Host: {self.host}\r\nContent-Length: 2\r\n'):
            data = json.dumps(self.chat())
            self.assertEqual(self.raw(
                f'POST /v1/chat/completions HTTP/1.1\r\n{repeated}Authorization: Bearer {TOKEN}\r\n'
                f'Content-Type: application/json\r\nContent-Length: {len(data)}\r\n\r\n{data}'), 400, 'a repeated deciding header is refused: ' + repeated.split()[-2])
        self.assertEqual(Upstream.seen, [], 'none of these reached the model server')

    def test_only_a_model_this_gateway_listed_can_be_used(self):
        self.list_models()
        status, _, _ = self.call('POST', '/v1/chat/completions', token=TOKEN, body=self.chat(model='not:listed'))
        self.assertEqual(status, 409)
        self.assertEqual([entry for entry in Upstream.seen if entry[0] == 'POST'], [])

    def test_model_server_failures_during_chat_leak_nothing(self):
        self.list_models()
        for mode in ('error', 'not-stream'):
            Upstream.mode = mode
            status, headers, body = self.call('POST', '/v1/chat/completions', token=TOKEN, body=self.chat())
            self.assertEqual(status, 502, mode)
            self.assertNotIn(b'SYNTHETIC', body)
            self.assert_contract_headers(headers, '502')

    def test_only_two_model_requests_run_at_once(self):
        self.list_models()
        Upstream.mode = 'hold'
        held = []
        try:
            for _ in range(LIMITS['concurrentModelRequests']):
                connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=20)
                connection.request('POST', '/v1/chat/completions', body=json.dumps(self.chat()),
                                   headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN})
                response = connection.getresponse()
                self.assertEqual(response.status, 200)
                response.read1(16)
                held.append((connection, response))
            self.assertEqual(self.call('POST', '/v1/chat/completions', token=TOKEN, body=self.chat())[0], 429)
            self.assertEqual(self.call('GET', '/v1/models', token=TOKEN)[0], 429)
            self.assertEqual(self.call('GET', '/')[0], 200, 'pages still load while the model is busy')
        finally:
            Upstream.release.set()
            for connection, response in held:
                response.read(); connection.close()
        Upstream.mode = 'normal'
        self.assertEqual(self.call('POST', '/v1/chat/completions', token=TOKEN, body=self.chat())[0], 200, 'the limit frees up afterwards')

    def test_a_reply_is_cut_off_at_the_size_limit(self):
        self.list_models()
        Upstream.mode = 'flood'
        status, _, body = self.call('POST', '/v1/chat/completions', token=TOKEN, body=self.chat(), timeout=30)
        self.assertEqual(status, 200)
        self.assertLessEqual(len(body), LIMITS['streamBytes'] + 70000)
        self.assertGreater(len(body), LIMITS['streamBytes'] // 2)

    # --- nothing else is exposed ---------------------------------------------------------
    def test_no_other_route_method_or_proxying_exists(self):
        self.assertEqual(self.call('GET', '/v1/other', token=TOKEN)[0], 404)
        self.assertEqual(self.call('POST', '/v1/models', token=TOKEN, body={})[0], 404)
        self.assertEqual(self.call('POST', '/v1/embeddings', token=TOKEN, body={})[0], 404)
        self.assertEqual(self.call('POST', '/', token=TOKEN, body={})[0], 404)
        for method in ('PUT', 'DELETE', 'PATCH', 'OPTIONS', 'TRACE', 'CONNECT'):
            status = self.raw(f'{method} /v1/models HTTP/1.1\r\nHost: {self.host}\r\nAuthorization: Bearer {TOKEN}\r\nContent-Length: 0\r\n\r\n')
            self.assertTrue(status is None or status >= 400, f'{method} gave {status}')
        for line in (f'GET http://example.invalid/ HTTP/1.1\r\nHost: {self.host}\r\n\r\n',
                     f'GET http://example.invalid/v1/models HTTP/1.1\r\nHost: {self.host}\r\nAuthorization: Bearer {TOKEN}\r\n\r\n',
                     f'CONNECT example.invalid:443 HTTP/1.1\r\nHost: {self.host}\r\n\r\n'):
            status = self.raw(line)
            self.assertTrue(status is None or status >= 400, f'{line.split()[0]} {line.split()[1]} gave {status}')
        self.assertEqual(Upstream.seen, [], 'nothing was forwarded')

    def test_build_identity_is_public_and_holds_no_private_state(self):
        status, headers, body = self.call('GET', '/api/build-info')
        self.assertEqual(status, 200)
        self.assert_contract_headers(headers, 'build-info')
        info = json.loads(body)
        for key in ('schema', 'version', 'channel', 'product', 'environment', 'commit', 'modified'):
            self.assertIn(key, info)
        text = body.decode()
        self.assertNotIn(TOKEN, text)
        self.assertNotRegex(text, r'/Users/|/home/|\\.ts\\.net|token|127\\.0\\.0\\.1')

    # --- connections ---------------------------------------------------------------------
    def test_idle_connections_do_not_block_page_loads(self):
        idle = [socket.create_connection(('127.0.0.1', self.port), timeout=5) for _ in range(20)]
        try:
            for _ in range(12):
                self.assertEqual(self.call('GET', '/app.mjs')[0], 200)
        finally:
            for connection in idle:
                connection.close()

    def test_a_burst_of_twenty_five_file_requests_all_succeed(self):
        results = []
        def fetch():
            try:
                results.append(self.call('GET', '/app.mjs')[0])
            except OSError as error:
                results.append(repr(error))
        threads = [threading.Thread(target=fetch) for _ in range(25)]
        for thread in threads: thread.start()
        for thread in threads: thread.join()
        self.assertEqual(results, [200] * 25)

    def test_six_tabs_loading_at_once_lose_no_request(self):
        # Each tab opens six connections at a time and every file is a new connection, as in a browser.
        # Thirty-six connections is well inside the limit, so a refusal here means finished
        # connections are still being counted.
        names = ['/'] + ['/' + name for name in CONTRACT['assets'] if (BROWSER / name).is_file()]
        problems, lock = [], threading.Lock()
        def tab():
            for _ in range(8):
                todo = list(names)
                def worker():
                    while True:
                        with lock:
                            if not todo:
                                return
                            name = todo.pop()
                        try:
                            status = self.call('GET', name)[0]
                        except OSError as error:
                            status = type(error).__name__
                        if status != 200:
                            with lock:
                                problems.append((name, status))
                workers = [threading.Thread(target=worker) for _ in range(6)]
                for thread in workers: thread.start()
                for thread in workers: thread.join()
        tabs = [threading.Thread(target=tab) for _ in range(6)]
        for thread in tabs: thread.start()
        for thread in tabs: thread.join()
        self.assertEqual(problems, [], f'{len(problems)} of {6 * 8 * len(names)} requests failed')

    def test_connections_beyond_the_limit_are_closed_unanswered(self):
        held = []
        try:
            for _ in range(LIMITS['connections'] + 4):
                held.append(socket.create_connection(('127.0.0.1', self.port), timeout=5))
            extra = held[-1]
            extra.settimeout(5)
            try:
                extra.sendall(f'GET / HTTP/1.0\r\nHost: {self.host}\r\n\r\n'.encode())
                answered = extra.recv(1)
            except OSError:
                answered = b''
            self.assertEqual(answered, b'')
        finally:
            for connection in held:
                connection.close()
        time.sleep(0.3)
        self.assertEqual(self.call('GET', '/')[0], 200, 'the gateway recovers once they close')

    def test_a_trickling_client_is_cut_off_at_the_request_deadline(self):
        started = time.monotonic()
        with socket.create_connection(('127.0.0.1', self.port), timeout=LIMITS['requestDeadlineSeconds'] + 15) as connection:
            connection.sendall(b'GET / HTTP/1.1\r\nHost: ' + self.host.encode() + b'\r\n')
            closed = None
            try:
                while time.monotonic() - started < LIMITS['requestDeadlineSeconds'] + 10:
                    time.sleep(2)
                    connection.sendall(b'X-Slow: 1\r\n')
            except OSError:
                closed = time.monotonic() - started
            if closed is None:
                connection.settimeout(1)
                try:
                    closed = time.monotonic() - started if connection.recv(1) == b'' else None
                except OSError:
                    closed = time.monotonic() - started
        self.assertIsNotNone(closed, 'the connection was still open well past the deadline')
        self.assertLess(closed, LIMITS['requestDeadlineSeconds'] + 10)
        self.assertGreater(closed, LIMITS['requestDeadlineSeconds'] - 3)


if __name__ == '__main__':
    unittest.main(verbosity=1)
