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
// `keep` sets the box that keeps the library unlocked in this tab across reloads.
async function unlock(page, { late = false, keep = null } = {}) {
  await page.waitFor(`!document.getElementById('library-storage').disabled`, 'the library to be ready');
  await page.click('#library-storage');
  await page.waitFor(`document.getElementById('library-unlock').open`, 'the passphrase dialog');
  if (keep !== null && (await page.evaluate(`document.getElementById('library-keep-tab').checked`)) !== keep)
    await page.click('#library-keep-tab');
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

// The other way to keep the key: for the open tab alone, in its session storage, with no passphrase.
const answerRouter = (page, accepted) =>
  page.route(router, (url, request) => {
    if (request.method === 'OPTIONS') return { body: {} };
    const sent = request.headers.Authorization ?? request.headers.authorization;
    if (url.endsWith('/api/v1/key'))
      return sent === 'Bearer ' + accepted()
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
const connected = `[...document.getElementById('chat-model').options].some((o) => o.value === 'synthetic/router-model')`;
const noted = (text) => `document.getElementById('connection-note').textContent.includes(${JSON.stringify(text)})`;
const tabBox = (page) => page.evaluate(`document.getElementById('router-tab').checked`);
const session = (page) => page.evaluate(`JSON.stringify({ ...sessionStorage })`);
const settle = (page) => page.evaluate(`new Promise((done) => setTimeout(done, 400))`);

test(
  'a ticked box keeps the OpenRouter key for the open tab: back after a reload, gone with the tab',
  options,
  async () => {
    const page = await stack.browser.newPage();
    let accepted = key;
    await answerRouter(page, () => accepted);
    await start(page);
    const before = stack.model.requests.length,
      had = (await stored(page)).keys;

    // Off by default: a verified key is kept nowhere and a reload asks for it again.
    assert.equal(await tabBox(page), false);
    await page.fill('#router-key', key);
    await page.click('#router-connect');
    await page.waitFor(connected, 'the OpenRouter models');
    assert.doesNotMatch((await stored(page)).text, /sk-or-v1/);
    await start(page);
    await settle(page);
    assert.deepEqual(await routerModels(page), []);

    // Ticked first, the next verified key is kept, in this tab's session storage and nowhere else.
    await page.click('#router-tab');
    await page.waitFor(noted('next key you verify will be kept for this tab'), 'the intent to be noted');
    assert.equal(await session(page), '{}');
    await page.fill('#router-key', key);
    await page.click('#router-connect');
    await page.waitFor(noted('The key is kept for this tab until you close it.'), 'the key to be kept');
    assert.deepEqual(JSON.parse(await session(page)), { 'pea-router-tab-v1:personal': key });
    assert.doesNotMatch(await page.evaluate(`JSON.stringify({ ...localStorage })`), /sk-or-v1/);
    assert.deepEqual((await stored(page)).keys, had, 'nothing new beside the library');

    // A reload connects with nothing typed and no passphrase; no model is asked anything.
    await start(page);
    await page.waitFor(connected, 'the key to come back after a reload');
    assert.equal(await tabBox(page), true);
    assert.equal(await page.evaluate(`document.getElementById('router-key').value`), '');
    assert.equal(stack.model.requests.length, before, 'no model was asked anything');

    // Work has none of its own, and Personal's is still there on the way back.
    await page.fill('#profile', 'work');
    await page.waitFor(`document.getElementById('profile').value === 'work'`);
    await settle(page);
    assert.deepEqual(await routerModels(page), []);
    assert.equal(await tabBox(page), false);
    await page.fill('#profile', 'personal');
    await page.waitFor(connected, 'Personal still connected');

    // Another tab has no copy.
    const other = await stack.browser.newPage();
    await answerRouter(other, () => accepted);
    await start(other);
    await settle(other);
    assert.equal(await session(other), '{}');
    assert.deepEqual(await routerModels(other), []);
    await other.close();

    // Kept in the library as well: after a reload the tab's copy connects before any passphrase,
    // unlocking shows the library's box as true, and locking leaves this tab connected.
    await unlock(page);
    await page.click('#router-remember');
    await page.waitFor(noted('now kept in your encrypted library'), 'the library copy');
    await start(page);
    await page.waitFor(connected, 'the tab copy to connect while the library is locked');
    assert.deepEqual(await box(page), { checked: false, disabled: true });
    await unlock(page);
    await page.waitFor(`document.getElementById('router-remember').checked`, 'the library box to read true');
    await page.click('#library-storage');
    await page.waitFor(`document.getElementById('router-remember').disabled`, 'the library to lock');
    assert.deepEqual(await routerModels(page), ['synthetic/router-model']);

    // Unticking forgets the tab's copy at once; the tab stays connected until the reload.
    await page.click('#router-tab');
    await page.waitFor(noted('no longer kept for this tab'), 'the copy to be forgotten');
    assert.equal(await session(page), '{}');
    assert.deepEqual(await routerModels(page), ['synthetic/router-model']);
    await start(page);
    await settle(page);
    assert.deepEqual(await routerModels(page), []);

    // Ticked while connected it is kept straight away, and Disconnect locally removes every copy.
    await page.fill('#router-key', key);
    await page.click('#router-connect');
    await page.waitFor(connected, 'the OpenRouter models again');
    await page.click('#router-tab');
    await page.waitFor(noted('a reload stays connected'), 'the key to be kept');
    assert.match(await session(page), /sk-or-v1/);
    await page.click('#router-forget');
    await page.waitFor(noted('Forgot'), 'the key to be forgotten');
    assert.equal(await session(page), '{}');
    assert.equal(await tabBox(page), false);
    await unlock(page);
    await settle(page);
    assert(!(await stored(page)).keys.some((name) => name.startsWith('secret:')), 'no copy in the library');
    assert.deepEqual(await routerModels(page), []);

    // A kept key that OpenRouter no longer accepts is forgotten and said so.
    await page.click('#router-tab');
    await page.fill('#router-key', key);
    await page.click('#router-connect');
    await page.waitFor(noted('The key is kept for this tab until you close it.'), 'the key to be kept again');
    accepted = 'sk-or-v1-' + 'another'.repeat(4);
    await start(page);
    await page.waitFor(noted('no longer accepts the key kept for this tab'), 'the refused key to be forgotten');
    assert.equal(await session(page), '{}');
    assert.equal(await tabBox(page), false);
    assert.deepEqual(await routerModels(page), []);
    await page.close();
  },
);

// Keeping a passphrase library unlocked for the open tab.
const libraryOpen = `!document.getElementById('router-remember').disabled`;
const copies = async (page) => (await stored(page)).keys.filter((name) => name.startsWith('tab-key')).length;
const libraryNoted = (text) =>
  `document.getElementById('notice').textContent.includes(${JSON.stringify(text)})`;

test(
  'a ticked box keeps a passphrase library unlocked for the open tab: open after a reload, in more than one tab, locked by Lock',
  options,
  async () => {
    const page = await stack.browser.newPage();
    let accepted = key;
    await answerRouter(page, () => accepted);
    await start(page);

    // Not ticked: a passphrase library is locked after a reload, and nothing is kept for the tab.
    await unlock(page, { keep: false });
    assert.equal(await session(page), '{}');
    assert.equal(await copies(page), 0);
    await start(page);
    await settle(page);
    assert.equal(await page.evaluate(libraryOpen), false, 'locked after a reload');

    // Ticked: a sealed copy beside the library, its secret in this tab's session storage only.
    await unlock(page, { keep: true });
    await page.waitFor(libraryNoted('stays unlocked in this tab'), 'the notice');
    const held = JSON.parse(await session(page));
    assert.deepEqual(Object.keys(held), ['pea-library-tab-v1']);
    assert.match(held['pea-library-tab-v1'], /^[0-9a-f]{64}$/);
    assert.equal(await copies(page), 1);
    const lasting = await page.evaluate(`JSON.stringify({ ...localStorage })`);
    assert(!lasting.includes(held['pea-library-tab-v1']), 'the secret is not in lasting storage');
    assert(!lasting.includes(passphrase) && !(await session(page)).includes(passphrase));

    // An OpenRouter key kept in the library comes back with it.
    await page.fill('#router-key', key);
    await page.click('#router-connect');
    await page.waitFor(connected, 'the OpenRouter models');
    await page.click('#router-remember');
    await page.waitFor(noted('now kept in your encrypted library'), 'the library copy');

    // A reload opens the library by itself: no passphrase window, and the kept key reconnects.
    await start(page);
    await page.waitFor(libraryOpen, 'the library to open by itself');
    assert.equal(await page.evaluate(`document.getElementById('library-unlock').open`), false);
    await page.waitFor(connected, 'the kept key to reconnect');
    assert.equal(await page.evaluate(`document.getElementById('library-keep-tab').checked`), true);
    assert.equal(await page.evaluate(`document.getElementById('library-passphrase').value`), '');

    // Another tab on the same browser has no secret and stays locked.
    const other = await stack.browser.newPage(page);
    await answerRouter(other, () => accepted);
    await start(other);
    await settle(other);
    assert.equal(await session(other), '{}');
    assert.equal(await other.evaluate(libraryOpen), false, 'another tab is locked');
    assert.deepEqual(await routerModels(other), []);

    // Ticked there too, both tabs keep it: each has its own secret and its own sealed copy.
    await unlock(other, { keep: true });
    await other.waitFor(`sessionStorage.getItem('pea-library-tab-v1') !== null`, 'the second tab’s secret');
    const second = JSON.parse(await session(other))['pea-library-tab-v1'];
    assert.match(second, /^[0-9a-f]{64}$/);
    assert.notEqual(second, held['pea-library-tab-v1']);
    assert.equal(await copies(page), 2);
    await start(page);
    await page.waitFor(libraryOpen, 'the first tab still opens by itself');
    await start(other);
    await other.waitFor(libraryOpen, 'the second tab opens by itself');
    await other.waitFor(connected, 'the kept key to reconnect in the second tab');
    assert.equal(await other.evaluate(`document.getElementById('library-unlock').open`), false);

    // Lock in the second tab ends it there only.
    await other.click('#library-storage');
    await other.waitFor(`document.getElementById('router-remember').disabled`, 'the second tab to lock');
    assert.equal(await session(other), '{}');
    assert.equal(await copies(page), 1);
    await start(other);
    await settle(other);
    assert.equal(await other.evaluate(libraryOpen), false, 'the second tab is locked after its Lock');
    await other.close();
    await start(page);
    await page.waitFor(libraryOpen, 'the first tab still opens by itself after the other locked');

    // Lock means locked: both halves go, and a reload asks for the passphrase.
    await page.click('#library-storage');
    await page.waitFor(`document.getElementById('router-remember').disabled`, 'the library to lock');
    assert.equal(await session(page), '{}');
    assert.equal(await copies(page), 0);
    await start(page);
    await settle(page);
    assert.equal(await page.evaluate(libraryOpen), false, 'locked after Lock and a reload');

    // A secret that does not open the copy is forgotten, and the passphrase is asked for.
    await unlock(page, { keep: true });
    await page.evaluate(`sessionStorage.setItem('pea-library-tab-v1', 'ab'.repeat(32))`);
    await start(page);
    await settle(page);
    assert.equal(await page.evaluate(libraryOpen), false);
    assert.equal(await session(page), '{}');
    // The copy whose secret was overwritten belongs to no tab now and opens nothing; it is left
    // for the tidy-up at the next keep, as another tab's copy would be.
    assert.equal(await copies(page), 1);
    await unlock(page, { keep: true });
    await page.waitFor(`sessionStorage.getItem('pea-library-tab-v1') !== null`, 'a fresh secret');
    assert.equal(await copies(page), 2);
    await page.close();
  },
);
