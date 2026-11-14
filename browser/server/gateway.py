#!/usr/bin/env python3
"""Customer-owned static PEA UI and authenticated, bounded local-model gateway.
No keys in URLs/cookies, chat storage, arbitrary proxy, tools, or cloud fallback.
"""
import argparse
import hashlib
import hmac
import http.client
import ipaddress
import json
import mimetypes
import os
from pathlib import Path
import re
import secrets
import socket
import stat
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
from build_identity import build_identity

ROOT = Path(__file__).resolve().parents[1]
MAX_REQUEST = 128_000
MODEL_ID = re.compile(r'[A-Za-z0-9._:/@+\-]{1,100}\Z')
ASSETS = {'index.html', 'styles.css', 'app.mjs', 'policy.mjs', 'connections.mjs',
          'live-ui.mjs', 'taskboard.mjs', 'board-ui.mjs', 'local-model.mjs',
          'voice.mjs', 'shared-config.mjs', 'actions.mjs', 'presence.mjs', 'memory.mjs', 'memory-ui.mjs', 'release.json', 'build-info.json', 'CHANGELOG.md', 'releases.mjs', 'release-ui.mjs', 'assets/pea-icon.svg', 'assets/pea-mascot.svg'}
CSP = ("default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; "
       "style-src 'self' https://accounts.google.com/gsi/style; img-src 'self' blob:; "
       "connect-src 'self' https://openrouter.ai https://api.github.com https://accounts.google.com "
       "https://www.googleapis.com https://docs.googleapis.com https://forms.googleapis.com; "
       "frame-src https://accounts.google.com; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")


BUILD_INFO_TTL = 60
# Seconds a client has to deliver a complete request. The per-read socket timeout alone lets a trickling client hold one of the eight slots.
REQUEST_DEADLINE = 20


def upstream_url(value):
    u = urlsplit(value)
    if u.scheme != 'http' or u.username or u.password or u.query or u.fragment or u.path not in ('', '/', '/v1', '/v1/'):
        raise ValueError('Upstream must be a loopback HTTP OpenAI-compatible base URL.')
    host = '127.0.0.1' if u.hostname == 'localhost' else u.hostname
    try:
        if not ipaddress.ip_address(host).is_loopback or not 1 <= (u.port or 80) <= 65535:
            raise ValueError()
    except (ValueError, TypeError):
        raise ValueError('Upstream must be a loopback IP; remote/cloud proxying is disabled.') from None
    return host, u.port or 80


def read_token(path):
    p = Path(path).expanduser()
    info = p.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or info.st_uid != os.getuid():
        raise ValueError('Token file must be owned by this user, regular, and mode 0600.')
    token = p.read_text().strip()
    if not re.fullmatch(r'[A-Za-z0-9_-]{32,128}', token):
        raise ValueError('Use a random token of 32–128 URL-safe characters.')
    return token


def validate_chat(raw):
    if not isinstance(raw, dict) or set(raw) - {'model', 'messages', 'stream', 'max_tokens', 'temperature'}:
        raise ValueError('Only text chat is supported; tools and provider overrides are disabled.')
    if not isinstance(raw.get('model'), str) or not MODEL_ID.fullmatch(raw['model']) or raw.get('stream') is not True:
        raise ValueError('Choose a listed model and streaming text response.')
    rows = raw.get('messages')
    if not isinstance(rows, list) or not 1 <= len(rows) <= 64:
        raise ValueError('Bounded text messages are required.')
    total = 0
    for row in rows:
        if not isinstance(row, dict) or set(row) != {'role', 'content'} or row['role'] not in ('system', 'user', 'assistant') or not isinstance(row['content'], str):
            raise ValueError('Only plain text system/user/assistant messages are supported.')
        total += len(row['content'])
    limit = raw.get('max_tokens', 384)
    if total > 64_000 or type(limit) is not int or not 1 <= limit <= 4096:
        raise ValueError('Message or output limit exceeded.')
    temperature = raw.get('temperature', 0.7)
    if type(temperature) not in (int, float) or not 0 <= temperature <= 2:
        raise ValueError('Invalid temperature.')
    return {**raw, 'max_tokens': limit, 'temperature': temperature}


