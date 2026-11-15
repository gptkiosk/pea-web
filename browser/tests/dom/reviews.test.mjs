// Browser-level checks that nothing a model proposes takes effect until the owner approves it.
// Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { askModel, browserSkipReason, openConnectedPage, openReview, startStack } from './harness.mjs';

const skip = browserSkipReason();
const block = (name, value) => '```' + name + '\n' + JSON.stringify(value) + '\n```\n';

// What the synthetic model answers, chosen by a word in the owner's message.
const replies = {
  email:
    'Here is a draft.\n' +
    block('pea-email', {
      op: 'email_draft',
      to: 'owner@example.invalid',
      subject: 'Synthetic subject',
      body: 'Synthetic body.',
    }),
  story:
    'I can capture that.\n' +
    block('pea-story', {
      op: 'story_add',
      title: 'Synthetic story',
      details: 'Synthetic scope',
      acceptance: 'Synthetic criteria',
    }),
  calendar:
    'Here is the event.\n' +
    block('pea-calendar', {
      op: 'calendar_draft',
      title: 'Synthetic event',
      start: '2031-01-02T15:00:00Z',
      end: '2031-01-02T16:00:00Z',
      details: 'Synthetic notes',
    }),
  document:
    'Here is a document.\n' +
    block('pea-doc', {
      op: 'document_draft',
      kind: 'document',
      title: 'Synthetic document',
      content: 'Synthetic content.',
    }),
  boast: 'Done! I sent the email to owner@example.invalid for you.',
  mixed:
    'Two things.\n' +
    block('pea-email', { op: 'email_draft', to: 'owner@example.invalid', subject: 'A', body: 'B' }) +
    block('pea-story', { op: 'story_add', title: 'Second action' }),
};

let stack, model, gateway;

before(
  async () => {
    if (skip) return;
    stack = await startStack((said) => {
      const key = Object.keys(replies).find((word) => said.includes(word));
      return key ? replies[key] : 'A plain synthetic reply.';
    });
    ({ model, gateway } = stack);
  },
  { timeout: 60000 },
);

after(() => stack?.close(), { timeout: 30000 });

const connectedPage = () => openConnectedPage(stack);
const ask = (page, message) => askModel(stack, page, message);
const reviewOpen = (page) => page.evaluate(`document.querySelector('#review').open`);

test('declining the model sharing review sends nothing', { skip, timeout: 45000 }, async () => {
  const page = await connectedPage();
  const sent = model.requests.length;
  await page.fill('#thought', 'A plain question.');
  await page.evaluate(`document.querySelector('#composer').requestSubmit()`);
  await page.waitFor(`document.querySelector('#review').open`);
  await page.click('#review-cancel');
  await page.waitFor(`!document.querySelector('#review').open`);
  assert.equal(model.requests.length, sent);
  await page.close();
});

test(
  'an email draft link appears only after the owner approves the exact draft',
  { skip, timeout: 45000 },
  async () => {
    const page = await connectedPage();
    await ask(page, 'Please draft an email.');
    const mailLinks = () => page.evaluate(`document.querySelectorAll('a[href^="mailto:"]').length`);
    assert.doesNotMatch(await page.text('#messages'), /pea-email|email_draft/, 'the action block is hidden');
    assert.equal(await mailLinks(), 0);

    await openReview(page, 'Review email draft');
    const shown = await page.text('#review-body');
    assert.match(shown, /To: owner@example\.invalid/);
    assert.match(shown, /Subject: Synthetic subject/);
    assert.match(shown, /Synthetic body\./);
    assert.match(shown, /does not send/);
    await page.click('#review-cancel');
    await page.waitFor(`!document.querySelector('#review').open`);
    assert.equal(await mailLinks(), 0, 'cancel changes nothing');

    await openReview(page, 'Review email draft');
    await page.click('#review-approve');
    await page.waitFor(`document.querySelector('a[href^="mailto:"]')`, 'the mail link');
    const link = await page.evaluate(`document.querySelector('a[href^="mailto:"]').href`);
    assert(decodeURIComponent(link).startsWith('mailto:owner@example.invalid?'), link);

    await page.goto(gateway.origin + '/');
    assert.equal(await mailLinks(), 0, 'an approved draft is not restored after reload');
    assert.equal(await page.hasText('Review email draft'), false);
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();
  },
);

