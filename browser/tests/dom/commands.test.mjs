// Browser-level checks for the command palette and keyboard shortcuts, using real key presses.
// Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { browserSkipReason, openConnectedPage, startStack } from './harness.mjs';

const skip = browserSkipReason();
const options = { skip, timeout: 45000 };

let stack;
before(
  async () => {
    if (!skip) stack = await startStack(() => 'A plain synthetic reply.');
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

const open = (page, id) => page.evaluate(`document.getElementById(${JSON.stringify(id)}).open`);
const focusedTab = (page) => page.evaluate(`document.querySelector('[data-tab].selected').dataset.tab`);
const commandIds = (page) =>
  page.evaluate(
    `[...document.querySelectorAll('#palette-list [role=option]')].map((o) => o.dataset.command)`,
  );
const typeText = async (page, text) => {
  for (const character of text) await page.press(character, { text: character });
};
const blur = (page) => page.evaluate(`document.activeElement?.blur()`);

test(
  'the palette opens from the keyboard, filters as you type and runs the chosen command',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1500 });
    await blur(page);
    await page.press('k', await page.mod());
    await page.waitFor(`document.getElementById('palette').open`, 'the palette');
    assert.equal(await page.evaluate(`document.activeElement.id`), 'palette-input');
    const all = await commandIds(page);
    assert(all.includes('go-today') && all.includes('beside-today') && all.includes('shortcuts'));
    assert.equal(
      all.some((id) => /approve|review|grant|send/.test(id)),
      false,
      'no command approves or sends',
    );

    await typeText(page, 'today');
    assert.equal((await commandIds(page))[0], 'go-today');
    await page.press('ArrowDown');
    assert.equal(
      await page.evaluate(`document.querySelector('#palette-list [aria-selected=true]').dataset.command`),
      (await commandIds(page))[1],
    );
    await page.press('ArrowUp');
    await page.press('Enter');
    await page.waitFor(`!document.getElementById('palette').open`, 'the palette to close');
    await page.waitFor(`document.querySelector('[data-tab].selected').dataset.tab === 'today'`, 'Today');

    await page.press('k', await page.mod());
    await page.waitFor(`document.getElementById('palette').open`);
    await page.press('k', await page.mod());
    await page.waitFor(`!document.getElementById('palette').open`, 'the same key to close it');
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();
  },
);

test(
  'palette commands change the layout, theme and profile through the usual controls',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1500 });
    // The command runs just after the palette has closed, so each step waits for its effect.
    const runCommand = async (words, effect, what) => {
      await blur(page);
      await page.press('k', await page.mod());
      await page.waitFor(`document.getElementById('palette').open`);
      await typeText(page, words);
      await page.press('Enter');
      await page.waitFor(`!document.getElementById('palette').open`);
      await page.waitFor(effect, what);
    };
    await runCommand(
      'beside today',
      `[...document.querySelectorAll('.panel:not([hidden])')].map((p) => p.id).sort().join() === 'chat,today'`,
      'Today beside Chat',
    );
    const was = await page.evaluate(`document.documentElement.dataset.theme || 'light'`);
    await runCommand(
      'dark theme',
      `(document.documentElement.dataset.theme || 'light') !== ${JSON.stringify(was)}`,
      'the theme to change',
    );
    await runCommand(
      'work profile',
      `document.getElementById('profile').value === 'work'`,
      'the Work profile',
    );
    await runCommand('add story', `document.activeElement.id === 'story-title'`, 'focus in the story title');
    await page.close();
  },
);

test('the help shows the keys for this kind of keyboard', options, async () => {
  const page = await openConnectedPage(stack, { width: 1500 });
  const mac = Boolean((await page.mod()).meta);
  await page.click('#menu-shortcuts');
  await page.waitFor(`document.getElementById('shortcuts-dialog').open`, 'the shortcut help');
  const first = await page.evaluate(`document.querySelector('#shortcut-list kbd').textContent`);
  assert.equal(first, mac ? '⌘K' : 'Ctrl+K');
  // A Mac reports itself as "macOS" in one place and "MacIntel" in another; both must count.
  if (process.platform === 'darwin' && !process.env.PEA_DOM_PLATFORM) assert.equal(mac, true);
  await page.close();
});

