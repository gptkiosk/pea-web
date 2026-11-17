import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeOffer,
  describeOutcome,
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
