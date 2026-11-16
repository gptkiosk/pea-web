// Browser-level checks for Headlines on Today. No site is asked until the owner adds a feed and
// approves it; after that only a press of Refresh asks again. Titles are placed on the page as
// text, are never saved and never reach a model, and a headline's own page is read only through
// the usual review in Chat. The "public sites" are a stand-in on this machine.
// Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { askModel, browserSkipReason, openConnectedPage, startStack } from './harness.mjs';

const skip = browserSkipReason();
const options = { skip, timeout: 90000 };
const news = 'https://news.example/feed.xml';
const storageKey = 'pea-headlines-v1';

// What the stand-in sites do next; tests change these.
const state = { edition: 1, otherBroken: false };
const rssItem = (title, link, date) =>
  `<item><title>${title}</title><link>${link}</link><pubDate>${date}</pubDate></item>`;
const site = {
  names: ['news.example', 'other.example'],
  resolve: { 'inside.example': '10.0.0.5' },
  answer({ host, path }) {
    if (host === 'other.example') {
      if (state.otherBroken) return { status: 503, body: 'SITE ERROR WORDS' };
      return {
        type: 'application/atom+xml',
        body:
          '<feed xmlns="http://www.w3.org/2005/Atom"><title>Other Wire</title>' +
          '<entry><title>OTHER HEADLINE</title><link href="https://other.example/o1"/><updated>2026-11-01T09:00:00Z</updated></entry></feed>',
      };
    }
    if (path === '/feed.xml')
      return {
        type: 'application/rss+xml; charset=utf-8',
        body:
          '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Synthetic &amp; Daily</title>' +
          (state.edition > 1
            ? rssItem(
                'LATE EDITION HEADLINE',
                'https://news.example/story-3',
                'Sun, 15 Nov 2026 12:00:00 GMT',
              )
            : '') +
          rssItem(
            '<![CDATA[FIRST HEADLINE <img src=x onerror="window.__feedRan = true"><script>window.__feedRan = true</script>]]>',
            'https://news.example/story-1?ref=feed#top',
            'Sun, 15 Nov 2026 10:00:00 GMT',
          ) +
          rssItem('PLAIN LINK HEADLINE', 'http://news.example/story-2', 'Sat, 14 Nov 2026 10:00:00 GMT') +
          rssItem(
            'SCRIPT LINK HEADLINE',
            'javascript:window.__feedRan=true',
            'Fri, 13 Nov 2026 10:00:00 GMT',
          ) +
          '</channel></rss>',
      };
    if (path.startsWith('/story-1'))
      return { body: '<title>Story One</title><p>STORY ONE WORDS, long enough to keep.</p>' };
    if (path === '/moved') return { status: 301, location: news };
    if (path === '/page') return { body: '<html><body><p>Just a page.</p></body></html>' };
    return { status: 404, body: 'SITE ERROR WORDS' };
  },
};

