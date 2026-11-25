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
  richer: [
    'Compare the beds, ~~not the pots~~:',
    '',
    '| Bed | Size |',
    '| --- | --- |',
    '| North | **2 m** |',
    '| South | 1 m |',
    '',
    '- [x] order compost',
    '- [ ] buy seeds',
    '',
    '```chart',
    'title: Hours of sun',
    'North: 8',
    'South: 4',
    '```',
    '',
    '```diagram',
    'Level --> Fill --> Sow',
    '```',
    '',
    '```chart',
    'this is not a chart',
    '```',
    '',
    'Not links: [x](javascript:alert(1)) [y](http://example.test) [z](https://user:pw@example.test)',
  ].join('\n'),
  slowly: { text: 'A synthetic reply that took its time.', delay: 1500 },
  broken: { text: 'A synthetic reply that stops halfway through its sentence.', cut: true },
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
      unsafe: reply.querySelectorAll('img, b, script, iframe, form, input, object, embed').length,
      links: [...reply.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href'), a.target, a.rel, a.title, a.nextElementSibling?.textContent ?? '']),
      last: reply.querySelector('.reply-prose:last-child p').textContent,
      tokens: [...reply.querySelectorAll('.copy-box pre span')].map((t) => t.className + ':' + t.textContent),
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
    assert.equal(seen.unsafe, 0, 'no image, form or other element came from the reply');
    // The one pressable thing: a plain https link, opened apart from this page, with its host shown.
    assert.deepEqual(seen.links, [
      [
        'a site',
        'https://example.test/',
        '_blank',
        'noopener noreferrer',
        'https://example.test/',
        ' (example.test)',
      ],
    ]);
    assert.match(
      seen.last,
      /^See a site \(example\.test\) <img src=x .*<b>not bold<\/b>/,
      'the rest is shown as typed',
    );
    assert.deepEqual(seen.tokens, ['tok-keyword:def', 'tok-keyword:return', 'tok-string:"Hello, {name}!"']);
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
    // Before anything is said, Chat's opening screen is shown from its top.
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

    // Today is a frame of its own: it scrolls inside itself, not the page. Coming back, Chat is
    // still at its newest message.
    await page.click('#tab-today');
    await page.waitFor(`!document.getElementById('today').hidden`, 'Today');
    assert.equal(await pageScrolls(page), false, 'Today does not scroll the page');
    assert.equal(await page.evaluate(`getComputedStyle(document.getElementById('today')).overflowY`), 'auto');
    await page.click('#tab-chat');
    await page.waitFor(`!document.getElementById('chat').hidden`, 'Chat');
    await page.waitFor(
      `(() => { const s = document.querySelector('.conversation-main'); return s.scrollHeight - s.scrollTop - s.clientHeight <= 2; })()`,
      'the newest message after coming back',
    );

    // Two workspaces side by side are both fixed frames.
    await page.waitFor(`document.getElementById('panes').classList.contains('split')`, 'the two panes');
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

test(
  'connected without a Chat model, PEA says so and offers the only local model in one press',
  options,
  async () => {
    const page = await stack.browser.newPage();
    const sent = stack.model.requests.length;
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
    assert.equal(await page.evaluate(`document.getElementById('connection-status').textContent`), 'Connected · no Chat model chosen yet');
    assert.equal(await page.evaluate(`document.getElementById('active-model').textContent`), 'Chat · choose a model in Set up');
    // With exactly one local model, one press chooses it. Nothing is chosen or sent before that.
    const offers = () =>
      page.evaluate(
        `[...document.querySelectorAll('.use-only-model')].map((b) => (b.hidden ? null : b.textContent))`,
      );
    assert.deepEqual(await offers(), ['Use synthetic-model for Chat', 'Use synthetic-model for Chat']);
    assert.equal(await page.evaluate(`document.getElementById('chat-model').value`), '');
    assert.equal(stack.model.requests.length, sent, 'no request was made by connecting');
    await page.evaluate(`document.querySelector('.use-only-model').click()`);
    await page.waitFor(
      `document.getElementById('connection-status').textContent === 'Local model connected'`,
    );
    assert.equal(await page.evaluate(`document.getElementById('active-model').textContent`), 'Chat · synthetic-model');
    assert.equal(await page.evaluate(`document.getElementById('chat-model').value`), 'local:synthetic-model');
    assert.deepEqual(await offers(), [null, null], 'the offer goes once a model is chosen');
    assert.equal(stack.model.requests.length, sent, 'choosing a model sends nothing to it');
    // A short list has no filter box.
    assert.equal(await page.evaluate(`document.getElementById('model-filter-row').hidden`), true);
    // The choice is remembered like any other, and Chat works with it.
    await page.goto(stack.gateway.origin + '/');
    await page.waitFor(
      `document.querySelector('#local-connect').onclick && !document.querySelector('#local-connect').disabled`,
      'the app to start again',
    );
    await page.fill('#local-token', stack.gateway.token);
    await page.click('#local-connect');
    await page.waitFor(
      `document.getElementById('connection-status').textContent === 'Local model connected'`,
    );
    assert.deepEqual(await offers(), [null, null]);
    await askModel(stack, page, 'Hello there.');
    assert.match(await page.text('#messages'), /A plain synthetic reply\./);
    await page.close();
  },
);

test(
  'while PEA writes a reply, its picture and three bobbing peas say so, and only then',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1400, height: 900 });
    // Some test machines have reduced motion switched on; say which one is meant each time.
    const motion = (value) =>
      page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value }] });
    await motion('no-preference');
    await askModel(stack, page, 'Hello there.');
    assert.equal(await page.evaluate(`document.querySelectorAll('.pea-working').length`), 0);
    // Every request asks the model for its own voice, honesty when asked, and no opening disclaimer.
    const guidance = stack.model.requests.at(-1).messages[0].content;
    assert.match(guidance, /talk to this person as someone you know/);
    assert.match(guidance, /Never say or imply that you are human/);
    assert.match(guidance, /do not open with it, and do not describe yourself as code/);

    const working = () =>
      page.evaluate(`(() => {
      const all = [...document.querySelectorAll('#messages .pea-working')];
      const box = all[0];
      if (!box) return null;
      const pod = box.querySelector('.pea-pod');
      return {
        count: all.length,
        inLastReply: box.parentElement === document.querySelector('#messages .utterance:last-child') && box.parentElement.classList.contains('assistant'),
        peas: pod.querySelectorAll('i').length,
        decoration: pod.getAttribute('aria-hidden'),
        words: box.querySelector('.pea-working-words').textContent,
        motion: getComputedStyle(pod.querySelector('i')).animationName,
        face: box.querySelector('img.pea-face').getAttribute('src'),
        faceAlt: box.querySelector('img.pea-face').alt,
        faceDrawn: box.querySelector('img.pea-face').naturalWidth > 0,
        faceMotion: getComputedStyle(box.querySelector('img.pea-face')).animationName,
      };
    })()`);
    const send = (text) =>
      page.evaluate(
        `(() => { document.getElementById('thought').value = ${JSON.stringify(text)}; document.getElementById('composer').requestSubmit(); })()`,
      );

    // Waiting for the first words: PEA's picture hops under the empty reply, with words beside it.
    await send('Answer slowly please.');
    await page.waitFor(`document.querySelector('#messages .pea-working')`, 'the working sign');
    assert.deepEqual(await working(), {
      count: 1,
      inLastReply: true,
      peas: 3,
      decoration: 'true',
      words: 'PEA is thinking…',
      motion: 'pea-bob',
      face: 'assets/pea-icon.svg',
      faceAlt: '',
      faceDrawn: true,
      faceMotion: 'pea-hop',
    });
    // An owner who has asked for less motion gets the same sign, still.
    await motion('reduce');
    assert.equal((await working()).motion, 'none');
    assert.equal((await working()).faceMotion, 'none');
    assert.equal((await working()).words, 'PEA is thinking…');
    await motion('no-preference');

    // When the reply is complete the sign is gone and the reply is there.
    await page.waitFor(`!document.querySelector('#profile').disabled`, 'the reply to finish', 15000);
    assert.equal(await working(), null);
    assert.match(await page.text('#messages'), /A synthetic reply that took its time\./);

    // A reply that broke off is not shown as still being written.
    await send('This one comes back broken.');
    await page.waitFor(
      `document.querySelectorAll('#messages .utterance.assistant').length === 3 && !document.querySelector('#profile').disabled`,
      'the broken reply to end',
      15000,
    );
    assert.equal(await working(), null);
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();
  },
);

