// The encrypted backup file is a contract meant for every PEA app (docs/CONTRACTS.md). These
// vectors are what any app must accept and refuse; this checks them against the web reader.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { backupFormat, backupLimits, openBackup, sealBackup, validBackup } from '../backup.mjs';

const fixtures = JSON.parse(await readFile(new URL('./fixtures/BackupFixtures.json', import.meta.url)));
const { format } = fixtures;

test('the backup fixtures describe the format this app writes and reads', async () => {
  assert.equal(fixtures.version, 1);
  assert.equal(format.current, backupFormat);
  assert.equal(format.iterations, backupLimits.iterations);
  assert.equal(format.fileCharacters, backupLimits.fileCharacters);
  assert.equal(format.contentBytes, backupLimits.contentBytes);
  assert.deepEqual(format.most, {
    memories: backupLimits.memories,
    todos: backupLimits.todos,
    history: backupLimits.cards,
    days: backupLimits.days,
    decks: backupLimits.decks,
  });
  const content = fixtures.accepted[0].expect;
  assert.deepEqual(Object.keys(content), format.sections);
  const written = JSON.parse(await sealBackup(content, fixtures.passphrase));
  assert.deepEqual(Object.keys(written), ['format', 'salt', 'iv', 'data']);
  assert.equal(written.format, format.current);
  assert.equal(Buffer.from(written.salt, 'base64').length, format.saltBytes);
  assert.equal(Buffer.from(written.iv, 'base64').length, format.ivBytes);
  for (const part of [written.salt, written.iv, written.data]) assert.match(part, /^[A-Za-z0-9+/]+=*$/);
  assert.deepEqual(await openBackup(JSON.stringify(written), fixtures.passphrase), content);
  const again = JSON.parse(await sealBackup(content, fixtures.passphrase));
  assert.notEqual(again.salt, written.salt, 'a fresh salt for every file');
  assert.notEqual(again.iv, written.iv, 'a fresh iv for every file');
  for (const pass of [
    'x'.repeat(format.passphraseUnits.min - 1),
    'x'.repeat(format.passphraseUnits.max + 1),
  ]) {
    await assert.rejects(sealBackup(content, pass), /12–256/);
    await assert.rejects(openBackup(JSON.stringify(written), pass), /12–256/);
  }
});

test('every accepted backup file opens to exactly its contents', async () => {
  assert(fixtures.accepted.length >= 5);
  for (const vector of fixtures.accepted) {
    assert(vector.file.length <= format.fileCharacters, vector.name);
    assert.deepEqual(await openBackup(vector.file, fixtures.passphrase), vector.expect, vector.name);
    assert.equal(validBackup(vector.expect), true, vector.name);
  }
  assert(fixtures.accepted.some((v) => v.expect.profile === 'work'));
});

test('every refused backup file is refused the same way', async () => {
  assert(fixtures.refused.length >= 30);
  for (const vector of fixtures.refused)
    await assert.rejects(
      openBackup(vector.file, fixtures.passphrase),
      /^ServiceError: Could not verify this backup file\. Check the file and passphrase; nothing was changed\.$/,
      vector.name + ': ' + vector.why,
    );
  await assert.rejects(
    openBackup(' '.repeat(format.fileCharacters + 1), fixtures.passphrase),
    /under 1\.2 MB/,
  );
  for (const junk of ['', 'not json', '{}', 'null', '[]', 7, null])
    await assert.rejects(openBackup(junk, fixtures.passphrase), /Could not verify|under 1\.2 MB/);
});
