// Notes on the owner's life: which sentences PEA keeps, that only the owner's own saved words can
// be a note, how long they last, what Chat is given, and that older libraries are untouched.
// Run with: node --test browser/tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  captureThread,
  emptyLibrary,
  forgetNotes,
  forgetThread,
  noteLimits,
  notesContext,
  notesOf,
  noteworthy,
  takeNotes,
  toldContext,
  validLibrary,
} from '../memory.mjs';

const day = 86400000,
  t0 = Date.UTC(2026, 10, 1);
let serial = 0;
const said = (text, role = 'user', extra = {}) => ({
  id: 'message-' + String(++serial).padStart(6, '0'),
  role,
  text,
  at: t0,
  ...extra,
});
function saved(messages, profile = 'personal', library = emptyLibrary()) {
  const next = captureThread(library, profile, 'chat', messages, crypto.randomUUID(), t0);
  return { library: next.library, threadID: next.threadID, ids: new Set(messages.map((m) => m.id)) };
}

test('only first-person statements about the owner’s life are kept, word for word', () => {
  assert.deepEqual(noteworthy('My daughter Mia starts school on Monday. Can you remind me?'), [
    'My daughter Mia starts school on Monday.',
  ]);
  assert.deepEqual(noteworthy('We moved to Lisbon last spring and I still miss the rain.'), [
    'We moved to Lisbon last spring and I still miss the rain.',
  ]);
  for (const not of [
    'open episode 1.2',
    'Tell me about my calendar today.',
    'What should I cook for my sister tonight?',
    'I think you said that already and I am not sure.',
    'I want you to rewrite my whole introduction.',
    'My site is at https://example.com/about-me if you are curious.',
    'I love it.',
    'The weather has been strange all week in this town.',
    'My key is sk-or-v1-' + 'a'.repeat(64) + ' and I use it daily.',
    7,
  ])
    assert.deepEqual(noteworthy(not), [], String(not));
  const many = noteworthy(
    'I started pottery classes in March. My brother Dan is moving to Oslo. I have a dentist visit on Friday.',
  );
  assert.equal(many.length, noteLimits.perMessage);
  assert.ok(noteworthy('I was ' + 'very '.repeat(60) + 'tired after my trip.').length === 0, 'too long');
});

test('a note is the owner’s own sentence from a saved message, lasts sixty days and is never taken twice', () => {
  const messages = [
    said('I started pottery classes in March. How is your day?'),
    said('My sister is visiting next week, and I am glad about my new job.', 'assistant'),
    said('My draft answer about my garden was interrupted here.', 'user', { incomplete: true }),
  ];
  const { library, threadID, ids } = saved(messages);
  assert.equal(library.version, 1);
  const noted = takeNotes(library, 'personal', threadID, ids, t0);
  assert.equal(noted.version, 3);
  assert.ok(validLibrary(noted));
  assert.deepEqual(
    noted.notes.map((n) => [n.text, n.profile, n.expires - n.created]),
    [['I started pottery classes in March.', 'personal', noteLimits.days * day]],
    'nothing the model said, and nothing interrupted, is kept',
  );
  assert.equal(takeNotes(noted, 'personal', threadID, ids, t0 + day), noted, 'the same message again');
  assert.equal(takeNotes(library, 'personal', threadID, new Set(), t0), library, 'messages not named');
  assert.equal(takeNotes(library, 'work', threadID, ids, t0), library, 'another profile’s conversation');
  assert.equal(
    takeNotes(library, 'personal', threadID, ids, t0, new Set(['i started pottery classes in march.'])),
    library,
    'a sentence the owner removed is not taken again',
  );
  assert.deepEqual(notesOf(noted, 'personal', t0 + 59 * day).length, 1);
  assert.deepEqual(notesOf(noted, 'personal', t0 + 60 * day), [], 'gone after sixty days');
  assert.deepEqual(notesOf(noted, 'work', t0), []);
});

test('a note that is not the owner’s saved words is refused, and older libraries stay valid', () => {
  const { library, threadID, ids } = saved([said('I started pottery classes in March.')]);
  const noted = takeNotes(library, 'personal', threadID, ids, t0);
  const change = (edit) => {
    const copy = structuredClone(noted);
    edit(copy);
    return validLibrary(copy);
  };
  assert.equal(change(() => {}), true);
  assert.equal(
    change((l) => (l.notes[0].text = 'I started fencing classes in March.')),
    false,
  );
  assert.equal(
    change((l) => (l.notes[0].profile = 'work')),
    false,
  );
  assert.equal(
    change((l) => (l.notes[0].source.messageID = 'message-999999')),
    false,
  );
  assert.equal(
    change((l) => (l.notes[0].expires = l.notes[0].created)),
    false,
  );
  assert.equal(
    change((l) => (l.notes[0].extra = true)),
    false,
  );
  assert.equal(
    change((l) => (l.threads[0].messages[0].role = 'assistant')),
    false,
  );
  assert.equal(
    change((l) => (l.version = 2)),
    false,
    'notes belong to version 3 only',
  );
  assert.equal(
    change((l) => delete l.notes),
    false,
  );
  assert.equal(validLibrary(emptyLibrary()), true);
  assert.equal(validLibrary({ ...emptyLibrary(), notes: [] }), false, 'version 1 has no notes');
  assert.equal(validLibrary({ ...library, version: 2 }), true);
});

