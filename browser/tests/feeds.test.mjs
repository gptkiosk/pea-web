import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  describeFeed,
  feedLimits,
  headlineDate,
  headlineLink,
  mergeHeadlines,
  readFeed,
  validSavedFeeds,
} from '../feeds.mjs';
import { describeRead, pageAddress } from '../research.mjs';

const now = Date.parse('2026-11-16T12:00:00Z');
const at = (...codes) => String.fromCodePoint(...codes);
const rss = (items, head = '<title>Synthetic &amp; Daily</title><link>https://news.example/</link>') =>
  `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>${head}${items}</channel></rss>`;
const item = (title, link, date = '') =>
  `<item><title>${title}</title><link>${link}</link>${date ? `<pubDate>${date}</pubDate>` : ''}</item>`;

test('an RSS feed becomes plain titles, safe links and dates', () => {
  const feed = readFeed(
    rss(
      item(
        '<![CDATA[First <b>story</b> & more]]>',
        'https://news.example/a?x=1&amp;y=2#top',
        'Sun, 15 Nov 2026 10:00:00 GMT',
      ) +
        item('Second &lt;i&gt;story&lt;/i&gt; &amp;amp; third', 'http://news.example/b') +
        '<item><link>https://news.example/untitled</link></item>' +
        item('  Spaced\n\n  out  ', ' https://news.example/c '),
    ),
    now,
  );
  assert.equal(feed.name, 'Synthetic & Daily');
  assert.deepEqual(feed.items, [
    {
      title: 'First story & more',
      link: {
        href: 'https://news.example/a?x=1&y=2#top',
        readable: { url: 'https://news.example/a?x=1&y=2', host: 'news.example' },
      },
      at: Date.parse('2026-11-15T10:00:00Z'),
    },
    { title: 'Second story & third', link: null, at: null },
    {
      title: 'Spaced out',
      link: {
        href: 'https://news.example/c',
        readable: { url: 'https://news.example/c', host: 'news.example' },
      },
      at: null,
    },
  ]);
});

test('an Atom feed uses the entry’s own page, not its other links', () => {
  const feed = readFeed(
    '<feed xmlns="http://www.w3.org/2005/Atom"><title type="text">Atom One</title><link href="https://a.example/"/>' +
      '<entry><title type="html">Entry &lt;em&gt;one&lt;/em&gt;</title><link rel="self" href="https://a.example/self"/>' +
      '<link rel="enclosure" href="https://a.example/audio.mp3"/><link rel=\'alternate\' type="text/html" href=\'https://a.example/e1?a=1&amp;b=2\'/>' +
      '<updated>2026-11-15T09:00:00Z</updated></entry>' +
      '<entry><title>No rel</title><link href="https://a.example/e2"/><published>2026-11-14T09:00:00Z</published></entry>' +
      '<entry><title>Only self</title><link rel="self" href="https://a.example/e3"/></entry></feed>',
    now,
  );
  assert.equal(feed.name, 'Atom One');
  assert.deepEqual(
    feed.items.map((i) => [i.title, i.link?.href ?? null, i.at]),
    [
      ['Entry one', 'https://a.example/e1?a=1&b=2', Date.parse('2026-11-15T09:00:00Z')],
      ['No rel', 'https://a.example/e2', Date.parse('2026-11-14T09:00:00Z')],
      ['Only self', null, null],
    ],
  );
});

test('an older RDF feed is read too, and anything else is not a feed', () => {
  const rdf =
    '<rdf:RDF xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>RDF Site</title></channel>' +
    '<item><title>RDF story</title><link>https://r.example/1</link><dc:date>2026-11-15T08:00:00Z</dc:date></item></rdf:RDF>';
  const feed = readFeed(rdf, now);
  assert.equal(feed.name, 'RDF Site');
  assert.equal(feed.items[0].at, Date.parse('2026-11-15T08:00:00Z'));
  for (const not of [
    '<html><body><item><title>x</title></item></body></html>',
    '{"items":[]}',
    '',
    'x'.repeat(5000) + '<rss>',
    'r'.repeat(feedLimits.characters + 1),
    null,
    42,
  ])
    assert.equal(readFeed(not, now), null, String(not).slice(0, 30));
  assert.deepEqual(readFeed('<rss><channel><title>Empty</title></channel></rss>', now), {
    name: 'Empty',
    items: [],
  });
});