test(
  'tables, lines to tick, a small chart and a diagram are drawn, and unsafe addresses stay text',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1400, height: 900 });
    await page.evaluate(
      `Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { window.__copied = text; } } })`,
    );
    await askModel(stack, page, 'Something richer please.');
    const seen = await page.evaluate(`(() => {
    const reply = document.querySelector('#messages .utterance.assistant .reply');
    const tags = (selector) => [...reply.querySelectorAll(selector)].map((node) => node.textContent);
    const bars = [...reply.querySelectorAll('.reply-chart .chart-row')];
    return {
      struck: tags('s'), head: tags('.reply-table th'), cells: tags('.reply-table td'), bold: tags('.reply-table strong'),
      tasks: [...reply.querySelectorAll('li.task')].map((li) => [li.classList.contains('done'), li.querySelector('.task-box').getAttribute('aria-label'), li.textContent]),
      chartTitle: tags('.reply-chart figcaption'),
      bars: bars.map((row) => [row.querySelector('.chart-label').textContent, row.querySelector('.chart-value').textContent, Math.round(row.querySelector('.chart-bar').getBoundingClientRect().width / row.querySelector('.chart-track').getBoundingClientRect().width * 100)]),
      steps: tags('.reply-diagram .diagram-node'),
      boxes: tags('.copy-box pre'),
      links: reply.querySelectorAll('a').length,
      controls: reply.querySelectorAll('input, form, img, script, iframe').length,
      last: reply.querySelector('.reply-prose:last-child p').textContent,
    };
  })()`);
    assert.deepEqual(seen.struck, ['not the pots']);
    assert.deepEqual(seen.head, ['Bed', 'Size']);
    assert.deepEqual(seen.cells, ['North', '2 m', 'South', '1 m']);
    assert.deepEqual(seen.bold, ['2 m']);
    assert.deepEqual(seen.tasks, [
      [true, 'Done', '✓order compost'],
      [false, 'Not done', 'buy seeds'],
    ]);
    assert.deepEqual(seen.chartTitle, ['Hours of sun']);
    assert.deepEqual(seen.bars, [
      ['North', '8', 100],
      ['South', '4', 50],
    ]);
    assert.deepEqual(seen.steps, ['Level', 'Fill', 'Sow']);
    assert.deepEqual(seen.boxes, ['this is not a chart'], 'a block that is not a chart stays a code window');
    assert.equal(seen.links, 0, 'no unsafe address became a link');
    assert.equal(seen.controls, 0, 'a line to tick is a picture, not a control');
    assert.match(
      seen.last,
      /\[x\]\(javascript:alert\(1\)\) \[y\]\(http:\/\/example\.test\) \[z\]\(https:\/\/user:pw@example\.test\)/,
    );
    // The numbers behind a chart can be copied as they were written.
    await page.evaluate(`document.querySelector('#messages .reply-chart .figure-copy').click()`);
    await page.waitFor(`window.__copied !== undefined`, 'the copy');
    assert.equal(await page.evaluate(`window.__copied`), 'title: Hours of sun\nNorth: 8\nSouth: 4');
    // The model is told what it may use.
    assert.match(
      stack.model.requests.at(-1).messages[0].content,
      /fenced block labelled chart[\s\S]*Link only to an https address/,
    );
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();
  },
);

