// Browser-level test support with no packages: a synthetic model, the real gateway on loopback and
// a headless Chrome driven over its debugging protocol. Nothing here contacts a real provider,
// account or microphone, and every token is created for one run and deleted afterwards.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverFolder = fileURLToPath(new URL('../../server/', import.meta.url));

export function chromePath() {
  const candidates = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  return candidates.find((path) => path && existsSync(path)) || null;
}

// Without a browser these tests are skipped locally. CI sets PEA_DOM_REQUIRED so a missing browser fails.
export function browserSkipReason() {
  if (chromePath()) return false;
  if (process.env.PEA_DOM_REQUIRED) throw new Error('A Chrome or Chromium browser is required.');
  return 'no Chrome or Chromium found; set CHROME_BIN to run browser-level tests';
}

// Temporary folders are removed on a best-effort basis. A browser's helper processes can still be
// writing as it exits, and a failed cleanup must not stop the remaining cleanup or fail the run.
function remove(folder) {
  try {
    rmSync(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch {
    // The operating system clears its temporary folder.
  }
}

// Every process this harness starts. If a test run is abandoned partway, for example when a hook
// times out while something is still starting, nothing else would stop them and they would keep
// the run alive for ever. They are killed when this process exits, and none of them keeps it alive.
const children = new Set();
function track(child) {
  children.add(child);
  child.once('exit', () => children.delete(child));
  child.unref();
  for (const stream of [child.stdout, child.stderr]) stream?.unref?.();
  return child;
}
process.once('exit', () => {
  for (const child of children) child.kill('SIGKILL');
});

// Ends a child process and never waits forever for it: a stuck browser is killed outright.
function stop(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    const force = setTimeout(() => child.kill('SIGKILL'), 2000);
    const giveUp = setTimeout(resolve, 5000);
    child.once('exit', () => {
      clearTimeout(force);
      clearTimeout(giveUp);
      resolve();
    });
    child.kill();
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function freePort() {
  const probe = createServer();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

// An OpenAI-compatible stand-in. `reply(lastOwnerMessage)` returns the whole assistant reply, or an
// object to misbehave on purpose: { status } answers with that error, { text, cut: true } drops the
// connection halfway through the reply, and { text, delay } waits that many milliseconds first.
// `models` are the ids it lists.
export async function startFakeModel(reply, models = ['synthetic-model']) {
  const requests = [];
  const server = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/v1/models') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ data: models.map((id) => ({ id })) }));
      return;
    }
    if (request.method === 'POST' && request.url === '/v1/chat/completions') {
      let raw = '';
      request.on('data', (chunk) => (raw += chunk));
      request.on('end', () => {
        const body = JSON.parse(raw);
        requests.push(body);
        const owner = [...body.messages].reverse().find((message) => message.role === 'user');
        const said = typeof owner?.content === 'string' ? owner.content : JSON.stringify(owner?.content);
        const answer = reply(said, body);
        const plan = answer && typeof answer === 'object' ? answer : { text: String(answer) };
        if (plan.status) {
          response.writeHead(plan.status, { 'Content-Type': 'application/json', 'Retry-After': '7' });
          response.end(JSON.stringify({ error: 'SYNTHETIC UPSTREAM DETAIL' }));
          return;
        }
        const text = String(plan.text ?? '');
        const send = () => {
          if (response.destroyed) return;
          response.writeHead(200, { 'Content-Type': 'text/event-stream' });
          // Split mid-block so the tests also cover a reply that arrives in pieces.
          const middle = Math.floor(text.length / 2);
          const piece = (part) => `data: ${JSON.stringify({ choices: [{ delta: { content: part } }] })}\n\n`;
          response.write(piece(text.slice(0, middle)));
          if (plan.cut) {
            // Let the first half reach the page, then drop the connection without finishing.
            setTimeout(() => response.destroy(), 150);
            return;
          }
          response.write(piece(text.slice(middle)));
          response.end('data: [DONE]\n\n');
        };
        if (plan.delay) setTimeout(send, plan.delay);
        else send();
      });
      return;
    }
    response.writeHead(404).end();
  });
  const port = await listen(server);
  return {
    port,
    requests,
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  };
}

// A stand-in for public web sites, for the page reader. The gateway is started in its test mode so
// that the named sites lead here instead of to the internet. `answer(request)` returns
// { status, type, body, location } for each { host, path }; every request is kept for the tests.
export async function startFakeSite(answer) {
  const requests = [];
  const server = createServer((request, response) => {
    const seen = { host: request.headers.host, path: request.url, headers: request.headers };
    requests.push(seen);
    const plan = answer(seen) ?? { status: 404, body: 'Not here.' };
    const headers = { 'Content-Type': plan.type ?? 'text/html; charset=utf-8' };
    if (plan.location) headers.Location = plan.location;
    response.writeHead(plan.status ?? 200, headers);
    response.end(plan.body ?? '');
  });
  const port = await listen(server);
  return {
    port,
    requests,
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  };
}

// A stand-in project engine (MCD or RCD), reached only through the gateway, which is started with
// its address and a credential made for this run. `answer(asked)` gets the request body and returns
// { status, body }; every request is kept with its headers for the tests.
export async function startFakeEngine(answer) {
  const requests = [];
  const token = randomBytes(48).toString('base64url');
  const folder = mkdtempSync(join(tmpdir(), 'pea-engine-'));
  const tokenFile = join(folder, 'engine-token');
  writeFileSync(tokenFile, token + '\n', { mode: 0o600, flag: 'wx' });
  const server = createServer((request, response) => {
    const parts = [];
    request.on('data', (part) => parts.push(part));
    request.on('end', () => {
      let asked = null;
      try {
        asked = JSON.parse(Buffer.concat(parts).toString('utf8'));
      } catch {
        // Answered as a bad request below.
      }
      requests.push({ method: request.method, path: request.url, headers: request.headers, asked });
      const plan =
        request.headers.authorization !== 'Bearer ' + token
          ? { status: 401, body: { detail: 'SYNTHETIC ENGINE DETAIL' } }
          : request.method !== 'POST' || request.url !== '/api/pea-projects' || !asked
            ? { status: 404, body: { detail: 'SYNTHETIC ENGINE DETAIL' } }
            : (answer(asked) ?? { status: 422, body: { detail: 'SYNTHETIC ENGINE DETAIL' } });
      response.writeHead(plan.status ?? 200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(plan.body ?? {}));
    });
  });
  const port = await listen(server);
  return {
    port,
    token,
    requests,
    options: ['--projects-url', `http://127.0.0.1:${port}`, '--projects-token-file', tokenFile],
    close: () =>
      new Promise((resolve) => {
        server.close(() => {
          remove(folder);
          resolve();
        });
        server.closeAllConnections();
      }),
  };
}

// Stand-in voice providers, reached only through the gateway's test option. `answer(request)`
// gets { method, path, headers, body } and returns { status, type, data }; every request is kept.
// `shortSound` is a fifth of a second of silence a browser can play.
export function shortSound() {
  const samples = 1600,
    wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(samples * 2, 40);
  return wav;
}
export async function startFakeVoices(answer) {
  const requests = [];
  const server = createServer((request, response) => {
    const parts = [];
    request.on('data', (chunk) => parts.push(chunk));
    request.on('end', () => {
      const seen = {
        method: request.method,
        path: request.url,
        headers: request.headers,
        body: Buffer.concat(parts).toString('utf8'),
      };
      requests.push(seen);
      const plan = answer(seen) ?? { status: 404, type: 'application/json', data: '{}' };
      response.writeHead(plan.status ?? 200, {
        'Content-Type': plan.type ?? 'audio/mpeg',
        Connection: 'close',
      });
      response.end(plan.data ?? '');
    });
  });
  const port = await listen(server);
  return {
    port,
    requests,
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  };
}

// Which gateway serves the app under test. PEA_GATEWAY=swift runs the Mac app's gateway (built
// beforehand with `swift build --package-path mac`, or named by PEA_GATEWAY_BINARY), so the whole
// browser suite checks it serves the app exactly as the Python one does.
export const gatewayKind = process.env.PEA_GATEWAY === 'swift' ? 'swift' : 'python';
const swiftGateway =
  process.env.PEA_GATEWAY_BINARY ||
  fileURLToPath(new URL('../../../mac/.build/debug/pea-gateway', import.meta.url));

// The real gateway, started the way an owner starts it, with a token made for this run only.
// Test files run side by side, and each asks the system for a free port before its gateway binds
// it, so now and then two want the same one and the later gateway cannot start. That is a fault of
// the test setup, not of the gateway: it is tried again on another port, and a gateway that still
// does not start fails the test with its own words.
export async function startGateway(upstreamPort, reader = []) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await startGatewayOnce(upstreamPort, reader);
    } catch (error) {
      if (attempt >= 3 || !String(error.message).startsWith('The gateway did not start.')) throw error;
      console.error(`Gateway start tried again (${attempt}): ${error.message}`);
    }
  }
}
async function startGatewayOnce(upstreamPort, reader) {
  const folder = mkdtempSync(join(tmpdir(), 'pea-dom-'));
  const config = join(folder, 'config');
  const port = await freePort();
  const upstream = `http://127.0.0.1:${upstreamPort}`;
  let token, child;
  // What the gateway says as it starts or fails goes to a file, for the error below. It never
  // prints its token.
  const heard = join(folder, 'gateway-output.txt'),
    said = openSync(heard, 'w', 0o600);
  if (gatewayKind === 'swift') {
    if (!existsSync(swiftGateway))
      throw new Error(
        'PEA_GATEWAY=swift needs the Swift gateway built first: swift build --package-path mac',
      );
    mkdirSync(config, { mode: 0o700 });
    token = randomBytes(32).toString('base64url');
    writeFileSync(join(config, 'connection-token'), token + '\n', { mode: 0o600, flag: 'wx' });
    child = track(
      spawn(
        swiftGateway,
        [
          '--root',
          fileURLToPath(new URL('../../', import.meta.url)),
          '--token-file',
          join(config, 'connection-token'),
          '--port',
          String(port),
          '--upstream',
          upstream,
          // Stands in for the Mac's notifications: accepted reminders are written here, not shown.
          '--reminders-file',
          join(folder, 'reminders.json'),
          ...reader,
        ],
        { stdio: ['ignore', said, said] },
      ),
    );
  } else {
    const setup = spawnSync('python3', ['local.py', 'setup', '--config-dir', config], {
      cwd: serverFolder,
      encoding: 'utf8',
    });
    if (setup.status !== 0) throw new Error('Gateway setup failed: ' + setup.stderr);
    token = readFileSync(join(config, 'connection-token'), 'utf8').trim();
    // An owner starts PEA through local.py, which has no test options. Only a run that needs the
    // reader's stand-in sites starts the gateway itself, with the same token file.
    const command = reader.length
      ? ['gateway.py', '--token-file', join(config, 'connection-token'), '--port', String(port)]
      : ['local.py', 'start', '--config-dir', config, '--port', String(port)];
    child = track(
      spawn('python3', [...command, '--upstream', upstream, ...reader], {
        cwd: serverFolder,
        stdio: ['ignore', said, said],
      }),
    );
  }
  closeSync(said);
  const origin = `http://127.0.0.1:${port}`;
  for (let attempt = 0; ; attempt++) {
    try {
      // A connection that is accepted but never answered must not stall the whole run.
      // The answer is read to its end. Left unread, a page over 64 KB stalls the connection and
      // some versions of Node then fail the whole test file with an internal assertion.
      const answer = await fetch(origin + '/', { signal: AbortSignal.timeout(1500) });
      await answer.arrayBuffer();
      if (answer.ok) break;
    } catch {
      // Not listening yet.
    }
    if (attempt > 100 || child.exitCode !== null) {
      const exited = child.exitCode;
      child.kill();
      let lastWords = 'it said nothing';
      try {
        lastWords = readFileSync(heard, 'utf8').slice(-300).trim() || lastWords;
      } catch {
        // Nothing was written.
      }
      remove(folder);
      throw new Error(
        `The gateway did not start. ${exited === null ? 'It was not answering' : 'It exited with ' + exited} on port ${port}: ${lastWords}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return {
    origin,
    token,
    // The last list of reminders the gateway handed on, or null if it has handed on none. Only the
    // Swift gateway can take reminders; the Python one always says they are not available.
    reminders() {
      try {
        return JSON.parse(readFileSync(join(folder, 'reminders.json'), 'utf8'));
      } catch {
        return null;
      }
    },
    close: async () => {
      await stop(child);
      remove(folder);
    },
  };
}

class Page {
  constructor(browser, sessionId, contextId) {
    this.browser = browser;
    this.sessionId = sessionId;
    this.contextId = contextId;
    this.requests = [];
    // Synthetic answers for addresses a test stands in for, and every request they received.
    this.routes = [];
    this.intercepted = [];
    // Uncaught errors and console errors from the page. A stability test expects none.
    this.errors = [];
    this.owned = true;
  }
  send(method, params = {}) {
    return this.browser.send(method, params, this.sessionId);
  }
  async goto(url) {
    await this.send('Page.navigate', { url });
    await this.waitFor('document.readyState === "complete"');
    // Notices disappear after a few seconds, so keep every one for failure messages.
    await this.evaluate(
      `(() => { window.peaNotices = []; const n = document.querySelector('#notice'); if (n) new MutationObserver(() => n.textContent && window.peaNotices.push(n.textContent)).observe(n, { childList: true, characterData: true, subtree: true }); })()`,
    );
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails)
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async waitFor(expression, what = expression, timeout = 8000) {
    const until = Date.now() + timeout;
    for (;;) {
      if (await this.evaluate(`Boolean(${expression})`)) return;
      if (Date.now() > until) {
        // The app's own notice usually says why nothing happened.
        const notices = await this.evaluate(`(window.peaNotices || []).join(' | ')`).catch(() => '');
        throw new Error(
          'Timed out waiting for: ' + what + (notices ? ' (app notices: ' + notices + ')' : ''),
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }
  click(selector) {
    return this.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  }
  // Clicks the first button or link whose visible text starts with `text`.
  clickText(text) {
    return this.evaluate(
      `[...document.querySelectorAll('button, a')].find((e) => e.offsetParent !== null && e.textContent.trim().startsWith(${JSON.stringify(text)})).click()`,
    );
  }
  hasText(text) {
    return this.evaluate(
      `[...document.querySelectorAll('button, a, small')].some((e) => e.offsetParent !== null && e.textContent.trim().startsWith(${JSON.stringify(text)}))`,
    );
  }
  fill(selector, value) {
    return this.evaluate(
      `(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); })()`,
    );
  }
  text(selector) {
    return this.evaluate(`document.querySelector(${JSON.stringify(selector)})?.innerText ?? ''`);
  }
  // Answers requests whose address starts with `prefix` from the test itself, so the page can be
  // checked against another service's answers without contacting it. `answer(url)` returns
  // { status, body } and the body is sent as JSON, or { type, text } to send other text as it is.
  // What the page sent is kept in `intercepted`, with the request's own body in `sent`.
  async route(prefix, answer) {
    this.routes.push({ prefix, answer });
    await this.send('Fetch.enable', { patterns: this.routes.map((r) => ({ urlPattern: r.prefix + '*' })) });
  }
  async answerPaused({ requestId, request }) {
    const route = this.routes.find((r) => request.url.startsWith(r.prefix));
    if (!route) return this.send('Fetch.continueRequest', { requestId });
    this.intercepted.push({
      url: request.url,
      method: request.method,
      headers: request.headers,
      sent: request.postData ?? '',
    });
    const {
      status = 200,
      body = {},
      type = 'application/json',
      text = JSON.stringify(body),
    } = route.answer(request.url, request) ?? { status: 404 };
    return this.send('Fetch.fulfillRequest', {
      requestId,
      responseCode: status,
      responseHeaders: [
        { name: 'Content-Type', value: type },
        { name: 'Access-Control-Allow-Origin', value: '*' },
        // A request with a sign-in header is asked about first; the stand-in allows it.
        { name: 'Access-Control-Allow-Headers', value: 'authorization, content-type, if-match' },
        { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PATCH, DELETE' },
        { name: 'Cache-Control', value: 'no-store' },
      ],
      body: Buffer.from(text).toString('base64'),
    });
  }
  // Presses a real key, as a keyboard would. `text` is what the key types, if anything.
  async press(key, { alt = false, ctrl = false, meta = false, shift = false, code, text } = {}) {
    const modifiers = (alt ? 1 : 0) | (ctrl ? 2 : 0) | (meta ? 4 : 0) | (shift ? 8 : 0);
    const named = { Enter: 13, Escape: 27, ArrowDown: 40, ArrowUp: 38 };
    const base = {
      key,
      code: code || (key.length === 1 ? 'Key' + key.toUpperCase() : key),
      modifiers,
      windowsVirtualKeyCode: named[key] || key.toUpperCase().charCodeAt(0),
    };
    await this.send('Input.dispatchKeyEvent', {
      type: text ? 'keyDown' : 'rawKeyDown',
      ...base,
      ...(text ? { text } : {}),
    });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }
  // The platform's main modifier: Command on a Mac, Control elsewhere.
  async mod() {
    return (await this.evaluate(
      `/mac|iphone|ipad/i.test(navigator.userAgentData?.platform || navigator.platform)`,
    ))
      ? { meta: true }
      : { ctrl: true };
  }
  // The modifier used with 1, 2 and 3 to change workspace: Control on a Mac, Alt elsewhere.
  async workspaceMod() {
    return (await this.mod()).meta ? { ctrl: true } : { alt: true };
  }
  // Pretends the window is this size, so the same page can be checked as a desktop and as a phone.
  setViewport(width, height) {
    return this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }
  // Every address the page asked for that is not this machine. The tests expect none.
  outsideRequests() {
    return this.requests.filter(
      (url) => !/^(?:https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/|data:|blob:|about:)/.test(url),
    );
  }
  async close() {
    if (this.owned)
      await this.browser.send('Target.disposeBrowserContext', { browserContextId: this.contextId });
    else await this.browser.send('Target.closeTarget', { targetId: this.targetId });
  }
}

// A loaded test machine now and then fails to bring a browser up in time. That is a failure of the
// test setup, not of the app: it is tried again with a fresh profile, and a browser that still does
// not start fails the test with its own words.
const browserStartFailures = ['Chrome did not start', 'Chrome exited', 'Could not reach Chrome'];
export async function launchBrowser() {
  for (let attempt = 1; ; attempt++) {
    try {
      return await launchBrowserOnce();
    } catch (error) {
      const message = String(error.message);
      if (attempt >= 3 || !browserStartFailures.some((start) => message.startsWith(start))) throw error;
      console.error(`Browser start tried again (${attempt}): ${message}`);
    }
  }
}
async function launchBrowserOnce() {
  const profile = mkdtempSync(join(tmpdir(), 'pea-chrome-'));
  const flags = [
    '--headless=new',
    '--remote-debugging-port=0',
    '--user-data-dir=' + profile,
    '--no-first-run',
    // A test's click is not a person's, so sound would otherwise be held back and never play.
    '--autoplay-policy=no-user-gesture-required',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--disable-dev-shm-usage',
    '--window-size=1400,900',
  ];
  // Hosted CI runners do not allow Chrome's sandbox. The only pages opened are this repository's own.
  if (process.env.CI) flags.push('--no-sandbox');
  const child = track(
    spawn(chromePath(), [...flags, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] }),
  );
  const endpoint = await new Promise((resolve, reject) => {
    let log = '';
    const timer = setTimeout(() => reject(new Error('Chrome did not start: ' + log.slice(-400))), 20000);
    child.stderr.on('data', (chunk) => {
      log += chunk;
      const match = log.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.once('exit', () => {
      clearTimeout(timer);
      reject(new Error('Chrome exited: ' + log.slice(-400)));
    });
  }).catch(async (error) => {
    await stop(child);
    remove(profile);
    throw error;
  });
  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error('Could not reach Chrome.'));
  }).catch(async (error) => {
    await stop(child);
    remove(profile);
    throw error;
  });
  // If the browser goes away, every waiting command fails at once instead of waiting forever.
  const lost = () => {
    for (const { reject } of pending.values()) reject(new Error('The browser closed unexpectedly.'));
    pending.clear();
  };
  socket.onclose = lost;
  child.once('exit', lost);
  let next = 0;
  const pending = new Map();
  const pages = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    } else if (message.method === 'Network.requestWillBeSent') {
      pages.get(message.sessionId)?.requests.push(message.params.request.url);
    } else if (message.method === 'Runtime.exceptionThrown') {
      const detail = message.params.exceptionDetails;
      pages.get(message.sessionId)?.errors.push(detail.exception?.description || detail.text);
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      pages
        .get(message.sessionId)
        ?.errors.push(
          'console.error: ' + message.params.args.map((a) => a.value ?? a.description ?? '').join(' '),
        );
    } else if (message.method === 'Fetch.requestPaused') {
      pages
        .get(message.sessionId)
        ?.answerPaused(message.params)
        .catch(() => {});
    }
  };
  const browser = {
    send(method, params = {}, sessionId) {
      const id = ++next;
      return new Promise((resolve, reject) => {
        // No single browser command should take long; a stuck one fails the test with its name.
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('The browser did not answer: ' + method));
        }, 15000);
        pending.set(id, {
          resolve: (value) => (clearTimeout(timer), resolve(value)),
          reject: (error) => (clearTimeout(timer), reject(error)),
        });
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    },
    // Each page gets its own storage, so one test cannot see another's saved data.
    // `beside` opens another tab that shares that page's storage, as a second tab of the same
    // browser would.
    // Opening a blank page is setup too: if the browser is slow to answer, it is tried once more
    // before any test step has run. Nothing of the app has loaded yet, so a retry hides nothing.
    async newPage(beside = null) {
      try {
        return await browser.openPage(beside);
      } catch (error) {
        if (!String(error.message).startsWith('The browser did not answer')) throw error;
        console.error(`Page setup tried again: ${error.message}`);
        return browser.openPage(beside);
      }
    },
    async openPage(beside) {
      const { browserContextId } = beside
        ? { browserContextId: beside.contextId }
        : await browser.send('Target.createBrowserContext');
      const { targetId } = await browser.send('Target.createTarget', {
        url: 'about:blank',
        browserContextId,
      });
      const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
      const page = new Page(browser, sessionId, browserContextId);
      page.owned = !beside;
      page.targetId = targetId;
      pages.set(sessionId, page);
      await page.send('Page.enable');
      await page.send('Runtime.enable');
      await page.send('Network.enable');
      return page;
    },
    async close() {
      socket.close();
      await stop(child);
      remove(profile);
    },
  };
  return browser;
}

// The whole synthetic stack for one test file: model, gateway and browser, stopped together.
export async function startStack(
  reply,
  { site = null, voices = null, models = undefined, engine = null } = {},
) {
  const parts = {};
  const close = async () => {
    // Each part is stopped even if another fails to stop, so a failed cleanup cannot leave the run hanging.
    await Promise.allSettled([
      parts.browser?.close(),
      parts.gateway?.close(),
      parts.model?.close(),
      parts.site?.close(),
      parts.voices?.close(),
      parts.engine?.close(),
    ]);
  };
  // Starting must finish well inside a test hook's own time limit. If it does not, everything
  // started so far is stopped here, because a hook that times out cannot clean up after itself.
  let abandoned = false;
  const start = (async () => {
    parts.model = await startFakeModel(reply, models);
    if (abandoned) return;
    // `site` is { names, resolve, answer }: names served by a stand-in site, and names given fixed
    // addresses in place of a DNS answer.
    const reader = [];
    if (site) {
      parts.site = await startFakeSite(site.answer);
      if (abandoned) return;
      for (const name of site.names ?? []) reader.push('--reader-test-site', `${name}=${parts.site.port}`);
      for (const [name, addresses] of Object.entries(site.resolve ?? {}))
        reader.push('--reader-test-resolve', `${name}=${addresses}`);
    }
    // `voices` answers for both voice providers in place of the real ones.
    if (voices) {
      parts.voices = await startFakeVoices(voices);
      if (abandoned) return;
      for (const provider of ['elevenlabs', 'fish'])
        reader.push('--speech-test-port', `${provider}=${parts.voices.port}`);
    }
    // `engine` answers as the owner's project engine would.
    if (engine) {
      parts.engine = await startFakeEngine(engine);
      if (abandoned) return;
      reader.push(...parts.engine.options);
    }
    parts.gateway = await startGateway(parts.model.port, reader);
    if (abandoned) return;
    parts.browser = await launchBrowser();
  })();
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('The test stack did not start within 45 seconds.')), 45000);
  });
  try {
    await Promise.race([start, limit]);
  } catch (error) {
    abandoned = true;
    // Let a step that is still in flight settle so its process is known, then stop everything.
    await Promise.race([start.catch(() => {}), new Promise((resolve) => setTimeout(resolve, 3000))]);
    await close();
    throw error;
  } finally {
    clearTimeout(timer);
  }
  return { ...parts, close };
}

// Opens the app, connects the synthetic local model, and returns a page ready to chat.
export async function openConnectedPage(stack, { width, height, beside = null } = {}) {
  const page = await stack.browser.newPage(beside);
  if (width) await page.setViewport(width, height || 900);
  // PEA_DOM_PLATFORM=linux (or mac) makes the page see that kind of computer, so both sets of
  // keyboard shortcuts can be checked on one machine.
  const pretend = { linux: ['Linux x86_64', 'Linux'], mac: ['MacIntel', 'macOS'] }[
    process.env.PEA_DOM_PLATFORM
  ];
  if (pretend)
    await page.send('Emulation.setUserAgentOverride', {
      userAgent: await page.evaluate('navigator.userAgent'),
      platform: pretend[0],
      userAgentMetadata: {
        platform: pretend[1],
        platformVersion: '',
        architecture: '',
        model: '',
        mobile: false,
      },
    });
  await page.goto(stack.gateway.origin + '/');
  await page.waitFor(
    `document.querySelector('#local-connect').onclick && !document.querySelector('#local-connect').disabled`,
    'the app to finish starting',
  );
  await page.fill('#local-token', stack.gateway.token);
  await page.click('#local-connect');
  await page.waitFor(
    `[...document.querySelector('#chat-model').options].some((o) => o.value.startsWith('local:'))`,
    'the local model list',
  );
  await page.fill('#chat-model', 'local:synthetic-model');
  return page;
}

async function waitUntil(check, what, timeout = 8000) {
  const until = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > until) throw new Error('Timed out waiting for: ' + what);
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
}

// Sends one owner message from Chat. The first message with a given set of choices stops at the
// "before sharing with your model" review, which is approved here; later ones reuse that approval.
export async function askModel(stack, page, message) {
  const sent = stack.model.requests.length;
  await page.fill('#thought', message);
  await page.evaluate(`document.querySelector('#composer').requestSubmit()`);
  let reviewed = false;
  await waitUntil(() => {
    if (stack.model.requests.length > sent) return true;
    page.evaluate(`document.querySelector('#review').open`).then(
      (open) => (reviewed ||= open),
      () => {},
    );
    return reviewed;
  }, 'the model sharing review or the request');
  if (reviewed && stack.model.requests.length === sent) {
    await page.click('#review-approve');
    await page.waitFor(`!document.querySelector('#review').open`);
  }
  await waitUntil(() => stack.model.requests.length > sent, 'the request to reach the model');
  // The profile switch is disabled for as long as a request is in progress.
  await page.waitFor(`!document.querySelector('#profile').disabled`, 'the reply to finish');
}

// Clicks a proposal button in Chat and waits for its review.
export async function openReview(page, buttonText) {
  await page.waitFor(
    `[...document.querySelectorAll('#messages button')].some((b) => b.textContent.startsWith(${JSON.stringify(buttonText)}))`,
    'the proposal button "' + buttonText + '"',
  );
  // The app ignores a click while the previous review is still closing, as it would a double click.
  for (let attempt = 0; ; attempt++) {
    await page.clickText(buttonText);
    try {
      await page.waitFor(`document.querySelector('#review').open`, 'the action review', 400);
      return;
    } catch (error) {
      if (attempt >= 10) throw error;
    }
  }
}
