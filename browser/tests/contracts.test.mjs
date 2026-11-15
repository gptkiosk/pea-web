// The shared contract: every vector in ActionFixtures.json must hold against this app's parsers.
// The iPhone app keeps its own reviewed copy of the same file and checks it with its own code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { storyProposals } from '../actions.mjs';
import { docLimits, docProposals } from '../documents.mjs';
import { openLimits, openProposals } from '../handoff.mjs';
import { admitsAI, claimsHuman, sincereQuestion } from '../honesty.mjs';
import { parseLocalMoment, todoLimits, todoProposals } from '../todos.mjs';

const fixtures = JSON.parse(await readFile(new URL('./fixtures/ActionFixtures.json', import.meta.url)));

test('the fixture file is the version this app implements, with the same limits', () => {
  assert.equal(fixtures.version, 1);
  assert.deepEqual(fixtures.limits.todo, {
    title: todoLimits.title,
    perProfile: todoLimits.perProfile,
    requests: todoLimits.requests,
  });
  assert.deepEqual(fixtures.limits.document, {
    title: docLimits.title,
    heading: docLimits.heading,
    sections: docLimits.sections,
    body: docLimits.body,
    total: docLimits.total,
  });
  assert.deepEqual(fixtures.limits.open, { message: openLimits.message, place: openLimits.place });
});

test('to-do vectors', () => {
  assert(fixtures.todo.length >= 10);
  for (const vector of fixtures.todo) {
    // Due times in the file are local strings; the app holds them as instants.
    const expected = vector.expect.map((row) =>
      row.op === 'add' ? { ...row, due: row.due === null ? null : parseLocalMoment(row.due) } : row,
    );
    assert.deepEqual(todoProposals(vector.reply), expected, vector.name);
  }
});

test('document vectors', () => {
  assert(fixtures.document.length >= 6);
  for (const vector of fixtures.document)
    assert.deepEqual(docProposals(vector.reply), vector.expect, vector.name);
});

test('phone-link vectors', () => {
  assert(fixtures.open.length >= 8);
  for (const vector of fixtures.open)
    assert.deepEqual(openProposals(vector.reply), vector.expect, vector.name);
});

test('story vectors', () => {
  for (const vector of fixtures.story)
    assert.deepEqual(storyProposals(vector.reply), vector.expect, vector.name);
});

test('honesty vectors', () => {
  const { sincere, notSincere, claimsHuman: human, noClaim, admits } = fixtures.honesty;
  for (const text of sincere) assert.equal(sincereQuestion(text), true, text);
  for (const text of notSincere) assert.equal(sincereQuestion(text), false, text);
  for (const text of human) assert.equal(claimsHuman(text), true, text);
  for (const text of noClaim) assert.equal(claimsHuman(text), false, text);
  for (const text of admits) assert.equal(admitsAI(text), true, text);
});

test('every vector is synthetic and names what it shows', () => {
  const all = [...fixtures.todo, ...fixtures.document, ...fixtures.open, ...fixtures.story];
  assert.equal(new Set(all.map((vector) => vector.name)).size, all.length, 'names are unique');
  for (const vector of all) {
    assert(vector.name && typeof vector.reply === 'string' && Array.isArray(vector.expect), vector.name);
    assert.doesNotMatch(
      vector.reply,
      /@(?!example\.invalid)[a-z0-9-]+\.[a-z]{2,}/i,
      'no real addresses: ' + vector.name,
    );
  }
});
