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
        : said.includes('mislabel')
          ? 'Start under connections.\n\n```json\n' +
            JSON.stringify({ op: 'settings', place: 'local-model' }) +
            '\n```\n\nJust click it.'
          : said.includes('sneaky')
            ? 'Here.\n```pea-nav\n' +
              JSON.stringify({ op: 'settings', place: 'google', value: 'x' }) +
              '\n```'
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

    // A model that labels the block "json" still gives a button, and the JSON is not shown as code.
    await askModel(stack, page, 'Now mislabel one.');
    await page.waitFor(
      `[...document.querySelectorAll('#messages button')].some((b) => b.textContent === 'Open Local model settings')`,
      'the button from a mislabelled block',
    );
    assert.equal(
      await page.evaluate(
        `/"op"|settings","place/.test([...document.querySelectorAll('#messages .utterance.assistant')].at(-1).textContent)`,
      ),
      false,
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
    assert.equal(await page.evaluate(`document.querySelectorAll('#messages .utterance.user').length`), 4);

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
        `[...document.querySelectorAll('.workspace-menu-panel > button')].map((b) => b.firstChild.textContent.trim())`,
      ),
      [
        'New chat',
        'Past chats & memory',
        'Export this chat…',
        'Interview & persona',
        'Knowledge sources',
        'Connections & settings',
        'Privacy & voice',
        'Help & commands',
        'Light theme',
      ],
    );
    // Above them, what PEA is connected to and where chats are kept, each with its button.
    assert.deepEqual(
      await page.evaluate(
        `[...document.querySelectorAll('.workspace-menu-panel .menu-status .status-action')].map((b) => b.textContent.trim())`,
      ),
      ['Set up', 'Manage'],
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

// Every window under the menu looks and works like Settings: a home of big tiles, one section at
// a time with a way back, switches, short text, and a way to the knowledge sources.
const view = (page, id) =>
  page.evaluate(`(() => {
    const d = document.getElementById(${JSON.stringify(id)});
    const seen = (e) => !!e && e.getClientRects().length > 0;
    return {
      open: d.open,
      title: d.querySelector('.dialog-head h2').textContent,
      tiles: [...d.querySelectorAll('.settings-tile')].filter(seen).map((t) => t.querySelector('strong').textContent),
      groups: [...d.querySelectorAll('.settings-group')].filter(seen).map((g) => g.id),
      back: seen(d.querySelector('.settings-back')),
    };
  })()`);
const press = (page, id) => page.evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
const tile = (page, place) =>
  page.evaluate(`document.querySelector('.settings-tile[data-place="${place}"]').click()`);
const closed = (page, id) =>
  page.waitFor(`!document.getElementById(${JSON.stringify(id)}).open`, id + ' to close');

test('Past chats & memory opens on tiles and shows one section at a time', options, async () => {
  const page = await openConnectedPage(stack, { width: 1000 });
  await page.fill('#profile', 'personal');
  await press(page, 'menu-history');
  let seen = await view(page, 'library');
  assert.equal(seen.open, true);
  assert.equal(seen.title, 'Good things to remember.');
  assert.deepEqual(seen.tiles, [
    'Past chats',
    'Memories',
    'What you have told PEA',
    'PEA’s history',
    'PEA’s days',
    'Interview file',
    'Profile file',
    'Library backup',
  ]);
  assert.deepEqual(seen.groups, []);
  assert.equal(seen.back, false);
  const size = await page.evaluate(`(() => {
      const r = document.querySelector('#library .settings-tile').getBoundingClientRect();
      return r.height >= 88 && r.width >= 190;
    })()`);
  assert.ok(size, 'a tile is big enough to press');

  await tile(page, 'past-chats');
  seen = await view(page, 'library');
  assert.deepEqual(seen, {
    open: true,
    title: 'Past chats',
    tiles: [],
    groups: ['threads-group'],
    back: true,
  });
  // What belongs to the home is put away while a section is open.
  assert.equal(
    await page.evaluate(
      `[...document.querySelectorAll('#library .home-only')].every((e) => e.getClientRects().length === 0)`,
    ),
    true,
  );
  await press(page, 'library-back');
  seen = await view(page, 'library');
  assert.equal(seen.title, 'Good things to remember.');
  assert.equal(seen.tiles.length, 8);

  // An on-and-off choice is a switch, and a long explanation is two lines with the rest a press away.
  await tile(page, 'memories');
  const look = await page.evaluate(`(() => {
      const c = document.getElementById('memory-share'), r = c.getBoundingClientRect();
      const short = document.querySelector('#memories-group .settings-short');
      return { width: r.width, height: r.height, look: getComputedStyle(c).appearance, more: short?.nextElementSibling?.textContent };
    })()`);
  assert.deepEqual(look, { width: 44, height: 26, look: 'none', more: 'More' });

  // Opening the window again starts at its home.
  await page.evaluate(`document.getElementById('library').close()`);
  await closed(page, 'library');
  await press(page, 'menu-history');
  seen = await view(page, 'library');
  assert.equal(seen.tiles.length, 8);
  assert.deepEqual(seen.groups, []);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test(
  'Privacy & voice is three tiles of short points, each with a way to the setting it describes',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1000 });
    await press(page, 'menu-privacy');
    let seen = await view(page, 'preferences');
    assert.deepEqual(seen.tiles, ['Privacy boundary', 'PEA folder rules', 'Speaking & listening']);
    assert.deepEqual(seen.groups, []);
    await tile(page, 'folder-rules');
    seen = await view(page, 'preferences');
    assert.deepEqual(seen.groups, ['privacy-folder-group']);
    assert.equal(seen.title, 'PEA folder rules');
    const points = await page.evaluate(
      `[...document.querySelectorAll('#privacy-folder-group li')].map((li) => li.textContent.length)`,
    );
    assert.equal(points.length, 7);
    assert.ok(
      points.every((n) => n < 150),
      'every point is short',
    );
    // Nothing the window said before was dropped.
    const text = await page.evaluate(`document.querySelector('#preferences .dialog-body').textContent`);
    for (const kept of [
      'Keys and access tokens stay in this tab’s memory; reloading clears them.',
      'a model cannot expand it',
      'There is no background listening or automatic send.',
      'Your iPhone history and older WebUI login are not imported.',
    ])
      assert.ok(text.includes(kept), kept);

    // Its button closes this window and opens the setting itself.
    await page.evaluate(`document.querySelector('#privacy-folder-group [data-go="google"]').click()`);
    await page.waitFor(`document.getElementById('connections').open`, 'Google settings');
    assert.equal((await view(page, 'preferences')).open, false);
    seen = await view(page, 'connections');
    assert.equal(seen.title, 'Google');
    assert.deepEqual(seen.groups, ['google-group']);
    assert.deepEqual(page.errors, []);
    await page.close();
  },
);

