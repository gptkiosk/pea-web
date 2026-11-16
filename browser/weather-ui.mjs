// The weather card on Today. It is off, and contacts nothing, until the owner agrees in a review and
// chooses a place. After that the owner's browser asks Open-Meteo for the forecast when PEA opens,
// when the owner presses Refresh, and when the owner returns to a tab whose forecast is over half
// an hour old. Nothing runs while the page is closed and nothing here reaches a model.
import {
  describeWeather,
  forecastURL,
  placeLabel,
  placeQuery,
  placesURL,
  readForecast,
  readPlaces,
  validSavedWeather,
  weatherConsent,
} from './weather.mjs';

const $ = (id) => document.getElementById(id);
const storageKey = 'pea-weather-v1';
const stale = 30 * 60 * 1000;

// One bounded, credential-free request. A redirect or an oversized answer is an error.
async function ask(url, max = 100000) {
  const response = await fetch(url, {
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(12000),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('unavailable');
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let size = 0,
    text = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) throw new Error('too large');
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return JSON.parse(text);
}

export function installWeather({ notice, review, changed = () => {} }) {
  let saved = null,
    agreed = false,
    forecast = null,
    fetchedAt = 0,
    busy = false;
  try {
    const value = JSON.parse(globalThis.localStorage.getItem(storageKey) || 'null');
    if (validSavedWeather(value)) saved = value;
  } catch {
    // Nothing usable was saved; the card starts off.
  }
  if (saved) $('weather-unit').value = saved.unit;

  const degrees = () => (saved?.unit === 'fahrenheit' ? '°F' : '°C');
  const dayName = (date, index) =>
    index === 0 ? 'Today' : new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long' });

  function render(problem = '') {
    // Whatever shows a summary of this card redraws after it.
    queueMicrotask(changed);
    $('weather-status').textContent = !saved ? 'Off' : forecast ? forecast.now.temperature + degrees() : '…';
    $('weather-peek').textContent = !saved
      ? 'Off until you choose a place'
      : forecast
        ? `${placeLabel(saved.place)} · ${describeWeather(forecast.now.code)}`
        : placeLabel(saved.place);
    $('weather-now').hidden = !saved || !forecast;
    $('weather-form').hidden = !!saved;
    $('weather-credit').hidden = !saved;
    if (saved && forecast) {
      $('weather-temperature').textContent = forecast.now.temperature + degrees();
      $('weather-condition').textContent =
        `${describeWeather(forecast.now.code)} · wind ${forecast.now.wind} ${saved.unit === 'fahrenheit' ? 'mph' : 'km/h'}`;
      $('weather-days').replaceChildren(
        ...forecast.days.map((day, index) => {
          const li = document.createElement('li');
          li.textContent =
            `${dayName(day.date, index)}: ${describeWeather(day.code)}, ${day.high}° / ${day.low}°` +
            (day.rain === null ? '' : `, ${day.rain}% chance of rain or snow`);
          return li;
        }),
      );
    }
    $('weather-note').textContent =
      problem ||
      (!saved
        ? 'Type a town or city to see its weather here. Nothing is contacted until you agree.'
        : forecast
          ? `${placeLabel(saved.place)}. Updated ${new Date(fetchedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.`
          : 'Getting the forecast…');
    for (const id of ['weather-find', 'weather-refresh']) $(id).disabled = busy;
  }

  async function refresh() {
    if (!saved || busy) return;
    busy = true;
    render();
    let problem = '';
    try {
      forecast = readForecast(await ask(forecastURL(saved.place, saved.unit)), saved.unit);
      fetchedAt = Date.now();
    } catch {
      problem = forecast
        ? 'The weather could not be refreshed just now. Showing the last forecast.'
        : 'The weather could not be fetched just now. Press Refresh to try again.';
    }
    busy = false;
    render(problem);
  }

  function choose(place) {
    saved = { place, unit: $('weather-unit').value === 'fahrenheit' ? 'fahrenheit' : 'celsius' };
    try {
      globalThis.localStorage.setItem(storageKey, JSON.stringify(saved));
    } catch {
      notice('This browser would not save the place; weather will be off again after a reload.');
    }
    $('weather-places').replaceChildren();
    $('weather-place').value = '';
    forecast = null;
    void refresh();
  }

  $('weather-form').onsubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    let query;
    try {
      query = placeQuery($('weather-place').value);
    } catch (error) {
      return notice(error.message);
    }
    // The first request to the weather service in this page waits for the owner's agreement.
    if (!agreed) {
      if (!(await review('Turn on weather', weatherConsent))) return;
      agreed = true;
    }
    busy = true;
    render();
    let places = [],
      problem = '';
    try {
      places = readPlaces(await ask(placesURL(query)));
      if (!places.length) problem = 'No place by that name was found. Try adding the country.';
    } catch {
      problem = 'The place could not be looked up just now.';
    }
    busy = false;
    $('weather-places').replaceChildren(
      ...places.map((place) => {
        const li = document.createElement('li'),
          button = document.createElement('button');
        button.type = 'button';
        button.className = 'text-button';
        button.textContent = placeLabel(place);
        button.onclick = () => choose(place);
        li.append(button);
        return li;
      }),
    );
    render(problem || 'Choose the place you meant.');
  };
  $('weather-refresh').onclick = () => void refresh();
  $('weather-off').onclick = () => {
    saved = null;
    forecast = null;
    agreed = false;
    try {
      globalThis.localStorage.removeItem(storageKey);
    } catch {
      // Off for this page either way.
    }
    render();
    notice('Weather is off. The saved place was removed from this browser.');
  };
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && saved && Date.now() - fetchedAt > stale) void refresh();
  });

  render();
  if (saved) void refresh();
  return {
    render,
    refresh,
    // What the card is showing now, for the summary on Today, or null while it is off or loading.
    summary: () =>
      saved && forecast
        ? {
            temperature: forecast.now.temperature + degrees(),
            condition: describeWeather(forecast.now.code),
            place: placeLabel(saved.place),
          }
        : null,
  };
}
