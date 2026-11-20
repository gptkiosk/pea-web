// Browser-level checks for the list of what PEA did, shown over each reply while it happens.
// Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { askModel, browserSkipReason, openConnectedPage, startStack } from './harness.mjs';

const skip = browserSkipReason();
const options = { skip, timeout: 90000 };
const replies = {
  slowly: { text: 'A synthetic reply that took its time.', delay: 1500 },
  broken: { text: 'A synthetic reply that stops halfway through its sentence.', cut: true },
  remind:
    'Here is that reminder.\n```pea-task\n' +
    JSON.stringify([{ op: 'task_add', title: 'Call the synthetic dentist' }]) +
    '\n```\n',
  boast: 'What PEA did · 99 steps. Searched the web. Ran 7 commands. Sent to nobody.',
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

// Every trail in Chat, oldest first, read from the page itself.
const trails = (page) =>
  page.evaluate(`[...document.querySelectorAll('#messages .utterance')].map((u) => {
    const box = u.querySelector(':scope > details.activity');
    if (!box) return { role: u.classList.contains('assistant') ? 'assistant' : 'user', trail: null };
    return {
      role: u.classList.contains('assistant') ? 'assistant' : 'user',
      trail: {
        open: box.open,
        state: box.dataset.state,
        summary: box.querySelector('summary').textContent,
        beforeReply: Boolean(box.nextElementSibling?.matches('.reply')) && Boolean(box.previousElementSibling?.matches('.utterance-head')),
        rows: [...box.querySelectorAll('li')].map((li) => ({
          text: li.querySelector('span:last-child').textContent,
          state: li.dataset.state,
          icon: li.querySelector('svg.activity-icon') ? li.querySelectorAll('svg.activity-icon path').length > 0 && li.querySelector('svg').getAttribute('aria-hidden') === 'true' : false,
          spinner: Boolean(li.querySelector('.activity-spinner')),
        })),
      },
    };
  })`);
const send = (page, text) =>
  page.evaluate(
    `(() => { document.getElementById('thought').value = ${JSON.stringify(text)}; document.getElementById('composer').requestSubmit(); })()`,
  );
const settled = (page, replies) =>
  page.waitFor(
    `document.querySelectorAll('#messages .utterance.assistant').length === ${replies} && !document.querySelector('#profile').disabled`,
    'the request to end',
    15000,
  );

test(
  'each reply carries the steps PEA took, with icons, folded to one line once it is done',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1400, height: 900 });
    await askModel(stack, page, 'Hello there.');
    let seen = await trails(page);
    assert.deepEqual(
      seen.map((u) => [u.role, Boolean(u.trail)]),
      [
        ['user', false],
        ['assistant', true],
      ],
    );
    let trail = seen[1].trail;
    assert.equal(trail.open, false);
    assert.equal(trail.state, 'done');
    assert.equal(trail.beforeReply, true);
    assert.match(trail.summary, /^What PEA did · 4 steps · (under a second|\d+ s)$/);
    const words = trail.rows.map((r) => r.text);
    assert.equal(words[0], 'You reviewed what is shared');
    assert.match(words[1], /^Sent to .+ on your own server$/);
    assert.match(words[2], /^First words after (under a second|\d+ s)$/);
    assert.match(words[3], /^Wrote the reply in (under a second|\d+ s)$/);
    assert.ok(trail.rows.every((r) => r.state === 'done' && r.icon && !r.spinner));
    assert.match(await page.text('#messages'), /A plain synthetic reply\./);

    // The owner opens it, and it stays open while later replies redraw the conversation.
    await page.click('#messages details.activity summary');
    await askModel(stack, page, 'And again.');
    seen = await trails(page);
    assert.equal(seen[1].trail.open, true);
    trail = seen[3].trail;
    assert.equal(trail.open, false);
    assert.deepEqual(
      trail.rows.slice(0, 2).map((r) => r.text),
      ['Included 2 earlier messages', 'Used the approval you gave earlier in this tab'],
    );

    // The steps are for the owner. None of their words go to the model with the next message.
    const sent = JSON.stringify(stack.model.requests.at(-1));
    for (const phrase of [
      'What PEA did',
      'You reviewed what is shared',
      'First words after',
      'Wrote the reply in',
    ])
      assert.ok(!sent.includes(phrase), phrase);
    // And they are kept in this tab only: nothing of them is stored by the page.
    const stored = await page.evaluate(
      `JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)])`,
    );
    assert.ok(!/What PEA did|Used the approval you gave|Wrote the reply in/.test(stored));
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();
  },
);