test(
  'the interview’s steps are buttons, its choice is a switch, and Export this chat matches',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1000 });
    await press(page, 'menu-interview');
    await page.waitFor(`document.getElementById('interview').open`, 'the interview');
    const steps = () =>
      page.evaluate(`(() => ({
        names: [...document.querySelectorAll('.interview-step')].map((b) => b.textContent),
        now: document.querySelector('.interview-step[aria-current="step"]').textContent,
        shown: [...document.querySelectorAll('[data-interview-step]')].filter((s) => !s.hidden).map((s) => s.dataset.interviewStep),
        said: document.getElementById('interview-progress').textContent,
      }))()`);
    assert.deepEqual(await steps(), {
      names: ['1About you', '2Your world', '3Your companion'],
      now: '1About you',
      shown: ['0'],
      said: 'Step 1 of 3 · About you',
    });
    // Each question keeps its own two buttons, named for what they do.
    assert.deepEqual(
      await page.evaluate(
        `[...document.querySelectorAll('[data-interview-step="0"] .interview-dictate')].slice(0, 2).map((b) => b.textContent)`,
      ),
      ['Dictate answer', 'Read question'],
    );
    await page.fill('#bio-ownerName', 'Sam');
    await page.evaluate(`document.querySelectorAll('.interview-step')[2].click()`);
    let at = await steps();
    assert.equal(at.now, '3Your companion');
    assert.deepEqual(at.shown, ['2']);
    assert.equal(at.said, 'Step 3 of 3 · Your companion');
    // Moving between steps keeps what was typed, and Back still works.
    await press(page, 'interview-back');
    at = await steps();
    assert.equal(at.now, '2Your world');
    await page.evaluate(`document.querySelectorAll('.interview-step')[0].click()`);
    assert.equal(await page.evaluate(`document.getElementById('bio-ownerName').value`), 'Sam');
    const box = (id) =>
      page.evaluate(`(() => {
        const c = document.getElementById(${JSON.stringify(id)});
        return getComputedStyle(c).appearance + ' ' + getComputedStyle(c).width + ' ' + getComputedStyle(c).height;
      })()`);
    assert.equal(await box('bio-presence'), 'none 44px 26px');
    await page.evaluate(`document.getElementById('interview').close()`);
    await closed(page, 'interview');

    await press(page, 'menu-export-chat');
    await page.waitFor(`document.getElementById('chat-export-dialog').open`, 'Export this chat');
    assert.equal(await box('chat-export-debug'), 'none 44px 26px');
    assert.equal(
      await page.evaluate(
        `[...document.querySelectorAll('#chat-export-dialog .settings-more')].map((b) => b.textContent).join()`,
      ),
      'More,More',
    );
    assert.deepEqual(page.errors, []);
    await page.close();
  },
);

