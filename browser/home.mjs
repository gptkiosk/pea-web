// The summary at the top of Today, as a pure function. It is built only from what the page
// already holds: the weather card's forecast, the next calendar event, the owner's open to-dos and
// the newest headlines on screen. Building it asks nothing of anyone and nothing here reaches a model.

export const homeLimits = { headlines: 3, text: 160 };

const clip = (value, limit = homeLimits.text) => {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return text.length > limit ? text.slice(0, limit - 1).trimEnd() + '…' : text;
};
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// The end of the local day that `now` falls in.
export const endOfDay = (now) => new Date(now).setHours(24, 0, 0, 0);

// Open to-dos in a sentence: how many, how many are late or due today, and the next one due.
export function todoLine(open, now) {
  if (!Array.isArray(open) || !open.length) return '';
  const dated = open.filter((t) => Number.isFinite(t.due)).sort((a, b) => a.due - b.due);
  const overdue = dated.filter((t) => t.due < now).length,
    today = dated.filter((t) => t.due >= now && t.due < endOfDay(now)).length,
    next = dated.find((t) => t.due >= now) ?? dated[0];
  return [
    count(open.length, 'to-do open', 'to-dos open'),
    overdue ? `${overdue} overdue` : '',
    today ? `${today} due later today` : '',
    next ? 'next: ' + clip(next.title, 80) : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

// The lines to show, in order. Each names the card on Today that it comes from. A source that is
// off or empty gives no line.
export function homeLines({
  weather = null,
  event = null,
  todos = [],
  headlines = [],
  now = Date.now(),
} = {}) {
  const lines = [];
  if (weather && typeof weather.temperature === 'string' && weather.temperature)
    lines.push({
      kind: 'Weather',
      text: clip([weather.temperature, weather.condition, weather.place].filter(Boolean).join(' · ')),
      target: 'weather-section',
    });
  if (event && typeof event.title === 'string' && event.title.trim())
    lines.push({
      kind: 'Next',
      text: clip([event.title, event.start].filter((part) => typeof part === 'string' && part).join(' · ')),
      target: 'upcoming-section',
    });
  const doing = todoLine(todos, now);
  if (doing) lines.push({ kind: 'To-dos', text: doing, target: 'todos-section' });
  for (const item of (Array.isArray(headlines) ? headlines : []).slice(0, homeLimits.headlines))
    if (typeof item?.title === 'string' && item.title)
      lines.push({
        kind: 'Headline',
        text: clip(item.title),
        detail: clip(item.source ?? '', 60),
        target: 'headlines-section',
      });
  return lines;
}
