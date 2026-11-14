// Browser-level test support with no packages: a synthetic model, the real gateway on loopback and
// a headless Chrome driven over its debugging protocol. Nothing here contacts a real provider,
// account or microphone, and every token is created for one run and deleted afterwards.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

// An OpenAI-compatible stand-in. `reply(lastOwnerMessage)` returns the whole assistant reply.
export async function startFakeModel(reply) {
  const requests = [];
  const server = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/v1/models') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: 'synthetic-model' }] }));
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
        const text = String(reply(said, body));
        response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        // Split mid-block so the tests also cover a reply that arrives in pieces.
        const middle = Math.floor(text.length / 2);
        for (const piece of [text.slice(0, middle), text.slice(middle)])
          response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
        response.end('data: [DONE]\n\n');
      });
      return;
    }
    response.writeHead(404).end();
  });
  const port = await listen(server);
  return { port, requests, close: () => new Promise((resolve) => server.close(resolve)) };
}

// The real gateway, started the way an owner starts it, with a token made for this run only.
export async function startGateway(upstreamPort) {
  const folder = mkdtempSync(join(tmpdir(), 'pea-dom-'));
  const config = join(folder, 'config');
  const setup = spawnSync('python3', ['local.py', 'setup', '--config-dir', config], {
    cwd: serverFolder,
    encoding: 'utf8',
  });
  if (setup.status !== 0) throw new Error('Gateway setup failed: ' + setup.stderr);
  const token = readFileSync(join(config, 'connection-token'), 'utf8').trim();
  const port = await freePort();
  const child = spawn(
    'python3',
    [
      'local.py',
      'start',
      '--config-dir',
      config,
      '--port',
      String(port),
      '--upstream',
      `http://127.0.0.1:${upstreamPort}`,
    ],
    { cwd: serverFolder, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const origin = `http://127.0.0.1:${port}`;
  for (let attempt = 0; ; attempt++) {
    try {
      if ((await fetch(origin + '/')).ok) break;
    } catch {
      // Not listening yet.
    }
    if (attempt > 100 || child.exitCode !== null) {
      child.kill();
      throw new Error('The gateway did not start.');
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return {
    origin,
    token,
    close: async () => {
      child.kill();
      await new Promise((resolve) => (child.exitCode !== null ? resolve() : child.once('exit', resolve)));
      rmSync(folder, { recursive: true, force: true });
    },
  };
}

class Page {
  constructor(browser, sessionId, contextId) {
    this.browser = browser;
    this.sessionId = sessionId;
    this.contextId = contextId;
    this.requests = [];
  }
  send(method, params = {}) {
    return this.browser.send(method, params, this.sessionId);
  }
  async goto(url) {
    await this.send('Page.navigate', { url });
    await this.waitFor('document.readyState === "complete"');
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
      if (Date.now() > until) throw new Error('Timed out waiting for: ' + what);
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
  // Every address the page asked for that is not this machine. The tests expect none.
  outsideRequests() {
    return this.requests.filter(
      (url) => !/^(?:https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/|data:|blob:|about:)/.test(url),
    );
  }
  async close() {
    await this.browser.send('Target.disposeBrowserContext', { browserContextId: this.contextId });
  }
}

export async function launchBrowser() {
  const profile = mkdtempSync(join(tmpdir(), 'pea-chrome-'));
  const flags = [
    '--headless=new',
    '--remote-debugging-port=0',
    '--user-data-dir=' + profile,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--window-size=1400,900',
  ];
  // Hosted CI runners do not allow Chrome's sandbox. The only pages opened are this repository's own.
  if (process.env.CI) flags.push('--no-sandbox');
  const child = spawn(chromePath(), [...flags, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
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
    child.once('exit', () => reject(new Error('Chrome exited: ' + log.slice(-400))));
  });
  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error('Could not reach Chrome.'));
  });
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
    }
  };
  const browser = {
    send(method, params = {}, sessionId) {
      const id = ++next;
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    // Each page gets its own storage, so one test cannot see another's saved data.
    async newPage() {
      const { browserContextId } = await browser.send('Target.createBrowserContext');
      const { targetId } = await browser.send('Target.createTarget', {
        url: 'about:blank',
        browserContextId,
      });
      const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
      const page = new Page(browser, sessionId, browserContextId);
      pages.set(sessionId, page);
      await page.send('Page.enable');
      await page.send('Runtime.enable');
      await page.send('Network.enable');
      return page;
    },
    async close() {
      socket.close();
      child.kill();
      await new Promise((resolve) => (child.exitCode !== null ? resolve() : child.once('exit', resolve)));
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    },
  };
  return browser;
}
