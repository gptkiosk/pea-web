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
import ssl
import stat
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
from build_identity import build_identity

ROOT = Path(__file__).resolve().parents[1]
# Every rule a PEA gateway follows lives in contract.json beside this file: which files it serves, the
# headers on every answer, and every limit. The Mac app embeds the same file, so the two gateways
# cannot drift apart. Nothing below repeats a value from it.
CONTRACT = json.loads(Path(__file__).with_name('contract.json').read_text())
if CONTRACT.get('version') != 1:
    raise SystemExit('Unsupported gateway contract version.')
LIMITS = CONTRACT['limits']
MAX_REQUEST = LIMITS['requestBytes']
MODEL_ID = re.compile(LIMITS['modelIdPattern'] + r'\Z')
ASSETS = frozenset(CONTRACT['assets'])
HEADERS = tuple(CONTRACT['headers'].items())
CSP = CONTRACT['headers']['Content-Security-Policy']
BUILD_INFO_TTL = LIMITS['buildInfoSeconds']
# Seconds a client has to deliver a complete request. The per-read socket timeout alone lets a trickling client hold a connection slot.
REQUEST_DEADLINE = LIMITS['requestDeadlineSeconds']
# Connections served at once; more are closed unanswered. A browser opens six per page and keeps spare idle
# ones for up to the request deadline, so eight was too few for two tabs or a phone beside a desktop.
# Model requests have their own limit.
CLIENT_SLOTS = LIMITS['connections']


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
    if not re.fullmatch(LIMITS['tokenPattern'], token):
        raise ValueError('Use a random token of 32–128 URL-safe characters.')
    return token


def strict_json(data):
    """JSON as UTF-8 only, with no repeated keys and no NaN or Infinity, so both gateways read a body the same way."""
    def pairs(items):
        if len({key for key, _ in items}) != len(items):
            raise ValueError('Repeated key.')
        return dict(items)
    def constant(_name):
        raise ValueError('Not a number.')
    return json.loads(bytes(data).decode('utf-8'), object_pairs_hook=pairs, parse_constant=constant)


def validate_chat(raw):
    if not isinstance(raw, dict) or set(raw) - set(CONTRACT['chatFields']):
        raise ValueError('Only text chat is supported; tools and provider overrides are disabled.')
    if not isinstance(raw.get('model'), str) or not MODEL_ID.fullmatch(raw['model']) or raw.get('stream') is not True:
        raise ValueError('Choose a listed model and streaming text response.')
    rows = raw.get('messages')
    if not isinstance(rows, list) or not 1 <= len(rows) <= LIMITS['messages']:
        raise ValueError('Bounded text messages are required.')
    total = 0
    for row in rows:
        if not isinstance(row, dict) or set(row) != {'role', 'content'} or row['role'] not in CONTRACT['roles'] or not isinstance(row['content'], str):
            raise ValueError('Only plain text system/user/assistant messages are supported.')
        row['content'].encode('utf-8')  # half of a surrogate pair is not text; this raises ValueError
        total += len(row['content'])
    limit = raw.get('max_tokens', LIMITS['defaultMaxTokens'])
    if total > LIMITS['messageCharacters'] or type(limit) is not int or not 1 <= limit <= LIMITS['maxTokens']:
        raise ValueError('Message or output limit exceeded.')
    temperature = raw.get('temperature', LIMITS['defaultTemperature'])
    if type(temperature) not in (int, float) or not 0 <= temperature <= LIMITS['temperatureMax']:
        raise ValueError('Invalid temperature.')
    return {**raw, 'max_tokens': limit, 'temperature': temperature}


REMINDERS = CONTRACT['reminders']
REMINDER_ID = re.compile(REMINDERS['idPattern'] + r'\Z')


