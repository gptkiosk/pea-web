// What PEA did for a reply: the steps are built from what the page itself sent and timed, and a
// trail ends once. Run with: node --test browser/tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activityIcons,
  contextSteps,
  endTrail,
  firstWords,
  startTrail,
  took,
  trailActive,
  trailRows,
  trailSummary,
} from '../activity.mjs';

const texts = (rows) => rows.map((r) => r.text);

test('only what was sent is listed, with counts, and every request ends with its approval and where it went', () => {
  assert.deepEqual(texts(contextSteps({ model: { name: 'Synthetic One', local: true }, reviewed: true })), [
    'You reviewed what is shared',
    'Sent to Synthetic One on your own server',
  ]);
  assert.deepEqual(
    texts(
      contextSteps({
        model: { name: 'Synthetic Two', local: false },
        reviewed: false,
        introduction: true,
        memories: 1,
        file: 'notes.txt',
        calendar: 2,
        ownEvents: 1,
        mail: 3,
        todos: true,
        page: 'example.test',
        canon: 2,
        days: true,
        history: 4,
      }),
    ),
    [
      'Included your introduction',
      'Recalled 1 memory of yours',
      'Included an excerpt of notes.txt',
      'Included 3 calendar events',
      'Included 3 items from your mail snapshot',
      'Included your to-do list',
      'Included the page you read at example.test',
      'Included 2 cards of her history',
      'Included her days around today',
      'Included 4 earlier messages',
      'Used the approval you gave earlier in this tab',
      'Sent to Synthetic Two through OpenRouter',
    ],
  );
  // Counts that are not whole positive numbers list nothing.
  assert.equal(contextSteps({ memories: -2, mail: 1.5, calendar: '4', history: NaN }).length, 2);
  assert.equal(contextSteps().at(-1).text, 'Sent to your model through OpenRouter');
});

test('a name from elsewhere is shown on one line, without control or direction marks, and cut to size', () => {
  const steps = contextSteps({
    model: { name: 'Bad‮Name\n<b>x</b>' + 'm'.repeat(200), local: true },
    file: 'a\u0000b\tc' + 'f'.repeat(200),
    page: 'host⁦.example',
  });
  const [file, page, , sent] = texts(steps);
  assert.equal(file, 'Included an excerpt of a b c' + 'f'.repeat(75));
  assert.equal(page, 'Included the page you read at host .example');
  assert.match(sent, /^Sent to Bad Name <b>x<\/b>m+ on your own server$/);
  assert.equal([...sent].length, 'Sent to  on your own server'.length + 80);
});

test('every step has an icon that exists', () => {
  const trail = startTrail(
    contextSteps({
      introduction: true,
      memories: 2,
      file: 'f',
      calendar: 1,
      mail: 1,
      todos: true,
      page: 'p',
      canon: 1,
      days: true,
      history: 1,
    }),
    0,
  );
  firstWords(trail, 10);
  endTrail(trail, { complete: true, offered: true }, 20);
  const stopped = startTrail([], 0);
  endTrail(stopped, { complete: false, stopped: true }, 5);
  const failed = startTrail([], 0);
  endTrail(failed, { complete: false }, 5);
  for (const row of [
    ...trailRows(trail),
    ...trailRows(stopped),
    ...trailRows(failed),
    ...trailRows(startTrail([], 0)),
  ]) {
    assert.ok(Array.isArray(activityIcons[row.icon]) && activityIcons[row.icon].length, row.icon);
    for (const d of activityIcons[row.icon]) assert.match(d, /^[MmLlHhVvCcSsAaZz0-9 .,-]+$/);
  }
});

test('a trail goes from waiting, to writing, to done, with the time each took', () => {
  const trail = startTrail([{ icon: 'send', text: 'Sent to Synthetic One on your own server' }], 1000);
  assert.equal(trailActive(trail), true);
  assert.equal(trailSummary(trail), 'What PEA is doing');
  assert.deepEqual(trailRows(trail).at(-1), {
    icon: 'clock',
    text: 'Waiting for the first words…',
    state: 'active',
  });

  firstWords(trail, 3200);
  firstWords(trail, 9000); // Only the first words count.
  assert.deepEqual(texts(trailRows(trail)).slice(1), ['First words after 2 s', 'Writing the reply…']);
  assert.equal(trailRows(trail).at(-1).state, 'active');

  endTrail(trail, { complete: true, offered: true }, 8200);
  assert.equal(trailActive(trail), false);
  assert.deepEqual(texts(trailRows(trail)), [
    'Sent to Synthetic One on your own server',
    'First words after 2 s',
    'Wrote the reply in 5 s',
    'Offered something for you to review, below',
  ]);
  assert.ok(trailRows(trail).every((r) => r.state === 'done'));
  assert.equal(trailSummary(trail), 'What PEA did · 4 steps · 7 s');
  // A trail ends once.
  endTrail(trail, { complete: false, stopped: true }, 99999);
  firstWords(trail, 99999);
  assert.equal(trailSummary(trail), 'What PEA did · 4 steps · 7 s');
});

test('a request that was stopped or did not finish says so, and never says a reply was written', () => {
  const stopped = startTrail([], 0);
  endTrail(stopped, { complete: false, stopped: true, offered: true }, 400);
  assert.deepEqual(trailRows(stopped), [
    { icon: 'stop', text: 'Stopped before the reply was finished', state: 'problem' },
  ]);
  assert.equal(trailSummary(stopped), 'What PEA did · 1 step · stopped after under a second');

  const failed = startTrail([], 0);
  firstWords(failed, 500);
  endTrail(failed, { complete: false }, 61000);
  assert.deepEqual(texts(trailRows(failed)), [
    'First words after under a second',
    'The request did not finish. PEA did not retry or use another model.',
  ]);
  assert.equal(trailSummary(failed), 'What PEA did · 2 steps · did not finish');
  assert.ok(![...trailRows(stopped), ...trailRows(failed)].some((r) => /Wrote|Offered/.test(r.text)));
});

test('times are said in words', () => {
  assert.equal(took(0), 'under a second');
  assert.equal(took(999), 'under a second');
  assert.equal(took(1499), '1 s');
  assert.equal(took(59400), '59 s');
  assert.equal(took(125000), '2 min 5 s');
  assert.equal(took(-1), '');
  assert.equal(took(NaN), '');
});

test('nothing is taken on trust from missing or malformed input', () => {
  assert.deepEqual(startTrail('not steps', 0).steps, []);
  assert.equal(startTrail(new Array(50).fill({ icon: 'check', text: 'x' }), 0).steps.length, 20);
  assert.doesNotThrow(() => firstWords(undefined, 1));
  assert.doesNotThrow(() => endTrail(undefined, { complete: true }, 1));
});