let stack;
before(
  async () => {
    if (!skip) stack = await startStack(() => 'A plain synthetic reply.', { site });
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

const reviewOpen = `document.getElementById('review').open`;
const note = (page) => page.evaluate(`document.getElementById('headline-note').textContent`);
const titles = (page) =>
  page.evaluate(
    `[...document.querySelectorAll('#headline-list li')].map((li) => li.firstElementChild.textContent)`,
  );
const feedRows = (page) =>
  page.evaluate(`[...document.querySelectorAll('#headline-feeds li span')].map((s) => s.textContent)`);
const stored = (page) => page.evaluate(`localStorage.getItem(${JSON.stringify(storageKey)})`);

async function openToday(stack_) {
  const page = await openConnectedPage(stack_, { width: 1500 });
  assert.equal(await stored(page), null, 'each test starts with no feeds');
  await page.click('#tab-today');
  await page.evaluate(`document.getElementById('headlines-section').open = true`);
  return page;
}
// Types a feed address and submits; answers the review when one is expected.
async function addFeed(page, address, answer = 'approve') {
  await page.fill('#headline-address', address);
  await page.evaluate(`document.getElementById('headline-form').requestSubmit()`);
  if (!answer) return '';
  await page.waitFor(reviewOpen, 'the feed review');
  const shown = await page.text('#review-body');
  await page.click(answer === 'approve' ? '#review-approve' : '#review-cancel');
  return shown;
}
const idle = `!document.getElementById('headline-add').disabled`;
async function removeAll(page) {
  await page.evaluate(
    `(() => { for (;;) { const b = document.querySelector('#headline-feeds button'); if (!b) return; b.click(); } })()`,
  );
  assert.equal(await stored(page), null);
}

test('no site is asked until a feed is approved, and then only on Refresh', options, async () => {
  state.edition = 1;
  const page = await openToday(stack);
  try {
    const seen = stack.site.requests.length,
      asked = stack.model.requests.length;
    assert.equal(await page.text('#headline-status'), 'Off');
    assert.equal(await page.evaluate(`document.getElementById('headline-refresh').hidden`), true);

    const shown = await addFeed(page, news, 'cancel');
    assert.ok(shown.includes('Feed address (exactly what is requested):\n' + news + '\n'), shown);
    assert.match(shown, /each time you press Refresh in Headlines; never on its own/);
    assert.match(shown, /never given to a model/);
    await page.waitFor(`!${reviewOpen}`);
    assert.equal(stack.site.requests.length, seen, 'cancel asks nothing');
    assert.deepEqual(await feedRows(page), []);
    assert.equal(await stored(page), null);

    await addFeed(page, news);
    await page.waitFor(`document.querySelectorAll('#headline-list li').length === 3`, 'the headlines');
    const requests = stack.site.requests.slice(seen);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].host + requests[0].path, 'news.example/feed.xml');
    for (const header of ['cookie', 'authorization', 'referer', 'origin'])
      assert.equal(requests[0].headers[header], undefined, header);

    // Titles are text. Nothing in the feed became an element, ran, or made a link that is not https.
    assert.deepEqual(await titles(page), ['FIRST HEADLINE', 'PLAIN LINK HEADLINE', 'SCRIPT LINK HEADLINE']);
    assert.equal(
      await page.evaluate(`document.querySelectorAll('#headline-list img, #headline-list script').length`),
      0,
    );
    assert.equal(await page.evaluate(`window.__feedRan`), undefined);
    assert.deepEqual(
      await page.evaluate(
        `[...document.querySelectorAll('#headline-list a')].map((a) => [a.getAttribute('href'), a.target, a.rel])`,
      ),
      [['https://news.example/story-1?ref=feed#top', '_blank', 'noopener noreferrer']],
    );
    assert.equal(
      await page.evaluate(`document.querySelectorAll('#headline-list button').length`),
      1,
      'one Read in Chat',
    );
    assert.match((await feedRows(page))[0], /^Synthetic & Daily · news\.example$/);
    assert.equal(await page.text('#headline-status'), '3 shown');
    assert.equal(await page.text('#headline-peek'), 'FIRST HEADLINE');

    // Only the address and name are saved; the titles are not.
    assert.deepEqual(JSON.parse(await stored(page)), { feeds: [{ url: news, name: 'Synthetic & Daily' }] });

    // Nothing more is asked until Refresh, and Refresh asks once.
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(stack.site.requests.length, seen + 1);
    state.edition = 2;
    await page.click('#headline-refresh');
    await page.waitFor(`document.querySelectorAll('#headline-list li').length === 4`, 'the new edition');
    assert.equal((await titles(page))[0], 'LATE EDITION HEADLINE');
    assert.equal(stack.site.requests.length, seen + 2);
    assert.match(await note(page), /asks again only when you press Refresh/);

    // Headlines never reach a model, in any message.
    await page.click('#tab-chat');
    await askModel(stack, page, 'Anything new?');
    assert.equal(stack.model.requests.length, asked + 1);
    assert.doesNotMatch(
      JSON.stringify(stack.model.requests.at(-1)),
      /HEADLINE|news\.example|Synthetic & Daily/,
    );

    // Opening PEA again asks no site: the feed is listed, and its headlines wait for Refresh.
    await page.goto(stack.gateway.origin + '/');
    await page.waitFor(`document.querySelectorAll('#headline-feeds li').length === 1`, 'the saved feed');
    assert.deepEqual(await titles(page), []);
    assert.equal(await page.text('#headline-status'), 'Not loaded');
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(stack.site.requests.length, seen + 2);
    assert.deepEqual(page.outsideRequests(), []);
  } finally {
    await removeAll(page);
    await page.close();
  }
});

test('a headline’s page is read only through the usual review in Chat', options, async () => {
  state.edition = 1;
  const page = await openToday(stack);
  try {
    await addFeed(page, news);
    await page.waitFor(`document.querySelectorAll('#headline-list li').length === 3`, 'the headlines');
    const seen = stack.site.requests.length;
    await page.click('#headline-list button');
    await page.waitFor(reviewOpen, 'the page review');
    assert.equal(await page.evaluate(`document.getElementById('chat').classList.contains('active')`), true);
    const shown = await page.text('#review-body');
    assert.match(shown, /From: a headline you chose in Synthetic & Daily\. That site wrote the address/);
    assert.ok(
      shown.includes('Address (exactly what is requested):\nhttps://news.example/story-1?ref=feed\n'),
      shown,
    );
    assert.equal(stack.site.requests.length, seen, 'nothing is read before approval');
    await page.click('#review-approve');
    await page.waitFor(`!document.getElementById('context-page').hidden`, 'the page to be kept');
    assert.equal(await page.text('#context-page-name'), 'Story One');
    assert.deepEqual(
      stack.site.requests.slice(seen).map((r) => r.host + r.path),
      ['news.example/story-1?ref=feed'],
    );
  } finally {
    await removeAll(page);
    await page.close();
  }
});

