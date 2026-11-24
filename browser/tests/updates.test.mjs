import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeOffer,
  describeGoingBack,
  describeOutcome,
  describeSettingsCheck,
  settingsMarks,
  updateSteps,
  wayBack,
  describeStatus,
  describeUpdate,
  updateOffer,
  updateStatus,
} from '../updates.mjs';

const a = 'a'.repeat(40),
  b = 'b'.repeat(40);
const offer = (over = {}) => ({
  installed: { version: '0.1.0-rc.1', commit: a },
  channel: 'release',
  signed: true,
  upToDate: false,
  withdrawn: null,
  target: {
    version: '0.1.0-rc.2',
    commit: b,
    tag: 'v0.1.0-rc.2',
    ahead: 3,
    notes: ['First change', 'Second change'],
  },
  ...over,
});

test('a gateway’s status is reduced to known fields, and anything else means not available', () => {
  for (const no of [
    null,
    7,
    {},
    { available: 'yes' },
    { available: false, installed: { version: '1.0.0', commit: a } },
  ])
    assert.deepEqual(updateStatus(no), { available: false });
  const shown = updateStatus({
    available: true,
    channel: 'release',
    prerelease: true,
    installed: { version: '0.1.0-rc.1', commit: a, path: '/private/x' },
    operation: {
      kind: 'apply',
      outcome: 'succeeded',
      at: 5,
      target: b,
      targetVersion: '0.1.0-rc.2',
      message: 'x'.repeat(900),
      token: 'SECRET',
    },
    checkout: '/private/path',
  });
  assert.deepEqual(Object.keys(shown), ['available', 'channel', 'prerelease', 'installed', 'operation']);
  assert.deepEqual(shown.installed, { version: '0.1.0-rc.1', commit: a });
  assert.equal(shown.operation.message.length, 400);
  assert.doesNotMatch(JSON.stringify(shown), /SECRET|private/);
  assert.equal(
    updateStatus({ available: true, channel: 'nightly', installed: { version: '<b>', commit: 'x' } })
      .installed,
    null,
  );
  assert.equal(updateStatus({ available: true, channel: 'nightly' }).channel, 'development');
  assert.match(
    describeStatus(shown),
    /signed releases, including pre-releases\. Installed: 0\.1\.0-rc\.1 \(aaaaaaaaaaaa\)/,
  );
  assert.match(describeStatus({ available: false }), /not set up for this PEA/);
  assert.match(
    describeStatus(updateStatus({ available: true, channel: 'development' })),
    /development builds, which are not signed.*cannot be read right now/,
  );
});

test('an offer names an exact version and commit, or it is not an offer', () => {
  const good = updateOffer(offer());
  assert.deepEqual(good.target, {
    version: '0.1.0-rc.2',
    commit: b,
    tag: 'v0.1.0-rc.2',
    ahead: 3,
    notes: ['First change', 'Second change'],
  });
  assert.equal(good.signed, true);
  for (const bad of [
    null,
    {},
    offer({ installed: null }),
    offer({ target: null }),
    offer({ target: { version: '0.1.0-rc.2', commit: 'main', ahead: 1 } }),
    offer({ target: { version: 'rm -rf /', commit: b, ahead: 1 } }),
    offer({ upToDate: 'no' }),
  ])
    assert.equal(updateOffer(bad), null);
  assert.equal(
    updateOffer(offer({ channel: 'development', signed: true })).signed,
    false,
    'only the release channel is ever called signed',
  );
  const messy = updateOffer(
    offer({
      target: {
        version: '0.1.0-rc.2',
        commit: b,
        tag: '../x',
        ahead: -4,
        notes: ['ok', 7, 'x'.repeat(300), ...Array(40).fill('n')],
      },
    }),
  );
  assert.deepEqual(
    [messy.target.tag, messy.target.ahead, messy.target.notes.length, messy.target.notes[1].length],
    ['', 0, 20, 160],
  );
  assert.equal(updateOffer(offer({ upToDate: true, target: null })).target, null);
});