test('nothing in a feed can become markup, a script link or an unseen character', () => {
  const feed = readFeed(
    rss(
      item(
        '&lt;script&gt;alert(1)&lt;/script&gt;Loud &lt;img src=x onerror=alert(1)&gt;title',
        'javascript:alert(1)',
      ) +
        item('Hid' + at(0x200b) + 'den' + at(0x202e) + ' order', 'https://owner:secret@news.example/x') +
        item('Other port', 'https://news.example:8443/x') +
        item('Numeric', 'https://127.0.0.1/x') +
        item('Data', 'data:text/html,hello') +
        item('Relative', '/story') +
        item('T'.repeat(500), 'https://news.example/' + 'p'.repeat(2100)),
      '<title>&lt;b&gt;Bold&lt;/b&gt; ' + 'N'.repeat(200) + '</title>',
    ),
    now,
  );
  assert.equal(feed.name.length, feedLimits.name);
  assert.ok(feed.name.startsWith('Bold N'));
  assert.deepEqual(
    feed.items.map((i) => [i.title.slice(0, 20), i.link]),
    [
      ['Loud title', null],
      ['Hidden order', null],
      ['Other port', null],
      ['Numeric', null],
      ['Data', null],
      ['Relative', null],
      ['T'.repeat(20), null],
    ],
  );
  assert.equal(feed.items.at(-1).title.length, feedLimits.title);
});

test('a feed is cut to twenty headlines, repeats are dropped and odd dates are ignored', () => {
  const many = Array.from({ length: 40 }, (_, n) => item('Story ' + n, 'https://news.example/' + n)).join('');
  assert.equal(readFeed(rss(many), now).items.length, feedLimits.perFeed);
  const repeats = readFeed(
    rss(
      item('Same', 'https://news.example/1') +
        item('Same again', 'https://news.example/1') +
        item('Same', '') +
        item('Same', ''),
    ),
    now,
  );
  assert.deepEqual(
    repeats.items.map((i) => i.title),
    ['Same', 'Same'],
  );
  for (const date of ['not a date', '1970-01-01T00:00:00Z', '2099-01-01T00:00:00Z', ''])
    assert.equal(readFeed(rss(item('Dated', 'https://news.example/d', date)), now).items[0].at, null, date);
});

test('a broken or hostile feed is handled quickly and never loops', () => {
  assert.deepEqual(readFeed('<rss><channel><item><title>Never closed', now), { name: '', items: [] });
  assert.deepEqual(readFeed('<rss><item><title>No end</item>', now).items, []);
  assert.deepEqual(readFeed('<rss><items><title>Not an item</title></items></rss>', now).items, []);
  const started = Date.now();
  readFeed('<rss>' + '<item>'.repeat(300000), now);
  readFeed('<rss>' + '<item><title>'.repeat(100000) + '</item>'.repeat(10), now);
  readFeed('<feed>' + '<entry><link '.repeat(100000) + '</entry>', now);
  assert.ok(Date.now() - started < 3000, 'reduced quickly');
});

test('a headline link is https to a named site, and reading drops only the fragment', () => {
  assert.deepEqual(headlineLink('https://News.Example/a b?q=caf' + at(0xe9) + '#part'), {
    href: 'https://news.example/a%20b?q=caf%C3%A9#part',
    readable: { url: 'https://news.example/a%20b?q=caf%C3%A9', host: 'news.example' },
  });
  for (const bad of [
    'http://news.example/',
    'ftp://news.example/',
    'https://localhost/',
    'https://[::1]/',
    '//news.example/',
    '',
    null,
  ])
    assert.equal(headlineLink(bad), null, String(bad));
});

