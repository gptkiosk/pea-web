import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addTodo,
  applyTodoRequests,
  claimsTodoChange,
  clearFinished,
  describeRequests,
  dueReminders,
  remindersForMac,
  parseLocalMoment,
  removeTodo,
  setTodoDone,
  todoGuidance,
  todoProposals,
  validTodo,
  validateTodos,
} from '../todos.mjs';

const now = new Date(2031, 0, 2, 9, 0).getTime();
const later = new Date(2031, 0, 3, 9, 0).getTime();
const block = (rows) => 'Here you go.\n```pea-task\n' + JSON.stringify(rows) + '\n```\n';
const add = (title, extra = {}) => ({ op: 'task_add', title, ...extra });

test('a due time is the owner’s local time and impossible dates are refused', () => {
  assert.equal(parseLocalMoment('2031-01-03T09:00'), later);
  assert.equal(parseLocalMoment('2031-01-03T09:00:30'), later + 30000);
  for (const bad of [
    '2031-02-30T09:00',
    '2031-13-01T09:00',
    '2031-01-03T24:00',
    '2031-01-03T09:60',
    '2031-01-03 09:00',
    '2031-01-03T09:00Z',
    '2031-01-03T09:00+02:00',
    '2031-01-03',
    'tomorrow',
    '1999-01-01T00:00',
    '',
    null,
    7,
  ])
    assert.equal(parseLocalMoment(bad), null, String(bad));
});

test('one block of narrowly shaped rows becomes a proposal', () => {
  assert.deepEqual(
    todoProposals(block([add('Call the dentist', { due: '2031-01-03T09:00', remind: true })])),
    [{ op: 'add', title: 'Call the dentist', due: later, remind: true }],
  );
  assert.deepEqual(todoProposals(block([add('Buy milk'), { op: 'task_done', title: 'Call the dentist' }])), [
    { op: 'add', title: 'Buy milk', due: null, remind: false },
    { op: 'done', title: 'Call the dentist' },
  ]);
  assert.deepEqual(todoProposals(block(add('A single row'))), [
    { op: 'add', title: 'A single row', due: null, remind: false },
  ]);
  assert.equal(todoProposals(block([add('  Tidy\n the   desk  ')]))[0].title, 'Tidy the desk');
});

test('anything malformed, mixed, oversized or credential-like yields no proposal at all', () => {
  const refused = [
    block([]),
    block(Array.from({ length: 9 }, (_, i) => add('Item ' + i))),
    block([add('x'.repeat(121))]),
    block([add('')]),
    block([add('ok'), { op: 'task_delete', title: 'ok' }]),
    block([add('ok'), 'not a row']),
    block([{ op: 'task_add' }]),
    block([add('ok', { due: 'soon' })]),
    block([add('ok', { due: '2031-01-03T09:00Z' })]),
    block([add('ok', { remind: 'yes' })]),
    block([add('ok', { priority: 'high' })]),
    block([{ op: 'task_done', title: 'ok', remind: true }]),
    block([add('my key sk-or-v1-' + 'a'.repeat(40))]),
    block([add('ok')]) + block([add('again')]),
    block([add('ok')]) +
      '```pea-email\n{"op":"email_draft","to":"a@example.invalid","subject":"s","body":"b"}\n```',
    'Here.\n```pea-task\n[{"op":"task_add","title":"cut off"',
    'Here.\n```pea-task\nnot json\n```',
    '```json\n[{"op":"task_add","title":"wrong fence"}]\n```',
    'x'.repeat(50001),
    null,
  ];
  for (const reply of refused) assert.deepEqual(todoProposals(reply), [], String(reply).slice(0, 60));
});

test('reviewed requests add, skip duplicates, set reminders only for a future time, and say so', () => {
  const first = applyTodoRequests(
    [
      { op: 'add', title: 'Call the dentist', due: later, remind: true },
      { op: 'add', title: 'Buy milk', due: null, remind: true },
      { op: 'add', title: 'call the DENTIST', due: null, remind: false },
    ],
    [],
    'personal',
    now,
  );
  assert.equal(first.items.length, 2);
  assert.equal(first.changed, 2);
  assert.equal(first.items[0].remind, true);
  assert.equal(first.items[1].remind, false);
  assert.match(first.say, /^Added to your list: “Call the dentist” and “Buy milk” \(reminder set\)\./);
  assert.match(first.say, /No reminder for “Buy milk” because its time is not in the future/);
  assert.match(first.say, /is already on your list, so it was not added again/);
  assert(validateTodos(first.items));

  const past = applyTodoRequests(
    [{ op: 'add', title: 'Late', due: now - 1000, remind: true }],
    [],
    'work',
    now,
  );
  assert.equal(past.items[0].remind, false);
  assert.equal(past.items[0].due, now - 1000);
});

