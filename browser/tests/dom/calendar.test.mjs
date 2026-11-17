// Browser-level checks for adding an approved event straight to the owner's Google calendar.
// Google is a stand-in answered by the test: its sign-in script, the account, the folder list and
// the calendar. Nothing leaves this machine and no real account is used.
// Run with: node --test browser/tests/dom/calendar.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { askModel, browserSkipReason, openConnectedPage, openReview, startStack } from './harness.mjs';

const skip = browserSkipReason();
const readOnly = 'https://www.googleapis.com/auth/calendar.events.readonly',
  readWrite = 'https://www.googleapis.com/auth/calendar.events.owned',
  signIn = 'https://accounts.google.com/gsi/client',
  google = 'https://www.googleapis.com/',
  events = google + 'calendar/v3/calendars/primary/events';
const proposal =
  'Here is the event.\n```pea-calendar\n' +
  JSON.stringify({
    op: 'calendar_draft',
    title: 'Synthetic event',
    start: '2031-01-02T15:00:00Z',
    end: '2031-01-02T16:00:00Z',
    details: 'Synthetic notes',
  }) +
  '\n```\n';

// The sign-in script the page loads. It grants what the page asked for, or what the test says the
// owner left ticked on Google's own screen, and remembers what was asked.
const fakeSignIn = `window.google = { accounts: { oauth2: { initTokenClient: (config) => ({
  requestAccessToken() {
    window.peaAskedScope = config.scope;
    setTimeout(() => config.callback({
      access_token: 'synthetic-google-token',
      scope: window.peaGrantScope || config.scope,
      expires_in: 3600,
    }), 0);
  },
}) } } };`;

