// The encrypted profile file is a contract shared with the iPhone app (docs/CONTRACTS.md). These
// vectors are what any PEA app must accept and refuse; this checks them against the web importer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decryptProfile, encryptProfile, profileFormats } from '../profile-transfer.mjs';
import { introductionLimits, validIntroduction } from '../memory.mjs';

const fixtures = JSON.parse(await readFile(new URL('./fixtures/ProfileFixtures.json', import.meta.url)));
const { format } = fixtures;

test('the profile fixtures describe the format this app writes and reads', async () => {
  assert.equal(fixtures.version, 1);
  assert.deepEqual(format.iterations, profileFormats);
  assert.deepEqual({ ...format.originalAnswers, ...format.laterAnswers }, introductionLimits);
  assert.equal(Object.keys(format.originalAnswers).length, 7);
  assert.equal(Object.keys(format.laterAnswers).length, 9);
  const answers = fixtures.accepted[0].expect.introduction;
  const written = JSON.parse(await encryptProfile('personal', answers, fixtures.passphrase));
  assert.deepEqual(Object.keys(written), ['format', 'salt', 'iv', 'data']);
  assert.equal(written.format, format.current);
  assert.equal(Buffer.from(written.salt, 'base64').length, format.saltBytes);
  assert.equal(Buffer.from(written.iv, 'base64').length, format.ivBytes);
  for (const part of [written.salt, written.iv, written.data]) assert.match(part, /^[A-Za-z0-9+/]+=*$/);
  assert.deepEqual(await decryptProfile(JSON.stringify(written), fixtures.passphrase), {
    profile: 'personal',
    introduction: answers,
  });
  // The passphrase limits are counted the way the format says.
  for (const pass of ['x'.repeat(format.passphraseUnits.min - 1), 'x'.repeat(format.passphraseUnits.max + 1)])
    await assert.rejects(encryptProfile('personal', answers, pass), /12–256/);
});

test('every accepted profile file opens to exactly its answers', async () => {
  assert(fixtures.accepted.length >= 6);
  for (const vector of fixtures.accepted) {
    assert(vector.file.length <= format.fileCharacters, vector.name);
    assert.deepEqual(await decryptProfile(vector.file, fixtures.passphrase), vector.expect, vector.name);
    assert.equal(validIntroduction(vector.expect.introduction), true, vector.name);
  }
  assert(
    fixtures.accepted.some((v) => JSON.parse(v.file).format !== format.current),
    'an older file is among them',
  );
});

test('every refused profile file is refused the same way and changes nothing', async () => {
  assert(fixtures.refused.length >= 15);
  for (const vector of fixtures.refused)
    await assert.rejects(
      decryptProfile(vector.file, fixtures.passphrase),
      /Could not verify this profile file/,
      vector.name + ': ' + vector.why,
    );
  // A file larger than the limit is refused before anything is read from it.
  await assert.rejects(
    decryptProfile(' '.repeat(format.fileCharacters + 1), fixtures.passphrase),
    /under 40 KB/,
  );
});
