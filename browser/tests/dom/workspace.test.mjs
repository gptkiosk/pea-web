// Browser-level checks for the desktop workspace: two panes on a wide screen, one on a narrow one.
// Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { askModel, browserSkipReason, openConnectedPage, openReview, startStack } from './harness.mjs';

const skip = browserSkipReason();
const options = { skip, timeout: 45000 };
const story =
  'I can capture that.\n```pea-story\n' +
  JSON.stringify({ op: 'story_add', title: 'Synthetic story', details: 'Synthetic scope' }) +
  '\n```\n';
const todo =
  'Here is that to-do.\n```pea-task\n' +
  JSON.stringify([{ op: 'task_add', title: 'Buy synthetic groceries' }]) +
  '\n```\n';

let stack;
before(
  async () => {
    if (!skip)
      stack = await startStack((said) =>
        said.includes('story') ? story : said.includes('groceries') ? todo : 'A plain synthetic reply.',
      );
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
  const page = await openConnectedPage(stack, { width: 1400 });
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
  assert(gap >= 0, 'the panes sit under the bar that holds the status: ' + gap);

  await page.click('#tab-today');
  assert.deepEqual(await shown(page), ['chat', 'today'], 'the chip of an open workspace focuses it');
  assert.equal(await focused(page), 'today');

  await page.click('#tab-greenhouse');
  assert.deepEqual(
    await shown(page),
    ['greenhouse', 'today'],
    'with room for two, a new workspace takes the place of the one not in use',
  );
  assert.equal(await focused(page), 'greenhouse');

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

test('on a screen with room PEA is one fixed window under a slim bar', options, async () => {
  const page = await stack.browser.newPage();
  await page.setViewport(1600, 900);
  await page.goto(stack.gateway.origin + '/');
  await page.waitFor(`document.querySelector('[data-tab].selected')`, 'the workspace');
  // A double press leaves one workspace alone in the window.
  const alone = (name) =>
    page.evaluate(
      `document.getElementById('tab-${name}').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`,
    );
  const frame = () =>
    page.evaluate(`(() => {
      const box = (selector) => { const r = document.querySelector(selector).getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }; };
      scrollTo(0, 400); const moved = scrollY; scrollTo(0, 0);
      const open = [...document.querySelectorAll('.panel')].filter((p) => !p.hidden);
      return {
        moved, tall: document.documentElement.scrollHeight - innerHeight,
        brand: box('.rail .brand'), chips: box('.rail nav'), status: box('.setup-strip'), controls: box('main > header'),
        panes: box('#panes'), footer: box('.release-footer'), height: innerHeight,
        first: box('#tab-chat'), last: box('#tab-harvest'), width: innerWidth,
        inside: open.every((p) => { const r = p.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }),
        title: getComputedStyle(document.getElementById('page-title').parentElement).display,
      };
    })()`);
  for (const tab of ['chat', 'today', 'greenhouse']) {
    await alone(tab);
    await page.waitFor(`!document.getElementById('${tab}').hidden`, tab);
    const f = await frame();
    assert.equal(f.moved, 0, tab + ': the page does not scroll');
    assert.ok(f.tall <= 1, tab + ': nothing reaches below the window');
    // Brand, status and controls share the bar; the chips have the row under it, in the middle.
    assert.ok(f.panes.top <= 108, tab + ': the bar and the chip row are slim');
    for (const part of [f.brand, f.chips, f.status, f.controls])
      assert.ok(part.top >= 0 && part.bottom <= f.panes.top + 1, tab + ': a part of the bar is inside it');
    assert.ok(f.brand.right <= f.status.left + 1 && f.status.right <= f.controls.left + 1);
    assert.ok(
      f.first.top >= Math.max(f.brand.bottom, f.status.bottom, f.controls.bottom) - 8,
      tab + ': the chips sit a level below the bar',
    );
    assert.ok(
      Math.abs((f.first.left + f.last.right) / 2 - f.width / 2) <= 2,
      tab + ': the chips are centred in the window',
    );
    assert.ok(
      f.footer.bottom <= f.height + 1 && f.footer.top >= f.panes.bottom - 1,
      tab + ': the footer closes the window',
    );
    assert.equal(f.inside, true, tab + ': the pane is a frame inside the window');
    assert.equal(f.title, 'none', 'the chip names the workspace, so the page title is not repeated');
  }
  // The chips show what is open, and every control the bar replaced is still there.
  assert.deepEqual(
    await page.evaluate(
      `[...document.querySelectorAll('[data-tab]')].map((b) => [b.dataset.tab, b.classList.contains('selected'), getComputedStyle(b).borderTopStyle])`,
    ),
    [
      ['chat', false, 'dashed'],
      ['today', false, 'dashed'],
      ['greenhouse', true, 'solid'],
      ['harvest', false, 'dashed'],
    ],
  );
  for (const id of ['connections-open', 'library-open', 'profile', 'theme', 'split-toggle', 'workspace-menu'])
    assert.equal(
      await page.evaluate(
        `(() => { const r = document.getElementById('${id}').getBoundingClientRect(); return r.width > 0 && r.height > 0; })()`,
      ),
      true,
      id + ' is in the bar',
    );
  assert.match(await page.text('#connection-status'), /\S/);
  assert.match(await page.text('#memory-status'), /\S/);

  // A long pane scrolls inside itself.
  await alone('today');
  await page.waitFor(`!document.getElementById('today').hidden`, 'Today');
  assert.equal(
    await page.evaluate(
      `(() => { const t = document.getElementById('today'); return t.scrollHeight > t.clientHeight && getComputedStyle(t).overflowY === 'auto'; })()`,
    ),
    true,
  );

  // With a second workspace brought in, each has its own bar with Swap sides and Tuck up, and
  // tucking leaves the chip dashed.
  await page.click('#tab-chat');
  assert.equal(await page.evaluate(`document.getElementById('panes').classList.contains('split')`), true);
  assert.equal((await frame()).moved, 0);
  assert.deepEqual(
    await page.evaluate(
      `[...document.querySelectorAll('#today .pane-bar button')].filter((b) => !b.hidden).map((b) => b.textContent)`,
    ),
    ['Swap sides', 'Tuck up'],
  );
  await page.evaluate(`document.querySelector('#today .pane-bar [aria-label="Close Today pane"]').click()`);
  await page.waitFor(`document.getElementById('today').hidden`, 'Today tucked up');
  assert.equal(
    await page.evaluate(`getComputedStyle(document.getElementById('tab-today')).borderTopStyle`),
    'dashed',
  );

  // A smaller desktop window keeps the same two levels and is still a fixed window: the status
  // gives up width before anything leaves the bar.
  await page.setViewport(1024, 768);
  await page.waitFor(`innerWidth === 1024`, 'the smaller window');
  const narrow = await frame();
  assert.equal(narrow.moved, 0);
  assert.ok(narrow.tall <= 1);
  assert.ok(narrow.panes.top <= 108);
  assert.ok(narrow.brand.right <= narrow.status.left + 1 && narrow.status.right <= narrow.controls.left + 1);
  assert.ok(narrow.controls.right <= narrow.width, 'the controls are inside the window');
  assert.ok(narrow.first.top >= narrow.status.bottom - 8, 'the chips are on their own row');
  assert.ok(Math.abs((narrow.first.left + narrow.last.right) / 2 - narrow.width / 2) <= 2);
  assert.deepEqual(page.outsideRequests(), []);
  await page.close();
});

test('chips bring up to three workspaces in, and panes move, resize and tuck up', options, async () => {
  const page = await stack.browser.newPage();
  await page.setViewport(1680, 900);
  await page.goto(stack.gateway.origin + '/');
  await page.waitFor(`document.querySelector('[data-tab].selected')`, 'the workspace');
  const state = async () => [await shown(page), await focused(page)];
  const press = async (name) => {
    await page.click('#tab-' + name);
  };
  assert.deepEqual(await state(), [['chat'], 'chat']);
  await press('chat');
  assert.deepEqual(await state(), [['chat'], 'chat'], 'the only open workspace stays');

  // A tucked chip brings its workspace in beside the one in use, and focuses it.
  await press('today');
  assert.deepEqual(await state(), [['chat', 'today'], 'today']);
  await press('greenhouse');
  assert.deepEqual(await state(), [['chat', 'today', 'greenhouse'], 'greenhouse']);
  assert.equal(
    await page.evaluate(`(() => { scrollTo(0, 300); const y = scrollY; scrollTo(0, 0); return y; })()`),
    0,
  );
  assert.deepEqual(
    await page.evaluate(`[...document.querySelectorAll('.pane-divider')].map((d) => d.hidden)`),
    [false, false],
  );
  // The chip of an open workspace that is not in use only focuses it.
  await press('chat');
  assert.deepEqual(await state(), [['chat', 'today', 'greenhouse'], 'chat']);

  // With three, each bar has move buttons where there is somewhere to go, and no Swap sides.
  const buttons = (name) =>
    page.evaluate(
      `[...document.querySelectorAll('#${name} .pane-bar button')].filter((b) => !b.hidden).map((b) => b.getAttribute('aria-label') + (b.disabled ? ' (off)' : ''))`,
    );
  assert.deepEqual(await buttons('chat'), ['Move Chat left (off)', 'Move Chat right', 'Close Chat pane']);
  assert.deepEqual(await buttons('greenhouse'), [
    'Move Greenhouse left',
    'Move Greenhouse right (off)',
    'Close Greenhouse pane',
  ]);
  await page.evaluate(`document.querySelector('#chat .pane-bar [aria-label="Move Chat right"]').click()`);
  assert.deepEqual(await shown(page), ['today', 'chat', 'greenhouse']);

  // Dragging a pane by its name moves it past the pane the pointer is over.
  await page.evaluate(`(() => {
    const handle = document.querySelector('#greenhouse .pane-bar strong');
    const at = (el) => { const r = el.getBoundingClientRect(); return { clientX: r.left + r.width / 2, clientY: r.top + 10, bubbles: true, pointerId: 7 }; };
    handle.dispatchEvent(new PointerEvent('pointerdown', at(handle)));
    handle.dispatchEvent(new PointerEvent('pointermove', at(document.getElementById('today'))));
    handle.dispatchEvent(new PointerEvent('pointerup', at(document.getElementById('today'))));
  })()`);
  assert.deepEqual(await shown(page), ['greenhouse', 'today', 'chat']);

  // The second divider changes only the second and third panes, by keyboard, within limits.
  const widths = () =>
    page.evaluate(
      `['greenhouse', 'today', 'chat'].map((id) => Math.round(document.getElementById(id).getBoundingClientRect().width))`,
    );
  const before = await widths();
  await page.evaluate(`(() => {
    const bar = document.getElementById('pane-divider-2');
    for (let i = 0; i < 5; i++) bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  })()`);
  const after = await widths();
  assert.ok(Math.abs(after[0] - before[0]) <= 2, 'the first pane keeps its width');
  assert.ok(
    after[1] > before[1] + 80 && after[2] < before[2] - 80,
    'the second grows, the third shrinks: ' + after,
  );
  await page.evaluate(
    `document.getElementById('pane-divider-2').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))`,
  );
  const least = await widths();
  assert.ok(least[2] >= 0.17 * (least[0] + least[1] + least[2]), 'no pane is squeezed away: ' + least);

  // The arrangement is remembered, as names and widths only.
  const saved = JSON.parse(await page.evaluate(`localStorage.getItem('pea-workspace-v1')`));
  assert.deepEqual(Object.keys(saved).sort(), ['focus', 'panes', 'ratio', 'sizes']);
  await page.goto(stack.gateway.origin + '/');
  await page.waitFor(
    `document.querySelectorAll('.panel:not([hidden])').length === 3`,
    'the three panes again',
  );
  assert.deepEqual(await shown(page), ['greenhouse', 'today', 'chat']);

  // A window with room for two shows the one in use and a neighbour, and keeps the third for later.
  await page.setViewport(1300, 900);
  await page.waitFor(`document.querySelectorAll('.panel:not([hidden])').length === 2`, 'two panes');
  await page.setViewport(1680, 900);
  await page.waitFor(`document.querySelectorAll('.panel:not([hidden])').length === 3`, 'three panes');

  // Pressing the chip of the workspace in use tucks it up; pressing a chip twice leaves it alone.
  const inUse = await focused(page);
  await press(inUse);
  assert.equal((await shown(page)).includes(inUse), false);
  assert.equal(
    await page.evaluate(`getComputedStyle(document.getElementById('tab-${inUse}')).borderTopStyle`),
    'dashed',
  );
  assert.deepEqual(
    await page.evaluate(`[...document.querySelectorAll('.pane-divider')].map((d) => d.hidden)`),
    [false, true],
  );
  await page.evaluate(
    `document.getElementById('tab-today').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`,
  );
  assert.deepEqual(await state(), [['today'], 'today']);
  assert.deepEqual(page.outsideRequests(), []);
  await page.close();
});

test(
  'Harvest gathers what a conversation proposed, with the same review and nothing done before it',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1680, height: 900 });
    const harvest = () =>
      page.evaluate(`(() => {
      const list = (id) =>
        [...document.querySelectorAll('#' + id + ' li')].map((li) => [...li.children].map((c) => c.textContent).join(' | '));
      const count = document.getElementById('harvest-count');
      return {
        waiting: list('harvest-waiting'), done: list('harvest-done'),
        empty: !document.getElementById('harvest-empty').hidden,
        count: count.hidden ? '' : count.textContent,
        chip: document.getElementById('tab-harvest').getAttribute('aria-label'),
        hint: document.getElementById('tab-harvest').title,
        peek: (() => {
          const chip = document.getElementById('tab-harvest');
          chip.dispatchEvent(new PointerEvent('pointerenter'));
          const card = document.getElementById('chip-peek');
          const lines = card.hidden ? [] : [...card.querySelectorAll('p')].map((p) => p.textContent);
          chip.dispatchEvent(new PointerEvent('pointerleave'));
          return lines;
        })(),
      };
    })()`);
    assert.deepEqual(await harvest(), {
      waiting: [],
      done: [],
      empty: true,
      count: '',
      chip: 'Harvest',
      hint: '',
      peek: ['Nothing gathered yet.'],
    });

    // A plain reply gathers nothing; a proposal is counted on the chip while Harvest is tucked up.
    await askModel(stack, page, 'Hello there.');
    assert.equal((await harvest()).count, '');
    await askModel(stack, page, 'Please capture a story.');
    let now = await harvest();
    assert.deepEqual(now.waiting, ['From Chat | Review story: Synthetic story']);
    assert.equal(now.count, '1');
    assert.equal(now.chip, 'Harvest, 1 waiting for your review');
    assert.equal(now.hint, '', 'the peek panel says it, not a tooltip');
    assert.deepEqual(now.peek, ['1 waiting for your review:', 'Review story: Synthetic story']);
    assert.equal(await page.evaluate(`document.getElementById('harvest').hidden`), true);
    assert.equal(
      await page.evaluate(
        `document.querySelectorAll('#tasks-section .story-card, #stories .story-card').length`,
      ),
      0,
    );

    // Its chip brings it in beside Chat; the reply keeps its own Review button too.
    await page.click('#tab-harvest');
    assert.deepEqual(await shown(page), ['chat', 'harvest']);
    assert.equal(
      await page.evaluate(
        `[...document.querySelectorAll('#messages button')].filter((b) => /^Review story/.test(b.textContent)).length`,
      ),
      1,
    );

    // Reviewing from Harvest is the same review; cancelling changes nothing.
    await page.evaluate(`document.querySelector('#harvest-waiting button').click()`);
    await page.waitFor(`document.getElementById('review').open`, 'the review');
    assert.match(await page.text('#review-body'), /Synthetic story/);
    await page.click('#review-cancel');
    await page.waitFor(`!document.getElementById('review').open`);
    assert.equal((await harvest()).count, '1', 'cancel leaves it waiting');
    assert.deepEqual((await harvest()).peek, [], 'a workspace that is open has no peek');

    await page.evaluate(`document.querySelector('#harvest-waiting button').click()`);
    await page.waitFor(`document.getElementById('review').open`, 'the review again');
    await page.click('#review-approve');
    await page.waitFor(`document.getElementById('harvest-count').hidden`, 'nothing left waiting');
    now = await harvest();
    assert.deepEqual(now.waiting, []);
    assert.deepEqual(now.done, ['From Chat | Added to Today: Synthetic story | Show the story board']);
    assert.equal(now.chip, 'Harvest');
    assert.match(await page.text('#today'), /Synthetic story/, 'the approved story is on the board');

    // Another profile has its own harvest.
    await page.fill('#profile', 'work');
    await page.waitFor(`document.getElementById('profile').value === 'work'`);
    assert.deepEqual((await harvest()).waiting, []);
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();
  },
);

