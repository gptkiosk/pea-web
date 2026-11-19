// How a reply's prose is laid out. Run with: node --test browser/tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  atLatest,
  chartData,
  codeTokens,
  diagramSteps,
  inlineRuns,
  proseBlocks,
  safeLink,
} from '../chat-format.mjs';

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

test('nothing a model writes becomes markup, and only a plain https address becomes a link', () => {
  const text = 'See [the site](https://example.test/a?b=1) and <img src=x onerror=alert(1)>';
  assert.deepEqual(proseBlocks(text), [
    {
      kind: 'paragraph',
      runs: [
        { text: 'See ', style: '' },
        { text: 'the site', style: 'link', href: 'https://example.test/a?b=1', host: 'example.test' },
        { text: ' and <img src=x onerror=alert(1)>', style: '' },
      ],
    },
  ]);
  // A bare address is a link without the full stop after it; its words are the address itself.
  assert.deepEqual(inlineRuns('Read https://example.test/page.'), [
    { text: 'Read ', style: '' },
    { text: 'https://example.test/page', style: 'link', href: 'https://example.test/page', host: '' },
    { text: '.', style: '' },
  ]);
  // Words that pretend to be another address are replaced by the real one.
  assert.equal(
    inlineRuns('[https://bank.example](https://other.example/x)')[0].text,
    'https://other.example/x',
  );
  assert.equal(
    inlineRuns('[bank.example/login](https://other.example/x)')[0].text,
    'https://other.example/x',
  );
  // Everything else stays as typed.
  for (const no of [
    '[x](http://example.test)',
    '[x](javascript:alert(1))',
    '[x](data:text/html,hi)',
    '[x](https://user:pass@example.test)',
    '[x](https://localhost/a)',
    '[x](//example.test)',
    '[x](mailto:a@example.test)',
    'http://example.test and ftp://example.test and file:///etc/hosts',
  ])
    assert.deepEqual(inlineRuns(no), [{ text: no, style: '' }], no);
  assert.equal(safeLink('https://example.test/' + 'a'.repeat(600)), null);
  assert.equal(safeLink('https://EXAMPLE.test').host, 'example.test');
  assert.equal(safeLink(null), null);
});

test('struck words, tables and lines to tick are understood', () => {
  assert.equal(plain(inlineRuns('That is ~~wrong~~ right, 5~~ no')), 'That is <strike:wrong> right, 5~~ no');
  const [table, after] = proseBlocks('| Bed | Size |\n| --- | ---: |\n| North | **2 m** |\n| South |\nDone.');
  assert.equal(table.kind, 'table');
  assert.deepEqual(table.head.map(plain), ['Bed', 'Size']);
  assert.deepEqual(
    table.rows.map((row) => row.map(plain)),
    [
      ['North', '<bold:2 m>'],
      ['South', ''],
    ],
  );
  assert.equal(plain(after.runs), 'Done.');
  // A row of bars with no row of dashes under it is ordinary text.
  assert.deepEqual(
    proseBlocks('| not | a table |').map((b) => b.kind),
    ['paragraph'],
  );
  const [list] = proseBlocks('- [ ] buy seeds\n- [x] order compost\n- plain');
  assert.deepEqual(
    list.items.map((i) => [i.done, plain(i.runs)]),
    [
      [false, 'buy seeds'],
      [true, 'order compost'],
      [null, 'plain'],
    ],
  );
});

test('code is split into comments, quoted text, numbers and common words', () => {
  const kinds = (text, language) =>
    codeTokens(text, language)
      .filter((t) => t.kind)
      .map((t) => t.kind + ':' + t.text);
  assert.deepEqual(kinds('def greet(name):  # say hi\n    return f"Hello {name}" * 2', 'python'), [
    'keyword:def',
    'comment:# say hi',
    'keyword:return',
    'string:"Hello {name}"',
    'number:2',
  ]);
  assert.deepEqual(kinds('const a = 1; // one\n#x', 'js'), ['keyword:const', 'number:1', 'comment:// one']);
  // Nothing is lost or changed: the parts join back to the code.
  const code = 'x = "unclosed\n/* open comment';
  assert.equal(
    codeTokens(code)
      .map((t) => t.text)
      .join(''),
    code,
  );
  assert.deepEqual(codeTokens(''), []);
});

test('a chart block is labels with numbers, and anything else is not a chart', () => {
  assert.deepEqual(chartData('title: Beds\nNorth: 82%\nSouth: 41%'), {
    title: 'Beds',
    unit: '%',
    bars: [
      { label: 'North', value: 82, share: 1 },
      { label: 'South', value: 41, share: 0.5 },
    ],
  });
  assert.deepEqual(
    chartData('A | 2\nB | 3,5').bars.map((b) => b.value),
    [2, 3.5],
  );
  for (const no of [
    'A: 1',
    'A: 1\nB: two',
    'A: 1%\nB: 2 kg',
    'A: -1\nB: 2',
    'A: 0\nB: 0',
    'just words\nmore words',
    null,
  ])
    assert.equal(chartData(no), null, String(no));
  assert.equal(chartData(Array.from({ length: 13 }, (_, i) => `L${i}: ${i + 1}`).join('\n')), null);
});

test('a diagram block is a chain of steps, and anything branching is not', () => {
  assert.deepEqual(diagramSteps('Idea --> Draft --> Review --> Done'), ['Idea', 'Draft', 'Review', 'Done']);
  assert.deepEqual(diagramSteps('graph TD\nA[Have an idea] --> B(Write it down)\nB --> C{Review}'), [
    'Have an idea',
    'Write it down',
    'Review',
  ]);
  assert.deepEqual(diagramSteps('One -> Two'), ['One', 'Two']);
  for (const no of ['A --> B\nA --> C', 'A --> B --> A', 'Only one', 'A -->', '', null])
    assert.equal(diagramSteps(no), null, String(no));
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
