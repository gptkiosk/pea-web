import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeSpeechReview,
  speechChoice,
  speechFailure,
  speechLimits,
  speechProviders,
  speechText,
  validSpeechKey,
  validVoiceId,
  voiceRows,
  voicesFound,
} from '../speech.mjs';
import { LocalModel } from '../local-model.mjs';

const control = (code) => String.fromCodePoint(code);

test('a saved voice choice never holds a key and only names a known provider', () => {
  assert.deepEqual(speechChoice({ provider: 'fish', voice: 'a'.repeat(32), name: ' Bo ', key: 'SECRET' }), {
    provider: 'fish',
    voice: 'a'.repeat(32),
    name: 'Bo',
  });
  assert.deepEqual(speechChoice({ provider: 'elevenlabs', voice: '../x', name: 'N' }), {
    provider: 'elevenlabs',
    voice: '',
    name: '',
  });
  for (const bad of [
    null,
    7,
    {},
    { provider: 'openai', voice: 'voiceAAAA1111' },
    { provider: 'constructor' },
  ])
    assert.deepEqual(speechChoice(bad), { provider: '', voice: '', name: '' });
  assert.equal(speechChoice({ provider: 'fish', voice: 'voiceAAAA1111' }).name, 'voiceAAAA1111');
});

test('keys and voice ids are plain tokens that cannot carry a path or a header', () => {
  assert(validSpeechKey('sk_' + 'a'.repeat(40)));
  for (const bad of [
    '',
    'short',
    'k'.repeat(201),
    'k'.repeat(20) + ' x',
    'k'.repeat(20) + '\r\nX: 1',
    7,
    null,
  ])
    assert.equal(validSpeechKey(bad), false, String(bad).slice(0, 20));
  assert(validVoiceId('voiceAAAA1111'));
  for (const bad of ['', 'short', '../../v1/user', 'voice/AAAA1111', 'voiceAAAA1111?x', 'v'.repeat(65), 7])
    assert.equal(validVoiceId(bad), false, String(bad).slice(0, 20));
});

test('listed voices are reduced to ids and clean names', () => {
  const rows = voiceRows({
    voices: [
      { id: 'voiceAAAA1111', name: ' Ada' + control(9) + 'Lovelace ', preview_url: 'https://evil.example/x' },
      { id: 'bad id', name: 'Dropped' },
      { id: 'voiceBBBB2222', name: 7 },
      { id: 'voiceCCCC3333', name: '   ' },
      'text',
      ...Array.from({ length: 150 }, (_, i) => ({ id: 'many' + String(i).padStart(8, '0'), name: 'V' + i })),
    ],
  });
  assert.deepEqual(rows[0], { id: 'voiceAAAA1111', name: 'Ada Lovelace' });
  assert.equal(rows.length, speechLimits.voices);
  assert(rows.every((v) => Object.keys(v).join() === 'id,name'));
  for (const bad of [null, {}, { voices: 'x' }, []]) assert.deepEqual(voiceRows(bad), []);
});

test('text for a provider voice is bounded by characters and never silently cut', () => {
  assert.deepEqual(speechText('  Hello.\nSecond line.  '), {
    ok: true,
    count: 19,
    text: 'Hello.\nSecond line.',
  });
  assert.equal(speechText('bell' + control(7) + 'here').text, 'bell here');
  const seedling = String.fromCodePoint(0x1f331);
  assert.equal(speechText(seedling.repeat(speechLimits.text)).ok, true, 'counted as the gateway counts');
  const long = speechText('a'.repeat(speechLimits.text + 1));
  assert.equal(long.ok, false);
  assert.match(long.why, /3,001 characters, more than the 3,000/);
  assert.match(long.why, /Nothing was sent/);
  for (const empty of ['', '   \n', null, 7]) assert.equal(speechText(empty).ok, false);
  assert.equal(speechText('half ' + String.fromCharCode(0xd83c)).ok, false, 'a broken pair is refused');
});

test('a failure is explained in PEA’s words and says no other voice was used', () => {
  for (const [reason, words] of [
    ['key', /ElevenLabs rejected your key/],
    ['credit', /no credit/],
    ['busy', /busy or limiting/],
    ['voice', /did not accept this voice/],
    ['failed', /could not be reached or failed/],
  ]) {
    const said = speechFailure('elevenlabs', 502, reason);
    assert.match(said, words);
    assert.match(said, /Nothing was read aloud, and PEA did not switch to another voice\./);
  }
  assert.match(speechFailure('fish', 401), /gateway rejected its connection token/);
  assert.match(speechFailure('fish', 404), /cannot use provider voices yet/);
  assert.match(speechFailure('fish', 429), /still running/);
  assert.match(
    speechFailure('fish', 502, 'constructor'),
    /did not answer/,
    'an unknown reason is not looked up',
  );
  assert.match(speechFailure('nobody', 502, 'key'), /^The voice provider rejected your key/);
});

