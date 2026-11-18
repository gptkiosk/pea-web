// Browser-level checks for moving a profile in one encrypted file: nothing is added without the
// owner's review, bringing in only adds, and what is written opens to exactly what was there.
// The files are made and opened here with the same rules the page uses (backup.mjs).
// Run with: node --test browser/tests/dom/backup.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { browserSkipReason, openConnectedPage, startStack } from './harness.mjs';
import { openBackup, sealBackup, validBackup } from '../../backup.mjs';
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
      text: 'She grew up on a steep street where the tram bell marked the hours.',
    },
    {
      topic: 'First job',
      tags: ['work', 'river'],
      text: 'Her first job was sorting postcards in a shop by the river.',
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
          text: 'A quite different account of the street she grew up on.',
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