// Plan my day: an interview the owner starts from the tile or in their own words. The model is told
// the steps and the methods to pick from; this page adds nothing to a list or calendar by itself.
test('a planning interview is started by the owner, tells the model its steps and methods, and ends when asked', options, async () => {
  const page = await openConnectedPage(stack);
  const system = () => stack.model.requests.at(-1).messages[0].content,
    owner = () => stack.model.requests.at(-1).messages.at(-1).content;
  const barHidden = () => page.evaluate(`document.getElementById('plan-bar').hidden`);
  const idle = (what) => page.waitFor(`!document.getElementById('profile').disabled`, what);
  await askModel(stack, page, 'A synthetic hello.');
  assert.doesNotMatch(system(), /PLANNING INTERVIEW\./);
  assert.equal(await barHidden(), true);
  // Talk about plans starts nothing.
  await askModel(stack, page, 'What is the plan for my day?');
  assert.doesNotMatch(system(), /PLANNING INTERVIEW\./);
  assert.equal(await barHidden(), true);

  // The tile on Today is a real button and starts a day with the owner's opening message.
  assert.equal(await page.evaluate(`document.getElementById('home-plan').tagName + ':' + document.getElementById('home-plan').textContent`), 'BUTTON:◷Plan my day');
  const before = stack.model.requests.length;
  await page.evaluate(`document.getElementById('home-plan').click()`);
  await page.waitFor(`!document.getElementById('plan-bar').hidden && !document.getElementById('profile').disabled`, 'the interview to start');
  assert.equal(stack.model.requests.length, before + 1);
  assert.equal(owner(), 'Help me plan my day, one step at a time.');
  assert.match(system(), /PLANNING INTERVIEW\. The owner asked you to plan their day with them, so that/);
  assert.match(system(), /\n1\. Brain dump\.[\s\S]*\n3\. Pick the method\.[\s\S]*the Eisenhower matrix[\s\S]*the Pomodoro technique[\s\S]*\n5\. Time slices\./);
  assert.match(system(), /three most important tasks for today/);
  assert.match(await page.evaluate(`document.getElementById('plan-bar').textContent`), /^Planning · your day · /);
  assert.deepEqual(
    JSON.parse(await page.evaluate(`JSON.stringify([...document.querySelectorAll('#plan-bar button')].map((b) => b.textContent))`)),
    ['Talk', 'End planning'],
  );
  // It holds for the owner's answers, and the tile does not start a second one.
  await askModel(stack, page, 'Report draft, expenses, call the plumber, slides.');
  assert.match(system(), /PLANNING INTERVIEW\./);
  const during = stack.model.requests.length;
  await page.evaluate(`document.getElementById('home-plan').click()`);
  assert.equal(stack.model.requests.length, during);
  // The other profile has none; coming back, it is still on.
  await page.fill('#profile', 'work');
  assert.equal(await barHidden(), true);
  await page.fill('#profile', 'personal');
  assert.equal(await barHidden(), false);
  // Ended in the owner's words: no model is asked, the bar goes, and the guidance stops.
  await page.fill('#thought', 'End planning');
  await page.evaluate(`document.querySelector('#composer').requestSubmit()`);
  await page.waitFor(`document.getElementById('plan-bar').hidden`, 'the bar to go');
  assert.equal(stack.model.requests.length, during, 'ending asks no model');
  await askModel(stack, page, 'A synthetic question about peas.');
  assert.doesNotMatch(system(), /PLANNING INTERVIEW\./);

  // Typed for a week: the owner's own words are the opening message.
  await askModel(stack, page, 'Can you help me plan my week?');
  assert.equal(owner(), 'Can you help me plan my week?');
  assert.match(system(), /plan their week with them/);
  assert.match(system(), /keep this pairing for five working days/);
  assert.match(await page.evaluate(`document.getElementById('plan-bar').textContent`), /^Planning · your week · /);
  await page.click('#plan-end');
  assert.equal(await barHidden(), true);
  await idle('the page to settle');
  assert.deepEqual(page.outsideRequests(), []);
  await page.close();
});

