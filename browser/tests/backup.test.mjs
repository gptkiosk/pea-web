import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  backupLimits,
  describeBackup,
  describeRestore,
  describeFull,
  describeKeys,
  fullFormat,
  gatherKeys,
  keyNames,
  gatherBackup,
  gatherSettings,
  openBackup,
  openFull,
  planRestore,
  planSettings,
  sealBackup,
  sealFull,
  travellingSettings,
  validBackup,
  validFull,
} from '../backup.mjs';
import { introductionLimits } from '../memory.mjs';

const blank = Object.fromEntries(Object.keys(introductionLimits).map((k) => [k, '']));
const now = Date.parse('2026-11-16T12:00:00');
const day = (offset) => {
  const d = new Date(now + offset * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const todo = (title, over = {}) => ({
  id:
    'todo-' +
    title
      .toLowerCase()
      .replace(/[^a-z]/g, '')
      .padEnd(10, 'x'),
  profile: 'personal',
  title,
  due: null,
  remind: false,
  done: false,
  created: 5,
  completed: null,
  ...over,
});
const memory = (text, quote, over = {}) => ({
  id: 'mem-' + text.length,
  profile: 'personal',
  text,
  source: { threadID: 'thread-0000001', messageID: 'message-000001', quote },
  created: 5,
  expires: null,
  ...over,
});
const card = (topic, text) => ({ id: 'card-1', topic, tags: ['home'], text });
const deck = (title, profile = 'personal', point = 'A point') => ({
  id: 'deck-abcdef123456',
  profile,
  title,
  brief: 'For the team.',
  changed: 9,
  slides: ['One', 'Two', 'Three'].map((t) => ({ title: t, purpose: 'Why.', bullets: [point], notes: '' })),
});
const here = (over = {}) =>
  gatherBackup({
    profile: 'personal',
    introduction: blank,
    memories: [],
    todos: [],
    cards: [],
    days: [],
    decks: [],
    now,
    ...over,
  });

test('gathering keeps one profile and leaves ids, switches and the other profile behind', () => {
  const content = here({
    introduction: {
      ownerName: 'Sam',
      assistantName: 'Pea',
      hometown: '',
      interests: '',
      relationships: '',
      goals: '',
      persona: '',
    },
    memories: [memory('Likes tea.', 'I like tea'), memory('Work fact.', 'at work', { profile: 'work' })],
    todos: [todo('Buy milk'), todo('Work item', { profile: 'work' })],
    cards: [card('Home', 'PEA grew up on a steep street by the river.')],
    days: [{ day: day(0), text: 'Walked up to the viewpoint before the fog lifted.', from: 'week' }],
    decks: [deck('Mine'), deck('Theirs', 'work')],
  });
  assert.equal(validBackup(content), true);
  assert.equal(
    Object.keys(content.introduction).length,
    16,
    'the seven older answers are filled out to sixteen',
  );
  assert.deepEqual(content.memories, [
    { text: 'Likes tea.', quote: 'I like tea', created: 5, expires: null },
  ]);
  assert.deepEqual(
    content.todos.map((t) => Object.keys(t).join()),
    ['title,due,remind,done,created,completed'],
  );
  assert.deepEqual(
    content.decks.map((d) => d.title),
    ['Mine'],
  );
  assert.doesNotMatch(JSON.stringify(content), /"id"|"profile":"work"|threadID|changed/);
  const work = here({
    profile: 'work',
    cards: [card('Home', 'PEA grew up on a steep street by the river.')],
    days: [{ day: day(0), text: 'Walked up to the viewpoint before the fog lifted.', from: 'week' }],
  });
  assert.deepEqual([work.history, work.days], [[], []], 'the character belongs to Personal only');
  assert.throws(() => here({ todos: [todo('x'.repeat(121))] }), /cannot be put in a backup/);
});

test('combining only adds, keeps what is here, and reports differences', () => {
  const mine = here({
    introduction: { ...blank, ownerName: 'Sam', hobbies: 'Chess.' },
    memories: [memory('Likes tea.', 'I like tea')],
    todos: [todo('Buy milk'), todo('Call dentist', { due: now + 86400000 })],
    cards: [card('Home', 'PEA grew up on a steep street by the river.')],
    decks: [deck('Plan')],
  });
  const theirs = here({
    introduction: { ...blank, ownerName: 'Samantha', family: 'Two cats.' },
    memories: [memory('likes tea.', 'another quote'), memory('Visits Porto in spring.', 'we go to Porto')],
    todos: [todo('buy milk'), todo('Call dentist', { done: true, completed: 9 }), todo('Water plants')],
    cards: [
      card('home', 'A different account of PEA’s home street entirely.'),
      card('First job', 'PEA’s first job was sorting postcards by the river.'),
    ],
    decks: [deck('plan', 'personal', 'Another point'), deck('Kickoff')],
  });
  const plan = planRestore(mine, theirs, { now });
  assert.deepEqual(
    plan.introduction.changes.map((c) => c.field),
    ['family'],
    'a blank answer is filled; an answer already given is kept',
  );
  assert.equal(plan.introduction.next.ownerName, 'Sam');
  assert.deepEqual(
    plan.memories.add.map((m) => m.text),
    ['Visits Porto in spring.'],
  );
  assert.equal(plan.memories.same, 1);
  assert.deepEqual(
    plan.todos.add.map((t) => t.title),
    ['Water plants'],
  );
  assert.deepEqual([plan.todos.same, plan.todos.differ], [1, ['call dentist']]);
  assert.deepEqual(
    plan.history.add.map((c) => c.topic),
    ['First job'],
  );
  assert.deepEqual(plan.history.differ, ['home']);
  assert.deepEqual(
    plan.decks.add.map((d) => d.title),
    ['Kickoff'],
  );
  assert.deepEqual(plan.decks.differ, ['plan']);
  assert.equal(plan.nothing, false);
  const said = describeRestore(plan);
  assert.match(said, /Only additions are made\. Nothing already here is changed or removed\./);
  assert.match(said, /\+ family: Two cats\./);
  assert.match(said, /\+ Visits Porto in spring\. \(from: “we go to Porto”\)/);
  assert.match(said, /1 to-dos differ from yours and yours are kept \(call dentist\)/);
  assert.doesNotMatch(said, /Samantha/, 'an answer that would not change is not shown as a change');

  const again = planRestore(theirs, theirs, { now });
  assert.equal(again.nothing, true);
  assert.match(describeRestore(again), /Everything in this file is already here/);
});

test('room, expiry and the days PEA keeps limit what is added, and say so', () => {
  const full = here({
    todos: Array.from({ length: backupLimits.todos }, (_, i) =>
      todo('Item ' + i, { id: 'todo-item-' + String(i).padStart(4, '0') }),
    ),
  });
  const more = here({ todos: [todo('One more'), todo('Item 3')] });
  const plan = planRestore(full, more, { now });
  assert.deepEqual([plan.todos.add.length, plan.todos.noRoom, plan.todos.same], [0, 1, 1]);
  assert.match(describeRestore(plan), /1 to-dos left out because there is no room/);

  const memories = planRestore(
    here(),
    here({
      memories: [
        memory('Fresh.', 'q1'),
        memory('Stale.', 'q2', { created: 5, expires: now - 1 }),
        memory('Second.', 'q3'),
      ],
    }),
    { now, memoryRoom: 1 },
  );
  assert.deepEqual(
    memories.memories.add.map((m) => m.text),
    ['Fresh.'],
  );
  assert.deepEqual([memories.memories.skipped, memories.memories.noRoom], [{ expired: 1 }, 1]);

  const line = (offset, text, from = 'week') => ({ day: day(offset), text, from });
  const days = planRestore(
    here({
      days: [
        line(0, 'First thing PEA did was open the window wide.'),
        line(0, 'Second thing was coffee on the balcony.'),
        line(0, 'Third thing was a slow walk downhill.'),
      ],
    }),
    here({
      days: [
        line(0, 'A fourth line for a day that is already full.'),
        line(-60, 'Something from two months ago that PEA no longer keeps.'),
        line(1, 'Tomorrow PEA plans to visit the tile museum.'),
        line(0, 'first thing PEA did was open the window wide.'),
      ],
    }),
    { now },
  );
  assert.deepEqual(
    days.days.add.map((d) => d.day),
    [day(1)],
  );
  assert.equal(days.days.same, 1);
  assert.deepEqual(days.days.skipped, { 'day already full': 1, 'outside the days PEA keeps': 1 });
});

test('a file for the other profile is refused, and the description names what is left out', async () => {
  const work = here({ profile: 'work' });
  assert.throws(() => planRestore(here(), work, { now }), /for the other profile/);
  assert.throws(() => planRestore(here(), { ...here(), extra: 1 }, { now }), /not usable/);
  const said = describeBackup(
    here({ todos: [todo('Buy milk')], introduction: { ...blank, ownerName: 'Sam' } }),
  );
  assert.match(
    said,
    /1 interview answer, 0 memories, 1 to-do, 0 history cards, 0 day lines and 0 deck projects/,
  );
  assert.match(
    said,
    /Left out: chats, files, provider and service keys, connection tokens, permissions, sharing switches and the other profile/,
  );
  assert.match(said, /cannot recover it/);
  await assert.rejects(
    sealBackup({ ...here(), keys: {} }, 'synthetic passphrase'),
    /cannot be put in a backup/,
  );
});

import { bringInMemories, broughtInTitle, emptyLibrary, validLibrary } from '../memory.mjs';
test('brought-in memories cite the owner’s quoted words in a conversation named for what it is', () => {
  const items = [
    { text: 'Prefers tea.', quote: 'I always pick tea', created: 5, expires: null },
    { text: 'Visits Porto.', quote: 'we go to Porto in spring', created: 6, expires: 9e12 },
  ];
  const first = bringInMemories(emptyLibrary(), 'personal', items, 1000);
  assert.equal(validLibrary(first), true);
  assert.equal(first.threads.length, 1);
  assert.deepEqual(
    [
      first.threads[0].title,
      first.threads[0].profile,
      first.threads[0].messages.map((m) => [m.role, m.text]),
    ],
    [
      broughtInTitle,
      'personal',
      [
        ['user', 'I always pick tea'],
        ['user', 'we go to Porto in spring'],
      ],
    ],
  );
  assert.deepEqual(
    first.memories.map((m) => [m.profile, m.text, m.source.quote, m.expires]),
    [
      ['personal', 'Prefers tea.', 'I always pick tea', null],
      ['personal', 'Visits Porto.', 'we go to Porto in spring', 9e12],
    ],
  );
  // A second file reuses the same conversation, and another profile gets its own.
  const second = bringInMemories(
    first,
    'personal',
    [{ text: 'Third.', quote: 'a third thing', created: 7, expires: null }],
    2000,
  );
  assert.equal(second.threads.length, 1);
  assert.equal(second.threads[0].messages.length, 3);
  const work = bringInMemories(
    second,
    'work',
    [{ text: 'Work fact.', quote: 'at work', created: 8, expires: null }],
    3000,
  );
  assert.deepEqual(
    work.threads.map((t) => t.profile),
    ['personal', 'work'],
  );
  assert.equal(emptyLibrary().memories.length, 0, 'the library passed in is not changed');
  // A full library refuses the whole addition.
  const full = emptyLibrary();
  full.threads = Array.from({ length: 40 }, (_, i) => ({
    id: 'thread-' + String(i).padStart(6, '0'),
    profile: 'personal',
    surface: 'chat',
    title: 'T' + i,
    updated: 1,
    messages: [
      {
        id: 'message-' + String(i).padStart(6, '0'),
        role: 'user',
        text: 'x',
        at: 1,
        incomplete: false,
        preview: false,
      },
    ],
  }));
  assert.throws(() => bringInMemories(full, 'personal', items, 1000), /library holds 40 conversations/);
  assert.throws(() => bringInMemories(emptyLibrary(), 'blended', items, 1000), /Choose Work or Personal/);
});

// Everything in one file: settings by a fixed list of names, and both profiles.
const emptyProfile = (profile) => ({
  profile,
  made: now,
  introduction: { ...blank },
  memories: [],
  todos: [],
  history: [],
  days: [],
  decks: [],
});
const whole = (over = {}) => ({
  made: now,
  version: '0.1.0-rc.4.dev.68',
  settings: { 'pea-device-voice-v1': '{"rate":1.1}', 'pea-save-chats-v1': 'off' },
  profiles: {
    personal: { ...emptyProfile('personal'), introduction: { ...blank, ownerName: 'Synthetic Sam' } },
    work: emptyProfile('work'),
  },
  ...over,
});
const storageOf = (values) => ({ getItem: (name) => (Object.hasOwn(values, name) ? values[name] : null) });

test('only the listed settings travel, and never a credential or the connection token', () => {
  const names = travellingSettings.map(([name]) => name);
  assert.equal(new Set(names).size, names.length);
  for (const never of ['pea-local-token-v1', 'pea-curated-kept-v1', 'pea-open-threads-v1'])
    assert.ok(!names.includes(never), never + ' stays here');
  const found = gatherSettings(
    storageOf({
      'pea-device-voice-v1': '{"rate":1.1}',
      'pea-local-token-v1': 'synthetic-connection-token',
      'pea-connections-v1': '{"note":"sk-or-v1-' + 'a'.repeat(24) + '"}',
      'pea-weather-v1': 'x'.repeat(200001),
      'some-other-site-key': 'yes',
    }),
  );
  assert.deepEqual(found.settings, { 'pea-device-voice-v1': '{"rate":1.1}' });
  assert.equal(found.left.length, 2, 'a setting that looks like a key, or is too large, is left out and named');
  assert.deepEqual(gatherSettings({ getItem() { throw new Error('refused'); } }), { settings: {}, left: [] });
});

test('a whole backup holds exactly settings and both profiles, and anything else is refused', () => {
  assert.equal(validFull(whole()), true);
  for (const bad of [
    whole({ extra: 1 }),
    whole({ version: 'not a version!' }),
    whole({ settings: { 'pea-local-token-v1': 'synthetic-connection-token' } }),
    whole({ settings: { 'pea-device-voice-v1': 'ghp_' + 'a'.repeat(24) } }),
    whole({ settings: { 'pea-device-voice-v1': '' } }),
    whole({ settings: { 'pea-device-voice-v1': 7 } }),
    whole({ settings: [] }),
    whole({ profiles: { personal: emptyProfile('personal') } }),
    whole({ profiles: { personal: emptyProfile('work'), work: emptyProfile('work') } }),
    whole({ profiles: { personal: emptyProfile('personal'), work: { ...emptyProfile('work'), extra: 1 } } }),
    null,
  ])
    assert.equal(validFull(bad), false, JSON.stringify(bad)?.slice(0, 90));
});

test('a whole backup opens only with its passphrase and is not a profile file', async () => {
  const pass = 'synthetic whole passphrase';
  const file = await sealFull(whole(), pass);
  assert.equal(JSON.parse(file).format, fullFormat);
  assert.ok(!file.includes('Synthetic Sam') && !file.includes('pea-device-voice'), 'nothing is readable');
  assert.deepEqual(await openFull(file, pass), whole());
  await assert.rejects(openFull(file, 'another synthetic passphrase'), /Could not verify/);
  await assert.rejects(openBackup(file, pass), /Could not verify/, 'not accepted as a profile file');
  await assert.rejects(
    openFull(await sealBackup(emptyProfile('personal'), pass), pass),
    /Could not verify/,
    'a profile file is not accepted as a whole backup',
  );
  // The label is part of what is sealed, so relabelling a file does not open it.
  const relabelled = JSON.stringify({ ...JSON.parse(await sealBackup(emptyProfile('personal'), pass)), format: fullFormat });
  await assert.rejects(openFull(relabelled, pass), /Could not verify/);
  await assert.rejects(sealFull(whole({ extra: 1 }), pass), /cannot be put in a backup/);
  await assert.rejects(sealFull(whole(), 'short'), /12–256/);
});

test('restoring settings names what is replaced and added, and writes only what differs', () => {
  const plan = planSettings(
    { 'pea-device-voice-v1': '{"rate":1}', 'pea-save-chats-v1': 'off', 'pea-headlines-v1': '[]' },
    { 'pea-device-voice-v1': '{"rate":1.1}', 'pea-save-chats-v1': 'off', 'pea-weather-v1': '{"unit":"celsius"}' },
  );
  assert.deepEqual(plan.replace, ['Device voice and speed']);
  assert.deepEqual(plan.add, ['Weather place and units']);
  assert.equal(plan.same, 1);
  assert.deepEqual(plan.write, { 'pea-device-voice-v1': '{"rate":1.1}', 'pea-weather-v1': '{"unit":"celsius"}' });
  const said = describeFull(whole(), ['Headline feeds']);
  assert.match(said, /Settings \(2\):/);
  assert.match(said, /Left out because they cannot travel: Headline feeds\./);
  assert.match(said, /Left out: provider and service keys, the connection token, chats/);
  assert.match(said, /Personal: 1 interview answer, 0 memories/);
});

// Keys travel only in a file the owner ticked the box for.
const routerKey = 'sk-or-v1-' + 'a'.repeat(24);
test('keys travel only by a fixed list of names, in a file made for them, under a longer passphrase', async () => {
  assert.deepEqual(
    gatherKeys({ openrouter: routerKey, github: '', 'search-brave': 'b'.repeat(20), 'voice-fish': 'has a space', token: 'x'.repeat(20), local: 'y'.repeat(43) }),
    { openrouter: routerKey, 'search-brave': 'b'.repeat(20) },
  );
  assert.deepEqual(gatherKeys(null), {});
  const withKeys = whole({ keys: { openrouter: routerKey, github: 'ghp_' + 'c'.repeat(30) } });
  assert.equal(validFull(withKeys), true);
  for (const bad of [
    whole({ keys: {} }),
    whole({ keys: { 'connection-token': 'x'.repeat(43) } }),
    whole({ keys: { openrouter: 'short' } }),
    whole({ keys: { openrouter: 'a key with spaces in it' } }),
    whole({ keys: { openrouter: 7 } }),
    whole({ keys: [routerKey] }),
    // A key is never accepted among the settings or a profile's contents.
    whole({ settings: { 'pea-connections-v1': routerKey } }),
  ])
    assert.equal(validFull(bad), false, JSON.stringify(bad).slice(0, 90));
  await assert.rejects(sealFull(withKeys, 'twelve chars'), /needs a passphrase of 16 or more characters/);
  const pass = 'a synthetic long passphrase';
  const file = await sealFull(withKeys, pass);
  assert.ok(!file.includes(routerKey) && !file.includes('ghp_'), 'no key is readable in the file');
  assert.deepEqual((await openFull(file, pass)).keys, withKeys.keys);
  // A file without keys is still made under the ordinary passphrase rule and has no keys field.
  assert.ok(!Object.hasOwn(await openFull(await sealFull(whole(), 'twelve chars'), 'twelve chars'), 'keys'));
});

test('the reviews name the keys, never show them, and say what having the file means', () => {
  const keys = { github: 'ghp_' + 'c'.repeat(30), openrouter: routerKey };
  assert.deepEqual(keyNames(keys), ['OpenRouter key', 'GitHub token']);
  const said = describeFull(whole({ keys }));
  assert.match(said, /Keys in this file \(2\): OpenRouter key, GitHub token\./);
  assert.match(said, /Anyone who has this file and its passphrase can use these keys/);
  assert.match(said, /Left out: the connection token, your Google sign-in, chats/);
  assert.doesNotMatch(describeFull(whole()), /Keys in this file/);
  for (const text of [said, describeKeys(keys), describeKeys(keys, true)])
    assert.ok(!text.includes(routerKey) && !text.includes('ghp_'), 'no key is shown');
  assert.match(describeKeys(keys), /wait in their fields for you to press Connect/);
  assert.match(describeKeys(keys, true), /After reloading, restore from the same file again/);
});
