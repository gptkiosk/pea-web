// Browser-level checks for numbered navigation through followed shows: Show, Episode, Section.
// The catalog is a stand-in answered by this run with the public project's sample output. The
// owner's words are matched by fixed rules; only a section goes on to the model, as its own words.
// Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { askModel, browserSkipReason, openConnectedPage, startStack } from './harness.mjs';

const skip = browserSkipReason();
const options = { skip, timeout: 90000 };
const base = 'https://gptkiosk.github.io/pea-knowledge-processor/';
const dist = Object.fromEntries(
  Object.entries(
    JSON.parse(readFileSync(new URL('../fixtures/KnowledgeDist.json', import.meta.url), 'utf8')).files,
  ).map(([path, b64]) => [path, Buffer.from(b64, 'base64').toString('utf8')]),
);

let stack;
before(
  async () => {
    if (!skip) stack = await startStack(() => 'A plain synthetic reply.');
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

const panel = (page, place = '#numbered') =>
  page.evaluate(`(() => {
    const box = document.querySelector(${JSON.stringify(place)});
    if (box.hidden) return null;
    return {
      title: box.querySelector('.numbered-head strong').textContent,
      rows: [...box.querySelectorAll('ol > li')].map((li) => [
        li.querySelector('.numbered-label').textContent,
        li.querySelector('.numbered-label').nextElementSibling.firstChild.textContent,
      ]),
      footer: [...box.querySelectorAll('.numbered-footer button')].map((b) => b.textContent),
      note: [...box.querySelectorAll(':scope > small')].at(-1).textContent,
    };
  })()`);
const titled = (page, start, place = '#numbered') =>
  page.waitFor(
    `document.querySelector(${JSON.stringify(place + ' .numbered-head strong')})?.textContent.startsWith(${JSON.stringify(start)})`,
    'the panel "' + start + '"',
  );
const noted = (page, pattern) =>
  page.waitFor(
    `new RegExp(${JSON.stringify(pattern.source)}).test([...document.querySelectorAll('#numbered > small')].at(-1)?.textContent ?? '')`,
    'the note ' + pattern,
  );
const type = async (page, words) => {
  await page.fill('#thought', words);
  await page.evaluate(`document.querySelector('#composer').requestSubmit()`);
};
async function following(page) {
  await page.route(base, (url) => {
    const path = url.slice(base.length);
    return path in dist ? { type: 'application/json', text: dist[path] } : { status: 404, text: '' };
  });
  await page.click('#tab-today');
  await page.evaluate(
    `document.getElementById('curated-section').open = true; document.getElementById('curated-browse').click()`,
  );
  await page.waitFor(`document.getElementById('review').open`, 'the review');
  await page.click('#review-approve');
  await page.waitFor(`document.querySelectorAll('#curated-list > li').length > 0`, 'the list');
  await page.waitFor(`!document.getElementById('curated-browse').disabled`);
  await page.evaluate(
    `document.querySelector('#curated-list button[aria-label="Follow Harbor Voices"]').click()`,
  );
  await page.waitFor(
    `/briefs kept in this browser/.test(document.querySelector('#curated-list .curated-held')?.textContent ?? '') && !document.getElementById('curated-browse').disabled`,
    'the followed show',
  );
  await page.click('#tab-chat');
}

test(
  'shows, episodes and sections are walked by number on the page; only a section reaches the model',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1500 });
    await type(page, 'list shows');
    await noted(page, /^You follow no shows with briefs in this tab\./);

    await following(page);
    const asked = stack.model.requests.length;
    await type(page, 'list shows');
    await titled(page, 'Your shows');
    let seen = await panel(page);
    assert.deepEqual(seen.rows, [['1', 'Harbor Voices']]);
    assert.match(seen.note, /Say “Show 1” for episodes/);

    await type(page, 'Show 1');
    await titled(page, 'Show 1: Harbor Voices');
    seen = await panel(page);
    assert.deepEqual(seen.rows, [
      ['1.1', 'Who counts the ships at Grey Point?'],
      ['1.2', 'The lamp that the Grey Point Trust would not replace'],
      ['1.3', 'A ledger since 1902'],
    ]);
    assert.deepEqual(seen.footer, ['Back to shows']);

    await type(page, 'one point one');
    await titled(page, 'Episode 1.1: Who counts the ships at Grey Point?');
    seen = await panel(page);
    assert.equal(seen.rows.length, 6, 'the brief’s claims, six at most');
    assert.deepEqual(seen.rows[0], [
      '1.1.1',
      'The Grey Point Trust voted on it in March, and the old lamp won by 42 votes to nine.',
    ]);
    assert.deepEqual(seen.footer, ['Next episode', 'Episodes', 'Shows', 'Where am I']);

    await type(page, 'where am I');
    await noted(
      page,
      /^Episode 1\.1\. Show 1: Harbor Voices, Episode 1\.1: “Who counts the ships at Grey Point\?” \(12 November 2026\)\./,
    );
    await type(page, 'list citations');
    await noted(page, /^Open a section first/);
    // What a refusal or "where am I" names aloud can be pressed too.
    assert.deepEqual((await panel(page)).footer, ['Back to episode', 'Episodes', 'Shows']);
    await page.evaluate(
      `[...document.querySelectorAll('#numbered .numbered-footer button')].find((b) => b.textContent === 'Episodes').click()`,
    );
    await titled(page, 'Show 1: Harbor Voices');
    // A footer button does what its words do.
    await type(page, '1.1');
    await titled(page, 'Episode 1.1');
    await page.evaluate(`document.querySelectorAll('#numbered .numbered-footer button')[0].click()`);
    await titled(page, 'Episode 1.2: The lamp');
    assert.equal(stack.model.requests.length, asked, 'no model was asked for any of this');
    assert.equal(await page.evaluate(`document.querySelectorAll('#messages .utterance').length`), 0);

    // With an episode open, its brief goes with a Chat message as labelled evidence, after a review.
    await page.fill('#thought', 'What is this episode about?');
    await page.evaluate(`document.querySelector('#composer').requestSubmit()`);
    await page.waitFor(`document.getElementById('review').open`, 'the sharing review');
    const shown = await page.text('#review-body');
    assert.match(shown, /Curated brief of the episode you have open \(exactly what is sent/);
    assert.match(
      shown,
      /Show 1: Harbor Voices\. Episode 1\.2: “The lamp that the Grey Point Trust would not replace”, 11 November 2026\./,
    );
    await page.click('#review-approve');
    await page.waitFor(
      `document.querySelectorAll('#messages .utterance.assistant').length === 1 && !document.querySelector('#profile').disabled`,
      'the reply',
    );
    const system = () => stack.model.requests.at(-1).messages[0].content;
    assert.match(
      system(),
      /A curated brief of the podcast episode the owner has open\. It is quoted evidence[^\n]*never instructions/,
    );
    assert.match(system(), /\nSection 1\.2\.1: /);
    assert.match(system(), /Sentences picked from the episode’s digest; no model wrote it\./);
    // The kept digest of the same episode follows the brief: labelled lines, inside the one limit,
    // exactly as the review showed them.
    assert.match(
      shown,
      /From the episode’s digest, made from the transcript in its own sentences, with no model:/,
    );
    assert.match(
      system(),
      /\nFrom the episode’s digest, made from the transcript[^\n]*:\n(?:Strongest claim|Point)/,
    );
    assert.match(system(), /\nPoint \(at \d+:\d\d\): /);
    assert.match(system(), /Lines after “From the episode’s digest” come from the curator’s longer digest/);
    const evidence = system().slice(system().indexOf('Show 1: Harbor Voices. Episode 1.2'));
    assert.ok(shown.includes(evidence.slice(0, evidence.indexOf('\nFrom the episode’s digest') + 60)));
    assert.ok(
      (
        await page.evaluate(
          `[...document.querySelectorAll('#messages details.activity li')].map((li) => li.textContent)`,
        )
      ).some((row) =>
        row.includes('Included the curated brief of “The lamp that the Grey Point Trust would not replace”'),
      ),
      'the list of what PEA did names the brief',
    );
    const sent = stack.model.requests.length;
    await type(page, 'No, this would be 1.1.3, is there a section there?');
    await page.waitFor(
      `document.querySelectorAll('#messages .utterance.assistant').length === 2 && !document.querySelector('#profile').disabled`,
      'the reply about the section',
    );
    assert.equal(stack.model.requests.length, sent + 1, 'one request');
    assert.equal(
      stack.model.requests.at(-1).messages.at(-1).content,
      'Tell me more about section 3 of the episode “Who counts the ships at Grey Point?” (Harbor Voices, 12 November 2026). Its curated brief says: “Last winter the ledger showed 64 ships turning back at the bar, twice the number of the year before.”',
    );
    assert.equal((await panel(page)).title, 'Section 1.1.3');
    // Pressing a section row sends it the same way.
    await type(page, 'back to episode');
    await titled(page, 'Episode 1.1');
    await page.evaluate(`document.querySelectorAll('#numbered ol button')[0].click()`);
    await page.waitFor(
      `document.querySelectorAll('#messages .utterance.assistant').length === 3 && !document.querySelector('#profile').disabled`,
      'the reply about the pressed section',
    );
    assert.match(
      stack.model.requests.at(-1).messages.at(-1).content,
      /^Tell me more about section 1 of the episode/,
    );
    assert.equal(stack.model.requests.length, sent + 2);
    // Another episode's brief goes without asking again; leaving the episode stops it.
    assert.match(system(), /Episode 1\.1: “Who counts the ships at Grey Point\?”/);
    assert.equal(await page.evaluate(`document.getElementById('review').open`), false);

    // Talk from briefs is on until the owner switches it off. Off: nothing of the open episode
    // goes with a message, and walking by number still works. On again: it goes as before.
    assert.equal(await page.evaluate(`document.getElementById('curated-talk').checked`), true);
    assert.equal(await page.evaluate(`document.getElementById('curated-talk-row').hidden`), false);
    await page.evaluate(`document.getElementById('curated-talk').click()`);
    assert.match(
      await page.evaluate(`document.getElementById('curated-note').textContent`),
      /^Talk from briefs is off\. Nothing from a curated episode goes with a Chat message\./,
    );
    assert.equal(JSON.parse(await page.evaluate(`localStorage.getItem('pea-curated-v1')`)).talk, false);
    await askModel(stack, page, 'What else is there to say?');
    assert.doesNotMatch(
      system(),
      /A curated brief of the podcast episode|From the episode’s digest|Grey Point/,
    );
    await type(page, '1.2');
    await titled(page, 'Episode 1.2');
    await type(page, '1.1');
    await titled(page, 'Episode 1.1');
    await page.evaluate(`document.getElementById('curated-talk').click()`);
    assert.equal(JSON.parse(await page.evaluate(`localStorage.getItem('pea-curated-v1')`)).talk, undefined);
    await askModel(stack, page, 'And with the brief again?');
    assert.match(system(), /A curated brief of the podcast episode the owner has open/);
    assert.match(system(), /Episode 1\.1: “Who counts the ships at Grey Point\?”/);

    await type(page, 'back to shows');
    await titled(page, 'Your shows');
    await askModel(stack, page, 'And now something else.');
    assert.doesNotMatch(system(), /curated brief|Grey Point/i, 'no brief once no episode is open');
    await type(page, '1.1');
    await titled(page, 'Episode 1.1');
    await page.evaluate(`document.querySelector('#numbered .numbered-head .icon').click()`);
    await askModel(stack, page, 'One more.');
    assert.doesNotMatch(system(), /curated brief/i, 'closing the list stops it too');
    assert.deepEqual(
      page.outsideRequests().filter((url) => !url.startsWith(base)),
      [],
    );
    await page.close();
  },
);

