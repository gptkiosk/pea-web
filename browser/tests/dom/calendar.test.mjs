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

// What the synthetic model answers to a request to change one of PEA's own events.
const editBlock = (value) => 'Here you go.\n```pea-calendar\n' + JSON.stringify(value) + '\n```\n';
const edits = {
  move: editBlock({
    op: 'calendar_change',
    ref: 'e1',
    title: 'Moved lunch',
    start: '2031-02-03T18:00:00Z',
    end: '2031-02-03T19:00:00Z',
  }),
  cancel: editBlock({ op: 'calendar_delete', ref: 'e1' }),
  unlisted: editBlock({ op: 'calendar_delete', ref: 'e9' }),
  boast: 'I’ve moved your meeting to Friday.',
};
// Events already in the stand-in calendar: one PEA added, one PEA's mark with a guest, one the
// owner made. Only the first may ever be offered for a change.
const seeded = (profile) => [
  {
    id: 'pea00000000000000000000000000000001',
    summary: 'Synthetic lunch',
    description: 'Synthetic notes to keep',
    start: { dateTime: '2031-02-03T17:00:00Z' },
    end: { dateTime: '2031-02-03T18:00:00Z' },
    extendedProperties: { private: { peaCreated: '1', peaProfile: profile } },
  },
  {
    id: 'pea00000000000000000000000000000002',
    summary: 'Marked but shared',
    start: { dateTime: '2031-02-04T17:00:00Z' },
    end: { dateTime: '2031-02-04T18:00:00Z' },
    attendees: [{ email: 'guest@example.invalid' }],
    extendedProperties: { private: { peaCreated: '1', peaProfile: profile } },
  },
  {
    id: 'ownermade0000000000000',
    summary: 'Owner’s own dentist visit',
    start: { dateTime: '2031-02-05T17:00:00Z' },
    end: { dateTime: '2031-02-05T18:00:00Z' },
  },
];

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
    stack = await startStack((said) => {
      const key = Object.keys(edits).find((word) => said.includes(word));
      return key ? edits[key] : said.includes('event') ? proposal : 'A plain synthetic reply.';
    });
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
    // One event by its id: read, change or delete, the last two only for the version named.
    if (at.pathname.startsWith(new URL(events).pathname + '/')) {
      const id = at.pathname.split('/').pop(),
        found = calendar.added.find((e) => e.id === id),
        version = Object.entries(request.headers).find(([k]) => k.toLowerCase() === 'if-match')?.[1];
      if (!found) return { status: request.method === 'DELETE' ? 410 : 404, body: { error: 'gone' } };
      if (request.method === 'GET') return { body: { status: 'confirmed', etag: '"v1"', ...found } };
      if (version !== (found.etag ?? '"v1"')) return { status: 412, body: { error: 'precondition' } };
      if (request.method === 'DELETE') {
        calendar.added.splice(calendar.added.indexOf(found), 1);
        return { status: 204, text: '' };
      }
      if (request.method === 'PATCH') {
        Object.assign(found, JSON.parse(request.postData), { etag: '"v2"' });
        return { body: { id, status: 'confirmed' } };
      }
    }
    if (url.startsWith(events) && request.method === 'GET') {
      // The list honours "only events carrying these private marks", as Google's does.
      const marks = at.searchParams.getAll('privateExtendedProperty').map((m) => m.split('='));
      return {
        body: {
          items: calendar.added
            .filter((e) => marks.every(([k, v]) => e.extendedProperties?.private?.[k] === v))
            .map((e) => ({ status: 'confirmed', etag: '"v1"', ...e })),
        },
      };
    }
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

// A page connected with calendar changes, the three seeded events in the calendar, and the
// calendar snapshot shared with the model.
async function openWithOwnEvents({ share = true } = {}) {
  const { page, calendar } = await openWithGoogle();
  calendar.added.push(...seeded(await page.evaluate(`document.querySelector('#profile').value`)));
  await connectGoogle(page, { write: true });
  if (share) await page.click('#share-calendar');
  return { page, calendar };
}
const changes = (page, method) =>
  page.intercepted.filter((r) => r.url.startsWith(events + '/') && r.method === method);
const system = () => stack.model.requests.at(-1).messages[0].content;

