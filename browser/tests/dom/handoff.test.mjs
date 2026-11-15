// Browser-level checks for phone links and copy boxes. A link appears only after the owner
// approves, PEA never opens it itself, and text in a copy box is never read aloud.
// Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { askModel, browserSkipReason, openConnectedPage, openReview, startStack } from './harness.mjs';

const skip = browserSkipReason();
const options = { skip, timeout: 60000 };
const block = (value) => '```pea-open\n' + JSON.stringify(value) + '\n```\n';
const replies = {
  ring: 'I can open that call.\n' + block({ op: 'open_call', who: 'Ana', number: '+1 555 010 0100' }),
  message:
    'I can open that text.\n' +
    block({ op: 'open_text', who: 'Ana', number: '555 010 0100', message: 'Half & half? Leaving now.' }),
  route:
    'I can open that route.\n' +
    block({ op: 'open_directions', to: 'Synthetic Library & Café', mode: 'walking' }),
  nameless: 'I’ll call Mom now.\n' + block({ op: 'open_call', who: 'Mom' }),
  shortcut: 'Running it.\n' + block({ op: 'open_shortcut', name: 'Lights' }),
  outline:
    'Here is the outline to paste:\n```\nSYNTHETIC SLIDE ONE\nSYNTHETIC SLIDE TWO\n```\nTell me if you want it shorter.',
  code: 'Try this:\n```python\nprint("synthetic")\n```',
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

const links = (page, prefix) =>
  page.evaluate(
    `[...document.querySelectorAll('#messages a')].filter((a) => a.getAttribute('href').startsWith(${JSON.stringify(prefix)})).map((a) => ({ href: a.getAttribute('href'), text: a.textContent, target: a.target, rel: a.rel }))`,
  );

test('a call link appears only after approval, and PEA never opens it', options, async () => {
  const page = await openConnectedPage(stack, { width: 1500 });
  await askModel(stack, page, 'Please ring Ana.');
  assert.match(stack.model.requests.at(-1).messages[0].content, /pea-open[\s\S]*no contact list/);
  assert.doesNotMatch(await page.text('#messages'), /pea-open|open_call/, 'the action block is hidden');
  assert.deepEqual(await links(page, 'tel:'), []);

  await openReview(page, 'Review call');
  const shown = await page.text('#review-body');
  assert.match(shown, /call Ana \(\+15550100100\)/);
  assert.match(shown, /PEA does not place the call/);
  await page.click('#review-cancel');
  await page.waitFor(`!document.getElementById('review').open`);
  assert.deepEqual(await links(page, 'tel:'), [], 'cancel changes nothing');

  await openReview(page, 'Review call');
  await page.click('#review-approve');
  await page.waitFor(`document.querySelector('#messages a[href^="tel:"]')`, 'the call link');
  assert.deepEqual(await links(page, 'tel:'), [
    { href: 'tel:+15550100100', text: 'Call Ana', target: '', rel: '' },
  ]);
  assert.equal(await page.evaluate(`location.pathname`), '/', 'approval did not open or navigate anything');

  await page.goto(stack.gateway.origin + '/');
  assert.deepEqual(await links(page, 'tel:'), [], 'not restored after reload');
  assert.deepEqual(page.outsideRequests(), []);
  await page.close();
});

test(
  'a text is shown word for word before its link, which carries the encoded message',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1500 });
    await askModel(stack, page, 'Send Ana a message.');
    await openReview(page, 'Review text message');
    const shown = await page.text('#review-body');
    assert.match(shown, /text to Ana \(5550100100\) with these words:\n\nHalf & half\? Leaving now\./);
    assert.match(shown, /press Send yourself/);
    await page.click('#review-approve');
    await page.waitFor(`document.querySelector('#messages a[href^="sms:"]')`, 'the text link');
    assert.equal(
      (await links(page, 'sms:'))[0].href,
      'sms:5550100100?&body=Half%20%26%20half%3F%20Leaving%20now.',
    );
    await page.close();
  },
);