test('the review names the provider, the gateway, the price as a dated quote, and the limits', () => {
  for (const provider of Object.keys(speechProviders)) {
    const shown = describeSpeechReview({
      provider,
      voice: 'Synthetic Ada',
      profile: 'personal',
      origin: 'http://127.0.0.1:18770',
    });
    const p = speechProviders[provider];
    assert.match(shown, new RegExp(`Voice: Synthetic Ada · ${p.name}`));
    assert.match(shown, /Profile: personal/);
    assert.match(shown, /your PEA gateway at http:\/\/127\.0\.0\.1:18770/);
    assert(shown.includes(p.price));
    assert.match(shown, /as (ElevenLabs|Fish Audio) listed on 16 November 2026/);
    assert.match(shown, /sets no monthly cap/);
    assert.match(shown, /3,000 characters/);
    assert.match(shown, /does not fall back to another voice/);
    assert.match(shown, /without asking again/);
  }
});

const gateway = (answer, calls = []) =>
  new LocalModel('http://127.0.0.1:18770', async (url, options) => {
    calls.push({ url, options });
    return answer(url, options);
  });
const token = 't'.repeat(43),
  key = 'k'.repeat(32);

test('speech is asked of the owner’s own gateway only, with the provider key in the body', async () => {
  const calls = [];
  const sound = new Uint8Array([73, 68, 51, 1, 2, 3]);
  const local = gateway(() => new Response(sound, { headers: { 'Content-Type': 'audio/mpeg' } }), calls);
  const data = await local.speak(token, { provider: 'fish', key, voice: 'a'.repeat(32), text: 'Hello.' });
  assert.deepEqual([...new Uint8Array(data)], [...sound]);
  assert.equal(calls[0].url, 'http://127.0.0.1:18770/v1/speak');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer ' + token);
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.redirect, 'error');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    provider: 'fish',
    key,
    voice: 'a'.repeat(32),
    text: 'Hello.',
  });
  assert(!calls[0].url.includes(key), 'the key is never in an address');
});

test('a gateway answer that is not sound is a failure, and its words are not shown', async () => {
  for (const [response, words] of [
    [() => new Response('{"error":"RAW WORDS","reason":"credit"}', { status: 502 }), /no credit/],
    [() => new Response('<html>RAW WORDS</html>', { status: 502 }), /did not answer/],
    [() => new Response('RAW WORDS', { headers: { 'Content-Type': 'text/html' } }), /did not answer/],
    [() => new Response(new Uint8Array(0), { headers: { 'Content-Type': 'audio/mpeg' } }), /did not answer/],
    [() => new Response('{}', { status: 404 }), /cannot use provider voices yet/],
  ]) {
    const error = await gateway(response)
      .speak(token, { provider: 'fish', key, voice: 'a'.repeat(32), text: 'Hello.' })
      .catch((e) => e);
    assert.match(error.message, words);
    assert.doesNotMatch(error.message, /RAW WORDS/);
  }
  const listed = await gateway(() => new Response('{"voices":[{"id":"voiceAAAA1111","name":"Ada"}]}')).voices(
    token,
    'elevenlabs',
    key,
  );
  assert.deepEqual(voiceRows(listed), [{ id: 'voiceAAAA1111', name: 'Ada' }]);
  const refused = await gateway(() => new Response('{"error":"RAW WORDS","reason":"key"}', { status: 502 }))
    .voices(token, 'elevenlabs', key)
    .catch((e) => e);
  assert.match(refused.message, /ElevenLabs rejected your key/);
  await assert.rejects(() => gateway(() => new Response('{}')).speak('short', {}), /connection token/);
});

test('what was found is said plainly, including when a key has made no voices of its own', () => {
  assert.match(voicesFound('elevenlabs', 3, 0), /^3 voices listed\. Listing costs nothing/);
  assert.match(voicesFound('elevenlabs', 1, 0), /^1 voice listed\./);
  assert.match(
    voicesFound('elevenlabs', 0, 0),
    /ElevenLabs listed no voices for this key\. Paste a voice ID below\./,
  );
  assert.match(voicesFound('fish', 2, 40), /^2 voices of your own and 40 licensed voices listed\./);
  assert.match(voicesFound('fish', 1, 0), /^1 voice of your own listed\./);
  assert.match(
    voicesFound('fish', 0, 40),
    /made no voices of your own on Fish Audio, so these are 40 voices it has licensed\. For any other voice, paste its ID below\./,
  );
  assert.match(voicesFound('fish', 0, 0), /Fish Audio listed no voices\. Paste a voice ID below\./);
  assert.match(
    voicesFound('fish', 2, null),
    /2 voices of your own listed\. Fish Audio’s licensed voices could not be listed/,
  );
  assert.match(
    voicesFound('fish', 0, null),
    /could not be listed just now\. Paste a voice ID below, or try again\./,
  );
});
