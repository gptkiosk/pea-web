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
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak: (u) => { window.spoken.push(u.text); window.lastUtterance = u; }, cancel() { window.cancelled++; }, getVoices: () => [], addEventListener() {} } });
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
  'off whenever the page opens; when on, each typed message’s reply is read aloud and the microphone is not used',
  options,
  async () => {
    const page = await openConnectedPage(stack);
    await page.evaluate(standIns);
    const system = () => stack.model.requests.at(-1).messages[0].content;
    const quiet = () => page.evaluate(`document.getElementById('chat-quiet').hidden`);
    const spoken = () => page.evaluate(`window.spoken`);
    const cancelled = () => page.evaluate(`window.cancelled`);
    const hint = () => page.evaluate(`document.getElementById('thought').placeholder`);
    const usual = await hint();
    assert.equal(await pressed(page), 'false', 'the mode is off until the owner turns it on');
    await askModel(stack, page, 'Hello there.');
    assert.deepEqual(await spoken(), [], 'nothing is read while it is off');
    assert.doesNotMatch(system(), /will hear this reply read aloud/);
    assert.equal(await quiet(), true);

    await page.evaluate(`document.getElementById('chat-listen').click()`);
    assert.equal(await pressed(page), 'true');
    assert.equal(await pressed(page, 'collab-listen'), 'true', 'one mode for both workspaces');
    assert.ok(
      (await page.evaluate(`window.peaNotices`)).some((n) =>
        /I type, you talk is on until you turn it off or reload.*does not listen; the microphone is not used/.test(
          n,
        ),
      ),
    );
    assert.equal(await hint(), 'Type — PEA will answer aloud…');
    assert.equal(await quiet(), true, 'nothing is being read yet');

    await say(page, 'Tell me something.');
    await page.waitFor(`window.spoken.length === 1`, 'the reply read aloud');
    assert.deepEqual(await spoken(), ['A short synthetic reply.']);
    assert.match(system(), /The owner will hear this reply read aloud, so write it to be listened to/);
    // While PEA speaks there is a button to stop it; when the reading ends by itself it goes away.
    assert.equal(await quiet(), false);
    await page.evaluate(`window.lastUtterance.onend()`);
    assert.equal(await quiet(), true);

    // A long reply is read whole by the device voice, with no question in the way.
    await say(page, 'Now a long one.');
    await page.waitFor(`window.spoken.length === 2`, 'the long reply read aloud');
    assert.equal((await spoken())[1], long);
    assert.equal(await page.evaluate(`document.getElementById('speech-length').open`), false);

    // Stop speaking ends the reading and leaves the mode on.
    assert.equal(await quiet(), false);
    let before = await cancelled();
    await page.evaluate(`document.getElementById('chat-quiet').click()`);
    assert.ok((await cancelled()) > before);
    assert.equal(await quiet(), true);
    assert.equal(await pressed(page), 'true', 'the mode stays on');
    await say(page, 'Once more, a long one.');
    await page.waitFor(`window.spoken.length === 3`, 'the next reply read aloud');

    // Looking at another window does not cut the reading off, and a new message ends the old reading.
    before = await cancelled();
    await page.evaluate(`(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    })()`);
    assert.equal(await cancelled(), before, 'the reading goes on while the page is hidden');
    await say(page, 'And another.');
    await page.waitFor(`window.spoken.length === 4`, 'the next reply, read while the page is hidden');
    assert.ok((await cancelled()) > before, 'sending ends what was being read');

    // Answers a reply offers are read after it; a pressed answer's reply is read too.
    await say(page, 'Help me pick.');
    await page.waitFor(`window.spoken.length === 5`, 'the question read aloud');
    assert.match((await spoken())[4], /Which day\? Option 1: Monday\. Option 2: Tuesday\./);
    await page.evaluate(`document.querySelector('#messages .choice').click()`);
    await page.waitFor(`window.spoken.length === 6`, 'the reply to the pressed answer');
    assert.equal(stack.model.requests.at(-1).messages.at(-1).content, 'Monday');

    assert.equal(await page.evaluate(`window.micAsked`), 0, 'the microphone was never asked for');
    assert.equal(await page.evaluate(`document.getElementById('voice-consent').open`), false);

    // Nothing is saved: turning it off restores the composer, and a reload always starts with it off.
    assert.equal(await page.evaluate(`Object.keys(localStorage).some((k) => /listen|ityt/i.test(k))`), false);
    before = await cancelled();
    await page.evaluate(`document.getElementById('chat-listen').click()`);
    assert.equal(await pressed(page), 'false');
    assert.ok((await cancelled()) > before, 'turning it off stops any reading');
    assert.equal(await hint(), usual);
    await page.evaluate(`document.getElementById('chat-listen').click()`);
    assert.equal(await pressed(page), 'true');
    await page.reload();
    await page.waitFor(
      `document.getElementById('chat-listen')?.getAttribute('aria-pressed') === 'false' && document.getElementById('thought').placeholder === ${JSON.stringify(usual)}`,
      'the reload, with the mode off',
    );
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();
  },
);
