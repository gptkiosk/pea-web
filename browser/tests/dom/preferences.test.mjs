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

// The one credential that can be kept: this server's own connection token, and only when asked.
const keptToken = (page) => page.evaluate(`localStorage.getItem('pea-local-token-v1')`);
const hasLocalModels = `[...document.querySelector('#chat-model').options].some((o) => o.value.startsWith('local:'))`;
const note = (page) => page.evaluate(`document.querySelector('#connection-note').textContent`);
async function reload(page) {
  await page.goto(stack.gateway.origin + '/');
  await page.waitFor(
    `document.querySelector('#local-connect').onclick && !document.querySelector('#local-connect').disabled`,
    'the app to finish starting',
  );
}

test(
  'a ticked box keeps the connection token, and a reload connects by itself',
  { skip, timeout: 60000 },
  async () => {
    const page = await openConnectedPage(stack);
    assert.equal(await checked(page, '#local-remember'), false, 'remembering is off until asked for');
    assert.equal(await keptToken(page), null, 'connecting alone keeps nothing');

    // Ticking the box while connected keeps the token this tab already holds.
    await page.click('#local-remember');
    assert.equal(await keptToken(page), stack.gateway.token);
    assert.match(await note(page), /remembered on this browser/);
    const kept = await saved(page);
    assert.equal(kept.split(stack.gateway.token).length, 2, 'the token is kept in exactly one place');
    assert.doesNotMatch(
      await page.evaluate(`localStorage.getItem('pea-connections-v1') || ''`),
      new RegExp(stack.gateway.token),
      'the remembered choices still hold no token',
    );

    await reload(page);
    await page.waitFor(hasLocalModels, 'the local model list, with nothing typed');
    assert.equal(await value(page, '#local-token'), '', 'the token is never put back in the field');
    assert.equal(await checked(page, '#local-remember'), true);
    // The Versions window can check for updates straight away: no trip to Connections.
    await page.click('#releases-open');
    await page.waitFor(
      `document.querySelector('#release-dialog').open && document.querySelector('#release-update-open').hidden`,
      'the update panel to see the connection',
    );
    await page.evaluate(`document.querySelector('#release-dialog').close()`);

    // Another profile opened in the same tab is connected too.
    await page.fill('#profile', 'work');
    await page.waitFor(hasLocalModels, 'the local model list in the other profile');

    // Connecting again with the box still ticked keeps it; nothing is sent to a model by any of this.
    assert.equal(stack.model.requests.length, 0, 'restoring the connection asks no model anything');

    // Unticking forgets at once, and the tab stays connected.
    const second = page;
    await reload(second);
    await second.waitFor(hasLocalModels, 'the local model list again');
    assert.equal(await checked(second, '#local-remember'), true);
    await second.click('#local-remember');
    assert.equal(await keptToken(second), null);
    assert.match(await note(second), /no longer remembered/);
    assert.equal(await second.evaluate(hasLocalModels), true, 'this tab is still connected');
    await reload(second);
    await new Promise((resolve) => setTimeout(resolve, 600));
    assert.equal(await second.evaluate(hasLocalModels), false, 'nothing connects after the next reload');
    await second.close();
  },
);

test(
  'the kept token goes with Forget local token and with Forget remembered choices',
  { skip, timeout: 60000 },
  async () => {
    const page = await openConnectedPage(stack);
    // Ticked before connecting: the connect itself keeps it.
    await page.click('#local-forget');
    assert.equal(await page.evaluate(hasLocalModels), false);
    await page.click('#local-remember');
    assert.equal(await keptToken(page), null, 'a ticked box with no connection keeps nothing yet');
    await page.fill('#local-token', stack.gateway.token);
    await page.click('#local-connect');
    await page.waitFor(hasLocalModels, 'the local model list');
    assert.equal(await keptToken(page), stack.gateway.token);

    await page.click('#local-forget');
    assert.equal(await keptToken(page), null);
    assert.equal(await checked(page, '#local-remember'), false);
    assert.equal(await page.evaluate(hasLocalModels), false);
    assert(!(await saved(page)).includes(stack.gateway.token));

    await page.click('#local-remember');
    await page.fill('#local-token', stack.gateway.token);
    await page.click('#local-connect');
    await page.waitFor(hasLocalModels, 'the local model list');
    assert.equal(await keptToken(page), stack.gateway.token);
    await page.click('#choices-forget');
    assert.equal(await keptToken(page), null);
    assert.equal(await checked(page, '#local-remember'), false);
    await page.close();
  },
);

