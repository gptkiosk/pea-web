// The weather card's rules, as plain data and pure functions. The owner's browser asks Open-Meteo
// directly, and only after the owner has agreed to that; nothing here goes to a model.
// Open-Meteo's free service is for non-commercial use, needs no key, and asks for a visible credit.
import { containsCredential } from './connections.mjs';

export const weatherSource = {
  name: 'Open-Meteo',
  places: 'https://geocoding-api.open-meteo.com/v1/search',
  forecast: 'https://api.open-meteo.com/v1/forecast',
  credit: 'https://open-meteo.com/',
  terms: 'https://open-meteo.com/en/terms',
};
export const weatherUnits = ['celsius', 'fahrenheit'];

const line = (value, max) =>
  typeof value === 'string' &&
  value.length >= 1 &&
  value.length <= max &&
  !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value);
const number = (value, low, high) =>
  typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;

// What the owner typed, tidied. Throws with a plain reason when it cannot be looked up.
export function placeQuery(text) {
  const clean = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length < 2 || clean.length > 80 || !line(clean, 80))
    throw new Error('Type a town or city, 2 to 80 characters.');
  if (containsCredential(clean)) throw new Error('That looks like a credential, not a place.');
  return clean;
}

export function placesURL(query) {
  const url = new URL(weatherSource.places);
  url.search = new URLSearchParams({ name: placeQuery(query), count: '5', language: 'en', format: 'json' });
  return url.href;
}

// A place is kept to two decimal places, about a kilometre: enough for weather and no more exact.
const round = (value) => Math.round(value * 100) / 100;
export function validPlace(place) {
  return (
    !!place &&
    typeof place === 'object' &&
    !Array.isArray(place) &&
    Object.keys(place).sort().join(',') === 'country,latitude,longitude,name,region' &&
    line(place.name, 80) &&
    (place.region === '' || line(place.region, 80)) &&
    (place.country === '' || line(place.country, 80)) &&
    number(place.latitude, -90, 90) &&
    number(place.longitude, -180, 180) &&
    round(place.latitude) === place.latitude &&
    round(place.longitude) === place.longitude
  );
}

// The places a lookup offered, at most five. Anything malformed is left out; nothing is repaired.
export function readPlaces(answer) {
  const rows = answer && typeof answer === 'object' && Array.isArray(answer.results) ? answer.results : [];
  const places = [];
  for (const row of rows.slice(0, 20)) {
    if (!row || typeof row !== 'object') continue;
    if (!number(row.latitude, -90, 90) || !number(row.longitude, -180, 180)) continue;
    const place = {
      name: row.name,
      region: typeof row.admin1 === 'string' ? row.admin1 : '',
      country: typeof row.country === 'string' ? row.country : '',
      latitude: round(row.latitude),
      longitude: round(row.longitude),
    };
    if (validPlace(place) && places.length < 5) places.push(place);
  }
  return places;
}

export const placeLabel = (place) => [place.name, place.region, place.country].filter(Boolean).join(', ');

export function forecastURL(place, unit) {
  if (!validPlace(place) || !weatherUnits.includes(unit)) throw new Error('Choose a place first.');
  const url = new URL(weatherSource.forecast);
  url.search = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: 'temperature_2m,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    forecast_days: '3',
    timezone: 'auto',
    temperature_unit: unit,
    wind_speed_unit: unit === 'fahrenheit' ? 'mph' : 'kmh',
  });
  return url.href;
}

// The standard weather codes, in plain words.
const conditions = new Map([
  [0, 'Clear'],
  [1, 'Mostly clear'],
  [2, 'Partly cloudy'],
  [3, 'Overcast'],
  [45, 'Fog'],
  [48, 'Freezing fog'],
  [51, 'Light drizzle'],
  [53, 'Drizzle'],
  [55, 'Heavy drizzle'],
  [56, 'Light freezing drizzle'],
  [57, 'Freezing drizzle'],
  [61, 'Light rain'],
  [63, 'Rain'],
  [65, 'Heavy rain'],
  [66, 'Light freezing rain'],
  [67, 'Freezing rain'],
  [71, 'Light snow'],
  [73, 'Snow'],
  [75, 'Heavy snow'],
  [77, 'Snow grains'],
  [80, 'Light showers'],
  [81, 'Showers'],
  [82, 'Heavy showers'],
  [85, 'Light snow showers'],
  [86, 'Snow showers'],
  [95, 'Thunderstorm'],
  [96, 'Thunderstorm with hail'],
  [99, 'Thunderstorm with heavy hail'],
]);
export const describeWeather = (code) => conditions.get(code) ?? 'Conditions not named';

// A forecast answer, checked. Throws if any part is missing or outside what weather can be.
export function readForecast(answer, unit) {
  const fail = () => {
    throw new Error('The weather answer could not be read.');
  };
  if (!weatherUnits.includes(unit)) fail();
  const [coldest, hottest, windiest] = unit === 'fahrenheit' ? [-150, 150, 300] : [-100, 70, 500];
  const now = answer?.current,
    daily = answer?.daily;
  if (!now || typeof now !== 'object' || !daily || typeof daily !== 'object') fail();
  const code = (value) => Number.isInteger(value) && value >= 0 && value <= 99;
  if (
    !number(now.temperature_2m, coldest, hottest) ||
    !code(now.weather_code) ||
    !number(now.wind_speed_10m, 0, windiest)
  )
    fail();
  const lists = [
    daily.time,
    daily.weather_code,
    daily.temperature_2m_max,
    daily.temperature_2m_min,
    daily.precipitation_probability_max,
  ];
  if (!lists.every((list) => Array.isArray(list) && list.length === lists[0].length) || lists[0].length < 1)
    fail();
  const days = [];
  for (let i = 0; i < Math.min(3, lists[0].length); i++) {
    const [date, sky, high, low, rain] = lists.map((list) => list[i]);
    if (
      typeof date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !code(sky) ||
      !number(high, coldest, hottest) ||
      !number(low, coldest, hottest) ||
      !(rain === null || number(rain, 0, 100))
    )
      fail();
    days.push({
      date,
      code: sky,
      high: Math.round(high),
      low: Math.round(low),
      rain: rain === null ? null : Math.round(rain),
    });
  }
  return {
    now: {
      temperature: Math.round(now.temperature_2m),
      code: now.weather_code,
      wind: Math.round(now.wind_speed_10m),
    },
    days,
  };
}

// What is kept on this browser once the owner has chosen a place: the place and the unit, nothing else.
export function validSavedWeather(value) {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === 'place,unit' &&
    validPlace(value.place) &&
    weatherUnits.includes(value.unit)
  );
}

export const weatherConsent = [
  'Weather comes from Open-Meteo, a public weather service in Switzerland. PEA does not run it.',
  'Your browser will contact it directly: once to look up the place you type, and then for the forecast each time you open PEA or press Refresh. It sees your network address, the place name you type and the place’s position to about a kilometre. Its terms say its logs are kept for 90 days.',
  'Nothing else is sent: no account, no chat, no key. The weather is shown to you only and is not given to your model.',
  'Open-Meteo’s free service is for personal, non-commercial use. If you run PEA for a business, do not turn this on without their paid plan.',
  'The place and unit are saved on this browser, in plain form, until you turn weather off.',
].join('\n\n');
