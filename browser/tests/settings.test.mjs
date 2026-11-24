// The places in PEA's settings: the fixed list, the owner's words that name one, the messages of
// PEA's own that name one, the address that names one, and the one shape a model may offer.
// Run with: node --test browser/tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ownerSettings,
  placeInAddress,
  placeInMessage,
  settingsAddress,
  settingsGuidance,
  settingsOpenLine,
  settingsPlace,
  settingsPlaces,
} from '../settings.mjs';
import { navigationProposals, relabelNavigation, visibleReply } from '../actions.mjs';

const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const nav = (value) => '```pea-nav\n' + JSON.stringify(value) + '\n```';

test('every place names a panel and a section that the page really has', () => {
  for (const [id, place] of Object.entries(settingsPlaces)) {
    assert.match(id, /^[a-z-]{1,40}$/);
    assert.ok(place.title && place.holds, id);
    assert.ok(place.dialog || place.tab, id + ' goes somewhere');
    if (place.dialog) assert.ok(page.includes(`<dialog id="${place.dialog}"`), id + ' panel');
    if (place.group) assert.ok(page.includes(` id="${place.group}"`), id + ' section');
    assert.doesNotMatch(place.holds, /[\n`]/);
  }
  assert.equal(settingsPlace('web-search').title, 'Web search');
  for (const wrong of ['toString', '__proto__', 'constructor', '', null, 7, 'Web search'])
    assert.equal(settingsPlace(wrong), null);
});

test('the owner’s own words go to a place only when they plainly ask for one', () => {
  for (const [said, place] of [
    ['open web search settings', 'web-search'],
    ['Open the Web search settings.', 'web-search'],
    ['take me to the Google setup', 'google'],
    ['show me my gmail settings', 'google'],
    ['open calendar settings', 'google'],
    ['open connections', 'connections'],
    ['open settings', 'connections'],
    ['please open the local model section', 'local-model'],
    ['where do I enter my Brave key?', 'web-search'],
    ['where do I put the connection token', 'local-model'],
    ['how do I connect Google?', 'google'],
    ['how do I set up web search', 'web-search'],
    ['how can I change the chat model', 'models'],
    ['help me set up voice providers', 'voices'],
    ['open the settings for web search', 'web-search'],
    ['go to privacy', 'privacy'],
    ['open PEA’s history settings', 'her-history'],
    ['open backup settings', 'backup'],
    ['show podcasts settings', 'curated-sources'],
    ['open elevenlabs settings', 'voices'],
  ])
    assert.equal(ownerSettings(said), place, said);
  for (const said of [
    'open my calendar',
    'open calendar',
    'show me my mail',
    'open google',
    'search for tide tables in Lisbon',
    'where is my passport',
    'where do I put the recycling',
    'how do I connect with my sister',
    'how do I set up a tent',
    'open today',
    'tell me about web search settings in general',
    'open web search settings and enter the key sk-abc',
    'x'.repeat(200),
    '',
    null,
  ])
    assert.equal(ownerSettings(said), null, String(said));
});

test('a message of PEA’s own that names a place can carry the way there', () => {
  for (const [said, place] of [
    [
      'Web search needs your own Brave Search or Browserbase key. Enter one in Connections → Web search.',
      'web-search',
    ],
    [
      'Headlines need your PEA server. Connect it in Connections → Local model, then try again.',
      'local-model',
    ],
    [
      'Reading a page needs your PEA server. Connect it in Connections → Local model, or leave the address empty.',
      'local-model',
    ],
    [
      'Calendar changes are not connected for this profile. Connect them in Connections → Google, or use your calendar app.',
      'google',
    ],
    ['Choose a chat model in Connections first.', 'models'],
    ['Choose your PEA folder in Connections first.', 'google'],
    ['The local server did not accept the connection token. Reconnect it in Connections.', 'connections'],
    ['Brave Search rejected your key. Check it in Connections.', 'connections'],
    [
      'You follow no shows with briefs in this tab. Follow one in Curated sources on Today, or press Refresh there.',
      'curated-sources',
    ],
    [
      'Start a fresh conversation from Conversations & memory. This thread has reached 200 messages.',
      'memory',
    ],
    ['Connect it in Connections → Somewhere Unknown.', 'connections'],
  ])
    assert.equal(placeInMessage(said), place, said);
  for (const said of ['Finish the current request first.', 'Opened Chat.', 'Connections are fine.', '', null])
    assert.equal(placeInMessage(said), null, String(said));
});

test('an address names a place and nothing else', () => {
  assert.equal(settingsAddress('web-search'), '#settings/web-search');
  assert.equal(settingsAddress('nowhere'), null);
  for (const id of Object.keys(settingsPlaces)) assert.equal(placeInAddress(settingsAddress(id)), id);
  assert.equal(placeInAddress('settings/google'), 'google');
  for (const wrong of [
    '#settings/',
    '#settings/nowhere',
    '#settings/google/extra',
    '#settings/google?key=abc',
    '#settings/Google',
    '#settings/__proto__',
    '#today',
    '#settings/google#x',
    '',
    null,
  ])
    assert.equal(placeInAddress(wrong), null, String(wrong));
});

test('a model may only offer a button for a place on the list, in one exact shape', () => {
  assert.deepEqual(navigationProposals('Here.\n' + nav({ op: 'settings', place: 'web-search' })), [
    { place: 'web-search' },
  ]);
  assert.deepEqual(navigationProposals(nav({ op: 'navigate', tab: 'today' })), [{ tab: 'today' }]);
  for (const wrong of [
    { op: 'settings', place: 'nowhere' },
    { op: 'settings', place: 'toString' },
    { op: 'settings', place: 'web-search', value: 'sk-abc' },
    { op: 'settings', place: 'web-search', tab: 'today' },
    { op: 'navigate', place: 'web-search' },
    { op: 'settings', place: ['web-search'] },
    { op: 'settings' },
    { op: 'settings', tab: 'today' },
  ])
    assert.deepEqual(navigationProposals(nav(wrong)), [], JSON.stringify(wrong));
  // Never with another action block in the same reply.
  assert.deepEqual(
    navigationProposals(
      nav({ op: 'settings', place: 'google' }) + '\n' + nav({ op: 'navigate', tab: 'chat' }),
    ),
    [],
  );
});

test('the model is told the places by name, and what is open beside the chat', () => {
  for (const id of Object.keys(settingsPlaces)) assert.ok(settingsGuidance.includes(id + ' ('), id);
  assert.match(settingsGuidance, /never say you opened it/);
  assert.match(settingsGuidance, /Never ask the owner to paste a key, token or password into this chat/);
  assert.match(settingsOpenLine('google'), /^The owner has PEA’s “Google” settings open beside this chat\./);
  assert.match(settingsOpenLine('google'), /you cannot see or change it/);
  assert.equal(settingsOpenLine('nowhere'), '');
});

test('a navigation block a model labelled json, or did not label, is still the button it was meant to be', () => {
  const said = (label, value) =>
    'It is under connections.\n\n```' + label + '\n' + JSON.stringify(value) + '\n```\n\nJust click it.';
  for (const label of ['json', 'JSON', '']) {
    const raw = said(label, { op: 'settings', place: 'connections' });
    assert.deepEqual(navigationProposals(raw), [{ place: 'connections' }], label || 'no label');
    assert.equal(
      visibleReply(raw),
      'It is under connections.\n\n\n\nJust click it.',
      'and it is not shown as code',
    );
  }
  assert.deepEqual(navigationProposals(said('json', { op: 'navigate', tab: 'today' })), [{ tab: 'today' }]);
  // Anything that is not exactly a navigation shape stays what it was: code the owner can read.
  for (const value of [
    { op: 'settings', place: 'nowhere' },
    { op: 'settings', place: 'google', value: 'x' },
    { op: 'story', title: 'x' },
    { op: 'read', url: 'https://example.org/' },
    [{ op: 'settings', place: 'google' }],
  ]) {
    const raw = said('json', value);
    assert.deepEqual(navigationProposals(raw), [], JSON.stringify(value));
    assert.equal(relabelNavigation(raw), raw);
    assert.match(visibleReply(raw), /```json/);
  }
  // Two such blocks, a block in another language, or a real PEA block beside it: left alone.
  const two =
    said('json', { op: 'settings', place: 'google' }) + said('json', { op: 'navigate', tab: 'chat' });
  assert.deepEqual(navigationProposals(two), []);
  assert.deepEqual(navigationProposals(said('js', { op: 'settings', place: 'google' })), []);
  const beside =
    said('json', { op: 'settings', place: 'google' }) +
    '\n```pea-nav\n' +
    JSON.stringify({ op: 'navigate', tab: 'chat' }) +
    '\n```';
  assert.deepEqual(navigationProposals(beside), [{ tab: 'chat' }]);
  assert.match(visibleReply(beside), /```json/);
  assert.equal(relabelNavigation(null), null);
  assert.match(settingsGuidance, /followed by pea-nav, never json/);
});

test('the assistant is called PEA in what the owner reads and what a model is told, never “her” or “she”', async () => {
  const { readFile, readdir } = await import('node:fs/promises');
  const root = new URL('../', import.meta.url);
  const names = ['index.html', ...(await readdir(root)).filter((n) => n.endsWith('.mjs'))];
  // Not wording: a list of common words, a published schema, the owner's own search words, a
  // pattern that reads a model's line, and two addresses kept so saved links still open.
  const skipFile = new Set(['transcript.mjs', 'knowledge-schema.mjs']);
  const skipLine = /^\s*(\/\/|\*)|also: \[|sourdough\|bread|'her-(history|days)'/;
  const found = [];
  for (const name of names) {
    if (skipFile.has(name)) continue;
    (await readFile(new URL(name, root), 'utf8')).split('\n').forEach((line, i) => {
      if (skipLine.test(line)) return;
      // A written line break (backslash n) is not part of the word after it.
      const code = line.replace(/\s\/\/ .*$/, '').replace(/\\n/g, '  ');
      for (const m of code.matchAll(/\b(her|hers|herself|she)\b/gi))
        found.push(`${name}:${i + 1} …${code.slice(Math.max(0, m.index - 30), m.index + 30)}…`);
    });
  }
  assert.deepEqual(found, []);
});