test(
  'a kept token this server no longer accepts is forgotten, and other stored values are not used',
  { skip, timeout: 60000 },
  async () => {
    const page = await openConnectedPage(stack);
    const wrong = 'w'.repeat(43);
    await page.evaluate(`localStorage.setItem('pea-local-token-v1', ${JSON.stringify(wrong)})`);
    await reload(page);
    await page.waitFor(`localStorage.getItem('pea-local-token-v1') === null`, 'the refused token to go');
    assert.match(await note(page), /no longer accepts the remembered connection token/);
    assert.equal(await checked(page, '#local-remember'), false);
    assert.equal(await page.evaluate(hasLocalModels), false);

    // Something that is not shaped like a token is never sent anywhere.
    await page.evaluate(`localStorage.setItem('pea-local-token-v1', 'not a token <script>')`);
    await reload(page);
    await new Promise((resolve) => setTimeout(resolve, 600));
    assert.equal(await checked(page, '#local-remember'), false);
    assert.equal(await page.evaluate(hasLocalModels), false);
    await page.evaluate(`localStorage.removeItem('pea-local-token-v1')`);
    await page.close();
  },
);

// Sends a Chat message and says whether the sharing review came up first. An opened review is approved.
async function sendAndSee(page, message) {
  const sent = stack.model.requests.length;
  await page.fill('#thought', message);
  await page.evaluate(`document.querySelector('#composer').requestSubmit()`);
  let reviewed = false;
  for (let i = 0; i < 100 && stack.model.requests.length === sent && !reviewed; i++) {
    reviewed = await page.evaluate(`document.querySelector('#review').open`);
    if (!reviewed) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (reviewed) {
    await page.click('#review-approve');
    await page.waitFor(`!document.querySelector('#review').open`);
  }
  for (let i = 0; i < 100 && stack.model.requests.length === sent; i++)
    await new Promise((resolve) => setTimeout(resolve, 100));
  assert(stack.model.requests.length > sent, 'the request reached the model');
  await page.waitFor(`!document.querySelector('#profile').disabled`, 'the reply to finish');
  return reviewed;
}
const approvals = (page) => page.evaluate(`sessionStorage.getItem('pea-share-approvals-v1')`);

test(
  'a sharing review approved in this tab is not asked again after a reload, until something changes',
  { skip, timeout: 90000 },
  async () => {
    const page = await openConnectedPage(stack);
    await page.click('#local-remember');
    assert.equal(await approvals(page), null, 'nothing is kept before a review is approved');

    // The first message is reviewed; what is kept is one digest, not a word of what was reviewed.
    assert.equal(await sendAndSee(page, 'A first synthetic message.'), true);
    const kept = JSON.parse(await approvals(page));
    assert.equal(kept.length, 1);
    assert.match(kept[0], /^[0-9a-f]{64}$/);
    assert.equal(await page.evaluate(`Object.keys(sessionStorage).length`), 1);
    assert.doesNotMatch(await saved(page), /pea-share-approvals/, 'not in the browser\'s lasting storage');
    assert.equal(await sendAndSee(page, 'A second synthetic message.'), false);

    // After a reload, with the model connected by the remembered token, the same choices are not
    // reviewed again.
    await reload(page);
    await page.waitFor(hasLocalModels, 'the local model list, with nothing typed');
    assert.equal(await sendAndSee(page, 'A message after the reload.'), false, 'no review after a reload');

    // Changing what is shared forgets every kept approval, and the next message is reviewed.
    await page.evaluate(`document.querySelector('#share-todos').click()`);
    assert.equal(await approvals(page), null);
    assert.equal(await sendAndSee(page, 'A message after a changed choice.'), true);
    assert.equal(JSON.parse(await approvals(page)).length, 1);

    // Disconnecting forgets them too.
    await page.evaluate(`document.querySelector('#local-forget').click()`);
    assert.equal(await approvals(page), null);

    // Anything in their place that is not a digest counts for nothing.
    await page.evaluate(`sessionStorage.setItem('pea-share-approvals-v1', '["not a digest", 7]')`);
    await page.fill('#local-token', stack.gateway.token);
    await page.evaluate(`document.querySelector('#local-connect').click()`);
    await page.waitFor(hasLocalModels, 'the local model list again');
    assert.equal(await sendAndSee(page, 'A message after reconnecting.'), true, 'reconnecting asks again');

    // A change in the library forgets them as well, as restoring a conversation or locking does.
    assert.equal(JSON.parse(await approvals(page)).length, 1);
    await page.evaluate(
      `document.querySelector('#bio-presence').dispatchEvent(new Event('change', { bubbles: true }))`,
    );
    assert.equal(await approvals(page), null);
    await page.close();
  },
);