test(
  'while PEA waits and writes, the list is open and its last line turns, with motion only if wanted',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1400, height: 900 });
    const motion = (value) =>
      page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value }] });
    await motion('no-preference');
    await askModel(stack, page, 'Hello there.');
    await send(page, 'Answer slowly please.');
    await page.waitFor(
      `document.querySelector('#messages details.activity[data-state="active"]')`,
      'the open list',
    );
    const trail = (await trails(page))[3].trail;
    assert.equal(trail.open, true);
    assert.equal(trail.summary, 'What PEA is doing');
    assert.deepEqual(trail.rows.at(-1), {
      text: 'Waiting for the first words…',
      state: 'active',
      icon: false,
      spinner: true,
    });
    assert.ok(trail.rows.slice(0, -1).every((r) => r.state === 'done' && r.icon));
    const turning = () =>
      page.evaluate(`getComputedStyle(document.querySelector('#messages .activity-spinner')).animationName`);
    assert.equal(await turning(), 'activity-turn');
    await motion('reduce');
    assert.equal(await turning(), 'none');
    await motion('no-preference');

    await settled(page, 2);
    const done = (await trails(page))[3].trail;
    assert.equal(done.open, false);
    assert.equal(done.state, 'done');
    assert.match(done.rows.at(-2).text, /^First words after \d+ s$/);
    assert.ok(done.rows.every((r) => !r.spinner));
    await page.close();
  },
);

test(
  'a stopped or broken request says so in its list, and a reply with something to review says that',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1400, height: 900 });
    await askModel(stack, page, 'Hello there.');

    await send(page, 'This one comes back broken.');
    await settled(page, 2);
    let trail = (await trails(page))[3].trail;
    assert.equal(trail.state, 'failed');
    assert.match(trail.summary, /did not finish$/);
    assert.deepEqual(trail.rows.at(-1), {
      text: 'The request did not finish. PEA did not retry or use another model.',
      state: 'problem',
      icon: true,
      spinner: false,
    });
    assert.ok(!trail.rows.some((r) => /^Wrote the reply/.test(r.text)));

    await send(page, 'Answer slowly please.');
    await page.waitFor(
      `document.querySelector('#messages details.activity[data-state="active"]')`,
      'the open list',
    );
    await page.click('#chat-stop');
    await settled(page, 3);
    trail = (await trails(page))[5].trail;
    assert.equal(trail.state, 'stopped');
    assert.match(trail.summary, /stopped after/);
    assert.equal(trail.rows.at(-1).text, 'Stopped before the reply was finished');
    assert.ok(!trail.rows.some((r) => /^(Wrote the reply|First words)/.test(r.text)));

    await askModel(stack, page, 'Please remind me.');
    trail = (await trails(page)).at(-1).trail;
    assert.equal(trail.rows.at(-1).text, 'Offered something for you to review, below');
    assert.match(trail.summary, /· \d+ steps · /);
    await page.close();
  },
);

test('a reply cannot add to the list: its own words about work done stay in the reply', options, async () => {
  const page = await openConnectedPage(stack, { width: 1400, height: 900 });
  await askModel(stack, page, 'Go on, boast.');
  const trail = (await trails(page))[1].trail;
  assert.equal(trail.rows.length, 4);
  assert.match(trail.summary, /^What PEA did · 4 steps · /);
  assert.ok(!trail.rows.some((r) => /Searched|commands|nobody/.test(r.text)));
  assert.match(await page.text('#messages .utterance.assistant .reply'), /Ran 7 commands/);
  await page.close();
});