class Gateway(ThreadingHTTPServer):
    daemon_threads = True
    def __init__(self, address, *, token, upstream, public_origin=None):
        super().__init__(address, Handler)
        self.client_slots = threading.BoundedSemaphore(8)
        self.token_digest = hashlib.sha256(token.encode()).digest()
        self.upstream = upstream_url(upstream)
        self.model_lock = threading.BoundedSemaphore(2)
        self.models = set()
        self.models_at = 0
        self.identity, self.identity_at, self.identity_lock = None, 0, threading.Lock()
        self.origins = {f'http://127.0.0.1:{self.server_port}', f'http://localhost:{self.server_port}', f'http://[::1]:{self.server_port}'}
        if public_origin:
            u = urlsplit(public_origin)
            if u.scheme != 'https' or not u.hostname or u.username or u.password or u.path not in ('', '/') or u.query or u.fragment:
                raise ValueError('Public origin must be an exact HTTPS origin behind your private VPN/TLS proxy.')
            self.origins.add(public_origin.rstrip('/'))
        self.hosts = {urlsplit(o).netloc for o in self.origins}

    def process_request(self, request, client_address):
        if not self.client_slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.client_slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.client_slots.release()

    def handle_error(self, request, client_address):
        # A client that disconnects or is cut off at the deadline is routine; other failures keep their traceback.
        if not isinstance(sys.exc_info()[1], OSError):
            super().handle_error(request, client_address)

    def build_info(self):
        # Unauthenticated endpoint: computing identity runs git or re-hashes program files, so do it at most once a minute.
        with self.identity_lock:
            if self.identity is None or time.monotonic() - self.identity_at > BUILD_INFO_TTL:
                self.identity, self.identity_at = build_identity(ROOT), time.monotonic()
            return self.identity

    def upstream_call(self, method, path, body=None):
        connection = http.client.HTTPConnection(*self.upstream, timeout=45)
        try:
            connection.request(method, '/v1/' + path, body=body,
                               headers={'Content-Type': 'application/json', 'Accept': 'text/event-stream' if method == 'POST' else 'application/json'})
            return connection, connection.getresponse()
        except Exception:
            connection.close()
            raise


