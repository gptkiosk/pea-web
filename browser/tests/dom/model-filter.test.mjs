// Browser-level checks for "Find a model": typing narrows every model list, a model already
// chosen is never dropped from its list, and several local models are never chosen for the owner.
// Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { browserSkipReason, startStack } from './harness.mjs';

const skip = browserSkipReason();
const options = { skip, timeout: 60000 };
const models = [
  'synthetic-model',
  'nemotron-nano-9b',
  'nemotron-super-49b',
  'llama-nemotron-70b',
  'haiku-small',
  'haiku-large',
  'sonnet-medium',
  'qwen3-4b',
  'qwen3-30b',
  'mistral-small',
  'gemma-12b',
  'phi-mini',
];

let stack;
before(
  async () => {
    if (!skip) stack = await startStack(() => 'A plain synthetic reply.', { models });
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

const listed = (page, id) =>
  page.evaluate(
    `[...document.getElementById(${JSON.stringify(id)}).options].map((o) => o.value).filter(Boolean)`,
  );
const type = (page, text) =>
  page.evaluate(
    `(() => { const box = document.getElementById('model-filter'); box.value = ${JSON.stringify(text)}; box.dispatchEvent(new Event('input', { bubbles: true })); })()`,
  );

test('typing in Find a model narrows every list and keeps what is already chosen', options, async () => {
  const page = await stack.browser.newPage();
  await page.goto(stack.gateway.origin + '/');
  await page.waitFor(
    `document.querySelector('#local-connect').onclick && !document.querySelector('#local-connect').disabled`,
    'the app to finish starting',
  );
  assert.equal(await page.evaluate(`document.getElementById('model-filter-row').hidden`), true);
  await page.fill('#local-token', stack.gateway.token);
  await page.click('#local-connect');
  await page.waitFor(`document.getElementById('chat-model').options.length > 12`, 'the model list');
  assert.equal(await page.evaluate(`document.getElementById('model-filter-row').hidden`), false);
  assert.equal(await page.text('#model-filter-count'), '12 models loaded');
  // With several local models there is no one-press offer: PEA does not choose among them.
  assert.deepEqual(
    await page.evaluate(`[...document.querySelectorAll('.use-only-model')].map((b) => b.hidden)`),
    [true, true],
  );
  assert.equal(await page.evaluate(`document.getElementById('chat-model').value`), '');

  await type(page, 'nemotron');
  const nemotron = ['local:nemotron-nano-9b', 'local:nemotron-super-49b', 'local:llama-nemotron-70b'];
  for (const id of ['chat-model', 'collaboration-model', 'coding-model'])
    assert.deepEqual(await listed(page, id), nemotron, id);
  assert.equal(await page.text('#model-filter-count'), '3 of 12 models match');

  await type(page, 'HAIKU');
  assert.deepEqual(await listed(page, 'chat-model'), ['local:haiku-small', 'local:haiku-large']);
  await page.fill('#chat-model', 'local:haiku-large');
  assert.equal(await page.text('#active-model'), 'Chat · haiku-large');

  // The chosen model stays in its own list whatever is typed; the other lists follow the filter.
  await type(page, '70b nemotron');
  assert.deepEqual(await listed(page, 'chat-model'), ['local:llama-nemotron-70b', 'local:haiku-large']);
  assert.equal(await page.evaluate(`document.getElementById('chat-model').value`), 'local:haiku-large');
  assert.deepEqual(await listed(page, 'coding-model'), ['local:llama-nemotron-70b']);

  await type(page, 'no-such-model');
  assert.deepEqual(await listed(page, 'chat-model'), ['local:haiku-large']);
  assert.deepEqual(await listed(page, 'coding-model'), []);
  assert.equal(await page.text('#model-filter-count'), 'No model matches. 12 are loaded.');

  await type(page, '');
  assert.equal((await listed(page, 'chat-model')).length, 12);
  assert.equal(await page.evaluate(`document.getElementById('chat-model').value`), 'local:haiku-large');
  assert.equal(stack.model.requests.length, 0, 'finding and choosing a model sends nothing to it');
  assert.deepEqual(page.outsideRequests(), []);
  await page.close();
});
