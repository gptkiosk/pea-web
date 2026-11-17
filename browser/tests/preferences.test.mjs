import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultChoices, profileChoices, validChoices } from '../preferences.mjs';

const key = 'sk-or-v1-' + 'a'.repeat(30);

test('only the fixed list of choices is ever kept', () => {
  const kept = validChoices({
    google: {
      client: 'synthetic-client.apps.googleusercontent.com',
      calendar: true,
      write: 'yes',
      mail: 1,
      token: 'ya29.SECRET',
    },
    profiles: {
      personal: {
        chat: 'local:synthetic-model',
        collaboration: 'vendor/model-name:free',
        coding: '',
        role: 'coding',
        shareIntro: true,
        shareTodos: true,
        sharePeaFiles: false,
        githubRepo: 'owner/repository',
        // None of these may survive.
        key,
        localKey: 't'.repeat(43),
        allowData: true,
        google: { token: 'ya29.SECRET' },
        github: { token: 'ghp_' + 'a'.repeat(36) },
        approvals: ['x'],
      },
      work: 'not an object',
      other: { chat: 'x' },
    },
    router: key,
  });
  assert.deepEqual(kept.google, {
    client: 'synthetic-client.apps.googleusercontent.com',
    calendar: true,
    write: false,
    mail: false,
  });
  assert.deepEqual(Object.keys(kept.profiles), ['personal', 'work', 'blended']);
  assert.deepEqual(kept.profiles.personal, {
    role: 'coding',
    chat: 'local:synthetic-model',
    collaboration: 'vendor/model-name:free',
    coding: '',
    shareIntro: true,
    shareCalendar: false,
    shareMail: false,
    shareTodos: true,
    sharePeaFiles: false,
    githubRepo: 'owner/repository',
  });
  assert.deepEqual(kept.profiles.work, defaultChoices());
  const text = JSON.stringify(kept);
  assert.doesNotMatch(text, /SECRET|sk-or-v1|ghp_|allowData|localKey|approvals|ttttt/);
});

test('anything that is not a plain choice falls back to its default', () => {
  for (const bad of [null, 7, 'x', [], { profiles: null }, { google: 'x' }])
    assert.deepEqual(validChoices(bad), validChoices(null));
  assert.deepEqual(validChoices(null).profiles.blended, defaultChoices());
  assert.equal(defaultChoices().sharePeaFiles, true, 'the one switch that starts on');
  const odd = profileChoices({
    chat: key,
    collaboration: 'has space',
    coding: 'x'.repeat(201),
    role: 'admin',
    shareIntro: 'true',
    githubRepo: '../../etc',
  });
  assert.deepEqual(odd, defaultChoices());
  assert.equal(validChoices({ google: { client: 'not-a-client-id' } }).google.client, '');
});
