// Browser-level checks for a question with set answers: numbered buttons under the newest reply
// and in the voice room, and a said or typed number sent as the answer's own words.
// Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { askModel, browserSkipReason, openConnectedPage, startStack } from './harness.mjs';

const skip = browserSkipReason();
const options = { skip, timeout: 90000 };
const block = (value) => '```pea-choices\n' + JSON.stringify(value) + '\n```\n';
const days = {
  op: 'choose',
  question: 'Which day suits you?',
  options: ['Monday morning', 'Tuesday after lunch', 'Neither, suggest another'],
};
const replies = {
  'pick a day': 'I can book either. Which day suits you?\n' + block(days),
  'too many': 'Pick.\n' + block({ ...days, options: ['1', '2', '3', '4', '5', '6', '7'] }),
  'with a task':
    'Pick.\n' +
    block(days) +
    '```pea-task\n' +
    JSON.stringify([{ op: 'task_add', title: 'Synthetic' }]) +
    '\n```\n',
  'spoofed look': 'Which day suits you?\n1 Monday morning\n2 Tuesday after lunch',
};

let stack;
before(
  async () => {
    if (!skip)
      stack = await startStack((said) => {
        const key = Object.keys(replies).find((word) => said.includes(word));
        return key ? replies[key] : 'A plain synthetic reply.';
      });
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

// Every set of answer buttons at `root`, read from the page itself.
const boxes = (page, root = '#messages') =>
  page.evaluate(`[...document.querySelectorAll(${JSON.stringify(root + ' .choices')})].map((box) => ({
    question: box.querySelector('p').textContent,
    label: box.getAttribute('aria-label'),
    numbers: [...box.querySelectorAll('.choice-number')].map((n) => n.textContent),
    answers: [...box.querySelectorAll('.choice span:last-child')].map((n) => n.textContent),
    afterReply: Boolean(box.closest('.utterance.assistant')) && !box.closest('.utterance.assistant').nextElementSibling,
  }))`);
const lastSaid = () => stack.model.requests.at(-1).messages.at(-1);
// Sends words from the composer and waits for the model to be asked and the reply to end.
const say = async (page, words) => {
  const sent = stack.model.requests.length;
  await page.fill('#thought', words);
  await page.evaluate(`document.querySelector('#composer').requestSubmit()`);
  await page.waitFor(`!document.querySelector('#profile').disabled`, 'the reply to finish');
  assert.equal(stack.model.requests.length, sent + 1, 'one request');
};

test(
  'set answers are numbered buttons under the newest reply, and pressing one sends exactly its words',
  options,
  async () => {
    const page = await openConnectedPage(stack);
    await askModel(stack, page, 'Help me pick a day.');
    assert.match(stack.model.requests.at(-1).messages[0].content, /fenced pea-choices JSON block/);
    await page.waitFor(`document.querySelector('#messages .choices')`, 'the answers');
    assert.deepEqual(await boxes(page), [
      {
        question: 'Which day suits you?',
        label: 'Which day suits you?',
        numbers: ['1', '2', '3'],
        answers: days.options,
        afterReply: true,
      },
    ]);
    assert.doesNotMatch(await page.text('#messages'), /pea-choices|"op"/, 'the block itself is not shown');

    const sent = stack.model.requests.length;
    await page.evaluate(`document.querySelectorAll('#messages .choice')[1].click()`);
    await page.waitFor(`!document.querySelector('#messages .choices')`, 'the answers to go once one is sent');
    await page.waitFor(`!document.querySelector('#profile').disabled`, 'the reply to finish');
    assert.equal(stack.model.requests.length, sent + 1, 'one press, one request');
    assert.deepEqual(lastSaid(), { role: 'user', content: 'Tuesday after lunch' });
    assert.match(
      await page.evaluate(`[...document.querySelectorAll('#messages .utterance.user')].at(-1).textContent`),
      /Tuesday after lunch$/,
      'the conversation shows the answer as the owner’s own message',
    );
    assert.equal(await page.evaluate(`document.getElementById('thought').value`), '');
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();
  },
);

test(
  'a number said or typed is sent as that answer’s words, and other words are sent as they are',
  options,
  async () => {
    const page = await openConnectedPage(stack);
    await askModel(stack, page, 'Help me pick a day.');
    await page.waitFor(`document.querySelector('#messages .choices')`, 'the answers');
    await say(page, 'Option two.');
    assert.equal(lastSaid().content, 'Tuesday after lunch');
    assert.ok(
      (await page.evaluate(`window.peaNotices`)).includes('Sent answer 2: Tuesday after lunch'),
      'the owner is told which answer went',
    );

    // With no answers on offer, a number is only a number.
    await say(page, '2');
    assert.equal(lastSaid().content, '2');

    await say(page, 'Help me pick a day again.');
    await page.waitFor(`document.querySelector('#messages .choices')`, 'the answers');
    await say(page, 'the last one');
    assert.equal(lastSaid().content, 'Neither, suggest another');

    await say(page, 'Help me pick a day once more.');
    await say(page, 'The second one sounds bad. What about Friday?');
    assert.equal(lastSaid().content, 'The second one sounds bad. What about Friday?');
    assert.deepEqual(await boxes(page), [], 'answers from an older reply can no longer be picked');
    await page.close();
  },
);

test(
  'answers that are not in the agreed shape, or sit beside another proposal, are not offered',
  options,
  async () => {
    const page = await openConnectedPage(stack);
    await askModel(stack, page, 'Give me too many.');
    assert.deepEqual(await boxes(page), []);
    await say(page, '2');
    assert.equal(lastSaid().content, '2', 'nothing is on offer, so nothing is swapped in');
    await say(page, 'Now one with a task.');
    assert.deepEqual(await boxes(page), []);
    // Words that only look like a numbered list are not buttons.
    await say(page, 'Try the spoofed look.');
    assert.deepEqual(await boxes(page), []);
    assert.equal(await page.evaluate(`document.querySelectorAll('#messages .choice').length`), 0);
    await page.close();
  },
);

test(
  'the voice room shows the same answers, sends the one pressed, and reads them aloud with numbers',
  options,
  async () => {
    const page = await openConnectedPage(stack);
    await page.evaluate(
      `(() => {
        window.spoken = [];
        Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak: (u) => window.spoken.push(u.text), cancel() {}, getVoices: () => [], addEventListener() {} } });
      })()`,
    );
    await page.evaluate(`document.getElementById('chat-voice').click()`);
    await page.waitFor(`document.getElementById('voice-room').open`, 'the voice room');
    assert.equal(await page.evaluate(`document.getElementById('voice-room-choices').hidden`), true);
    await page.evaluate(`document.querySelector('#voice-room .dialog-head button').click()`);

    await askModel(stack, page, 'Help me pick a day.');
    await page.waitFor(`document.querySelector('#messages .choices')`, 'the answers');
    await page.evaluate(`document.getElementById('chat-read').click()`);
    await page.waitFor(`window.spoken.length === 1`, 'the reply read aloud');
    assert.match(
      (await page.evaluate(`window.spoken`))[0],
      /Which day suits you\? Option 1: Monday morning\. Option 2: Tuesday after lunch\. Option 3: Neither, suggest another\. Say a number, or answer in your own words\.$/,
    );

    await page.evaluate(`document.getElementById('chat-voice').click()`);
    await page.waitFor(`document.getElementById('voice-room').open`, 'the voice room');
    assert.deepEqual(
      (await boxes(page, '#voice-room-choices')).map((b) => [b.question, b.answers]),
      [['Which day suits you?', days.options]],
    );
    const sent = stack.model.requests.length;
    await page.evaluate(`document.querySelectorAll('#voice-room-choices .choice')[0].click()`);
    await page.waitFor(`!document.getElementById('voice-room').open`, 'the room to close on send');
    await page.waitFor(`!document.querySelector('#profile').disabled`, 'the reply to finish');
    assert.equal(stack.model.requests.length, sent + 1);
    assert.equal(lastSaid().content, 'Monday morning');
    await page.close();
  },
);
