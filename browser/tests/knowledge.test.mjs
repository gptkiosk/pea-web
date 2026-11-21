// The curated catalog reader against the public project's own corpus: the golden briefs of the
// brief contract, the files a reader must refuse, and one whole good output. The corpus files are
// copied, not edited (tests/fixtures/README.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  catalogAddress,
  catalogBase,
  catalogRepository,
  requestAddress,
  checkBrief,
  checkBriefAlone,
  checkItems,
  checkStore,
  refusal,
  sha256,
  strictJSON,
  textReason,
} from '../knowledge.mjs';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const bytes = (b64) => new Uint8Array(Buffer.from(b64, 'base64'));
const text = (value) => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
const codes = (problems) => [...new Set(problems.map((p) => p.code))].sort();

test('the golden corpus of the brief contract gives the result its manifest states, for every file', async () => {
  const corpus = fixture('KnowledgeContractCorpus'),
    cases = corpus.manifest.cases;
  assert.equal(
    corpus.manifest_sha256,
    'd2f75b9d915468c066415814ded17b5a3da40c057cd0589b465951ea52fa3269',
    'the corpus is the pinned one',
  );
  assert.equal(cases.length, 38);
  assert.deepEqual(Object.keys(corpus.files).sort(), cases.map((c) => c.file).sort());
  for (const c of cases) {
    const data = bytes(corpus.files[c.file]);
    assert.equal(await sha256(data), c.sha256, c.file + ' is the file the manifest names');
    const { value, problems } = checkBriefAlone(data, c.file);
    assert.deepEqual(
      codes(problems),
      c.expect === 'pass' ? [] : [c.reason],
      `${c.file} (${c.why}): ${JSON.stringify(problems.slice(0, 2))}`,
    );
    assert.equal(value !== null, c.expect === 'pass', c.file);
  }
});

test('every hostile store.json and brief is refused with the stated reason, and the good ones are used', () => {
  const hostile = fixture('KnowledgeHostile');
  assert.ok(Object.keys(hostile.cases).length >= 45);
  for (const [name, c] of Object.entries(hostile.cases)) {
    const data = bytes(hostile.files[name]),
      { value, problems } = c.kind === 'store' ? checkStore(data) : checkBriefAlone(data, name);
    assert.deepEqual(
      codes(problems),
      c.expect === 'ok' ? [] : [c.expect],
      `${name}: ${JSON.stringify(problems.slice(0, 2))}`,
    );
    assert.equal(value !== null, c.expect === 'ok', name);
  }
});

test('a whole good output reads: the store, every items file by its hash, every brief by its hash', async () => {
  const dist = fixture('KnowledgeDist').files,
    store = checkStore(bytes(dist['store.json']));
  assert.deepEqual(store.problems, []);
  assert.equal(store.value.sources.length, 5);
  let briefs = 0;
  for (const listing of store.value.sources) {
    if (!listing.items_file) continue;
    const items = await checkItems(bytes(dist[listing.items_file.path]), listing, store.value.topics);
    assert.deepEqual(items.problems, [], listing.id);
    for (const item of items.value.items) {
      assert.ok(item.brief, 'every listed item names a brief');
      const brief = await checkBrief(bytes(dist[item.brief.path]), listing, item, store.value.topics);
      assert.deepEqual(brief.problems, [], item.brief.path);
      assert.equal(brief.value.title, item.title);
      briefs++;
    }
  }
  assert.ok(briefs >= 6);
});

test('a file that did not arrive intact, or is not the one the index named, is refused', async () => {
  const dist = fixture('KnowledgeDist').files,
    store = checkStore(bytes(dist['store.json'])).value,
    listing = store.sources.find((s) => s.id === 'harbor-voices'),
    other = store.sources.find((s) => s.id !== 'harbor-voices' && s.items_file),
    good = bytes(dist[listing.items_file.path]);
  const flipped = good.slice();
  flipped[flipped.length - 3] ^= 1;
  assert.deepEqual(codes((await checkItems(flipped, listing, store.topics)).problems), ['hash_mismatch']);
  const longer = new Uint8Array([...good, 10]);
  assert.deepEqual(codes((await checkItems(longer, listing, store.topics)).problems), ['size_mismatch']);
  // Another source's file under this listing's promise: the bytes are not the promised ones.
  const swapped = await checkItems(bytes(dist[other.items_file.path]), listing, store.topics);
  assert.equal(swapped.value, null);
  // The right bytes for a listing that lies about whose they are.
  const lying = { ...other, items_file: listing.items_file, item_count: listing.item_count };
  assert.ok(codes((await checkItems(good, lying, store.topics)).problems).includes('identity_mismatch'));

  const items = (await checkItems(good, listing, store.topics)).value,
    item = items.items[0],
    brief = bytes(dist[item.brief.path]);
  const changed = brief.slice();
  changed[10] ^= 1;
  assert.deepEqual(codes((await checkBrief(changed, listing, item, store.topics)).problems), [
    'hash_mismatch',
  ]);
  const elsewhere = items.items[1];
  const wrong = await checkBrief(brief, listing, { ...elsewhere, brief: item.brief }, store.topics);
  assert.deepEqual(codes(wrong.problems), ['identity_mismatch']);
  assert.equal(wrong.value, null);
});

