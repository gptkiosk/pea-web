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

// The Time management offer as a Mac notification: its own choice, its own review, one fixed line
// for the coming days, sent in the same list as the reminders and withdrawn on its own.
test(
  'the Time management offer reaches the Mac only after the owner agrees, alongside reminders, and is withdrawn',
  { ...options, skip: skip || (!mac && 'needs PEA_GATEWAY=swift') },
  async () => {
    const page = await openConnectedPage(stack, { width: 1500 });
    await page.click('#tab-today');
    const line = 'Plan your day? Open PEA for a short Time management interview.';
    await page.waitFor(`!document.getElementById('plan-offer-notify-row').hidden`, 'the choice to be offered');
    assert.equal(await page.evaluate(`document.getElementById('plan-offer-notify').checked`), false);
    const before = JSON.stringify(stack.gateway.reminders());

    // Declined in the review: nothing is handed over and nothing is stored.
    await page.click('#plan-offer-notify');
    await page.waitFor(`document.querySelector('#review').open`, 'the review');
    assert.match(await page.text('#review'), /one fixed line.*for each of the next seven days/s);
    await page.click('#review-cancel');
    await page.waitFor(`!document.querySelector('#review').open`, 'the review to close');
    assert.equal(await page.evaluate(`document.getElementById('plan-offer-notify').checked`), false);
    assert.equal(await page.evaluate(`localStorage.getItem('pea-plan-offer-v1')`), null);
    assert.equal(JSON.stringify(stack.gateway.reminders()), before);

    // Agreed: the next days' offers, at the chosen hour, and nothing else.
    await page.click('#plan-offer-notify');
    await page.waitFor(`document.querySelector('#review').open`, 'the review');
    await page.click('#review-approve');
    const offers = (list) => (list ?? []).filter((r) => r.id.startsWith('plan-offer-'));
    const settled = async (check, what) => {
      const until = Date.now() + 8000;
      for (;;) {
        const got = stack.gateway.reminders();
        if (got && check(got)) return got;
        if (Date.now() > until) assert.fail(`${what}: the Mac has ${JSON.stringify(got)}`);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    };
    let got = await settled((l) => offers(l).length >= 6 && offers(l).length === l.length, 'the offers alone');
    assert.ok(got.length <= 7);
    assert.ok(got.every((r) => r.title === line && new Date(r.due).getHours() === 5 && new Date(r.due).getMinutes() === 0));
    assert.equal(new Set(got.map((r) => r.id)).size, got.length);

    // A changed hour follows; reminders travel in the same list and can be withdrawn on their own.
    await page.fill('#plan-offer-from', '3');
    got = await settled((l) => l.length >= 6 && l.every((r) => new Date(r.due).getHours() === 3), 'the new hour');
    await page.click('#todo-mac-on');
    await page.waitFor(`document.querySelector('#review').open`, 'the reminders review');
    await page.click('#review-approve');
    await add(page, 'Synthetic reminder beside the offer', Date.now() + day);
    got = await settled((l) => l.some((r) => r.title === 'Synthetic reminder beside the offer') && offers(l).length >= 6, 'both kinds');
    await page.click('#todo-mac-on');
    await noticed(page, 'This Mac’s reminders were withdrawn.');
    got = await settled((l) => l.length >= 6 && offers(l).length === l.length, 'the offers kept after reminders go');

    // Turned off: withdrawn, and the choice is stored as off.
    await page.click('#plan-offer-notify');
    await noticed(page, 'PEA for Mac will not notify you of the Time management offer.');
    await settled((l) => l.length === 0, 'everything withdrawn');
    assert.equal(JSON.parse(await page.evaluate(`localStorage.getItem('pea-plan-offer-v1')`)).notify, false);
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();
  },
);
