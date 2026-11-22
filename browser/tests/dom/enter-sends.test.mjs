// Browser-level checks that Enter sends a chat message and Shift+Enter makes a new line, with
// real key presses.
// Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { askModel, browserSkipReason, openConnectedPage, startStack } from './harness.mjs';

const skip = browserSkipReason();
let stack;
before(
  async () => {
    if (!skip) stack = await startStack(() => 'A plain synthetic reply.');
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

test(
  'Enter sends the message; Shift+Enter makes a new line; a word being composed is not sent',
  { skip, timeout: 90000 },
  async () => {
    const page = await openConnectedPage(stack);
    // The first message approves the sharing review, so later ones go straight out.
    await askModel(stack, page, 'Hello there.');
    const sent = stack.model.requests.length;
    const value = () => page.evaluate(`document.getElementById('thought').value`);
    await page.fill('#thought', 'First line');
    await page.evaluate(
      `(() => { const t = document.getElementById('thought'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); })()`,
    );

    await page.press('Enter', { shift: true, text: '\r' });
    assert.equal(stack.model.requests.length, sent, 'Shift+Enter sends nothing');
    assert.equal(await value(), 'First line\n', 'and makes a new line');
    await page.evaluate(
      `(() => { const t = document.getElementById('thought'); t.value += 'second line'; })()`,
    );

    // Enter while an input method is still composing a word finishes the word and sends nothing.
    await page.evaluate(
      `document.getElementById('thought').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }))`,
    );
    assert.equal(stack.model.requests.length, sent);

    await page.press('Enter', { text: '\r' });
    await page.waitFor(
      `document.querySelectorAll('#messages .utterance.assistant').length === 2 && !document.querySelector('#profile').disabled`,
      'the reply',
    );
    assert.equal(stack.model.requests.length, sent + 1, 'Enter sends once');
    assert.equal(stack.model.requests.at(-1).messages.at(-1).content, 'First line\nsecond line');
    assert.equal(await value(), '', 'the box is cleared, with no stray new line');
    assert.match(
      await page.evaluate(`document.getElementById('thought').title`),
      /Enter sends\. Shift\+Enter makes a new line\./,
    );

    // An empty box sends nothing.
    await page.press('Enter', { text: '\r' });
    assert.equal(stack.model.requests.length, sent + 1);
    await page.close();
  },
);
