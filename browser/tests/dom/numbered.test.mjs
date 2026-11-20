// Browser-level checks for numbered navigation: "list feeds", "1.2", "point 2". The owner's words
// are matched by fixed rules and answered by the page. Headline titles never reach a model, and
// only a point of the last reply is sent on, as that point's own words. The "public site" is a
// stand-in on this machine.
// Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { askModel, browserSkipReason, openConnectedPage, startStack } from './harness.mjs';

const skip = browserSkipReason();
const options = { skip, timeout: 90000 };
const news = 'https://news.example/feed.xml';
const rssItem = (title, link, date) =>
  `<item><title>${title}</title><link>${link}</link><pubDate>${date}</pubDate></item>`;
const site = {
  names: ['news.example'],
  answer({ path }) {
    if (path === '/feed.xml')
      return {
        type: 'application/rss+xml; charset=utf-8',
        body:
          '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Synthetic Daily</title>' +
          rssItem('FIRST HEADLINE', 'https://news.example/story-1', 'Sun, 15 Nov 2026 10:00:00 GMT') +
          rssItem('SECOND HEADLINE', 'https://news.example/story-2', 'Sat, 14 Nov 2026 10:00:00 GMT') +
          '</channel></rss>',
      };
    if (path === '/story-2')
      return { body: '<title>Story Two</title><p>STORY TWO WORDS, long enough to keep.</p>' };
    return { status: 404, body: 'SITE ERROR WORDS' };
  },
};
const listed = 'Three things:\n1. **Alpha** matters most\n2. Beta comes second\n3. Gamma is last\n';

let stack;
before(
  async () => {
    if (!skip)
      stack = await startStack(
        (said) => (said.includes('three things') ? listed : 'A plain synthetic reply.'),
        {
          site,
        },
      );
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

const reviewOpen = `document.getElementById('review').open`;
// The numbered list at `place`, read from the page: null when it is hidden.
const panel = (page, place = '#numbered') =>
  page.evaluate(`(() => {
    const box = document.querySelector(${JSON.stringify(place)});
    if (box.hidden) return null;
    return {
      title: box.querySelector('.numbered-head strong').textContent,
      rows: [...box.querySelectorAll('ol > li')].map((li) => [
        li.querySelector('.numbered-label').textContent,
        li.querySelector('.numbered-label').nextElementSibling.textContent,
        Boolean(li.querySelector('button')),
      ]),
      note: box.querySelector('small').textContent,
      links: [...box.querySelectorAll('a')].map((a) => a.href),
    };
  })()`);
const type = async (page, words) => {
  await page.fill('#thought', words);
  await page.evaluate(`document.querySelector('#composer').requestSubmit()`);
};
async function withFeed(page) {
  await page.click('#tab-today');
  await page.evaluate(`document.getElementById('headlines-section').open = true`);
  await page.fill('#headline-address', news);
  await page.evaluate(`document.getElementById('headline-form').requestSubmit()`);
  await page.waitFor(reviewOpen, 'the feed review');
  await page.click('#review-approve');
  await page.waitFor(`document.querySelectorAll('#headline-list li').length === 2`, 'the headlines');
  await page.click('#tab-chat');
}

test(
  'feeds and headlines are walked by number on the page, and no title or command reaches a model',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1500 });
    const asked = stack.model.requests.length;
    assert.equal(await panel(page), null);

    await type(page, 'list feeds');
    await page.waitFor(`!document.getElementById('numbered').hidden`, 'the list');
    let seen = await panel(page);
    assert.deepEqual(seen.rows, []);
    assert.match(seen.note, /^You have no feeds yet\. Add one in Headlines on Today\.$/);
    assert.equal(
      await page.evaluate(`document.getElementById('thought').value`),
      '',
      'the command is used up',
    );

    await withFeed(page);
    await type(page, 'Can you give me a list of the feed names to choose from?');
    await page.waitFor(`document.querySelectorAll('#numbered ol > li').length === 1`, 'the feeds');
    seen = await panel(page);
    assert.equal(seen.title, 'Feeds');
    assert.deepEqual(seen.rows, [['1', 'Synthetic Daily', true]]);

    await type(page, 'feed one');
    await page.waitFor(`document.querySelectorAll('#numbered ol > li').length === 2`, 'the headlines');
    seen = await panel(page);
    assert.equal(seen.title, 'Feed 1: Synthetic Daily');
    assert.deepEqual(seen.rows, [
      ['1.1', 'FIRST HEADLINE', true],
      ['1.2', 'SECOND HEADLINE', true],
    ]);

    await type(page, 'one point two');
    await page.waitFor(
      `document.querySelector('#numbered .numbered-head strong').textContent.startsWith('Headline 1.2')`,
      'the headline',
    );
    seen = await panel(page);
    assert.equal(seen.title, 'Headline 1.2 from Synthetic Daily');
    assert.deepEqual(seen.rows, [['1.2', 'SECOND HEADLINE', false]]);
    assert.deepEqual(seen.links, ['https://news.example/story-2']);

    // A row pressed does what its number said does.
    await type(page, 'back to headlines');
    await page.waitFor(`document.querySelectorAll('#numbered ol > li').length === 2`, 'the headlines again');
    await page.evaluate(`document.querySelector('#numbered ol button').click()`);
    await page.waitFor(
      `document.querySelector('#numbered .numbered-head strong').textContent.startsWith('Headline 1.1')`,
      'the pressed headline',
    );
    await type(page, 'next headline');
    await page.waitFor(
      `document.querySelector('#numbered .numbered-head strong').textContent.startsWith('Headline 1.2')`,
      'the next headline',
    );
    await type(page, 'next headline');
    await page.waitFor(
      `/^There is no headline 1\\.3\\. Feed 1 has 2\\.$/.test(document.querySelector('#numbered small').textContent)`,
      'the plain refusal',
    );

    // Reading the open headline's page still goes through the usual review of its exact address.
    await type(page, '1.2');
    await page.waitFor(`document.querySelector('#numbered a')`, 'the headline');
    await type(page, 'read it');
    await page.waitFor(reviewOpen, 'the page review');
    assert.match(await page.text('#review-body'), /https:\/\/news\.example\/story-2/);
    assert.equal(await panel(page), null, 'the list steps aside for the review');
    await page.click('#review-cancel');
    await page.waitFor(`!${reviewOpen}`);

    assert.equal(stack.model.requests.length, asked, 'no model was asked for any of this');
    assert.equal(
      await page.evaluate(`document.querySelectorAll('#messages .utterance').length`),
      0,
      'nothing was put in the conversation',
    );
    await askModel(stack, page, 'Hello there.');
    assert.doesNotMatch(JSON.stringify(stack.model.requests.at(-1)), /HEADLINE|Synthetic Daily|list feeds/);

    // The list can be put away.
    await type(page, 'feed 1');
    await page.waitFor(`!document.getElementById('numbered').hidden`, 'the list');
    await page.evaluate(`document.querySelector('#numbered .icon').click()`);
    assert.equal(await panel(page), null, 'the list can be closed');
    await page.close();
  },
);