test('directions name the map service and open in a separate tab only when pressed', options, async () => {
  const page = await openConnectedPage(stack, { width: 1500 });
  await askModel(stack, page, 'Show me the route.');
  await openReview(page, 'Review directions');
  const shown = await page.text('#review-body');
  assert.match(shown, /(Google|Apple) Maps with walking directions to:\n\nSynthetic Library & Café/);
  assert.match(shown, /sends this place to (Google|Apple)/);
  await page.click('#review-approve');
  await page.waitFor(`document.querySelector('#messages a[href^="https://"]')`, 'the directions link');
  const [link] = await links(page, 'https://');
  const url = new URL(link.href);
  assert(['www.google.com', 'maps.apple.com'].includes(url.host), url.host);
  assert.equal(
    url.searchParams.get(url.host === 'maps.apple.com' ? 'daddr' : 'destination'),
    'Synthetic Library & Café',
  );
  assert.equal(link.target, '_blank');
  assert.match(link.rel, /noopener/);
  assert.match(link.rel, /noreferrer/);
  assert.deepEqual(
    page.outsideRequests(),
    [],
    'nothing reaches the map service until the owner presses the link',
  );
  await page.close();
});

test(
  'a name without a number and an iPhone-only action open nothing and are corrected',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1500 });
    await askModel(stack, page, 'This one is nameless.');
    assert.equal(await page.hasText('Review call'), false, 'a browser cannot look a name up');
    await page.waitFor(
      `document.getElementById('messages').innerText.includes('PEA did not call, text or open directions')`,
      'the correction',
    );
    await askModel(stack, page, 'Run the shortcut.');
    assert.equal(await page.evaluate(`document.querySelectorAll('#messages button').length`), 0);
    assert.doesNotMatch(await page.text('#messages'), /open_shortcut|open_call/);
    await page.close();
  },
);

test('fenced text is a copy box that copies exactly and is never read aloud', options, async () => {
  const page = await openConnectedPage(stack, { width: 1500 });
  await page.evaluate(
    `(() => {
      window.copied = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => window.copied.push(text) } });
      window.spoken = [];
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak: (u) => window.spoken.push(u.text), cancel() {}, getVoices: () => [], addEventListener() {} } });
    })()`,
  );
  await askModel(stack, page, 'Give me an outline.');
  await page.waitFor(`document.querySelector('#messages .copy-box')`, 'the copy box');
  assert.equal(await page.text('#messages .copy-box pre'), 'SYNTHETIC SLIDE ONE\nSYNTHETIC SLIDE TWO');
  assert.doesNotMatch(await page.text('#messages'), /```/, 'the fence marks are not shown');
  assert.match(
    await page.text('#messages'),
    /Here is the outline to paste:[\s\S]*Tell me if you want it shorter\./,
  );

  await page.evaluate(`document.querySelector('#messages .copy-box button').click()`);
  await page.waitFor(`window.copied.length === 1`, 'the copy');
  assert.deepEqual(await page.evaluate(`window.copied`), ['SYNTHETIC SLIDE ONE\nSYNTHETIC SLIDE TWO']);
  assert.equal(await page.text('#messages .copy-box button'), 'Copied');

  await page.click('#chat-read');
  await page.waitFor(`window.spoken.length === 1`, 'the reply being read');
  const spoken = (await page.evaluate(`window.spoken`))[0];
  assert.match(spoken, /Here is the outline to paste:/);
  assert.match(spoken, /Tell me if you want it shorter\./);
  assert.doesNotMatch(spoken, /SYNTHETIC SLIDE/, 'text to copy is not read aloud');

  await askModel(stack, page, 'Now some code.');
  await page.waitFor(`document.querySelectorAll('#messages .copy-box').length === 2`, 'the second box');
  assert.equal(
    await page.evaluate(
      `[...document.querySelectorAll('#messages .copy-box')].at(-1).querySelector('small').textContent`,
    ),
    'python',
  );
  assert.deepEqual(page.outsideRequests(), []);
  await page.close();
});