test('the words before and after an update say what it is and what stays', () => {
  const signed = describeUpdate(updateOffer(offer()), 'http://127.0.0.1:18770');
  assert.match(
    signed,
    /Now: 0\.1\.0-rc\.1 \(aaaaaaaaaaaa\)\nAfter: 0\.1\.0-rc\.2 \(bbbbbbbbbbbb\), release v0\.1\.0-rc\.2/,
  );
  assert.match(
    signed,
    /signed release\. Its manifest was checked against the release key this copy already trusts/,
  );
  assert.match(signed, /Changes \(3\):\n  - First change\n  - Second change/);
  assert.match(signed, /previous version is put back/);
  assert.match(signed, /settings and connection token are not touched/);
  const dev = describeUpdate(
    updateOffer(
      offer({
        channel: 'development',
        signed: false,
        target: { version: '0.1.0-rc.1.dev.3', commit: b, tag: null, ahead: 1, notes: [] },
      }),
    ),
    'http://127.0.0.1:18770',
  );
  assert.match(dev, /development build\..*No signature is checked\./);
  assert.doesNotMatch(dev, /signed release|Changes \(/);
  assert.match(
    describeOffer(updateOffer(offer())),
    /Version 0\.1\.0-rc\.2 is available \(release v0\.1\.0-rc\.2\): a signed release, 3 changes ahead/,
  );
  assert.match(
    describeOffer(updateOffer(offer({ upToDate: true, target: null }))),
    /newest signed release this copy follows\. Nothing to do/,
  );
  assert.match(
    describeOffer(updateOffer(offer({ upToDate: true, target: null, withdrawn: 'Breaks saved boards.' }))),
    /publisher has withdrawn the version you are running: Breaks saved boards\. Nothing newer is published.*update command, not from here/,
  );
  assert.match(
    describeOffer(updateOffer(offer({ withdrawn: 'Breaks saved boards.' }))),
    /withdrawn the version you are running: Breaks saved boards\. Version 0\.1\.0-rc\.2 is available/,
  );
  assert.deepEqual(describeOutcome(null), { text: '', level: '' });
  assert.deepEqual(describeOutcome({ outcome: 'succeeded', targetVersion: '0.1.0-rc.2' }), {
    text: 'Updated to 0.1.0-rc.2. Reload this page to load the new version.',
    level: 'ok',
    done: true,
  });
  assert.equal(describeOutcome({ outcome: 'started', targetVersion: '0.1.0-rc.2' }).done, false);
  const failed = describeOutcome({
    outcome: 'rolled back',
    targetVersion: '0.1.0-rc.2',
    message: 'PEA did not come back. The previous version was put back.',
  });
  assert.equal(failed.level, 'warn');
  assert.match(
    failed.text,
    /did not go through\. PEA did not come back\. The previous version was put back\./,
  );
  assert.match(describeOutcome({ outcome: 'refused', message: '' }).text, /The previous version was kept/);
});

test('the steps of an update say how far it got, and a failure shows what was put back', () => {
  const states = (op, lost) => updateSteps(op, lost).steps.map((s) => s.state);
  assert.deepEqual(states(null), ['now', 'todo', 'todo', 'todo', 'todo']);
  assert.deepEqual(states({ stage: 'files' }), ['done', 'now', 'todo', 'todo', 'todo']);
  assert.deepEqual(states({ stage: 'files' }, true), ['done', 'done', 'now', 'todo', 'todo'], 'out of reach means restarting');
  assert.deepEqual(states({ stage: 'checking' }), ['done', 'done', 'done', 'now', 'todo']);
  const done = updateSteps({ stage: 'done' });
  assert.deepEqual([done.value, done.max, done.ended, done.failed], [5, 5, true, false]);
  assert.ok(done.steps.every((s) => s.state === 'done'));
  const failing = updateSteps({ stage: 'putting back' });
  assert.deepEqual(failing.steps.map((s) => s.state), ['done', 'done', 'done', 'failed', 'now']);
  assert.equal(failing.steps[4].label, 'Putting the version you had back');
  const failed = updateSteps({ stage: 'put back' });
  assert.deepEqual([failed.failed, failed.ended, failed.steps[4].label], [true, true, 'The version you had was put back']);
});

test('the gateway’s stage and log are shown only in known shapes', () => {
  const op = updateStatus({
    available: true,
    installed: { version: '0.1.0-rc.2', commit: 'b'.repeat(40) },
    operation: {
      kind: 'apply',
      outcome: 'succeeded',
      at: 5,
      previous: 'a'.repeat(40),
      previousVersion: '0.1.0-rc.1',
      target: 'b'.repeat(40),
      targetVersion: '0.1.0-rc.2',
      stage: 'rm -rf',
      log: [{ at: 1, text: 'One\u0000line ' + 'x'.repeat(400) }, { at: 'x', text: 'no' }, 'no', { at: 2, text: '' }],
      note: 'n'.repeat(900),
      noteAt: 'soon',
    },
  }).operation;
  assert.equal(op.stage, '');
  assert.equal(op.log.length, 1);
  assert.ok(op.log[0].text.startsWith('One line ') && op.log[0].text.length === 200);
  assert.deepEqual([op.note.length, op.noteAt], [400, 0]);
});

test('going back is offered only to what the last update replaced, while that update is installed', () => {
  const a = 'a'.repeat(40),
    b = 'b'.repeat(40);
  const status = (operation, installed = { version: '0.1.0-rc.2', commit: b }) =>
    updateStatus({ available: true, installed, operation });
  const op = { kind: 'apply', outcome: 'succeeded', at: 5, previous: a, previousVersion: '0.1.0-rc.1', target: b, targetVersion: '0.1.0-rc.2' };
  assert.deepEqual(wayBack(status(op)), { version: '0.1.0-rc.1', commit: a, from: '0.1.0-rc.2' });
  for (const [why, value] of [
    ['a failed update', status({ ...op, outcome: 'rolled back' })],
    ['a go-back', status({ ...op, kind: 'rollback' })],
    ['another copy installed', status(op, { version: '0.1.0-rc.3', commit: 'c'.repeat(40) })],
    ['no previous commit', status({ ...op, previous: 'main' })],
    ['no record', status(null)],
    ['updating not set up', updateStatus({ available: false })],
  ])
    assert.equal(wayBack(value), null, why);
  const said = describeGoingBack(wayBack(status(op)), 'http://127.0.0.1:18770');
  assert.match(said, /After: 0\.1\.0-rc\.1 \(aaaaaaaaaaaa\), the version the last update replaced/);
  assert.match(said, /settings and connection token are not touched/);
  assert.match(describeOutcome({ kind: 'rollback', outcome: 'succeeded', targetVersion: '0.1.0-rc.1' }).text, /^Went back to 0\.1\.0-rc\.1\./);
});

test('the settings check says they are as they were, or names the ones that differ', () => {
  const labels = new Map([
    ['pea-device-voice-v1', 'Device voice and speed'],
    ['pea-weather-v1', 'Weather place and units'],
    ['pea-headlines-v1', 'Headline feeds'],
  ]);
  const before = settingsMarks({ 'pea-device-voice-v1': '{"rate":1.2}', 'pea-weather-v1': '{"unit":"celsius"}', 'pea-headlines-v1': '[]' });
  assert.notEqual(settingsMarks({ a: 'ab' }).a, settingsMarks({ a: 'ba' }).a);
  assert.ok(!JSON.stringify(before).includes('celsius'), 'a mark is not the setting’s text');
  assert.equal(
    describeSettingsCheck({ to: '0.1.0-rc.2', marks: before }, before, labels),
    'Settings checked: all 3 saved in this browser are exactly as they were before the move to 0.1.0-rc.2.',
  );
  const after = settingsMarks({ 'pea-device-voice-v1': '{"rate":1}', 'pea-headlines-v1': '[]', 'pea-presence-v1': '{}' });
  const said = describeSettingsCheck({ to: '0.1.0-rc.2', marks: before }, after, labels);
  assert.match(said, /^Settings checked: 1 of 3 are exactly as they were before the move to 0\.1\.0-rc\.2\./);
  assert.match(said, /Different now: Device voice and speed\./);
  assert.match(said, /No longer saved: Weather place and units\./);
  assert.match(said, /An update does not write settings/);
  assert.match(describeSettingsCheck({ to: 'x y', marks: {} }, {}, labels), /No settings were saved in this browser before the update/);
  for (const bad of [null, 'text', { marks: null }, {}]) assert.equal(describeSettingsCheck(bad, {}, labels), '');
});
