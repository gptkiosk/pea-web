// The worn-out hobby a model gives an invented character, sourdough and its starter, is left out
// of what PEA keeps and sends about her: when a model writes it, when it is sent, and from what
// was kept before the rule. Fixed words; the owner's own notes are never filtered.
// Run with: node --test browser/tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { clicheRule, interests, isCliche, withoutCliches } from '../life.mjs';
import { canonContext, historyPrompt, parseCanon, selectCards } from '../canon.mjs';
import { dayKey, dayNote, daysContext, parseWeek, weekDays, weekPrompt } from '../days.mjs';

test('the worn-out hobby is recognised by fixed words, and ordinary food is not', () => {
  for (const said of [
    'My sourdough starter, Gerald, is sluggish again.',
    'Fed the starter and left the jar on the windowsill.',
    'I spent Sunday baking bread for the neighbours.',
    'She bakes her own bread every weekend.',
    'Baked a fresh loaf before work.',
    'Tried bread-making with Inés.',
    'The bread starter needs more flour.',
    'SOURDOUGH discard pancakes for breakfast.',
  ])
    assert.equal(isCliche(said), true, said);
  for (const said of [
    'Bought bread at the market and walked home by the river.',
    'Toast and coffee before the climbing gym.',
    'A starter of soup, then the quiz.',
    'Dan was the starter in five-a-side tonight.',
    'Cooked a lentil stew from Aunt Rosa’s recipe.',
    'Baked a tray of biscuits for the film club.',
    'The jar of pens fell off my desk.',
    '',
    null,
    7,
  ])
    assert.equal(isCliche(said), false, String(said));
  // The hand she is dealt was written here and holds none of it.
  assert.deepEqual(
    withoutCliches(interests, (i) => i.join(' ')),
    interests,
  );
  assert.match(clicheRule, /sourdough, a bread starter or bread baking/);
});

const cardOf = (topic, text, tags = ['home', 'kitchen']) => ({ topic, tags, text });
test('her history never keeps or sends a card on it', () => {
  const written = JSON.stringify([
    cardOf('The kitchen', 'I keep a sourdough starter called Gerald and feed it every morning.'),
    cardOf('Sourdough', 'Sundays are for the loaf, whatever else happens that week.', ['sunday', 'kitchen']),
    ...Array.from({ length: 7 }, (_, i) =>
      cardOf('Street ' + (i + 1), `The street I grew up on had ${i + 3} plane trees and one loud dog.`, [
        'street',
        'childhood',
      ]),
    ),
  ]);
  const kept = parseCanon(written);
  assert.equal(kept.length, 7);
  assert.ok(kept.every((c) => !/sourdough|starter/i.test(c.topic + c.text)));
  assert.match(historyPrompt({ home: 'Lisbon' }), /Rules: Do not give PEA sourdough/);

  // A card kept before the rule is never chosen and never sent.
  const old = [
    {
      id: 'card-1',
      topic: 'Baking',
      tags: ['bread', 'baking', 'kitchen'],
      text: 'My sourdough starter is called Gerald.',
    },
    {
      id: 'card-2',
      topic: 'Kitchen',
      tags: ['kitchen', 'cooking'],
      text: 'I cook one regional dish a week, badly at first.',
    },
  ];
  assert.deepEqual(
    selectCards(old, 'tell me about yourself and your kitchen').map((c) => c.id),
    ['card-2'],
  );
  assert.deepEqual(selectCards([old[0]], 'do you like baking bread in your kitchen', 99), []);
  assert.doesNotMatch(canonContext(old), /Gerald|sourdough/);
  assert.match(canonContext(old), /regional dish/);
  assert.equal(canonContext([old[0]]), '');
});

test('her days never keep or send a line on it', () => {
  const now = Date.UTC(2026, 10, 23, 12);
  const days = weekDays(now);
  const week = parseWeek(
    JSON.stringify([
      { day: days[0], text: 'Fed the sourdough starter and it finally bubbled.' },
      ...days.slice(1, 5).map((day, i) => ({ day, text: `Walked stage ${i + 1} of the trail with Oskar.` })),
    ]),
    now,
  );
  assert.equal(week.length, 4);
  assert.ok(week.every((e) => !/sourdough/i.test(e.text)));
  assert.match(weekPrompt({ home: 'Lisbon', now }), /Rules: Do not give PEA sourdough/);
  const note = (text) => '```pea-life\n' + JSON.stringify({ op: 'day_note', when: 'today', text }) + '\n```';
  assert.equal(dayNote(note('My starter was sluggish so I fed it more flour.'), now), null);
  assert.equal(
    dayNote(note('Lost the quiz by one point, again.'), now).text,
    'Lost the quiz by one point, again.',
  );
  // A line kept before the rule is never sent.
  const today = dayKey(now);
  const sent = daysContext(
    [
      { day: today, text: 'Baking bread this evening with the new starter.', from: 'week' },
      { day: dayKey(now, 1), text: 'Choir rehearsal, second row as usual.', from: 'week' },
    ],
    now,
  );
  assert.match(sent, /Choir rehearsal/);
  assert.doesNotMatch(sent, /bread|starter/i);
  assert.equal(daysContext([{ day: today, text: 'Sourdough day.', from: 'week' }], now), '');
});
