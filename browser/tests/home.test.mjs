import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { endOfDay, homeLimits, homeLines, todoLine } from '../home.mjs';

// Local noon, so "later today" and "overdue" do not depend on the machine's time zone.
const now = new Date(2026, 10, 16, 12, 0, 0).getTime();
const hour = 3600000;
const todo = (title, due = null) => ({ title, due });

test('with nothing turned on there is nothing to show', () => {
  assert.deepEqual(homeLines({ now }), []);
  assert.deepEqual(homeLines(), []);
  assert.deepEqual(homeLines({ weather: null, event: null, todos: [], headlines: [], now }), []);
  assert.deepEqual(homeLines({ weather: {}, event: { title: '  ' }, todos: null, headlines: 'x', now }), []);
});

test('each source gives one line that names its card, in a fixed order', () => {
  const lines = homeLines({
    weather: { temperature: '12°C', condition: 'Rain', place: 'Fixtureville, Synthetica' },
    event: { title: 'Synthetic review', start: '2026-11-16T15:00:00Z' },
    todos: [todo('Synthetic errand')],
    headlines: [
      { title: 'First headline', source: 'Synthetic Daily' },
      { title: 'Second headline', source: 'Other Wire' },
      { title: 'Third headline', source: '' },
      { title: 'Fourth headline', source: 'Other Wire' },
    ],
    now,
  });
  assert.deepEqual(lines, [
    { kind: 'Weather', text: '12°C · Rain · Fixtureville, Synthetica', target: 'weather-section' },
    { kind: 'Next', text: 'Synthetic review · 2026-11-16T15:00:00Z', target: 'upcoming-section' },
    { kind: 'To-dos', text: '1 to-do open', target: 'todos-section' },
    { kind: 'Headline', text: 'First headline', detail: 'Synthetic Daily', target: 'headlines-section' },
    { kind: 'Headline', text: 'Second headline', detail: 'Other Wire', target: 'headlines-section' },
    { kind: 'Headline', text: 'Third headline', detail: '', target: 'headlines-section' },
  ]);
  assert.equal(lines.filter((l) => l.kind === 'Headline').length, homeLimits.headlines);
});

test('to-dos are counted as overdue, due later today, or neither', () => {
  assert.equal(todoLine([], now), '');
  assert.equal(todoLine([todo('One')], now), '1 to-do open');
  assert.equal(todoLine([todo('One'), todo('Two')], now), '2 to-dos open');
  assert.equal(
    todoLine(
      [
        todo('Late', now - hour),
        todo('Soon', now + hour),
        todo('Sooner', now + 60000),
        todo('Tomorrow', now + 30 * hour),
        todo('Undated'),
      ],
      now,
    ),
    '5 to-dos open · 1 overdue · 2 due later today · next: Sooner',
  );
  assert.equal(todoLine([todo('Late', now - hour)], now), '1 to-do open · 1 overdue · next: Late');
  assert.equal(
    todoLine([todo('Tomorrow', endOfDay(now))], now),
    '1 to-do open · next: Tomorrow',
    'midnight is tomorrow',
  );
  assert.equal(
    todoLine([todo('Tonight', endOfDay(now) - 1)], now),
    '1 to-do open · 1 due later today · next: Tonight',
  );
});

test('long or untidy text is cut and put on one line', () => {
  const [line] = homeLines({ headlines: [{ title: 'word '.repeat(100), source: 's'.repeat(100) }], now });
  assert.equal(line.text.length, homeLimits.text);
  assert.ok(line.text.endsWith('…'));
  assert.equal(line.detail.length, 60);
  const [event] = homeLines({ event: { title: 'Two\n\nlines\t here', start: 7 }, now });
  assert.equal(event.text, 'Two lines here');
  assert.match(todoLine([todo('t'.repeat(120), now + hour)], now), /next: t{79}…$/);
});

test('the new files are served by both gateways', async () => {
  const contract = JSON.parse(await readFile(new URL('../server/contract.json', import.meta.url), 'utf8'));
  assert.ok(contract.assets.includes('home.mjs') && contract.assets.includes('home-ui.mjs'));
});