def validate_reminders(raw):
    """Checks a list of reminders: {"reminders":[{"id","title","due"}]}, due in milliseconds since 1970.

    This gateway cannot show notifications, so the list is checked and then dropped; nothing is kept or logged.
    """
    if not isinstance(raw, dict) or set(raw) != {'reminders'} or not isinstance(raw['reminders'], list) or len(raw['reminders']) > REMINDERS['items']:
        raise ValueError('A bounded list of reminders is required.')
    seen = set()
    for row in raw['reminders']:
        if not isinstance(row, dict) or set(row) != set(REMINDERS['fields']):
            raise ValueError('A reminder has an id, a title and a due time.')
        identity, title, due = row['id'], row['title'], row['due']
        if not isinstance(identity, str) or not REMINDER_ID.fullmatch(identity) or identity in seen:
            raise ValueError('Reminder ids must be simple and different.')
        seen.add(identity)
        if not isinstance(title, str) or not 1 <= len(title) <= REMINDERS['titleCharacters']:
            raise ValueError('A reminder title is one short line.')
        title.encode('utf-8')  # half of a surrogate pair is not text; this raises ValueError
        if any(ord(c) < 0x20 or 0x7F <= ord(c) <= 0x9F or ord(c) in (0x2028, 0x2029) for c in title):
            raise ValueError('A reminder title is one short line.')
        if type(due) is not int or not 1 <= due <= REMINDERS['dueMax']:
            raise ValueError('A reminder is due at a whole number of milliseconds.')
    return raw['reminders']


READER = CONTRACT['reader']
READER_NETWORKS = tuple(ipaddress.ip_network(n) for n in READER['refusedNetworks'])
READER_HOST = re.compile(r'(?=.{1,%d}\Z)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?\Z' % READER['hostCharacters'])


class ReaderRefusal(Exception):
    """A page that will not be read. `code` is the answer's status; `extra` is added to its JSON."""
    def __init__(self, code, message, **extra):
        super().__init__(message)
        self.code, self.message, self.extra = code, message, extra


def reader_target(url, allowed_names=()):
    """Splits an address the reader may ask for into (host, path). Anything else raises ValueError.

    Only https://name[:443]/path?query in printable ASCII: no user name, no other port, no fragment, no
    numeric address, and no name that is private by convention. `allowed_names` are test stand-ins.
    """
    if not isinstance(url, str) or not 12 <= len(url) <= READER['urlCharacters'] or not url.startswith('https://'):
        raise ValueError('Only an https:// address can be read.')
    if any(not 0x21 <= ord(c) <= 0x7E or c in '\\#' for c in url):
        raise ValueError('The address has a character that cannot be used.')
    rest = url[len('https://'):]
    cut = min((i for i in (rest.find('/'), rest.find('?')) if i >= 0), default=len(rest))
    authority, tail = rest[:cut], rest[cut:]
    if authority.endswith(':443'):
        authority = authority[:-4]
    host = authority.lower()
    if not READER_HOST.fullmatch(host):
        raise ValueError('Only a named public site on the usual port can be read.')
    if host not in allowed_names and host.rsplit('.', 1)[-1] in READER['refusedSuffixes']:
        raise ValueError('That name is not a public site.')
    return host, ('/' + tail if tail.startswith('?') else tail or '/')


def reader_refuses(address):
    """Whether an address a name resolved to is one the reader must never contact."""
    try:
        ip = ipaddress.ip_address(address.split('%', 1)[0])
    except ValueError:
        return True
    return any(ip.version == network.version and ip in network for network in READER_NETWORKS)


class PinnedConnection(http.client.HTTPSConnection):
    """HTTPS to one address that was already checked, verifying the certificate against the site's name."""
    def __init__(self, host, address, timeout):
        super().__init__(host, 443, timeout=timeout, context=ssl.create_default_context())
        self.address = address

    def connect(self):
        raw = socket.create_connection((self.address, 443), self.timeout)
        try:
            self.sock = self._context.wrap_socket(raw, server_hostname=self.host)
        except Exception:
            raw.close()
            raise


SPEECH = CONTRACT['speech']
SPEECH_KEY = re.compile(SPEECH['keyPattern'] + r'\Z')
SPEECH_VOICE = re.compile(SPEECH['voicePattern'] + r'\Z')
# What the owner's page is told when a provider does not give audio. The provider's own words are never passed on.
SPEECH_REFUSALS = {
    'key': 'The voice provider rejected this key.',
    'credit': 'The voice provider says this key has no credit for this.',
    'busy': 'The voice provider is busy or rate limiting this key. No automatic retry.',
    'voice': 'The voice provider did not accept this voice or text.',
    'failed': 'The voice provider could not be reached or failed. No retry and no other voice.',
}
SPEECH_REASONS = {401: 'key', 403: 'key', 402: 'credit', 429: 'busy', 400: 'voice', 404: 'voice', 422: 'voice'}