test(
  'Knowledge sources is in the menu, and asking which shows PEA knows gets a true answer',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1000 });
    const before = stack.model.requests.length;
    await press(page, 'menu-sources');
    await page.waitFor(`document.getElementById('curated-section').open`, 'Curated sources');
    assert.equal(
      await page.evaluate(
        `document.getElementById('today').hidden === false && document.getElementById('curated-browse').getClientRects().length > 0`,
      ),
      true,
      'Today is shown with the way to browse the sources',
    );
    assert.equal(await page.evaluate(`document.getElementById('workspace-menu').open`), false);

    // With no show followed, the question is answered by PEA itself, not by a model's invention.
    await page.evaluate(`document.getElementById('tab-chat').click()`);
    await page.fill('#thought', 'can you list the podcast shows you know about?');
    await page.evaluate(`document.querySelector('#composer').requestSubmit()`);
    await page.waitFor(
      `document.body.textContent.includes('You follow no shows with briefs in this tab.')`,
      'the answer',
    );
    assert.equal(stack.model.requests.length, before, 'no model was asked');
    assert.deepEqual(page.errors, []);
    await page.close();
  },
);

test(
  'fields in a settings section keep one rhythm: label close above, note clear below, Paste on the same line',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1000, height: 1200 });
    await press(page, 'menu-settings');
    await tile(page, 'voices');
    await page.fill('#provider-voice', 'fish');
    await page.waitFor(`!document.getElementById('provider-voice-key-row').hidden`, 'the key field');
    const gaps = await page.evaluate(`(() => {
      const box = (id) => document.getElementById(id).getBoundingClientRect();
      const label = (id) => document.querySelector('label[for="' + id + '"]').getBoundingClientRect();
      const pick = box('provider-voice'), note = box('provider-voice-status'), key = box('provider-voice-key');
      const paste = document.querySelector('[data-paste-target="provider-voice-key"]').getBoundingClientRect();
      return {
        labelToField: Math.round(pick.top - label('provider-voice').bottom),
        fieldToNote: Math.round(note.top - pick.bottom),
        noteToNextLabel: Math.round(label('provider-voice-key').top - note.bottom),
        keyLabelToField: Math.round(key.top - label('provider-voice-key').bottom),
        sameLine: paste.top < key.bottom && paste.bottom > key.top && paste.left >= key.right,
        centred: Math.abs((paste.top + paste.bottom) / 2 - (key.top + key.bottom) / 2) <= 2,
        ends: Math.round(paste.right - pick.right),
      };
    })()`);
    assert.ok(gaps.labelToField >= 6 && gaps.labelToField <= 12, JSON.stringify(gaps));
    assert.ok(gaps.keyLabelToField >= 6 && gaps.keyLabelToField <= 12, JSON.stringify(gaps));
    assert.ok(gaps.fieldToNote >= 8, 'a note never touches the field above it: ' + JSON.stringify(gaps));
    assert.ok(gaps.noteToNextLabel >= 18, 'the next label starts clear: ' + JSON.stringify(gaps));
    assert.ok(gaps.sameLine && gaps.centred, 'Paste sits beside its field: ' + JSON.stringify(gaps));
    assert.equal(gaps.ends, 0, 'the row ends where the fields end');
    await page.evaluate(`document.getElementById('connections').close()`);
    await closed(page, 'connections');

    // A section never shows a More button whose text belongs to the window's home.
    await press(page, 'menu-history');
    await tile(page, 'profile-file');
    assert.equal(
      await page.evaluate(
        `[...document.querySelectorAll('#library .settings-more')].filter((b) => b.getClientRects().length && !b.closest('.settings-focus')).length`,
      ),
      0,
    );
    assert.deepEqual(page.errors, []);
    await page.close();
  },
);

