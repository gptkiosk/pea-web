// A publisher's own transcript of one episode, as pure functions: read into lines, and the few
// passages nearest one section picked out word for word. The curator's catalog does not carry
// transcripts; it says where the publisher keeps one (`transcript_source`). The text is a
// stranger's words: it is only ever cut, never run, and what a model sees of it is a few short
// passages marked as quotation. Nothing here fetches anything.
import { textReason } from './knowledge.mjs';

export const transcriptLimits = {
  bytes: 2000000,
  lines: 12000,
  line: 1200,
  passages: 3,
  passage: 520,
  shared: 1700,
  around: 2,
  formats: ['vtt', 'srt', 'text', 'markdown', 'html'],
};

const seconds = (h, m, s) => +h * 3600 + +m * 60 + +s;
export function clock(t) {
  if (!Number.isFinite(t) || t < 0) return '';
  const whole = Math.floor(t),
    h = Math.floor(whole / 3600),
    m = Math.floor((whole % 3600) / 60),
    s = String(whole % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
// A time as a publisher writes one: 1:02:03, 02:03, 00:02:03.450 or 00:02:03,450. Null otherwise.
export function timeOf(text) {
  const m =
    typeof text === 'string'
      ? text.trim().match(/^\[?(?:(\d{1,3}):)?(\d{1,2}):(\d{2})(?:[.,]\d{1,3})?\]?$/)
      : null;
  return m && +m[2] < 60 && +m[3] < 60 ? seconds(m[1] ?? 0, m[2], m[3]) : null;
}
// One line of plain words: markup and control characters out, spaces collapsed, cut at the limit.
function plain(text) {
  const words = String(text)
    .replace(/<[^<>]{0,200}>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return [...words].slice(0, transcriptLimits.line).join('');
}
const made = (t, who, text) => {
  const words = plain(text);
  return words ? { t, who: plain(who ?? '').slice(0, 60), text: words } : null;
};

// Captions: blocks of a time range and its words. WebVTT may name the speaker as <v Name>.
function captions(text) {
  const lines = [];
  for (const block of text.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const rows = block.split('\n'),
      at = rows.findIndex((row) => row.includes('-->'));
    if (at < 0) continue;
    const t = timeOf(rows[at].split('-->')[0]),
      said = rows.slice(at + 1).join(' '),
      voice = said.match(/<v(?:\.[^ >]*)? ([^>]{1,60})>/);
    const line = made(t, voice?.[1], said);
    if (!line) continue;
    // Captions come a few words at a time: joined into a sentence or two, under one speaker.
    const last = lines.at(-1);
    if (last && last.who === line.who && last.text.length < 280 && !/[.?!…]["’”)]?$/.test(last.text))
      last.text = plain(last.text + ' ' + line.text);
    else lines.push(line);
    if (lines.length >= transcriptLimits.lines) break;
  }
  return lines;
}
// Plain words: a line each, with a time or a speaker at its start where the publisher wrote one.
function prose(text) {
  const lines = [];
  let t = null;
  for (const row of text.replace(/\r\n?/g, '\n').split('\n')) {
    let said = row.replace(/^\s{0,3}(?:#{1,6}|>|[-*+])\s+/, '').replace(/[*_`]{1,3}/g, '');
    const stamp = said.match(/^\s*[[(]?((?:\d{1,3}:)?\d{1,2}:\d{2})[\])]?\s*[-–—:]?\s*/);
    if (stamp && timeOf(stamp[1]) !== null) {
      t = timeOf(stamp[1]);
      said = said.slice(stamp[0].length);
    }
    const voice = said.match(/^([\p{Lu}][\p{L}.’' -]{1,40}):\s+(?=\S)/u);
    const line = made(t, voice?.[1], voice ? said.slice(voice[0].length) : said);
    if (line) lines.push(line);
    if (lines.length >= transcriptLimits.lines) break;
  }
  return lines;
}
// A parsed page (the browser's own inert parser made it): the rows the catalog points at.
// `extract` is the catalog's: where the transcript is, and where a row's time and speaker are.
export function pageLines(document, extract = {}) {
  const pick = (root, selectors) => {
    for (const selector of Array.isArray(selectors) ? selectors.slice(0, 6) : []) {
      if (typeof selector !== 'string' || selector.length > 120) continue;
      try {
        const found = root.querySelector(selector);
        if (found) return found;
      } catch {
        // Not a selector this browser reads: the next one is tried.
      }
    }
    return null;
  };
  const root = pick(document, extract.within) ?? document.body ?? document;
  let rows = [];
  for (const selector of Array.isArray(extract.row) ? extract.row.slice(0, 6) : []) {
    try {
      rows = [...root.querySelectorAll(selector)];
    } catch {
      rows = [];
    }
    if (rows.length) break;
  }
  if (!rows.length) rows = [...root.querySelectorAll('p, li, dd, blockquote')];
  const lines = [];
  for (const row of rows.slice(0, transcriptLimits.lines)) {
    const stamp = pick(row, extract.time),
      voice = pick(row, extract.speaker);
    let said = row.textContent ?? '';
    for (const part of [stamp, voice]) if (part?.textContent) said = said.replace(part.textContent, ' ');
    const line = made(timeOf(stamp?.textContent ?? ''), voice?.textContent, said);
    if (line) lines.push(line);
  }
  // Some pages hold the transcript as bare words between line breaks, not in rows. When the rows
  // hold less than half of what is there, the words are read line by line instead.
  const all = (root.textContent ?? '').length,
    inRows = lines.reduce((sum, line) => sum + line.text.length, 0);
  if (all > 800 && inRows < all / 2 && typeof root.cloneNode === 'function') {
    const copy = root.cloneNode(true);
    for (const gone of copy.querySelectorAll('script, style, noscript, template')) gone.remove();
    for (const br of copy.querySelectorAll('br')) br.replaceWith('\n');
    for (const block of copy.querySelectorAll('p, div, li, dd, dt, blockquote, h1, h2, h3, h4, tr'))
      block.append('\n');
    const loose = prose(copy.textContent ?? '');
    if (loose.reduce((sum, line) => sum + line.text.length, 0) > inRows) return loose;
  }
  return lines;
}

// A fetched transcript as lines [{ t, who, text }], or null when it is not usable. `t` is seconds
// into the episode, or null where the publisher gave no time. HTML is read with pageLines.
export function parseTranscript(text, format) {
  if (typeof text !== 'string' || !text || text.length > transcriptLimits.bytes) return null;
  if (!['vtt', 'srt', 'text', 'markdown'].includes(format)) return null;
  const lines = format === 'vtt' || format === 'srt' ? captions(text) : prose(text);
  return usable(lines);
}
// At least a few lines of real words, none that the catalog's own text rules would refuse outright.
export function usable(lines) {
  const kept = (lines ?? []).filter((line) => textReason(line.text) !== 'control');
  return kept.length >= 5 && kept.reduce((sum, line) => sum + line.text.length, 0) >= 400 ? kept : null;
}

const STOP = new Set(
  'the a an and or but of to in on at for with from by is are was were be been it its this that these those as he she they we you i his her their our your not no so if then than about into over after before says said say that’s it’s there here have has had will would can could just very more most also which who what when where how why them him us do does did'.split(
    ' ',
  ),
);
const terms = (text) =>
  new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .split(' ')
      .filter((word) => word.length > 2 && !STOP.has(word)),
  );
// The claim's reference as seconds: "00:12:34". An "L74" reference counts the curator's own lines,
// which this reader does not have, so it gives null and the words decide.
export const refSeconds = (ref) =>
  typeof ref === 'string' && /^\d{2,3}:\d{2}:\d{2}$/.test(ref) ? timeOf(ref) : null;

// Up to three passages nearest one claim, word for word, best first:
//   [{ t, who, text, from, to }]
// By the claim's time when the transcript has times, otherwise by the words they share.
export function passagesFor(lines, claim, ref = null) {
  if (!Array.isArray(lines) || !lines.length || typeof claim !== 'string') return [];
  const wanted = terms(claim),
    at = refSeconds(ref),
    timed = lines.some((line) => line.t !== null);
  const scored = lines.map((line, index) => {
    const shared = [...terms(line.text)].filter((word) => wanted.has(word)).length,
      near = at !== null && timed && line.t !== null && Math.abs(line.t - at) <= 45;
    return {
      index,
      shared,
      near,
      // How far from the claim's time, to choose between lines that score the same.
      apart: near ? Math.abs(line.t - at) : Infinity,
      score: shared + (near ? 3 : 0),
    };
  });
  const picked = [],
    taken = new Set();
  for (const best of [...scored].sort(
    (a, b) => b.score - a.score || a.apart - b.apart || a.index - b.index,
  )) {
    if (picked.length >= transcriptLimits.passages || best.score < 2) break;
    // The time alone picks one passage at most; the others must share the claim's words.
    if (taken.has(best.index) || (best.shared < 2 && !(best.near && !picked.length))) continue;
    let from = best.index,
      to = best.index,
      size = lines[best.index].text.length;
    // A line or two either side, while it fits, so the passage reads as it was said.
    for (let step = 1; step <= transcriptLimits.around; step++)
      for (const next of [best.index + step, best.index - step]) {
        if (next < 0 || next >= lines.length || taken.has(next)) continue;
        if (next !== to + 1 && next !== from - 1) continue;
        if (size + lines[next].text.length + 1 > transcriptLimits.passage) continue;
        size += lines[next].text.length + 1;
        if (next > to) to = next;
        else from = next;
      }
    for (let i = from; i <= to; i++) taken.add(i);
    // Word for word, with each change of speaker named where the publisher named it.
    const part = lines.slice(from, to + 1),
      voices = new Set(part.map((line) => line.who)),
      text = part
        .map(
          (line, n) =>
            (voices.size > 1 && line.who && line.who !== part[n - 1]?.who ? `${line.who}: ` : '') + line.text,
        )
        .join(' ');
    picked.push({
      t: part[0].t,
      who: voices.size === 1 ? part[0].who : '',
      text: [...text].slice(0, transcriptLimits.passage).join(''),
      from,
      to,
    });
  }
  return picked;
}

// The passages as the labelled lines that go with a Chat message, within `limit` characters.
export function passageLines(passages, address, limit = transcriptLimits.shared) {
  const lines = [];
  let room = limit;
  for (const p of passages) {
    const line = `Transcript passage for section ${address}${p.t === null ? '' : ` (at ${clock(p.t)})`}${p.who ? `, ${p.who}` : ''}: “${p.text}”`;
    if (line.length > room) break;
    room -= line.length + 1;
    lines.push(line);
  }
  return lines.length
    ? [
        `From the publisher’s own transcript of this episode, word for word, the passages nearest section ${address}. PEA read it at the owner’s request; the rest of the transcript is not here:`,
        ...lines,
      ]
    : [];
}
