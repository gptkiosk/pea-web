// Browser-level checks for updating the installed copy from the Versions & updates window. The gateway's update
// route is answered by the test, so nothing is installed; what is checked is that the page shows
// the exact version, asks only after a review, sends only that commit, and reports the outcome.
// Run with: node --test browser/tests/dom/updates.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { askModel, browserSkipReason, openConnectedPage, startStack } from './harness.mjs';

const skip = browserSkipReason();
const a = 'a'.repeat(40),
  b = 'b'.repeat(40);
let stack;
before(
  async () => {
    if (skip) return;
    stack = await startStack((said) =>
      said.includes('update')
        ? 'I will update PEA for you.\n```pea-update\n' +
          JSON.stringify({ action: 'apply', commit: b }) +
          '\n```\n'
        : 'A plain synthetic reply.',
    );
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

const words = (page, id) => page.evaluate(`document.querySelector(${JSON.stringify(id)}).textContent`);
const hidden = (page, id) => page.evaluate(`document.querySelector(${JSON.stringify(id)}).hidden`);
const noted = (page, pattern) =>
  page.waitFor(
    `new RegExp(${JSON.stringify(pattern.source)}).test(document.querySelector('#update-note').textContent)`,
    'the note ' + pattern,
  );
const posts = (page) =>
  page.intercepted
    .filter((r) => r.url.endsWith('/v1/update') && r.method === 'POST')
    .map((r) => JSON.parse(r.sent));
// Opens the app with the gateway's update route answered by `answer(method, body)`, and reconnects
// so the page asks it afresh.
async function openWith(answer) {
  const page = await openConnectedPage(stack);
  await page.route(stack.gateway.origin + '/v1/update', (url, request) =>
    answer(request.method, request.postData ? JSON.parse(request.postData) : null),
  );
  await page.click('#local-forget');
  await page.fill('#local-token', stack.gateway.token);
  await page.click('#local-connect');
  await page.waitFor(
    `/^This copy can update itself|not set up/.test(document.querySelector('#update-status').textContent) && [...document.querySelector('#chat-model').options].some((o) => o.value.startsWith('local:'))`,
    'the update status',
  );
  return page;
}
const status = (over = {}) => ({
  available: true,
  channel: 'release',
  prerelease: true,
  installed: { version: '0.1.0-rc.1', commit: a },
  operation: null,
  ...over,
});
const found = (over = {}) => ({
  installed: { version: '0.1.0-rc.1', commit: a },
  channel: 'release',
  signed: true,
  upToDate: false,
  withdrawn: null,
  target: {
    version: '0.1.0-rc.2',
    commit: b,
    tag: 'v0.1.0-rc.2',
    ahead: 2,
    notes: ['Synthetic change one', 'Synthetic change two'],
  },
  ...over,
});

test(
  'a gateway that is not set up for updates offers nothing, and a model cannot start one',
  { skip, timeout: 60000 },
  async () => {
    const page = await openConnectedPage(stack);
    await page.waitFor(
      `/not set up/.test(document.querySelector('#update-status').textContent)`,
      'the real gateway’s answer',
    );
    assert.match(await words(page, '#update-status'), /Updating from the app is not set up for this PEA/);
    assert.equal(await hidden(page, '#update-check'), true);
    assert.equal(await hidden(page, '#update-apply'), true);
    await page.close();

    // With updating available, a reply that tries to start one is only hidden text.
    const second = await openWith((method) =>
      method === 'GET' ? { body: status() } : { status: 409, body: { error: 'x' } },
    );
    await askModel(stack, second, 'Please update yourself.');
    assert.doesNotMatch(await second.text('#messages'), /pea-update|"commit"/);
    assert.equal(
      await second.evaluate(
        `[...document.querySelectorAll('#messages button')].filter((x) => /update/i.test(x.textContent)).length`,
      ),
      0,
      'no button to approve it',
    );
    assert.deepEqual(posts(second), [], 'nothing was asked of the update route');
    await second.close();
  },
);

test(
  'the update buttons are in the Versions window, and connecting the token from there comes back to it',
  { skip, timeout: 90000 },
  async () => {
    const page = await openWith((method, body) =>
      method === 'GET' ? { body: status() } : body.action === 'check' ? { body: found() } : { status: 409 },
    );
    const seen = (id) =>
      page.evaluate(
        `(() => { const e = document.querySelector(${JSON.stringify(id)}); return !e.hidden && e.offsetParent !== null && document.querySelector('#release-dialog').contains(e); })()`,
      );
    const versions = () =>
      page.waitFor(`document.querySelector('#release-dialog').open`, 'the versions window');
    if (await page.evaluate(`document.querySelector('#connections').open`))
      await page.evaluate(`document.querySelector('#connections').close()`);
    await page.click('#releases-open');
    await versions();
    await page.waitFor(
      `/^This copy can update itself/.test(document.querySelector('#update-status').textContent)`,
      'the status, asked afresh when the window opens',
    );
    assert.equal(await seen('#update-check'), true, 'Check is in the window and visible');
    assert.equal(await seen('#release-update-open'), false, 'nothing to connect');
    await page.click('#update-check');
    await page.waitFor(`!document.querySelector('#update-apply').hidden`, 'the offer');
    assert.equal(await seen('#update-apply'), true, 'Update is in the window and visible');
    assert.equal(await words(page, '#update-apply'), 'Update to 0.1.0-rc.2…');

    // After a reload the token is gone. The window says so, and the trip to paste it ends back here.
    await page.evaluate(`document.querySelector('#release-dialog').close()`);
    await page.click('#local-forget');
    await page.click('#releases-open');
    await versions();
    assert.equal(await seen('#release-update-open'), true);
    assert.equal(await seen('#update-check'), false);
    await page.click('#release-update-open');
    await page.waitFor(`document.querySelector('#connections').open`, 'Connections');
    await page.fill('#local-token', stack.gateway.token);
    await page.click('#local-connect');
    await versions();
    assert.equal(await page.evaluate(`document.querySelector('#connections').open`), false);
    assert.equal(await seen('#update-check'), true, 'ready to check, back in the window');
    assert.ok(
      (await page.evaluate(
        `Math.abs(document.querySelector('#update-check').getBoundingClientRect().left - document.querySelector('#update-status').getBoundingClientRect().left)`,
      )) < 1,
      'Check lines up with the text above it',
    );

    // Closing Connections without connecting does not pull the window back later.
    await page.evaluate(`document.querySelector('#release-dialog').close()`);
    await page.click('#local-forget');
    await page.click('#releases-open');
    await page.click('#release-update-open');
    await page.waitFor(`document.querySelector('#connections').open`, 'Connections again');
    await page.evaluate(`document.querySelector('#connections').close()`);
    await page.click('#collab-config');
    await page.fill('#local-token', stack.gateway.token);
    await page.click('#local-connect');
    await page.waitFor(
      `/^This copy can update itself/.test(document.querySelector('#update-status').textContent)`,
      'connected',
    );
    assert.equal(await page.evaluate(`document.querySelector('#release-dialog').open`), false);
    assert.equal(await page.evaluate(`document.querySelector('#connections').open`), true);
    await page.close();
  },
);

test(
  'an update is installed only after a review naming the exact version, and the outcome is reported',
  { skip, timeout: 90000 },
  async () => {
    let applied = 0,
      polls = 0;
    const page = await openWith((method, body) => {
      if (method === 'GET') {
        if (!applied) return { body: status() };
        polls++;
        if (polls === 1) return { status: 502, body: {} }; // PEA is restarting
        if (polls === 2)
          return {
            body: status({
              operation: {
                kind: 'apply',
                outcome: 'started',
                at: Math.floor(Date.now() / 1000),
                target: b,
                targetVersion: '0.1.0-rc.2',
              },
            }),
          };
        return {
          body: status({
            installed: { version: '0.1.0-rc.2', commit: b },
            operation: {
              kind: 'apply',
              outcome: 'succeeded',
              at: Math.floor(Date.now() / 1000),
              target: b,
              targetVersion: '0.1.0-rc.2',
            },
          }),
        };
      }
      if (body.action === 'check') return { body: found() };
      applied++;
      return { status: 202, body: { started: true, commit: body.commit } };
    });
    assert.match(
      await words(page, '#update-status'),
      /follows signed releases, including pre-releases\. Installed: 0\.1\.0-rc\.1 \(aaaaaaaaaaaa\)/,
    );
    assert.equal(await hidden(page, '#update-apply'), true, 'nothing to install before looking');

    await page.click('#update-check');
    await page.waitFor(`!document.querySelector('#update-apply').hidden`, 'the offer');
    assert.match(
      await words(page, '#update-found'),
      /Version 0\.1\.0-rc\.2 is available \(release v0\.1\.0-rc\.2\): a signed release, 2 changes ahead/,
    );
    assert.equal(await words(page, '#update-apply'), 'Update to 0.1.0-rc.2…');
    assert.deepEqual(posts(page), [{ action: 'check' }]);
    // One main button in the window, first in its row, with checking again beside it.
    assert.deepEqual(
      JSON.parse(
        await page.evaluate(
          `JSON.stringify([...document.querySelectorAll('#release-dialog .primary')].filter((e) => !e.closest('[hidden]')).map((e) => e.id))`,
        ),
      ),
      ['update-apply'],
    );
    assert.equal(await words(page, '#update-check'), 'Check again');
    assert.ok(
      await page.evaluate(
        `Boolean(document.querySelector('#update-apply').compareDocumentPosition(document.querySelector('#update-check')) & Node.DOCUMENT_POSITION_FOLLOWING)`,
      ),
      'the update button comes first',
    );

    await page.click('#update-apply');
    await page.waitFor(`document.querySelector('#review').open`, 'the review');
    assert.match(await page.text('#review-title'), /Update PEA to 0\.1\.0-rc\.2\?/);
    assert.equal(
      await page.evaluate(`document.querySelector('#review-body').classList.contains('prose')`),
      true,
      'the explanation is set in the reading typeface',
    );
    const shown = await page.text('#review-body');
    assert.match(
      shown,
      /Now: 0\.1\.0-rc\.1 \(aaaaaaaaaaaa\)\s+After: 0\.1\.0-rc\.2 \(bbbbbbbbbbbb\), release v0\.1\.0-rc\.2/,
    );
    assert.match(shown, /signed release\. Its manifest was checked against the release key/);
    assert.match(shown, /Synthetic change one/);
    assert.match(shown, /settings and connection token are not touched/);
    await page.click('#review-cancel');
    await noted(page, /Not updated\. Nothing was changed/);
    assert.equal(applied, 0, 'cancel installs nothing');

    await page.click('#update-apply');
    await page.waitFor(`document.querySelector('#review').open`, 'the review again');
    await page.click('#review-approve');
    await noted(page, /Updated to 0\.1\.0-rc\.2\. Reload this page to load the new version/);
    assert.deepEqual(posts(page).at(-1), { action: 'apply', commit: b }, 'only the reviewed commit is named');
    assert.equal(applied, 1);
    assert.equal(await hidden(page, '#update-reload'), false);
    assert.equal(await hidden(page, '#update-apply'), true, 'the same update is not offered again');
    assert.equal(await page.evaluate(`document.querySelector('#update-note').dataset.level`), 'ok');
    await page.close();
  },
);

test(
  'a failed or refused update says why, and an unsigned or withdrawn one is called that',
  { skip, timeout: 90000 },
  async () => {
    let applied = 0,
      refuse = false;
    const at = () => Math.floor(Date.now() / 1000);
    const page = await openWith((method, body) => {
      if (method === 'GET')
        return {
          body: status({
            channel: 'development',
            prerelease: false,
            operation: applied
              ? {
                  kind: 'apply',
                  outcome: 'rolled back',
                  at: at(),
                  target: b,
                  targetVersion: '0.1.0-rc.1.dev.9',
                  message:
                    'PEA did not come back reporting the new commit and version. The previous version (0.1.0-rc.1, aaaaaaaaaaaa) was put back.',
                }
              : null,
          }),
        };
      if (body.action === 'check')
        return {
          body: found({
            channel: 'development',
            signed: false,
            withdrawn: 'Breaks saved boards.',
            target: { version: '0.1.0-rc.1.dev.9', commit: b, tag: null, ahead: 1, notes: [] },
          }),
        };
      if (refuse)
        return {
          status: 409,
          body: {
            error: 'The update on offer changed after it was reviewed. Check again; nothing was changed.',
          },
        };
      applied++;
      return { status: 202, body: { started: true } };
    });
    assert.match(await words(page, '#update-status'), /development builds, which are not signed/);
    await page.click('#update-check');
    await page.waitFor(`!document.querySelector('#update-apply').hidden`, 'the offer');
    assert.match(
      await words(page, '#update-found'),
      /withdrawn the version you are running: Breaks saved boards\. Version 0\.1\.0-rc\.1\.dev\.9 is available: an unsigned development build/,
    );

    refuse = true;
    await page.click('#update-apply');
    await page.waitFor(`document.querySelector('#review').open`, 'the review');
    assert.match(await page.text('#review-body'), /development build\.[\s\S]*No signature is checked/);
    await page.click('#review-approve');
    await noted(page, /changed after it was reviewed\. Check again; nothing was changed/);
    assert.equal(await hidden(page, '#update-apply'), true, 'a stale offer is withdrawn from the page');
    assert.equal(applied, 0);

    refuse = false;
    await page.click('#update-check');
    await page.waitFor(`!document.querySelector('#update-apply').hidden`, 'the offer again');
    await page.click('#update-apply');
    await page.waitFor(`document.querySelector('#review').open`, 'the review');
    await page.click('#review-approve');
    await noted(
      page,
      /did not go through\. PEA did not come back reporting the new commit and version\. The previous version .* was put back/,
    );
    assert.equal(await page.evaluate(`document.querySelector('#update-note').dataset.level`), 'warn');
    assert.equal(await hidden(page, '#update-reload'), true, 'there is nothing new to reload into');
    await page.close();
  },
);

// The same update with every step shown, a log kept, the settings checked after the reload, and
// the way back to the version it replaced.
test(
  'an update shows each step and a log, checks the settings after the reload, and can be undone after a review',
  { skip, timeout: 120000 },
  async () => {
    const at = () => Math.floor(Date.now() / 1000);
    const log = (...texts) => texts.map((text) => ({ at: at(), text }));
    const said = [
      'Updating from 0.1.0-rc.1 (aaaaaaaaaaaa) to 0.1.0-rc.2 (bbbbbbbbbbbb). Settings and saved data are not touched: only program files change.',
      'Program files are now 0.1.0-rc.2.',
      'Restarting PEA.',
      'Waiting for PEA to report 0.1.0-rc.2.',
      'PEA is running 0.1.0-rc.2. Reload the page to use it.',
    ];
    const op = (over) => ({ kind: 'apply', at: at(), previous: a, previousVersion: '0.1.0-rc.1', target: b, targetVersion: '0.1.0-rc.2', ...over });
    let phase = 'before',
      polls = 0,
      hold = true;
    const answer = (method, body) => {
      if (method === 'GET') {
        if (phase === 'before') return { body: status() };
        if (phase === 'done')
          return { body: status({ installed: { version: '0.1.0-rc.2', commit: b }, operation: op({ outcome: 'succeeded', stage: 'done', log: log(...said) }) }) };
        if (phase === 'refused')
          return { body: status({ installed: { version: '0.1.0-rc.2', commit: b }, operation: op({ at: 5, outcome: 'succeeded', stage: 'done', log: log(...said), note: 'The installed copy has changes to tracked files. Nothing was changed.', noteAt: at() }) }) };
        polls++;
        if (polls === 1) return { body: status({ operation: op({ outcome: 'started', stage: 'files', log: log(...said.slice(0, 2)) }) }) };
        if (polls === 2 || hold) return { status: 502, body: {} };
        phase = 'done';
        return answer('GET');
      }
      if (body.action === 'check') return { body: found() };
      if (body.action === 'rollback') {
        phase = 'refused';
        return { status: 202, body: { started: true, commit: body.commit } };
      }
      phase = 'updating';
      return { status: 202, body: { started: true, commit: body.commit } };
    };
    const page = await openWith(answer);
    await page.evaluate(
      `(() => { localStorage.setItem('pea-device-voice-v1', JSON.stringify({ voice: '', rate: 1.2 })); localStorage.setItem('pea-presence-v1', JSON.stringify({ personal: true, work: false })); })()`,
    );
    assert.equal(await hidden(page, '#update-progress'), true, 'no bar until something is under way');
    assert.equal(await hidden(page, '#update-back'), true, 'nothing to go back to yet');
    assert.equal(await hidden(page, '#update-backup'), false, 'a backup file is one press away');
    await page.click('#update-check');
    await page.waitFor(`!document.querySelector('#update-apply').hidden`, 'the offer');
    await page.click('#update-apply');
    await page.waitFor(`document.querySelector('#review').open`, 'the review');
    assert.match(await page.text('#review-body'), /PEA notes your settings now and checks them again when you reload/);
    await page.click('#review-approve');
    // While PEA restarts the page cannot reach it: the bar holds at Restart and says so.
    const steps = () =>
      page.evaluate(
        `JSON.stringify([...document.querySelectorAll('#update-steps li')].map((li) => li.dataset.state))`,
      );
    await page.waitFor(
      `!document.querySelector('#update-progress').hidden && /PEA is restarting/.test(document.querySelector('#update-note').textContent)`,
      'the restart to be shown',
    );
    assert.equal(await words(page, '#update-progress-title'), 'Updating to 0.1.0-rc.2');
    assert.equal(await steps(), JSON.stringify(['done', 'done', 'now', 'todo', 'todo']));
    assert.equal(await page.evaluate(`document.querySelector('#update-bar').value`), 2);
    assert.equal(
      await page.evaluate(`document.querySelector('#update-steps [aria-current="step"]').textContent`),
      'Restart PEA',
    );
    assert.equal(await page.evaluate(`document.querySelectorAll('#update-log li').length`), 2, 'the log so far');
    hold = false;
    await noted(page, /Updated to 0\.1\.0-rc\.2\. Reload this page to load the new version/);
    assert.equal(await steps(), JSON.stringify(['done', 'done', 'done', 'done', 'done']));
    assert.equal(await page.evaluate(`document.querySelector('#update-bar').value`), 5);
    assert.equal(await words(page, '#update-progress-title'), 'Updated to 0.1.0-rc.2');
    const lines = JSON.parse(
      await page.evaluate(
        `JSON.stringify([...document.querySelectorAll('#update-log li')].map((li) => li.textContent.replace(li.querySelector('time').textContent, '').trim()))`,
      ),
    );
    assert.deepEqual(lines, said);
    assert.equal(await page.evaluate(`document.querySelector('#update-log-box').open`), false, 'the log is there, folded');
    assert.equal(await hidden(page, '#update-settings'), true, 'the settings are checked on the next load, not this one');

    // After the reload: the settings were checked, and the version it replaced is on offer.
    await page.reload();
    await page.waitFor(
      `/all \\d+ saved in this browser are exactly as they were before the move to 0\\.1\\.0-rc\\.2/.test(document.querySelector('#update-settings').textContent)`,
      'the settings check',
    );
    assert.equal(await hidden(page, '#update-settings'), false);
    assert.equal(await page.evaluate(`localStorage.getItem('pea-update-check-v1')`), null, 'said once');
    assert.equal(await page.evaluate(`JSON.parse(localStorage.getItem('pea-device-voice-v1')).rate`), 1.2);
    await page.click('#local-forget');
    await page.fill('#local-token', stack.gateway.token);
    await page.click('#local-connect');
    await page.waitFor(`!document.querySelector('#update-back').hidden`, 'the way back');
    assert.equal(await words(page, '#update-back'), 'Go back to 0.1.0-rc.1…');
    assert.equal(await page.evaluate(`document.querySelectorAll('#update-log li').length`), 5, 'the last update’s log is kept');
    await page.click('#update-back');
    await page.waitFor(`document.querySelector('#review').open`, 'the review');
    assert.match(await page.text('#review-title'), /Go back to 0\.1\.0-rc\.1\?/);
    const back = await page.text('#review-body');
    assert.match(back, /Now: 0\.1\.0-rc\.2\s+After: 0\.1\.0-rc\.1 \(aaaaaaaaaaaa\), the version the last update replaced/);
    assert.match(back, /Only program files change\./);
    assert.match(back, /make a backup file first/);
    await page.click('#review-cancel');
    await noted(page, /Not changed\. You are still on 0\.1\.0-rc\.2/);
    assert.ok(!posts(page).some((p) => p.action === 'rollback'), 'cancel asks for nothing');
    await page.click('#update-back');
    await page.waitFor(`document.querySelector('#review').open`, 'the review again');
    await page.click('#review-approve');
    // This time PEA refuses, and its reason is shown; the update's record and the way back stay.
    await noted(page, /Did not go back\. The installed copy has changes to tracked files\. Nothing was changed\./);
    assert.deepEqual(posts(page).at(-1), { action: 'rollback', commit: a }, 'only the replaced commit is named');
    assert.equal(await hidden(page, '#update-progress'), true);
    assert.equal(await hidden(page, '#update-back'), false);
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();
  },
);
