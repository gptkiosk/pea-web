// Browser-level checks for the Chat window: a reply is laid out as text with code windows and
// Copy buttons, nothing a model writes becomes markup, the conversation follows its newest
// message, and on a screen with room the page itself does not scroll.
// Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { askModel, browserSkipReason, openConnectedPage, startStack } from './harness.mjs';

const skip = browserSkipReason();
const options = { skip, timeout: 90000 };
const long = Array.from({ length: 30 }, (_, i) => `Synthetic paragraph ${i + 1} of a long reply.`).join(
  '\n\n',
);
const replies = {
  layout: [
    'Here is a **short plan** with `inline code` and *emphasis*.',
    '',
    '## Steps',
    '',
    '1. Install the tool',
    '2. Run the check',
    '   - nested point',
    '',
    '> A quoted note',
    '',
    '```python',
    'def greet(name):',
    '    return f"Hello, {name}!"',
    '```',
    '',
    'See [a site](https://example.test) <img src=x onerror="window.__ran = 1"> <b>not bold</b>',
  ].join('\n'),
  long,
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

const pageScrolls = (page) =>
  page.evaluate(
    `(() => { scrollTo(0, 500); const moved = scrollY; scrollTo(0, 0); return moved > 0 || document.documentElement.scrollHeight > innerHeight + 1; })()`,
  );
const box = (page) =>
  page.evaluate(
    `(() => { const s = document.querySelector('.conversation-main'); return { top: Math.round(s.scrollTop), height: s.clientHeight, all: s.scrollHeight, gap: Math.round(s.scrollHeight - s.scrollTop - s.clientHeight) }; })()`,
  );

test(
  'a reply is laid out as text with a code window, and nothing in it becomes markup',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1400, height: 900 });
    await page.evaluate(
      `Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { window.__copied = text; } } })`,
    );
    await askModel(stack, page, 'Show me the layout.');
    const seen = await page.evaluate(`(() => {
    const reply = document.querySelector('#messages .utterance.assistant .reply');
    const tags = (selector) => [...reply.querySelectorAll(selector)].map((node) => node.textContent);
    return {
      strong: tags('strong'), em: tags('em'), code: tags('.reply-prose code'), heading: tags('h4'),
      items: [...reply.querySelectorAll('ol > li')].map((li) => [li.dataset.depth ?? '0', li.textContent]),
      quote: tags('blockquote'), pre: tags('.copy-box pre'), label: tags('.copy-box-bar small'),
      unsafe: reply.querySelectorAll('a, img, b, script, iframe').length,
      last: reply.querySelector('.reply-prose:last-child p').textContent,
      proseFont: getComputedStyle(reply.querySelector('p')).fontFamily,
      codeFont: getComputedStyle(reply.querySelector('.copy-box pre')).fontFamily,
    };
  })()`);
    assert.deepEqual(seen.strong, ['short plan']);
    assert.deepEqual(seen.em, ['emphasis']);
    assert.deepEqual(seen.code, ['inline code']);
    assert.deepEqual(seen.heading, ['Steps']);
    assert.deepEqual(seen.items, [
      ['0', 'Install the tool'],
      ['0', 'Run the check'],
      ['1', 'nested point'],
    ]);
    assert.deepEqual(seen.quote, ['A quoted note']);
    assert.deepEqual(seen.pre, ['def greet(name):\n    return f"Hello, {name}!"']);
    assert.deepEqual(seen.label, ['python']);
    assert.equal(seen.unsafe, 0, 'no link, image or other element came from the reply');
    assert.match(
      seen.last,
      /\[a site\]\(https:\/\/example\.test\) <img src=x .*<b>not bold<\/b>/,
      'shown as typed',
    );
    assert.equal(await page.evaluate(`window.__ran`), undefined);
    assert.match(seen.codeFont, /monospace/);
    assert.doesNotMatch(seen.proseFont, /monospace/);

    // The code window copies exactly its code; the message's own button copies the whole reply.
    await page.evaluate(`document.querySelector('#messages .copy-box-bar button').click()`);
    await page.waitFor(`window.__copied !== undefined`, 'the copy');
    assert.equal(await page.evaluate(`window.__copied`), 'def greet(name):\n    return f"Hello, {name}!"');
    const names = await page.evaluate(
      `[...document.querySelectorAll('#messages .utterance-head .copy-all')].map((b) => b.getAttribute('aria-label'))`,
    );
    assert.deepEqual(names, ['Copy your message', 'Copy this reply']);
    await page.evaluate(`document.querySelectorAll('#messages .copy-all')[1].click()`);
    await page.waitFor(`window.__copied.startsWith('Here is a')`, 'the whole reply copied');
    assert.equal(await page.evaluate(`window.__copied`), replies.layout);
    await page.evaluate(`document.querySelectorAll('#messages .copy-all')[0].click()`);
    await page.waitFor(`window.__copied === 'Show me the layout.'`, 'the owner message copied');
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();
  },
);