test(
  'a tucked chip shows a peek of its workspace, in words only, and an open one shows none',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1680, height: 900 });
    const point = (name, kind) =>
      page.evaluate(`document.getElementById('tab-${name}').dispatchEvent(new PointerEvent('${kind}'))`);
    const peek = () =>
      page.evaluate(`(() => {
        const card = document.getElementById('chip-peek');
        if (card.hidden) return null;
        const r = card.getBoundingClientRect();
        const chip = document.querySelector('[aria-describedby="chip-peek"]');
        const c = chip.getBoundingClientRect();
        return {
          title: card.querySelector('strong').textContent,
          lines: [...card.querySelectorAll('p')].map((p) => p.textContent),
          hint: card.querySelector('small').textContent,
          role: card.getAttribute('role'),
          chip: chip.id,
          under: r.top >= c.bottom && r.top <= c.bottom + 16,
          centred: Math.abs(r.left + r.width / 2 - (c.left + c.width / 2)) <= 2,
          inside: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
          pressable: card.querySelectorAll('button, a, input, [tabindex]').length,
          clicks: getComputedStyle(card).pointerEvents,
        };
      })()`);
    assert.equal(await peek(), null, 'nothing shows until a chip is pointed at');

    // Chat is open, so its chip has no peek; Today is tucked up and says what it holds.
    await point('chat', 'pointerenter');
    assert.equal(await peek(), null);
    await point('today', 'pointerenter');
    let now = await peek();
    assert.equal(now.title, 'Today');
    assert.ok(now.lines.length >= 1 && now.lines.length <= 4);
    assert.match(now.hint, /Tucked up/);
    assert.equal(now.role, 'tooltip');
    assert.equal(now.chip, 'tab-today');
    assert.ok(now.under && now.centred && now.inside, 'the panel sits under its chip, inside the window');
    assert.equal(now.pressable, 0, 'words only: nothing in the peek can be pressed');
    assert.equal(now.clicks, 'none');
    await point('today', 'pointerleave');
    assert.equal(await peek(), null);
    assert.equal(
      await page.evaluate(`document.querySelectorAll('[aria-describedby="chip-peek"]').length`),
      0,
    );

    // A conversation shows through the peek once Chat is tucked: its size and its last line,
    // as plain words with the layout marks left out, cut to one short line.
    await askModel(stack, page, 'Hello there.');
    await page.evaluate(
      `document.getElementById('tab-today').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`,
    );
    assert.deepEqual(await shown(page), ['today']);
    await point('chat', 'pointerenter');
    now = await peek();
    assert.equal(now.title, 'Chat');
    assert.equal(now.lines[0], '2 messages in this conversation');
    assert.match(now.lines[1], /^PEA: \S/);
    assert.ok(now.lines[1].length <= 96);
    assert.doesNotMatch(now.lines[1], /[#*`]/);

    // Escape puts it away, and pressing the chip brings the workspace in with no peek left over.
    await page.evaluate(
      `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`,
    );
    assert.equal(await peek(), null);
    await point('chat', 'pointerenter');
    assert.notEqual(await peek(), null);
    await page.click('#tab-chat');
    assert.deepEqual(await shown(page), ['today', 'chat']);
    assert.equal(await peek(), null);

    // Greenhouse and Harvest answer too, each with its own words.
    await point('greenhouse', 'pointerenter');
    assert.deepEqual((await peek()).lines.at(-1), 'No conversation yet.');
    await point('harvest', 'pointerenter');
    assert.deepEqual((await peek()).lines, ['Nothing gathered yet.']);
    await point('harvest', 'pointerleave');

    // On a phone-sized screen the chips are plain tabs and show no panel.
    await page.setViewport(390, 800);
    await point('greenhouse', 'pointerenter');
    assert.equal(await peek(), null);
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();
  },
);

