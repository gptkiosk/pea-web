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