let stack;
before(
  async () => {
    if (skip) return;
    stack = await startStack((said) => (said.includes('event') ? proposal : 'A plain synthetic reply.'));
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

// Opens the app with the stand-in Google. `calendar.fail` makes the next additions answer with
// that status; `calendar.keepAnyway` stores the event even so, as when an answer is lost.
async function openWithGoogle() {
  const page = await openConnectedPage(stack);
  const calendar = { added: [], fail: 0, keepAnyway: false };
  await page.route(signIn, () => ({ type: 'text/javascript', text: fakeSignIn }));
  await page.route(google, (url, request) => {
    const at = new URL(url);
    if (request.method === 'OPTIONS') return { status: 204, text: '' };
    if (at.pathname === '/oauth2/v3/userinfo') return { body: { email: 'owner@example.invalid' } };
    if (at.pathname === '/drive/v3/files') return { body: { files: [] } };
    if (url.startsWith(events) && request.method === 'GET')
      return {
        body: {
          items: calendar.added.map((e) => ({
            id: e.id,
            status: 'confirmed',
            summary: e.summary,
            start: e.start,
            end: e.end,
          })),
        },
      };
    if (url.startsWith(events) && request.method === 'POST') {
      const sent = JSON.parse(request.postData);
      if (calendar.added.some((e) => e.id === sent.id)) return { status: 409, body: { error: 'duplicate' } };
      if (calendar.fail) {
        if (calendar.keepAnyway) calendar.added.push(sent);
        return { status: calendar.fail, body: { error: 'synthetic failure' } };
      }
      calendar.added.push(sent);
      return {
        body: {
          id: sent.id,
          status: 'confirmed',
          htmlLink: 'https://www.google.com/calendar/event?eid=synthetic',
        },
      };
    }
    return { status: 404 };
  });
  return { page, calendar };
}
async function connectGoogle(page, { write = false, read = false, grant = '' } = {}) {
  await page.fill('#google-client', 'synthetic-client.apps.googleusercontent.com');
  await page.evaluate(
    `(() => { document.querySelector('#google-calendar-write').checked = ${write}; document.querySelector('#google-calendar-access').checked = ${read}; window.peaGrantScope = ${JSON.stringify(grant)}; })()`,
  );
  await page.click('#google-connect');
  await page.waitFor(
    `document.querySelector('#connection-note').textContent.startsWith('Connected owner@example.invalid')`,
    'the Google connection',
  );
  return (await page.evaluate('window.peaAskedScope')).split(' ');
}
const posts = (page) => page.intercepted.filter((r) => r.url.startsWith(events) && r.method === 'POST');
const receipt = (page) =>
  page.evaluate(`document.querySelector('#messages .event-receipt')?.textContent ?? ''`);
const onlyStandIns = (page) =>
  assert.deepEqual(
    page.outsideRequests().filter((url) => !url.startsWith(signIn) && !url.startsWith(google)),
    [],
    'nothing went anywhere but the stand-in Google',
  );

test(
  'an approved event is added to the owner’s calendar once, with nobody invited, and only after approval',
  { skip, timeout: 60000 },
  async () => {
    const { page, calendar } = await openWithGoogle();
    const asked = await connectGoogle(page, { write: true });
    assert(asked.includes(readWrite), 'the wider permission is asked for when the box is ticked');
    assert(!asked.includes(readOnly));

    await askModel(stack, page, 'Please make an event.');
    assert.doesNotMatch(
      await page.text('#messages'),
      /pea-calendar|calendar_draft/,
      'the action block is hidden',
    );
    assert.equal(posts(page).length, 0, 'a proposal alone adds nothing');

    await openReview(page, 'Review calendar event: Synthetic event');
    assert.match(await page.text('#review-title'), /Add this event to your calendar\?/);
    const shown = await page.text('#review-body');
    assert.match(shown, /Synthetic event/);
    assert.match(shown, /UTC start: 2031-01-02T15:00:00Z/);
    assert.match(shown, /main Google calendar of owner@example\.invalid/);
    assert.match(shown, /Nobody is invited/);
    await page.click('#review-cancel');
    await page.waitFor(`!document.querySelector('#review').open`);
    assert.equal(posts(page).length, 0, 'cancel adds nothing');
    assert.equal(await receipt(page), '');

    await openReview(page, 'Review calendar event: Synthetic event');
    await page.click('#review-approve');
    await page.waitFor(`document.querySelector('#messages .event-receipt')`, 'the receipt');
    assert.match(await receipt(page), /Added to your Google calendar · Open in Google Calendar/);
    assert.equal(
      await page.evaluate(`document.querySelector('#messages .event-receipt a').href`),
      'https://www.google.com/calendar/event?eid=synthetic',
    );
    const sent = posts(page);
    assert.equal(sent.length, 1, 'exactly one event was sent');
    assert.equal(new URL(sent[0].url).searchParams.get('sendUpdates'), 'none');
    const body = JSON.parse(sent[0].sent);
    assert.deepEqual(Object.keys(body).sort(), [
      'description',
      'end',
      'extendedProperties',
      'id',
      'start',
      'summary',
    ]);
    assert.equal(body.summary, 'Synthetic event');
    assert.deepEqual(body.start, { dateTime: '2031-01-02T15:00:00Z' });
    assert.deepEqual(body.extendedProperties, {
      private: { peaCreated: '1', peaProfile: body.extendedProperties.private.peaProfile },
    });
    assert.match(body.id, /^pea[a-f0-9]{32}$/);
    assert.equal(calendar.added.length, 1);

    assert.equal(
      await page.evaluate(
        `[...document.querySelectorAll('#messages button')].some((b) => b.textContent.startsWith('Review calendar event'))`,
      ),
      false,
      'an added event cannot be added again from the same reply',
    );
    await page.waitFor(
      `document.querySelector('#calendar').textContent.includes('Synthetic event')`,
      'the event on the Upcoming card',
    );
    assert.equal(await page.evaluate(`document.querySelectorAll('a[download="pea-event.ics"]').length`), 0);
    onlyStandIns(page);
    await page.close();
  },
);

test(
  'a lost answer cannot add the event twice: the second try reuses the id and is read as already added',
  { skip, timeout: 60000 },
  async () => {
    const { page, calendar } = await openWithGoogle();
    await connectGoogle(page, { write: true });
    await askModel(stack, page, 'Please make an event.');

    calendar.fail = 500;
    calendar.keepAnyway = true;
    await openReview(page, 'Review calendar event: Synthetic event');
    await page.click('#review-approve');
    await page.waitFor(`window.peaNotices.some((n) => /failed/i.test(n))`, 'the failure notice');
    assert.equal(await receipt(page), '', 'a failed try is not shown as added');
    assert.doesNotMatch(
      await page.evaluate(`window.peaNotices.join(' ')`),
      /synthetic failure/,
      'Google’s own words are not shown',
    );

    calendar.fail = 0;
    await page.waitFor(`!document.querySelector('#profile').disabled`, 'the request to end');
    await openReview(page, 'Review calendar event: Synthetic event');
    await page.click('#review-approve');
    await page.waitFor(`document.querySelector('#messages .event-receipt')`, 'the receipt');
    const sent = posts(page).map((r) => JSON.parse(r.sent).id);
    assert.equal(sent.length, 2);
    assert.equal(sent[0], sent[1], 'both tries carried the same event id');
    assert.equal(calendar.added.length, 1, 'the calendar holds one event');
    assert.match(await page.evaluate(`window.peaNotices.join(' ')`), /already in your calendar/);
    await page.close();
  },
);

test(
  'without the wider permission an approved event stays a file and nothing is sent to the calendar',
  { skip, timeout: 60000 },
  async () => {
    const { page } = await openWithGoogle();
    // Read-only box only.
    let asked = await connectGoogle(page, { read: true });
    assert(asked.includes(readOnly));
    assert(!asked.includes(readWrite), 'the wider permission is not asked for unless its box is ticked');
    await askModel(stack, page, 'Please make an event.');
    await openReview(page, 'Review calendar event: Synthetic event');
    assert.match(await page.text('#review-title'), /Review calendar event/);
    assert.match(await page.text('#review-body'), /does not create an event/);
    await page.click('#review-approve');
    await page.waitFor(
      `document.querySelector('#messages a[download="pea-event.ics"]')`,
      'the event file link',
    );
    assert.equal(posts(page).length, 0);
    await page.close();

    // The box was ticked, but the owner left the permission off on Google's own screen.
    const second = await openWithGoogle();
    asked = await connectGoogle(second.page, {
      write: true,
      grant: `openid email https://www.googleapis.com/auth/drive ${readOnly}`,
    });
    assert(asked.includes(readWrite));
    await askModel(stack, second.page, 'Please make an event.');
    await openReview(second.page, 'Review calendar event: Synthetic event');
    assert.match(await second.page.text('#review-body'), /does not create an event/);
    await second.page.click('#review-approve');
    await second.page.waitFor(
      `document.querySelector('#messages a[download="pea-event.ics"]')`,
      'the event file link',
    );
    assert.equal(posts(second.page).length, 0, 'asking is not the same as being granted');
    await second.page.close();
  },
);

test('forgetting Google access while the review is open adds nothing', { skip, timeout: 60000 }, async () => {
  const { page, calendar } = await openWithGoogle();
  await connectGoogle(page, { write: true });
  await askModel(stack, page, 'Please make an event.');
  await openReview(page, 'Review calendar event: Synthetic event');
  assert.match(await page.text('#review-body'), /owner@example\.invalid/);
  await page.click('#google-forget');
  await page.click('#review-approve');
  await page.waitFor(`window.peaNotices.some((n) => /Google connection changed/.test(n))`, 'the refusal');
  assert.equal(posts(page).length, 0);
  assert.equal(calendar.added.length, 0);
  assert.equal(await receipt(page), '');
  await page.close();
});
