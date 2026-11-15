import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  describeWeather,
  forecastURL,
  placeLabel,
  placeQuery,
  placesURL,
  readForecast,
  readPlaces,
  validPlace,
  validSavedWeather,
  weatherConsent,
  weatherSource,
} from '../weather.mjs';

const place = {
  name: 'Fixtureville',
  region: 'Test Region',
  country: 'Synthetica',
  latitude: 51.51,
  longitude: -0.13,
};
const answer = () => ({
  current: { temperature_2m: 11.6, weather_code: 3, wind_speed_10m: 14.4 },
  daily: {
    time: ['2026-11-15', '2026-11-16', '2026-11-17'],
    weather_code: [3, 61, 0],
    temperature_2m_max: [12.4, 10.5, 9.1],
    temperature_2m_min: [6.6, 5.2, -1.4],
    precipitation_probability_max: [20, 85, null],
  },
});

test('a typed place is tidied and bounded, and only that leaves the browser', () => {
  assert.equal(placeQuery('  New   Fixture  '), 'New Fixture');
  for (const bad of ['', ' ', 'x', 'y'.repeat(81), 'two\u0000', 'ghp_' + 'A'.repeat(24), null])
    assert.throws(() => placeQuery(bad), String(bad).slice(0, 12));
  const url = new URL(placesURL('Zoë’s Town, Synthetica'));
  assert.equal(url.origin + url.pathname, weatherSource.places);
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    name: 'Zoë’s Town, Synthetica',
    count: '5',
    language: 'en',
    format: 'json',
  });
});

test('offered places are checked, rounded to about a kilometre and limited to five', () => {
  const rows = [
    {
      name: 'Fixtureville',
      admin1: 'Test Region',
      country: 'Synthetica',
      latitude: 51.50853,
      longitude: -0.12574,
      population: 9,
    },
    { name: 'No Region', latitude: -33.86785, longitude: 151.20732 },
    { name: 'Bad latitude', latitude: 91, longitude: 0 },
    { name: 'Text position', latitude: '51.5', longitude: 0 },
    { name: 'two\nlines', latitude: 1, longitude: 1 },
    { name: 7, latitude: 1, longitude: 1 },
    null,
    ...Array.from({ length: 8 }, (_, n) => ({ name: 'Extra ' + n, latitude: n, longitude: n })),
  ];
  const places = readPlaces({ results: rows });
  assert.equal(places.length, 5);
  assert.deepEqual(places[0], place);
  assert.deepEqual(places[1], {
    name: 'No Region',
    region: '',
    country: '',
    latitude: -33.87,
    longitude: 151.21,
  });
  assert(places.every(validPlace));
  assert.equal(placeLabel(places[0]), 'Fixtureville, Test Region, Synthetica');
  assert.equal(placeLabel(places[1]), 'No Region');
  for (const nothing of [null, {}, { results: 'x' }, { results: [] }, []])
    assert.deepEqual(readPlaces(nothing), []);
  assert.equal(validPlace({ ...place, latitude: 51.508 }), false, 'a more exact position is not kept');
  assert.equal(validPlace({ ...place, extra: 1 }), false);
});

test('the forecast request names only the place, the unit and what is shown', () => {
  const url = new URL(forecastURL(place, 'celsius'));
  assert.equal(url.origin + url.pathname, weatherSource.forecast);
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    latitude: '51.51',
    longitude: '-0.13',
    current: 'temperature_2m,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    forecast_days: '3',
    timezone: 'auto',
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
  });
  assert.equal(new URL(forecastURL(place, 'fahrenheit')).searchParams.get('wind_speed_unit'), 'mph');
  assert.throws(() => forecastURL(place, 'kelvin'));
  assert.throws(() => forecastURL({ ...place, latitude: 200 }, 'celsius'));
});

test('a forecast is read exactly or not at all', () => {
  assert.deepEqual(readForecast(answer(), 'celsius'), {
    now: { temperature: 12, code: 3, wind: 14 },
    days: [
      { date: '2026-11-15', code: 3, high: 12, low: 7, rain: 20 },
      { date: '2026-11-16', code: 61, high: 11, low: 5, rain: 85 },
      { date: '2026-11-17', code: 0, high: 9, low: -1, rain: null },
    ],
  });
  const broken = [
    (a) => delete a.current,
    (a) => delete a.daily,
    (a) => (a.current.temperature_2m = '12'),
    (a) => (a.current.temperature_2m = 999),
    (a) => (a.current.temperature_2m = NaN),
    (a) => (a.current.weather_code = 3.5),
    (a) => (a.current.weather_code = 100),
    (a) => (a.current.wind_speed_10m = -1),
    (a) => (a.daily.time = []),
    (a) => a.daily.time.pop(),
    (a) => (a.daily.time[0] = '<b>today</b>'),
    (a) => (a.daily.temperature_2m_max[1] = null),
    (a) => (a.daily.precipitation_probability_max[0] = 101),
    (a) => (a.daily.weather_code = 'x'),
  ];
  for (const breakIt of broken) {
    const a = answer();
    breakIt(a);
    assert.throws(() => readForecast(a, 'celsius'), /could not be read/, breakIt.toString());
  }
  for (const nothing of [null, [], 'x', {}]) assert.throws(() => readForecast(nothing, 'celsius'));
  assert.throws(() => readForecast(answer(), 'kelvin'));
  assert.equal(describeWeather(95), 'Thunderstorm');
  assert.equal(describeWeather(42), 'Conditions not named');
});

test('only a place and a unit are ever saved, and the review says what is shared', async () => {
  assert.equal(validSavedWeather({ place, unit: 'celsius' }), true);
  for (const bad of [
    null,
    {},
    { place },
    { place, unit: 'kelvin' },
    { place, unit: 'celsius', agreed: true },
    { place: { ...place, latitude: 99 }, unit: 'celsius' },
  ])
    assert.equal(validSavedWeather(bad), false);
  for (const said of [
    /Open-Meteo/,
    /network address/,
    /about a kilometre/,
    /90 days/,
    /not given to your model/,
    /non-commercial/,
    /plain form/,
  ])
    assert.match(weatherConsent, said);
  // The page may contact exactly the two addresses the rules name, and the gateways allow the same.
  const hosts = [new URL(weatherSource.places).origin, new URL(weatherSource.forecast).origin];
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const contract = JSON.parse(await readFile(new URL('../server/contract.json', import.meta.url), 'utf8'));
  const policy = contract.headers['Content-Security-Policy'];
  for (const host of hosts) {
    assert(policy.includes(' ' + host + ' '), host);
    assert(html.includes(' ' + host + ' '), host);
  }
  assert(
    html.includes(`content="${policy.replace(/; frame-ancestors 'none'$/, '')}`) ||
      html.includes(policy.split('; frame-ancestors')[0]),
  );
  assert(html.includes(weatherSource.credit), 'the credit link is on the page');
});
