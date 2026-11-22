// Browser-level checks for "I type, you talk": the owner types, PEA reads each reply aloud, and
// the microphone is never used. The device voice is a stand-in that records what it was given.
// Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { askModel, browserSkipReason, openConnectedPage, startStack } from './harness.mjs';

const skip = browserSkipReason();
const options = { skip, timeout: 90000 };
const long = Array.from({ length: 40 }, (_, i) => `Synthetic sentence number ${i + 1} of a long reply.`).join(
  ' ',
);
const choices =
  'Which day?\n```pea-choices\n' +
  JSON.stringify({ op: 'choose', question: 'Which day?', options: ['Monday', 'Tuesday'] }) +
  '\n```\n';

let stack;
before(
  async () => {
    if (!skip)
      stack = await startStack((said) =>
        said.includes('long') ? long : said.includes('pick') ? choices : 'A short synthetic reply.',
      );
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

// A device voice that records, and a microphone that counts every attempt to use it.
const standIns = `(() => {
  window.spoken = [];
  window.cancelled = 0;
  window.micAsked = 0;
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak: (u) => window.spoken.push(u.text), cancel() { window.cancelled++; }, getVoices: () => [], addEventListener() {} } });
  const Recognition = function () { window.micAsked++; };
  Recognition.prototype.start = () => { window.micAsked++; };
  window.SpeechRecognition = window.webkitSpeechRecognition = Recognition;
  if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { window.micAsked++; throw new Error('not in this test'); };
})()`;
const pressed = (page, id = 'chat-listen') =>
  page.evaluate(`document.getElementById(${JSON.stringify(id)}).getAttribute('aria-pressed')`);
const say = async (page, words) => {
  const sent = stack.model.requests.length;
  await page.fill('#thought', words);
  await page.evaluate(`document.querySelector('#composer').requestSubmit()`);
  await page.waitFor(`!document.querySelector('#profile').disabled`, 'the reply to finish');
  assert.equal(stack.model.requests.length, sent + 1, 'one request');
};

test(
  'off by default; when on, each typed message’s reply is read aloud and the microphone is not used',
  options,
  async () => {
    const page = await openConnectedPage(stack);
    await page.evaluate(standIns);
    assert.equal(await pressed(page), 'false', 'the mode is off until the owner turns it on');
    await askModel(stack, page, 'Hello there.');
    assert.deepEqual(await page.evaluate(`window.spoken`), [], 'nothing is read while it is off');

    await page.evaluate(`document.getElementById('chat-listen').click()`);
    assert.equal(await pressed(page), 'true');
    assert.equal(await pressed(page, 'collab-listen'), 'true', 'one mode for both workspaces');
    assert.ok(
      (await page.evaluate(`window.peaNotices`)).some((n) =>
        /I type, you talk is on.*does not listen; the microphone is not used/.test(n),
      ),
    );
    assert.equal(await page.evaluate(`localStorage.getItem('pea-type-and-listen-v1')`), 'on');

    await say(page, 'Tell me something.');
    await page.waitFor(`window.spoken.length === 1`, 'the reply read aloud');
    assert.deepEqual(await page.evaluate(`window.spoken`), ['A short synthetic reply.']);

    // A long reply is read whole by the device voice, with no question in the way.
    await say(page, 'Now a long one.');
    await page.waitFor(`window.spoken.length === 2`, 'the long reply read aloud');
    assert.equal((await page.evaluate(`window.spoken`))[1], long);
    assert.equal(await page.evaluate(`document.getElementById('speech-length').open`), false);

    // Looking at another window does not cut the reading off, and a new message ends the old reading.
    const before = await page.evaluate(`window.cancelled`);
    await page.evaluate(`(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  })()`);
    assert.equal(
      await page.evaluate(`window.cancelled`),
      before,
      'the reading goes on while the page is hidden',
    );
    await say(page, 'And another.');
    await page.waitFor(`window.spoken.length === 3`, 'the next reply, read while the page is hidden');
    assert.ok((await page.evaluate(`window.cancelled`)) > before, 'sending ends what was being read');

    // Answers a reply offers are read after it; a pressed answer's reply is read too.
    await say(page, 'Help me pick.');
    await page.waitFor(`window.spoken.length === 4`, 'the question read aloud');
    assert.match(
      (await page.evaluate(`window.spoken`))[3],
      /Which day\? Option 1: Monday\. Option 2: Tuesday\./,
    );
    await page.evaluate(`document.querySelector('#messages .choice').click()`);
    await page.waitFor(`window.spoken.length === 5`, 'the reply to the pressed answer');
    assert.equal(stack.model.requests.at(-1).messages.at(-1).content, 'Monday');

    assert.equal(await page.evaluate(`window.micAsked`), 0, 'the microphone was never asked for');
    assert.equal(await page.evaluate(`document.getElementById('voice-consent').open`), false);

    // The choice survives a reload, and turning it off stops the reading.
    await page.evaluate(`location.reload()`);
    await page.waitFor(
      `document.getElementById('chat-listen')?.getAttribute('aria-pressed') === 'true'`,
      'the reload',
    );
    await page.evaluate(standIns);
    await page.evaluate(`document.getElementById('chat-listen').click()`);
    assert.equal(await pressed(page), 'false');
    assert.equal(await page.evaluate(`localStorage.getItem('pea-type-and-listen-v1')`), null);
    assert.ok((await page.evaluate(`window.cancelled`)) > 0, 'turning it off stops any reading');
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();
  },
);
