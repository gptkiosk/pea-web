#!/usr/bin/env python3
"""Black-box conformance tests for a PEA gateway.

They talk plain HTTP to a gateway started as a separate process, with a synthetic model server
behind it, and check the behavior every PEA gateway must have. The rules come from
../contract.json. Nothing here imports the gateway, so the same tests run against the Python
gateway and against the Mac app's Swift gateway.

    python3 browser/server/conformance/run.py                       # the Python gateway
    PEA_GATEWAY_COMMAND='["/path/to/pea-gateway"]' python3 browser/server/conformance/run.py

The command receives: --port N --upstream http://127.0.0.1:M --token-file PATH --root BROWSER_DIR
(and, for the projects tests, --projects-url http://127.0.0.1:P --projects-token-file PATH)
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
READER = CONTRACT['reader']
SPEECH = CONTRACT['speech']
SEARCH = CONTRACT['search']
UPDATES = CONTRACT['updates']
PROJECTS = CONTRACT['projects']
ENGINE_TOKEN = secrets.token_urlsafe(48)
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


class Site(BaseHTTPRequestHandler):
    """A synthetic public web site for the page reader, reached only through the gateway's test stand-in."""
    protocol_version = 'HTTP/1.1'
    seen = []
    big = 0

    def log_message(self, *_args):
        pass

    def send(self, status, kind, body, extra=()):
        self.send_response(status)
        if kind:
            self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Connection', 'close')
        for name, value in extra:
            self.send_header(name, value)
        self.end_headers()
        try:
            self.wfile.write(body)
        except OSError:
            pass  # the reader hung up, as it does on a page that is too large

    def do_GET(self):
        type(self).seen.append((self.path, {k.lower(): v for k, v in self.headers.items()}))
        html = '<!doctype html><title>Synthetic</title><p>Zo\u00eb\u2019s caf\u00e9 \U0001F331</p><script>alert(1)</script>'.encode()
        route = self.path.split('?')[0]
        if route == '/page':
            return self.send(200, 'text/html; charset=utf-8', html)
        if route == '/plain':
            return self.send(200, 'Text/Plain', b'Plain synthetic text.\n')
        if route in ('/rss', '/atom', '/xml', '/text-xml'):
            kind = {'/rss': 'application/rss+xml; charset=utf-8', '/atom': 'Application/Atom+XML', '/xml': 'application/xml', '/text-xml': 'text/xml'}[route]
            return self.send(200, kind, b'<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Synthetic feed</title></channel></rss>')
        if route == '/xhtml':
            return self.send(200, 'application/xhtml+xml', b'<html xmlns="http://www.w3.org/1999/xhtml"><body>x</body></html>')
        if route == '/empty':
            return self.send(200, 'text/plain', b'')
        if route == '/bom':
            return self.send(200, 'text/plain', b'\xef\xbb\xbfAfter the mark')
        if route == '/chunked':
            self.send_response(200); self.send_header('Content-Type', 'text/html'); self.send_header('Transfer-Encoding', 'chunked')
            self.send_header('Connection', 'close'); self.end_headers()
            for piece in (html[:10], html[10:11], html[11:]):
                self.wfile.write(b'%x;note=1\r\n' % len(piece) + piece + b'\r\n')
            self.wfile.write(b'0\r\nTrailer: x\r\n\r\n')
            return
        if route == '/until-close':
            self.send_response(200); self.send_header('Content-Type', 'text/plain'); self.send_header('Connection', 'close'); self.end_headers()
            self.wfile.write(b'No length was given.'); self.close_connection = True
            return
        if route == '/moved':
            return self.send(301, 'text/html', b'moved', [('Location', 'https://other.pea-conformance.example/page?a=1#part')])
        if route == '/moved-here':
            return self.send(302, None, b'', [('Location', '/page?from=moved')])
        if route in ('/moved-plain', '/moved-inside', '/moved-number', '/moved-nowhere', '/moved-odd'):
            target = {'/moved-plain': 'http://other.pea-conformance.example/page', '/moved-inside': 'https://printer.local/',
                      '/moved-number': 'https://127.0.0.1/', '/moved-nowhere': None, '/moved-odd': '//other.pea-conformance.example/page'}[route]
            return self.send(307, None, b'', [('Location', target)] if target else [])
        if route == '/missing':
            return self.send(404, 'text/html', b'SYNTHETIC SITE DETAIL')
        if route == '/broken':
            return self.send(500, 'text/html', b'SYNTHETIC SITE DETAIL')
        if route == '/image':
            return self.send(200, 'image/png', b'\x89PNG')
        if route == '/json':
            return self.send(200, 'application/json; charset=utf-8', '{"name": "Zo\u00eb"}'.encode())
        if route == '/captions':
            return self.send(200, 'text/vtt; charset=utf-8', b'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello there.\n')
        if route == '/subrip':
            return self.send(200, 'application/x-subrip', b'1\n00:00:01,000 --> 00:00:03,000\nHello there.\n')
        if route == '/markdown':
            return self.send(200, 'text/markdown; charset=utf-8', b'# Episode\n\nHello there.\n')
        if route == '/untyped':
            return self.send(200, None, b'no type')
        if route == '/packed':
            return self.send(200, 'text/html', b'\x1f\x8b', [('Content-Encoding', 'gzip')])
        if route == '/latin':
            return self.send(200, 'text/html; charset=iso-8859-1', b'caf\xe9')
        if route == '/big':
            return self.send(200, 'text/plain', b'x' * (type(self).big + 1))
        if route == '/just-fits':
            return self.send(200, 'text/plain', b'x' * type(self).big)
        if route == '/big-unannounced':
            self.send_response(200); self.send_header('Content-Type', 'text/plain'); self.send_header('Connection', 'close'); self.end_headers()
            try:
                for _ in range(type(self).big // 65536 + 2):
                    self.wfile.write(b'x' * 65536)
            except OSError:
                pass
            self.close_connection = True
            return
        if route == '/slow':
            self.send_response(200); self.send_header('Content-Type', 'text/plain'); self.send_header('Connection', 'close'); self.end_headers()
            try:
                for _ in range(60):
                    self.wfile.write(b'drip '); self.wfile.flush(); time.sleep(0.5)
            except OSError:
                pass
            self.close_connection = True
            return
        if route == '/garbage':
            self.wfile.write(b'this is not HTTP\r\n\r\n'); self.close_connection = True
            return
        self.send(404, 'text/plain', b'no such synthetic page')


class Voices(BaseHTTPRequestHandler):
    """Synthetic voice providers, reached only through the gateway's test stand-in. The voice named
    in a request (or the key, when listing) chooses how the stand-in misbehaves."""
    protocol_version = 'HTTP/1.1'
    seen = []
    release = threading.Event()
    AUDIO = b'ID3SYNTHETIC-MP3-' + bytes(range(256)) * 4
    DETAIL = b'{"detail":"SYNTHETIC PROVIDER DETAIL quota for user owner@example.invalid"}'
    FOUND = '{"results": [{"title": "Zo\u00eb\u2019s tide tables", "url": "https://tides.example/zoe"}]}'.encode()

    def log_message(self, *_args):
        pass

    def send(self, status, kind, body, extra=()):
        self.send_response(status)
        if kind:
            self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Connection', 'close')
        for name, value in extra:
            self.send_header(name, value)
        self.end_headers()
        try:
            self.wfile.write(body)
        except OSError:
            pass

    def misbehave(self, how):
        """True when the request was answered here."""
        if how.startswith('fail0'):
            self.send(int(how[5:8]), 'application/json', self.DETAIL)
        elif how == 'redirect1':
            self.send(302, None, b'', [('Location', '/elsewhere')])
        elif how == 'wrongtype':
            self.send(200, 'text/html', b'<html>SYNTHETIC PROVIDER DETAIL</html>')
        elif how == 'toolarge1':
            self.send(200, 'audio/mpeg', b'x' * (SPEECH['audioBytes'] + 1))
        elif how == 'biglist01':
            self.send(200, 'application/json', b'{"voices":[' + b' ' * SPEECH['listBytes'] + b']}')
        elif how == 'bigsearch':
            self.send(200, 'application/json', b'{"results":[' + b' ' * SEARCH['bodyBytes'] + b']}')
        elif how == 'gzipped01':
            self.send(200, 'audio/mpeg', self.AUDIO, [('Content-Encoding', 'gzip')])
        elif how == 'emptybody':
            self.send(200, 'audio/mpeg', b'')
        elif how == 'notjson01':
            self.send(200, 'application/json', b'SYNTHETIC PROVIDER DETAIL')
        elif how == 'slowslow1':
            self.release.wait(20)
            self.send(200, 'audio/mpeg', self.AUDIO)
        elif how == 'chunked01':
            self.send_response(200); self.send_header('Content-Type', 'audio/mpeg; codecs=mp3'); self.send_header('Transfer-Encoding', 'chunked')
            self.send_header('Connection', 'close'); self.end_headers()
            for piece in (self.AUDIO[:7], self.AUDIO[7:]):
                self.wfile.write(b'%x\r\n' % len(piece) + piece + b'\r\n')
            self.wfile.write(b'0\r\n\r\n')
        elif how == 'octets001':
            self.send(200, 'application/octet-stream', self.AUDIO)
        else:
            return False
        return True

    def do_GET(self):
        headers = {k.lower(): v for k, v in self.headers.items()}
        type(self).seen.append(('GET', self.path, headers, b''))
        key = (headers.get('xi-api-key') or headers.get('x-subscription-token') or headers.get('authorization', '')).removeprefix('Bearer ')
        if self.misbehave(key[:9]):
            return
        if self.path.startswith('/res/v1/llm/context?'):
            return self.send(200, 'application/json; charset=utf-8', self.FOUND)
        if self.path == '/v2/voices?page_size=100':
            rows = [{'voice_id': 'voiceAAAA1111', 'name': '  Synthetic\tAda  ', 'category': 'premade', 'preview_url': 'https://evil.example/x.mp3'},
                    {'voice_id': 'bad id!', 'name': 'Dropped'}, {'voice_id': 'voiceBBBB2222', 'name': 7}, 'text',
                    {'voice_id': 'voiceCCCC3333', 'name': 'N' * 200}, {'voice_id': 'voiceDDDD4444', 'name': '  '}]
            rows += [{'voice_id': 'many%08d' % i, 'name': 'Voice %d' % i} for i in range(150)]
            return self.send(200, 'application/json; charset=utf-8', json.dumps({'voices': rows, 'has_more': True}).encode())
        if self.path == '/model?self=true&page_size=100':
            rows = [{'_id': 'a1b2c3d4e5f60718293a4b5c6d7e8f90', 'title': 'Synthetic Bo', 'type': 'tts'},
                    {'_id': 'b1b2c3d4e5f60718293a4b5c6d7e8f90', 'title': 'A singing model', 'type': 'svc'},
                    {'_id': '../../wallet', 'title': 'Dropped', 'type': 'tts'}]
            return self.send(200, 'application/json', json.dumps({'total': 3, 'items': rows}).encode())
        if self.path == '/model?licensed=true&language=en&page_size=100':
            rows = [{'_id': 'c1b2c3d4e5f60718293a4b5c6d7e8f90', 'title': 'Synthetic Narrator', 'type': 'tts', 'state': 'trained', 'licensed': True,
                     'author': {'nickname': 'SYNTHETIC PROVIDER DETAIL'}, 'cover_image': 'https://evil.example/x.png'},
                    {'_id': 'd1b2c3d4e5f60718293a4b5c6d7e8f90', 'title': 'Still training', 'type': 'tts', 'state': 'training'}]
            return self.send(200, 'application/json', json.dumps({'total': 2, 'items': rows}).encode())
        self.send(404, 'application/json', self.DETAIL)

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', '0')))
        headers = {k.lower(): v for k, v in self.headers.items()}
        type(self).seen.append(('POST', self.path, headers, body))
        eleven = re.fullmatch(r'/v1/text-to-speech/([A-Za-z0-9]+)\?output_format=mp3_44100_128', self.path)
        try:
            voice = eleven.group(1) if eleven else json.loads(body)['reference_id'] if self.path == '/v1/tts' else None
        except (ValueError, KeyError):
            voice = None
        if self.path == '/v1/search':
            if not self.misbehave(headers.get('x-bb-api-key', '')[:9]):
                self.send(200, 'application/json', self.FOUND)
            return
        if voice is None:
            return self.send(404, 'application/json', self.DETAIL)
        if not self.misbehave(voice):
            self.send(200, 'audio/mpeg', self.AUDIO)


class Engine(BaseHTTPRequestHandler):
    """A synthetic project engine. The draft's title chooses how it misbehaves."""
    seen = []
    release = threading.Event()

    def log_message(self, *_args):
        pass

    def do_GET(self):
        type(self).seen.append(('GET', self.path, {k.lower(): v for k, v in self.headers.items()}, b''))
        self.send_response(404); self.end_headers()

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', '0')))
        sent = {k.lower(): v for k, v in self.headers.items()}
        type(self).seen.append(('POST', self.path, sent, body))
        if sent.get('authorization') != 'Bearer ' + ENGINE_TOKEN:
            return self.answer(401, b'{"detail":"SYNTHETIC ENGINE DETAIL"}')
        asked = json.loads(body)
        mode = asked.get('title', '')
        if mode.startswith('fail'):
            return self.answer(int(mode[4:7]), b'{"detail":"SYNTHETIC ENGINE DETAIL"}')
        if mode == 'redirect':
            self.send_response(307); self.send_header('Location', f'http://127.0.0.1:{self.server.server_port}/api/elsewhere')
            self.send_header('Content-Length', '0'); self.end_headers(); return
        if mode == 'wrongtype':
            return self.answer(200, b'{"ok":true}', 'text/html')
        if mode == 'notjson':
            return self.answer(200, b'SYNTHETIC ENGINE DETAIL')
        if mode == 'list':
            return self.answer(200, b'["SYNTHETIC ENGINE DETAIL"]')
        if mode == 'repeated':
            return self.answer(200, b'{"a":1,"a":2}')
        if mode == 'toolarge':
            return self.answer(200, b'{"pad":"' + b'x' * PROJECTS['answerBytes'] + b'"}')
        if mode == 'gzipped':
            return self.answer(200, b'{"ok":true}', extra={'Content-Encoding': 'gzip'})
        if mode == 'slow':
            self.release.wait(15)
        if asked['action'] == 'types':
            return self.answer(200, json.dumps({'types': [{'id': 'local-website', 'label': 'Local website'}, {'id': 'other', 'label': 'Other'}]}).encode())
        if asked['action'] == 'status':
            return self.answer(200, json.dumps({'project': asked['project'], 'state': 'active', 'stories': [
                {'title': 'Synthetic story', 'agent': 'claude', 'model': 'synthetic-model', 'seconds': 42, 'cost': 0.25}]}).encode(), 'application/json; charset=utf-8')
        return self.answer(200, json.dumps({'echo': asked}).encode())

    def answer(self, status, data, kind='application/json', extra=None):
        self.send_response(status); self.send_header('Content-Type', kind); self.send_header('Content-Length', str(len(data)))
        for name, value in (extra or {}).items():
            self.send_header(name, value)
        self.end_headers(); self.wfile.write(data)


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
        Site.big = CONTRACT['reader']['bodyBytes']
        cls.site = ThreadingHTTPServer(('127.0.0.1', 0), Site)
        cls.site.daemon_threads = True
        threading.Thread(target=cls.site.serve_forever, daemon=True).start()
        cls.voices = ThreadingHTTPServer(('127.0.0.1', 0), Voices)
        cls.voices.daemon_threads = True
        threading.Thread(target=cls.voices.serve_forever, daemon=True).start()
        cls.engine = ThreadingHTTPServer(('127.0.0.1', 0), Engine)
        cls.engine.daemon_threads = True
        threading.Thread(target=cls.engine.serve_forever, daemon=True).start()
        cls.engine_token_file = Path(cls.folder.name) / 'engine-token'
        cls.write_engine_token(ENGINE_TOKEN)
        cls.token_file = token_file
        cls.closed_port = free_port()
        cls.port = free_port()
        cls.process = subprocess.Popen(
            [*cls.command(cls.port),
             '--projects-url', f'http://127.0.0.1:{cls.engine.server_port}', '--projects-token-file', str(cls.engine_token_file),
             # Stand-ins for the voice providers.
             '--speech-test-port', f'elevenlabs={cls.voices.server_port}',
             '--speech-test-port', f'fish={cls.voices.server_port}',
             '--speech-test-port', f'brave={cls.voices.server_port}',
             '--speech-test-port', f'browserbase={cls.voices.server_port}',
             # Stand-ins for public sites. A real name can never be given a local address this way.
             '--reader-test-site', f'site.pea-conformance.example={cls.site.server_port}',
             '--reader-test-site', f'other.pea-conformance.example={cls.site.server_port}',
             '--reader-test-site', f'down.pea-conformance.example={cls.closed_port}',
             '--reader-test-resolve', 'loopback.pea-conformance.example=127.0.0.1',
             '--reader-test-resolve', 'private.pea-conformance.example=10.1.2.3',
             '--reader-test-resolve', 'metadata.pea-conformance.example=169.254.169.254',
             '--reader-test-resolve', 'six.pea-conformance.example=::1',
             '--reader-test-resolve', 'mapped.pea-conformance.example=::ffff:127.0.0.1',
             '--reader-test-resolve', 'ula.pea-conformance.example=fd00::1',
             '--reader-test-resolve', 'linklocal.pea-conformance.example=fe80::1',
             '--reader-test-resolve', 'mixed.pea-conformance.example=203.0.114.7,192.168.1.10',
             '--reader-test-resolve', 'mixed-six.pea-conformance.example=2600::1,fc00::2',
             '--reader-test-resolve', 'cgnat.pea-conformance.example=100.64.0.1',
             '--reader-test-resolve', 'zero.pea-conformance.example=0.0.0.0',
             '--reader-test-resolve', 'nat64.pea-conformance.example=64:ff9b::7f00:1',
             '--reader-test-resolve', 'sixtofour.pea-conformance.example=2002:7f00:1::1'],
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        cls.host = f'127.0.0.1:{cls.port}'
        cls.origin = 'http://' + cls.host
        cls.wait_for(cls.process, cls.port)

    @classmethod
    def command(cls, port):
        """The start of the command for a gateway under test on a port, with the options every gateway takes."""
        given = os.environ.get('PEA_GATEWAY_COMMAND')
        return [*json.loads(given or json.dumps([sys.executable, str(SERVER / 'gateway.py')])), '--port', str(port),
                '--upstream', f'http://127.0.0.1:{cls.upstream.server_port}', '--token-file', str(cls.token_file),
                *(['--root', str(BROWSER)] if given else [])]

    @staticmethod
    def wait_for(process, port):
        for _ in range(200):
            if process.poll() is not None:
                raise RuntimeError('The gateway under test exited: ' + process.stderr.read().decode()[-400:])
            try:
                socket.create_connection(('127.0.0.1', port), timeout=0.2).close()
                return
            except OSError:
                time.sleep(0.05)
        raise RuntimeError('The gateway under test did not start listening.')

    @classmethod
    def write_engine_token(cls, text, mode=0o600):
        cls.engine_token_file.unlink(missing_ok=True)
        fd = os.open(cls.engine_token_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
        with os.fdopen(fd, 'w') as stream:
            stream.write(text + '\n')
        os.chmod(cls.engine_token_file, mode)

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate()
        try:
            cls.process.wait(5)
        except subprocess.TimeoutExpired:
            cls.process.kill()
        cls.process.stderr.close()
        cls.upstream.shutdown(); cls.upstream.server_close()
        cls.site.shutdown(); cls.site.server_close()
        cls.voices.shutdown(); cls.voices.server_close()
        cls.engine.shutdown(); cls.engine.server_close()
        cls.folder.cleanup()

    def setUp(self):
        Upstream.mode = 'normal'
        Upstream.seen.clear()
        Upstream.release.clear()
        Site.seen.clear()
        Voices.seen.clear()
        Voices.release.clear()
        Engine.seen.clear()
        Engine.release.clear()
        self.write_engine_token(ENGINE_TOKEN)

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
    def test_reminders_are_checked_the_same_way_and_need_the_token(self):
        path = CONTRACT['reminders']['path']
        rules = CONTRACT['reminders']
        good = {'id': 'a1b2c3d4-0000-4000-8000-000000000001', 'title': 'Call Zo\u00eb \U0001F4DE about the \u201cplan\u201d', 'due': 1900000000000}
        self.assertEqual(self.call('GET', path)[0], 401)
        self.assertEqual(self.call('POST', path, body={'reminders': [good]})[0], 401)
        self.assertEqual(self.call('POST', path + '?token=' + TOKEN, body={'reminders': [good]})[0], 401)
        self.assertEqual(self.call('GET', path, token=TOKEN, headers={'Origin': 'https://evil.example'})[0], 403)
        self.assertEqual(self.call('POST', path, token=TOKEN, body={'reminders': [good]}, headers={'Origin': 'https://evil.example'})[0], 403)
        status, headers, body = self.call('GET', path, token=TOKEN)
        self.assertEqual(status, 200)
        self.assert_contract_headers(headers, 'reminders')
        # The gateways under test here have no way to show a notification; PEA for Mac answers true.
        self.assertEqual(json.loads(body), {'available': False})
        many = [{**good, 'id': f'id-{n}', 'due': 1900000000000 + n} for n in range(rules['items'])]
        for accepted in ([], [good], [{**good, 'due': 1}], [{**good, 'title': 'x' * rules['titleCharacters']}],
                         [{**good, 'title': '\U0001F4DE' * rules['titleCharacters']}], [{**good, 'due': rules['dueMax']}], many):
            status, headers, body = self.call('POST', path, token=TOKEN, body={'reminders': accepted}, headers={'Origin': self.origin})
            self.assertEqual(status, 200, json.dumps(accepted)[:90])
            self.assert_contract_headers(headers, 'reminders')
            self.assertEqual(json.loads(body), {'available': False, 'scheduled': 0})
        bad = [
            {}, [], 'text', None, {'reminders': {}}, {'reminders': 'x'}, {'reminders': [good], 'profile': 'work'}, {'items': [good]},
            {'reminders': many + [{**good, 'id': 'one-more'}]}, {'reminders': [good, good]},
            {'reminders': ['x']}, {'reminders': [{'id': 'a', 'title': 'x'}]}, {'reminders': [{**good, 'profile': 'work'}]},
            {'reminders': [{**good, 'id': ''}]}, {'reminders': [{**good, 'id': 'x' * 65}]}, {'reminders': [{**good, 'id': 'a b'}]},
            {'reminders': [{**good, 'id': '../a'}]}, {'reminders': [{**good, 'id': 7}]},
            {'reminders': [{**good, 'title': ''}]}, {'reminders': [{**good, 'title': 'x' * (rules['titleCharacters'] + 1)}]},
            {'reminders': [{**good, 'title': 'two\nlines'}]}, {'reminders': [{**good, 'title': 'tab\there'}]},
            {'reminders': [{**good, 'title': 'nul\u0000'}]}, {'reminders': [{**good, 'title': 'sep\u2028'}]},
            {'reminders': [{**good, 'title': 'c1\u0085'}]}, {'reminders': [{**good, 'title': ['x']}]},
            {'reminders': [{**good, 'due': 0}]}, {'reminders': [{**good, 'due': -5}]}, {'reminders': [{**good, 'due': rules['dueMax'] + 1}]},
            {'reminders': [{**good, 'due': 1.5}]}, {'reminders': [{**good, 'due': '1900000000000'}]}, {'reminders': [{**good, 'due': True}]},
            {'reminders': [{**good, 'due': None}]},
        ]
        for body in bad:
            status, headers, _ = self.call('POST', path, token=TOKEN, body=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
            self.assertEqual(status, 400, json.dumps(body)[:90])
            self.assert_contract_headers(headers, '400')
        whole = json.dumps({'reminders': [good]}).encode()
        for body, headers in (
            (b'{not json', {'Content-Type': 'application/json'}),
            (whole, {'Content-Type': 'text/plain'}),
            (whole, {}),
            (b'', {'Content-Type': 'application/json'}),
            (b'{"reminders":[],"reminders":[]}', {'Content-Type': 'application/json'}),
            (b'{"reminders":[{"id":"a","title":"x","due":1900000000000,"id":"a"}]}', {'Content-Type': 'application/json'}),
            (b'{"reminders":[{"id":"a","title":"x","due":1900000000000.0}]}', {'Content-Type': 'application/json'}),
            (b'{"reminders":[{"id":"a","title":"x","due":19e11}]}', {'Content-Type': 'application/json'}),
            (b'{"reminders":[{"id":"a","title":"x","due":NaN}]}', {'Content-Type': 'application/json'}),
            (b'{"reminders":[{"id":"a","title":"\\ud83d","due":1900000000000}]}', {'Content-Type': 'application/json'}),
            (b'{"reminders":[{"id":"a","title":"\xff","due":1900000000000}]}', {'Content-Type': 'application/json'}),
            (b'\xef\xbb\xbf' + whole, {'Content-Type': 'application/json'}),
            (whole + b' x', {'Content-Type': 'application/json'}),
        ):
            self.assertEqual(self.call('POST', path, token=TOKEN, body=body, headers=headers)[0], 400, str(body[:60]))
        self.assertEqual(self.raw(
            f'POST {path} HTTP/1.1\r\nHost: {self.host}\r\nAuthorization: Bearer {TOKEN}\r\n'
            f'Content-Type: application/json\r\nContent-Length: {LIMITS["requestBytes"] + 1}\r\n\r\n'), 400, 'an oversized list is refused from its length alone')
        for other in (path + '/', path + '/x', path + '?x=1', '/' + path, '/api/reminders'):
            self.assertIn(self.call('POST', other, token=TOKEN, body={'reminders': []})[0], (401, 404), other)
            self.assertIn(self.call('GET', other, token=TOKEN)[0], (401, 404), other)
        self.assertEqual(Upstream.seen, [], 'reminders never reach the model server')

    # --- the page reader ----------------------------------------------------------------------

    def read(self, url, **more):
        status, headers, body = self.call('POST', READER['path'], token=TOKEN, body={'url': url}, timeout=30, **more)
        self.assert_contract_headers(headers, 'reader ' + str(status))
        return status, json.loads(body)

    def test_the_reader_returns_a_public_text_page_and_sends_nothing_of_the_owners(self):
        site = 'https://site.pea-conformance.example'
        status, answer = self.read(site + '/page?q=1&r=%20x', headers={'Origin': self.origin, 'Cookie': 'session=SYNTHETIC', 'X-Extra': 'SYNTHETIC'})
        self.assertEqual(status, 200)
        self.assertEqual(answer, {'outcome': 'page', 'url': site + '/page?q=1&r=%20x', 'type': 'text/html',
                                  'text': '<!doctype html><title>Synthetic</title><p>Zo\u00eb\u2019s caf\u00e9 \U0001F331</p><script>alert(1)</script>'})
        path, sent = Site.seen[-1]
        self.assertEqual(path, '/page?q=1&r=%20x', 'the address is passed on exactly')
        self.assertEqual(sent.get('host'), 'site.pea-conformance.example')
        self.assertEqual(sent.get('user-agent'), READER['userAgent'])
        self.assertEqual(sent.get('accept'), READER['accept'])
        self.assertEqual(sent.get('accept-encoding'), 'identity')
        self.assertEqual(set(sent) - {'host', 'user-agent', 'accept', 'accept-encoding', 'connection'}, set(),
                         'no token, cookie, origin, referrer or other header of the owner reaches the site')
        self.assertNotIn(TOKEN, json.dumps(Site.seen))
        for path, kind, text in (('/plain', 'text/plain', 'Plain synthetic text.\n'), ('/xhtml', 'application/xhtml+xml', None),
                                 ('/rss', 'application/rss+xml', None), ('/atom', 'application/atom+xml', None), ('/xml', 'application/xml', None), ('/text-xml', 'text/xml', None), ('/empty', 'text/plain', ''),
                                 ('/bom', 'text/plain', 'After the mark'), ('/json', 'application/json', '{"name": "Zo\u00eb"}'),
                                 ('/captions', 'text/vtt', 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello there.\n'),
                                 ('/subrip', 'application/x-subrip', '1\n00:00:01,000 --> 00:00:03,000\nHello there.\n'),
                                 ('/markdown', 'text/markdown', '# Episode\n\nHello there.\n'), ('/chunked', 'text/html', None), ('/until-close', 'text/plain', 'No length was given.'),
                                 ('', 'text/plain', None), ('?x=1', 'text/plain', None)):
            if path in ('', '?x=1'):
                continue  # these ask the fake site for "/", which it does not have; checked below
            status, answer = self.read(site + path)
            self.assertEqual((status, answer.get('outcome'), answer.get('type')), (200, 'page', kind), path)
            if text is not None:
                self.assertEqual(answer['text'], text, path)
        self.assertIn('caf\u00e9', self.read(site + '/chunked')[1]['text'], 'a page sent in pieces is put back together')
        self.assertEqual(self.read(site + ':443/plain')[0], 200, 'the usual port may be written out')
        self.assertEqual(self.read('https://SITE.pea-conformance.EXAMPLE/plain')[0], 200, 'capital letters in the name are fine')
        self.read(site)
        self.assertEqual(Site.seen[-1][0], '/', 'no path means the front page')
        self.read(site + '?x=1')
        self.assertEqual(Site.seen[-1][0], '/?x=1')
        status, answer = self.read(site + '/just-fits')
        self.assertEqual((status, len(answer.get('text', ''))), (200, READER['bodyBytes']), 'a page of exactly the limit is read')

    def test_the_reader_never_follows_a_redirect(self):
        site = 'https://site.pea-conformance.example'
        before = len(Site.seen)
        status, answer = self.read(site + '/moved')
        self.assertEqual((status, answer), (200, {'outcome': 'redirect', 'url': site + '/moved',
                                                  'location': 'https://other.pea-conformance.example/page?a=1'}))
        status, answer = self.read(site + '/moved-here')
        self.assertEqual((status, answer.get('location')), (200, site + '/page?from=moved'), 'a path on the same site is completed')
        self.assertEqual([path for path, _ in Site.seen[before:]], ['/moved', '/moved-here'], 'the new address was not asked for')
        for path in ('/moved-plain', '/moved-inside', '/moved-number', '/moved-nowhere', '/moved-odd'):
            status, answer = self.read(site + path)
            self.assertEqual((status, set(answer)), (502, {'error'}), path + ' leads somewhere the reader will not go')
            self.assertNotIn('printer', json.dumps(answer))

    def test_the_reader_refuses_everything_that_is_not_a_small_public_text_page(self):
        site = 'https://site.pea-conformance.example'
        for path in ('/missing', '/broken'):
            status, answer = self.read(site + path)
            self.assertEqual((status, answer.get('status')), (502, 404 if path == '/missing' else 500), path)
            self.assertNotIn('SYNTHETIC SITE DETAIL', json.dumps(answer), 'an error page is not passed on')
        for path in ('/image', '/untyped', '/packed', '/latin', '/big', '/big-unannounced', '/garbage', '/nothing-here'):
            status, answer = self.read(site + path)
            self.assertEqual((status, 'text' in answer, 'outcome' in answer), (502, False, False), path)
        self.assertEqual(self.read('https://down.pea-conformance.example/page')[0], 502, 'a site that is not answering')
        # Pages that never finish are given up on, and only a few reads run at once.
        started = time.monotonic()
        results = []
        slow = [threading.Thread(target=lambda: results.append(self.read(site + '/slow')[0])) for _ in range(READER['concurrent'])]
        for thread in slow:
            thread.start()
        deadline = time.monotonic() + 5
        while sum(1 for path, _ in Site.seen if path == '/slow') < READER['concurrent'] and time.monotonic() < deadline:
            time.sleep(0.05)
        self.assertEqual(self.read(site + '/page')[0], 429, 'one more read than the limit is refused, not queued')
        for thread in slow:
            thread.join(READER['seconds'] + 10)
        self.assertEqual(results, [502] * READER['concurrent'])
        self.assertLess(time.monotonic() - started, READER['seconds'] + 6)
        self.assertEqual(self.read(site + '/page')[0], 200, 'and the reader is free again afterwards')

    def test_the_reader_never_contacts_a_private_or_local_address(self):
        Site.seen.clear()
        for name in ('loopback', 'private', 'metadata', 'six', 'mapped', 'ula', 'linklocal', 'mixed', 'mixed-six', 'cgnat', 'zero', 'nat64', 'sixtofour'):
            status, answer = self.read(f'https://{name}.pea-conformance.example/page')
            self.assertEqual((status, set(answer)), (422, {'error'}), name + ' leads to an address that is never read')
        bad = [
            'http://site.pea-conformance.example/page', 'HTTPS://site.pea-conformance.example/page', 'ftp://site.pea-conformance.example/',
            'https://site.pea-conformance.example:8443/page', f'https://site.pea-conformance.example:{self.site.server_port}/page',
            'https://site.pea-conformance.example:443:443/', 'https://site.pea-conformance.example:/',
            'https://user@site.pea-conformance.example/page', 'https://user:pw@site.pea-conformance.example/page',
            'https://site.pea-conformance.example/page#part', 'https://site.pea-conformance.example/a b',
            'https://site.pea-conformance.example\\@evil.example/', 'https://site.pea-conformance.example/caf\u00e9',
            'https://caf\u00e9.pea-conformance.example/', 'https://site.pea-conformance.example/\n', 'https://site.pea-conformance.example/\u0000',
            'https://127.0.0.1/', f'https://127.0.0.1:{self.site.server_port}/page', 'https://2130706433/', 'https://0x7f.0.0.1/', 'https://0177.0.0.1/',
            'https://127.1/', 'https://[::1]/', 'https://[::ffff:127.0.0.1]/', 'https://10.0.0.1/', 'https://169.254.169.254/latest/meta-data/',
            'https://localhost/', 'https://localhost.localdomain/', 'https://printer.local/', 'https://server.internal/', 'https://router.lan/',
            'https://nas.home/', 'https://1.0.0.127.in-addr.arpa/', 'https://hidden.onion/', 'https://unlisted.example/', 'https://anything.test/',
            'https://single/', 'https://.pea-conformance.example/', 'https://site..example/', 'https://site.pea-conformance.example./',
            'https://-site.pea-conformance.example/', 'https://' + 'a' * 64 + '.pea-conformance.example/', 'https://' + '.'.join(['a' * 60] * 5) + '.org/',
            'https://site.pea-conformance.example/' + 'x' * READER['urlCharacters'], 'https://', 'site.pea-conformance.example/page', '',
            f'http://127.0.0.1:{self.upstream.server_port}/v1/models', f'https://127.0.0.1:{self.port}/v1/models',
        ]
        for url in bad:
            status, answer = self.read(url)
            self.assertEqual((status, set(answer)), (400, {'error'}), url[:80])
        for body in ({}, {'url': 7}, {'url': None}, {'url': ['https://site.pea-conformance.example/page']}, {'address': 'https://site.pea-conformance.example/page'},
                     {'url': 'https://site.pea-conformance.example/page', 'method': 'POST'}, {'url': 'https://site.pea-conformance.example/page', 'headers': {}},
                     [], 'https://site.pea-conformance.example/page', None):
            self.assertEqual(self.call('POST', READER['path'], token=TOKEN, body=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})[0], 400, json.dumps(body)[:60])
        for body in (b'{"url":"https://site.pea-conformance.example/page","url":"https://site.pea-conformance.example/plain"}', b'{not json', b''):
            self.assertEqual(self.call('POST', READER['path'], token=TOKEN, body=body, headers={'Content-Type': 'application/json'})[0], 400)
        self.assertEqual(Site.seen, [], 'none of these reached any site')
        self.assertEqual(Upstream.seen, [], 'and none reached the model server')

    @unittest.skipUnless(os.environ.get('PEA_CONFORMANCE_LIVE') == '1', 'set PEA_CONFORMANCE_LIVE=1 to read real public sites')
    def test_the_reader_against_real_sites_when_asked(self):
        """The only test that uses the internet. It checks what the stand-in sites cannot: real name
        lookups, connecting to the checked address, and certificates."""
        status, answer = self.read('https://example.com/')
        self.assertEqual((status, answer.get('outcome'), answer.get('type')), (200, 'page', 'text/html'))
        self.assertIn('Example Domain', answer['text'])
        # A public name that deliberately points at this machine.
        self.assertEqual(self.read('https://localtest.me/')[0], 422)
        # Certificates that are expired, for another name, or signed by nobody known.
        for name in ('expired', 'wrong.host', 'self-signed', 'untrusted-root'):
            self.assertEqual(self.read(f'https://{name}.badssl.com/')[0], 502, name)
        self.assertEqual(self.read('https://no-such-name.pea-conformance.invalid-tld-for-test.org/')[0], 502)

    def test_the_reader_needs_the_token_and_is_not_a_way_around_the_other_checks(self):
        url = {'url': 'https://site.pea-conformance.example/page'}
        self.assertEqual(self.call('POST', READER['path'], body=url)[0], 401)
        self.assertEqual(self.call('POST', READER['path'] + '?token=' + TOKEN, body=url)[0], 401)
        self.assertEqual(self.call('POST', READER['path'], token='x' * 43, body=url)[0], 401)
        self.assertEqual(self.call('POST', READER['path'], token=TOKEN, body=url, headers={'Origin': 'https://evil.example'})[0], 403)
        self.assertEqual(self.call('POST', READER['path'], token=TOKEN, body=url, headers={'Host': 'evil.example'})[0], 403)
        self.assertIn(self.call('GET', READER['path'], token=TOKEN)[0], (404, 405), 'reading is asked for with POST only')
        self.assertIn(self.call('GET', READER['path'] + '?url=https://site.pea-conformance.example/page', token=TOKEN)[0], (404, 405))
        for other in (READER['path'] + '/', READER['path'] + '/x', '/' + READER['path'], '/api/read', '/v1/fetch', '/v1/proxy'):
            self.assertIn(self.call('POST', other, token=TOKEN, body=url)[0], (401, 404), other)
        self.assertEqual(Site.seen, [], 'nothing was read')

    # --- speech -------------------------------------------------------------------------------

    KEY = 'sk_SYNTHETICsynthetic0123456789'

    def speak(self, timeout=30, **fields):
        body = {'provider': 'elevenlabs', 'key': self.KEY, 'voice': 'voiceAAAA1111', 'text': 'Hello, synthetic world.', **fields}
        status, headers, data = self.call('POST', SPEECH['path'], token=TOKEN, body=body, timeout=timeout)
        self.assert_contract_headers(headers, 'speech ' + str(status))
        return status, headers, data

    def voices_of(self, provider, key=None):
        status, headers, data = self.call('POST', SPEECH['voicesPath'], token=TOKEN, body={'provider': provider, 'key': key or self.KEY}, timeout=30)
        self.assert_contract_headers(headers, 'voices ' + str(status))
        return status, json.loads(data)

    def test_speech_sends_one_fixed_request_with_the_owners_key_and_returns_only_audio(self):
        status, headers, data = self.speak(text='Zo\u00eb said \u201chello\u201d \U0001F331\nSecond line.')
        self.assertEqual((status, headers.get('content-type'), data), (200, SPEECH['audioType'], Voices.AUDIO))
        self.assertEqual(len(Voices.seen), 1, 'one request to the provider')
        method, path, sent, body = Voices.seen[0]
        self.assertEqual((method, path), ('POST', '/v1/text-to-speech/voiceAAAA1111?output_format=mp3_44100_128'))
        self.assertEqual(sent.get('xi-api-key'), self.KEY)
        self.assertEqual(sent.get('user-agent'), SPEECH['userAgent'])
        self.assertEqual(sent.get('content-type'), 'application/json')
        for private in ('authorization', 'cookie', 'origin', 'referer'):
            self.assertNotIn(private, sent, 'nothing of the owner\u2019s gateway session is passed on')
        self.assertNotIn(TOKEN, json.dumps(sent) + body.decode())
        self.assertEqual(json.loads(body), {'text': 'Zo\u00eb said \u201chello\u201d \U0001F331\nSecond line.',
                                            'model_id': SPEECH['providers']['elevenlabs']['model'], 'apply_text_normalization': 'on'})

        Voices.seen.clear()
        status, headers, data = self.speak(provider='fish', voice='a1b2c3d4e5f60718293a4b5c6d7e8f90')
        self.assertEqual((status, headers.get('content-type'), data), (200, SPEECH['audioType'], Voices.AUDIO))
        method, path, sent, body = Voices.seen[0]
        self.assertEqual((method, path), ('POST', '/v1/tts'))
        self.assertEqual(sent.get('authorization'), 'Bearer ' + self.KEY)
        self.assertEqual(sent.get('model'), SPEECH['providers']['fish']['model'])
        self.assertNotIn('xi-api-key', sent)
        self.assertEqual(json.loads(body), {'text': 'Hello, synthetic world.', 'reference_id': 'a1b2c3d4e5f60718293a4b5c6d7e8f90', 'format': 'mp3'})

        for voice in ('chunked01', 'octets001'):
            status, headers, data = self.speak(voice=voice)
            self.assertEqual((status, headers.get('content-type'), data), (200, SPEECH['audioType'], Voices.AUDIO), voice)
        longest = '\U0001F331' * SPEECH['textCharacters']
        self.assertEqual(self.speak(text=longest)[0], 200, 'the limit counts characters, not bytes or UTF-16 units')

    def test_voices_are_listed_as_ids_and_names_only(self):
        status, answer = self.voices_of('elevenlabs')
        self.assertEqual(status, 200)
        self.assertEqual(set(answer), {'voices'})
        self.assertEqual(answer['voices'][:2], [{'id': 'voiceAAAA1111', 'name': 'Synthetic Ada'}, {'id': 'voiceCCCC3333', 'name': 'N' * SPEECH['nameCharacters']}])
        self.assertEqual(len(answer['voices']), SPEECH['voices'], 'the list is bounded')
        self.assertTrue(all(set(v) == {'id', 'name'} and re.fullmatch(SPEECH['voicePattern'], v['id']) for v in answer['voices']))
        method, path, sent, _ = Voices.seen[0]
        self.assertEqual((method, path, sent.get('xi-api-key')), ('GET', '/v2/voices?page_size=100', self.KEY))
        Voices.seen.clear()
        status, answer = self.voices_of('fish')
        self.assertEqual((status, answer), (200, {'voices': [{'id': 'a1b2c3d4e5f60718293a4b5c6d7e8f90', 'name': 'Synthetic Bo'}]}))
        method, path, sent, _ = Voices.seen[0]
        self.assertEqual((method, path, sent.get('authorization')), ('GET', '/model?self=true&page_size=100', 'Bearer ' + self.KEY))

    def test_a_providers_licensed_voices_are_one_fixed_page_and_only_where_the_rules_name_one(self):
        self.assertEqual(SPEECH['providers']['fish']['library'], '/model?licensed=true&language=en&page_size=100')
        self.assertNotIn('library', SPEECH['providers']['elevenlabs'])
        ask = {'provider': 'fish', 'key': self.KEY, 'library': True}
        status, headers, data = self.call('POST', SPEECH['voicesPath'], token=TOKEN, body=ask, timeout=30)
        self.assert_contract_headers(headers, 'library')
        self.assertEqual((status, json.loads(data)), (200, {'voices': [{'id': 'c1b2c3d4e5f60718293a4b5c6d7e8f90', 'name': 'Synthetic Narrator'}]}),
                         'ids and names only, and only voices that are ready')
        self.assertEqual(len(Voices.seen), 1, 'one request to the provider')
        method, path, sent, _ = Voices.seen[0]
        self.assertEqual((method, path, sent.get('authorization')), ('GET', SPEECH['providers']['fish']['library'], 'Bearer ' + self.KEY))
        Voices.seen.clear()
        for body in ({**ask, 'library': False}, {**ask, 'library': 1}, {**ask, 'library': 'true'}, {**ask, 'library': '/model?self=false'},
                     {**ask, 'provider': 'elevenlabs'}, {**ask, 'page': 2}, {**ask, 'language': 'ja'}):
            status, _, data = self.call('POST', SPEECH['voicesPath'], token=TOKEN, body=body)
            self.assertEqual((status, json.loads(data)), (400, {'error': 'Invalid speech request.'}), repr(body)[:80])
        status, _, data = self.call('POST', SPEECH['path'], token=TOKEN, body={'provider': 'fish', 'key': self.KEY, 'voice': 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
                                                                              'text': 'Hello.', 'library': True})
        self.assertEqual(status, 400, 'a library is only ever listed')
        self.assertEqual(Voices.seen, [], 'nothing malformed reached a provider')

    def test_every_malformed_speech_request_is_refused_before_any_provider(self):
        good = {'provider': 'elevenlabs', 'key': self.KEY, 'voice': 'voiceAAAA1111', 'text': 'Hello.'}
        bad = [[], 'text', None, {}, {**good, 'model': 'x'}, {**good, 'url': 'https://evil.example/'}, {**good, 'host': 'evil.example'},
               {k: v for k, v in good.items() if k != 'voice'}]
        bad += [{**good, 'provider': p} for p in ('', 'openai', 'ELEVENLABS', 'elevenlabs ', 'api.elevenlabs.io', 7, None, ['elevenlabs'])]
        bad += [{**good, 'key': k} for k in ('', 'short', 'k' * 201, self.KEY + ' x', self.KEY + '\r\nX-Injected: 1', self.KEY + '\n', 'Bearer ' + self.KEY, 7, None)]
        bad += [{**good, 'voice': v} for v in ('', 'short', 'v' * 65, '../../v1/user', 'voiceAAAA1111/stream', 'voiceAAAA1111?x=1', 'voice AAAA1111',
                                                'voiceAAAA1111\r\n', 'voice%2F..%2Fuser', 7, None)]
        bad += [{**good, 'text': t} for t in ('', '   \n', 'a' * (SPEECH['textCharacters'] + 1), 'bell \u0007', 'nul \u0000', 'del \u007f', 7, None, ['Hello.'])]
        for body in bad:
            status, _, data = self.call('POST', SPEECH['path'], token=TOKEN, body=body)
            self.assertEqual((status, json.loads(data)), (400, {'error': 'Invalid speech request.'}), repr(body)[:80])
        for body in ({}, {'provider': 'elevenlabs'}, {'provider': 'fish', 'key': self.KEY, 'voice': 'voiceAAAA1111'}, {'provider': 'other', 'key': self.KEY},
                     {'provider': 'elevenlabs', 'key': 'short'}, {'provider': 'elevenlabs', 'key': self.KEY, 'page_size': 5}):
            status, _, data = self.call('POST', SPEECH['voicesPath'], token=TOKEN, body=body)
            self.assertEqual((status, json.loads(data)), (400, {'error': 'Invalid speech request.'}), repr(body)[:80])
        self.assertEqual(Voices.seen, [], 'nothing reached a provider')

    def test_a_provider_failure_is_reported_by_kind_and_none_of_its_words_are_passed_on(self):
        expected = {'fail0401': 'key', 'fail0403': 'key', 'fail0402': 'credit', 'fail0429': 'busy', 'fail0400': 'voice', 'fail0404': 'voice',
                    'fail0422': 'voice', 'fail0500': 'failed', 'fail0503': 'failed', 'fail0204': 'failed', 'redirect1': 'failed', 'wrongtype': 'failed',
                    'toolarge1': 'failed', 'gzipped01': 'failed', 'emptybody': 'failed'}
        for voice, reason in expected.items():
            for provider in ('elevenlabs', 'fish'):
                Voices.seen.clear()
                status, _, data = self.speak(provider=provider, voice=voice)
                answer = json.loads(data)
                self.assertEqual((status, set(answer), answer.get('reason')), (502, {'error', 'reason'}, reason), provider + ' ' + voice)
                self.assertNotIn(b'SYNTHETIC', data, 'the provider\u2019s words stay out')
                self.assertNotIn(self.KEY.encode(), data)
                self.assertEqual(len(Voices.seen), 1, voice + ': one try, no retry and nothing followed')
        for key, reason in (('fail0401' + 'k' * 12, 'key'), ('fail0429' + 'k' * 12, 'busy'), ('notjson01' + 'k' * 12, 'failed'), ('biglist01' + 'k' * 12, 'failed'),
                            ('wrongtype' + 'k' * 12, 'failed'), ('redirect1' + 'k' * 12, 'failed')):
            status, answer = self.voices_of('elevenlabs', key)
            self.assertEqual((status, set(answer), answer.get('reason')), (502, {'error', 'reason'}, reason), key[:9])
            self.assertNotIn('SYNTHETIC', json.dumps(answer))
        self.assertEqual(self.speak()[0], 200, 'and speech is free again afterwards')

    def test_one_voice_request_runs_at_a_time(self):
        results = []
        slow = threading.Thread(target=lambda: results.append(self.speak(voice='slowslow1')[0]))
        slow.start()
        deadline = time.monotonic() + 10
        while not Voices.seen and time.monotonic() < deadline:
            time.sleep(0.02)
        try:
            status, _, data = self.speak()
            self.assertEqual((status, set(json.loads(data))), (429, {'error'}))
            self.assertEqual(self.voices_of('elevenlabs')[0], 429, 'listing shares the one slot')
            self.assertEqual(len(Voices.seen), 1)
        finally:
            Voices.release.set()
            slow.join(30)
        self.assertEqual(results, [200])
        self.assertEqual(self.speak()[0], 200)

    def test_speech_needs_the_token_and_is_not_a_way_around_the_other_checks(self):
        good = {'provider': 'elevenlabs', 'key': self.KEY, 'voice': 'voiceAAAA1111', 'text': 'Hello.'}
        for path, body in ((SPEECH['path'], good), (SPEECH['voicesPath'], {'provider': 'elevenlabs', 'key': self.KEY})):
            self.assertEqual(self.call('POST', path, body=body)[0], 401)
            self.assertEqual(self.call('POST', path, token=self.KEY, body=body)[0], 401, 'a provider key is not the connection token')
            self.assertEqual(self.call('POST', path + '?token=' + TOKEN, body=body)[0], 401)
            self.assertEqual(self.call('POST', path, token=TOKEN, body=body, headers={'Origin': 'https://evil.example'})[0], 403)
            self.assertEqual(self.call('POST', path, token=TOKEN, body=body, headers={'Host': 'evil.example'})[0], 403)
            self.assertIn(self.call('GET', path, token=TOKEN)[0], (404, 405))
            for other in (path + '/', path + '/x', '/' + path, '/api' + path[3:]):
                self.assertIn(self.call('POST', other, token=TOKEN, body=body)[0], (401, 404), other)
        self.assertEqual(Voices.seen, [], 'nothing reached a provider')

    # --- web search with the owner's own key --------------------------------------------------

    def search(self, timeout=30, **fields):
        body = {'provider': 'brave', 'key': self.KEY, 'query': 'tide tables', **fields}
        status, headers, data = self.call('POST', SEARCH['path'], token=TOKEN, body=body, timeout=timeout)
        self.assert_contract_headers(headers, 'search ' + str(status))
        return status, json.loads(data)

    def test_search_sends_one_fixed_request_with_the_owners_key_and_returns_the_answer_as_text(self):
        asked = 'Zo\u00eb & \u201ctide tables\u201d? 100% #1/2'
        status, answer = self.search(query=asked)
        self.assertEqual((status, answer), (200, {'outcome': 'results', 'provider': 'brave', 'text': Voices.FOUND.decode()}))
        self.assertEqual(len(Voices.seen), 1, 'one request to the provider')
        method, path, sent, body = Voices.seen[0]
        fixed = SEARCH['providers']['brave']['path']
        self.assertEqual((method, path, body), ('GET', fixed.replace('{query}', 'Zo%C3%AB%20%26%20%E2%80%9Ctide%20tables%E2%80%9D%3F%20100%25%20%231%2F2'), b''))
        self.assertEqual(sent.get('x-subscription-token'), self.KEY)
        self.assertEqual(sent.get('user-agent'), SEARCH['userAgent'])
        self.assertEqual(sent.get('accept-encoding'), 'identity')
        for private in ('authorization', 'cookie', 'origin', 'referer', 'x-bb-api-key'):
            self.assertNotIn(private, sent, 'nothing of the owner\u2019s gateway session, and no other key, is passed on')
        self.assertNotIn(TOKEN, json.dumps(sent))

        Voices.seen.clear()
        status, answer = self.search(provider='browserbase', query=asked)
        self.assertEqual((status, answer), (200, {'outcome': 'results', 'provider': 'browserbase', 'text': Voices.FOUND.decode()}))
        method, path, sent, body = Voices.seen[0]
        self.assertEqual((method, path), ('POST', '/v1/search'))
        self.assertEqual(sent.get('x-bb-api-key'), self.KEY)
        self.assertEqual(sent.get('content-type'), 'application/json')
        self.assertNotIn('x-subscription-token', sent)
        self.assertNotIn('authorization', sent)
        self.assertEqual(json.loads(body), {**SEARCH['providers']['browserbase']['body'], 'query': asked})
        self.assertNotIn(TOKEN, json.dumps(sent) + body.decode())
        self.assertEqual(self.search(query='\U0001F331' * SEARCH['queryCharacters'])[0], 200, 'the limit counts characters')

    def test_every_malformed_search_request_is_refused_before_any_provider(self):
        good = {'provider': 'brave', 'key': self.KEY, 'query': 'tide tables'}
        bad = [{**good, 'provider': 'elevenlabs'}, {**good, 'provider': 'Brave'}, {**good, 'provider': 7}, {**good, 'key': 'short'}, {**good, 'key': self.KEY + ' '},
               {**good, 'key': None}, {**good, 'query': ''}, {**good, 'query': '   '}, {**good, 'query': ' padded'}, {**good, 'query': 'two\nlines'},
               {**good, 'query': 'tab\there'}, {**good, 'query': 'x' * (SEARCH['queryCharacters'] + 1)}, {**good, 'query': 7}, {**good, 'query': ['tide']},
               {**good, 'host': 'evil.example'}, {**good, 'url': 'https://evil.example/'}, {**good, 'count': 50}, {'provider': 'brave', 'key': self.KEY}, [], 'tide', None]
        for body in bad:
            status, _, data = self.call('POST', SEARCH['path'], token=TOKEN, body=body)
            self.assertEqual((status, json.loads(data)), (400, {'error': 'Invalid search request.'}), json.dumps(body)[:80])
        self.assertEqual(Voices.seen, [], 'nothing reached a provider')

    def test_a_search_provider_that_fails_is_reported_in_the_gateways_own_words(self):
        for how, reason in (('fail0401', 'key'), ('fail0403', 'key'), ('fail0402', 'credit'), ('fail0429', 'busy'), ('fail0400', 'query'), ('fail0422', 'query'),
                            ('fail0500', 'failed'), ('fail0503', 'failed'), ('redirect1', 'failed'), ('wrongtype', 'failed'), ('gzipped01', 'failed'),
                            ('emptybody', 'failed'), ('bigsearch', 'failed')):
            for provider in SEARCH['providers']:
                Voices.seen.clear()
                status, answer = self.search(provider=provider, key=how + 'x' * 24)
                self.assertEqual((status, set(answer), answer.get('reason')), (502, {'error', 'reason'}, reason), how + ' ' + provider)
                self.assertNotIn('SYNTHETIC', json.dumps(answer), 'the provider\u2019s own words are not passed on')
                self.assertEqual(len(Voices.seen), 1, how + ': one request, no retry and no redirect followed')

    def test_search_shares_the_one_provider_slot_and_needs_the_token(self):
        results = []
        slow = threading.Thread(target=lambda: results.append(self.speak(voice='slowslow1')[0]))
        slow.start()
        deadline = time.monotonic() + 10
        while not Voices.seen and time.monotonic() < deadline:
            time.sleep(0.02)
        try:
            status, answer = self.search()
            self.assertEqual((status, set(answer)), (429, {'error'}))
            self.assertEqual(len(Voices.seen), 1)
        finally:
            Voices.release.set()
            slow.join(30)
        self.assertEqual(results, [200])
        Voices.seen.clear()
        good = {'provider': 'brave', 'key': self.KEY, 'query': 'tide tables'}
        path = SEARCH['path']
        self.assertEqual(self.call('POST', path, body=good)[0], 401)
        self.assertEqual(self.call('POST', path, token=self.KEY, body=good)[0], 401, 'a provider key is not the connection token')
        self.assertEqual(self.call('POST', path + '?token=' + TOKEN, body=good)[0], 401)
        self.assertEqual(self.call('POST', path, token=TOKEN, body=good, headers={'Origin': 'https://evil.example'})[0], 403)
        self.assertEqual(self.call('POST', path, token=TOKEN, body=good, headers={'Host': 'evil.example'})[0], 403)
        self.assertIn(self.call('GET', path, token=TOKEN)[0], (404, 405))
        for other in (path + '/', path + '/x', '/' + path, '/api' + path[3:]):
            self.assertIn(self.call('POST', other, token=TOKEN, body=good)[0], (401, 404), other)
        self.assertEqual(Voices.seen, [], 'nothing reached a provider')

    # --- updating the installed copy ---------------------------------------------------------

    def test_a_gateway_not_set_up_for_updates_can_be_asked_and_does_nothing(self):
        status, headers, body = self.call('GET', UPDATES['path'], token=TOKEN)
        self.assert_contract_headers(headers, 'update status')
        self.assertEqual((status, json.loads(body)), (200, {'available': False}), 'updating is off unless the operator turned it on at start')
        for good in ({'action': 'check'}, {'action': 'apply', 'commit': 'a' * 40}):
            status, headers, body = self.call('POST', UPDATES['path'], token=TOKEN, body=good)
            self.assert_contract_headers(headers, 'update refusal')
            self.assertEqual((status, json.loads(body)), (409, {'error': UPDATES['unavailable']}), str(good))
        bad = [[], 'text', {}, {'action': 'install'}, {'action': 'check', 'commit': 'a' * 40}, {'action': 'apply'}, {'action': 'apply', 'commit': 'main'},
               {'action': 'apply', 'commit': 'A' * 40}, {'action': 'apply', 'commit': 'a' * 39}, {'action': 'apply', 'commit': 'a' * 40, 'channel': 'development'},
               {'action': 'apply', 'commit': 'a' * 40, 'checkout': '/tmp/x'}, {'action': 'apply', 'commit': 'a' * 40, 'url': 'https://evil.example/'},
               {'action': 'rollback'}, {'action': ['check']}, {'action': 'check', 'label': 'x'}]
        for body in bad:
            status, _, data = self.call('POST', UPDATES['path'], token=TOKEN, body=body)
            self.assertEqual((status, json.loads(data)), (400, {'error': 'Invalid update request.'}), repr(body)[:80])

    def test_updates_need_the_token_and_the_same_origin_checks(self):
        check = {'action': 'check'}
        self.assertEqual(self.call('GET', UPDATES['path'])[0], 401)
        self.assertEqual(self.call('GET', UPDATES['path'] + '?token=' + TOKEN)[0], 401)
        self.assertEqual(self.call('POST', UPDATES['path'], body=check)[0], 401)
        self.assertEqual(self.call('POST', UPDATES['path'], token='x' * 43, body=check)[0], 401)
        self.assertEqual(self.call('POST', UPDATES['path'], token=TOKEN, body=check, headers={'Origin': 'https://evil.example'})[0], 403)
        self.assertEqual(self.call('GET', UPDATES['path'], token=TOKEN, headers={'Host': 'evil.example'})[0], 403)
        for other in (UPDATES['path'] + '/', UPDATES['path'] + '/apply', '/api/update', '/v1/updates', '/v1/install'):
            self.assertIn(self.call('POST', other, token=TOKEN, body=check)[0], (401, 404), other)

    # --- the owner's project engine -------------------------------------------------------------

    def project(self, body, **more):
        status, headers, data = self.call('POST', PROJECTS['path'], token=TOKEN, body=body, **more)
        return status, headers, json.loads(data)

    DRAFT = {'action': 'draft', 'type': 'local-website', 'title': 'Synthetic garden site', 'brief': 'A small synthetic site about peas.'}

    def test_a_project_request_is_one_fixed_post_with_the_engines_credential_and_nothing_of_the_pages(self):
        status, headers, body = self.call('GET', PROJECTS['path'], token=TOKEN)
        self.assert_contract_headers(headers, 'projects status')
        self.assertEqual((status, json.loads(body)), (200, {'available': True}))
        self.assertEqual(Engine.seen, [], 'asking whether it is connected contacts nothing')

        status, headers, answer = self.project({'action': 'types'}, headers={'Cookie': 'session=synthetic', 'Referer': self.origin + '/', 'Origin': self.origin})
        self.assert_contract_headers(headers, 'projects answer')
        self.assertEqual((status, answer), (200, {'result': {'types': [{'id': 'local-website', 'label': 'Local website'}, {'id': 'other', 'label': 'Other'}]}}))
        self.assertEqual(len(Engine.seen), 1, 'one request to the engine')
        method, path, sent, raw = Engine.seen[0]
        self.assertEqual((method, path), ('POST', PROJECTS['upstreamPath']))
        self.assertEqual(sent.get('authorization'), 'Bearer ' + ENGINE_TOKEN)
        self.assertEqual(sent.get('content-type'), 'application/json')
        self.assertEqual(sent.get('user-agent'), PROJECTS['userAgent'])
        for private in ('cookie', 'origin', 'referer', 'forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto'):
            self.assertNotIn(private, sent, 'the engine accepts only a direct local request')
        self.assertNotIn(TOKEN, json.dumps(sent) + raw.decode(), 'the connection token stays with the gateway')
        self.assertEqual(json.loads(raw), {'action': 'types'})
        self.assertNotIn(ENGINE_TOKEN, json.dumps(answer) + json.dumps(headers), 'the engine credential never reaches the page')

        for body in ({'action': 'list'}, {'action': 'get', 'project': 7}, {'action': 'get', 'project': PROJECTS['projectMax']}, self.DRAFT,
                     {**self.DRAFT, 'constraints': ''}, {**self.DRAFT, 'constraints': 'No paid models.\nZo\u00eb \U0001F331'},
                     {**self.DRAFT, 'title': '\U0001F331' * PROJECTS['titleCharacters'], 'brief': 'x' * PROJECTS['briefCharacters'], 'constraints': 'y' * PROJECTS['constraintsCharacters']}):
            Engine.seen.clear()
            status, _, answer = self.project(body)
            self.assertEqual((status, answer), (200, {'result': {'echo': body}}), str(body)[:60])
            self.assertEqual(json.loads(Engine.seen[0][3]), body, 'exactly what was checked is sent, nothing added')
        status, _, answer = self.project({'action': 'status', 'project': 3})
        self.assertEqual((status, answer['result']['stories'][0]), (200, {'title': 'Synthetic story', 'agent': 'claude', 'model': 'synthetic-model', 'seconds': 42, 'cost': 0.25}))

    def test_every_malformed_project_request_is_refused_before_the_engine(self):
        d = self.DRAFT
        bad = [[], 'text', {}, {'action': 'start'}, {'action': 'approve', 'project': 1}, {'action': 'plan', 'project': 1}, {'action': 'pause_dispatch', 'project': 1},
               {'action': 'intake', 'title': 'x', 'brief': 'y'}, {'action': ['types']}, {'action': 'types', 'project': 1}, {'action': 'list', 'limit': 5},
               {'action': 'get'}, {'action': 'get', 'project': '7'}, {'action': 'get', 'project': 0}, {'action': 'get', 'project': -1}, {'action': 'get', 'project': 1.5},
               {'action': 'get', 'project': True}, {'action': 'get', 'project': PROJECTS['projectMax'] + 1}, {'action': 'status', 'project': 1, 'run': 2},
               {k: v for k, v in d.items() if k != 'type'}, {k: v for k, v in d.items() if k != 'title'}, {k: v for k, v in d.items() if k != 'brief'},
               {**d, 'type': 'Local Website'}, {**d, 'type': '../other'}, {**d, 'type': 'x' * 41}, {**d, 'type': 7}, {**d, 'title': ''}, {**d, 'title': '   '},
               {**d, 'title': 'x' * (PROJECTS['titleCharacters'] + 1)}, {**d, 'title': 7}, {**d, 'brief': ' \n'}, {**d, 'brief': 'x' * (PROJECTS['briefCharacters'] + 1)},
               {**d, 'constraints': 'x' * (PROJECTS['constraintsCharacters'] + 1)}, {**d, 'constraints': None},
               {**d, 'working_dir': '/tmp/x'}, {**d, 'request_planning': True}, {**d, 'url': 'http://127.0.0.1:1/'}, {**d, 'token': 'x' * 64},
               {**d, 'path': '/api/projects'}, {**d, 'agent': 'claude'}, {**d, 'model': 'x'}, {**d, 'project': 1}]
        for body in bad:
            status, _, answer = self.project(body)
            self.assertEqual((status, answer), (400, {'error': 'Invalid project request.'}), repr(body)[:80])
        status, _, data = self.call('POST', PROJECTS['path'], token=TOKEN, body=b'{"action":"types","action":"list"}', headers={'Content-Type': 'application/json'})
        self.assertEqual(status, 400, 'a repeated key')
        status, _, data = self.call('POST', PROJECTS['path'], token=TOKEN, body=b'{"action":"types"}', headers={'Content-Type': 'text/plain'})
        self.assertEqual(status, 400)
        self.assertEqual(Engine.seen, [], 'nothing reached the engine')

    def test_an_engine_failure_is_reported_by_kind_and_none_of_its_words_are_passed_on(self):
        expected = {'fail401': 'refused', 'fail403': 'refused', 'fail400': 'declined', 'fail404': 'declined', 'fail409': 'declined', 'fail422': 'declined',
                    'fail500': 'failed', 'fail503': 'failed', 'fail204': 'failed', 'fail201': 'failed', 'redirect': 'failed', 'wrongtype': 'failed', 'notjson': 'failed',
                    'list': 'failed', 'repeated': 'failed', 'toolarge': 'failed', 'gzipped': 'failed'}
        for title, reason in expected.items():
            Engine.seen.clear()
            status, headers, data = self.call('POST', PROJECTS['path'], token=TOKEN, body={**self.DRAFT, 'title': title})
            answer = json.loads(data)
            self.assert_contract_headers(headers, 'projects refusal')
            self.assertEqual((status, answer), (502, {'error': PROJECTS['refusals'][reason], 'reason': reason}), title)
            self.assertNotIn(b'SYNTHETIC', data, 'the engine\u2019s words stay out')
            self.assertNotIn(ENGINE_TOKEN.encode(), data)
            self.assertEqual(len(Engine.seen), 1, title + ': one try, no retry and nothing followed')
        self.assertEqual(self.project({'action': 'list'})[0], 200, 'and projects are free again afterwards')

    def test_the_engines_credential_is_read_each_time_from_a_private_file(self):
        other = secrets.token_urlsafe(48)
        self.write_engine_token(other)
        status, _, answer = self.project({'action': 'list'})
        self.assertEqual((status, answer.get('reason')), (502, 'refused'), 'a replaced credential is the one sent')
        self.assertEqual(Engine.seen[0][2].get('authorization'), 'Bearer ' + other)
        for text, mode, why in (('short', 0o600, 'not a credential'), (ENGINE_TOKEN + '\nsecond', 0o600, 'two lines'), (ENGINE_TOKEN, 0o644, 'readable by others'),
                                (ENGINE_TOKEN, 0o660, 'writable by the group')):
            Engine.seen.clear()
            self.write_engine_token(text, mode)
            self.assertEqual(json.loads(self.call('GET', PROJECTS['path'], token=TOKEN)[2]), {'available': False}, why)
            status, _, answer = self.project({'action': 'list'})
            self.assertEqual((status, answer), (409, {'error': PROJECTS['unavailable']}), why)
            self.assertEqual(Engine.seen, [], why + ': nothing is sent')
        # A link is not followed, and a missing file ends the access at once.
        target = Path(self.folder.name) / 'elsewhere'
        target.write_text(ENGINE_TOKEN + '\n'); os.chmod(target, 0o600)
        self.engine_token_file.unlink(); os.symlink(target, self.engine_token_file)
        self.assertEqual(self.project({'action': 'list'})[0], 409, 'a link')
        self.engine_token_file.unlink(); target.unlink()
        self.assertEqual(self.project({'action': 'list'})[0], 409, 'no file')
        self.assertEqual(Engine.seen, [])
        self.write_engine_token(ENGINE_TOKEN)
        self.assertEqual(self.project({'action': 'list'})[0], 200, 'and it works again when the file is back')

    def test_one_project_request_runs_at_a_time(self):
        results = []
        slow = threading.Thread(target=lambda: results.append(self.project({**self.DRAFT, 'title': 'slow'})[0]))
        slow.start()
        deadline = time.monotonic() + 10
        while not Engine.seen and time.monotonic() < deadline:
            time.sleep(0.02)
        try:
            status, _, answer = self.project({'action': 'list'})
            self.assertEqual((status, set(answer)), (429, {'error'}))
            self.assertEqual(len(Engine.seen), 1)
        finally:
            Engine.release.set()
            slow.join(30)
        self.assertEqual(results, [200])
        self.assertEqual(self.project({'action': 'list'})[0], 200)

    def test_projects_need_the_token_and_are_not_a_way_around_the_other_checks(self):
        ask = {'action': 'list'}
        path = PROJECTS['path']
        self.assertEqual(self.call('GET', path)[0], 401)
        self.assertEqual(self.call('GET', path + '?token=' + TOKEN)[0], 401)
        self.assertEqual(self.call('POST', path, body=ask)[0], 401)
        self.assertEqual(self.call('POST', path, token=ENGINE_TOKEN, body=ask)[0], 401, 'the engine credential is not the connection token')
        self.assertEqual(self.call('POST', path, token=TOKEN, body=ask, headers={'Origin': 'https://evil.example'})[0], 403)
        self.assertEqual(self.call('POST', path, token=TOKEN, body=ask, headers={'Host': 'evil.example'})[0], 403)
        self.assertEqual(self.call('GET', path, token=TOKEN, headers={'Host': 'evil.example'})[0], 403)
        for other in (path + '/', path + '/7', path + '/approve', '/api/pea-projects', '/api/hermes-projects', '/api/projects', '/v1/project'):
            self.assertIn(self.call('POST', other, token=TOKEN, body=ask)[0], (401, 404), other)
            self.assertIn(self.call('GET', other, token=TOKEN)[0], (401, 404), other)
        self.assertEqual(Engine.seen, [], 'nothing reached the engine')

    def test_a_gateway_not_connected_to_an_engine_can_be_asked_and_contacts_nothing(self):
        port = free_port()
        process = subprocess.Popen(self.command(port), stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        try:
            self.wait_for(process, port)
            def ask(method, body=None):
                connection = http.client.HTTPConnection('127.0.0.1', port, timeout=10)
                try:
                    connection.request(method, PROJECTS['path'], body=json.dumps(body).encode() if body else None,
                                       headers={'Authorization': 'Bearer ' + TOKEN, **({'Content-Type': 'application/json'} if body else {})})
                    response = connection.getresponse()
                    return response.status, json.loads(response.read())
                finally:
                    connection.close()
            self.assertEqual(ask('GET'), (200, {'available': False}), 'projects are off unless the operator connected an engine at start')
            for good in ({'action': 'types'}, {'action': 'status', 'project': 1}, self.DRAFT):
                self.assertEqual(ask('POST', good), (409, {'error': PROJECTS['unavailable']}), str(good)[:40])
            self.assertEqual(ask('POST', {'action': 'start'}), (400, {'error': 'Invalid project request.'}), 'and it checks a request the same way')
        finally:
            process.terminate()
            try:
                process.wait(5)
            except subprocess.TimeoutExpired:
                process.kill()
            process.stderr.close()
        self.assertEqual(Engine.seen, [])
        # The engine address is the operator's: plain HTTP only to this machine, HTTPS to a named host, and nothing more in it.
        for url in ('http://192.0.2.1:8800', 'http://engine.pea-conformance.example:8800', 'http://127.0.0.1:8800/api', 'http://user@127.0.0.1:8800',
                    'http://127.0.0.1:8800?x=1', 'https://engine.pea-conformance.example/api', 'https://user:pass@engine.pea-conformance.example',
                    'https://engine.pea-conformance.example:9443#x', 'https://engine_bad.example', 'https://single', 'ftp://127.0.0.1:8800', 'engine.pea-conformance.example:9443'):
            refused = subprocess.run([*self.command(free_port()), '--projects-url', url, '--projects-token-file', str(self.engine_token_file)],
                                     stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=20)
            self.assertNotEqual(refused.returncode, 0, url)
        alone = subprocess.run([*self.command(free_port()), '--projects-url', f'http://127.0.0.1:{self.engine.server_port}'], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=20)
        self.assertNotEqual(alone.returncode, 0, 'an address without a credential file')

    def test_an_engine_on_another_machine_is_asked_the_same_way_over_https(self):
        """RCD on the owner's private network: an https address with a name. The stand-in is plain HTTP on this machine."""
        port = free_port()
        process = subprocess.Popen([*self.command(port), '--projects-url', 'https://engine.pea-conformance.example:9443',
                                    '--projects-test-host', f'engine.pea-conformance.example={self.engine.server_port}',
                                    '--projects-token-file', str(self.engine_token_file)], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        try:
            self.wait_for(process, port)
            def ask(body):
                connection = http.client.HTTPConnection('127.0.0.1', port, timeout=10)
                try:
                    connection.request('POST', PROJECTS['path'], body=json.dumps(body).encode(), headers={'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json'})
                    response = connection.getresponse()
                    return response.status, json.loads(response.read())
                finally:
                    connection.close()
            self.assertEqual(ask(self.DRAFT), (200, {'result': {'echo': self.DRAFT}}))
            method, path, sent, raw = Engine.seen[0]
            self.assertEqual((method, path, json.loads(raw)), ('POST', PROJECTS['upstreamPath'], self.DRAFT))
            self.assertEqual(sent.get('authorization'), 'Bearer ' + ENGINE_TOKEN)
            for private in ('cookie', 'origin', 'referer', 'forwarded', 'x-forwarded-for'):
                self.assertNotIn(private, sent)
            self.assertEqual(ask({**self.DRAFT, 'title': 'fail403'}), (502, {'error': PROJECTS['refusals']['refused'], 'reason': 'refused'}))
            self.assertEqual(ask({**self.DRAFT, 'title': 'redirect'})[1].get('reason'), 'failed')
            self.assertEqual(ask({'action': 'start'}), (400, {'error': 'Invalid project request.'}))
        finally:
            process.terminate()
            try:
                process.wait(5)
            except subprocess.TimeoutExpired:
                process.kill()
            process.stderr.close()

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
