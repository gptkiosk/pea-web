// How a reply's prose is laid out. Run with: node --test browser/tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { atLatest, inlineRuns, proseBlocks } from '../chat-format.mjs';

const plain = (runs) => runs.map((run) => (run.style ? `<${run.style}:${run.text}>` : run.text)).join('');

test('emphasis and inline code become runs, and marks that do not close stay as typed', () => {
  assert.equal(
    plain(inlineRuns('A **bold** word, an *italic* one, _another_ and `code`.')),
    'A <bold:bold> word, an <italic:italic> one, <italic:another> and <code:code>.',
  );
  assert.equal(plain(inlineRuns('2 * 3 * 4 and a lone ** mark')), '2 * 3 * 4 and a lone ** mark');
  assert.equal(plain(inlineRuns('snake_case_name and file_name.py')), 'snake_case_name and file_name.py');
  assert.equal(plain(inlineRuns('an unclosed `tick and **bold')), 'an unclosed `tick and **bold');
  assert.equal(plain(inlineRuns('`**not bold**` inside code')), '<code:**not bold**> inside code');
  assert.deepEqual(inlineRuns(''), []);
});

test('nothing a model writes becomes markup or a link', () => {
  const text = 'See [the site](https://example.test) and <img src=x onerror=alert(1)>';
  assert.deepEqual(proseBlocks(text), [{ kind: 'paragraph', runs: [{ text, style: '' }] }]);
});

test('prose is split into headings, lists, quotes, rules and paragraphs', () => {
  const blocks = proseBlocks(
    [
      '# Title',
      'First line',
      'second line',
      '',
      '#### Deep heading ##',
      '1. one',
      '2. two',
      '   - inner',
      '   continued here',
      '3) three',
      '',
      '- a',
      '* b',
      '> quoted',
      '> again',
      '---',
      'End.',
    ].join('\n'),
  );
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ['heading', 'paragraph', 'heading', 'list', 'list', 'quote', 'rule', 'paragraph'],
  );
  assert.equal(blocks[0].level, 1);
  assert.equal(plain(blocks[1].runs), 'First line\nsecond line', 'line breaks in a paragraph are kept');
  assert.equal(blocks[2].level, 3, 'deeper headings share the smallest size');
  assert.equal(plain(blocks[2].runs), 'Deep heading');
  assert.equal(blocks[3].ordered, true);
  assert.deepEqual(
    blocks[3].items.map((i) => [i.depth, i.number, plain(i.runs)]),
    [
      [0, 1, 'one'],
      [0, 2, 'two'],
      [1, null, 'inner continued here'],
      [0, 3, 'three'],
    ],
  );
  assert.equal(blocks[4].ordered, false);
  assert.deepEqual(
    blocks[4].items.map((i) => plain(i.runs)),
    ['a', 'b'],
  );
  assert.equal(plain(blocks[5].runs), 'quoted\nagain');
  assert.deepEqual(proseBlocks(''), []);
  assert.deepEqual(proseBlocks(null), []);
});

test('a hyphenated word or a dash in a sentence is not a list or a rule', () => {
  assert.deepEqual(
    proseBlocks('well-known - and so on\n-not a bullet').map((b) => b.kind),
    ['paragraph'],
  );
});

test('a conversation counts as followed while its newest part is within reach', () => {
  assert.equal(atLatest({ scrollTop: 900, clientHeight: 100, scrollHeight: 1000 }), true);
  assert.equal(atLatest({ scrollTop: 840, clientHeight: 100, scrollHeight: 1000 }), true);
  assert.equal(atLatest({ scrollTop: 300, clientHeight: 100, scrollHeight: 1000 }), false);
});