test('a narrow screen offers no split commands', options, async () => {
  const page = await openConnectedPage(stack, { width: 390, height: 844 });
  await page.click('#menu-palette');
  await page.waitFor(`document.getElementById('palette').open`, 'the palette from the menu');
  const ids = await commandIds(page);
  assert(ids.includes('go-today'));
  assert.equal(
    ids.some((id) => id.startsWith('beside-') || id === 'split' || id === 'swap'),
    false,
  );
  await page.close();
});

test('plain keys act only outside text fields, and workspace keys work anywhere', options, async () => {
  const page = await openConnectedPage(stack, { width: 1500 });
  await blur(page);
  await page.press('/', { text: '/', code: 'Slash' });
  assert.equal(await page.evaluate(`document.activeElement.id`), 'thought', 'slash starts a message');
  assert.equal(await page.evaluate(`document.getElementById('thought').value`), '', 'and is not typed');
  await typeText(page, 'a/b?');
  assert.equal(
    await page.evaluate(`document.getElementById('thought').value`),
    'a/b?',
    'typing is left alone',
  );
  assert.equal(await open(page, 'shortcuts-dialog'), false);

  await page.press('2', { ...(await page.workspaceMod()), code: 'Digit2' });
  assert.equal(await focusedTab(page), 'today');
  await page.press('3', { ...(await page.workspaceMod()), code: 'Digit3' });
  assert.equal(await focusedTab(page), 'greenhouse');
  await page.press('1', { ...(await page.workspaceMod()), code: 'Digit1' });
  assert.equal(await focusedTab(page), 'chat');

  await page.press('\\', { ...(await page.mod()), code: 'Backslash' });
  await page.waitFor(`document.querySelectorAll('.panel:not([hidden])').length === 2`, 'the split');
  await page.press('\\', { ...(await page.mod()), code: 'Backslash' });
  await page.waitFor(`document.querySelectorAll('.panel:not([hidden])').length === 1`, 'one workspace');

  await blur(page);
  await page.press('?', { text: '?', shift: true, code: 'Slash' });
  await page.waitFor(`document.getElementById('shortcuts-dialog').open`, 'the shortcut help');
  assert.equal(await page.evaluate(`document.querySelectorAll('#shortcut-list dt').length`), 8);
  await page.close();
});

test('the send shortcut still stops at the model sharing review', options, async () => {
  const page = await openConnectedPage(stack, { width: 1500 });
  const sent = stack.model.requests.length;
  await page.evaluate(`document.getElementById('thought').focus()`);
  await typeText(page, 'hello');
  await page.press('Enter', await page.mod());
  await page.waitFor(`document.getElementById('review').open`, 'the model sharing review');
  assert.equal(stack.model.requests.length, sent, 'nothing is sent by the shortcut alone');
  await page.click('#review-cancel');
  await page.waitFor(`!document.getElementById('review').open`);
  assert.equal(stack.model.requests.length, sent);
  await page.close();
});

test('no shortcut works while a review is open', options, async () => {
  const page = await openConnectedPage(stack, { width: 1500 });
  const sent = stack.model.requests.length;
  await page.fill('#thought', 'A question.');
  await page.evaluate(`document.getElementById('composer').requestSubmit()`);
  await page.waitFor(`document.getElementById('review').open`, 'the model sharing review');

  await page.press('k', await page.mod());
  await page.press('2', { ...(await page.workspaceMod()), code: 'Digit2' });
  await page.press('\\', { ...(await page.mod()), code: 'Backslash' });
  await page.evaluate(`document.activeElement?.blur()`);
  await page.press('?', { text: '?', shift: true, code: 'Slash' });
  await page.press('Enter', await page.mod());
  await new Promise((resolve) => setTimeout(resolve, 200));

  assert.equal(await open(page, 'palette'), false);
  assert.equal(await open(page, 'shortcuts-dialog'), false);
  assert.equal(await open(page, 'review'), true, 'the review is still waiting for the owner');
  assert.equal(await focusedTab(page), 'chat');
  assert.equal(await page.evaluate(`document.querySelectorAll('.panel:not([hidden])').length`), 1);
  assert.equal(stack.model.requests.length, sent, 'no key approved the review');
  await page.close();
});