test('actions in settings and tool windows are buttons, not link-style text', options, async () => {
  const page = await openConnectedPage(stack, { width: 1000, height: 1200 });
  await askModel(stack, page, 'A plain synthetic question to save.');
  const look = (selector) =>
    page.evaluate(`(() => {
      const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.getClientRects().length);
      if (!b) return null;
      const c = getComputedStyle(b), r = b.getBoundingClientRect();
      return {
        border: parseFloat(c.borderTopWidth) >= 1 && c.borderTopStyle === 'solid',
        round: parseFloat(c.borderTopLeftRadius) >= 12,
        padded: parseFloat(c.paddingLeft) >= 12,
        tall: r.height >= 44,
        plain: !c.textDecorationLine.includes('underline'),
      };
    })()`);
  const button = { border: true, round: true, padded: true, tall: true, plain: true };
  await press(page, 'menu-history');
  for (const selector of ['#library-storage', '#library-interview', '#library-new-chat'])
    assert.deepEqual(await look(selector), button, selector);
  await tile(page, 'past-chats');
  await page.waitFor(
    `document.querySelectorAll('#library-threads .memory-card').length > 0`,
    'the saved chat',
  );
  for (const selector of ['#library-back', '#library-threads .memory-card .text-button'])
    assert.deepEqual(await look(selector), button, selector);
  await page.evaluate(`document.getElementById('library').close()`);
  await closed(page, 'library');

  await press(page, 'menu-settings');
  await tile(page, 'google');
  for (const selector of ['#settings-back', '#google-group .text-button:not(.settings-more)'])
    assert.deepEqual(await look(selector), button, selector);
  // "More" is a small button: bordered and padded, shorter than an action.
  assert.deepEqual(await look('#google-group .settings-more'), { ...button, tall: false });
  await page.evaluate(`document.getElementById('connections').close()`);
  await closed(page, 'connections');
  await press(page, 'menu-privacy');
  await tile(page, 'privacy-boundary');
  assert.deepEqual(await look('#privacy-data-group .settings-go'), button);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test(
  'the guided setup lists six steps with what is known, then walks them one section at a time',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 900 });
    const seen = (selector) =>
      page.evaluate(
        `(() => { const e = document.querySelector(${JSON.stringify(selector)}); return !!e && !e.hidden && e.getClientRects().length > 0; })()`,
      );
    const at = () =>
      page.evaluate(`(() => {
        const d = document.getElementById('connections');
        const shown = (e) => e.getClientRects().length > 0;
        return {
          open: d.open,
          step: d.dataset.setup ?? null,
          count: document.getElementById('setup-count').textContent,
          title: document.getElementById('guided-title').textContent,
          groups: [...d.querySelectorAll('.settings-group')].filter(shown).map((g) => g.id),
          tiles: [...d.querySelectorAll('.settings-tile')].filter(shown).length,
          back: document.getElementById('guided-back').textContent,
          next: document.getElementById('setup-next').textContent,
          state: document.getElementById('setup-state').textContent,
          here: [...document.getElementById('setup-track').children].findIndex((i) => i.dataset.here === 'true'),
        };
      })()`);
    const press = (id) => page.evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);

    await press('connections-open');
    assert.equal(await page.evaluate(`document.getElementById('setup-wizard').open`), true);
    assert.deepEqual(
      await page.evaluate(
        `[...document.querySelectorAll('#setup-steps .setup-step')].map((r) => [r.querySelector('strong').textContent, r.dataset.done, r.querySelector('.setup-mark').textContent, r.getBoundingClientRect().height >= 56])`,
      ),
      [
        ['Connect a model', 'true', '✓', true],
        ['Choose your models', 'true', '✓', true],
        ['Voice', 'false', '3', true],
        ['Web search', 'false', '4', true],
        ['Google', 'false', '5', true],
        ['Knowledge sources', 'false', '6', true],
      ],
    );
    assert.equal(await page.text('#setup-summary'), '2 of 6 set up.');
    assert.equal(await page.text('#setup-start'), 'Continue');
    assert.match(await page.text('.setup-step[data-step="areas"] small'), /^Chat: /);

    // Continue goes to the first step that is not set up, and shows that section alone.
    await press('setup-start');
    let now = await at();
    assert.equal(await page.evaluate(`document.getElementById('setup-wizard').open`), false);
    assert.deepEqual(
      [now.open, now.step, now.count, now.title, now.groups, now.tiles, now.here],
      [true, 'voice', 'Step 3 of 6', 'Voice', ['voice-providers'], 0, 2],
    );
    assert.deepEqual([now.next, now.state, now.back], ['Skip →', 'Device voice', '← Back']);
    assert.equal(await seen('#settings-back'), false, 'the way on is the step buttons');
    assert.equal(await seen('#provider-voice'), true);
    const nav = await page.evaluate(
      `['guided-back', 'setup-next'].map((id) => { const e = document.getElementById(id), s = getComputedStyle(e); return [e.getBoundingClientRect().height >= 44, parseFloat(s.borderTopWidth) >= 1 || s.backgroundColor !== 'rgba(0, 0, 0, 0)']; })`,
    );
    assert.deepEqual(nav, [
      [true, true],
      [true, true],
    ]);

    // Back: the models for each area, without the key that the step before is about.
    await press('guided-back');
    now = await at();
    assert.deepEqual(
      [now.step, now.count, now.groups, now.next],
      ['areas', 'Step 2 of 6', ['router-group'], 'Next →'],
    );
    assert.match(now.state, /^✓ Chat: /);
    for (const id of ['chat-model', 'collaboration-model', 'coding-model'])
      assert.equal(await seen('#' + id), true, id);
    assert.equal(await seen('#router-key'), false);

    // Back again: connecting, on this machine or with OpenRouter.
    await press('guided-back');
    now = await at();
    assert.deepEqual([now.step, now.groups, now.back], ['model', ['local-group'], '← Overview']);
    assert.equal(await seen('#local-token'), true);
    assert.deepEqual(
      await page.evaluate(
        `[...document.querySelectorAll('#setup-switch button')].map((b) => [b.textContent, b.getAttribute('aria-pressed')])`,
      ),
      [
        ['On this machine', 'true'],
        ['OpenRouter', 'false'],
      ],
    );
    await page.evaluate(`document.querySelector('#setup-switch [data-route="models"]').click()`);
    now = await at();
    assert.deepEqual([now.step, now.groups], ['model', ['router-group']]);
    assert.equal(await seen('#router-key'), true);
    assert.equal(await seen('#chat-model'), false, 'choosing models is the next step');

    // Forward through every step to the last, which is not a Settings section.
    const walked = [];
    for (let i = 0; i < 5; i++) {
      await press('setup-next');
      now = await at();
      walked.push([now.step, now.groups.join()]);
    }
    assert.deepEqual(walked, [
      ['areas', 'router-group'],
      ['voice', 'voice-providers'],
      ['search', 'search-providers'],
      ['google', 'google-group'],
      ['sources', ''],
    ]);
    assert.deepEqual([now.count, now.next, now.tiles], ['Step 6 of 6', 'Finish', 0]);
    assert.equal(await seen('#setup-sources-open'), true);
    assert.match(await page.text('#setup-sources-state'), /Knowledge sources are off/);

    // Finish returns to the overview; opening Settings afterwards is plain Settings again.
    await press('setup-next');
    assert.equal(await page.evaluate(`document.getElementById('connections').open`), false);
    assert.equal(await page.evaluate(`document.getElementById('setup-wizard').open`), true);
    await press('setup-all');
    now = await at();
    assert.deepEqual([now.open, now.step, now.groups], [true, null, []]);
    assert(now.tiles >= 8, 'the settings home');
    assert.equal(await seen('#guided-connection'), false);
    assert.equal(await seen('#setup-nav'), false);
    await page.close();
  },
);