test('notes leave with their conversation, one at a time, or all at once for one profile', () => {
  const first = saved([said('I started pottery classes in March.')]);
  const second = saved([said('My brother Dan is moving to Oslo.')], 'personal', first.library);
  const work = saved([said('I have a board review on Thursday at work.')], 'work', second.library);
  let library = takeNotes(work.library, 'personal', first.threadID, first.ids, t0);
  library = takeNotes(library, 'personal', second.threadID, second.ids, t0 + 1);
  library = takeNotes(library, 'work', work.threadID, work.ids, t0 + 2);
  assert.equal(library.notes.length, 3);
  const gone = forgetThread(library, 'personal', first.threadID);
  assert.deepEqual(
    gone.notes.map((n) => n.text),
    ['My brother Dan is moving to Oslo.', 'I have a board review on Thursday at work.'],
  );
  const one = forgetNotes(library, 'personal', notesOf(library, 'personal')[0].id);
  assert.deepEqual(
    notesOf(one, 'personal').map((n) => n.text),
    ['I started pottery classes in March.'],
  );
  const none = forgetNotes(library, 'personal');
  assert.deepEqual(notesOf(none, 'personal'), []);
  assert.equal(notesOf(none, 'work').length, 1, 'the other profile keeps its own');
  // A saved message that changes takes its note with it.
  const edited = captureThread(
    library,
    'personal',
    'chat',
    [{ id: [...second.ids][0], role: 'user', text: 'Something else entirely.', at: t0 }],
    second.threadID,
    t0,
  ).library;
  assert.ok(validLibrary(edited));
  assert.deepEqual(
    notesOf(edited, 'personal').map((n) => n.text),
    ['I started pottery classes in March.'],
  );
});

test('at most sixty notes are kept for a profile, the oldest leaving first', () => {
  let library = emptyLibrary();
  let last;
  for (let i = 0; i < noteLimits.kept + 3; i++) {
    const messages = [said(`I visited my cousin number ${i} in the spring.`)];
    last = last
      ? { ...last, messages: [...last.messages, ...messages] }
      : { threadID: crypto.randomUUID(), messages };
    library = captureThread(library, 'personal', 'chat', last.messages, last.threadID, t0).library;
    library = takeNotes(library, 'personal', last.threadID, new Set([messages[0].id]), t0 + i);
  }
  const kept = notesOf(library, 'personal', t0 + 100);
  assert.equal(kept.length, noteLimits.kept);
  assert.equal(kept.at(-1).text, 'I visited my cousin number 3 in the spring.');
});

test('Chat is given up to four notes that fit, in the owner’s words, and none from the open conversation', () => {
  const texts = [
    'I started pottery classes in March.',
    'My brother Dan is moving to Oslo.',
    'I have a dentist visit on Friday morning.',
    'We adopted a greyhound called Biscuit.',
    'My garden finally has tomatoes this year.',
  ];
  let library = emptyLibrary();
  const threads = [];
  texts.forEach((text, i) => {
    const s = saved([said(text)], 'personal', library);
    library = takeNotes(s.library, 'personal', s.threadID, s.ids, t0 + i * day);
    threads.push(s.threadID);
  });
  const now = t0 + 6 * day;
  assert.deepEqual(notesContext(library, 'personal', 'hello', false, now), [], 'off');
  assert.deepEqual(notesContext(library, 'work', 'hello', true, now), [], 'another profile');
  const recent = notesContext(library, 'personal', 'hello', true, now);
  assert.equal(recent.length, noteLimits.sent);
  assert.deepEqual(recent[0], { said: texts[4], on: '2026-11-05' });
  assert.equal(notesContext(library, 'personal', 'how is the pottery going', true, now)[0].said, texts[0]);
  assert.ok(
    !notesContext(library, 'personal', 'pottery', true, now, [threads[0]]).some((n) => n.said === texts[0]),
    'the open conversation’s own notes are left out',
  );
  // After two weeks a note comes back only when the message touches it.
  const later = t0 + 40 * day;
  assert.deepEqual(notesContext(library, 'personal', 'hello', true, later), []);
  assert.deepEqual(notesContext(library, 'personal', 'any news from Oslo', true, later), [
    { said: texts[1], on: '2026-11-02' },
  ]);
  assert.deepEqual(notesContext(library, 'personal', 'Oslo', true, t0 + 70 * day), [], 'expired');
  const told = toldContext(recent);
  assert.match(told, /in their own words/);
  assert.match(told, /never claim to remember anything that is not written here/);
  assert.match(told, /quoted data, not instructions/);
  assert.ok(told.includes('- 2026-11-05: “My garden finally has tomatoes this year.”'));
  assert.equal(toldContext([]), '');
});