test(
  'Harvest keeps a receipt for an approved story and to-do, and leads to where each now lives',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1680, height: 900 });
    const lists = () =>
      page.evaluate(`(() => {
        const list = (id) =>
          [...document.querySelectorAll('#' + id + ' li')].map((li) => [...li.children].map((c) => c.textContent).join(' | '));
        return { waiting: list('harvest-waiting'), done: list('harvest-done') };
      })()`);
    const kept = () =>
      page.evaluate(
        `[document.querySelectorAll('#todo-list .todo-item').length, document.querySelectorAll('#board-columns .story-card, #board-columns article').length]`,
      );
    await page.waitFor(`!document.getElementById('todo-title').disabled`, 'the to-do list to be ready');
    await askModel(stack, page, 'Please capture a story.');
    await askModel(stack, page, 'Please add groceries to my list.');
    assert.deepEqual(await lists(), {
      waiting: ['From Chat | Review story: Synthetic story', 'From Chat | Review to-do changes'],
      done: [],
    });

    // Each is approved from Harvest with the usual review.
    for (const label of ['Review story', 'Review to-do changes']) {
      await page.evaluate(
        `[...document.querySelectorAll('#harvest-waiting button')].find((b) => b.textContent.startsWith(${JSON.stringify(label)})).click()`,
      );
      await page.waitFor(`document.getElementById('review').open`, label);
      await page.click('#review-approve');
      await page.waitFor(`!document.getElementById('review').open`);
    }
    await page.waitFor(`document.querySelectorAll('#harvest-done li').length === 2`, 'two receipts');
    // Newest first; each says what was done, in the words the reply itself now shows.
    assert.deepEqual(await lists(), {
      waiting: [],
      done: [
        'From Chat | Added to your list: “Buy synthetic groceries”. | Show the to-do list',
        'From Chat | Added to Today: Synthetic story | Show the story board',
      ],
    });
    const chat = await page.text('#messages');
    assert.match(chat, /Added to Today: Synthetic story/);
    assert.match(chat, /Added to your list: “Buy synthetic groceries”\./);
    assert.equal(
      await page.evaluate(
        `[...document.querySelectorAll('#messages button')].filter((b) => /^Show the /.test(b.textContent)).length`,
      ),
      0,
      'the way to Today is offered in Harvest only',
    );
    assert.equal(await page.evaluate(`document.getElementById('harvest-count').hidden`), true);

    // From Harvest alone, a receipt brings Today in beside it and opens the right card. Nothing is
    // added or changed by looking.
    const before = await kept();
    await page.evaluate(
      `document.getElementById('tab-harvest').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`,
    );
    assert.deepEqual(await shown(page), ['harvest']);
    await page.evaluate(`document.getElementById('todos-section').open = false`);
    const show = (text) =>
      page.evaluate(
        `[...document.querySelectorAll('#harvest-done button')].find((b) => b.textContent === ${JSON.stringify(text)}).click()`,
      );
    await show('Show the to-do list');
    assert.deepEqual(await shown(page), ['harvest', 'today']);
    assert.equal(await page.evaluate(`document.getElementById('todos-section').open`), true);
    assert.match(await page.text('#todo-list'), /Buy synthetic groceries/);
    await page.evaluate(`document.getElementById('tasks-section').open = false`);
    await show('Show the story board');
    assert.equal(await page.evaluate(`document.getElementById('tasks-section').open`), true);
    assert.match(await page.text('#board-columns'), /Synthetic story/);
    assert.deepEqual(await kept(), before);
    assert.equal((await lists()).done.length, 2, 'the receipts stay');

    // On a narrow screen the same button simply opens Today.
    await page.setViewport(800, 900);
    await page.click('#tab-harvest');
    await show('Show the story board');
    assert.deepEqual(await shown(page), ['today']);

    // Another profile sees none of it.
    await page.fill('#profile', 'work');
    await page.waitFor(`document.getElementById('profile').value === 'work'`);
    assert.deepEqual(await lists(), { waiting: [], done: [] });
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();
  },
);