test('checking off needs one clear match and never guesses between several', () => {
  let items = applyTodoRequests(
    [
      { op: 'add', title: 'Call the dentist', due: null, remind: false },
      { op: 'add', title: 'Call the plumber', due: null, remind: false },
      { op: 'add', title: 'Buy milk', due: null, remind: false },
    ],
    [],
    'personal',
    now,
  ).items;
  const exact = applyTodoRequests([{ op: 'done', title: 'buy MILK' }], items, 'personal', now + 5);
  assert.equal(exact.items.find((t) => t.title === 'Buy milk').done, true);
  assert.equal(exact.items.find((t) => t.title === 'Buy milk').completed, now + 5);
  assert.match(exact.say, /^Marked as finished: “Buy milk”\.$/);

  const partial = applyTodoRequests([{ op: 'done', title: 'dentist' }], items, 'personal', now);
  assert.equal(partial.items.find((t) => t.title === 'Call the dentist').done, true);

  const unclear = applyTodoRequests([{ op: 'done', title: 'Call the' }], items, 'personal', now);
  assert.equal(unclear.changed, 0);
  assert.equal(
    unclear.items.some((t) => t.done),
    false,
  );
  assert.match(unclear.say, /Left as it was: could not tell which item “Call the” means/);

  const otherProfile = applyTodoRequests([{ op: 'done', title: 'Buy milk' }], items, 'work', now);
  assert.equal(otherProfile.changed, 0, 'another profile’s list is never touched');
});

test('a full list refuses more and the two profiles are counted separately', () => {
  let items = [];
  for (let i = 0; i < 200; i++) items = addTodo(items, 'personal', 'Item ' + i, {}, now);
  assert.throws(() => addTodo(items, 'personal', 'One more', {}, now), /full at 200/);
  const applied = applyTodoRequests(
    [{ op: 'add', title: 'One more', due: null, remind: false }],
    items,
    'personal',
    now,
  );
  assert.equal(applied.changed, 0);
  assert.match(applied.say, /Left as it was: the list is full, so “One more” was not added/);
  assert.equal(addTodo(items, 'work', 'Work item', {}, now).length, 201);
});

test('the owner can add by hand, check off, reopen, remove and clear finished items', () => {
  let items = addTodo([], 'work', '  Draft   the plan ', { due: later, remind: true }, now);
  assert.equal(items[0].title, 'Draft the plan');
  assert.equal(items[0].remind, true);
  assert.throws(() => addTodo(items, 'work', 'draft the plan', {}, now), /already on your list/);
  assert.throws(() => addTodo(items, 'blended', 'x', {}, now), /Personal or Work/);
  assert.throws(() => addTodo(items, 'work', '', {}, now), /120 characters/);
  assert.throws(() => addTodo(items, 'work', 'token ghp_' + 'a'.repeat(36), {}, now), /passwords or keys/);
  assert.throws(() => addTodo(items, 'work', 'x', { due: Number.NaN }, now), /due time/);

  items = setTodoDone(items, items[0].id, true, now + 1);
  assert.equal(items[0].completed, now + 1);
  assert(validateTodos(items));
  items = setTodoDone(items, items[0].id, false, now + 2);
  assert.equal(items[0].completed, null);
  items = addTodo(items, 'work', 'Second', {}, now);
  items = setTodoDone(items, items[1].id, true, now);
  assert.deepEqual(
    clearFinished(items, 'work').map((t) => t.title),
    ['Draft the plan'],
  );
  assert.deepEqual(clearFinished(items, 'personal').length, 2, 'only the named profile is cleared');
  assert.equal(removeTodo(items, items[0].id).length, 1);
});

test('stored items must have exactly the expected shape', () => {
  const [good] = addTodo([], 'personal', 'Fine', {}, now);
  assert.equal(validTodo(good), true);
  for (const change of [
    { extra: 1 },
    { profile: 'blended' },
    { title: 'two\nlines' },
    { title: '' },
    { title: 'x'.repeat(121) },
    { due: 'tomorrow' },
    { remind: true },
    { done: false, completed: now },
    { created: 0 },
    { id: 'short' },
  ])
    assert.equal(validTodo({ ...good, ...change }), false, JSON.stringify(change));
  assert.equal(validateTodos([good, good]), false, 'ids are unique');
  assert.equal(validateTodos('nope'), false);
});