test(
  'a point of the last reply is sent as its own words, and a search is refused in plain words',
  options,
  async () => {
    const page = await openConnectedPage(stack);
    await type(page, 'point 2');
    await page.waitFor(`!document.getElementById('numbered').hidden`, 'the answer');
    assert.equal((await panel(page)).note, 'The last reply has no list of points.');
    const before = stack.model.requests.length;

    await askModel(stack, page, 'Tell me three things.');
    assert.match(stack.model.requests.at(-1).messages[0].content, /number them 1\., 2\., 3\./);
    await type(page, 'list points');
    await page.waitFor(`document.querySelectorAll('#numbered ol > li').length === 3`, 'the points');
    assert.deepEqual((await panel(page)).rows, [
      ['P1', 'Alpha matters most', true],
      ['P2', 'Beta comes second', true],
      ['P3', 'Gamma is last', true],
    ]);
    assert.equal(stack.model.requests.length, before + 1, 'listing the points asks no model');

    await type(page, 'Dig into point two.');
    await page.waitFor(
      `document.querySelectorAll('#messages .utterance.assistant').length === 2 && !document.querySelector('#profile').disabled`,
      'the reply about the point',
    );
    assert.deepEqual(stack.model.requests.at(-1).messages.at(-1), {
      role: 'user',
      content: 'Tell me more about point 2 of your last reply: “Beta comes second”',
    });

    // The newest reply has no list, so its points are gone; the older list is not used.
    await type(page, 'next point');
    await page.waitFor(
      `document.querySelector('#numbered small')?.textContent === 'The last reply has no list of points.'`,
      'the plain answer',
    );

    await askModel(stack, page, 'Tell me three things again.');
    const sent = stack.model.requests.length;
    await type(page, 'fact check point 3');
    await page.waitFor(
      `/cannot search the web, so point 3 was not searched/.test(document.querySelector('#numbered small')?.textContent ?? '')`,
      'the refusal',
    );
    assert.equal(stack.model.requests.length, sent, 'nothing is sent for a search PEA cannot do');

    // A pressed point is sent the same way.
    await type(page, 'list points');
    await page.waitFor(`document.querySelectorAll('#numbered ol button').length === 3`, 'the points');
    await page.evaluate(`document.querySelectorAll('#numbered ol button')[0].click()`);
    await page.waitFor(
      `document.querySelectorAll('#messages .utterance.assistant').length === 4 && !document.querySelector('#profile').disabled`,
      'the reply about the pressed point',
    );
    assert.equal(
      stack.model.requests.at(-1).messages.at(-1).content,
      'Tell me more about point 1 of your last reply: “Alpha matters most”',
    );
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();
  },
);

test(
  'in the voice room a move is answered in the room, read with the device voice, and the room stays open',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1500 });
    await page.evaluate(
      `(() => {
        window.spoken = [];
        Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak: (u) => window.spoken.push(u.text), cancel() {}, getVoices: () => [], addEventListener() {} } });
      })()`,
    );
    await withFeed(page);
    const asked = stack.model.requests.length;
    await page.evaluate(`document.getElementById('chat-voice').click()`);
    await page.waitFor(`document.getElementById('voice-room').open`, 'the voice room');
    const speak = async (words) => {
      await page.fill('#voice-transcript', words);
      await page.evaluate(`document.getElementById('voice-room-send').click()`);
    };
    await speak('Any list the headlines for the first feed');
    await page.waitFor(`document.querySelectorAll('#voice-room-numbered ol > li').length === 2`, 'the rows');
    assert.equal(await page.evaluate(`document.getElementById('voice-room').open`), true);
    assert.equal(await page.evaluate(`document.getElementById('voice-transcript').value`), '');
    assert.equal((await panel(page, '#voice-room-numbered')).title, 'Feed 1: Synthetic Daily');
    assert.deepEqual(await page.evaluate(`window.spoken`), [
      'Feed 1: Synthetic Daily. 1 point 1: FIRST HEADLINE. 1 point 2: SECOND HEADLINE.',
    ]);
    await speak('headline 2');
    await page.waitFor(`window.spoken.length === 2`, 'the headline read aloud');
    assert.match(
      (await page.evaluate(`window.spoken`))[1],
      /^Headline 1\.2 from Synthetic Daily: SECOND HEADLINE\./,
    );
    assert.equal(stack.model.requests.length, asked, 'no model was asked');
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();
  },
);
