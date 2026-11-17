// Browser-level checks that Connections remembers the owner's choices across a reload, and never
// a key or token. Run with: node --test browser/tests/dom/preferences.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { browserSkipReason, openConnectedPage, startStack } from './harness.mjs';

const skip = browserSkipReason();
let stack;
before(
  async () => {
    if (skip) return;
    stack = await startStack(() => 'A plain synthetic reply.');
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

const value = (page, id) => page.evaluate(`document.querySelector(${JSON.stringify(id)}).value`);
const checked = (page, id) => page.evaluate(`document.querySelector(${JSON.stringify(id)}).checked`);
const saved = (page) => page.evaluate(`JSON.stringify(Object.entries(localStorage))`);
// Loads the app again in the same browser storage and connects the local model, choosing nothing.
async function reloadAndConnect(page) {
  await page.goto(stack.gateway.origin + '/');
  await page.waitFor(
    `document.querySelector('#local-connect').onclick && !document.querySelector('#local-connect').disabled`,
    'the app to finish starting',
  );
  assert.equal(await value(page, '#local-token'), '', 'the connection token is not filled in again');
  await page.fill('#local-token', stack.gateway.token);
  await page.click('#local-connect');
  await page.waitFor(
    `[...document.querySelector('#chat-model').options].some((o) => o.value.startsWith('local:'))`,
    'the local model list',
  );
}

test(
  'choices come back after a reload, the token does not, and sharing is still reviewed',
  { skip, timeout: 60000 },
  async () => {
    const page = await openConnectedPage(stack);
    await page.fill('#profile', 'personal');
    await page.fill('#chat-model', 'local:synthetic-model');
    await page.click('#share-intro');
    await page.click('#share-todos');
    await page.click('#allow-data');
    await page.fill('#greenhouse-role', 'coding');
    await page.fill('#google-client', 'synthetic-client.apps.googleusercontent.com');
    await page.click('#google-calendar-write');
    assert.equal(await checked(page, '#allow-data'), true);

    const kept = await saved(page);
    assert.match(kept, /pea-connections-v1/);
    assert.match(kept, /local:synthetic-model/);
    assert(!kept.includes(stack.gateway.token), 'the connection token is never saved');
    assert.doesNotMatch(kept, /allowData|localKey|"key"/);

    await reloadAndConnect(page);
    assert.equal(await value(page, '#profile'), 'personal');
    assert.equal(
      await value(page, '#chat-model'),
      'local:synthetic-model',
      'the model is chosen again by itself',
    );
    assert.equal(await checked(page, '#share-intro'), true);
    assert.equal(await checked(page, '#share-todos'), true);
    assert.equal(await checked(page, '#share-calendar'), false);
    assert.equal(await value(page, '#greenhouse-role'), 'coding');
    assert.equal(await value(page, '#google-client'), 'synthetic-client.apps.googleusercontent.com');
    assert.equal(await checked(page, '#google-calendar-write'), true);
    assert.equal(await checked(page, '#allow-data'), false, 'the retain-or-train consent is asked for again');

    // Remembering a switch is not approval: the first message in the new tab is still reviewed.
    const sent = stack.model.requests.length;
    await page.fill('#thought', 'A plain question.');
    await page.evaluate(`document.querySelector('#composer').requestSubmit()`);
    await page.waitFor(`document.querySelector('#review').open`, 'the sharing review');
    assert.equal(stack.model.requests.length, sent, 'nothing is sent before the review');
    await page.click('#review-cancel');
    await page.waitFor(`!document.querySelector('#review').open`);
    assert.equal(stack.model.requests.length, sent);
    await page.close();
  },
);

test('choices are kept per profile, and can be forgotten', { skip, timeout: 60000 }, async () => {
  const page = await openConnectedPage(stack);
  await page.fill('#profile', 'personal');
  await page.fill('#chat-model', 'local:synthetic-model');
  await page.click('#share-intro');
  await page.fill('#profile', 'work');
  await page.click('#share-todos');

  await reloadAndConnect(page);
  await page.fill('#profile', 'personal');
  assert.deepEqual([await checked(page, '#share-intro'), await checked(page, '#share-todos')], [true, false]);
  await page.fill('#profile', 'work');
  assert.deepEqual([await checked(page, '#share-intro'), await checked(page, '#share-todos')], [false, true]);
  assert.equal(await value(page, '#chat-model'), '', 'Work never chose a model, so none is chosen for it');

  await page.click('#choices-forget');
  assert.doesNotMatch(await saved(page), /pea-connections-v1/);
  await reloadAndConnect(page);
  await page.fill('#profile', 'work');
  assert.equal(await checked(page, '#share-todos'), false);
  await page.fill('#profile', 'personal');
  assert.equal(await checked(page, '#share-intro'), false);
  assert.equal(await value(page, '#chat-model'), '');
  await page.close();
});
