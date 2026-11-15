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

// Temporary folders are removed on a best-effort basis. A browser's helper processes can still be
// writing as it exits, and a failed cleanup must not stop the remaining cleanup or fail the run.
function remove(folder) {
  try {
    rmSync(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch {
    // The operating system clears its temporary folder.
  }
}

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
    '--disable-dev-shm-usage',
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
      await stop(child);
      remove(profile);
    },
  };
  return browser;
}

// The whole synthetic stack for one test file: model, gateway and browser, stopped together.
export async function startStack(reply) {
  const parts = {};
  const close = async () => {
    // Each part is stopped even if another fails to stop, so a failed cleanup cannot leave the run hanging.
    await Promise.allSettled([parts.browser?.close(), parts.gateway?.close(), parts.model?.close()]);
  };
  try {
    parts.model = await startFakeModel(reply);
    parts.gateway = await startGateway(parts.model.port);
    parts.browser = await launchBrowser();
  } catch (error) {
    await close();
    throw error;
  }
  return { ...parts, close };
}

// Opens the app, connects the synthetic local model, and returns a page ready to chat.
export async function openConnectedPage(stack, { width, height } = {}) {
  const page = await stack.browser.newPage();
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

// Sends one owner message from Chat and approves the "before sharing with your model" review.
export async function askModel(stack, page, message) {
  const sent = stack.model.requests.length;
  await page.fill('#thought', message);
  await page.evaluate(`document.querySelector('#composer').requestSubmit()`);
  await page.waitFor(`document.querySelector('#review').open`, 'the model sharing review');
  if (stack.model.requests.length !== sent)
    throw new Error('A request reached the model before the sharing review was approved.');
  await page.click('#review-approve');
  await page.waitFor(`!document.querySelector('#review').open`);
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