class SpeechRefusal(Exception):
    def __init__(self, reason):
        self.reason = reason


def validate_speech(raw, listing=False):
    """Checks a request to speak, or to list voices. Returns it unchanged or raises ValueError."""
    if not isinstance(raw, dict) or set(raw) != set(SPEECH['voicesFields' if listing else 'fields']):
        raise ValueError()
    if not isinstance(raw['provider'], str) or raw['provider'] not in SPEECH['providers']:
        raise ValueError()
    if not isinstance(raw['key'], str) or not SPEECH_KEY.fullmatch(raw['key']):
        raise ValueError()
    if listing:
        return raw
    text = raw['text']
    if not isinstance(raw['voice'], str) or not SPEECH_VOICE.fullmatch(raw['voice']):
        raise ValueError()
    if not isinstance(text, str) or not text.strip() or len(text) > SPEECH['textCharacters']:
        raise ValueError()
    if any((ord(c) < 32 and c not in '\n\t') or ord(c) == 127 or 0xD800 <= ord(c) <= 0xDFFF for c in text):
        raise ValueError()
    return raw


def speech_voices(provider, data):
    """The voices in a provider's answer, as [{id, name}]. Anything not shaped like a voice is dropped."""
    try:
        answer = strict_json(data)
        rows = answer['voices' if provider == 'elevenlabs' else 'items']
    except (ValueError, TypeError, KeyError, RecursionError):
        raise SpeechRefusal('failed') from None
    if not isinstance(rows, list):
        raise SpeechRefusal('failed')
    voices = []
    for row in rows:
        if not isinstance(row, dict) or (provider == 'fish' and row.get('type', 'tts') != 'tts'):
            continue
        identity, name = (row.get('voice_id'), row.get('name')) if provider == 'elevenlabs' else (row.get('_id'), row.get('title'))
        if not isinstance(identity, str) or not SPEECH_VOICE.fullmatch(identity) or not isinstance(name, str):
            continue
        name = ''.join(' ' if ord(c) < 32 or ord(c) == 127 else c for c in name).strip()[:SPEECH['nameCharacters']].strip()
        if name and len(voices) < SPEECH['voices']:
            voices.append({'id': identity, 'name': name})
    return {'voices': voices}


def validate_read(raw):
    if not isinstance(raw, dict) or set(raw) != set(READER['fields']):
        raise ValueError('One address is required.')
    return raw['url']


