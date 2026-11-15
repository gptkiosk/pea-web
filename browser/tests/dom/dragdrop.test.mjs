// Browser-level checks that dropping a file or a message never sends, saves or approves anything.
// Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { askModel, browserSkipReason, openConnectedPage, startStack } from './harness.mjs';

const skip = browserSkipReason();
const options = { skip, timeout: 45000 };

let stack;
before(
  async () => {
    if (!skip) stack = await startStack(() => 'Plan the synthetic trip\nBook a synthetic hotel.');
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

// Drops synthetic files on an element, the way a browser reports a real drop.
const dropFiles = (page, selector, files) =>
  page.evaluate(
    `(() => {
      const data = new DataTransfer();
      for (const [name, type, text] of ${JSON.stringify(files)}) data.items.add(new File([text], name, { type }));
      const target = document.querySelector(${JSON.stringify(selector)});
      target.dispatchEvent(new DragEvent('dragover', { dataTransfer: data, bubbles: true, cancelable: true }));
      return !target.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
    })()`,
  );
const attached = (page) =>
  page.evaluate(
    `document.getElementById('context-file').hidden ? '' : document.getElementById('context-file-name').textContent`,
  );
const noticed = (page, text) =>
  page.waitFor(
    `(window.peaNotices || []).some((n) => n.includes(${JSON.stringify(text)}))`,
    'notice: ' + text,
  );

test(
  'a file dropped on Chat is selected, and its text is shown in the review before anything is sent',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1500 });
    const sent = stack.model.requests.length;
    const handled = await dropFiles(page, '#chat', [
      ['synthetic-notes.txt', 'text/plain', 'Synthetic file body.'],
    ]);
    assert.equal(handled, true, 'the app took the drop instead of letting the browser open the file');
    await page.waitFor(`!document.getElementById('context-file').hidden`, 'the attached file chip');
    assert.equal(await attached(page), 'synthetic-notes.txt');
    assert.equal(stack.model.requests.length, sent, 'dropping sends nothing');

    await page.fill('#thought', 'What does it say?');
    await page.evaluate(`document.getElementById('composer').requestSubmit()`);
    await page.waitFor(`document.getElementById('review').open`, 'the model sharing review');
    assert.match(
      await page.text('#review-body'),
      /Synthetic file body\./,
      'the exact excerpt is shown for review',
    );
    await page.click('#review-cancel');
    await page.waitFor(`!document.getElementById('review').open`);
    assert.equal(stack.model.requests.length, sent, 'declining still sends nothing');
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();
  },
);

test(
  'a file dropped on Greenhouse opens for preview and is not selected for a request',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1500 });
    await page.click('#tab-greenhouse');
    await dropFiles(page, '#greenhouse', [
      ['first.md', 'text/markdown', '# Synthetic heading'],
      ['second.md', 'text/markdown', 'ignored'],
    ]);
    await page.waitFor(`document.getElementById('file-name').textContent === 'first.md'`, 'the preview');
    assert.match(await page.text('#file-preview'), /Synthetic heading/);
    assert.equal(await attached(page), '');
    await noticed(page, 'Opened the first file only.');
    await page.close();
  },
);

test('unsupported, oversized and Blended-profile drops are refused with a reason', options, async () => {
  const page = await openConnectedPage(stack, { width: 1500 });
  await dropFiles(page, '#chat', [['setup.exe', 'application/octet-stream', 'MZ']]);
  await noticed(page, 'Use a text/code file');
  await dropFiles(page, '#chat', [['page.html', 'text/html', '<script>1</script>']]);
  assert.equal(await attached(page), '');

  await page.evaluate(
    `(() => { const data = new DataTransfer(); data.items.add(new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'big.txt', { type: 'text/plain' })); document.getElementById('chat').dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true })); })()`,
  );
  await noticed(page, 'under 4 MB');

  await page.fill('#profile', 'blended');
  await dropFiles(page, '#chat', [['notes.txt', 'text/plain', 'Synthetic.']]);
  await noticed(page, 'Personal or Work');
  assert.equal(await attached(page), '');
  await page.close();
});

test('a file dropped outside a workspace does not replace the app', options, async () => {
  const page = await openConnectedPage(stack, { width: 1500 });
  const handled = await dropFiles(page, 'footer', [['notes.txt', 'text/plain', 'Synthetic.']]);
  assert.equal(handled, true, 'the browser is not left to navigate to the file');
  await noticed(page, 'Drop files on Chat or Greenhouse.');
  assert.equal(await attached(page), '');
  await page.close();
});

test(
  'a message dropped on Today drafts a story that is added only when the owner chooses',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1500 });
    await askModel(stack, page, 'Help me plan.');
    await page.click('#split-toggle');
    const dragged = await page.evaluate(
      `(() => {
      const message = [...document.querySelectorAll('#messages .utterance')].find((m) => m.textContent.includes('synthetic trip'));
      const data = new DataTransfer();
      message.dispatchEvent(new DragEvent('dragstart', { dataTransfer: data, bubbles: true, cancelable: true }));
      const types = [...data.types];
      const carried = types.map((type) => data.getData(type)).join(' ');
      const today = document.getElementById('today');
      today.dispatchEvent(new DragEvent('dragover', { dataTransfer: data, bubbles: true, cancelable: true }));
      today.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
      return { draggable: message.draggable, types, carried };
    })()`,
    );
    assert.equal(dragged.draggable, true);
    assert.deepEqual(dragged.types, ['application/x-pea-message']);
    assert.doesNotMatch(
      dragged.carried,
      /synthetic/i,
      'only the message id travels with the drag, not its text',
    );

    await page.waitFor(
      `document.getElementById('story-title').value === 'Plan the synthetic trip'`,
      'the drafted title',
    );
    assert.match(
      await page.evaluate(`document.getElementById('story-details').value`),
      /Book a synthetic hotel\./,
    );
    const onBoard = () =>
      page.evaluate(
        `document.getElementById('board-columns').textContent.includes('Plan the synthetic trip')`,
      );
    assert.equal(await onBoard(), false, 'dropping adds nothing to the board');

    await page.click('#board-capture');
    await page.waitFor(
      `document.getElementById('board-columns').textContent.includes('Plan the synthetic trip')`,
      'the story after the owner adds it',
    );
    await page.close();
  },
);

test('a message id from elsewhere drafts nothing', options, async () => {
  const page = await openConnectedPage(stack, { width: 1500 });
  await page.evaluate(
    `(() => { const data = new DataTransfer(); data.setData('application/x-pea-message', 'not-a-real-message'); document.getElementById('today').dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true })); })()`,
  );
  await noticed(page, 'no longer available');
  assert.equal(await page.evaluate(`document.getElementById('story-title').value`), '');
  await page.close();
});
