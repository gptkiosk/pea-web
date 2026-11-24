// Browser-level checks for keeping the OpenRouter key in the encrypted library: it is kept only
// when the box is ticked and the library is unlocked, never as readable text, comes back on
// unlock, leaves the tab on lock, and is removed on request or when OpenRouter refuses it.
// OpenRouter is answered by the test itself; nothing leaves this machine.
// Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { browserSkipReason, startStack } from './harness.mjs';

const skip = browserSkipReason();
const options = { skip, timeout: 120000 };
const key = 'sk-or-v1-' + 'syntheticSYNTHETIC'.repeat(2);
const passphrase = 'synthetic library passphrase';
const router = 'https://openrouter.ai/';

let stack;
before(
  async () => {
    if (!skip) stack = await startStack(() => 'A plain synthetic reply.');
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

const routerModels = (page) =>
  page.evaluate(
    `[...document.getElementById('chat-model').options].map((o) => o.value).filter((v) => v && !v.startsWith('local:'))`,
  );
const box = (page) =>
  page.evaluate(
    `(() => { const b = document.getElementById('router-remember'); return { checked: b.checked, disabled: b.disabled }; })()`,
  );
const note = (page) => page.text('#connection-note');
// Everything this browser has stored for the page, as text, with sealed bytes decoded as they are.
const stored = (page) =>
  page.evaluate(`new Promise((resolve) => {
    let text = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    const open = indexedDB.open('pea-conversation-library-v1');
    open.onsuccess = () => {
      const store = open.result.transaction('encrypted').objectStore('encrypted');
      const keys = store.getAllKeys(), rows = store.getAll();
      rows.onsuccess = () => {
        for (const row of rows.result)
          for (const part of Object.values(row))
            text += part instanceof ArrayBuffer || ArrayBuffer.isView(part) ? new TextDecoder('latin1').decode(part) : String(part);
        open.result.close();
        resolve({ text, keys: keys.result.map(String) });
      };
    };
  })`);

async function start(page) {
  await page.goto(stack.gateway.origin + '/');
  await page.waitFor(
    `document.querySelector('#router-connect').onclick && !document.querySelector('#router-connect').disabled`,
    'the app to finish starting',
  );
  await page.waitFor(`!document.getElementById('library-storage').disabled`, 'the library to be ready');
}
// Unlocks (or first enables) the library. A saved library asks for a review first.
// `late` sends the dialog a late report of an earlier close while the unlock is under way, as a
// browser does when the dialog is reopened quickly. It must not cancel the unlock.
async function unlock(page, { late = false } = {}) {
  await page.waitFor(`!document.getElementById('library-storage').disabled`, 'the library to be ready');
  await page.click('#library-storage');
  await page.waitFor(`document.getElementById('library-unlock').open`, 'the passphrase dialog');
  await page.fill('#library-passphrase', passphrase);
  await page.click('#library-unlock-submit');
  await page.waitFor(
    `document.getElementById('review').open || !document.getElementById('library-unlock').open`,
    'the review or the unlock',
    20000,
  );
  let review = '';
  if (await page.evaluate(`document.getElementById('review').open`)) {
    review = await page.text('#review-body');
    await page.click('#review-approve');
  }
  if (late)
    await page.evaluate(`document.getElementById('library-unlock').dispatchEvent(new Event('close'))`);
  await page.waitFor(`!document.getElementById('library-unlock').open`, 'the library to unlock', 20000);
  await page.waitFor(`!document.getElementById('router-remember').disabled`, 'the box to be offered');
  return review;
}

test(
  'a ticked box keeps the OpenRouter key sealed in the library, back on unlock and gone on lock',
  options,
  async () => {
    const page = await stack.browser.newPage();
    let accepted = key;
    await page.route(router, (url, request) => {
      // The browser asks first whether a request with a sign-in header is allowed.
      if (request.method === 'OPTIONS') return { body: {} };
      if (url.endsWith('/api/v1/key'))
        return request.headers.Authorization === 'Bearer ' + accepted ||
          request.headers.authorization === 'Bearer ' + accepted
          ? { body: { data: { label: 'synthetic' } } }
          : { status: 401, body: { error: { message: 'No auth' } } };
      if (url.includes('/api/v1/models'))
        return {
          body: {
            data: [
              {
                id: 'synthetic/router-model',
                name: 'Synthetic: Router Model',
                architecture: { input_modalities: ['text'], output_modalities: ['text'] },
                pricing: { prompt: '0', completion: '0' },
              },
            ],
          },
        };
      return { status: 404 };
    });
    await start(page);

    // With the library locked the box cannot be ticked, and a verified key is kept nowhere.
    assert.deepEqual(await box(page), { checked: false, disabled: true });
    assert.match(await page.text('#router-remember-note'), /set or unlock a passphrase/);
    await page.fill('#router-key', key);
    await page.click('#router-connect');
    await page.waitFor(
      `[...document.getElementById('chat-model').options].some((o) => o.value === 'synthetic/router-model')`,
      'the OpenRouter models',
    );
    assert.doesNotMatch((await stored(page)).text, /sk-or-v1/);

    // Unlocked, ticking the box keeps the key that is already verified.
    await unlock(page);
    assert.deepEqual(await box(page), { checked: false, disabled: false });
    await page.click('#router-remember');
    await page.waitFor(
      `document.getElementById('connection-note').textContent.includes('now kept')`,
      'the key to be kept',
    );
    let kept = await stored(page);
    assert.deepEqual(kept.keys.sort(), ['library', 'secret:openrouter:personal']);
    assert.doesNotMatch(kept.text, /sk-or-v1|syntheticSYNTHETIC/, 'not readable anywhere in this browser');

    // After a reload the key is gone from the tab until the library is unlocked.
    await start(page);
    assert.deepEqual(await routerModels(page), []);
    assert.deepEqual(await box(page), { checked: false, disabled: true });
    const asked = page.intercepted.length;
    const review = await unlock(page);
    assert.match(review, /OpenRouter key you chose to keep in this library is restored/);
    await page.waitFor(
      `[...document.getElementById('chat-model').options].some((o) => o.value === 'synthetic/router-model')`,
      'the key to come back',
    );
    assert.match(await note(page), /connected with the key kept in your library/);
    assert.deepEqual(await box(page), { checked: true, disabled: false });
    assert.deepEqual(
      page.intercepted
        .slice(asked)
        .filter((r) => r.method !== 'OPTIONS')
        .map((r) => new URL(r.url).pathname),
      ['/api/v1/key', '/api/v1/models'],
      'restoring asks OpenRouter to confirm the key and list models, and nothing else',
    );
    assert.equal(stack.model.requests.length, 0, 'no model was asked anything');

    // Work has no kept key of its own.
    await page.fill('#profile', 'work');
    await page.waitFor(`document.getElementById('profile').value === 'work'`);
    assert.deepEqual(await routerModels(page), []);
    assert.deepEqual(await box(page), { checked: false, disabled: false });
    await page.fill('#profile', 'personal');
    await page.waitFor(
      `[...document.getElementById('chat-model').options].some((o) => o.value === 'synthetic/router-model')`,
      'Personal still connected',
    );

    // Locking puts the key away.
    await page.click('#library-storage');
    await page.waitFor(`document.getElementById('router-remember').disabled`, 'the library to lock');
    assert.deepEqual(await routerModels(page), []);

    // Disconnecting removes the kept copy too: the next unlock restores nothing.
    await unlock(page, { late: true });
    await page.waitFor(
      `[...document.getElementById('chat-model').options].some((o) => o.value === 'synthetic/router-model')`,
      'the key to come back again',
    );
    await page.click('#router-forget');
    await page.waitFor(
      `document.getElementById('connection-note').textContent.includes('in this tab and in your library')`,
      'the key to be forgotten',
    );
    assert.deepEqual((await stored(page)).keys, ['library']);
    await start(page);
    await unlock(page);
    assert.deepEqual(await box(page), { checked: false, disabled: false });
    assert.deepEqual(await routerModels(page), []);

    // A kept key that OpenRouter no longer accepts is removed and said so.
    await page.click('#router-remember');
    await page.waitFor(
      `document.getElementById('connection-note').textContent.includes('next key you verify will be kept')`,
      'the intent to be noted',
    );
    await page.fill('#router-key', key);
    await page.click('#router-connect');
    await page.waitFor(
      `document.getElementById('connection-note').textContent.includes('The key is kept in your encrypted library')`,
      'the key to be verified and kept',
    );
    assert.deepEqual((await stored(page)).keys.sort(), ['library', 'secret:openrouter:personal']);
    accepted = 'sk-or-v1-' + 'another'.repeat(4);
    await start(page);
    await unlock(page);
    await page.waitFor(
      `document.getElementById('connection-note').textContent.includes('no longer accepts the key kept in your library')`,
      'the refused key to be removed',
    );
    assert.deepEqual((await stored(page)).keys, ['library']);
    assert.deepEqual(await routerModels(page), []);
    assert.deepEqual(await box(page), { checked: false, disabled: false });
    await page.close();
  },
);
