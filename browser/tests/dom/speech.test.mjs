// Browser-level checks for reading aloud with a provider voice (ElevenLabs, Fish Audio).
// The providers are a stand-in answered by this test, reached through the real gateway's test
// option. No real provider, key or account is used and nothing leaves this machine.
// Run with: node --test browser/tests/dom/speech.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { askModel, browserSkipReason, openConnectedPage, shortSound, startStack } from './harness.mjs';

const skip = browserSkipReason();
const elevenKey = 'sk_SYNTHETICeleven0123456789abcd',
  fishKey = 'SYNTHETICfish0123456789abcdef0123',
  long = Array.from({ length: 400 }, (_, i) => `Sentence number ${i} of a long synthetic reply.`).join(' ');
let stack,
  failWith = 0;

before(
  async () => {
    if (skip) return;
    stack = await startStack((said) => (said.includes('long') ? long : 'A plain synthetic reply.'), {
      voices: (request) => {
        if (request.method === 'GET' && request.path.startsWith('/v2/voices'))
          return {
            type: 'application/json',
            data: JSON.stringify({
              voices: [
                {
                  voice_id: 'voiceAAAA1111',
                  name: 'Synthetic Ada',
                  preview_url: 'https://evil.example/a.mp3',
                },
                { voice_id: 'voiceBBBB2222', name: 'Synthetic Bo' },
              ],
            }),
          };
        if (request.method === 'GET' && request.path.startsWith('/model'))
          return { type: 'application/json', data: JSON.stringify({ items: [] }) };
        if (request.method === 'POST' && failWith)
          return { status: failWith, type: 'application/json', data: '{"detail":"RAW PROVIDER WORDS"}' };
        if (request.method === 'POST') return { type: 'audio/mpeg', data: shortSound() };
        return null;
      },
    });
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

const spoken = () => stack.voices.requests.filter((r) => r.method === 'POST');
const state = (page) => page.evaluate(`document.querySelector('#provider-voice-note').dataset.state`);
const reviewOpen = (page) => page.evaluate(`document.querySelector('#review').open`);
// Device speech is replaced by a marker, so a test can tell if PEA fell back to it.
const watchDeviceVoice = (page) =>
  page.evaluate(
    `(() => { window.peaDeviceSpoke = 0; if (window.speechSynthesis) window.speechSynthesis.speak = () => { window.peaDeviceSpoke++; }; })()`,
  );
async function chooseElevenLabs(page) {
  await page.fill('#provider-voice', 'elevenlabs');
  await page.fill('#provider-voice-key', elevenKey);
  await page.click('#provider-voice-load');
  await page.waitFor(
    `[...document.querySelector('#provider-voice-choice').options].some((o) => o.value === 'voiceAAAA1111')`,
    'the voice list',
  );
  await page.fill('#provider-voice-choice', 'voiceAAAA1111');
}
async function readAloud(page) {
  await page.click('#chat-read');
}

test(
  'a provider voice is used only after its review, with the exact reply and nothing kept of the key',
  { skip, timeout: 60000 },
  async () => {
    const page = await openConnectedPage(stack);
    stack.voices.requests.length = 0;
    await watchDeviceVoice(page);
    await askModel(stack, page, 'A plain question.');

    // Until a provider is chosen, reading aloud contacts no provider.
    assert.match(
      await page.text('#provider-voice-status'),
      /browser or device voice\. No provider is contacted/,
    );
    await readAloud(page);
    assert.equal(stack.voices.requests.length, 0);
    assert.equal(await page.evaluate('window.peaDeviceSpoke'), 1, 'the device voice read it');

    await chooseElevenLabs(page);
    const listing = stack.voices.requests.filter((r) => r.method === 'GET');
    assert.equal(listing.length, 1);
    assert.equal(listing[0].headers['xi-api-key'], elevenKey);
    assert.match(await page.text('#provider-voice-status'), /Read aloud uses Synthetic Ada from ElevenLabs/);
    assert.equal(spoken().length, 0, 'listing and choosing speak nothing');

    await readAloud(page);
    await page.waitFor(`document.querySelector('#review').open`, 'the spending review');
    assert.match(await page.text('#review-title'), /Read aloud with ElevenLabs\?/);
    const shown = await page.text('#review-body');
    assert.match(shown, /Voice: Synthetic Ada · ElevenLabs/);
    assert(shown.includes(stack.gateway.origin), 'the review names the gateway');
    assert.match(shown, /\$0\.04 per 1,000 characters/);
    assert.match(shown, /does not fall back to another voice/);
    assert.doesNotMatch(shown, new RegExp(elevenKey), 'the key is not shown');
    await page.click('#review-cancel');
    await page.waitFor(`!document.querySelector('#review').open`);
    assert.equal(spoken().length, 0, 'cancel sends nothing');

    await readAloud(page);
    await page.waitFor(`document.querySelector('#review').open`, 'the review again');
    await page.click('#review-approve');
    await page.waitFor(
      `['playing','idle'].includes(document.querySelector('#provider-voice-note').dataset.state) && /Reading with|Finished reading/.test(document.querySelector('#provider-voice-note').textContent)`,
      'speech to start',
    );
    assert.equal(spoken().length, 1);
    assert.match(spoken()[0].path, /^\/v1\/text-to-speech\/voiceAAAA1111\?/);
    assert.equal(spoken()[0].headers['xi-api-key'], elevenKey);
    assert.equal(JSON.parse(spoken()[0].body).text, 'A plain synthetic reply.');
    assert.equal(spoken()[0].headers.authorization, undefined, 'the gateway token is not passed on');
    await page.waitFor(
      `/Finished reading/.test(document.querySelector('#provider-voice-note').textContent)`,
      'the sound to finish playing',
    );

    // The same voice in the same tab and profile does not ask again.
    await readAloud(page);
    await page.waitFor(
      `/Finished reading/.test(document.querySelector('#provider-voice-note').textContent) && document.querySelector('#provider-voice-note').dataset.state === 'idle'`,
      'the second read-aloud',
    );
    assert.equal(await reviewOpen(page), false);
    await page.waitFor(`true`);
    assert.equal(spoken().length, 2);
    assert.equal(await page.evaluate('window.peaDeviceSpoke'), 1, 'the device voice was not used again');

    const saved = await page.evaluate(`JSON.stringify(Object.entries(localStorage))`);
    assert.doesNotMatch(saved, new RegExp(elevenKey), 'the key is never stored');
    assert.match(saved, /voiceAAAA1111/, 'only the choice of voice is remembered');
    assert.deepEqual(page.outsideRequests(), [], 'the page itself contacted no provider');
    await page.close();
  },
);

test(
  'when the provider fails PEA says why, stays silent and does not use another voice',
  { skip, timeout: 60000 },
  async () => {
    const page = await openConnectedPage(stack);
    stack.voices.requests.length = 0;
    await watchDeviceVoice(page);
    await askModel(stack, page, 'A plain question.');
    await chooseElevenLabs(page);
    try {
      for (const [status, words] of [
        [402, /ElevenLabs says your key has no credit/],
        [401, /ElevenLabs rejected your key/],
        [500, /could not be reached or failed/],
      ]) {
        failWith = status;
        const before = spoken().length;
        await readAloud(page);
        if (!before) {
          await page.waitFor(`document.querySelector('#review').open`, 'the spending review');
          await page.click('#review-approve');
        }
        await page.waitFor(
          `${JSON.stringify(words.source)} && new RegExp(${JSON.stringify(words.source)}).test(document.querySelector('#provider-voice-note').textContent)`,
          'the explanation for ' + status,
        );
        const said = await page.text('#provider-voice-note');
        assert.match(said, /Nothing was read aloud, and PEA did not switch to another voice/);
        assert.doesNotMatch(
          said + (await page.evaluate(`window.peaNotices.join(' ')`)),
          /RAW PROVIDER WORDS/,
        );
        assert.equal(spoken().length, before + 1, 'one try, no retry');
        assert.equal(await state(page), 'idle');
      }
      assert.equal(await page.evaluate('window.peaDeviceSpoke'), 0, 'the device voice never spoke');
    } finally {
      failWith = 0;
    }
    await page.close();
  },
);

test(
  'a reply too long for a provider voice is not sent whole, and the short version is',
  { skip, timeout: 60000 },
  async () => {
    const page = await openConnectedPage(stack);
    stack.voices.requests.length = 0;
    await askModel(stack, page, 'Give me the long one.');
    await chooseElevenLabs(page);
    await readAloud(page);
    await page.waitFor(`document.querySelector('#speech-length').open`, 'the long-reply choice');
    await page.click('#speech-full');
    await page.waitFor(`window.peaNotices.some((n) => /more than the 3,000/.test(n))`, 'the refusal');
    assert.equal(await reviewOpen(page), false, 'nothing is reviewed for text that will not be sent');
    assert.equal(spoken().length, 0);

    await readAloud(page);
    await page.waitFor(`document.querySelector('#speech-length').open`, 'the long-reply choice');
    const excerpt = await page.evaluate(`document.querySelector('#speech-excerpt').textContent`);
    await page.click('#speech-short');
    await page.waitFor(`document.querySelector('#review').open`, 'the spending review');
    await page.click('#review-approve');
    await page.waitFor(
      `/Reading with|Finished reading/.test(document.querySelector('#provider-voice-note').textContent)`,
      'speech to start',
    );
    assert.equal(spoken().length, 1);
    assert.equal(JSON.parse(spoken()[0].body).text, excerpt.trim());
    await page.close();
  },
);

test(
  'changing provider forgets the key, a typed voice ID works, and without the gateway nothing is sent',
  { skip, timeout: 60000 },
  async () => {
    const page = await openConnectedPage(stack);
    stack.voices.requests.length = 0;
    await askModel(stack, page, 'A plain question.');
    await chooseElevenLabs(page);

    await page.fill('#provider-voice', 'fish');
    assert.equal(await page.evaluate(`document.querySelector('#provider-voice-key').value`), '');
    assert.match(await page.text('#provider-voice-status'), /Paste your Fish Audio key/);
    await readAloud(page);
    await page.waitFor(`window.peaNotices.some((n) => /provider voice is not ready/.test(n))`, 'the refusal');
    assert.equal(spoken().length, 0, 'the ElevenLabs key is not sent to Fish Audio');

    await page.fill('#provider-voice-key', fishKey);
    await page.fill('#provider-voice-id', '../../wallet');
    assert.match(await page.text('#provider-voice-note'), /8 to 64 letters and digits/);
    await page.fill('#provider-voice-id', 'a1b2c3d4e5f60718293a4b5c6d7e8f90');
    await readAloud(page);
    await page.waitFor(`document.querySelector('#review').open`, 'the review for the new provider');
    assert.match(await page.text('#review-body'), /Fish Audio[\s\S]*\$15 per million bytes/);
    await page.click('#review-approve');
    await page.waitFor(
      `/Reading with|Finished reading/.test(document.querySelector('#provider-voice-note').textContent)`,
      'speech to start',
    );
    const sent = spoken();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].path, '/v1/tts');
    assert.equal(sent[0].headers.authorization, 'Bearer ' + fishKey);
    assert.equal(JSON.parse(sent[0].body).reference_id, 'a1b2c3d4e5f60718293a4b5c6d7e8f90');
    assert(
      !stack.voices.requests.some(
        (r) => JSON.stringify(r.headers).includes(elevenKey) && r.path !== '/v2/voices?page_size=100',
      ),
    );

    // Without the gateway connection a provider voice cannot be used, and nothing is sent.
    await page.click('#local-forget');
    await page.evaluate(`document.querySelector('#provider-voice').dispatchEvent(new Event('focus'))`);
    await readAloud(page);
    await page.waitFor(
      `window.peaNotices.filter((n) => /provider voice is not ready/.test(n)).length >= 2`,
      'the refusal',
    );
    assert.equal(spoken().length, 1);
    await page.close();
  },
);
