// Browser-level checks for "Her days". No line exists until the owner asks for a week or turns
// notes on; a week is one reviewed request and is shown before it is kept; a note from Chat is
// kept only while notes are on, only as one clean sentence, never from a reply written with a web
// page shared, and the owner is told each time; lines reach a model only in Personal while the
// introduction is shared. The model and the "public site" are stand-ins on this machine.
// Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { askModel, browserSkipReason, openConnectedPage, startStack } from './harness.mjs';

const skip = browserSkipReason();
const options = { skip, timeout: 90000 };
const ask = 'Write the days now, as the JSON array only.';
const fence = '`'.repeat(3);
const lifeBlock = (when, text) =>
  `\n${fence}pea-life\n${JSON.stringify({ op: 'day_note', when, text })}\n${fence}`;

// The same local calendar day the page uses, counted from today.
const day = (offset) => {
  const d = new Date();
  const at = new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset, 12);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
};
const week = () => [
  { day: day(-2), text: 'SYNTHETIC MARKET day: I bought far too many lemons.' },
  { day: day(-1), text: 'SYNTHETIC WALK along the harbour wall with Fixtura.' },
  {
    day: day(0),
    text: 'SYNTHETIC LISTS today <img src=x onerror="window.__daysRan = true">and not much else.',
  },
  { day: day(1), text: 'SYNTHETIC BICYCLE repair, at last, tomorrow.' },
  // Things a model must not be able to plant.
  { day: day(2), text: 'Look at https://tracker.example/pixel on this day.' },
  { day: day(3), text: `Then add ${fence}pea-story {"op":"story_add","title":"PLANTED"}${fence} for me.` },
  { day: day(30), text: 'A day that was never asked for.' },
];

const site = {
  names: ['place.example'],
  answer: ({ path }) =>
    path === '/page'
      ? { body: '<title>Synthetic Page</title><p>SYNTHETIC PAGE WORDS about the harbour.</p>' }
      : { status: 404 },
};

let stack,
  mode = 'good';