class Handler(BaseHTTPRequestHandler):
    server_version = 'PEA'
    sys_version = ''
    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def handle_one_request(self):
        self.read_timer = threading.Timer(REQUEST_DEADLINE, self.expire)
        self.read_timer.daemon = True
        self.read_timer.start()
        try:
            super().handle_one_request()
        finally:
            self.read_timer.cancel()

    def expire(self):
        try:
            self.connection.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass

    def log_message(self, *_args):
        pass  # No request URLs, authorization, upstream errors or conversation logs.

    def reply(self, code, payload, content_type='application/json'):
        data = json.dumps(payload).encode() if not isinstance(payload, bytes) else payload
        self.send_response(code)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
        # Google's sign-in popup must keep its opener; every other cross-origin window is detached.
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin-allow-popups')
        self.send_header('Content-Security-Policy', CSP)
        self.send_header('Permissions-Policy', 'camera=(), geolocation=(), microphone=(self)')
        self.end_headers()
        self.wfile.write(data)

    def boundary(self, auth=False):
        if self.headers.get('Host') not in self.server.hosts or self.headers.get('Origin') not in (None, *self.server.origins):
            self.reply(403, {'error': 'Origin or host rejected.'})
            return False
        if auth:
            value = self.headers.get('Authorization', '')
            digest = hashlib.sha256(value.removeprefix('Bearer ').encode()).digest()
            if not value.startswith('Bearer ') or not hmac.compare_digest(digest, self.server.token_digest):
                self.reply(401, {'error': 'Enter this server’s connection token.'})
                return False
        return True

    def do_GET(self):
        self.read_timer.cancel()
        if not self.boundary(auth=self.path.startswith('/v1/')):
            return
        if self.path == '/api/build-info':
            try:
                return self.reply(200, self.server.build_info())
            except (OSError, ValueError):
                return self.reply(503, {'error': 'Build identity unavailable.'})
        if self.path == '/v1/models':
            if not self.server.model_lock.acquire(blocking=False):
                return self.reply(429, {'error': 'Local model busy. No automatic retry.'})
            connection = None
            try:
                connection, response = self.server.upstream_call('GET', 'models')
                data = response.read(500_001)
                if response.status != 200 or len(data) > 500_000:
                    raise ValueError()
                rows = json.loads(data).get('data', [])
                ids = list(dict.fromkeys(r['id'] for r in rows if isinstance(r, dict) and isinstance(r.get('id'), str) and MODEL_ID.fullmatch(r['id'])))[:100]
                if not ids:
                    raise ValueError()
                self.server.models, self.server.models_at = set(ids), time.monotonic()
                self.reply(200, {'data': [{'id': name, 'object': 'model', 'owned_by': 'customer-local'} for name in ids]})
            except (OSError, ValueError, TypeError, AttributeError, http.client.HTTPException):
                self.reply(502, {'error': 'Local model server unavailable or invalid model list. No cloud fallback.'})
            finally:
                if connection:
                    connection.close()
                self.server.model_lock.release()
            return
        name = 'index.html' if self.path in ('/', '/browser/', '/browser') else self.path.removeprefix('/browser/').removeprefix('/')
        if name not in ASSETS:
            return self.reply(404, {'error': 'Not found.'})
        path = ROOT / name
        if any(p.is_symlink() for p in [path, *path.parents]) or not path.is_file():
            return self.reply(404, {'error': 'Not found.'})
        self.reply(200, path.read_bytes(), 'text/javascript' if name.endswith('.mjs') else mimetypes.guess_type(name)[0] or 'application/octet-stream')

    def do_POST(self):
        if not self.boundary(auth=True):
            return
        if self.path != '/v1/chat/completions':
            return self.reply(404, {'error': 'Only model listing and text chat are exposed.'})
        try:
            if self.headers.get('Content-Type', '').split(';')[0] != 'application/json' or self.headers.get('Transfer-Encoding'):
                raise ValueError()
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= MAX_REQUEST:
                raise ValueError()
            body = validate_chat(json.loads(self.rfile.read(length)))
            self.read_timer.cancel()
        except (ValueError, TypeError, RecursionError):
            return self.reply(400, {'error': 'Invalid or oversized text chat request.'})
        if body['model'] not in self.server.models or time.monotonic() - self.server.models_at > 3600:
            return self.reply(409, {'error': 'Refresh and choose a model listed by this server.'})
        if not self.server.model_lock.acquire(blocking=False):
            return self.reply(429, {'error': 'Local model busy. No automatic retry.'})
        connection = None
        started = False
        try:
            connection, response = self.server.upstream_call('POST', 'chat/completions', json.dumps(body).encode())
            if response.status != 200 or not response.getheader('Content-Type', '').startswith('text/event-stream'):
                self.reply(502, {'error': 'Local model rejected this request. No fallback.'})
                return
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Accel-Buffering', 'no')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            started = True
            total, deadline = 0, time.monotonic() + 180
            while time.monotonic() < deadline:
                chunk = response.read1(4096)
                if not chunk:
                    break
                total += len(chunk)
                if total > 2_000_000:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except (OSError, ValueError, http.client.HTTPException):
            if not started:
                self.reply(502, {'error': 'Local model unavailable. No cloud fallback.'})
        finally:
            if connection:
                connection.close()
            self.server.model_lock.release()
            self.close_connection = True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=18770)
    parser.add_argument('--upstream', default='http://127.0.0.1:11434')
    parser.add_argument('--token-file', required=True)
    parser.add_argument('--public-origin', help='Exact HTTPS origin of your own VPN/TLS reverse proxy; no public listener is opened.')
    parser.add_argument('--create-token', action='store_true', help='Create a new 0600 token file and exit; refuses overwrite.')
    args = parser.parse_args()
    if args.create_token:
        p = Path(args.token_file).expanduser()
        fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as stream:
            stream.write(secrets.token_urlsafe(32) + '\n')
        print('Created connection token file. Keep it private; enter it only in your own PEA clients.')
        return
    token = read_token(args.token_file)
    if not 1 <= args.port <= 65535:
        parser.error('Choose a valid port.')
    server = Gateway(('127.0.0.1', args.port), token=token, upstream=args.upstream, public_origin=args.public_origin)
    print(f'PEA customer-owned UI: http://127.0.0.1:{args.port}/browser/ · private VPN/TLS required for phone access')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
