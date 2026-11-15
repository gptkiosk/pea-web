// Browser-level checks for the desktop workspace: two panes on a wide screen, one on a narrow one.
// Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { askModel, browserSkipReason, openConnectedPage, openReview, startStack } from './harness.mjs';

const skip = browserSkipReason();
const options = { skip, timeout: 45000 };
const story =
  'I can capture that.\n```pea-task\n' +
  JSON.stringify({ op: 'task_add', title: 'Synthetic story', details: 'Synthetic scope' }) +
  '\n```\n';

let stack;
before(
  async () => {
    if (!skip)
      stack = await startStack((said) => (said.includes('story') ? story : 'A plain synthetic reply.'));
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

const shown = (page) =>
  page.evaluate(
    `[...document.querySelectorAll('.panel')].filter((p) => !p.hidden && p.offsetParent !== null).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left).map((p) => p.id)`,
  );
const focused = (page) => page.evaluate(`document.querySelector('[data-tab].selected').dataset.tab`);
const toggleShown = (page) =>
  page.evaluate(`getComputedStyle(document.querySelector('#split-toggle')).display !== 'none'`);

test('a wide screen can show two workspaces side by side and return to one', options, async () => {
  const page = await openConnectedPage(stack, { width: 1500 });
  assert.deepEqual(await shown(page), ['chat']);
  assert.equal(await toggleShown(page), true);

  await page.click('#split-toggle');
  assert.deepEqual(await shown(page), ['chat', 'today']);
  assert.equal(await focused(page), 'chat');
  const widths = await page.evaluate(
    `['chat', 'today'].map((id) => Math.round(document.getElementById(id).getBoundingClientRect().width))`,
  );
  assert(Math.abs(widths[0] - widths[1]) < 4, 'the panes start equal: ' + widths);
  assert.equal(
    await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`),
    true,
    'no sideways scrolling',
  );

  const gap = await page.evaluate(
    `Math.round(document.getElementById('chat').getBoundingClientRect().top - document.querySelector('.setup-strip').getBoundingClientRect().bottom)`,
  );
  assert(gap >= 12, 'the panes sit clear of the setup cards above them: ' + gap);

  await page.click('#tab-today');
  assert.deepEqual(await shown(page), ['chat', 'today'], 'going to a shown workspace keeps both');
  assert.equal(await focused(page), 'today');

  await page.click('#tab-greenhouse');
  assert.deepEqual(await shown(page), ['chat', 'greenhouse'], 'a new workspace replaces the focused pane');

  await page.evaluate(
    `document.querySelector('#tab-today').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true }))`,
  );
  assert.deepEqual(await shown(page), ['greenhouse', 'today'], 'Shift-click opens beside the focused pane');

  await page.evaluate(`document.querySelector('#today .pane-bar [aria-label="Close Today pane"]').click()`);
  assert.deepEqual(await shown(page), ['greenhouse']);
  assert.equal(await page.evaluate(`document.querySelectorAll('.pane-bar:not([hidden])').length`), 0);
  await page.close();
});

test('the divider resizes within limits by keyboard and the layout survives a reload', options, async () => {
  const page = await openConnectedPage(stack, { width: 1500 });
  await page.click('#split-toggle');
  const ratio = () => page.evaluate(`JSON.parse(localStorage.getItem('pea-workspace-v1')).ratio`);
  const press = (key) =>
    page.evaluate(
      `document.querySelector('#pane-divider').dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true }))`,
    );
  await press('ArrowRight');
  assert.equal(await ratio(), 0.52);
  await press('End');
  assert.equal(await ratio(), 0.7);
  await press('Home');
  assert.equal(await ratio(), 0.3);
  const widths = await page.evaluate(
    `['chat', 'today'].map((id) => document.getElementById(id).getBoundingClientRect().width)`,
  );
  assert(widths[0] < widths[1], 'the left pane is the narrow one: ' + widths);

  const saved = await page.evaluate(`localStorage.getItem('pea-workspace-v1')`);
  assert.deepEqual(
    Object.keys(JSON.parse(saved)).sort(),
    ['focus', 'panes', 'ratio'],
    'names and a width only',
  );

  await page.goto(stack.gateway.origin + '/');
  assert.deepEqual(await shown(page), ['chat', 'today']);
  assert.equal(await ratio(), 0.3);
  await page.close();
});

test('a narrow screen shows one workspace with the usual tabs and no split control', options, async () => {
  const page = await openConnectedPage(stack, { width: 1500 });
  await page.click('#split-toggle');
  await page.click('#tab-today');
  assert.deepEqual(await shown(page), ['chat', 'today']);

  await page.setViewport(390, 844);
  await page.waitFor(`document.querySelectorAll('.panel:not([hidden])').length === 1`, 'one workspace');
  assert.deepEqual(await shown(page), ['today'], 'the focused workspace is the one kept');
  assert.equal(await toggleShown(page), false);
  assert.equal(await page.evaluate(`document.querySelectorAll('.pane-bar:not([hidden])').length`), 0);
  assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true);
  await page.click('#tab-chat');
  assert.deepEqual(await shown(page), ['chat']);

  await page.setViewport(1500, 900);
  await page.waitFor(
    `document.querySelectorAll('.panel:not([hidden])').length === 2`,
    'both workspaces again',
  );
  assert.deepEqual(await shown(page), ['chat', 'today']);
  await page.close();
});

test(
  'with Today beside Chat an approved story appears without leaving the conversation',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1500 });
    await page.click('#split-toggle');
    await askModel(stack, page, 'Please capture a story.');
    const onBoard = () =>
      page.evaluate(`document.querySelector('#board-columns').textContent.includes('Synthetic story')`);
    assert.equal(
      await onBoard(),
      false,
      'nothing is added before approval, in a split layout as in a single one',
    );

    await openReview(page, 'Review story: Synthetic story');
    await page.click('#review-approve');
    await page.waitFor(
      `document.querySelector('#board-columns').textContent.includes('Synthetic story')`,
      'the story on the board',
    );
    assert.deepEqual(await shown(page), ['chat', 'today'], 'both workspaces are still on screen');
    assert.equal(
      await page.evaluate(`document.querySelector('#messages').offsetParent !== null`),
      true,
      'the conversation is still visible',
    );
    assert.equal(await focused(page), 'today');
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();
  },
);
