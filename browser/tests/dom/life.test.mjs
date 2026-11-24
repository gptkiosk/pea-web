// Browser-level checks for the assistant character's varied life and plain writing style: what
// the model is told, where the owner sees and changes her set, and that none of it is sent unless
// the owner shares her story.
// Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { askModel, browserSkipReason, openConnectedPage, startStack } from './harness.mjs';

const skip = browserSkipReason();
let stack;
before(
  async () => {
    if (!skip) stack = await startStack(() => 'A plain synthetic reply.');
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

test(
  'PEA’s interests and people go with Chat only when PEA’s story is shared, change by the owner’s choice, and the style rule goes with every Chat message',
  { skip, timeout: 90000 },
  async () => {
    const page = await openConnectedPage(stack);
    const system = () => stack.model.requests.at(-1).messages[0].content;
    const hand = () => page.evaluate(`document.getElementById('life-hand').textContent`);
    const first = await hand();
    assert.match(first, /^PEA’s interests: [^.]+(?:, [^.]+){4}\. PEA’s people: [^.]+(?:, [^.]+){4}\.$/);
    const seed = JSON.parse(await page.evaluate(`localStorage.getItem('pea-life-v1')`)).seed;
    assert.ok(Number.isInteger(seed) && seed > 0);

    await askModel(stack, page, 'Hello there.');
    assert.match(system(), /Write the way a thoughtful person talks to someone they know\./);
    assert.match(system(), /not long dashes/);
    assert.doesNotMatch(
      system(),
      /Your character’s own life/,
      'PEA’s life is not sent until PEA’s story is shared',
    );
    // The honesty rule is unchanged and still sent.
    assert.match(system(), /If you are sincerely asked whether you are a human or an AI, say plainly/);

    if (!(await page.evaluate(`document.getElementById('share-intro').checked`)))
      await page.click('#share-intro');
    await page.fill('#thought', 'How was your weekend?');
    await page.evaluate(`document.querySelector('#composer').requestSubmit()`);
    await page.waitFor(`document.getElementById('review').open`, 'the sharing review');
    const shown = await page.text('#review-body');
    assert.ok(
      shown.includes('PEA’s interests and people (fiction PEA deals out'),
      'the review names what is shared',
    );
    assert.ok(shown.includes(first), 'and shows PEA’s set');
    await page.click('#review-approve');
    await page.waitFor(
      `document.querySelectorAll('#messages .utterance.assistant').length === 2 && !document.querySelector('#profile').disabled`,
      'the reply',
    );
    assert.match(system(), /Your character’s own life \(fiction written for you; light conversation only/);
    for (const name of first.match(/PEA’s interests: ([^.]+)\./)[1].split(', '))
      assert.ok(system().includes(name), name);
    assert.match(system(), /most replies say nothing about your own life/);
    assert.match(system(), /On PEA’s mind today: PEA /);

    // The owner can deal her a different set, after a review; nothing is asked of anyone.
    const before = stack.model.requests.length;
    await page.evaluate(`document.getElementById('life-deal').click()`);
    await page.waitFor(`document.getElementById('review').open`, 'the review');
    assert.match(await page.text('#review-body'), /No request is made and nothing is sent anywhere\./);
    await page.click('#review-approve');
    await page.waitFor(
      `document.getElementById('life-hand').textContent !== ${JSON.stringify(first)}`,
      'the new set',
    );
    assert.notEqual(JSON.parse(await page.evaluate(`localStorage.getItem('pea-life-v1')`)).seed, seed);
    assert.equal(stack.model.requests.length, before);

    // Work never carries her life.
    await page.fill('#profile', 'work');
    await page.waitFor(`document.getElementById('life-hand').textContent === ''`, 'Work, with no set shown');
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();
  },
);
