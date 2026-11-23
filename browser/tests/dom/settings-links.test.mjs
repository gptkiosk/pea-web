// Browser-level checks for going to a place in PEA's settings: from a message that names one, from
// the owner's own words, from a button a model offered, and from an address. On a wide screen the
// panel opens beside the page and the chat stays in use; on a narrow one it opens over the page.
// Going there opens a panel and nothing else.
// Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { askModel, browserSkipReason, openConnectedPage, startStack } from './harness.mjs';

const skip = browserSkipReason();
const options = { skip, timeout: 90000 };
let stack;
before(
  async () => {
    if (skip) return;
    stack = await startStack((said) =>
      said.includes('set up Google')
        ? 'It is in Connections.\n```pea-nav\n' +
          JSON.stringify({ op: 'settings', place: 'google' }) +
          '\n```'
        : said.includes('sneaky')
          ? 'Here.\n```pea-nav\n' + JSON.stringify({ op: 'settings', place: 'google', value: 'x' }) + '\n```'
          : 'A plain synthetic reply.',
    );
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

const type = async (page, words) => {
  await page.fill('#thought', words);
  await page.evaluate(`document.querySelector('#composer').requestSubmit()`);
};
// How a panel is on screen: open, over the page or beside it, and whether it covers the composer.
const shown = (page, id) =>
  page.evaluate(`(() => {
    const d = document.getElementById(${JSON.stringify(id)});
    const box = d.getBoundingClientRect(), field = document.getElementById('thought').getBoundingClientRect();
    return {
      open: d.open,
      modal: d.open && d.matches(':modal'),
      beside: d.classList.contains('beside'),
      clear: !d.open || field.right <= box.left + 1,
      inside: box.right <= innerWidth && box.left >= 0,
      body: document.body.classList.contains('settings-beside'),
    };
  })()`);
const section = (page, id) =>
  page.evaluate(`(() => {
    const g = document.getElementById(${JSON.stringify(id)});
    return { open: g.open, marked: g.classList.contains('settings-here') };
  })()`);
const system = () => stack.model.requests.at(-1).messages[0].content;

test(
  'on a wide screen a setting opens beside the chat, from a message, typed words, a model’s button and an address',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1500 });
    const asked = stack.model.requests.length;

    // A message of PEA's own that names a setting carries a button that goes there.
    await type(page, 'search for tide tables in Lisbon');
    await page.waitFor(
      `document.querySelector('#notice .notice-go')?.textContent === 'Open Web search'`,
      'the button',
    );
    assert.match(await page.text('#notice'), /^Web search needs your own Brave Search or Browserbase key\./);
    await page.click('#notice .notice-go');
    await page.waitFor(`document.getElementById('connections').open`, 'the panel');
    assert.deepEqual(await shown(page, 'connections'), {
      open: true,
      modal: false,
      beside: true,
      clear: true,
      inside: true,
      body: true,
    });
    assert.deepEqual(await section(page, 'search-providers'), { open: true, marked: true });
    assert.equal(await page.text('#notice'), '');
    assert.equal(
      await page.evaluate(`document.getElementById('search-key-brave').value`),
      '',
      'no field is filled',
    );
    assert.equal(stack.model.requests.length, asked, 'and no model was asked');

    // The chat stays in use, and the model is told what is open beside it.
    await askModel(stack, page, 'Hello there.');
    assert.match(
      system(),
      /The owner has PEA’s “Web search” settings open beside this chat\. It holds a field for/,
    );
    assert.match(
      system(),
      /you may offer one fenced pea-nav JSON block with exactly \{"op":"settings","place":"web-search"\}/,
    );
    assert.equal((await shown(page, 'connections')).open, true);

    // The usual button does not open it twice.
    await page.evaluate(`document.getElementById('collab-config').click()`);
    assert.equal((await shown(page, 'connections')).beside, true);

    // A model may offer a button for a place; pressing it moves to that section.
    await askModel(stack, page, 'How do I set up Google for this?');
    await page.waitFor(
      `[...document.querySelectorAll('#messages button')].some((b) => b.textContent === 'Open Google settings')`,
      'the offered button',
    );
    assert.deepEqual(
      await section(page, 'google-group'),
      { open: false, marked: false },
      'nothing opens by itself',
    );
    await page.evaluate(
      `[...document.querySelectorAll('#messages button')].find((b) => b.textContent === 'Open Google settings').click()`,
    );
    await page.waitFor(`document.getElementById('google-group').open`, 'the Google section');
    assert.deepEqual(await section(page, 'google-group'), { open: true, marked: true });
    assert.equal((await section(page, 'search-providers')).marked, false);
    // A block with anything extra in it is no button.
    await askModel(stack, page, 'Try something sneaky.');
    assert.equal(
      await page.evaluate(
        `[...document.querySelectorAll('#messages button')].filter((b) => b.textContent === 'Open Google settings').length`,
      ),
      1,
    );

    // The owner's own words: another panel takes the place beside the page. No model is asked.
    const before = stack.model.requests.length;
    await type(page, 'open privacy settings');
    await page.waitFor(`document.getElementById('preferences').open`, 'Privacy & voice');
    assert.deepEqual(await shown(page, 'preferences'), {
      open: true,
      modal: false,
      beside: true,
      clear: true,
      inside: true,
      body: true,
    });
    assert.equal((await shown(page, 'connections')).open, false);
    assert.equal(await page.evaluate(`document.getElementById('thought').value`), '');
    assert.equal(stack.model.requests.length, before);
    assert.equal(await page.evaluate(`document.querySelectorAll('#messages .utterance.user').length`), 3);

    // Closing it gives the page its width back, and the model is no longer told of it.
    await page.evaluate(`document.getElementById('preferences').close()`);
    await page.waitFor(`!document.body.classList.contains('settings-beside')`, 'the page at full width');
    await askModel(stack, page, 'And now?');
    assert.doesNotMatch(system(), /settings open beside this chat/);

    // An address names a place and nothing else.
    await page.evaluate(`location.hash = '#settings/local-model'`);
    await page.waitFor(
      `document.getElementById('connections').open && document.getElementById('local-group').open`,
    );
    assert.equal((await shown(page, 'connections')).beside, true);
    await page.evaluate(
      `document.getElementById('connections').close(); location.hash = '#settings/nowhere'`,
    );
    await new Promise((done) => setTimeout(done, 200));
    assert.equal((await shown(page, 'connections')).open, false);

    // A place on a workspace: the workspace is brought in and the section opened.
    await type(page, 'show podcasts settings');
    await page.waitFor(`document.getElementById('curated-section').open`, 'Curated sources');
    await page.close();
  },
);

