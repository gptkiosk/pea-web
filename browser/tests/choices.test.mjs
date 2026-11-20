import test from 'node:test';
import assert from 'node:assert/strict';
import { choiceGuidance, choiceProposals, choicesAloud, spokenChoice } from '../choices.mjs';

const block = (value) =>
  'Which one?\n```pea-choices\n' + (typeof value === 'string' ? value : JSON.stringify(value)) + '\n```\n';
const good = {
  op: 'choose',
  question: 'Which day suits you?',
  options: ['Monday morning', 'Tuesday after lunch', 'Neither, suggest another'],
};

test('a reply offers a choice only in exactly the agreed shape', () => {
  assert.deepEqual(choiceProposals(block(good)), [{ question: good.question, options: good.options }]);
  for (const bad of [
    { ...good, op: 'pick' },
    { ...good, extra: 1 },
    { op: 'choose', options: good.options },
    { ...good, options: ['Only one'] },
    { ...good, options: ['1', '2', '3', '4', '5', '6', '7'] },
    { ...good, options: ['Same', 'same!'] },
    { ...good, options: ['Fine', ''] },
    { ...good, options: ['Fine', 7] },
    { ...good, options: ['Fine', '…'] },
    { ...good, options: ['Fine', 'x'.repeat(81)] },
    { ...good, options: ['Fine', 'Two\nlines'] },
    { ...good, options: ['Fine', 'Turned‮around'] },
    { ...good, question: '' },
    { ...good, question: 'q'.repeat(201) },
    [good],
    'not json',
  ])
    assert.deepEqual(choiceProposals(block(bad)), [], JSON.stringify(bad));
  assert.deepEqual(choiceProposals(block(good) + block(good)), [], 'two blocks offer nothing');
  assert.deepEqual(choiceProposals(block(good) + '```pea-read\n{}\n```\n'), [], 'not beside another block');
  assert.deepEqual(choiceProposals(null), []);
  assert.match(choiceGuidance, /pea-choices/);
  assert.match(choiceGuidance, /never to get approval for an action/);
});

test('a number, however it is said, names an answer; other words are the owner’s own', () => {
  const o = good.options;
  for (const [said, at] of [
    ['2', 1],
    ['two', 1],
    ['Two.', 1],
    ['option 2', 1],
    ['Option two', 1],
    ['number three', 2],
    ['option number 1', 0],
    ['the second one', 1],
    ['second', 1],
    ['1st', 0],
    ['the last one', 2],
    ['last', 2],
    ['I’ll take option one', 0],
    ['okay, go with the first one', 0],
    ['pick 3', 2],
    ['option to', 1],
    ['number for', -1],
    ['option won', 0],
    ['tuesday after lunch', 1],
    ['Tuesday, after lunch!', 1],
    ['monday morning', 0],
  ])
    assert.equal(spokenChoice(said, o), at, said);
  for (const said of [
    '4',
    'option 9',
    'zero',
    'to',
    'for',
    'two of them',
    'Tuesday',
    'I have two questions first',
    'the second one sounds bad, what else',
    '',
    'x'.repeat(300),
  ])
    assert.equal(spokenChoice(said, o), -1, said);
  assert.equal(spokenChoice('2', []), -1);
  assert.equal(spokenChoice('2', null), -1);
  assert.equal(spokenChoice(2, o), -1);
  // An answer that is itself a number wins over its position.
  assert.equal(spokenChoice('2', ['3', '2']), 1);
});

test('the answers read aloud carry their numbers', () => {
  assert.equal(
    choicesAloud({ question: 'Q?', options: ['Yes', 'No'] }),
    'Option 1: Yes. Option 2: No. Say a number, or answer in your own words.',
  );
});
