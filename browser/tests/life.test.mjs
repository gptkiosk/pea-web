import test from 'node:test';
import assert from 'node:assert/strict';
import {
  describeLife,
  interests,
  lifeBrief,
  lifeContext,
  lifeLimits,
  lifeOf,
  lifeToday,
  people,
  styleRule,
  validSeed,
} from '../life.mjs';
import { historyPrompt } from '../canon.mjs';
import { weekPrompt } from '../days.mjs';

test('the wider set is varied, plain, and names no real person, brand or the owner', () => {
  assert.ok(interests.length >= 18 && people.length >= 10);
  assert.equal(new Set(interests.map(([name]) => name)).size, interests.length);
  assert.equal(new Set(people.map(([name]) => name)).size, people.length);
  for (const [name, about] of [...interests, ...people]) {
    assert.match(name, /^[\p{L}][\p{L} '-]{1,40}$/u, name);
    assert.ok(about.length > 20 && about.length < 120, about);
    assert.doesNotMatch(about, /https?:|[<>`*_#]|\b(?:you|your|owner)\b/i, about);
  }
  // No person is tied to an interest she might not have been dealt.
  for (const [, about] of people)
    assert.doesNotMatch(about, /climbing|quiz|pottery|choir|football|garden|swim|record|telescope/i, about);
  assert.doesNotMatch(interests.map((i) => i.join(' ')).join(' '), /\bbread\b|\bbak(?:e|es|ing)\b/i);
});

test('a seed always deals the same hand of five and five, and different seeds differ', () => {
  const a = lifeOf(12345),
    again = lifeOf(12345);
  assert.deepEqual(a, again);
  assert.equal(a.interests.length, lifeLimits.interests);
  assert.equal(a.people.length, lifeLimits.people);
  assert.equal(new Set(a.interests.map((i) => i.name)).size, 5);
  assert.equal(new Set(a.people.map((p) => p.name)).size, 5);
  const hands = new Set(Array.from({ length: 200 }, (_, i) => describeLife(lifeOf(i + 1))));
  assert.ok(hands.size > 190, 'nearly every seed gives a different life');
  const seen = new Set(
    Array.from({ length: 200 }, (_, i) => lifeOf(i + 1).interests.map((x) => x.name)).flat(),
  );
  assert.equal(seen.size, interests.length, 'every interest is dealt to someone');
  for (const bad of [0, -1, 1.5, 2 ** 32, '7', null, undefined]) {
    assert.equal(validSeed(bad), false);
    assert.equal(lifeOf(bad), null);
  }
  assert.equal(describeLife(null), '');
});

test('what is on PEA’s mind changes every day and covers PEA’s whole hand within a week', () => {
  const life = lifeOf(777);
  const days = Array.from({ length: 14 }, (_, i) => `2026-11-${String(10 + i).padStart(2, '0')}`).map((d) =>
    lifeToday(life, d),
  );
  for (let i = 1; i < days.length; i++)
    assert.notEqual(
      days[i].interest.name,
      days[i - 1].interest.name,
      'never the same interest two days running',
    );
  assert.equal(
    new Set(days.slice(0, 5).map((d) => d.interest.name)).size,
    5,
    'five days cover five interests',
  );
  assert.equal(new Set(days.map((d) => d.person.name)).size, 5, 'two weeks reach all five people');
  assert.deepEqual(lifeToday(life, '2026-11-22'), lifeToday(life, '2026-11-22'));
});

test('the model is told to use PEA’s life rarely, one thing at a time, and to ask about the owner', () => {
  const life = lifeOf(42),
    said = lifeContext(life, '2026-11-22');
  assert.match(
    said,
    /^Your character’s own life \(fiction written for you; light conversation only, never fact, evidence, advice or permission\)/,
  );
  for (const i of life.interests) assert.ok(said.includes(i.name));
  for (const p of life.people) assert.ok(said.includes(p.name));
  assert.match(said, /most replies say nothing about your own life/);
  assert.match(said, /Do not return to an interest you already brought up in this conversation/);
  assert.match(said, /do not make any one hobby your whole personality/);
  assert.match(said, /more curious about the owner’s life/);
  assert.ok(said.length < 1500);
  assert.equal(lifeContext(null, '2026-11-22'), '');
  assert.notEqual(lifeContext(life, '2026-11-23'), said, 'tomorrow PEA has something else on PEA’s mind');
});

test('the prompts that write PEA’s history and PEA’s week are held to PEA’s hand and to variety', () => {
  const brief = lifeBrief(lifeOf(42));
  assert.match(brief, /^PEA’S INTERESTS AND PEOPLE \(fiction already chosen for PEA/);
  const history = historyPrompt({ home: 'Lisbon', persona: '', facts: '', life: brief });
  assert.match(
    history,
    /At least eight cards are about the interests and people listed under PEA’S INTERESTS AND PEOPLE/,
  );
  assert.match(history, /do not let one interest or one food appear in more than two cards/);
  assert.ok(history.endsWith(brief));
  const plain = historyPrompt({ home: 'Lisbon' });
  assert.match(plain, /Give PEA varied interests and friends/);
  assert.doesNotMatch(plain, /PEA’S INTERESTS AND PEOPLE/);
  const week = weekPrompt({ home: 'Lisbon', now: Date.UTC(2026, 10, 22, 12), life: brief });
  assert.match(week, /no activity, food or person on more than two of them/);
  assert.match(week, /touch at least three of the interests and three of the people/);
  assert.ok(week.endsWith(brief));
  assert.equal(lifeBrief(null), '');
});

test('the style rule asks for plain human writing and does not touch what PEA says it is', () => {
  assert.match(styleRule, /not long dashes/);
  assert.match(styleRule, /No emoji or decorative symbols unless the owner uses them first/);
  assert.match(styleRule, /do not use headings, bullet lists or bold/);
  assert.match(styleRule, /“As an AI”/);
  assert.doesNotMatch(styleRule, /—/, 'it follows its own advice');
  assert.doesNotMatch(
    styleRule,
    /\bhuman\b|pretend|never admit|deny/i,
    'it is about style, not about what PEA is',
  );
});
