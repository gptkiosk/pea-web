// Browser-level checks for handing reminders to PEA for Mac, so they can appear as notifications
// while the page is closed. Only the Mac's gateway can take them: run with PEA_GATEWAY=swift to
// check the hand-off itself. Against the Python gateway the offer must never appear.
// Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { browserSkipReason, gatewayKind, openConnectedPage, startStack } from './harness.mjs';

const skip = browserSkipReason();
const options = { skip, timeout: 60000 };
const mac = gatewayKind === 'swift';
const pad = (n) => String(n).padStart(2, '0');
const local = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
const day = 86400000;
const minute = (ms) => new Date(local(new Date(ms))).getTime();

let stack;
before(
  async () => {
    if (!skip) stack = await startStack(() => 'A plain synthetic reply.');
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

const add = async (page, title, due = null) => {
  await page.fill('#todo-title', title);
  await page.fill('#todo-due', due === null ? '' : local(new Date(due)));
  await page.evaluate(`document.getElementById('todo-remind').checked = ${due !== null}`);
  await page.evaluate(`document.getElementById('todo-add').requestSubmit()`);
  await page.waitFor(
    `[...document.querySelectorAll('#todo-list .todo-item label span')].some((s) => s.textContent === ${JSON.stringify(title)})`,
    'the to-do ' + title,
  );
};
const handedOver = async (expected, what) => {
  const until = Date.now() + 8000;
  for (;;) {
    const got = stack.gateway.reminders();
    const titles = got?.map((r) => r.title) ?? null;
    if (JSON.stringify(titles) === JSON.stringify(expected)) return got;
    if (Date.now() > until)
      assert.fail(`${what}: the Mac has ${JSON.stringify(titles)}, expected ${JSON.stringify(expected)}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};
const noticed = (page, text) =>
  page.waitFor(
    `(window.peaNotices || []).some((n) => n.includes(${JSON.stringify(text)}))`,
    'notice: ' + text,
  );

test(
  'a gateway that cannot show notifications is never offered reminders',
  { ...options, skip: skip || (mac && 'this gateway can take reminders') },
  async () => {
    const page = await openConnectedPage(stack, { width: 1500 });
    await page.click('#tab-today');
    await add(page, 'Synthetic reminder nobody takes', Date.now() + day);
    // The page has asked the gateway by now: the question follows the connection and every change.
    await page.waitFor(
      `performance.getEntriesByType('resource').some((e) => e.name.endsWith('/v1/reminders'))`,
      'the page to ask whether reminders can be handed over',
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(await page.evaluate(`document.getElementById('todo-mac').hidden`), true);
    assert.equal(stack.gateway.reminders(), null);
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();
  },
);

test(
  'reminders reach the Mac only after the owner agrees, follow every change, and are withdrawn',
  { ...options, skip: skip || (!mac && 'needs PEA_GATEWAY=swift') },
  async () => {
    const page = await openConnectedPage(stack, { width: 1500 });
    await page.click('#tab-today');
    const first = Date.now() + 2 * day,
      second = Date.now() + day;
    await add(page, 'Call the synthetic dentist', first);
    await add(page, 'Synthetic to-do with no reminder');
    await page.waitFor(`!document.getElementById('todo-mac').hidden`, 'the offer to hand reminders over');
    assert.equal(
      await page.evaluate(`document.getElementById('todo-mac-on').checked`),
      false,
      'off to begin with',
    );
    assert.equal(stack.gateway.reminders(), null, 'nothing is handed over before the owner agrees');

    // The owner sees exactly what leaves the browser, and can say no.
    await page.click('#todo-mac-on');
    await page.waitFor(`document.querySelector('#review').open`, 'the review');
    const review = await page.text('#review-body');
    assert.match(review, /title and time of every open reminder/);
    assert.match(review, /outside this browser’s encrypted storage/);
    assert.match(review, /lock screen/);
    await page.click('#review-cancel');
    await page.waitFor(`!document.querySelector('#review').open`);
    assert.equal(await page.evaluate(`document.getElementById('todo-mac-on').checked`), false);
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(stack.gateway.reminders(), null, 'declining hands nothing over');

    await page.click('#todo-mac-on');
    await page.waitFor(`document.querySelector('#review').open`, 'the review again');
    await page.click('#review-approve');
    let list = await handedOver(['Call the synthetic dentist'], 'after agreeing');
    assert.deepEqual(Object.keys(list[0]).sort(), ['due', 'id', 'title'], 'only the id, title and time');
    assert.equal(list[0].due, minute(first));
    await page.waitFor(
      `document.getElementById('todo-mac-note').textContent.includes('This Mac has the titles and times')`,
      'the page to say the Mac has them',
    );

    // Every profile's reminders go, soonest first, whichever profile is on screen.
    await page.fill('#profile', 'work');
    await page.waitFor(`document.querySelectorAll('#todo-list .todo-item').length === 0`, 'the Work list');
    await add(page, 'Send the synthetic report', second);
    list = await handedOver(
      ['Send the synthetic report', 'Call the synthetic dentist'],
      'after adding in Work',
    );
    assert.equal(list[0].due, minute(second));

    // Checking one off withdraws it.
    await page.evaluate(`document.querySelector('#todo-list .todo-item input').click()`);
    await handedOver(['Call the synthetic dentist'], 'after checking one off');

    // Turning it off withdraws them all, and later changes are not sent.
    await page.click('#todo-mac-on');
    await handedOver([], 'after turning it off');
    await noticed(page, 'This Mac’s reminders were withdrawn.');
    await add(page, 'Synthetic reminder after turning off', first);
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.deepEqual(stack.gateway.reminders(), []);
    assert.equal(await page.evaluate(`document.getElementById('todo-mac-on').checked`), false);
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();
  },
);

test(
  'the choice survives a reload, and the Mac keeps its list until the page reconnects',
  { ...options, skip: skip || (!mac && 'needs PEA_GATEWAY=swift') },
  async () => {
    const page = await openConnectedPage(stack, { width: 1500 });
    await page.click('#tab-today');
    await page.waitFor(`!document.getElementById('todo-mac').hidden`, 'the offer');
    await page.click('#todo-mac-on');
    await page.waitFor(`document.querySelector('#review').open`, 'the review');
    await page.click('#review-approve');
    await add(page, 'Synthetic reminder kept by the Mac', Date.now() + day);
    await handedOver(['Synthetic reminder kept by the Mac'], 'before the reload');

    // After a reload the page has no token, so it cannot reach the Mac and must not clear its list.
    await page.goto(stack.gateway.origin + '/');
    await page.waitFor(
      `document.querySelector('#local-connect').onclick && !document.querySelector('#local-connect').disabled`,
      'the app to start again',
    );
    await page.click('#tab-today');
    await page.waitFor(`!document.getElementById('todo-mac').hidden`, 'the choice to still show');
    assert.equal(await page.evaluate(`document.getElementById('todo-mac-on').checked`), true);
    assert.match(await page.text('#todo-mac-note'), /Connect the local model again/);
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.deepEqual(
      stack.gateway.reminders().map((r) => r.title),
      ['Synthetic reminder kept by the Mac'],
      'the Mac keeps what it was given',
    );

    // Reconnecting sends this tab's list, which is empty: to-dos here live in the tab unless saved.
    await page.fill('#local-token', stack.gateway.token);
    await page.click('#local-connect');
    await handedOver([], 'after reconnecting with an empty list');
    await page.click('#todo-mac-on');
    await noticed(page, 'This Mac’s reminders were withdrawn.');
    await page.close();
  },
);