test(
  'each profile comes back to its own arrangement, and a new one starts from what is shown',
  options,
  async () => {
    const page = await stack.browser.newPage();
    await page.setViewport(1680, 900);
    await page.goto(stack.gateway.origin + '/');
    await page.waitFor(`document.querySelector('[data-tab].selected')`, 'the workspace');
    const state = async () => [await shown(page), await focused(page)];
    const profile = async (name) => {
      await page.fill('#profile', name);
      await page.waitFor(`document.getElementById('profile').value === '${name}'`);
    };
    const keys = () =>
      page.evaluate(`Object.keys(localStorage).filter((k) => k.startsWith('pea-workspace')).sort()`);
    const alone = (name) =>
      page.evaluate(
        `document.getElementById('tab-${name}').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`,
      );

    // Personal: Chat with Today beside it.
    await page.click('#tab-today');
    assert.deepEqual(await state(), [['chat', 'today'], 'today']);
    assert.deepEqual(await keys(), ['pea-workspace-v1']);

    // Work has no arrangement yet: it starts from what is on screen and keeps it as its own.
    await profile('work');
    assert.deepEqual(await state(), [['chat', 'today'], 'today']);
    assert.deepEqual(await keys(), ['pea-workspace-v1', 'pea-workspace-v1:work']);
    await alone('greenhouse');
    await page.click('#tab-harvest');
    assert.deepEqual(await state(), [['greenhouse', 'harvest'], 'harvest']);

    // Personal is as it was left; Work's change did not touch it, and the other way round.
    await profile('personal');
    assert.deepEqual(await state(), [['chat', 'today'], 'today']);
    await alone('chat');
    assert.deepEqual(await state(), [['chat'], 'chat']);
    await profile('work');
    assert.deepEqual(await state(), [['greenhouse', 'harvest'], 'harvest']);
    await profile('blended');
    assert.deepEqual(
      await state(),
      [['greenhouse', 'harvest'], 'harvest'],
      'Blended starts from what is shown',
    );
    await alone('today');
    await profile('work');
    assert.deepEqual(await state(), [['greenhouse', 'harvest'], 'harvest']);
    assert.deepEqual(await keys(), ['pea-workspace-v1', 'pea-workspace-v1:blended', 'pea-workspace-v1:work']);

    // What is kept is workspace names and widths only, for each profile.
    const kept = await page.evaluate(
      `Object.keys(localStorage).filter((k) => k.startsWith('pea-workspace')).map((k) => Object.keys(JSON.parse(localStorage.getItem(k))).sort().join())`,
    );
    for (const fields of kept) assert.match(fields, /^focus,panes,ratio(,sizes)?$/);

    // A reload opens on Personal, with Personal's arrangement; Work's is there when chosen.
    await page.goto(stack.gateway.origin + '/');
    await page.waitFor(`document.querySelector('[data-tab].selected')`, 'the workspace again');
    assert.equal(await page.evaluate(`document.getElementById('profile').value`), 'personal');
    assert.deepEqual(await state(), [['chat'], 'chat']);
    await profile('work');
    assert.deepEqual(await state(), [['greenhouse', 'harvest'], 'harvest']);
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();
  },
);