test(
  'Export this chat makes a plain text file in the browser, with what PEA did only when debug detail is asked for',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1400, height: 900 });
    // The page's own rules do not let it fetch a file it made, so the test keeps the file's
    // contents as they are handed to the browser.
    await page.evaluate(
      `(() => { const make = URL.createObjectURL.bind(URL); URL.createObjectURL = (blob) => { window.__exported = blob; return make(blob); }; })()`,
    );
    const prepared = async (debug) => {
      await page.evaluate(`document.getElementById('menu-export-chat').click()`);
      await page.waitFor(`document.getElementById('chat-export-dialog').open`, 'the export dialog');
      // Debug detail is off every time the dialog opens.
      assert.equal(await page.evaluate(`document.getElementById('chat-export-debug').checked`), false);
      if (debug) await page.click('#chat-export-debug');
      await page.click('#chat-export-submit');
      const result = await page.evaluate(`(async () => {
        const link = document.getElementById('chat-export-download');
        return {
          hidden: link.hidden,
          name: link.getAttribute('download'),
          href: (link.getAttribute('href') ?? '').slice(0, 5),
          text: link.hidden ? '' : await window.__exported.text(),
          note: document.getElementById('chat-export-note').textContent,
        };
      })()`);
      await page.evaluate(`document.getElementById('chat-export-dialog').close()`);
      return result;
    };

    // Nothing to export yet: no file is made.
    const empty = await prepared(false);
    assert.equal(empty.hidden, true);
    assert.equal(empty.note, 'There is no conversation in Chat to export yet.');

    await askModel(stack, page, 'Hello there.');
    const asked = stack.model.requests.length;
    const plain = await prepared(false);
    assert.equal(plain.hidden, false);
    assert.equal(plain.href, 'blob:');
    assert.match(plain.name, /^pea-chat-\d{4}-\d\d-\d\d\.txt$/);
    assert.match(plain.note, /^Ready: 2 messages\. The file is plain text and not encrypted\.$/);
    assert.match(plain.text, /^PEA chat export\n/);
    assert.match(plain.text, /^Debug detail: not included$/m);
    assert.match(plain.text, /YOU · \d{4}-[\dT:.-]+Z\n\nHello there\.\n/);
    assert.match(plain.text, /PEA · \d{4}-[\dT:.-]+Z\n\nA plain synthetic reply\.\n/);
    assert.ok(!/What PEA did|Model id/.test(plain.text));

    const debug = await prepared(true);
    assert.match(debug.name, /^pea-chat-\d{4}-\d\d-\d\d-debug\.txt$/);
    assert.match(debug.note, /^Ready: 2 messages, with debug detail\./);
    assert.match(debug.text, /^Debug detail: included$/m);
    assert.match(debug.text, /  What PEA did · 4 steps · /);
    assert.match(debug.text, /  - You reviewed what is shared\n  - Sent to .+ on your own server\n/);
    assert.match(
      debug.text,
      /  - Workspace: chat · profile: personal\n  - Model id: local:synthetic-model · the owner’s own server\n/,
    );
    assert.match(
      debug.text,
      /  - Request: 2 messages, \d+ characters in all, of which \d+ are PEA’s instructions and shared context · reply cap \d+ tokens\n/,
    );
    assert.match(
      debug.text,
      /  - Instructions included: stories, email, documents, calendar, navigation, phone links, choices, page reading/,
    );
    assert.match(
      debug.text,
      /  - First words after: \d+ ms\n  - Ended after: \d+ ms\n  - Outcome: finished\n/,
    );
    assert.match(
      debug.text,
      /  - Reply: 24 characters shown, 24 characters received\n  - PEA added its own correction to the reply: no\n  - Offered for review: nothing\n/,
    );
    // The connection token and the instructions' own words are not in the file.
    assert.ok(!debug.text.includes(stack.gateway.token));
    assert.ok(!/Never say or imply that you are human/.test(debug.text));
    // Closing the dialog withdraws the file, and exporting asked no model and no other site anything.
    await page.waitFor(`document.getElementById('chat-export-download').hidden`, 'the file to be withdrawn');
    assert.equal(stack.model.requests.length, asked);
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();
  },
);