test('headlines from every feed are merged newest first, thirty at most', () => {
  const feeds = [
    { url: 'https://a.example/feed', name: 'A' },
    { url: 'https://b.example/feed', name: 'B' },
    { url: 'https://c.example/feed', name: 'C' },
  ];
  const read = new Map([
    [
      'https://a.example/feed',
      {
        items: [
          { title: 'a-old', link: null, at: 100 },
          { title: 'a-undated', link: null, at: null },
        ],
      },
    ],
    [
      'https://b.example/feed',
      {
        items: [
          { title: 'b-new', link: null, at: 300 },
          { title: 'b-mid', link: null, at: 200 },
        ],
      },
    ],
  ]);
  assert.deepEqual(
    mergeHeadlines(feeds, read).map((i) => i.title + '/' + i.source),
    ['b-new/B', 'b-mid/B', 'a-old/A', 'a-undated/A'],
  );
  read.set('https://c.example/feed', {
    items: Array.from({ length: 40 }, (_, n) => ({ title: 'c' + n, link: null, at: 1000 + n })),
  });
  assert.equal(mergeHeadlines(feeds, read).length, feedLimits.shown);
  assert.deepEqual(mergeHeadlines([], read), []);
});

test('only a clean list of feed addresses is restored', () => {
  assert.deepEqual(
    validSavedFeeds({
      feeds: [
        { url: 'https://news.example/feed.xml', name: ' Synthetic\nDaily ' },
        { url: 'https://news.example/feed.xml', name: 'Repeat' },
        { url: 'http://news.example/feed.xml', name: 'Plain' },
        { url: 'https://other.example/rss', name: '' },
        { url: 'https://third.example/rss' },
        null,
      ],
    }),
    [
      { url: 'https://news.example/feed.xml', host: 'news.example', name: 'Synthetic Daily' },
      { url: 'https://other.example/rss', host: 'other.example', name: 'other.example' },
    ],
  );
  const many = {
    feeds: Array.from({ length: 20 }, (_, n) => ({ url: `https://f${n}.example/rss`, name: 'F' + n })),
  };
  assert.equal(validSavedFeeds(many).length, feedLimits.feeds);
  for (const bad of [null, [], 'x', { feeds: 'x' }, {}]) assert.deepEqual(validSavedFeeds(bad), []);
});

test('the reviews say what the site learns and that headlines never reach a model', () => {
  const text = describeFeed(pageAddress('https://news.example/feed.xml'));
  assert.match(text, /Feed address \(exactly what is requested\):\nhttps:\/\/news\.example\/feed\.xml\n/);
  assert.match(text, /each time you press Refresh in Headlines; never on its own/);
  assert.match(text, /never given to a model/);
  assert.match(
    describeRead(pageAddress('https://news.example/a'), {
      profile: 'personal',
      from: 'feed',
      feed: 'Synthetic Daily',
    }),
    /From: a headline you chose in Synthetic Daily\. That site wrote the address/,
  );
});

test('dates read as plain words', () => {
  assert.equal(headlineDate(now - 30000, now), 'just now');
  assert.equal(headlineDate(now - 25 * 60000, now), '25 minutes ago');
  assert.equal(headlineDate(now - 60 * 60000, now), '1 hour ago');
  assert.equal(headlineDate(now - 5 * 3600000, now), '5 hours ago');
  assert.equal(headlineDate(now - 26 * 3600000, now), 'yesterday');
  assert.equal(headlineDate(now - 6 * 86400000, now), '6 days ago');
  assert.equal(headlineDate(Date.parse('2026-01-02T00:00:00Z'), now), '2026-01-02');
  assert.equal(headlineDate(null, now), '');
});

test('the reader contract allows feeds, and the new files are served', async () => {
  const contract = JSON.parse(await readFile(new URL('../server/contract.json', import.meta.url), 'utf8'));
  for (const type of ['application/rss+xml', 'application/atom+xml', 'application/xml', 'text/xml'])
    assert.ok(contract.reader.contentTypes.includes(type) && contract.reader.accept.includes(type), type);
  assert.ok(contract.assets.includes('feeds.mjs') && contract.assets.includes('feeds-ui.mjs'));
});
