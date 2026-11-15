import test from 'node:test';
import assert from 'node:assert/strict';
import { fileDropPlan, localFileKind, localFileLimit, storyDraftFromMessage } from '../dragdrop.mjs';

test('a local file is accepted by the same rules as the file picker', () => {
  assert.deepEqual(localFileKind('notes.md', 'text/markdown', 10), {
    image: false,
    kind: 'document',
    mimeType: 'text/plain',
  });
  assert.equal(localFileKind('script.PY', '', 10).kind, 'code');
  assert.equal(localFileKind('flow.mmd', '', 10).kind, 'diagram');
  assert.deepEqual(localFileKind('photo.bin', 'image/png', 10), {
    image: true,
    kind: 'image',
    mimeType: 'image/png',
  });
  assert.match(localFileKind('setup.exe', 'application/octet-stream', 10).error, /text\/code file/);
  assert.match(localFileKind('page.html', 'text/html', 10).error, /text\/code file/);
  assert.match(localFileKind('vector.svg', 'image/svg+xml', 10).error, /text\/code file/);
  assert.match(localFileKind('big.txt', 'text/plain', localFileLimit + 1).error, /under 4 MB/);
  assert.equal(localFileKind('edge.txt', 'text/plain', localFileLimit).kind, 'document');
  for (const bad of [
    ['', 'text/plain', 1],
    [null, 'text/plain', 1],
    ['a.txt', 'text/plain', Number.NaN],
    ['a.txt', 'text/plain', -1],
  ])
    assert(localFileKind(...bad).error);
});

test('files open on Greenhouse and are selected for the next reviewed request on Chat', () => {
  const ready = { count: 1, profile: 'personal', busy: false, dialogOpen: false };
  assert.deepEqual(fileDropPlan({ ...ready, target: 'greenhouse' }), { action: 'open', note: '' });
  assert.deepEqual(fileDropPlan({ ...ready, target: 'chat' }), { action: 'open-and-select', note: '' });
  assert.equal(fileDropPlan({ ...ready, target: 'chat', count: 3 }).note, 'Opened the first file only.');
  assert(fileDropPlan({ ...ready, target: 'today' }).refuse);
  assert(fileDropPlan({ ...ready, target: 'https://example.invalid' }).refuse);
});

test('a drop is refused while busy, in a dialog, in the Blended profile, or when empty', () => {
  const ready = { target: 'chat', count: 1, profile: 'work', busy: false, dialogOpen: false };
  assert.match(fileDropPlan({ ...ready, busy: true }).refuse, /active request/);
  assert.match(fileDropPlan({ ...ready, dialogOpen: true }).refuse, /open first/);
  assert.match(fileDropPlan({ ...ready, profile: 'blended' }).refuse, /Personal or Work/);
  assert(fileDropPlan({ ...ready, count: 0 }).refuse);
  assert(fileDropPlan({ ...ready, count: 1.5 }).refuse);
  for (const refused of [
    fileDropPlan({ ...ready, busy: true }),
    fileDropPlan({ ...ready, profile: 'blended' }),
  ])
    assert.equal(refused.action, undefined);
});

test('a dropped message becomes a story draft within the board limits', () => {
  assert.deepEqual(storyDraftFromMessage('  Plan the trip\n\nBook flights and a hotel.  '), {
    title: 'Plan the trip',
    details: 'Plan the trip\n\nBook flights and a hotel.',
  });
  const long = storyDraftFromMessage('x'.repeat(500) + '\n' + 'y'.repeat(5000));
  assert.equal(long.title.length, 120);
  assert.equal(long.details.length, 2400);
  assert.equal(storyDraftFromMessage('\n\n   spaced    out   title  \nrest').title, 'spaced out title');
  assert.equal(storyDraftFromMessage('one\r\ntwo').details, 'one\ntwo');
  for (const nothing of ['', '   \n ', null, undefined, 7, {}])
    assert.equal(storyDraftFromMessage(nothing), null);
});
