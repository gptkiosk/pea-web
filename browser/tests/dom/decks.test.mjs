// Browser-level checks for deck projects in Greenhouse: nothing is sent without a review, nothing
// is kept without a second one, and the downloaded file cannot run what a model wrote.
// Run with: node --test browser/tests/dom/decks.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { browserSkipReason, openConnectedPage, startStack } from './harness.mjs';

const skip = browserSkipReason();
const nasty = '<img src=x onerror=alert(1)> beats "plain" & simple';
let stack,
  mode = 'good';

before(
  async () => {
    if (skip) return;
    stack = await startStack((said, body) => {
      const system = body.messages[0].content;
      if (mode === 'junk') return 'I would rather chat about the weather.';
      if (said.includes('outline now')) {
        const count = Number(/Slides wanted: (\d+)/.exec(system)[1]);
        return (
          'Here is the outline.\n' +
          JSON.stringify(
            Array.from({ length: count }, (_, i) => ({
              title: `Synthetic slide ${i + 1}`,
              purpose: `Purpose number ${i + 1}.`,
            })),
          )
        );
      }
      if (said.includes('slides now')) {
        const count = (system.match(/^\d+\. /gm) ?? []).length;
        const slides = Array.from({ length: count }, (_, i) => ({
          n: i + 1,
          bullets: i === 0 ? [nasty, 'Second point'] : [`Point for slide ${i + 1}`],
          notes: `Say this on slide ${i + 1}.`,
        }));
        return JSON.stringify(mode === 'short' ? slides.slice(1) : slides);
      }
      return 'A plain synthetic reply.';
    });
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

const words = (page, selector) =>
  page.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ''`);
const saved = (page) => page.evaluate(`localStorage.getItem('pea-decks-v1')`);
const reviewOpen = (page) => page.evaluate(`document.querySelector('#review').open`);
const waitReview = (page, title) =>
  page.waitFor(
    `document.querySelector('#review').open && document.querySelector('#review-title').textContent.includes(${JSON.stringify(title)})`,
    'the review "' + title + '"',
  );
// Presses a button in the open review and waits until that review is gone. The next review may
// open at once, so "gone" means closed or showing another title.
const answer = async (page, button) => {
  const title = await page.evaluate(`document.querySelector('#review-title').textContent`);
  await page.click(button);
  await page.waitFor(
    `!document.querySelector('#review').open || document.querySelector('#review-title').textContent !== ${JSON.stringify(title)}`,
    'the review "' + title + '" to close',
  );
};
const noted = (page, pattern) =>
  page.waitFor(
    `new RegExp(${JSON.stringify(pattern.source)}).test(document.querySelector('#decks-note').textContent)`,
    'the note ' + pattern,
  );
async function openGreenhouse() {
  const page = await openConnectedPage(stack);
  await page.click('#tab-greenhouse');
  return page;
}
async function askOutline(
  page,
  { title = 'Synthetic plan', brief = 'For the synthetic team, ten minutes.', count = '4' } = {},
) {
  await page.fill('#deck-title', title);
  await page.fill('#deck-brief', brief);
  await page.fill('#deck-count', count);
  await page.click('#deck-outline');
}
async function keepOutline(page, options) {
  await askOutline(page, options);
  await waitReview(page, 'Ask your model for a deck outline?');
  await answer(page, '#review-approve');
  await waitReview(page, 'Keep this outline?');
  await answer(page, '#review-approve');
  await noted(page, /Outline kept/);
}

test(
  'an outline is asked for only after review, carries only the title, brief and count, and is kept only after a second review',
  { skip, timeout: 60000 },
  async () => {
    mode = 'good';
    const page = await openGreenhouse();
    const sent = stack.model.requests.length;
    assert.match(
      await words(page, '#decks-status'),
      /No deck projects yet\. Nothing is sent until you review/,
    );

    await askOutline(page, { title: '' });
    await noted(page, /Give the deck a title/);
    assert.equal(await reviewOpen(page), false);

    await askOutline(page);
    await waitReview(page, 'Ask your model for a deck outline?');
    const shown = await page.text('#review-body');
    assert.match(
      shown,
      /Deck title: Synthetic plan\nSlides wanted: 4\nOwner's brief: For the synthetic team, ten minutes\./,
    );
    assert.match(
      shown,
      /Not sent: your name, interview answers, chats, memories, files, calendar, mail or to-dos/,
    );
    await answer(page, '#review-cancel');
    await noted(page, /No outline was written\. Nothing was kept/);
    assert.equal(stack.model.requests.length, sent, 'cancel sends nothing');

    await askOutline(page);
    await waitReview(page, 'Ask your model for a deck outline?');
    await answer(page, '#review-approve');
    await waitReview(page, 'Keep this outline?');
    assert.match(await page.text('#review-body'), /4 slides:\s+1\. Synthetic slide 1\s+Purpose number 1\./);
    const request = stack.model.requests.at(-1);
    assert.equal(stack.model.requests.length, sent + 1, 'one request');
    assert.equal(request.messages.length, 2, 'no chat history goes with it');
    assert.match(request.messages[0].content, /^You are helping your owner draft a slide deck\./);
    assert.equal(request.messages[1].content, 'Write the outline now, as the JSON array only.');
    await answer(page, '#review-cancel');
    await noted(page, /Not kept\. The outline your model wrote was discarded/);
    assert.equal(await saved(page), null, 'declining keeps nothing');

    await keepOutline(page);
    assert.match(await words(page, '#decks-list'), /Synthetic plan · 4 slides · outline only/);
    assert.equal(await page.evaluate(`document.querySelectorAll('#deck-slides fieldset').length`), 4);
    assert.equal(
      await page.evaluate(`document.querySelector('#deck-download').hidden`),
      true,
      'no file for an outline',
    );
    assert.equal(
      await page.evaluate(`document.querySelector('#deck-title').value`),
      '',
      'the form is cleared',
    );
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();
  },
);

test(
  'slides are written after review, the owner edits them, and the file cannot run what the model wrote',
  { skip, timeout: 60000 },
  async () => {
    mode = 'good';
    const page = await openGreenhouse();
    await keepOutline(page);
    const sent = stack.model.requests.length;

    await page.click('#deck-write');
    await waitReview(page, 'Ask your model to write the slides?');
    const shown = await page.text('#review-body');
    assert.match(shown, /The outline the owner approved:\n1\. Synthetic slide 1 — Purpose number 1\./);
    assert.match(shown, /Nothing else about you is sent/);
    await answer(page, '#review-approve');
    await waitReview(page, 'Keep these slides?');
    assert.match(await page.text('#review-body'), /PEA has not checked any fact/);
    assert.equal(stack.model.requests.length, sent + 1);
    await answer(page, '#review-approve');
    await noted(page, /Slides kept/);
    assert.match(await words(page, '#decks-list'), /4 slides · written/);

    const file = () =>
      page.evaluate(
        `decodeURIComponent(document.querySelector('#deck-download').href.split(',').slice(1).join(','))`,
      );
    assert.equal(await page.evaluate(`document.querySelector('#deck-download').hidden`), false);
    assert.equal(
      await page.evaluate(`document.querySelector('#deck-download').download`),
      'pea-deck-synthetic-plan.html',
    );
    let html = await file();
    assert.doesNotMatch(html, /<img|<script/i, 'what the model wrote is text, not markup');
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; beats &quot;plain&quot; &amp; simple/);
    assert.match(html, /default-src 'none'/);
    assert.equal((html.match(/<section class="slide/g) ?? []).length, 4);
    // The same words are shown as plain text in the editor too.
    assert.equal(await page.evaluate(`document.querySelectorAll('#deck-slides img').length`), 0);

    // The owner renames a slide and rewrites its points.
    await page.evaluate(
      `(() => { const f = document.querySelectorAll('#deck-slides fieldset')[1]; f.querySelector('input').value = 'My own title'; f.querySelector('textarea').value = 'First of mine\\nSecond of mine'; [...f.querySelectorAll('button')].find((b) => b.textContent === 'Save slide').click(); })()`,
    );
    await noted(page, /Slide 2 saved/);
    html = await file();
    assert.match(html, /<h2>My own title<\/h2><ul><li>First of mine<\/li><li>Second of mine<\/li><\/ul>/);

    // A point that is too long changes nothing.
    await page.evaluate(
      `(() => { const f = document.querySelectorAll('#deck-slides fieldset')[2]; f.querySelector('textarea').value = 'x'.repeat(200); [...f.querySelectorAll('button')].find((b) => b.textContent === 'Save slide').click(); })()`,
    );
    await noted(page, /at most 160 characters.*Nothing was changed/);
    assert.match(await file(), /Point for slide 3/);

    // The project is still there after a reload, with the owner's edits.
    await page.goto(stack.gateway.origin + '/');
    await page.waitFor(
      `document.querySelector('#decks-list').textContent.includes('Synthetic plan')`,
      'the saved project',
    );
    assert.match(await saved(page), /My own title/);
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();
  },
);

test(
  'a reply that is not an outline, or leaves a slide out, keeps and changes nothing',
  { skip, timeout: 60000 },
  async () => {
    const page = await openGreenhouse();
    try {
      mode = 'junk';
      await askOutline(page);
      await waitReview(page, 'Ask your model for a deck outline?');
      await answer(page, '#review-approve');
      await noted(page, /not a usable outline, so nothing was kept/);
      assert.equal(await reviewOpen(page), false, 'there is nothing to keep, so nothing to review');
      assert.equal(await saved(page), null);

      mode = 'good';
      await keepOutline(page);
      const before = await saved(page);
      mode = 'short';
      await page.click('#deck-write');
      await waitReview(page, 'Ask your model to write the slides?');
      await answer(page, '#review-approve');
      await noted(page, /did not give usable points for every slide, so nothing was changed/);
      assert.equal(await saved(page), before);
      assert.match(await words(page, '#decks-list'), /outline only/);
    } finally {
      mode = 'good';
    }
    await page.close();
  },
);

test(
  'a project belongs to the profile it was made in, and can be deleted only after review',
  { skip, timeout: 60000 },
  async () => {
    mode = 'good';
    const page = await openGreenhouse();
    const first = await page.evaluate(`document.querySelector('#profile').value`),
      other = first === 'work' ? 'personal' : 'work';
    await keepOutline(page);

    await page.fill('#profile', other);
    await page.waitFor(
      `document.querySelector('#decks-list').children.length === 0`,
      'the other profile’s empty list',
    );
    assert.equal(
      await page.evaluate(`document.querySelector('#deck-editor').hidden`),
      true,
      'the open project is closed',
    );
    await page.fill('#profile', 'blended');
    assert.match(await words(page, '#decks-status'), /belong to Work or Personal/);
    assert.equal(await page.evaluate(`document.querySelector('#deck-outline').disabled`), true);

    await page.fill('#profile', first);
    await page.waitFor(`document.querySelector('#decks-list').children.length === 1`, 'the project again');
    const press = (text) =>
      page.evaluate(
        `[...document.querySelectorAll('#decks-list button')].find((b) => b.textContent === ${JSON.stringify(text)}).click()`,
      );
    await press('Delete');
    await waitReview(page, 'Delete this deck project?');
    await answer(page, '#review-cancel');
    assert.notEqual(await saved(page), null, 'cancel deletes nothing');
    await press('Delete');
    await waitReview(page, 'Delete this deck project?');
    await answer(page, '#review-approve');
    await noted(page, /Deck project deleted/);
    assert.equal(await saved(page), null);
    await page.close();
  },
);
