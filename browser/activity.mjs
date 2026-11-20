// What PEA did for one reply, step by step, for the owner to see while it happens. Every step is
// something this page itself did or sent: nothing here comes from a model's words, so a reply
// cannot claim work that was not done. A trail is kept for this tab only. It is never saved, put
// in a backup or sent to a model.

// Icons: 24 by 24, drawn as strokes. Each is a list of SVG path data.
export const activityIcons = {
  person: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5'],
  memory: ['M12 3l2.6 5.600L20 9.500l-4 4 1 6-5-2.900L7 19.500l1-6-4-4 5.4-.900z'],
  file: ['M7 3h7l4 4v14H7z', 'M14 3v4h4', 'M10 12h5', 'M10 16h5'],
  calendar: ['M5 6h14v14H5z', 'M5 10h14', 'M9 3v4', 'M15 3v4'],
  mail: ['M4 6h16v12H4z', 'M4 7l8 6 8-6'],
  list: ['M9 7h10', 'M9 12h10', 'M9 17h10', 'M5 7h.01', 'M5 12h.01', 'M5 17h.01'],
  globe: [
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    'M3 12h18',
    'M12 3c3 3.5 3 14.5 0 18',
    'M12 3c-3 3.5-3 14.5 0 18',
  ],
  book: ['M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z', 'M5 17a3 3 0 0 1 3-3h11'],
  chat: ['M4 5h16v11H10l-5 4v-4H4z'],
  shield: ['M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z', 'M9 12l2 2 4-4'],
  send: ['M4 12l16-8-6 16-3-7z', 'M11 13l9-9'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2'],
  pen: ['M4 20l1-4L16 5l3 3L8 19z', 'M14 7l3 3'],
  check: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M8 12l3 3 5-6'],
  stop: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M9 9h6v6H9z'],
  warn: ['M12 4l9 16H3z', 'M12 10v4', 'M12 17h.01'],
};

// A name from elsewhere (a model's, a file's, a site's), safe to show on one line.
function line(value, max) {
  if (typeof value !== 'string') return '';
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return [...cleaned].slice(0, max).join('');
}
const count = (n) => (Number.isInteger(n) && n > 0 ? n : 0);
const some = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// How long something took, in words.
export function took(ms) {
  if (!(ms >= 0)) return '';
  if (ms < 1000) return 'under a second';
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

// The steps up to the moment a request leaves: what went with it, how it was approved and where
// it was sent. `sent` holds counts and names only, never the shared words themselves.
export function contextSteps(sent = {}) {
  const steps = [];
  const add = (icon, text) => steps.push({ icon, text });
  if (sent.introduction) add('person', 'Included your introduction');
  if (count(sent.memories)) add('memory', `Recalled ${some(sent.memories, 'memory', 'memories')} of yours`);
  const file = line(sent.file, 80);
  if (file) add('file', `Included an excerpt of ${file}`);
  const events = count(sent.calendar) + count(sent.ownEvents);
  if (events) add('calendar', `Included ${some(events, 'calendar event', 'calendar events')}`);
  if (count(sent.mail)) add('mail', `Included ${some(sent.mail, 'item', 'items')} from your mail snapshot`);
  if (sent.todos) add('list', 'Included your to-do list');
  const page = line(sent.page, 80);
  if (page) add('globe', `Included the page you read at ${page}`);
  if (count(sent.canon)) add('book', `Included ${some(sent.canon, 'card', 'cards')} of her history`);
  if (sent.days) add('book', 'Included her days around today');
  if (count(sent.history))
    add('chat', `Included ${some(sent.history, 'earlier message', 'earlier messages')}`);
  add(
    'shield',
    sent.reviewed ? 'You reviewed what is shared' : 'Used the approval you gave earlier in this tab',
  );
  const model = line(sent.model?.name, 80) || 'your model';
  add('send', `Sent to ${model} ${sent.model?.local ? 'on your own server' : 'through OpenRouter'}`);
  return steps;
}

// A trail starts when the request leaves.
export function startTrail(steps, now) {
  return {
    steps: Array.isArray(steps) ? steps.slice(0, 20) : [],
    sentAt: now,
    firstAt: null,
    endAt: null,
    outcome: null,
    offered: false,
  };
}
export function firstWords(trail, now) {
  if (trail && trail.firstAt === null && trail.endAt === null) trail.firstAt = now;
}
// How the request ended: 'done', 'stopped' by the owner, or 'failed'. `offered` says the reply
// carries something for the owner to review.
export function endTrail(trail, { complete, stopped = false, offered = false }, now) {
  if (!trail || trail.endAt !== null) return;
  trail.endAt = now;
  trail.outcome = complete ? 'done' : stopped ? 'stopped' : 'failed';
  trail.offered = Boolean(complete && offered);
}
export const trailActive = (trail) => trail.endAt === null;

// The rows to draw: each has an icon, words, and a state of 'done', 'active' or 'problem'.
export function trailRows(trail) {
  const rows = trail.steps.map((s) => ({ icon: s.icon, text: s.text, state: 'done' }));
  const row = (icon, text, state = 'done') => rows.push({ icon, text, state });
  if (trail.firstAt !== null) row('clock', `First words after ${took(trail.firstAt - trail.sentAt)}`);
  else if (trail.endAt === null) row('clock', 'Waiting for the first words…', 'active');
  if (trail.endAt === null) {
    if (trail.firstAt !== null) row('pen', 'Writing the reply…', 'active');
    return rows;
  }
  if (trail.outcome === 'done') {
    row('pen', `Wrote the reply in ${took(trail.endAt - (trail.firstAt ?? trail.sentAt))}`);
    if (trail.offered) row('check', 'Offered something for you to review, below');
  } else if (trail.outcome === 'stopped') row('stop', 'Stopped before the reply was finished', 'problem');
  else row('warn', 'The request did not finish. PEA did not retry or use another model.', 'problem');
  return rows;
}
// The one line shown over the rows, and all that shows once a finished trail is folded away.
export function trailSummary(trail) {
  const steps = some(trailRows(trail).filter((r) => r.state !== 'active').length, 'step', 'steps');
  if (trail.endAt === null) return 'What PEA is doing';
  const time = took(trail.endAt - trail.sentAt);
  if (trail.outcome === 'stopped') return `What PEA did · ${steps} · stopped after ${time}`;
  if (trail.outcome === 'failed') return `What PEA did · ${steps} · did not finish`;
  return `What PEA did · ${steps} · ${time}`;
}