test('addresses that are not a readable public feed are refused in plain words', options, async () => {
  const page = await openToday(stack);
  try {
    const seen = stack.site.requests.length;
    // Refused before any review or request.
    for (const [address, pattern] of [
      ['http://news.example/feed.xml', /full https:\/\/ address/],
      ['https://127.0.0.1/feed.xml', /full https:\/\/ address/],
      ['news.example/feed.xml', /full https:\/\/ address/],
    ]) {
      await addFeed(page, address, null);
      assert.match(await note(page), pattern, address);
      assert.equal(await page.evaluate(reviewOpen), false);
    }
    assert.equal(stack.site.requests.length, seen);

    // Refused after the owner approves, by the server or because it is not a feed.
    for (const [address, pattern] of [
      ['https://news.example/page', /not an RSS or Atom feed/],
      [
        'https://news.example/moved',
        /This feed has moved to https:\/\/news\.example\/feed\.xml\. PEA does not follow it/,
      ],
      ['https://news.example/gone', /answered with an error \(404\)/],
      ['https://inside.example/feed', /private or local address/],
    ]) {
      await addFeed(page, address);
      await page.waitFor(
        `${idle} && !/Reading/.test(document.getElementById('headline-note').textContent)`,
        'the answer for ' + address,
      );
      assert.match(await note(page), pattern, address);
      assert.deepEqual(await feedRows(page), [], address);
    }
    assert.equal(await stored(page), null, 'nothing was added');
    assert.ok(!(await page.text('body')).includes('SITE ERROR WORDS'));
    assert.deepEqual(
      stack.site.requests.slice(seen).map((r) => r.host + r.path),
      ['news.example/page', 'news.example/moved', 'news.example/gone'],
      'the private name was never contacted and the moved feed was not followed',
    );

    // The same feed twice.
    await addFeed(page, news);
    await page.waitFor(`document.querySelectorAll('#headline-feeds li').length === 1`, 'the feed');
    await addFeed(page, news, null);
    assert.match(await note(page), /already in your list/);
  } finally {
    await removeAll(page);
    await page.close();
  }
});

test('one feed failing leaves the others and the earlier headlines in place', options, async () => {
  state.edition = 1;
  state.otherBroken = false;
  const page = await openToday(stack);
  try {
    await addFeed(page, news);
    await page.waitFor(`document.querySelectorAll('#headline-feeds li').length === 1`, 'the first feed');
    await addFeed(page, 'https://other.example/atom');
    await page.waitFor(`document.querySelectorAll('#headline-feeds li').length === 2`, 'the second feed');
    assert.deepEqual(await titles(page), [
      'FIRST HEADLINE',
      'PLAIN LINK HEADLINE',
      'SCRIPT LINK HEADLINE',
      'OTHER HEADLINE',
    ]);

    state.otherBroken = true;
    state.edition = 2;
    await page.click('#headline-refresh');
    await page.waitFor(
      `/could not be read/.test(document.getElementById('headline-note').textContent)`,
      'the refresh to finish',
    );
    assert.match(await note(page), /^1 of 2 feeds could not be read/);
    assert.deepEqual(await titles(page), [
      'LATE EDITION HEADLINE',
      'FIRST HEADLINE',
      'PLAIN LINK HEADLINE',
      'SCRIPT LINK HEADLINE',
      'OTHER HEADLINE',
    ]);
    const rows = await feedRows(page);
    assert.match(rows[1], /^Other Wire · other\.example · The site answered with an error \(503\)/);
    assert.ok(!(await page.text('body')).includes('SITE ERROR WORDS'));

    // Removing a feed removes its headlines and its saved address.
    await page.evaluate(`document.querySelectorAll('#headline-feeds button')[1].click()`);
    assert.ok(!(await titles(page)).includes('OTHER HEADLINE'));
    assert.deepEqual(
      JSON.parse(await stored(page)).feeds.map((f) => f.url),
      [news],
    );
  } finally {
    state.otherBroken = false;
    await removeAll(page);
    await page.close();
  }
});

test('headlines need the PEA server, and say so without asking anyone', options, async () => {
  const page = await stack.browser.newPage();
  await page.goto(stack.gateway.origin + '/');
  await page.waitFor(`document.querySelector('#local-connect').onclick`, 'the app to finish starting');
  const seen = stack.site.requests.length;
  await page.click('#tab-today');
  await addFeed(page, news, null);
  assert.match(await note(page), /Headlines need your PEA server/);
  assert.equal(await page.evaluate(reviewOpen), false);
  assert.equal(stack.site.requests.length, seen);
  assert.equal(await stored(page), null);
  await page.close();
});