test(
  'on a screen with room the page stays put, and the conversation follows its newest message',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1400, height: 900 });
    // Before anything is said, Chat's opening screen is an ordinary page.
    assert.equal(await page.evaluate(`document.querySelector('.welcome').hidden`), false);
    await askModel(stack, page, 'A long one please.');
    assert.equal(await pageScrolls(page), false, 'the page itself does not scroll');
    let at = await box(page);
    assert.ok(at.all > at.height + 200, 'the conversation scrolls inside its own box');
    assert.ok(at.gap <= 2, 'and shows its newest message');
    assert.equal(await page.evaluate(`document.getElementById('chat-latest').hidden`), true);
    const writing = await page.evaluate(
      `(() => { const r = document.getElementById('composer').getBoundingClientRect(); return r.top > 0 && r.bottom <= innerHeight; })()`,
    );
    assert.equal(writing, true, 'the writing box is on screen');

    // Scrolling up to read stops the following: the place is kept, and Latest is offered.
    await page.evaluate(
      `(() => { const s = document.querySelector('.conversation-main'); s.scrollTop = 40; s.dispatchEvent(new Event('scroll')); })()`,
    );
    await page.waitFor(`!document.getElementById('chat-latest').hidden`, 'the Latest button');
    await page.evaluate(`window.dispatchEvent(new Event('focus'))`);
    assert.equal((await box(page)).top, 40);
    await page.click('#chat-latest');
    await page.waitFor(`document.getElementById('chat-latest').hidden`, 'Latest to go away');
    assert.ok((await box(page)).gap <= 2);

    // Sending is a reason to see the answer: the conversation follows again.
    await page.evaluate(
      `(() => { const s = document.querySelector('.conversation-main'); s.scrollTop = 0; s.dispatchEvent(new Event('scroll')); })()`,
    );
    await askModel(stack, page, 'Another long one.');
    at = await box(page);
    assert.ok(at.gap <= 2, 'the newest reply is in view');
    assert.equal(await pageScrolls(page), false);

    // Today is an ordinary scrolling page; coming back, Chat is still at its newest message.
    await page.click('#tab-today');
    await page.waitFor(`!document.getElementById('today').hidden`, 'Today');
    assert.equal(
      await page.evaluate(`getComputedStyle(document.querySelector('.shell')).overflowY`),
      'visible',
    );
    await page.click('#tab-chat');
    await page.waitFor(`!document.getElementById('chat').hidden`, 'Chat');
    await page.waitFor(
      `(() => { const s = document.querySelector('.conversation-main'); return s.scrollHeight - s.scrollTop - s.clientHeight <= 2; })()`,
      'the newest message after coming back',
    );

    // Two workspaces side by side are both fixed frames.
    await page.click('#split-toggle');
    await page.waitFor(`document.getElementById('panes').classList.contains('split')`, 'the split');
    assert.equal(await pageScrolls(page), false, 'two workspaces do not scroll the page either');
    const frames = await page.evaluate(
      `[...document.querySelectorAll('#panes > .panel:not([hidden])')].map((p) => { const r = p.getBoundingClientRect(); return r.bottom <= innerHeight && r.height > 200; })`,
    );
    assert.deepEqual(frames, [true, true]);
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();
  },
);

test('a phone keeps the ordinary scrolling page', options, async () => {
  const page = await openConnectedPage(stack, { width: 390, height: 800 });
  await askModel(stack, page, 'A long one please.');
  assert.equal(
    await page.evaluate(`getComputedStyle(document.querySelector('.shell')).overflowY`),
    'visible',
  );
  assert.equal(await pageScrolls(page), true);
  const reply = await page.evaluate(`document.querySelectorAll('#messages .reply-prose p').length`);
  assert.equal(reply, 30);
  await page.close();
});

test('connected without a Chat model, PEA says so instead of showing a blank', options, async () => {
  const page = await stack.browser.newPage();
  await page.goto(stack.gateway.origin + '/');
  await page.waitFor(
    `document.querySelector('#local-connect').onclick && !document.querySelector('#local-connect').disabled`,
    'the app to finish starting',
  );
  await page.fill('#local-token', stack.gateway.token);
  await page.click('#local-connect');
  await page.waitFor(
    `[...document.querySelector('#chat-model').options].some((o) => o.value.startsWith('local:'))`,
    'the local model list',
  );
  assert.equal(await page.text('#connection-status'), 'Connected · no Chat model chosen yet');
  assert.equal(await page.text('#active-model'), 'Chat · choose a model in Set up');
  await page.fill('#chat-model', 'local:synthetic-model');
  await page.waitFor(`document.getElementById('connection-status').textContent === 'Local model connected'`);
  assert.equal(await page.text('#active-model'), 'Chat · synthetic-model');
  await page.close();
});
