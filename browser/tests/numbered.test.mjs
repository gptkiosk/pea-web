import test from 'node:test';
import assert from 'node:assert/strict';
import { numberedCommand as command, numberedMove, pointsGuidance, replyPoints } from '../numbered.mjs';

test('the owner’s words name a move by fixed rules, however they are phrased', () => {
  for (const [said, expected] of [
    ['list sources', { kind: 'groups' }],
    ['List feeds.', { kind: 'groups' }],
    ['back to feeds', { kind: 'groups' }],
    ['my feeds', { kind: 'groups' }],
    ['can you give me a list of the feed names to choose from', { kind: 'groups' }],
    ['Feed 1', { kind: 'group', group: 1 }],
    ['feed two', { kind: 'group', group: 2 }],
    ['headlines for feed 1', { kind: 'group', group: 1 }],
    ['headlines from feed 3', { kind: 'group', group: 3 }],
    ['Any list the headlines for the first feed', { kind: 'group', group: 1 }],
    ['back to headlines', { kind: 'items' }],
    ['list headlines', { kind: 'items' }],
    ['1.2', { kind: 'item', group: 1, item: 2 }],
    ['1 . 2', { kind: 'item', group: 1, item: 2 }],
    ['one point two', { kind: 'item', group: 1, item: 2 }],
    ['feed 1 headline 2', { kind: 'item', group: 1, item: 2 }],
    ['feed two headline three', { kind: 'item', group: 2, item: 3 }],
    ['headline 2', { kind: 'item', group: null, item: 2 }],
    ['the third headline', { kind: 'item', group: null, item: 3 }],
    ['next headline', { kind: 'item-step', step: 1 }],
    ['previous headline', { kind: 'item-step', step: -1 }],
    ['latest headline', { kind: 'item-latest' }],
    ['read it', { kind: 'read' }],
    ['list points', { kind: 'points' }],
    ['point 2', { kind: 'point', point: 2, act: 'focus' }],
    ['Dig into point two, please.', { kind: 'point', point: 2, act: 'focus' }],
    ['search point 2', { kind: 'point', point: 2, act: 'search' }],
    ['fact check point 2', { kind: 'point', point: 2, act: 'search' }],
    ['next point', { kind: 'point-step', step: 1 }],
    ['previous point', { kind: 'point-step', step: -1 }],
  ])
    assert.deepEqual(command(said), expected, said);
  for (const said of [
    'What shows should I watch tonight?',
    // Shows and episodes belong to Curated sources (shownav.mjs), not to feeds.
    'list shows',
    'show 1',
    'episode 2',
    'tell me about the first podcast ever made',
    'I have 2 points to make',
    'the point is moot',
    'show me the money',
    'show sources',
    'shows',
    '2.5 percent of people',
    '1.2 million dollars',
    'next',
    '2',
    'read the news',
    'point',
    '',
    'list feeds '.repeat(30),
  ])
    assert.equal(command(said), null, said);
  assert.equal(command(null), null);
  assert.match(pointsGuidance, /number them/);
});

test('a reply’s points are its numbered or bulleted lines, cleaned, and never from a code block', () => {
  assert.deepEqual(
    replyPoints('Here:\n1. **Alpha** thing\n2) Beta `x`\n- Gamma\n```\n1. not this\n2. nor this\n```\nDone.'),
    ['Alpha thing', 'Beta x', 'Gamma'],
  );
  assert.deepEqual(replyPoints('Only one:\n1. Alone'), [], 'one line is not a list');
  assert.deepEqual(replyPoints('No list here. 1. inline does not count.'), []);
  assert.equal(replyPoints(Array.from({ length: 30 }, (_, i) => `${i + 1}. p${i}`).join('\n')).length, 12);
  const long = replyPoints(`1. ${'x'.repeat(500)}\n2. turned‮around`);
  assert.equal([...long[0]].length, 240);
  assert.equal(long[1], 'turned around');
  assert.deepEqual(replyPoints(undefined), []);
});

const groups = [
  { name: 'Synthetic Gazette', items: [{ title: 'Rain expected' }, { title: 'Bridge reopens' }] },
  { name: 'Fixture Weekly', items: [] },
];
const points = ['Alpha', 'Beta', 'Gamma'];
const move = (said, at) => numberedMove(command(said), { groups, points, at });

