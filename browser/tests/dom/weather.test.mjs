// Browser-level checks for the weather card on Today. Open-Meteo is never contacted: the test
// answers its two addresses itself, and checks the page asks for nothing else.
// Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { askModel, browserSkipReason, openConnectedPage, startStack } from './harness.mjs';

const skip = browserSkipReason();
const options = { skip, timeout: 60000 };
const places = 'https://geocoding-api.open-meteo.com/';
const forecasts = 'https://api.open-meteo.com/';

let stack;
before(
  async () => {
    if (!skip) stack = await startStack(() => 'A plain synthetic reply.');
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

const found = {
  results: [
    {
      name: 'Fixtureville',
      admin1: 'Test Region',
      country: 'Synthetica',
      latitude: 51.50853,
      longitude: -0.12574,
    },
    { name: 'Fixtureville', admin1: 'Other Region', country: 'Elsewhere', latitude: 40.7, longitude: -74.0 },
    { name: '<img src=x onerror=alert(1)>', country: 'Markup', latitude: 1, longitude: 1 },
  ],
};
const weather = (temperature) => ({
  current: { temperature_2m: temperature, weather_code: 61, wind_speed_10m: 14.4 },
  daily: {
    time: ['2026-11-15', '2026-11-16', '2026-11-17'],
    weather_code: [61, 3, 0],
    temperature_2m_max: [12.4, 10.5, 9.1],
    temperature_2m_min: [6.6, 5.2, -1.4],
    precipitation_probability_max: [85, 20, null],
  },
});
const asked = (page, prefix) => page.intercepted.filter((r) => r.url.startsWith(prefix));
const noticed = (page, text) =>
  page.waitFor(
    `(window.peaNotices || []).some((n) => n.includes(${JSON.stringify(text)}))`,
    'notice: ' + text,
  );

test(
  'weather is off until the owner agrees, then shows one place and can be turned off',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1500 });
    let forecast = { status: 200, body: weather(11.6) };
    await page.route(places, () => ({ body: found }));
    await page.route(forecasts, () => forecast);
    await page.click('#tab-today');
    assert.equal(await page.text('#weather-status'), 'Off');
    assert.equal(await page.evaluate(`document.getElementById('weather-now').hidden`), true);
    assert.equal(await page.evaluate(`document.getElementById('weather-credit').hidden`), true);
    assert.deepEqual(page.outsideRequests(), [], 'nothing is contacted while it is off');

    // Typing a place asks first, and declining contacts nothing.
    await page.evaluate(`document.getElementById('weather-section').open = true`);
    await page.fill('#weather-place', '  Fixtureville ');
    await page.evaluate(`document.getElementById('weather-form').requestSubmit()`);
    await page.waitFor(`document.querySelector('#review').open`, 'the review');
    const review = await page.text('#review-body');
    for (const said of [/Open-Meteo/, /network address/, /not given to your model/, /non-commercial/])
      assert.match(review, said);
    await page.click('#review-cancel');
    await page.waitFor(`!document.querySelector('#review').open`);
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.deepEqual(page.outsideRequests(), [], 'declining contacts nothing');

    // Agreeing looks the place up, and only that.
    await page.evaluate(`document.getElementById('weather-form').requestSubmit()`);
    await page.waitFor(`document.querySelector('#review').open`, 'the review again');
    await page.click('#review-approve');
    await page.waitFor(
      `document.querySelectorAll('#weather-places button').length === 3`,
      'the matching places',
    );
    const lookup = new URL(asked(page, places)[0].url);
    assert.equal(lookup.pathname, '/v1/search');
    assert.deepEqual(Object.fromEntries(lookup.searchParams), {
      name: 'Fixtureville',
      count: '5',
      language: 'en',
      format: 'json',
    });
    assert.equal(asked(page, forecasts).length, 0, 'no forecast before a place is chosen');
    assert.equal(
      await page.evaluate(`document.querySelectorAll('#weather-places img').length`),
      0,
      'a place name is shown as text, never as markup',
    );
    assert.match(await page.text('#weather-places'), /<img src=x/);

    // Choosing one fetches its forecast and shows it with the credit.
    await page.fill('#weather-unit', 'fahrenheit');
    await page.evaluate(`document.querySelector('#weather-places button').click()`);
    await page.waitFor(`!document.getElementById('weather-now').hidden`, 'the forecast');
    const request = new URL(asked(page, forecasts)[0].url);
    assert.equal(request.pathname, '/v1/forecast');
    assert.equal(request.searchParams.get('latitude'), '51.51', 'the position is rounded before it is sent');
    assert.equal(request.searchParams.get('longitude'), '-0.13');
    assert.equal(request.searchParams.get('temperature_unit'), 'fahrenheit');
    assert.equal(await page.text('#weather-temperature'), '12°F');
    assert.match(await page.text('#weather-condition'), /Light rain · wind 14 mph/);
    const days = await page.text('#weather-days');
    assert.match(days, /Today: Light rain, 12° \/ 7°, 85% chance of rain or snow/);
    assert.match(days, /Clear, 9° \/ -1°\s*$/);
    assert.equal(await page.text('#weather-status'), '12°F');
    assert.match(await page.text('#weather-peek'), /Fixtureville, Test Region, Synthetica · Light rain/);
    assert.equal(await page.evaluate(`document.getElementById('weather-credit').hidden`), false);
    assert.equal(
      await page.evaluate(`document.querySelector('#weather-credit a').href`),
      'https://open-meteo.com/',
    );
    assert.equal(await page.evaluate(`document.getElementById('weather-form').hidden`), true);
    assert.deepEqual(JSON.parse(await page.evaluate(`localStorage.getItem('pea-weather-v1')`)), {
      place: {
        name: 'Fixtureville',
        region: 'Test Region',
        country: 'Synthetica',
        latitude: 51.51,
        longitude: -0.13,
      },
      unit: 'fahrenheit',
    });
    for (const sent of page.intercepted) {
      const names = Object.keys(sent.headers).map((name) => name.toLowerCase());
      assert(
        !names.includes('authorization') && !names.includes('cookie') && !names.includes('referer'),
        sent.url,
      );
      assert.equal(sent.method, 'GET');
    }

    // The weather is for the owner's eyes: a chat request does not carry it.
    await page.click('#tab-chat');
    await askModel(stack, page, 'What should I wear today?');
    assert.doesNotMatch(JSON.stringify(stack.model.requests.at(-1)), /Fixtureville|Light rain|open-meteo/i);
    await page.click('#tab-today');

    // A failed refresh keeps the last forecast and says so.
    forecast = { status: 500, body: {} };
    await page.click('#weather-refresh');
    await page.waitFor(
      `document.getElementById('weather-note').textContent.includes('could not be refreshed')`,
      'the refresh failure',
    );
    assert.equal(await page.text('#weather-temperature'), '12°F');
    // An answer that is not a forecast is treated the same way, and nothing from it is shown.
    forecast = {
      status: 200,
      body: { current: { temperature_2m: '<b>hot</b>', weather_code: 0, wind_speed_10m: 1 }, daily: {} },
    };
    await page.click('#weather-refresh');
    await page.waitFor(`!document.getElementById('weather-refresh').disabled`, 'the refresh to finish');
    assert.equal(await page.text('#weather-temperature'), '12°F');
    forecast = { status: 200, body: weather(20.2) };
    await page.click('#weather-refresh');
    await page.waitFor(
      `document.getElementById('weather-temperature').textContent === '20°F'`,
      'the new forecast',
    );

    // After a reload the saved place is used again without another review.
    const before = asked(page, forecasts).length;
    await page.goto(stack.gateway.origin + '/');
    await page.waitFor(
      `document.getElementById('weather-status').textContent === '20°F'`,
      'the forecast after a reload',
    );
    assert.equal(asked(page, forecasts).length, before + 1);
    assert.equal(await page.evaluate(`document.querySelector('#review').open`), false);

    // Turning it off removes the saved place and stops every request.
    await page.click('#tab-today');
    await page.evaluate(`document.getElementById('weather-section').open = true`);
    await page.click('#weather-off');
    await noticed(page, 'Weather is off.');
    assert.equal(await page.evaluate(`localStorage.getItem('pea-weather-v1')`), null);
    assert.equal(await page.text('#weather-status'), 'Off');
    assert.equal(await page.evaluate(`document.getElementById('weather-now').hidden`), true);
    const total = page.intercepted.length;
    await page.evaluate(`document.dispatchEvent(new Event('visibilitychange'))`);
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(page.intercepted.length, total);
    assert(
      page.outsideRequests().every((url) => url.startsWith(places) || url.startsWith(forecasts)),
      'only the two weather addresses were ever asked',
    );
    await page.close();
  },
);