class Gateway(ThreadingHTTPServer):
    daemon_threads = True
    # Connections waiting to be accepted. One page load asks for about twenty files at once; the library default
    # of five refused part of that burst, a module failed to load and the app never started.
    request_queue_size = LIMITS['acceptBacklog']
    def __init__(self, address, *, token, upstream, public_origin=None, reader_test_sites=None, reader_test_resolve=None, speech_test_ports=None):
        super().__init__(address, Handler)
        # Stand-ins for public sites, for tests only: a name served in plain HTTP from a port on this
        # machine, and a name given fixed addresses in place of a DNS answer. Never set by local.py.
        self.reader_test_sites = dict(reader_test_sites or {})
        self.reader_test_resolve = dict(reader_test_resolve or {})
        self.reader_lock = threading.BoundedSemaphore(READER['concurrent'])
        self.speech_test_ports = dict(speech_test_ports or {})
        self.speech_lock = threading.BoundedSemaphore(SPEECH['concurrent'])
        self.client_slots = threading.BoundedSemaphore(CLIENT_SLOTS)
        self.token_digest = hashlib.sha256(token.encode()).digest()
        self.upstream = upstream_url(upstream)
        self.model_lock = threading.BoundedSemaphore(LIMITS['concurrentModelRequests'])
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

    def read_page(self, url):
        """Reads one public page and returns what the owner's page is told. Raises ReaderRefusal otherwise."""
        names = set(self.reader_test_sites) | set(self.reader_test_resolve)
        try:
            host, path = reader_target(url, names)
        except ValueError as error:
            raise ReaderRefusal(400, str(error)) from None
        unreachable = ReaderRefusal(502, 'The site could not be reached.')
        if host in self.reader_test_sites:
            connection = http.client.HTTPConnection('127.0.0.1', self.reader_test_sites[host], timeout=READER['seconds'])
        else:
            if host in self.reader_test_resolve:
                addresses = list(self.reader_test_resolve[host])
            else:
                try:
                    addresses = list(dict.fromkeys(item[4][0] for item in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)))
                except (OSError, UnicodeError):
                    raise ReaderRefusal(502, 'That site could not be found.') from None
            if not addresses:
                raise ReaderRefusal(502, 'That site could not be found.')
            # Every address the name has must be public, so no answer can steer the reader inward.
            if any(reader_refuses(address) for address in addresses):
                raise ReaderRefusal(422, 'That name leads to a private or local address, which is never read.')
            connection = PinnedConnection(host, addresses[0], READER['seconds'])
        # One clock for the whole read: when it runs out the connection is cut, however slowly the site is talking.
        expired = threading.Event()
        timer = None
        try:
            connection.connect()
            raw = connection.sock

            def cut():
                expired.set()
                try:
                    raw.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass
            timer = threading.Timer(READER['seconds'], cut)
            timer.daemon = True
            timer.start()
            connection.putrequest('GET', path, skip_host=True, skip_accept_encoding=True)
            for name, value in (('Host', host), ('User-Agent', READER['userAgent']), ('Accept', READER['accept']),
                                ('Accept-Encoding', 'identity'), ('Connection', 'close')):
                connection.putheader(name, value)
            connection.endheaders()
            response = connection.getresponse()
            if response.status in (301, 302, 303, 307, 308):
                location = (response.getheader('Location') or '').strip().split('#', 1)[0]
                if location.startswith('/') and not location.startswith('//'):
                    location = 'https://' + host + location
                try:
                    reader_target(location, names)
                except ValueError:
                    raise ReaderRefusal(502, 'The site sent the reader somewhere it will not go.') from None
                # Not followed: the owner sees the new address and decides.
                return {'outcome': 'redirect', 'url': url, 'location': location}
            if response.status != 200:
                raise ReaderRefusal(502, 'The site answered with an error.', status=response.status)
            kind = (response.getheader('Content-Type') or '').split(';', 1)[0].strip().lower()
            if kind not in READER['contentTypes'] or (response.getheader('Content-Encoding') or 'identity').strip().lower() != 'identity':
                raise ReaderRefusal(502, 'That address is not a plain web page or text.')
            declared = response.getheader('Content-Length')
            if declared is not None and (not declared.isdigit() or int(declared) > READER['bodyBytes']):
                raise ReaderRefusal(502, 'That page is too large to read.')
            body = b''
            while True:
                chunk = response.read1(65536)
                if not chunk:
                    break
                body += chunk
                if len(body) > READER['bodyBytes']:
                    raise ReaderRefusal(502, 'That page is too large to read.')
            if expired.is_set():
                raise unreachable
            try:
                text = body.decode('utf-8')
            except UnicodeDecodeError:
                raise ReaderRefusal(502, 'That page is not in a text encoding the reader accepts.') from None
            return {'outcome': 'page', 'url': url, 'type': kind, 'text': text.removeprefix('\ufeff')}
        except ReaderRefusal:
            raise
        except (OSError, ValueError, AttributeError, http.client.HTTPException):
            raise unreachable from None
        finally:
            if timer:
                timer.cancel()
            connection.close()

    def speech_call(self, request, listing=False):
        """One request to a voice provider with the owner's key. Returns audio bytes, or the list of
        voices. Raises SpeechRefusal with a reason; nothing the provider said is kept."""
        provider = request['provider']
        rules = SPEECH['providers'][provider]
        headers = {rules['keyHeader']: rules['keyPrefix'] + request['key'], 'Accept-Encoding': 'identity', 'Connection': 'close',
                   'User-Agent': SPEECH['userAgent']}
        if listing:
            method, path, body = 'GET', rules['list'], None
            headers['Accept'] = 'application/json'
        else:
            method, path = 'POST', rules['speak'].replace('{voice}', request['voice'])
            if provider == 'elevenlabs':
                sent = {'text': request['text'], 'model_id': rules['model'], 'apply_text_normalization': 'on'}
            else:
                sent = {'text': request['text'], 'reference_id': request['voice'], 'format': 'mp3'}
                headers['model'] = rules['model']
            body = json.dumps(sent).encode()
            headers['Content-Type'] = 'application/json'
            headers['Accept'] = SPEECH['audioType']
        limit = SPEECH['listBytes' if listing else 'audioBytes']
        if provider in self.speech_test_ports:
            connection = http.client.HTTPConnection('127.0.0.1', self.speech_test_ports[provider], timeout=SPEECH['seconds'])
        else:
            connection = http.client.HTTPSConnection(rules['host'], 443, timeout=SPEECH['seconds'], context=ssl.create_default_context())
        expired = threading.Event()
        timer = None
        try:
            connection.connect()
            raw = connection.sock

            def cut():
                expired.set()
                try:
                    raw.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass
            timer = threading.Timer(SPEECH['seconds'], cut)
            timer.daemon = True
            timer.start()
            connection.request(method, path, body=body, headers=headers)
            response = connection.getresponse()
            if response.status != 200:
                raise SpeechRefusal(SPEECH_REASONS.get(response.status, 'failed'))
            kind = (response.getheader('Content-Type') or '').split(';', 1)[0].strip().lower()
            if (response.getheader('Content-Encoding') or 'identity').strip().lower() != 'identity':
                raise SpeechRefusal('failed')
            if kind not in (('application/json',) if listing else SPEECH['upstreamAudioTypes']):
                raise SpeechRefusal('failed')
            data = b''
            while True:
                chunk = response.read1(65536)
                if not chunk:
                    break
                data += chunk
                if len(data) > limit:
                    raise SpeechRefusal('failed')
            if expired.is_set() or not data:
                raise SpeechRefusal('failed')
            return speech_voices(provider, data) if listing else data
        except SpeechRefusal:
            raise
        except (OSError, ValueError, AttributeError, http.client.HTTPException):
            raise SpeechRefusal('failed') from None
        finally:
            if timer:
                timer.cancel()
            connection.close()

    def upstream_call(self, method, path, body=None):
        connection = http.client.HTTPConnection(*self.upstream, timeout=LIMITS['upstreamTimeoutSeconds'])
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
        self.connection.settimeout(LIMITS['readTimeoutSeconds'])

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
        # The contract's headers go on every answer. Cross-Origin-Opener-Policy allows popups because
        # Google's sign-in popup must keep its opener; every other cross-origin window is detached.
        for name, value in HEADERS:
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(data)

    def boundary(self, auth=False):
        # A header that decides access may appear once. Two values would let two readers disagree.
        if any(len(self.headers.get_all(name, [])) > 1 for name in ('Host', 'Origin', 'Authorization', 'Content-Length', 'Content-Type', 'Transfer-Encoding')):
            self.reply(400, {'error': 'Bad request.'})
            return False
        if self.headers.get('Host') not in self.server.hosts or self.headers.get('Origin') not in (None, *self.server.origins):
            self.reply(403, {'error': 'Origin or host rejected.'})
            return False
        # The address is used exactly as sent. Some Python versions quietly turn a doubled leading
        # slash into one before this code runs, so it is refused here from the original request line.
        target = (self.requestline.split() + ['', ''])[1]
        if target.startswith('//'):
            self.reply(404, {'error': 'Not found.'})
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
        if self.path == REMINDERS['path']:
            return self.reply(200, {'available': False})
        if self.path == '/v1/models':
            if not self.server.model_lock.acquire(blocking=False):
                return self.reply(429, {'error': 'Local model busy. No automatic retry.'})
            connection = None
            try:
                connection, response = self.server.upstream_call('GET', 'models')
                data = response.read(LIMITS['modelListBytes'] + 1)
                if response.status != 200 or len(data) > LIMITS['modelListBytes']:
                    raise ValueError()
                rows = json.loads(data).get('data', [])
                ids = list(dict.fromkeys(r['id'] for r in rows if isinstance(r, dict) and isinstance(r.get('id'), str) and MODEL_ID.fullmatch(r['id'])))[:LIMITS['models']]
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
        if self.path not in ('/v1/chat/completions', REMINDERS['path'], READER['path'], SPEECH['path'], SPEECH['voicesPath']):
            return self.reply(404, {'error': 'Only model listing, text chat, reminders, the page reader and speech are exposed.'})
        reminders = self.path == REMINDERS['path']
        reading = self.path == READER['path']
        speaking = self.path in (SPEECH['path'], SPEECH['voicesPath'])
        listing = self.path == SPEECH['voicesPath']
        try:
            if self.headers.get('Content-Type', '').split(';')[0] != 'application/json' or self.headers.get('Transfer-Encoding'):
                raise ValueError()
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= MAX_REQUEST:
                raise ValueError()
            parsed = strict_json(self.rfile.read(length))
            body = validate_speech(parsed, listing) if speaking else (validate_reminders if reminders else validate_read if reading else validate_chat)(parsed)
            self.read_timer.cancel()
        except (ValueError, TypeError, RecursionError):
            return self.reply(400, {'error': 'Invalid speech request.' if speaking else 'Invalid reminder list.' if reminders else 'Invalid read request.' if reading else 'Invalid or oversized text chat request.'})
        if speaking:
            if not self.server.speech_lock.acquire(blocking=False):
                return self.reply(429, {'error': 'A voice request is already running. No automatic retry.'})
            try:
                answer = self.server.speech_call(body, listing)
                return self.reply(200, answer) if listing else self.reply(200, answer, SPEECH['audioType'])
            except SpeechRefusal as refusal:
                return self.reply(502, {'error': SPEECH_REFUSALS[refusal.reason], 'reason': refusal.reason})
            finally:
                self.server.speech_lock.release()
        if reading:
            if not self.server.reader_lock.acquire(blocking=False):
                return self.reply(429, {'error': 'The reader is busy. No automatic retry.'})
            try:
                return self.reply(200, self.server.read_page(body))
            except ReaderRefusal as refusal:
                return self.reply(refusal.code, {'error': refusal.message, **refusal.extra})
            finally:
                self.server.reader_lock.release()
        if reminders:
            # Checked and dropped: only PEA for Mac can show a notification.
            return self.reply(200, {'available': False, 'scheduled': 0})
        if body['model'] not in self.server.models or time.monotonic() - self.server.models_at > LIMITS['modelListSeconds']:
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
            for name, value in CONTRACT['streamHeaders'].items():
                self.send_header(name, value)
            self.end_headers()
            started = True
            total, deadline = 0, time.monotonic() + LIMITS['streamSeconds']
            while time.monotonic() < deadline:
                chunk = response.read1(4096)
                if not chunk:
                    break
                total += len(chunk)
                if total > LIMITS['streamBytes']:
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
    parser.add_argument('--reader-test-site', action='append', default=[], metavar='NAME.example=PORT',
                        help='Tests only: serve this name to the page reader from plain HTTP on a port of this machine.')
    parser.add_argument('--reader-test-resolve', action='append', default=[], metavar='NAME.example=ADDRESS[,ADDRESS]',
                        help='Tests only: give this name these addresses in place of a DNS answer.')
    parser.add_argument('--speech-test-port', action='append', default=[], metavar='PROVIDER=PORT',
                        help='Tests only: reach this voice provider at plain HTTP on a port of this machine instead.')
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
    sites, fixed = {}, {}
    for entry, into in [(e, sites) for e in args.reader_test_site] + [(e, fixed) for e in args.reader_test_resolve]:
        name, _, value = entry.partition('=')
        if not READER_HOST.fullmatch(name) or not name.endswith('.example') or not value:
            parser.error('A reader test name must end in .example and have a value.')
        into[name] = int(value) if into is sites else value.split(',')
    if sites or fixed:
        print('TEST MODE: the page reader has stand-in sites. Never use these options outside tests.', file=sys.stderr)
    voices = {}
    for entry in args.speech_test_port:
        name, _, value = entry.partition('=')
        if name not in SPEECH['providers'] or not value.isdigit():
            parser.error('A speech test port names a provider and a port.')
        voices[name] = int(value)
    if voices:
        print('TEST MODE: voice providers have stand-ins. Never use this option outside tests.', file=sys.stderr)
    server = Gateway(('127.0.0.1', args.port), token=token, upstream=args.upstream, public_origin=args.public_origin,
                     reader_test_sites=sites, reader_test_resolve=fixed, speech_test_ports=voices)
    print(f'PEA customer-owned UI: http://127.0.0.1:{args.port}/browser/ · private VPN/TLS required for phone access')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