test('moves walk feeds, headlines and points, and say plainly when a number is not there', () => {
  let m = move('list feeds');
  assert.equal(m.level, 'groups');
  assert.deepEqual(
    m.rows.map((r) => [r.label, r.text]),
    [
      ['1', 'Synthetic Gazette'],
      ['2', 'Fixture Weekly'],
    ],
  );
  assert.equal(m.say, 'Feed 1: Synthetic Gazette. Feed 2: Fixture Weekly.');
  assert.deepEqual(m.rows[0].go, { kind: 'group', group: 1 });

  m = move('feed 1', m.at);
  assert.equal(m.title, 'Feed 1: Synthetic Gazette');
  assert.deepEqual(
    m.rows.map((r) => r.label),
    ['1.1', '1.2'],
  );
  assert.equal(m.say, 'Feed 1: Synthetic Gazette. 1 point 1: Rain expected. 1 point 2: Bridge reopens.');

  m = move('headline 2', m.at);
  assert.equal(m.level, 'item');
  assert.deepEqual(m.open, { group: 0, item: 1 });
  assert.match(m.say, /^Headline 1\.2 from Synthetic Gazette: Bridge reopens\./);
  assert.equal(m.send, null, 'a headline is never sent to a model');

  const read = move('read it', m.at);
  assert.equal(read.read, true);
  assert.deepEqual(read.open, { group: 0, item: 1 });

  m = move('previous headline', m.at);
  assert.deepEqual(m.open, { group: 0, item: 0 });
  m = move('previous headline', m.at);
  assert.equal(m.level, 'none');
  assert.match(m.say, /^There is no headline 1\.0\. Feed 1 has 2\.$/);
  assert.equal(move('latest headline', m.at).open.item, 0);
  assert.equal(move('back to headlines', m.at).level, 'items');

  assert.match(move('2.1').say, /^There is no headline 2\.1\. Feed 2 has 0\.$/);
  assert.match(move('feed 2').say, /It has no headlines loaded right now\.$/);
  assert.match(move('feed 9').say, /^There is no feed 9\. You have 2\.$/);
  assert.match(move('headline 2').say, /^Say which feed first/);
  assert.match(move('read it').say, /^Open a headline first/);
  assert.match(numberedMove(command('list feeds'), {}).say, /^You have no feeds yet/);

  m = move('list points');
  assert.deepEqual(
    m.rows.map((r) => [r.label, r.text]),
    [
      ['P1', 'Alpha'],
      ['P2', 'Beta'],
      ['P3', 'Gamma'],
    ],
  );
  m = move('point 2');
  assert.equal(m.send, 'Tell me more about point 2 of your last reply: “Beta”');
  assert.equal(command(m.send), null, 'what is sent is not itself a command');
  assert.equal(move('next point', m.at).send, 'Tell me more about point 3 of your last reply: “Gamma”');
  assert.match(move('next point', { point: 2 }).say, /^There is no point 4\. The last reply has 3\.$/);
  assert.equal(move('next point').send, 'Tell me more about point 1 of your last reply: “Alpha”');
  const searched = move('search point 2');
  assert.equal(searched.send, null);
  assert.match(searched.say, /cannot search the web, so point 2 was not searched/);
  assert.match(numberedMove(command('point 1'), { groups }).say, /^The last reply has no list of points\.$/);

  const many = [{ name: 'Big', items: Array.from({ length: 12 }, (_, i) => ({ title: 'T' + i })) }];
  assert.match(
    numberedMove(command('feed 1'), { groups: many }).say,
    /1 point 8: T7\. And 4 more on screen\.$/,
  );
});

test('feeds, headlines and points offer their next moves as buttons', () => {
  const labels = (said, at) => move(said, at).footer.map((b) => b.label);
  assert.deepEqual(labels('list feeds'), []);
  assert.deepEqual(labels('feed 1'), ['Back to feeds']);
  assert.deepEqual(labels('1.1'), ['Next headline', 'Back to headlines', 'Feeds']);
  assert.deepEqual(labels('1.2'), ['Next headline', 'Previous headline', 'Back to headlines', 'Feeds']);
  assert.deepEqual(labels('point 2'), ['Next point', 'Previous point', 'List points']);
  assert.deepEqual(labels('point 1'), ['Next point', 'List points']);
  assert.deepEqual(labels('feed 9'), ['Feeds', 'List points']);
  assert.deepEqual(labels('next headline', { group: 0, item: 1, point: null }), [
    'Back to headlines',
    'Feeds',
    'List points',
  ]);
  // Each button carries a command the mover understands.
  const item = move('1.1');
  for (const b of item.footer)
    assert.notEqual(numberedMove(b.go, { groups, points, at: item.at }).say, '', b.label);
});