test('a story reaches Today only after approval, and only once', { skip, timeout: 45000 }, async () => {
  const page = await connectedPage();
  await ask(page, 'Please capture a story.');
  const onBoard = () =>
    page.evaluate(`document.querySelector('#board-columns').textContent.includes('Synthetic story')`);
  assert.equal(await onBoard(), false);

  await openReview(page, 'Review story: Synthetic story');
  const shown = await page.text('#review-body');
  assert.match(shown, /Synthetic scope/);
  assert.match(shown, /Synthetic criteria/);
  await page.click('#review-cancel');
  await page.waitFor(`!document.querySelector('#review').open`);
  assert.equal(await onBoard(), false, 'cancel changes nothing');

  await openReview(page, 'Review story: Synthetic story');
  await page.click('#review-approve');
  await page.waitFor(
    `document.querySelector('#board-columns').textContent.includes('Synthetic story')`,
    'the story on the board',
  );
  await page.waitFor(
    `document.querySelector('#messages').innerText.includes('Added to Today')`,
    'the receipt',
  );
  assert.equal(await page.hasText('Review story'), false, 'the proposal cannot be approved twice');
  const copies = await page.evaluate(
    `document.querySelector('#board-columns').textContent.split('Synthetic story').length - 1`,
  );
  assert.equal(copies, 1);
  await page.close();
});

test(
  'a review opened straight after another closes is not cancelled by the first',
  { skip, timeout: 45000 },
  async () => {
    const page = await connectedPage();
    await ask(page, 'Please capture a story.');
    await openReview(page, 'Review story: Synthetic story');
    // Cancel and reopen in the same instant, before the first dialog has reported that it closed.
    // A few microtask turns let the app finish handling the cancel without yielding to that report.
    await page.evaluate(
      `(async () => { document.querySelector('#review-cancel').click(); for (let turn = 0; turn < 20; turn++) await Promise.resolve(); [...document.querySelectorAll('#messages button')].find((b) => b.textContent.startsWith('Review story')).click(); })()`,
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(await reviewOpen(page), true, 'the second review is still open');
    await page.click('#review-approve');
    await page.waitFor(
      `document.querySelector('#board-columns').textContent.includes('Synthetic story')`,
      'the story on the board',
    );
    await page.close();
  },
);

test(
  'a calendar file link appears only after approval and nothing is sent anywhere',
  { skip, timeout: 45000 },
  async () => {
    const page = await connectedPage();
    await ask(page, 'Please make a calendar event.');
    const downloads = () => page.evaluate(`document.querySelectorAll('a[download]').length`);
    const before = await downloads();

    await openReview(page, 'Review calendar event: Synthetic event');
    const shown = await page.text('#review-body');
    assert.match(shown, /UTC start: 2031-01-02T15:00:00Z/);
    assert.match(shown, /does not create an event/);
    await page.click('#review-cancel');
    await page.waitFor(`!document.querySelector('#review').open`);
    assert.equal(await downloads(), before, 'cancel changes nothing');

    await openReview(page, 'Review calendar event: Synthetic event');
    await page.click('#review-approve');
    await page.waitFor(
      `document.querySelector('#messages a[download="pea-event.ics"]')`,
      'the event file link',
    );
    const file = decodeURIComponent(
      await page.evaluate(`document.querySelector('#messages a[download="pea-event.ics"]').href`),
    );
    assert.match(file, /SUMMARY:Synthetic event/);
    assert.match(file, /DTSTART:20310102T150000Z/);
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();
  },
);

test(
  'a proposed document only opens an editable draft and cannot be created without Google',
  { skip, timeout: 45000 },
  async () => {
    const page = await connectedPage();
    await ask(page, 'Please write a document.');
    await page.waitFor(
      `[...document.querySelectorAll('#messages button')].some((b) => b.textContent.startsWith('Edit document draft'))`,
      'the draft button',
    );
    assert.equal(await page.evaluate(`document.querySelector('#draft').open`), false);
    await page.clickText('Edit document draft');
    await page.waitFor(`document.querySelector('#draft').open`, 'the draft editor');
    assert.equal(await page.evaluate(`document.querySelector('#draft-title').value`), 'Synthetic document');
    assert.equal(await page.evaluate(`document.querySelector('#draft-text').value`), 'Synthetic content.');
    await page.click('#draft-create');
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(await reviewOpen(page), false, 'no creation review without a Google connection');
    assert.deepEqual(page.outsideRequests(), [], 'nothing is sent to Google');
    await page.close();
  },
);

test(
  'a reply that claims an action without a proposal gets a plain correction',
  { skip, timeout: 45000 },
  async () => {
    const page = await connectedPage();
    await ask(page, 'Please boast about it.');
    await page.waitFor(
      `document.querySelector('#messages').innerText.includes('PEA did not send an email')`,
      'the correction',
    );
    assert.equal(await page.evaluate(`document.querySelectorAll('a[href^="mailto:"]').length`), 0);
    await page.close();
  },
);

test('a reply with two actions offers neither', { skip, timeout: 45000 }, async () => {
  const page = await connectedPage();
  await ask(page, 'Please send mixed actions.');
  assert.equal(await page.hasText('Review email draft'), false);
  assert.equal(await page.hasText('Review story'), false);
  assert.doesNotMatch(await page.text('#messages'), /pea-email|pea-story|story_add/);
  await page.close();
});
