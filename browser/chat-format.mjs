// How the prose of a reply is laid out: paragraphs, headings, lists, quotes and a little emphasis.
// Pure functions that give plain data; the page builds elements from it with textContent only, so
// nothing a model writes is ever read as markup. Links are left as the text the model wrote: a
// reply cannot make anything pressable. Fenced blocks are split off before this, in handoff.mjs.

// Splits one line into runs: plain, bold, italic or code. Marks that do not close stay as typed.
export function inlineRuns(text) {
  const runs = [];
  const push = (value, style) => {
    if (!value) return;
    const last = runs.at(-1);
    if (last && last.style === style) last.text += value;
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

// Blocks of a reply's prose, in order:
//   { kind: 'heading', level: 1..3, runs }
//   { kind: 'list', ordered, items: [{ depth: 0..2, number, runs }] }
//   { kind: 'quote', runs }   { kind: 'rule' }   { kind: 'paragraph', runs }
// Line breaks inside a paragraph or quote are kept as the model wrote them.
export function proseBlocks(text) {
  if (typeof text !== 'string') return [];
  const blocks = [];
  let open = null; // the paragraph, quote or list still being added to
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) {
      open = null;
      continue;
    }
    let m;
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
      open.items.push({
        depth,
        number: ordered ? Number(m[2]) : null,
        runs: inlineRuns(ordered ? m[3] : m[2]),
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