test(
  'an event PEA added is changed only after review, only its title and times, and only that version',
  { skip, timeout: 60000 },
  async () => {
    const { page, calendar } = await openWithOwnEvents();
    await askModel(stack, page, 'Please move my lunch.');
    assert.match(
      system(),
      /"ownEvents":\[\{"ref":"e1","title":"Synthetic lunch"/,
      'PEA’s own event is listed with a ref',
    );
    assert.doesNotMatch(system(), /pea0000000000/, 'no real event id is sent to the model');
    assert.doesNotMatch(system(), /"ref":"e2"/, 'the marked event with a guest is not offered');
    assert.match(system(), /calendar_change/, 'the model is told how to propose a change');

    await openReview(page, 'Review event change: Synthetic lunch');
    assert.match(await page.text('#review-title'), /Change this event in your calendar\?/);
    const shown = await page.text('#review-body');
    assert.match(shown, /Google calendar of owner@example\.invalid/);
    assert.match(shown, /Now:\s*Synthetic lunch[\s\S]*UTC start: 2031-02-03T17:00:00Z/);
    assert.match(shown, /After approval:\s*Moved lunch[\s\S]*UTC start: 2031-02-03T18:00:00Z/);
    assert.match(shown, /no notices/);
    await page.click('#review-cancel');
    await page.waitFor(`!document.querySelector('#review').open`);
    assert.equal(changes(page, 'PATCH').length, 0, 'cancel changes nothing');

    await openReview(page, 'Review event change: Synthetic lunch');
    await page.click('#review-approve');
    await page.waitFor(`document.querySelector('#messages .event-receipt')`, 'the receipt');
    assert.match(await receipt(page), /Event changed in your Google calendar/);
    const sent = changes(page, 'PATCH');
    assert.equal(sent.length, 1);
    assert.match(sent[0].url, /\/events\/pea00000000000000000000000000000001\?/);
    assert.equal(new URL(sent[0].url).searchParams.get('sendUpdates'), 'none');
    assert.equal(sent[0].headers['If-Match'] ?? sent[0].headers['if-match'], '"v1"');
    assert.deepEqual(JSON.parse(sent[0].sent), {
      summary: 'Moved lunch',
      start: { dateTime: '2031-02-03T18:00:00Z' },
      end: { dateTime: '2031-02-03T19:00:00Z' },
    });
    assert.equal(calendar.added[0].description, 'Synthetic notes to keep', 'notes are untouched');
    assert.equal(calendar.added[2].summary, 'Owner’s own dentist visit');
    assert.equal(changes(page, 'DELETE').length, 0);
    onlyStandIns(page);
    await page.close();
  },
);

test(
  'an event PEA added is removed only after review, and the owner’s other events are never touched',
  { skip, timeout: 60000 },
  async () => {
    const { page, calendar } = await openWithOwnEvents();
    await askModel(stack, page, 'Please cancel my lunch.');
    await openReview(page, 'Review event removal: Synthetic lunch');
    assert.match(await page.text('#review-title'), /Remove this event from your calendar\?/);
    assert.match(
      await page.text('#review-body'),
      /Event to remove:\s*Synthetic lunch[\s\S]*cannot bring it back/,
    );
    await page.click('#review-cancel');
    await page.waitFor(`!document.querySelector('#review').open`);
    assert.equal(calendar.added.length, 3, 'cancel removes nothing');

    await openReview(page, 'Review event removal: Synthetic lunch');
    await page.click('#review-approve');
    await page.waitFor(`document.querySelector('#messages .event-receipt')`, 'the receipt');
    assert.match(await receipt(page), /Event removed from your Google calendar/);
    const sent = changes(page, 'DELETE');
    assert.equal(sent.length, 1);
    assert.match(sent[0].url, /\/events\/pea00000000000000000000000000000001\?/);
    assert.deepEqual(
      calendar.added.map((e) => e.summary),
      ['Marked but shared', 'Owner’s own dentist visit'],
    );
    assert.equal(changes(page, 'PATCH').length, 0);
    await page.close();
  },
);

test('an event that changed after the review opened is left alone', { skip, timeout: 60000 }, async () => {
  const { page, calendar } = await openWithOwnEvents();
  await askModel(stack, page, 'Please cancel my lunch.');
  await openReview(page, 'Review event removal: Synthetic lunch');
  // Someone edits the event in Google Calendar while the review is open.
  calendar.added[0].etag = '"edited-elsewhere"';
  await page.click('#review-approve');
  await page.waitFor(`window.peaNotices.some((n) => /changed after you reviewed/.test(n))`, 'the refusal');
  assert.equal(changes(page, 'DELETE').length, 0, 'nothing is sent for a version the owner did not see');
  assert.equal(calendar.added.length, 3);
  assert.equal(await receipt(page), '');

  // A guest added meanwhile makes it no longer PEA's to change at all.
  calendar.added[0].attendees = [{ email: 'guest@example.invalid' }];
  await page.waitFor(`!document.querySelector('#profile').disabled`);
  await page.clickText('Review event removal: Synthetic lunch');
  await page.waitFor(`window.peaNotices.some((n) => /only events it added/.test(n))`, 'the refusal');
  assert.equal(await page.evaluate(`document.querySelector('#review').open`), false, 'no review is offered');
  assert.equal(calendar.added.length, 3);
  await page.close();
});

test(
  'nothing is offered for an event the model was not given, or when the calendar is not shared',
  { skip, timeout: 60000 },
  async () => {
    const { page, calendar } = await openWithOwnEvents();
    const offered = () =>
      page.evaluate(
        `[...document.querySelectorAll('#messages button')].filter((b) => /^Review event/.test(b.textContent)).length`,
      );
    await askModel(stack, page, 'Take out the unlisted one.');
    assert.equal(await offered(), 0, 'a ref outside the list means nothing');
    await askModel(stack, page, 'Give me a boast.');
    assert.match(await page.text('#messages'), /PEA did not change or remove an event from this reply/);
    await page.close();

    // Calendar changes connected, but the calendar is not shared with the model.
    const quiet = await openWithOwnEvents({ share: false });
    await askModel(stack, quiet.page, 'Please cancel my lunch.');
    assert.doesNotMatch(
      system(),
      /ownEvents|Synthetic lunch|calendar_change/,
      'nothing about PEA’s events is sent',
    );
    assert.equal(
      await quiet.page.evaluate(
        `[...document.querySelectorAll('#messages button')].filter((b) => /^Review event/.test(b.textContent)).length`,
      ),
      0,
      'a ref the model was never given is not honoured',
    );
    assert.equal(changes(quiet.page, 'DELETE').length + changes(quiet.page, 'PATCH').length, 0);
    assert.equal(quiet.calendar.added.length, 3);
    assert.equal(calendar.added.length, 3);
    await quiet.page.close();
  },
);
