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
        // This key's account has made no voice of its own; the provider's licensed page has two.
        if (request.method === 'GET' && request.path === '/model?licensed=true&language=en&page_size=100')
          return {
            type: 'application/json',
            data: JSON.stringify({
              items: [
                {
                  _id: 'c1b2c3d4e5f60718293a4b5c6d7e8f90',
                  title: 'Synthetic Narrator',
                  type: 'tts',
                  state: 'trained',
                },
                {
                  _id: 'd1b2c3d4e5f60718293a4b5c6d7e8f90',
                  title: 'Synthetic Calm',
                  type: 'tts',
                  state: 'trained',
                },
                {
                  _id: 'e1b2c3d4e5f60718293a4b5c6d7e8f90',
                  title: 'Not ready',
                  type: 'tts',
                  state: 'training',
                },
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

test(
  'voice setup shows one step at a time, and a Fish Audio key with no voices of its own still gets a list',
  { skip, timeout: 60000 },
  async () => {
    const page = await openConnectedPage(stack);
    stack.voices.requests.length = 0;
    const shown = (id) =>
      page.evaluate(
        `(() => { const e = document.querySelector('#${id}'); return !e.hidden && e.getClientRects().length > 0; })()`,
      );
    await page.evaluate(`document.querySelector('#collab-config').click()`);
    await page.evaluate(`document.querySelector('.settings-tile[data-place="voices"]').click()`);
    assert.equal(await shown('provider-voice'), true, 'the voice section is on screen');
    await page.fill('#provider-voice', 'fish');
    assert.equal(await page.text('#provider-voice-key-label'), 'Your Fish Audio key');
    for (const id of ['provider-voice-load', 'provider-voice-pick', 'provider-voice-test'])
      assert.equal(await shown(id), false, id + ' waits for a key');

    await page.fill('#provider-voice-key', fishKey);
    assert.equal(await shown('provider-voice-load'), true);
    assert.equal(await shown('provider-voice-pick'), true);
    assert.equal(await shown('provider-voice-test'), false, 'nothing to try before a voice is chosen');
    assert.match(await page.text('#provider-voice-id-help'), /fish\.audio/);
    assert.equal(await page.text('#provider-voice-load'), 'Load voices');

    await page.click('#provider-voice-load');
    await page.waitFor(`document.querySelector('#provider-voice-choice optgroup')`, 'the licensed voices');
    assert.deepEqual(
      await page.evaluate(
        `[...document.querySelectorAll('#provider-voice-choice optgroup')].map((g) => [g.label, [...g.children].map((o) => o.textContent)])`,
      ),
      [['Fish Audio licensed voices (English)', ['Synthetic Narrator', 'Synthetic Calm']]],
    );
    assert.match(
      await page.text('#provider-voice-note'),
      /made no voices of your own on Fish Audio, so these are 2 voices it has licensed/,
    );
    assert.deepEqual(
      stack.voices.requests.map((r) => [r.method, r.path, r.headers.authorization]),
      [
        ['GET', '/model?self=true&page_size=100', 'Bearer ' + fishKey],
        ['GET', '/model?licensed=true&language=en&page_size=100', 'Bearer ' + fishKey],
      ],
      'two fixed requests, nothing else',
    );
    // The result is said beside the button that asked, above the list it describes.
    assert.equal(
      await page.evaluate(
        `(() => { const y = (id) => document.querySelector('#' + id).getBoundingClientRect().top; return y('provider-voice-load') < y('provider-voice-note') && y('provider-voice-note') < y('provider-voice-choice'); })()`,
      ),
      true,
    );

    await page.fill('#provider-voice-choice', 'c1b2c3d4e5f60718293a4b5c6d7e8f90');
    assert.match(
      await page.text('#provider-voice-status'),
      /Read aloud uses Synthetic Narrator from Fish Audio/,
    );
    assert.equal(await shown('provider-voice-test'), true);
    // Try and Turn off are drawn as buttons, side by side.
    const drawn = await page.evaluate(
      `['provider-voice-test', 'provider-voice-forget'].map((id) => { const e = document.querySelector('#' + id), s = getComputedStyle(e), r = e.getBoundingClientRect(); return { border: parseFloat(s.borderTopWidth), height: r.height, top: Math.round(r.top) }; })`,
    );
    for (const b of drawn) assert(b.border >= 1 && b.height >= 44, JSON.stringify(b));

    // ElevenLabs has no licensed page: one request, one plain list.
    stack.voices.requests.length = 0;
    await chooseElevenLabs(page);
    assert.equal(
      await page.evaluate(`document.querySelectorAll('#provider-voice-choice optgroup').length`),
      0,
    );
    assert.deepEqual(
      stack.voices.requests.map((r) => r.path),
      ['/v2/voices?page_size=100'],
    );
    assert.match(await page.text('#provider-voice-note'), /Voice set to Synthetic Ada|2 voices listed/);
    await page.close();
  },
);
