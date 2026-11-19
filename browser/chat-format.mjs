// How the prose of a reply is laid out: paragraphs, headings, lists, tables, quotes, emphasis and
// links. Pure functions that give plain data; the page builds elements from it with textContent
// only, so nothing a model writes is ever read as markup. A link is the one thing a reply can make
// pressable, and only a plain https address that passes safeLink below. Fenced blocks are split
// off before this, in handoff.mjs; codeTokens, chartData and diagramSteps describe what is in them.

// An address a reply may link to, or null. Only https, a real host name with a dot, no sign-in
// part, no control characters, and not over long. What comes back is the browser's own spelling.
export function safeLink(value) {
  if (typeof value !== 'string' || value.length > 600 || /[\s\u0000-\u001f\u007f<>"`\\]/.test(value))
    return null;
  if (!/^https:\/\//i.test(value)) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')) return null;
  if (!/^[a-z0-9.-]+$/.test(url.hostname) || url.hostname.startsWith('.') || url.hostname.endsWith('.'))
    return null;
  return { href: url.href, host: url.hostname };
}
// A link run. The words shown are the model's, so the host is always given beside them, and words
// that are themselves another address are replaced by the real one.
function linkRun(text, target) {
  const link = safeLink(target);
  if (!link) return null;
  const words = text.trim();
  const looksLikeAddress = /^(?:https?:\/\/|www\.)|^[\w-]+(?:\.[\w-]+)+(?:\/\S*)?$/i.test(words);
  const shown = !words || looksLikeAddress ? link.href : words;
  return {
    text: shown.slice(0, 300),
    style: 'link',
    href: link.href,
    host: shown === link.href ? '' : link.host,
  };
}

// Splits one line into runs: plain, bold, italic, struck, code or a link. Marks that do not close
// stay as typed.
export function inlineRuns(text) {
  const runs = [];
  const push = (value, style) => {
    if (!value) return;
    const last = runs.at(-1);
    if (last && last.style === style && style !== 'link') last.text += value;
    else runs.push({ text: value, style });
  };
  let i = 0,
    plain = '';
  const flush = () => {
    push(plain, '');
    plain = '';
  };
  // A closing mark must follow something other than a space, and the span must stay on one line.
  const closing = (mark, from) => {
    for (let at = text.indexOf(mark, from); at >= 0; at = text.indexOf(mark, at + 1)) {
      if (at > from && !/\s/.test(text[at - 1])) return at;
    }
    return -1;
  };
  while (i < text.length) {
    const ch = text[i];
    if (ch === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        push(text.slice(i + 1, end), 'code');
        i = end + 1;
        continue;
      }
    } else if (ch === '[') {
      // [words](https://address)
      const close = text.indexOf('](', i + 1),
        end = close > i ? text.indexOf(')', close + 2) : -1;
      const run =
        end > 0 && !text.slice(i + 1, close).includes('[')
          ? linkRun(text.slice(i + 1, close), text.slice(close + 2, end))
          : null;
      if (run) {
        flush();
        runs.push(run);
        i = end + 1;
        continue;
      }
    } else if (text.startsWith('https://', i) && !/[\w/]/.test(text[i - 1] ?? '')) {
      // A bare address, up to the next space, without the punctuation that ends a sentence.
      const raw = /^\S+/.exec(text.slice(i))[0].replace(/[.,;:!?)\]'"]+$/, '');
      const run = linkRun(raw, raw);
      if (run) {
        flush();
        runs.push(run);
        i += raw.length;
        continue;
      }
    } else if (text.startsWith('~~', i) && text[i + 2] && !/\s/.test(text[i + 2])) {
      const end = closing('~~', i + 2);
      if (end > 0) {
        flush();
        push(text.slice(i + 2, end), 'strike');
        i = end + 2;
        continue;
      }
    } else if (text.startsWith('**', i) && text[i + 2] && !/\s/.test(text[i + 2])) {
      const end = closing('**', i + 2);
      if (end > 0) {
        flush();
        push(text.slice(i + 2, end), 'bold');
        i = end + 2;
        continue;
      }
    } else if (
      (ch === '*' || ch === '_') &&
      text[i + 1] &&
      !/[\s*_]/.test(text[i + 1]) &&
      // An underscore inside a word (snake_case) is not emphasis.
      (ch === '*' || !/[A-Za-z0-9]/.test(text[i - 1] ?? ''))
    ) {
      let end = closing(ch, i + 1);
      while (end > 0 && ch === '_' && /[A-Za-z0-9]/.test(text[end + 1] ?? '')) end = closing(ch, end + 1);
      if (end > 0 && text[end + 1] !== ch) {
        flush();
        push(text.slice(i + 1, end), 'italic');
        i = end + 1;
        continue;
      }
    }
    plain += ch;
    i++;
  }
  flush();
  return runs;
}

const heading = /^(#{1,6})\s+(.+?)\s*#*$/;
const bullet = /^(\s*)(?:[-*+•])\s+(.+)$/;
const numbered = /^(\s*)(\d{1,3})[.)]\s+(.+)$/;
const rule = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const quote = /^\s*>\s?(.*)$/;
const tableRow = /^\s*\|(.+)\|\s*$/;
const tableRule = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const cells = (line) =>
  tableRow
    .exec(line)[1]
    .split('|')
    .map((cell) => cell.trim());
const task = /^\[( |x|X)\]\s+(.*)$/;

// Blocks of a reply's prose, in order:
//   { kind: 'heading', level: 1..3, runs }
//   { kind: 'list', ordered, items: [{ depth: 0..2, number, done, runs }] }  done: true, false or null
//   { kind: 'table', head: [runs], rows: [[runs]] }
//   { kind: 'quote', runs }   { kind: 'rule' }   { kind: 'paragraph', runs }
// Line breaks inside a paragraph or quote are kept as the model wrote them.
export function proseBlocks(text) {
  if (typeof text !== 'string') return [];
  const blocks = [];
  let open = null; // the paragraph, quote or list still being added to
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  for (let at = 0; at < lines.length; at++) {
    const raw = lines[at];
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) {
      open = null;
      continue;
    }
    let m;
    // A table: a row of cells, a row of dashes, then rows with the same number of cells.
    if (tableRow.test(line) && tableRule.test(lines[at + 1] ?? '') && cells(line).length <= 8) {
      const head = cells(line),
        rows = [];
      at += 2;
      while (at < lines.length && tableRow.test(lines[at]) && rows.length < 60) {
        const row = cells(lines[at]).slice(0, head.length);
        while (row.length < head.length) row.push('');
        rows.push(row.map(inlineRuns));
        at++;
      }
      at--;
      blocks.push({ kind: 'table', head: head.map(inlineRuns), rows });
      open = null;
      continue;
    }
    if (rule.test(line)) {
      blocks.push({ kind: 'rule' });
      open = null;
    } else if ((m = heading.exec(line.trim()))) {
      blocks.push({ kind: 'heading', level: Math.min(3, m[1].length), runs: inlineRuns(m[2]) });
      open = null;
    } else if ((m = bullet.exec(line)) || (m = numbered.exec(line))) {
      const ordered = m.length === 4;
      const depth = Math.min(2, Math.floor(m[1].replace(/\t/g, '  ').length / 2));
      // A nested item keeps to the list it sits in, whichever kind it is.
      if (open?.kind !== 'list' || (depth === 0 && open.ordered !== ordered)) {
        open = { kind: 'list', ordered, items: [] };
        blocks.push(open);
      }
      const words = ordered ? m[3] : m[2],
        box = ordered ? null : task.exec(words);
      open.items.push({
        depth,
        number: ordered ? Number(m[2]) : null,
        // "- [ ] buy seeds" is a line to tick; it is shown ticked or not, and cannot be pressed.
        done: box ? box[1] !== ' ' : null,
        runs: inlineRuns(box ? box[2] : words),
      });
    } else if ((m = quote.exec(line))) {
      if (open?.kind === 'quote') open.text += '\n' + m[1];
      else {
        open = { kind: 'quote', text: m[1] };
        blocks.push(open);
      }
    } else if (open?.kind === 'list' && /^\s{2,}\S/.test(line)) {
      // An indented line under a list item continues that item.
      const item = open.items.at(-1);
      item.runs = [...item.runs, ...inlineRuns(' ' + line.trim())];
    } else if (open?.kind === 'paragraph') open.text += '\n' + line.trim();
    else {
      open = { kind: 'paragraph', text: line.trim() };
      blocks.push(open);
    }
  }
  return blocks.map((block) =>
    block.kind === 'paragraph' || block.kind === 'quote'
      ? { kind: block.kind, runs: inlineRuns(block.text) }
      : block,
  );
}

// Whether a scrolling box is showing its newest content, give or take a little.
export const atLatest = ({ scrollTop, clientHeight, scrollHeight }, slack = 72) =>
  scrollHeight - scrollTop - clientHeight <= slack;

// Code split into coloured parts: comments, text in quotes, numbers and common words of the
// language. A light pass for reading, with no claim to know any language fully.
const keywords = new Set(
  'and as async await break case catch class const continue def default del do elif else enum except export extends false finally fn for from func function if impl import in interface is let match new nil none not null of or package pass private protected pub public raise return self static struct super switch this throw true try type typeof undefined use var void while with yield'.split(
    ' ',
  ),
);
export function codeTokens(text, language = '') {
  const out = [];
  const push = (value, kind) => {
    if (!value) return;
    const last = out.at(-1);
    if (last && last.kind === kind) last.text += value;
    else out.push({ text: value, kind });
  };
  const hash = !/^(?:js|javascript|ts|typescript|java|c|cpp|c\+\+|cs|go|rust|swift|kotlin|css|json)$/i.test(
    language,
  );
  const pattern = new RegExp(
    [
      '(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)' + (hash ? '|#[^\\n]*' : '') + ')',
      '("(?:[^"\\\\\\n]|\\\\.)*"?|\'(?:[^\'\\\\\\n]|\\\\.)*\'?|`(?:[^`\\\\]|\\\\.)*`?)',
      '(\\b\\d+(?:\\.\\d+)?\\b)',
      '([A-Za-z_][A-Za-z0-9_]*)',
    ].join('|'),
    'g',
  );
  let last = 0;
  for (let m; (m = pattern.exec(text)) && out.length < 4000;) {
    push(text.slice(last, m.index), '');
    if (m[1]) push(m[1], 'comment');
    else if (m[2]) push(m[2], 'string');
    else if (m[3]) push(m[3], 'number');
    else push(m[4], keywords.has(m[4].toLowerCase()) ? 'keyword' : '');
    last = pattern.lastIndex;
  }
  push(text.slice(last), '');
  return out;
}

// A chart block: one "Label: number" (or "Label | number") per line, 2 to 12 lines, an optional
// first line "title: ...". Gives { title, unit, bars: [{ label, value, share }] } or null, where
// share is the bar's length from 0 to 1. Anything else is not a chart and stays a code window.
export function chartData(text) {
  if (typeof text !== 'string' || text.length > 2000) return null;
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  let title = '';
  if (/^title\s*:/i.test(lines[0] ?? ''))
    title = lines
      .shift()
      .replace(/^title\s*:\s*/i, '')
      .slice(0, 80);
  if (lines.length < 2 || lines.length > 12) return null;
  const bars = [];
  let unit = null;
  for (const line of lines) {
    const m = /^(.{1,40}?)\s*[:|]\s*(-?\d{1,12}(?:[.,]\d{1,4})?)\s*([%A-Za-z°€$£]{0,6})$/.exec(line);
    if (!m) return null;
    const value = Number(m[2].replace(',', '.'));
    if (!Number.isFinite(value) || value < 0) return null;
    if (unit !== null && unit !== m[3]) return null;
    unit = m[3];
    bars.push({ label: m[1].trim(), value });
  }
  const most = Math.max(...bars.map((bar) => bar.value));
  if (most <= 0) return null;
  return {
    title,
    unit: unit ?? '',
    bars: bars.map((bar) => ({ ...bar, share: Math.round((bar.value / most) * 1000) / 1000 })),
  };
}

// A diagram block: steps joined by arrows, as "A --> B --> C" on one line or one arrow a line.
// Gives the steps in order, 2 to 12 of them, or null. Mermaid's "graph TD" first line and its
// "A[Label]" boxes are understood; branches are not, and then it stays a code window.
export function diagramSteps(text) {
  if (typeof text !== 'string' || text.length > 2000) return null;
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^(?:graph|flowchart)\b/i.test(line));
  if (!lines.length) return null;
  const name = (part) => {
    const boxed = /^[\w-]{1,30}\s*[\[({]+\s*"?(.*?)"?\s*[\])}]+$/.exec(part);
    return (boxed ? boxed[1] : part).replace(/^\|.*?\|\s*/, '').trim();
  };
  const ids = new Map(),
    steps = [];
  for (const line of lines) {
    const parts = line.split(/\s*-{1,2}>\s*/).map((part) => part.replace(/;$/, '').trim());
    if (parts.length < 2 || parts.some((part) => !part)) return null;
    for (const [index, part] of parts.entries()) {
      const id = /^([\w-]{1,30})\s*[\[({]/.exec(part)?.[1] ?? part;
      const label = name(part);
      if (!label || label.length > 60) return null;
      if (!ids.has(id) || label !== id) ids.set(id, label);
      // Each arrow must carry on from the last step: a chain, not a tree.
      if (index === 0 && steps.length && steps.at(-1) !== id) return null;
      if (index > 0 || !steps.length) {
        if (steps.includes(id)) return null;
        steps.push(id);
      }
    }
  }
  return steps.length >= 2 && steps.length <= 12 ? steps.map((id) => ids.get(id)) : null;
}