// Start a debate: the owner picks a question and a position, and for that conversation the model
// is told to argue the other side. Nothing a model writes can start one.
test('a debate is started by the owner, tells the model to argue the other side, and ends when asked', options, async () => {
  const page = await openConnectedPage(stack);
  const system = () => stack.model.requests.at(-1).messages[0].content,
    owner = () => stack.model.requests.at(-1).messages.at(-1).content;
  const barHidden = () => page.evaluate(`document.getElementById('debate-bar').hidden`);
  const waitUntil = async (done, what) => {
    for (let i = 0; i < 400; i++) {
      if (done()) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.fail('timed out waiting for ' + what);
  };
  // An ordinary message first: no debate, no bar.
  await askModel(stack, page, 'A synthetic hello.');
  assert.doesNotMatch(system(), /DEBATE\./);
  assert.equal(await barHidden(), true);
  // The tile opens the window with the built-in questions and both cases for the one chosen.
  await page.evaluate(`document.getElementById('home-debate').click()`);
  await page.waitFor(`document.getElementById('debate').open`, 'the debate window');
  const offered = JSON.parse(
    await page.evaluate(`JSON.stringify([...document.querySelectorAll('#debate-topic option')].map((o) => o.value))`),
  );
  assert.ok(offered.length >= 9 && offered.includes('voting') && offered.at(-1) === 'own');
  await page.fill('#debate-topic', 'voting');
  assert.match(await page.evaluate(`document.getElementById('debate-one').textContent`), /One vote rarely decides/);
  assert.match(await page.evaluate(`document.getElementById('debate-other').textContent`), /Turnout decides/);
  assert.equal(await page.evaluate(`document.getElementById('debate-own').hidden`), true);
  // Without a position nothing starts.
  const before = stack.model.requests.length;
  await page.click('#debate-start');
  assert.match(await page.evaluate(`document.getElementById('debate-note').textContent`), /Say where you stand/);
  assert.equal(stack.model.requests.length, before);
  await page.fill('#debate-position', 'One vote changes nothing, so I stay home.');
  await page.click('#debate-start');
  await page.waitFor(`!document.getElementById('debate-bar').hidden && !document.getElementById('profile').disabled`, 'the debate to start');
  assert.equal(stack.model.requests.length, before + 1);
  assert.equal(owner(), 'Let’s debate: Voting: is taking part in elections worth it?\n\nWhere I stand: One vote changes nothing, so I stay home.');
  assert.match(system(), /DEBATE\. The owner started a debate with you and asked you to argue the other side/);
  assert.match(system(), /Where the owner stands, in their own words[^\n]*“One vote changes nothing, so I stay home\.”/);
  assert.match(system(), /Never invent a statistic, study, quotation or source/);
  assert.match(await page.evaluate(`document.getElementById('debate-bar').textContent`), /PEA argues the other side · Voting: is taking part in elections worth it\?/);
  // It holds for the next message, and Sum up asks for both sides.
  await askModel(stack, page, 'But close results are rare.');
  assert.match(system(), /DEBATE\./);
  await page.click('#debate-sum');
  await page.waitFor(`!document.getElementById('profile').disabled`, 'the summary');
  assert.match(owner(), /^Sum up this debate: the strongest points on each side/);
  assert.match(system(), /DEBATE\./);
  // Switching sides, typed or pressed: the model is told it now defends the owner's first position.
  const text = (id) => page.evaluate(`document.getElementById('${id}').textContent`);
  assert.equal(await text('debate-switch'), 'Switch sides');
  await askModel(stack, page, 'Switch sides.');
  assert.match(owner(), /^Switch sides: now you defend the position I started with/);
  assert.match(system(), /asked to switch sides\. For now you defend the position quoted above/);
  assert.equal(await text('debate-bar-role'), 'PEA defends your first position');
  assert.equal(await text('debate-switch'), 'Switch back');
  const unswitched = stack.model.requests.length;
  await page.click('#debate-switch');
  await waitUntil(() => stack.model.requests.length > unswitched, 'the switch back to be sent');
  await page.waitFor(`!document.getElementById('profile').disabled`, 'the switch back');
  assert.match(owner(), /^Switch back: argue against the position I started with again/);
  assert.match(system(), /take the strongest serious case against where they stand/);
  assert.equal(await text('debate-bar-role'), 'PEA argues the other side');
  // A written turn is long and structured; "wrap up" in the owner's words asks for the summary.
  assert.match(system(), /about 200 to 450 words/);
  await askModel(stack, page, 'Can you wrap up what was learned?');
  assert.match(owner(), /^Sum up this debate: the strongest points on each side/);
  // The other profile has no debate; coming back, it is still on.
  await page.fill('#profile', 'work');
  assert.equal(await barHidden(), true);
  await page.fill('#profile', 'personal');
  assert.equal(await barHidden(), false);
  // Ended: the bar goes and the model is no longer told to argue.
  await page.click('#debate-end');
  assert.equal(await barHidden(), true);
  await askModel(stack, page, 'A synthetic question about peas.');
  assert.doesNotMatch(system(), /DEBATE\./);
  // A question of the owner's own.
  await page.evaluate(`document.getElementById('home-debate').click()`);
  await page.fill('#debate-topic', 'own');
  assert.equal(await page.evaluate(`document.getElementById('debate-own').hidden`), false);
  assert.equal(await page.evaluate(`document.getElementById('debate-sides').hidden`), true);
  await page.fill('#debate-own', 'Should synthetic peas be shelled by hand?');
  await page.fill('#debate-position', 'Yes, always.');
  await page.click('#debate-start');
  await page.waitFor(`!document.getElementById('debate-bar').hidden && !document.getElementById('profile').disabled`, 'the second debate');
  assert.match(system(), /Question: “Should synthetic peas be shelled by hand\?”/);
  assert.doesNotMatch(system(), /One vote changes nothing/, 'the earlier debate is over');
  // A new chat ends it.
  await page.evaluate(`document.getElementById('library-new-chat').click()`);
  await page.waitFor(`document.getElementById('review').open`, 'the new chat review');
  await page.click('#review-approve');
  await page.waitFor(`document.getElementById('debate-bar').hidden`, 'the bar to go with the conversation');
  await askModel(stack, page, 'A fresh synthetic start.');
  assert.doesNotMatch(system(), /DEBATE\./);
  // The owner's own words: a named question opens the window with it chosen and asks no model.
  const say = async (words) => {
    await page.fill('#thought', words);
    await page.evaluate(`document.querySelector('#composer').requestSubmit()`);
  };
  const asked = stack.model.requests.length;
  await say('Debate me on nuclear power');
  await page.waitFor(`document.getElementById('debate').open`, 'the window for a named question');
  assert.equal(await page.evaluate(`document.getElementById('debate-topic').value`), 'nuclear');
  assert.equal(await page.evaluate(`document.getElementById('thought').value`), '');
  await page.evaluate(`document.getElementById('debate').close()`);
  await say('What is a debate, in one line?');
  await waitUntil(() => stack.model.requests.length > asked, 'an ordinary question to go to the model');
  await page.waitFor(`!document.getElementById('profile').disabled`, 'the ordinary reply');
  assert.doesNotMatch(system(), /DEBATE\./);
  assert.equal(await barHidden(), true);
  // A long opening argument starts the debate with the owner's message exactly as written.
  const opening =
    'Argue with me: synthetic peas should always be shelled by hand because machines bruise them and nobody is in a hurry.';
  await askModel(stack, page, opening);
  assert.equal(owner(), opening);
  assert.match(system(), /DEBATE\./);
  assert.match(system(), /Question: “The argument in my first message”/);
  assert.match(system(), /“synthetic peas should always be shelled by hand because machines bruise them and nobody is in a hurry”/);
  assert.equal(await barHidden(), false);
  // "End debate" in the owner's words ends it on this page and asks no model.
  const ended = stack.model.requests.length;
  await say('end debate');
  await page.waitFor(`document.getElementById('debate-bar').hidden`, 'the typed end');
  assert.equal(stack.model.requests.length, ended);
  assert.deepEqual(page.outsideRequests(), []);
  await page.close();
});