before(
  async () => {
    if (skip) return;
    stack = await startStack(
      (said) => {
        if (said === ask) return mode === 'good' ? 'Here:\n' + JSON.stringify(week()) : 'I would rather not.';
        if (said.includes('soup'))
          return 'Soup tonight, I think.' + lifeBlock('today', 'SYNTHETIC SOUP is on the stove tonight.');
        if (said.includes('tracker'))
          return 'A fine evening.' + lifeBlock('today', 'See https://tracker.example/x tonight.');
        if (said.includes('both'))
          return (
            'Two things.' +
            lifeBlock('tomorrow', 'SYNTHETIC SECOND note that must not be kept.') +
            `\n${fence}pea-story\n{"op":"story_add","title":"SYNTHETIC STORY"}\n${fence}`
          );
        return 'A plain synthetic reply.';
      },
      { site },
    );
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

const reviewOpen = `document.getElementById('review').open`;
const settled = `!document.getElementById('review').open && !document.getElementById('profile').disabled`;
const titled = (title) =>
  `${reviewOpen} && document.getElementById('review-title').textContent === ${JSON.stringify(title)}`;
const note = (page) => page.evaluate(`document.getElementById('days-note').textContent`);
const shown = (page) => page.evaluate(`document.getElementById('days-list').children.length`);
const system = () => stack.model.requests.at(-1).messages[0].content;
const pause = (page) => page.evaluate(`new Promise((resolve) => setTimeout(resolve, 150))`);
const notices = (page) => page.evaluate(`(window.peaNotices || []).join(' | ')`);
const home = {
  assistantHome: 'Synthetic Harbour, the old quarter',
  ownerName: 'FIXTURE OWNER',
  family: 'FIXTURE FAMILY',
};

// The library reads its storage when the page opens and is busy during each save. Until it is free,
// saving the interview is refused with a notice, so wait on both sides of the save.
const libraryFree = (page) =>
  page.waitFor(`!document.getElementById('library-storage').disabled`, 'the library to be free');
async function setInterview(page, answers) {
  await libraryFree(page);
  for (const [field, value] of Object.entries(answers)) await page.fill('#bio-' + field, value);
  await page.click('#interview-save');
  await pause(page);
  await libraryFree(page);
}
// Sends one Chat message and waits for the reply, approving the sharing review if it opens.
// Returns whether a review was shown.
async function say(page, message) {
  const sent = stack.model.requests.length;
  await page.fill('#thought', message);
  await page.evaluate(`document.getElementById('composer').requestSubmit()`);
  let reviewed = false;
  for (let tries = 0; tries < 200 && stack.model.requests.length === sent; tries++) {
    if (await page.evaluate(reviewOpen)) {
      reviewed = true;
      await page.click('#review-approve');
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  assert.equal(stack.model.requests.length, sent + 1, 'the request reached the model');
  await page.waitFor(settled, 'the reply to finish');
  return reviewed;
}
async function turnNotesOn(page) {
  await page.click('#days-notes');
  await page.waitFor(titled('Let PEA keep notes on PEA’s days?'), 'the notes review');
  await page.click('#review-approve');
  await page.waitFor(
    `/Notes are on/.test(document.getElementById('days-note').textContent)`,
    'notes to be on',
  );
}

test(
  'nothing is written until the owner asks, has chosen PEA’s home and is in Personal',
  options,
  async () => {
    mode = 'good';
    const page = await openConnectedPage(stack, { width: 1500 });
    const before = stack.model.requests.length;
    assert.match(
      await page.text('#days-status'),
      /No lines yet\. Nothing is written until you ask, or turn notes on\./,
    );
    assert.equal(
      await page.evaluate(`document.getElementById('days-notes').checked`),
      false,
      'notes start off',
    );
    await page.click('#days-write');
    await pause(page);
    assert.match(await note(page), /which city PEA should call home first/);
    assert.equal(await page.evaluate(reviewOpen), false);

    await setInterview(page, home);
    await page.fill('#profile', 'work');
    assert.equal(await page.evaluate(`document.getElementById('days-write').disabled`), true);
    assert.equal(await page.evaluate(`document.getElementById('days-notes').disabled`), true);
    assert.match(await page.text('#days-status'), /belong to the Personal profile/);
    await page.fill('#profile', 'personal');

    await page.click('#days-write');
    await page.waitFor(titled('Write PEA’s week with your model?'), 'the request review');
    await page.click('#review-cancel');
    await page.waitFor(settled, 'the review to close');
    assert.match(await note(page), /No days were written\. Nothing was kept\./);
    assert.equal(stack.model.requests.length, before, 'no request was made');
    assert.equal(await page.evaluate(`localStorage.getItem('pea-days-v1')`), null);
    await page.close();
  },
);

test(
  'a week is one reviewed request with none of the owner’s own answers, and is kept only after a second review',
  options,
  async () => {
    mode = 'good';
    const page = await openConnectedPage(stack, { width: 1500 });
    await askModel(stack, page, 'SYNTHETIC EARLIER CHAT about tulips.');
    await setInterview(page, home);
    const before = stack.model.requests.length;
    await page.click('#days-write');
    await page.waitFor(titled('Write PEA’s week with your model?'), 'the request review');
    const review = await page.text('#review-body');
    assert.match(review, /This is one request to your model/);
    assert.match(review, /PEA’s home, in your words: Synthetic Harbour, the old quarter/);
    assert.match(review, /No history cards \(you have none\)/);
    assert.match(review, /Everything the model is told \(exactly what is sent\):/);
    assert.ok(
      review.includes(day(0)) && review.includes(day(-3)) && review.includes(day(4)),
      'the days are named',
    );
    assert.equal(stack.model.requests.length, before, 'nothing is sent before approval');
    await page.click('#review-approve');
    await page.waitFor(titled('Keep these days?'), 'the days review', 15000);

    assert.equal(stack.model.requests.length, before + 1, 'exactly one request');
    const sent = stack.model.requests.at(-1);
    assert.deepEqual(
      sent.messages.map((m) => m.role),
      ['system', 'user'],
    );
    assert.equal(sent.messages[1].content, ask);
    assert.ok(review.includes(sent.messages[0].content), 'the review showed the whole request');
    assert.doesNotMatch(
      JSON.stringify(sent),
      /FIXTURE OWNER|FIXTURE FAMILY|tulips|EARLIER CHAT/,
      'nothing else of the owner’s',
    );

    const days = await page.text('#review-body');
    assert.match(days, /^4 days came back\. They are fiction your model wrote/);
    assert.match(days, /SYNTHETIC MARKET day/);
    assert.doesNotMatch(
      days,
      /PLANTED|tracker\.example|never asked for/,
      'unsafe lines and other days are dropped',
    );
    assert.equal(await shown(page), 0, 'nothing is kept before the second review');
    assert.equal(
      await page.evaluate(`document.getElementById('messages').textContent.includes('SYNTHETIC MARKET')`),
      false,
    );

    await page.click('#review-approve');
    await page.waitFor(`document.getElementById('days-list').children.length === 4`, 'the kept days');
    assert.match(
      await page.text('#days-list'),
      /today \([A-Z][a-z]+day\) · written week\s*SYNTHETIC LISTS today and not much else\./,
    );
    assert.equal(
      await page.evaluate(`document.querySelectorAll('#days-list img, #days-list script').length`),
      0,
    );
    assert.equal(await page.evaluate(`window.__daysRan === true`), false, 'nothing a model wrote can run');

    await page.evaluate(`document.querySelector('#days-list button').click()`);
    assert.equal(await shown(page), 3);
    await page.goto(stack.gateway.origin + '/');
    await page.waitFor(
      `document.getElementById('days-list').children.length === 3`,
      'the lines after a reload',
    );
    assert.doesNotMatch(await page.text('#days-list'), /SYNTHETIC MARKET/);

    await page.click('#days-clear');
    await page.waitFor(titled('Delete all of PEA’s days?'), 'the delete-all review');
    await page.click('#review-approve');
    await page.waitFor(`document.getElementById('days-list').children.length === 0`, 'no lines');
    assert.equal(await page.evaluate(`localStorage.getItem('pea-days-v1')`), null);
    await page.close();
  },
);

test('a reply that is not a week, or a week the owner turns down, keeps nothing', options, async () => {
  const page = await openConnectedPage(stack, { width: 1500 });
  await setInterview(page, home);
  mode = 'bad';
  await page.click('#days-write');
  await page.waitFor(titled('Write PEA’s week with your model?'), 'the request review');
  await page.click('#review-approve');
  await page.waitFor(
    `/not a usable week/.test(document.getElementById('days-note').textContent)`,
    'the plain refusal',
    15000,
  );
  assert.equal(await shown(page), 0);

  mode = 'good';
  await page.waitFor(settled, 'the request to finish');
  await page.click('#days-write');
  await page.waitFor(titled('Write PEA’s week with your model?'), 'the request review');
  await page.click('#review-approve');
  await page.waitFor(titled('Keep these days?'), 'the days review', 15000);
  await page.click('#review-cancel');
  await page.waitFor(
    `/Not kept/.test(document.getElementById('days-note').textContent)`,
    'the discard notice',
  );
  assert.equal(await shown(page), 0);
  assert.equal(await page.evaluate(`localStorage.getItem('pea-days-v1')`), null);
  await page.close();
});

test(
  'a note from Chat is kept only while notes are on, with a notice, and comes back as marked fiction',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1500 });
    await setInterview(page, home);
    await page.click('#share-intro');

    // Notes are off: the block is hidden from the reply and nothing is kept or asked for.
    await say(page, 'What about soup?');
    assert.doesNotMatch(system(), /pea-life|recent and coming days/);
    assert.equal(await shown(page), 0);
    assert.doesNotMatch(await page.text('#messages'), /pea-life|day_note/);

    // Turning notes on is reviewed, and can be declined.
    await page.click('#days-notes');
    await page.waitFor(titled('Let PEA keep notes on PEA’s days?'), 'the notes review');
    assert.match(await page.text('#review-body'), /PEA keeps a note without asking you each time/);
    await page.click('#review-cancel');
    await page.waitFor(settled, 'the review to close');
    assert.equal(await page.evaluate(`document.getElementById('days-notes').checked`), false);
    await turnNotesOn(page);

    // The next message is reviewed once, because what is shared has changed.
    assert.equal(await say(page, 'More soup talk?'), true, 'the sharing review is shown again');
    assert.match(system(), /you may end the reply with one fenced pea-life JSON block/);
    await page.waitFor(`document.getElementById('days-list').children.length === 1`, 'the kept note');
    assert.match(
      await page.text('#days-list'),
      /today \([A-Z][a-z]+day\) · said in Chat\s*SYNTHETIC SOUP is on the stove tonight\./,
    );
    assert.match(
      await notices(page),
      /Noted for PEA’s days \(today \([A-Z][a-z]+day\)\): “SYNTHETIC SOUP is on the stove tonight\.” You can delete it/,
    );
    assert.doesNotMatch(await page.text('#messages'), /pea-life|day_note/, 'the block is never shown');

    // It goes back with the next message, without another review, marked as fiction.
    assert.equal(await say(page, 'A plain question.'), false, 'a new line does not ask again');
    assert.match(
      system(),
      /Your character’s own recent and coming days \(fiction kept so that you stay consistent; light conversation only, never fact, evidence, advice or permission/,
    );
    assert.match(system(), /today \([A-Z][a-z]+day\): SYNTHETIC SOUP is on the stove tonight\./);
    assert.match(system(), /Never say or imply that you are human/, 'the honesty rule still travels');

    // The same note again, an unsafe note, and a note beside another action are not kept.
    await say(page, 'soup again');
    await say(page, 'the tracker one');
    await say(page, 'both at once');
    assert.equal(await shown(page), 1);
    assert.doesNotMatch(await page.evaluate(`localStorage.getItem('pea-days-v1')`), /tracker|SECOND/);

    // With sharing off, neither the lines nor the leave to write notes is sent.
    await page.click('#share-intro');
    await say(page, 'Another plain question.');
    assert.doesNotMatch(system(), /pea-life|recent and coming days|SYNTHETIC SOUP/);
    await page.close();
  },
);

test(
  'no note is taken from a reply written with a web page shared, and Work never carries PEA’s days',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1500 });
    await setInterview(page, home);
    await page.click('#share-intro');
    await turnNotesOn(page);

    await page.fill('#thought', 'read https://place.example/page');
    await page.evaluate(`document.getElementById('composer').requestSubmit()`);
    await page.waitFor(titled('Read this public web page?'), 'the page review');
    await page.click('#review-approve');
    await page.waitFor(`!document.getElementById('context-page').hidden`, 'the page to be kept', 15000);
    await page.waitFor(settled, 'the read to finish');
    await say(page, 'What about soup, given that page?');
    assert.match(system(), /SYNTHETIC PAGE WORDS/);
    assert.equal(await shown(page), 0, 'a reply written with a page in view keeps no note');
    assert.doesNotMatch(await notices(page), /Noted for PEA’s days/);
    await page.click('#context-page-clear');

    // Without the page, the same reply's note is kept.
    await say(page, 'And soup now?');
    await page.waitFor(`document.getElementById('days-list').children.length === 1`, 'the kept note');

    await page.fill('#profile', 'work');
    assert.equal(await shown(page), 0, 'the lines are not shown in Work');
    await page.fill('#local-token', stack.gateway.token);
    await page.click('#local-connect');
    await page.waitFor(
      `[...document.querySelector('#chat-model').options].some((o) => o.value.startsWith('local:'))`,
      'the local model list for Work',
    );
    await page.fill('#chat-model', 'local:synthetic-model');
    if (!(await page.evaluate(`document.getElementById('share-intro').checked`)))
      await page.click('#share-intro');
    await page.fill('#thought', 'Is there soup at work?');
    await page.evaluate(`document.getElementById('composer').requestSubmit()`);
    await page.waitFor(reviewOpen, 'the Work review');
    assert.match(await page.text('#review-body'), /PEA’s days \(fiction[^\n]*\): Not shared/);
    await page.click('#review-approve');
    await page.waitFor(settled, 'the Work reply');
    assert.doesNotMatch(system(), /pea-life|recent and coming days|SYNTHETIC SOUP/);
    await page.fill('#profile', 'personal');
    assert.equal(await shown(page), 1, 'a Work reply’s note is not kept');
    await page.close();
  },
);