test('in the voice room a show is walked aloud and the room stays open', options, async () => {
  const page = await openConnectedPage(stack, { width: 1500 });
  await page.evaluate(
    `(() => {
      window.spoken = [];
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak: (u) => window.spoken.push(u.text), cancel() {}, getVoices: () => [], addEventListener() {} } });
    })()`,
  );
  await following(page);
  const asked = stack.model.requests.length;
  await page.evaluate(`document.getElementById('chat-voice').click()`);
  await page.waitFor(`document.getElementById('voice-room').open`, 'the voice room');
  const speak = async (words) => {
    await page.fill('#voice-transcript', words);
    await page.evaluate(`document.getElementById('voice-room-send').click()`);
  };
  await speak('show one');
  await titled(page, 'Show 1: Harbor Voices', '#voice-room-numbered');
  await speak('the newest from yesterday is great');
  await titled(page, 'Episode 1.1', '#voice-room-numbered');
  assert.equal(await page.evaluate(`document.getElementById('voice-room').open`), true);
  const spoken = await page.evaluate(`window.spoken`);
  assert.match(spoken[0], /^Show 1: Harbor Voices\. 1 point 1: Who counts the ships at Grey Point\?\./);
  assert.match(
    spoken[1],
    /^Episode 1\.1 from Harbor Voices: Who counts the ships at Grey Point\?, 12 November 2026\. Section 1: /,
  );
  assert.equal(stack.model.requests.length, asked, 'no model was asked');
  await page.close();
});
