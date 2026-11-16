// Browser-level checks for the summary at the top of Today. It repeats what the cards below
// already hold, asks nothing of anyone, shows other people's words as text, and reaches no model.
// Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { askModel, browserSkipReason, openConnectedPage, startStack } from './harness.mjs';

const skip = browserSkipReason();
const options = { skip, timeout: 90000 };
const places = 'https://geocoding-api.open-meteo.com/';
const forecasts = 'https://api.open-meteo.com/';
const feed = 'https://news.example/feed.xml';

const site = {
  names: ['news.example'],
  answer: ({ path }) =>
    path === '/feed.xml'
      ? {
          type: 'application/rss+xml',
          body:
            '<rss version="2.0"><channel><title>Synthetic Daily</title>' +
            ['ONE <img src=x onerror="window.__homeRan = true">', 'TWO', 'THREE', 'FOUR']
              .map(
                (title, n) =>
                  `<item><title><![CDATA[HEADLINE ${title}]]></title><link>https://news.example/${n}</link><pubDate>Sun, 15 Nov 2026 1${9 - n}:00:00 GMT</pubDate></item>`,
              )
              .join('') +
            '</channel></rss>',
        }
      : { status: 404 },
};

let stack;
before(
  async () => {
    if (!skip) stack = await startStack(() => 'A plain synthetic reply.', { site });
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

const lines = (page) =>
  page.evaluate(
    `[...document.querySelectorAll('#home-lines .home-line')].map((b) => [...b.children].map((s) => s.textContent))`,
  );
const kinds = async (page) => (await lines(page)).map((line) => line[0]);
const reviewOpen = `document.getElementById('review').open`;

test(
  'the summary is empty until a card has something, then repeats it and opens that card',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1500 });
    try {
      await page.route(places, () => ({
        body: {
          results: [
            {
              name: 'Fixtureville',
              admin1: 'Test Region',
              country: 'Synthetica',
              latitude: 51.5,
              longitude: -0.1,
            },
          ],
        },
      }));
      await page.route(forecasts, () => ({
        status: 200,
        body: {
          current: { temperature_2m: 11.6, weather_code: 61, wind_speed_10m: 14.4 },
          daily: {
            time: ['2026-11-15', '2026-11-16', '2026-11-17'],
            weather_code: [61, 3, 0],
            temperature_2m_max: [12.4, 10.5, 9.1],
            temperature_2m_min: [6.6, 5.2, -1.4],
            precipitation_probability_max: [85, 20, null],
          },
        },
      }));
      await page.click('#tab-today');
      assert.deepEqual(await lines(page), []);
      assert.equal(await page.evaluate(`document.getElementById('home-empty').hidden`), false);
      assert.match(await page.text('#home-empty'), /Nothing to show yet/);
      assert.ok(
        !(await page.text('#home-card')).includes('Synthetic'),
        'the sample calendar event is not shown as the owner’s day',
      );
      assert.deepEqual(page.outsideRequests(), [], 'the summary asks nothing of anyone');
      const sites = stack.site.requests.length;

      // A to-do.
      await page.fill('#todo-title', 'Synthetic errand');
      await page.evaluate(`document.getElementById('todo-add').requestSubmit()`);
      await page.waitFor(
        `document.querySelectorAll('#home-lines .home-line').length === 1`,
        'the to-do line',
      );
      assert.deepEqual(await lines(page), [['To-dos', '1 to-do open']]);
      assert.equal(await page.evaluate(`document.getElementById('home-empty').hidden`), true);

      // The weather, once the owner has turned it on in its own card.
      await page.fill('#weather-place', 'Fixtureville');
      await page.evaluate(`document.getElementById('weather-form').requestSubmit()`);
      await page.waitFor(reviewOpen, 'the weather review');
      await page.click('#review-approve');
      await page.waitFor(`document.querySelector('#weather-places button')`, 'the matching place');
      await page.click('#weather-places button');
      await page.waitFor(
        `document.querySelectorAll('#home-lines .home-line').length === 2`,
        'the weather line',
      );
      assert.deepEqual((await lines(page))[0], [
        'Weather',
        '12°C · Light rain · Fixtureville, Test Region, Synthetica',
      ]);

      // Headlines, once a feed has been added and approved in its own card. Titles are text.
      await page.fill('#headline-address', feed);
      await page.evaluate(`document.getElementById('headline-form').requestSubmit()`);
      await page.waitFor(reviewOpen, 'the feed review');
      await page.click('#review-approve');
      await page.waitFor(
        `document.querySelectorAll('#home-lines .home-line').length === 5`,
        'three headline lines',
      );
      assert.deepEqual(await lines(page), [
        ['Weather', '12°C · Light rain · Fixtureville, Test Region, Synthetica'],
        ['To-dos', '1 to-do open'],
        ['Headline', 'HEADLINE ONE (Synthetic Daily)'],
        ['Headline', 'HEADLINE TWO (Synthetic Daily)'],
        ['Headline', 'HEADLINE THREE (Synthetic Daily)'],
      ]);
      assert.equal(
        await page.evaluate(`document.querySelectorAll('#home-card img, #home-card a').length`),
        0,
      );
      assert.equal(await page.evaluate(`window.__homeRan`), undefined);
      assert.equal(stack.site.requests.length, sites + 1, 'only the Headlines card asked the site, once');

      // A line opens the card it came from.
      await page.evaluate(`document.getElementById('headlines-section').open = false`);
      await page.evaluate(`[...document.querySelectorAll('#home-lines .home-line')].at(-1).click()`);
      assert.equal(await page.evaluate(`document.getElementById('headlines-section').open`), true);
      await page.evaluate(`document.getElementById('weather-section').open = false`);
      await page.click('#home-lines .home-line');
      assert.equal(await page.evaluate(`document.getElementById('weather-section').open`), true);
      assert.equal(await page.evaluate(`location.pathname`), '/');

      // Nothing in the summary reaches a model.
      await page.click('#tab-chat');
      await askModel(stack, page, 'Anything I should know?');
      assert.doesNotMatch(JSON.stringify(stack.model.requests.at(-1)), /HEADLINE|Fixtureville|12°C/);

      // Turning a card off takes its line away; finishing the to-do takes the last one.
      await page.click('#tab-today');
      await page.click('#weather-off');
      await page.evaluate(`document.querySelector('#headline-feeds button').click()`);
      await page.waitFor(
        `document.querySelectorAll('#home-lines .home-line').length === 1`,
        'only the to-do line',
      );
      assert.deepEqual(await kinds(page), ['To-dos']);
      await page.click('#todo-list input[type="checkbox"]');
      await page.waitFor(
        `document.querySelectorAll('#home-lines .home-line').length === 0`,
        'an empty summary',
      );
      assert.equal(await page.evaluate(`document.getElementById('home-empty').hidden`), false);
      assert.equal(stack.site.requests.length, sites + 1);
    } finally {
      await page.evaluate(
        `(() => { document.getElementById('weather-off')?.click(); document.querySelector('#headline-feeds button')?.click(); })()`,
      );
      await page.close();
    }
  },
);

test('to-dos in the summary belong to the profile in view', options, async () => {
  const page = await openConnectedPage(stack, { width: 1500 });
  await page.click('#tab-today');
  await page.fill('#todo-title', 'Synthetic personal errand');
  await page.evaluate(`document.getElementById('todo-add').requestSubmit()`);
  await page.waitFor(`document.querySelectorAll('#home-lines .home-line').length === 1`, 'the to-do line');
  await page.fill('#profile', 'work');
  await page.waitFor(`document.querySelectorAll('#home-lines .home-line').length === 0`, 'no line in Work');
  await page.fill('#profile', 'blended');
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.deepEqual(await lines(page), []);
  await page.fill('#profile', 'personal');
  await page.waitFor(`document.querySelectorAll('#home-lines .home-line').length === 1`, 'the line again');
  await page.click('#todo-list input[type="checkbox"]');
  await page.close();
});