test('on a narrow screen a setting opens over the page, as it always has', options, async () => {
  const page = await openConnectedPage(stack, { width: 800 });
  await type(page, 'where do I enter my Brave key?');
  await page.waitFor(`document.getElementById('connections').open`, 'the panel');
  const seen = await shown(page, 'connections');
  assert.equal(seen.modal, true);
  assert.equal(seen.beside, false);
  assert.equal(seen.body, false);
  assert.deepEqual(await section(page, 'search-providers'), { open: true, marked: true });
  await page.close();
});

test(
  'Settings opens on big tiles, shows one section at a time, and help finds a setting by what it is for',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1000 });
    const view = () =>
      page.evaluate(`(() => {
        const d = document.getElementById('connections');
        const seen = (e) => !!e && e.getClientRects().length > 0;
        return {
          title: document.getElementById('connections-title').textContent,
          tiles: [...d.querySelectorAll('.settings-tile')].filter(seen).map((t) => t.querySelector('strong').textContent),
          groups: [...d.querySelectorAll('.settings-group')].filter(seen).map((g) => g.id),
          back: seen(document.getElementById('settings-back')),
        };
      })()`);
    await page.evaluate(`document.getElementById('menu-settings').click()`);
    await page.waitFor(`document.getElementById('connections').open`, 'Settings');
    let seen = await view();
    assert.equal(seen.title, 'Settings');
    assert.deepEqual(seen.tiles, [
      'Models & OpenRouter',
      'Local model',
      'Images',
      'Google',
      'GitHub',
      'Web search',
      'Voice providers',
      'PEA updates',
      'Shared configuration',
    ]);
    assert.deepEqual(seen.groups, [], 'no section is open at home');
    assert.equal(seen.back, false);
    // A tile is big enough to press, and says what is known without opening it.
    const tile = await page.evaluate(`(() => {
      const t = document.querySelector('.settings-tile[data-place="local-model"]'), r = t.getBoundingClientRect();
      return { height: r.height, width: r.width, state: t.querySelector('.settings-state')?.textContent };
    })()`);
    assert.ok(tile.height >= 88 && tile.width >= 190, JSON.stringify(tile));
    assert.equal(tile.state, 'Connected');
    assert.equal(
      await page.evaluate(
        `document.querySelector('.settings-tile[data-place="web-search"] .settings-state').textContent`,
      ),
      'No key',
    );

    // One section alone, with a way back.
    await page.evaluate(`document.querySelector('.settings-tile[data-place="google"]').click()`);
    seen = await view();
    assert.deepEqual(seen, { title: 'Google', tiles: [], groups: ['google-group'], back: true });
    // The section runs in the order it is done: numbered steps, the client ID before the switches.
    assert.deepEqual(
      await page.evaluate(
        `[...document.querySelectorAll('#google-group .settings-step, #google-group [id]')].map((e) => e.matches('.settings-step') ? e.textContent : e.id).filter((x) => /^[1-4]|^(google-client|google-calendar-access|google-connect|drive-root|share-calendar)$/.test(x))`,
      ),
      [
        '1Your Google client ID',
        'google-client',
        '2What PEA may ask Google for',
        'google-calendar-access',
        'google-connect',
        '3Your PEA folder',
        'drive-root',
        '4What this profile shares with the model',
        'share-calendar',
      ],
    );
    // On-and-off choices are switches wide enough to hit; a long explanation is two lines and a button.
    const box = await page.evaluate(`(() => {
      const c = document.getElementById('google-calendar-access'), r = c.getBoundingClientRect();
      return { width: r.width, height: r.height, look: getComputedStyle(c).appearance };
    })()`);
    assert.deepEqual(box, { width: 44, height: 26, look: 'none' });
    const long = await page.evaluate(`(() => {
      const p = document.querySelector('#google-group .settings-short'), more = p.nextElementSibling;
      const before = p.getBoundingClientRect().height, whole = p.textContent.length;
      more.click();
      return { cut: before < p.getBoundingClientRect().height, whole, label: more.textContent, said: more.getAttribute('aria-expanded') };
    })()`);
    assert.ok(long.cut && long.whole >= 150, 'the whole text is one press away');
    assert.equal(long.label + long.said, 'Lesstrue');
    await page.click('#settings-back');
    seen = await view();
    assert.equal(seen.title, 'Settings');
    assert.equal(seen.tiles.length, 9);
    await page.evaluate(`document.getElementById('connections').close()`);

    // The menu has one entry for help, commands and shortcuts; typing what you want finds the setting.
    assert.deepEqual(
      await page.evaluate(
        `[...document.querySelectorAll('.workspace-menu-panel button')].map((b) => b.firstChild.textContent.trim())`,
      ),
      [
        'New chat',
        'Past chats & memory',
        'Export this chat…',
        'Interview & persona',
        'Connections & settings',
        'Privacy & voice',
        'Help & commands',
      ],
    );
    await page.click('#menu-palette');
    await page.waitFor(`document.getElementById('palette').open`, 'help and commands');
    await page.fill('#palette-input', 'brave key');
    await page.waitFor(
      `document.querySelector('#palette-list [aria-selected=true]')?.textContent === 'Set up: Web search'`,
      'the setting, found by what it is for',
    );
    await page.press('Enter');
    await page.waitFor(`document.getElementById('connections').open`, 'the setting');
    seen = await view();
    assert.deepEqual(seen, { title: 'Web search', tiles: [], groups: ['search-providers'], back: true });
    await page.close();
  },
);