test('strict JSON refuses what a loose reader lets through', () => {
  assert.deepEqual(strictJSON(text('{"a":1,"b":{"a":2}}')).value, { a: 1, b: { a: 2 } });
  assert.match(strictJSON(text('{"a":1,"a":2}')).error, /written twice/);
  assert.match(
    strictJSON(text('{"a":{"k":1,"\\u006b":2}}')).error,
    /written twice/,
    'an escaped spelling is the same key',
  );
  assert.deepEqual(strictJSON(text('[{"a":1},{"a":2},"a,{\\"a\\":1"]')).value.length, 3);
  assert.match(strictJSON(text('{"n":1e999}')).error, /too large/);
  assert.match(strictJSON(text('{"n":NaN}')).error, /does not parse/);
  assert.match(strictJSON(text('\ufeff{}')).error, /byte order mark/);
  assert.match(strictJSON(new Uint8Array([0x7b, 0x22, 0xff, 0x22, 0x3a, 0x31, 0x7d])).error, /UTF-8/);
  assert.match(strictJSON(text('{"a":1,}')).error, /does not parse/);
});

test('text and addresses follow the catalog’s rules', () => {
  for (const good of ['Plain words.', 'Café, naïve, 42%', 'A < B and C > D'])
    assert.equal(textReason(good), null, good);
  for (const [bad, why] of [
    ['a\nb', 'control_character'],
    ['turned\u202earound', 'control_character'],
    ['<b>bold</b>', 'html'],
    ['see https://example.org', 'url'],
    ['see www.example.org', 'url'],
    ['mailto:someone', 'url'],
    [' leading', 'spacing'],
    ['two  spaces', 'spacing'],
  ])
    assert.equal(textReason(bad), why, bad);
  for (const good of [
    'https://news.example.org/',
    'https://a.example.org/path?x=1',
    'https://xn--caf-dma.org/a',
  ])
    assert.equal(catalogAddress(good), true, good);
  for (const bad of [
    'http://news.example.org/',
    'https://news.example.org',
    'https://News.Example.org/',
    'https://news.example.org:443/',
    'https://news.example.org:8443/',
    'https://user@news.example.org/',
    'https://news.example.org/#top',
    'https://news.example.org/?',
    'https://localhost/',
    'https://10.0.0.5/',
    'https://127.0.0.1/',
    'https://printer.local/',
    'https://host.internal/',
    'https://nodots/',
    'https://news.example.org/a b',
    'https://news.example.org/\\x',
    'javascript:alert(1)',
    'https://' + 'a'.repeat(2000) + '.org/',
    null,
  ])
    assert.equal(catalogAddress(bad), false, String(bad).slice(0, 40));
  assert.equal(refusal('hash_mismatch'), 'This item did not arrive intact. It will be tried again.');
  assert.equal(refusal('text_rule'), 'This item was refused: not in the expected form.');
});

test('the page and both gateways allow the catalog’s address, and a request goes to the catalog’s own repository', () => {
  const origin = new URL(catalogBase).origin,
    html = readFileSync(new URL('../index.html', import.meta.url), 'utf8'),
    contract = JSON.parse(readFileSync(new URL('../server/contract.json', import.meta.url), 'utf8'));
  assert.ok(contract.headers['Content-Security-Policy'].includes(' ' + origin));
  assert.ok(html.includes(' ' + origin));
  assert.equal(catalogRepository(), 'gptkiosk/pea-knowledge-processor');
  assert.equal(catalogRepository('https://someone.github.io/their-catalog/'), 'someone/their-catalog');
  for (const other of [
    'https://example.org/catalog/',
    'https://someone.github.io/',
    'http://someone.github.io/x/',
    null,
  ])
    assert.equal(catalogRepository(other), null, String(other));

  const made = requestAddress(
    {
      name: '  Synthetic   Show ',
      feed: 'https://Feeds.Example.org/show.xml#latest',
      notes: 'On each page.',
    },
    { base: 'https://someone.github.io/their-catalog/' },
  );
  const url = new URL(made.url);
  assert.equal(url.origin + url.pathname, 'https://github.com/someone/their-catalog/issues/new');
  assert.equal(url.searchParams.get('show_name'), 'Synthetic Show');
  assert.equal(url.searchParams.get('feed_url'), 'https://feeds.example.org/show.xml');
  assert.equal(url.searchParams.has('website_url'), false);
  for (const [bad, why] of [
    [{ name: 'x', feed: 'https://feeds.example.org/a' }, /2 to 120/],
    [{ name: 'Show', feed: 'ftp://feeds.example.org/a' }, /public https/],
    [{ name: 'Show', site: 'https://localhost/' }, /public https/],
    [{ name: 'Show' }, /feed address or its website/],
    [{ name: 'Show', site: 'https://example.org/', notes: 'n'.repeat(601) }, /600 characters/],
    [{ name: 'Turned' + String.fromCharCode(0x202e) + 'round', site: 'https://example.org/' }, /2 to 120/],
  ])
    assert.match(requestAddress(bad).error, why, JSON.stringify(bad).slice(0, 60));
  assert.match(
    requestAddress(
      { name: 'Show', site: 'https://example.org/', notes: 'SECRET' },
      { secret: (t) => t.includes('SECRET') },
    ).error,
    /password or key/,
  );
  assert.match(
    requestAddress({ name: 'Show', site: 'https://example.org/' }, { base: 'https://example.org/' }).error,
    /where requests go/,
  );
});
