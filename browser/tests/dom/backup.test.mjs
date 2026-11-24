// Browser-level checks for moving a profile in one encrypted file: nothing is added without the
// owner's review, bringing in only adds, and what is written opens to exactly what was there.
// The files are made and opened here with the same rules the page uses (backup.mjs).
// Run with: node --test browser/tests/dom/backup.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { browserSkipReason, openConnectedPage, startStack } from './harness.mjs';
import { openBackup, openFull, sealBackup, sealFull, validBackup } from '../../backup.mjs';
import { introductionLimits } from '../../memory.mjs';

const skip = browserSkipReason();
const passphrase = 'synthetic backup passphrase';
const blank = Object.fromEntries(Object.keys(introductionLimits).map((k) => [k, '']));
const now = Date.now();
const day = (offset) => {
  const d = new Date(now + offset * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const todo = (title, over = {}) => ({
  title,
  due: null,
  remind: false,
  done: false,
  created: now - 5000,
  completed: null,
  ...over,
});
const deck = (title, point = 'A synthetic point') => ({
  title,
  brief: 'For the synthetic team.',
  slides: ['Opening', 'Middle', 'Close'].map((t) => ({
    title: t,
    purpose: 'Why it matters.',
    bullets: [point],
    notes: '',
  })),
});
const personal = (over = {}) => ({
  profile: 'personal',
  made: now - 60000,
  introduction: { ...blank, ownerName: 'Synthetic Sam', family: 'One synthetic cat.' },
  memories: [
    {
      text: 'Prefers tea to coffee.',
      quote: 'I always pick tea over coffee',
      created: now - 9000,
      expires: null,
    },
    {
      text: 'Is visiting Porto in spring.',
      quote: 'we are going to Porto in spring',
      created: now - 8000,
      expires: now + 80 * 86400000,
    },
  ],
  todos: [todo('Buy synthetic milk'), todo('Send the synthetic form', { done: true, completed: now - 1000 })],
  history: [
    {
      topic: 'Childhood street',
      tags: ['home'],
      text: 'PEA grew up on a steep street where the tram bell marked the hours.',
    },
    {
      topic: 'First job',
      tags: ['work', 'river'],
      text: 'PEA’s first job was sorting postcards in a shop by the river.',
    },
  ],
  days: [{ day: day(0), text: 'Walked up to the viewpoint before the fog lifted.', from: 'week' }],
  decks: [deck('Synthetic plan')],
  ...over,
});

let stack;
before(
  async () => {
    if (skip) return;
    stack = await startStack(() => 'A plain synthetic reply.');
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

const words = (page, selector) =>
  page.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ''`);
const noted = (page, pattern) =>
  page.waitFor(
    `new RegExp(${JSON.stringify(pattern.source)}).test(document.querySelector('#portable-note').textContent)`,
    'the note ' + pattern,
  );
const waitReview = (page, title) =>
  page.waitFor(
    `document.querySelector('#review').open && document.querySelector('#review-title').textContent.includes(${JSON.stringify(title)})`,
    'the review "' + title + '"',
  );
const answer = async (page, button) => {
  await page.click(button);
  await page.waitFor(`!document.querySelector('#review').open`, 'the review to close');
};
const reviewOpen = (page) => page.evaluate(`document.querySelector('#review').open`);
// Everything the page keeps outside the encrypted stores, to tell whether anything changed.
const kept = (page) =>
  page.evaluate(
    `JSON.stringify(['pea-canon-v1', 'pea-days-v1', 'pea-decks-v1'].map((k) => localStorage.getItem(k)))`,
  );
async function open() {
  const page = await openConnectedPage(stack);
  await page.fill('#profile', 'personal');
  // The page's own rules forbid fetching a file it has just made, so the test keeps hold of each
  // file as it is made and reads it from there.
  await page.evaluate(
    `(() => { window.peaFiles = []; const make = URL.createObjectURL.bind(URL); URL.createObjectURL = (blob) => { window.peaFiles.push(blob); return make(blob); }; })()`,
  );
  return page;
}
async function offer(page, content, pass = passphrase) {
  const file = typeof content === 'string' ? content : await sealBackup(content, passphrase);
  await page.evaluate(
    `(() => { const t = new DataTransfer(); t.items.add(new File([${JSON.stringify(file)}], 'pea-backup.json', { type: 'application/json' })); document.querySelector('#portable-file').files = t.files; })()`,
  );
  await page.fill('#portable-open-pass', pass);
  await page.click('#portable-open');
}
async function bringIn(page, content) {
  await offer(page, content);
  await waitReview(page, 'Bring in this backup?');
  await answer(page, '#review-approve');
  await noted(page, /^Added: /);
}
// Writes a backup in the page and opens it here.
async function backUp(page) {
  await page.fill('#portable-pass', passphrase);
  await page.click('#portable-make');
  await waitReview(page, 'Back up this profile?');
  const shown = await page.text('#review-body');
  await answer(page, '#review-approve');
  await page.waitFor(`!document.querySelector('#portable-download').hidden`, 'the backup file');
  const file = await page.evaluate(`window.peaFiles.at(-1).text()`);
  return { shown, file, content: await openBackup(file, passphrase) };
}

test(
  'a backup is brought in only after its review, adds every section, and comes back out the same',
  { skip, timeout: 90000 },
  async () => {
    const page = await open();
    const before = await kept(page);
    const content = personal();
    assert.equal(validBackup(content), true);

    await offer(page, content, 'the wrong synthetic passphrase');
    await noted(
      page,
      /Could not verify this backup file\. Check the file and passphrase; nothing was changed/,
    );
    assert.equal(await reviewOpen(page), false);
    assert.equal(await kept(page), before);

    await offer(page, content);
    await waitReview(page, 'Bring in this backup?');
    const shown = await page.text('#review-body');
    assert.match(shown, /Only additions are made\. Nothing already here is changed or removed\./);
    assert.match(shown, /\+ ownerName: Synthetic Sam/);
    assert.match(shown, /\+ Prefers tea to coffee\. \(from: “I always pick tea over coffee”\)/);
    assert.match(shown, /To-dos to add \(2\)/);
    assert.match(shown, /History cards to add \(2\)/);
    assert.match(shown, /Day lines to add \(1\)/);
    assert.match(shown, /\+ Synthetic plan \(3 slides\)/);
    await answer(page, '#review-cancel');
    await noted(page, /Nothing was added/);
    assert.equal(await kept(page), before, 'cancel adds nothing');

    await bringIn(page, content);
    assert.match(
      await words(page, '#portable-note'),
      /Added: 2 interview answers, 2 memories, 2 to-dos, 2 history cards, 1 day lines, 1 deck projects\./,
    );
    assert.match(await words(page, '#canon-list'), /Childhood street/);
    assert.match(await words(page, '#days-list'), /Walked up to the viewpoint/);
    assert.match(await words(page, '#decks-list'), /Synthetic plan · 3 slides · written/);
    assert.equal(await page.evaluate(`document.querySelector('#bio-ownerName').value`), 'Synthetic Sam');

    // The same file again has nothing left to add, so there is nothing to review.
    await offer(page, content);
    await noted(page, /Everything in this file is already here\. Nothing was added/);
    assert.equal(await reviewOpen(page), false);

    // What the page now writes opens to exactly what was brought in.
    await page.fill('#portable-pass', 'too short');
    await page.click('#portable-make');
    await noted(page, /passphrase of 12–256 characters/);
    assert.equal(await page.evaluate(`document.querySelector('#portable-download').hidden`), true);
    const out = await backUp(page);
    assert.match(
      out.shown,
      /2 interview answers, 2 memories, 2 to-dos, 2 history cards, 1 day line and 1 deck project/,
    );
    assert.match(out.shown, /Left out: chats, files, provider and service keys/);
    // Each phrase has a space in it. The sealed text is base64, which has none, so a phrase can
    // only be found if it was left unsealed. Single short words turned up in it by chance.
    assert.doesNotMatch(
      out.file,
      /Synthetic Sam|Prefers tea|pick tea|visiting Porto|going to Porto|synthetic milk/,
      'the file is sealed',
    );
    assert.equal(
      await page.evaluate(
        `document.querySelector('#portable-download').download.startsWith('pea-backup-personal-')`,
      ),
      true,
    );
    const { made, ...written } = out.content,
      { made: _made, ...given } = content;
    assert.deepEqual(written, given);
    assert(made >= now);
    assert.equal(
      await page.evaluate(`document.querySelector('#portable-pass').value`),
      '',
      'the passphrase is not left in the page',
    );
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();
  },
);

test(
  'bringing in never changes or removes what is here, and says what differs',
  { skip, timeout: 90000 },
  async () => {
    const page = await open();
    await bringIn(page, personal());
    const other = personal({
      introduction: { ...blank, ownerName: 'A different name', pets: 'A synthetic parrot.' },
      memories: [
        {
          text: 'prefers tea to coffee.',
          quote: 'another way of saying it',
          created: now - 100,
          expires: null,
        },
      ],
      todos: [
        todo('buy synthetic milk', { done: true, completed: now - 10 }),
        todo('Water the synthetic plants'),
      ],
      history: [
        {
          topic: 'childhood street',
          tags: ['home'],
          text: 'A quite different account of the street PEA grew up on.',
        },
      ],
      days: [{ day: day(-60), text: 'Something from two months ago that is no longer kept.', from: 'week' }],
      decks: [deck('synthetic plan', 'A changed point'), deck('Synthetic kickoff')],
    });
    await offer(page, other);
    await waitReview(page, 'Bring in this backup?');
    const shown = await page.text('#review-body');
    assert.match(shown, /\+ pets: A synthetic parrot\./);
    assert.doesNotMatch(shown, /A different name/, 'an answer already given is not offered for change');
    assert.match(shown, /To-dos to add \(1\):\s+\+ Water the synthetic plants/);
    assert.match(shown, /Deck projects to add \(1\):\s+\+ Synthetic kickoff/);
    assert.match(shown, /1 memories already here/);
    assert.match(shown, /1 to-dos differ from yours and yours are kept \(buy synthetic milk\)/);
    assert.match(shown, /1 history cards differ from yours and yours are kept \(childhood street\)/);
    assert.match(shown, /1 deck projects differ from yours and yours are kept \(synthetic plan\)/);
    assert.match(shown, /1 day lines left out: outside the days PEA keeps/);
    await answer(page, '#review-approve');
    await noted(page, /Added: 1 interview answer, 1 to-dos, 1 deck projects\./);

    const { content } = await backUp(page);
    assert.equal(content.introduction.ownerName, 'Synthetic Sam');
    assert.equal(content.introduction.pets, 'A synthetic parrot.');
    assert.deepEqual(content.memories.map((m) => m.text).sort(), [
      'Is visiting Porto in spring.',
      'Prefers tea to coffee.',
    ]);
    const milk = content.todos.find((t) => t.title === 'Buy synthetic milk');
    assert.equal(milk.done, false, 'the to-do here was not marked done by the file');
    assert.equal(content.todos.length, 3);
    assert.match(content.history.find((c) => c.topic === 'Childhood street').text, /tram bell/);
    assert.deepEqual(content.decks.find((d) => d.title === 'Synthetic plan').slides[0].bullets, [
      'A synthetic point',
    ]);
    assert.equal(content.decks.length, 2);
    assert.equal(content.days.length, 1);
    await page.close();
  },
);

test(
  'a file belongs to one profile: Work carries no character, and the wrong profile is refused',
  { skip, timeout: 90000 },
  async () => {
    const page = await open();
    const work = {
      ...personal({ history: [], days: [], decks: [deck('Synthetic quarterly review')] }),
      profile: 'work',
    };
    await offer(page, work);
    await noted(
      page,
      /This backup is of a Work profile\. Switch to that profile to bring it in\. Nothing was added/,
    );
    assert.equal(await reviewOpen(page), false);

    await page.fill('#profile', 'blended');
    assert.equal(await page.evaluate(`document.querySelector('#portable-open').disabled`), true);
    assert.match(await words(page, '#portable-status'), /Blended profile has nothing of its own/);

    await page.fill('#profile', 'work');
    await bringIn(page, work);
    const out = await backUp(page);
    assert.equal(out.content.profile, 'work');
    assert.deepEqual([out.content.history, out.content.days], [[], []]);
    assert.deepEqual(
      out.content.decks.map((d) => d.title),
      ['Synthetic quarterly review'],
    );
    assert.equal(out.content.todos.length, 2);

    // Personal is untouched by what was brought into Work, except what Personal already had: nothing.
    await page.fill('#profile', 'personal');
    const mine = await backUp(page);
    assert.deepEqual(
      [mine.content.memories, mine.content.todos, mine.content.decks, mine.content.introduction.ownerName],
      [[], [], [], ''],
    );
    await page.close();
  },
);

// Everything in one file, under Settings: this browser's settings and both profiles.
const fullNoted = (page, pattern) =>
  page.waitFor(
    `new RegExp(${JSON.stringify(pattern.source)}).test(document.querySelector('#full-note').textContent)`,
    'the note ' + pattern,
  );
async function offerFull(page, file, pass = passphrase) {
  await page.evaluate(
    `(() => { const t = new DataTransfer(); t.items.add(new File([${JSON.stringify(file)}], 'pea-everything.json', { type: 'application/json' })); document.querySelector('#full-file').files = t.files; })()`,
  );
  await page.fill('#full-open-pass', pass);
  await page.click('#full-open');
}
test(
  'one encrypted file carries settings and both profiles to an empty browser, after a review',
  { skip, timeout: 120000 },
  async () => {
    const page = await open();
    await bringIn(page, personal());
    await page.fill('#profile', 'work');
    await offer(page, {
      ...personal({ history: [], days: [], memories: [], decks: [deck('Synthetic work plan')] }),
      profile: 'work',
      introduction: { ...blank, ownerName: 'Sam at work' },
      todos: [todo('File the synthetic report')],
    });
    await waitReview(page, 'Bring in this backup?');
    await answer(page, '#review-approve');
    await noted(page, /^Added: /);
    // Two settings this browser remembers, and one thing that must never travel.
    await page.evaluate(
      `(() => { localStorage.setItem('pea-device-voice-v1', JSON.stringify({ voice: '', rate: 1.2 })); localStorage.setItem('pea-presence-v1', JSON.stringify({ personal: true, work: false })); localStorage.setItem('pea-local-token-v1', 'synthetic-connection-token-000000'); })()`,
    );
    // Settings has a tile for it. A short passphrase writes nothing.
    await page.evaluate(`document.getElementById('menu-settings').click()`);
    await page.waitFor(`document.getElementById('connections').open`, 'Settings');
    assert.equal(
      await page.evaluate(
        `document.querySelector('.settings-tile[data-place="backup-everything"] strong').textContent`,
      ),
      'Backup & restore',
    );
    await page.evaluate(`document.getElementById('connections').close()`);
    assert.match(await words(page, '#full-last'), /No backup file has been made in this browser yet/);
    await page.fill('#full-pass', 'too short');
    await page.click('#full-make');
    await fullNoted(page, /passphrase of 12–256 characters/);
    // Made from the Work profile, it still holds Personal.
    await page.fill('#full-pass', passphrase);
    await page.click('#full-make');
    await waitReview(page, 'Back up everything?');
    const shown = await page.text('#review-body');
    assert.match(shown, /- Device voice and speed/);
    assert.match(shown, /- Local-time presence/);
    assert.match(shown, /Personal: 2 interview answers, 2 memories, 2 to-dos, 2 history cards, 1 day line, 1 deck project\./);
    assert.match(shown, /Work: 1 interview answer, 0 memories, 1 to-do, 0 history cards, 0 day lines, 1 deck project\./);
    assert.match(shown, /Left out: provider and service keys, the connection token, chats/);
    await answer(page, '#review-approve');
    await page.waitFor(`!document.querySelector('#full-download').hidden`, 'the backup file');
    assert.match(await words(page, '#full-last'), /Last backup file made in this browser: /);
    const file = await page.evaluate(`window.peaFiles.at(-1).text()`);
    for (const phrase of ['Synthetic Sam', 'synthetic-connection-token', 'Prefers tea', 'pea-device-voice'])
      assert.ok(!file.includes(phrase), phrase + ' is not readable in the file');
    const content = await openFull(file, passphrase);
    for (const name of ['pea-device-voice-v1', 'pea-presence-v1'])
      assert.ok(Object.hasOwn(content.settings, name), name + ' is in the file');
    assert.ok(!Object.hasOwn(content.settings, 'pea-local-token-v1'));
    assert.ok(!JSON.stringify(content).includes('synthetic-connection-token'), 'the token never travels');
    assert.equal(content.profiles.personal.introduction.ownerName, 'Synthetic Sam');
    assert.equal(content.profiles.work.todos[0].title, 'File the synthetic report');
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();

    // Another browser with nothing in it.
    const fresh = await open();
    const empty = await fresh.evaluate(`localStorage.getItem('pea-device-voice-v1')`);
    await offerFull(fresh, file, 'the wrong synthetic passphrase');
    await fullNoted(fresh, /Could not verify this backup file/);
    assert.equal(await reviewOpen(fresh), false);
    // A profile file is not taken for a whole backup.
    await offerFull(fresh, await sealBackup(personal(), passphrase));
    await fullNoted(fresh, /Could not verify this backup file/);
    await offerFull(fresh, file);
    await waitReview(fresh, 'Restore from this backup?');
    const plan = await fresh.text('#review-body');
    assert.match(plan, /Settings that will be set to what the file holds:/);
    assert.match(plan, /- Device voice and speed/);
    assert.match(plan, /Personal: 2 interview answers, 2 memories, 2 to-dos, 2 history cards, 1 day line, 1 deck project added\./);
    assert.match(plan, /Work: 1 interview answer, 1 to-do, 1 deck project added\./);
    assert.match(plan, /\+ Prefers tea to coffee\./, 'every addition is listed');
    assert.match(plan, /\+ File the synthetic report/);
    assert.match(plan, /Keys, tokens, chats and permissions are not in the file and are not touched\./);
    await answer(fresh, '#review-cancel');
    await fullNoted(fresh, /Nothing was changed/);
    assert.equal(await fresh.evaluate(`localStorage.getItem('pea-device-voice-v1')`), empty, 'cancel changes nothing');
    assert.equal(await fresh.evaluate(`document.querySelector('#bio-ownerName').value`), '');

    await offerFull(fresh, file);
    await waitReview(fresh, 'Restore from this backup?');
    await answer(fresh, '#review-approve');
    await fullNoted(fresh, /^Restored: 10 items added to Personal, 3 items added to Work, \d+ settings restored\. Reload this page now/);
    assert.equal(await fresh.evaluate(`document.querySelector('#full-reload').hidden`), false);
    assert.equal(await fresh.evaluate(`localStorage.getItem('pea-local-token-v1')`), null);
    assert.equal(await fresh.evaluate(`document.querySelector('#bio-ownerName').value`), 'Synthetic Sam');
    assert.match(await words(fresh, '#canon-list'), /Childhood street/);
    // The same file again has nothing left to do.
    await offerFull(fresh, file);
    await fullNoted(fresh, /Everything in this file is already here\. Nothing was changed/);
    // Work has its own things, added without ever switching to it.
    await fresh.fill('#profile', 'work');
    await fresh.waitFor(
      `document.querySelector('#todo-list').textContent.includes('File the synthetic report')`,
      'the Work to-do',
    );
    assert.ok(!(await words(fresh, '#todo-list')).includes('Buy synthetic milk'), 'Personal’s to-dos stay in Personal');
    assert.equal(await fresh.evaluate(`document.querySelector('#bio-ownerName').value`), 'Sam at work');
    await fresh.fill('#profile', 'personal');
    // After the reload the restored settings are the ones in use, and what is kept is still there.
    await fresh.reload();
    await fresh.waitFor(`document.querySelector('#device-rate')?.value === '1.2'`, 'the restored voice speed');
    await fresh.fill('#profile', 'work');
    await fresh.waitFor(
      `document.querySelector('#decks-list').textContent.includes('Synthetic work plan')`,
      'the Work deck',
    );
    assert.deepEqual(fresh.outsideRequests(), []);
    await fresh.close();
  },
);

test(
  'keys go in a backup only when the box is ticked for that file, and come back only after their own review',
  { skip, timeout: 120000 },
  async () => {
    const brave = 'synthetic_brave_key_' + '0'.repeat(12),
      router = 'sk-or-v1-' + 'a'.repeat(24);
    const page = await open();
    await page.evaluate(`localStorage.setItem('pea-device-voice-v1', JSON.stringify({ voice: '', rate: 1.2 }))`);
    // Ticked with no key in the tab, or with a passphrase under 16 characters: nothing is written.
    await page.click('#full-keys');
    await page.fill('#full-pass', passphrase);
    await page.click('#full-make');
    await fullNoted(page, /There are no keys in this tab to put in the file/);
    assert.equal(await page.evaluate(`document.querySelector('#full-keys').checked`), false, 'the box is off again');
    await page.fill('#search-key-brave', brave);
    await page.evaluate(`document.querySelector('#search-key-brave').onchange()`);
    await page.waitFor(`/ready with Brave Search/.test(document.querySelector('#search-status').textContent)`, 'the search key');
    await page.click('#full-keys');
    await page.fill('#full-pass', 'fourteen chars');
    await page.click('#full-make');
    await fullNoted(page, /needs a passphrase of 16 or more characters/);
    assert.equal(await page.evaluate(`document.querySelector('#full-download').hidden`), true);
    // Not ticked: the file has no keys at all.
    await page.fill('#full-pass', passphrase);
    await page.click('#full-make');
    await waitReview(page, 'Back up everything?');
    assert.doesNotMatch(await page.text('#review-body'), /Keys in this file/);
    await answer(page, '#review-approve');
    await page.waitFor(`!document.querySelector('#full-download').hidden`, 'the file without keys');
    const plain = await openFull(await page.evaluate(`window.peaFiles.at(-1).text()`), passphrase);
    assert.ok(!Object.hasOwn(plain, 'keys') && !JSON.stringify(plain).includes(brave));
    // Ticked: the review names the key and what having the file means, and never shows it.
    await page.click('#full-keys');
    await page.fill('#full-pass', passphrase);
    await page.click('#full-make');
    await waitReview(page, 'Back up everything?');
    const shown = await page.text('#review-body');
    assert.match(shown, /Keys in this file \(1\): Brave Search key\./);
    assert.match(shown, /Anyone who has this file and its passphrase can use these keys/);
    assert.ok(!shown.includes(brave));
    await answer(page, '#review-approve');
    await page.waitFor(`!document.querySelector('#full-download').hidden`, 'the file with keys');
    const file = await page.evaluate(`window.peaFiles.at(-1).text()`);
    assert.ok(!file.includes(brave), 'the key is not readable in the file');
    const content = await openFull(file, passphrase);
    assert.deepEqual(content.keys, { 'search-brave': brave });
    assert.equal(await page.evaluate(`document.querySelector('#full-keys').checked`), false);
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();

    // In an empty browser the settings come first and need a reload, so the keys wait.
    const fresh = await open();
    const both = await sealFull({ ...content, keys: { ...content.keys, openrouter: router } }, passphrase);
    await offerFull(fresh, both);
    await waitReview(fresh, 'Restore from this backup?');
    const plan = await fresh.text('#review-body');
    assert.match(plan, /This file holds 2 keys: OpenRouter key, Brave Search key\./);
    assert.match(plan, /They are not put back in this step/);
    assert.ok(!plan.includes(brave) && !plan.includes(router));
    await answer(fresh, '#review-approve');
    await fullNoted(fresh, /Reload this page now.*Then restore from the same file again to put your keys back\./);
    assert.equal(await fresh.evaluate(`document.querySelector('#router-key').value`), '');
    assert.match(await words(fresh, '#search-status'), /No search key in this tab/);
    await fresh.reload();
    await fresh.fill('#profile', 'personal');
    // Now nothing else is left to do, and the keys have a review of their own.
    await offerFull(fresh, both);
    await waitReview(fresh, 'Put these keys back?');
    const keysShown = await fresh.text('#review-body');
    assert.match(keysShown, /wait in their fields for you to press Connect/);
    assert.ok(!keysShown.includes(brave) && !keysShown.includes(router));
    await answer(fresh, '#review-cancel');
    await fullNoted(fresh, /Everything else in this file is already here\. No key was put back\./);
    assert.equal(await fresh.evaluate(`document.querySelector('#router-key').value`), '');
    await offerFull(fresh, both);
    await waitReview(fresh, 'Put these keys back?');
    await answer(fresh, '#review-approve');
    await fullNoted(fresh, /2 keys put back under Settings; press Connect for OpenRouter and GitHub\./);
    assert.equal(await fresh.evaluate(`document.querySelector('#router-key').value`), router, 'waiting for Connect');
    assert.equal(await fresh.evaluate(`document.querySelector('#router-key').type`), 'password');
    await fresh.waitFor(`/ready with Brave Search/.test(document.querySelector('#search-status').textContent)`, 'the search key in use');
    assert.equal(await fresh.evaluate(`document.querySelector('#search-key-brave').value`), '');
    // Nothing was sent anywhere, and nothing was written to the browser's own storage.
    assert.deepEqual(fresh.outsideRequests(), []);
    assert.ok(
      !(await fresh.evaluate(`JSON.stringify(Object.entries(localStorage)) + JSON.stringify(Object.entries(sessionStorage))`)).includes('synthetic_brave_key'),
      'no key is kept in the browser’s storage',
    );
    await fresh.close();
  },
);