test('the model is told the open items only when the owner shares them', () => {
  let items = addTodo([], 'personal', 'Call the dentist', { due: later }, now);
  items = addTodo(items, 'personal', 'Old chore', {}, now);
  items = setTodoDone(items, items[1].id, true, now);
  items = addTodo(items, 'work', 'Work secret item', {}, now);

  const shared = todoGuidance(items, 'personal', true, now);
  assert.match(shared, /- Call the dentist \(due /);
  assert.match(shared, /Finished lately: Old chore/);
  assert.doesNotMatch(shared, /Work secret item/, 'another profile’s items are never included');
  assert.match(shared, /only after their yes/);

  const withheld = todoGuidance(items, 'personal', false, now);
  assert.doesNotMatch(withheld, /Call the dentist \(due|Old chore/);
  assert.match(withheld, /has not shared the list/);
  assert.match(todoGuidance([], 'work', true, now), /\(none\)/);
});

test('a claimed change without a proposal is recognized, ordinary talk is not', () => {
  for (const claim of [
    'I’ve added milk to your to-do list.',
    "Done, I'll set a reminder for 9.",
    'Got it, marked that task as finished on the list.',
  ])
    assert.equal(claimsTodoChange(claim), true, claim);
  for (const fine of ['Would you like me to add that to your list?', 'Your list has three items.', '', null])
    assert.equal(claimsTodoChange(fine), false, String(fine));
});

test('reminders come due once per page, only for open items in the active profile', () => {
  let items = addTodo([], 'personal', 'Ring back', { due: later, remind: true }, now);
  items = addTodo(items, 'work', 'Work call', { due: later, remind: true }, now);
  items = addTodo(items, 'personal', 'No reminder', { due: later }, now);
  assert.deepEqual(dueReminders(items, 'personal', later - 1), []);
  const due = dueReminders(items, 'personal', later);
  assert.deepEqual(
    due.map((t) => t.title),
    ['Ring back'],
  );
  assert.deepEqual(dueReminders(items, 'personal', later, new Set([due[0].id])), []);
  assert.deepEqual(dueReminders(setTodoDone(items, due[0].id, true, later), 'personal', later), []);
});

test('the review lists each change in plain words', () => {
  const text = describeRequests([
    { op: 'add', title: 'Call the dentist', due: later, remind: true },
    { op: 'add', title: 'Buy milk', due: null, remind: false },
    { op: 'done', title: 'Old chore' },
  ]);
  const lines = text.split('\n');
  assert.match(lines[0], /^Add: “Call the dentist” · due .+ · remind me$/);
  assert.equal(lines[1], 'Add: “Buy milk”');
  assert.equal(lines[2], 'Check off: “Old chore”');
});

test('the Mac is handed only open reminders still ahead, from every profile, soonest first', () => {
  const now = 1_800_000_000_000;
  let items = addTodo([], 'personal', 'Later one', { due: now + 5000, remind: true }, now);
  items = addTodo(items, 'work', 'Sooner one', { due: now + 1000, remind: true }, now);
  items = addTodo(items, 'personal', 'Due but no reminder', { due: now + 2000 }, now);
  items = addTodo(items, 'personal', 'No time at all', {}, now);
  items = addTodo(items, 'work', 'Finished one', { due: now + 3000, remind: true }, now);
  items = setTodoDone(items, items.at(-1).id, true, now);
  const list = remindersForMac(items, now);
  assert.deepEqual(
    list.map((r) => r.title),
    ['Sooner one', 'Later one'],
  );
  assert.deepEqual(Object.keys(list[0]), ['id', 'title', 'due']);
  assert.equal(list[0].due, now + 1000);
  assert.match(list[0].id, /^[A-Za-z0-9-]{1,64}$/);
  assert.deepEqual(
    remindersForMac(items, now + 1000).map((r) => r.title),
    ['Later one'],
    'one whose time has come is not sent',
  );
  assert.deepEqual(remindersForMac(items, now + 5000), []);
  let many = [];
  for (let n = 0; n < 70; n++)
    many = addTodo(many, 'personal', 'Item ' + n, { due: now + 100 + n, remind: true }, now);
  assert.equal(remindersForMac(many, now).length, 64);
  assert.equal(remindersForMac(many, now)[63].title, 'Item 63');
});
