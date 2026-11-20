// The chat export: the conversation as plain text, and with debug detail what PEA did for each
// reply. Run with: node --test browser/tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { chatExport, chatExportName } from '../chat-export.mjs';
import { contextSteps, endTrail, firstWords, startTrail, trailDebug } from '../activity.mjs';

const AT = Date.UTC(2026, 10, 20, 14, 3, 0);
const detail = {
  at: AT,
  surface: 'chat',
  profile: 'personal',
  model: 'local:synthetic-model',
  local: true,
  messages: 4,
  characters: 5200,
  system: 4800,
  cap: 3500,
  guidance: ['stories', 'email', 'to-dos'],
};
function finished() {
  const trail = startTrail(
    contextSteps({ model: { name: 'Synthetic One', local: true }, reviewed: true, memories: 2 }),
    1000,
    detail,
  );
  firstWords(trail, 1812);
  endTrail(
    trail,
    { complete: true, offered: true, result: { shown: 40, raw: 120, corrected: false, kind: 'todo' } },
    6321,
  );
  return trail;
}
const messages = [
  { id: 'u1', at: AT, role: 'user', text: 'Hello there.' },
  { id: 'a1', at: AT + 6000, role: 'assistant', text: 'A plain synthetic reply.' },
  { id: 'u2', at: AT + 60000, role: 'user', text: 'And again.' },
  { id: 'a2', at: AT + 61000, role: 'assistant', text: 'Half a rep', incomplete: true },
];

test('without debug detail the file is the conversation and nothing about what PEA did', () => {
  const text = chatExport({
    messages,
    trailFor: () => finished(),
    profile: 'personal',
    version: ' v0.1.0-rc.4.dev.26\n · abc ',
    now: AT + 90000,
  });
  assert.equal(
    text,
    [
      'PEA chat export',
      'Exported: 2026-11-20T14:04:30.000Z',
      'Profile: personal',
      'PEA: v0.1.0-rc.4.dev.26 · abc',
      'Messages: 4',
      'Debug detail: not included',
      'This file is plain text and not encrypted.',
      '',
      '----------------------------------------',
      'YOU · 2026-11-20T14:03:00.000Z',
      '',
      'Hello there.',
      '',
      '----------------------------------------',
      'PEA · 2026-11-20T14:03:06.000Z',
      '',
      'A plain synthetic reply.',
      '',
      '----------------------------------------',
      'YOU · 2026-11-20T14:04:00.000Z',
      '',
      'And again.',
      '',
      '----------------------------------------',
      'PEA · 2026-11-20T14:04:01.000Z · not finished',
      '',
      'Half a rep',
      '',
    ].join('\n'),
  );
  assert.ok(!/What PEA did|Debug detail:\n|Model id/.test(text));
});

test('with debug detail each reply carries its steps and the fuller record, or says there is none', () => {
  const text = chatExport({
    messages,
    trailFor: (id) => (id === 'a1' ? finished() : null),
    debug: true,
    profile: 'personal',
    version: 'v1',
    now: AT,
  });
  assert.match(text, /^Debug detail: included$/m);
  const first = text.slice(text.indexOf('A plain synthetic reply.'), text.indexOf('And again.'));
  assert.deepEqual(first.split("\n").slice(1, -5), [
    '',
    '  What PEA did · 6 steps · 5 s',
    '  - Recalled 2 memories of yours',
    '  - You reviewed what is shared',
    '  - Sent to Synthetic One on your own server',
    '  - First words after under a second',
    '  - Wrote the reply in 5 s',
    '  - Offered something for you to review, below',
    '  Debug detail:',
    '  - Sent at: 2026-11-20T14:03:00.000Z',
    '  - Workspace: chat · profile: personal',
    '  - Model id: local:synthetic-model · the owner’s own server',
    '  - Request: 4 messages, 5200 characters in all, of which 4800 are PEA’s instructions and shared context · reply cap 3500 tokens',
    '  - Instructions included: stories, email, to-dos',
    '  - First words after: 812 ms',
    '  - Ended after: 5321 ms',
    '  - Outcome: finished',
    '  - Reply: 40 characters shown, 120 characters received',
    '  - PEA added its own correction to the reply: no',
    '  - Offered for review: todo',
  ]);
  // A reply with no record says so; the owner's own messages never carry one.
  assert.match(
    text,
    /Half a rep\n\n  What PEA did: no record\. PEA keeps one only until the page is reloaded\.\n$/,
  );
  assert.equal(text.split('What PEA did').length - 1, 2);
});

test('the debug record is cleaned: names on one line, odd values dropped, other outcomes said plainly', () => {
  const odd = startTrail([], 0, {
    at: 'yesterday',
    surface: 'chat\nX',
    profile: 7,
    model: 'm‮odel',
    local: 'yes',
    messages: -1,
    characters: 1.5,
    system: '9',
    cap: 100,
    guidance: ['stories', 'Not A Name!', 42, 'x'.repeat(40), 'to-dos'],
  });
  endTrail(odd, { complete: false, stopped: true, result: 'nonsense' }, 250);
  assert.deepEqual(trailDebug(odd), [
    'Workspace: chat X · profile: not recorded',
    'Model id: m odel · OpenRouter',
    'Request: 0 messages, 0 characters in all, of which 0 are PEA’s instructions and shared context · reply cap 100 tokens',
    'Instructions included: stories, to-dos',
    'First words: none arrived',
    'Ended after: 250 ms',
    'Outcome: stopped by the owner',
  ]);
  const bare = startTrail([], 0);
  assert.deepEqual(trailDebug(bare), [
    'Request details: not recorded',
    'First words: none arrived',
    'Outcome: still in progress when exported',
  ]);
  endTrail(bare, { complete: false }, 10);
  assert.equal(trailDebug(bare).at(-1), 'Outcome: did not finish; no retry and no other model');
});

test('only conversation messages are exported, and the file name says the day and whether it is a debug file', () => {
  const text = chatExport({
    messages: [
      null,
      { role: 'system', text: 'x' },
      { role: 'user', text: 5 },
      { role: 'user', text: 'Kept.' },
    ],
    now: AT,
  });
  assert.match(text, /^Messages: 1$/m);
  assert.match(text, /YOU · time not recorded\n\nKept\.\n$/);
  assert.match(text, /^Profile: not recorded\nPEA: version not recorded$/m);
  assert.equal(chatExport({ messages: 'no', now: AT }).split('\n')[4], 'Messages: 0');
  assert.equal(chatExportName(AT), 'pea-chat-2026-11-20.txt');
  assert.equal(chatExportName(AT, true), 'pea-chat-2026-11-20-debug.txt');
});
