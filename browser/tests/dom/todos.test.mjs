// Browser-level checks for the to-do list: owner edits, reviewed model changes, sharing and reminders.
// Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { askModel, browserSkipReason, openConnectedPage, openReview, startStack } from './harness.mjs';

const skip = browserSkipReason();
const options = { skip, timeout: 60000 };
const pad = (n) => String(n).padStart(2, '0');
const local = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
const tomorrow = new Date(Date.now() + 86400000);
const block = (rows) => '```pea-task\n' + JSON.stringify(rows) + '\n```\n';
const replies = {
  remind:
    'Here is that reminder.\n' +
    block([{ op: 'task_add', title: 'Call the synthetic dentist', due: local(tomorrow), remind: true }]),
  finish: 'Checking that off.\n' + block([{ op: 'task_done', title: 'synthetic dentist' }]),
  unclear: 'Checking that off.\n' + block([{ op: 'task_done', title: 'no such item anywhere' }]),
  boast: 'All set, I’ve added milk to your to-do list.',
  remove: 'Removing it.\n' + block([{ op: 'task_delete', title: 'Call the synthetic dentist' }]),
};

let stack;
before(
  async () => {
    if (!skip)
      stack = await startStack((said) => {
        const key = Object.keys(replies).find((word) => said.includes(word));
        return key ? replies[key] : 'A plain synthetic reply.';
      });
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

const openTitles = (page) =>
  page.evaluate(
    `[...document.querySelectorAll('#todo-list .todo-item label span')].map((s) => s.textContent)`,
  );
const finishedTitles = (page) =>
  page.evaluate(
    `[...document.querySelectorAll('#todo-finished .todo-item label span')].map((s) => s.textContent)`,
  );
// The list takes nothing until the board has finished starting, a moment after the page opens;
// the field is disabled until then. Adding sooner is refused with a notice.
const listReady = (page) =>
  page.waitFor(`!document.getElementById('todo-title').disabled`, 'the to-do list to be ready');
const addByHand = async (page, title) => {
  await listReady(page);
  await page.fill('#todo-title', title);
  await page.evaluate(`document.getElementById('todo-add').requestSubmit()`);
};
const noticed = (page, text) =>
  page.waitFor(
    `(window.peaNotices || []).some((n) => n.includes(${JSON.stringify(text)}))`,
    'notice: ' + text,
  );
const systemPrompt = () => stack.model.requests.at(-1).messages[0].content;

test('the owner can add, check off, reopen and remove to-dos by hand', options, async () => {
  const page = await openConnectedPage(stack, { width: 1500 });
  await page.click('#tab-today');
  await addByHand(page, '  Buy   synthetic milk ');
  await addByHand(page, 'Water the synthetic plant');
  assert.deepEqual(await openTitles(page), ['Buy synthetic milk', 'Water the synthetic plant']);
  assert.equal(await page.text('#todo-count'), '2 open');

  await addByHand(page, 'buy synthetic MILK');
  await noticed(page, 'already on your list');
  assert.equal((await openTitles(page)).length, 2);

  await page.evaluate(`document.querySelector('#todo-list .todo-item input').click()`);
  await page.waitFor(
    `document.querySelectorAll('#todo-finished .todo-item').length === 1`,
    'the finished item',
  );
  assert.deepEqual(await finishedTitles(page), ['Buy synthetic milk']);
  assert.equal(await page.text('#todo-count'), '1 open');

  await page.evaluate(`document.querySelector('#todo-finished .todo-item input').click()`);
  await page.waitFor(`document.querySelectorAll('#todo-list .todo-item').length === 2`, 'the reopened item');

  await page.evaluate(`document.querySelector('#todo-list .todo-item button').click()`);
  await page.waitFor(`document.querySelectorAll('#todo-list .todo-item').length === 1`, 'one item left');

  await page.fill('#profile', 'blended');
  assert.equal(await page.evaluate(`document.getElementById('todo-title').disabled`), true);
  assert.deepEqual(await openTitles(page), [], 'the Blended profile shows no list');
  await page.fill('#profile', 'work');
  assert.deepEqual(await openTitles(page), [], 'Work does not see Personal items');
  assert.deepEqual(page.outsideRequests(), []);
  await page.close();
});

test('a model can only propose to-do changes; the owner approves the exact list', options, async () => {
  const page = await openConnectedPage(stack, { width: 1500 });
  await page.click('#split-toggle');
  await askModel(stack, page, 'Please remind me about the dentist.');
  assert.doesNotMatch(await page.text('#messages'), /pea-task|task_add/, 'the action block is hidden');
  assert.deepEqual(await openTitles(page), []);

  await openReview(page, 'Review to-do changes');
  const shown = await page.text('#review-body');
  assert.match(shown, /Add: “Call the synthetic dentist” · due .+ · remind me/);
  assert.match(shown, /only while PEA is open/);
  await page.click('#review-cancel');
  await page.waitFor(`!document.getElementById('review').open`);
  assert.deepEqual(await openTitles(page), [], 'cancel changes nothing');

  await openReview(page, 'Review to-do changes');
  await page.click('#review-approve');
  await page.waitFor(`document.querySelectorAll('#todo-list .todo-item').length === 1`, 'the approved to-do');
  assert.deepEqual(await openTitles(page), ['Call the synthetic dentist']);
  assert.match(await page.text('#todo-list'), /Due .+ · reminder/);
  await page.waitFor(
    `document.getElementById('messages').innerText.includes('Added to your list: “Call the synthetic dentist” (reminder set).')`,
    'the receipt of what happened',
  );
  assert.equal(await page.hasText('Review to-do changes'), false, 'the proposal cannot be applied twice');

  await askModel(stack, page, 'Please finish the dentist one.');
  await openReview(page, 'Review to-do changes');
  assert.match(await page.text('#review-body'), /Check off: “synthetic dentist”/);
  await page.click('#review-approve');
  await page.waitFor(
    `document.querySelectorAll('#todo-finished .todo-item').length === 1`,
    'the checked-off item',
  );
  assert.deepEqual(await openTitles(page), []);

  await askModel(stack, page, 'This one is unclear.');
  await openReview(page, 'Review to-do changes');
  await page.click('#review-approve');
  await page.waitFor(
    `document.getElementById('messages').innerText.includes('Left as it was: could not tell which item')`,
    'an honest account of what was not done',
  );
  assert.deepEqual(page.outsideRequests(), []);
  await page.close();
});

test('a claimed change and an unsupported request change nothing', options, async () => {
  const page = await openConnectedPage(stack, { width: 1500 });
  await askModel(stack, page, 'Please boast.');
  await page.waitFor(
    `document.getElementById('messages').innerText.includes('PEA did not change your to-do list')`,
    'the correction',
  );
  await askModel(stack, page, 'Please remove it.');
  assert.equal(await page.hasText('Review to-do changes'), false, 'a model cannot delete');
  assert.doesNotMatch(await page.text('#messages'), /task_delete/);
  await page.close();
});

test('the list reaches the model only after the owner shares it and approves again', options, async () => {
  const page = await openConnectedPage(stack, { width: 1500 });
  await page.click('#tab-today');
  await addByHand(page, 'SYNTHETIC PRIVATE ERRAND');
  await page.fill('#profile', 'work');
  await addByHand(page, 'SYNTHETIC WORK ERRAND');
  await page.fill('#profile', 'personal');
  await page.fill('#chat-model', 'local:synthetic-model');
  await page.click('#tab-chat');

  await askModel(stack, page, 'What is on my list?');
  assert.match(systemPrompt(), /pea-task/, 'the model is told how to propose a change');
  assert.match(systemPrompt(), /has not shared the list/);
  assert.doesNotMatch(systemPrompt(), /SYNTHETIC PRIVATE ERRAND|SYNTHETIC WORK ERRAND/);

  await page.click('#share-todos');
  const sent = stack.model.requests.length;
  await page.fill('#thought', 'And now?');
  await page.evaluate(`document.getElementById('composer').requestSubmit()`);
  await page.waitFor(
    `document.getElementById('review').open`,
    'a new sharing review after the setting changed',
  );
  assert.match(await page.text('#review-body'), /To-do list: Shared under your setting/);
  assert.equal(stack.model.requests.length, sent);
  await page.click('#review-approve');
  await page.waitFor(`!document.getElementById('profile').disabled && ${sent} < ${sent} + 1`, 'the reply');
  await page.waitFor(`!document.getElementById('review').open`);
  for (let i = 0; i < 100 && stack.model.requests.length === sent; i++)
    await new Promise((resolve) => setTimeout(resolve, 40));
  assert.match(systemPrompt(), /- SYNTHETIC PRIVATE ERRAND/);
  assert.doesNotMatch(systemPrompt(), /SYNTHETIC WORK ERRAND/, 'another profile’s list is never sent');
  await page.close();
});

test('a reminder appears in the page when its time comes, once', options, async () => {
  const page = await openConnectedPage(stack, { width: 1500 });
  await askModel(stack, page, 'Please remind me about the dentist.');
  await openReview(page, 'Review to-do changes');
  await page.click('#review-approve');
  await page.waitFor(`document.querySelectorAll('#todo-list .todo-item').length === 1`, 'the to-do');
  assert.equal(await page.evaluate(`document.getElementById('todo-reminders-box').hidden`), true);

  // Move the page's clock past the due time, then let the app notice as it would on returning to the tab.
  await page.evaluate(
    `(() => { const real = Date.now.bind(Date); Date.now = () => real() + 2 * 86400000; document.dispatchEvent(new Event('visibilitychange')); })()`,
  );
  await page.waitFor(`!document.getElementById('todo-reminders-box').hidden`, 'the reminder');
  assert.match(await page.text('#todo-reminders'), /Call the synthetic dentist/);
  await noticed(page, 'Reminder: Call the synthetic dentist');
  await page.evaluate(`document.dispatchEvent(new Event('visibilitychange'))`);
  assert.equal(
    await page.evaluate(`document.querySelectorAll('#todo-reminders li').length`),
    1,
    'shown once',
  );
  await page.click('#todo-reminders-dismiss');
  assert.equal(await page.evaluate(`document.getElementById('todo-reminders-box').hidden`), true);
  assert.deepEqual(page.outsideRequests(), []);
  await page.close();
});

test('to-dos are saved with the encrypted board and come back after unlocking', options, async () => {
  const page = await openConnectedPage(stack, { width: 1500 });
  await page.click('#tab-today');
  await addByHand(page, 'SYNTHETIC SAVED ERRAND');
  await page.evaluate(`document.getElementById('tasks-section').open = true`);
  await page.click('#board-storage');
  await page.waitFor(`document.getElementById('board-unlock').open`, 'the passphrase dialog');
  await page.fill('#board-passphrase', 'synthetic board passphrase');
  await page.click('#board-unlock-submit');
  await page.waitFor(`!document.getElementById('board-unlock').open`, 'the board to be encrypted', 20000);
  await page.waitFor(
    `document.getElementById('board-storage-note').textContent.includes('saved') || document.getElementById('board-storage-note').textContent.includes('unlocked')`,
    'the save',
  );

  await page.goto(stack.gateway.origin + '/');
  await page.waitFor(
    `document.getElementById('todo-empty').textContent.includes('Unlock the saved board')`,
    'the locked state after reload',
  );
  assert.deepEqual(await openTitles(page), [], 'nothing is readable while locked');
  const stored = await page.evaluate(
    `new Promise((resolve) => { const r = indexedDB.open('pea-task-board-v1'); r.onsuccess = () => { const g = r.result.transaction('encrypted').objectStore('encrypted').get('board'); g.onsuccess = () => resolve(new TextDecoder().decode(g.result.data)); }; })`,
  );
  assert.doesNotMatch(stored, /SYNTHETIC/, 'the saved record is not readable text');

  await page.evaluate(`document.getElementById('tasks-section').open = true`);
  await page.click('#board-storage');
  await page.waitFor(`document.getElementById('board-unlock').open`);
  await page.fill('#board-passphrase', 'synthetic board passphrase');
  await page.click('#board-unlock-submit');
  await page.waitFor(
    `document.querySelectorAll('#todo-list .todo-item').length === 1`,
    'the to-do after unlock',
    20000,
  );
  assert.deepEqual(await openTitles(page), ['SYNTHETIC SAVED ERRAND']);
  await page.close();
});