test('a place that is not found, or a lookup that fails, leaves weather off', options, async () => {
  const page = await openConnectedPage(stack, { width: 1500 });
  let answer = { body: { generationtime_ms: 1 } };
  await page.route(places, () => answer);
  await page.route(forecasts, () => ({ body: weather(1) }));
  await page.click('#tab-today');
  await page.evaluate(`document.getElementById('weather-section').open = true`);
  await page.fill('#weather-place', 'x');
  await page.evaluate(`document.getElementById('weather-form').requestSubmit()`);
  await noticed(page, 'Type a town or city');
  assert.equal(
    await page.evaluate(`document.querySelector('#review').open`),
    false,
    'no review for an unusable name',
  );
  await page.fill('#weather-place', 'Nowhere at all');
  await page.evaluate(`document.getElementById('weather-form').requestSubmit()`);
  await page.waitFor(`document.querySelector('#review').open`, 'the review');
  await page.click('#review-approve');
  await page.waitFor(
    `document.getElementById('weather-note').textContent.includes('No place by that name')`,
    'the not-found message',
  );
  answer = { status: 429, body: {} };
  await page.evaluate(`document.getElementById('weather-form').requestSubmit()`);
  await page.waitFor(
    `document.getElementById('weather-note').textContent.includes('could not be looked up')`,
    'the lookup failure',
  );
  assert.equal(
    await page.evaluate(`document.querySelector('#review').open`),
    false,
    'agreed once in this page',
  );
  assert.equal(asked(page, forecasts).length, 0);
  assert.equal(await page.evaluate(`localStorage.getItem('pea-weather-v1')`), null);
  assert.equal(await page.text('#weather-status'), 'Off');
  await page.close();
});
