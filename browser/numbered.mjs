// Numbered navigation, as pure functions: the owner's own words are matched against a short fixed
// grammar and turned into a move through numbered lists. No model reads the words or chooses the
// move, so "1.2" always means the same thing. Two kinds of list are walked this way:
//   sources and their headlines (the feeds in Headlines):  Feed 1 → Headline 1.2
//   the points of PEA's last reply:                        Point 2
// This parser receives the owner's submitted words only, never a model's output.

// One sentence for the model, so its lists can be walked by number.
export const pointsGuidance =
  'When a reply lists several separate points, options or steps, number them 1., 2., 3. on their own lines, so the owner can ask about one by saying its number.';

export const numberedLimits = { points: 12, point: 240, said: 160, aloud: 8 };

const COUNT = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};
const ORDER = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
};
const N = `(\\d{1,2}|${Object.keys(COUNT).join('|')})`;
const NTH = `(${Object.keys(ORDER).join('|')}|\\d{1,2}(?:st|nd|rd|th))`;
const GROUP = '(?:feeds?|sources?)';
const ITEM = '(?:headlines?|stor(?:y|ies)|articles?|items?)';
// Words that may come before a command without changing it, as speech often adds them.
const LEAD =
  '(?:(?:please|ok|okay|hey|pea|um|uh|now|and|then|any|can you|could you|would you|will you|i want to|i d like to|let s|lets|go to|go|open|show me|show|give me|read me|read|play|jump to|take me to|switch to)\\s+)*';
const TAIL = '(?:\\s+(?:please|now|again|for me|to choose from|to pick from))*';

const number = (word) => (word === undefined ? null : (COUNT[word] ?? ORDER[word] ?? parseInt(word, 10)));
// Letters, digits and the dot between two digits; everything else is a space.
const plain = (text) =>
  text
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/(\d)\s*\.\s*(\d)/g, '$1.$2')
    .replace(/[^\p{L}\p{N}.]+/gu, ' ')
    .replace(/\.(?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// What the owner's words ask for, or null when they are not a navigation command.
export function numberedCommand(text) {
  if (typeof text !== 'string' || text.length > numberedLimits.said) return null;
  const said = plain(text);
  if (!said) return null;
  const is = (pattern) => said.match(new RegExp(`^${LEAD}${pattern}${TAIL}$`));
  let m;
  // The item that is open: read its page (after the usual review).
  if (
    /^(?:please )?(?:read it|read that|read this|read it in chat|read in chat|open it in chat)(?: please)?$/.test(
      said,
    )
  )
    return { kind: 'read' };
  // Level 1: the sources.
  if (
    is(
      `(?:(?:a|the)\\s+)?(?:list|list of|back to|names of)\\s+(?:(?:the|my|of|all)\\s+)*${GROUP}(?:\\s+names?)?`,
    ) ||
    is(`(?:a\\s+)?list\\s+of\\s+(?:the\\s+)?${GROUP}\\s+names?`) ||
    is(`my\\s+${GROUP}`)
  )
    return { kind: 'groups' };
  // Level 2: one source's items.
  if (
    (m = is(
      `(?:list\\s+)?(?:the\\s+)?(?:${ITEM}\\s+(?:for|of|from|in)\\s+)?(?:the\\s+)?${GROUP}\\s+(?:number\\s+)?${N}`,
    ))
  )
    return { kind: 'group', group: number(m[1]) };
  if ((m = is(`(?:list\\s+)?(?:the\\s+)?(?:${ITEM}\\s+(?:for|of|from|in)\\s+)?the\\s+${NTH}\\s+${GROUP}`)))
    return { kind: 'group', group: number(m[1]) };
  if (is(`(?:list|back to|list of)\\s+(?:the\\s+)?${ITEM}`)) return { kind: 'items' };
  // An item by its full number, or by its own number within the open source.
  if ((m = is(`(?:${ITEM}\\s+)?(\\d{1,2})\\.(\\d{1,2})`))) return { kind: 'item', group: +m[1], item: +m[2] };
  if ((m = is(`(?:${ITEM}\\s+)?${N}\\s+(?:point|dot)\\s+${N}`)))
    return { kind: 'item', group: number(m[1]), item: number(m[2]) };
  if ((m = is(`${GROUP}\\s+${N}\\s+${ITEM}\\s+${N}`)))
    return { kind: 'item', group: number(m[1]), item: number(m[2]) };
  if ((m = is(`(?:the\\s+)?${ITEM}\\s+(?:number\\s+)?${N}`)))
    return { kind: 'item', group: null, item: number(m[1]) };
  if ((m = is(`the\\s+${NTH}\\s+${ITEM}`))) return { kind: 'item', group: null, item: number(m[1]) };
  if (is(`(?:the\\s+)?next\\s+${ITEM}`)) return { kind: 'item-step', step: 1 };
  if (is(`(?:the\\s+)?(?:previous|last|prior)\\s+${ITEM}`)) return { kind: 'item-step', step: -1 };
  if (is(`(?:the\\s+)?(?:latest|newest|most recent)\\s+${ITEM}`)) return { kind: 'item-latest' };
  // Level 3: the points of the last reply.
  if (is(`(?:list|repeat|back to|list of)\\s+(?:the\\s+)?points?`)) return { kind: 'points' };
  if (
    (m = is(
      `(?:search|search for|look up|fact check|verify|check)\\s+(?:the\\s+)?point\\s+(?:number\\s+)?${N}`,
    ))
  )
    return { kind: 'point', point: number(m[1]), act: 'search' };
  if (
    (m = is(
      `(?:(?:dig into|more on|more about|tell me about|tell me more about|expand on|expand|explain|focus on)\\s+)?(?:the\\s+)?point\\s+(?:number\\s+)?${N}`,
    ))
  )
    return { kind: 'point', point: number(m[1]), act: 'focus' };
  if (is(`(?:the\\s+)?next\\s+point`)) return { kind: 'point-step', step: 1 };
  if (is(`(?:the\\s+)?(?:previous|prior)\\s+point`)) return { kind: 'point-step', step: -1 };
  return null;
}

const clean = (value, max) =>
  [
    ...String(value ?? '')
      .replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  ]
    .slice(0, max)
    .join('');

// The points of a reply: its numbered or bulleted lines, in order, renumbered from 1. A reply
// with fewer than two such lines has no points. Marks for bold and code are dropped.
export function replyPoints(text) {
  if (typeof text !== 'string') return [];
  const points = [];
  let fenced = false;
  for (const row of text.slice(0, 50000).split('\n')) {
    if (/^\s*```/.test(row)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const m = row.match(/^\s{0,6}(?:\d{1,2}[.)]|[-*•])\s+(\S.*)$/);
    if (!m) continue;
    const words = clean(m[1].replace(/\*\*|__|`/g, ''), numberedLimits.point);
    if (words) points.push(words);
    if (points.length === numberedLimits.points) break;
  }
  return points.length >= 2 ? points : [];
}

const blank = () => ({ group: null, item: null, point: null });

// One move. `groups` is [{ name, items: [{ title }] }], `points` the last reply's points, and
// `at` where the owner is: { group, item, point }, each a position from 0 or null.
// Gives { at, level, title, rows: [{ label, text }], say, open, send } where
//   rows  are what to show, each with the number the owner can say;
//   say   is the same thing in words, for reading aloud;
//   open  is { group, item } when an item was opened;
//   send  is a message to send to the model as the owner's own (only for a point of a reply);
//   read  is true when the owner asked to read the open item's page.
export function numberedMove(command, { groups = [], points = [], at = blank(), noun = {} } = {}) {
  const group = noun.group ?? 'Feed',
    item = noun.item ?? 'Headline',
    here = { ...blank(), ...at },
    none = (say) => ({ at: here, level: 'none', title: '', rows: [], say, open: null, send: null });
  const listGroups = () =>
    groups.length
      ? {
          at: { ...here, group: null, item: null },
          level: 'groups',
          title: `${group}s`,
          rows: groups.map((g, i) => ({
            label: String(i + 1),
            text: g.name,
            go: { kind: 'group', group: i + 1 },
          })),
          say: groups.map((g, i) => `${group} ${i + 1}: ${g.name}.`).join(' '),
          open: null,
          send: null,
        }
      : none(`You have no ${group.toLowerCase()}s yet. Add one in Headlines on Today.`);
  const listItems = (g) => {
    const found = groups[g];
    if (!found) return none(`There is no ${group.toLowerCase()} ${g + 1}. You have ${groups.length}.`);
    return {
      at: { ...here, group: g, item: null },
      level: 'items',
      title: `${group} ${g + 1}: ${found.name}`,
      rows: found.items.map((it, i) => ({
        label: `${g + 1}.${i + 1}`,
        text: it.title,
        go: { kind: 'item', group: g + 1, item: i + 1 },
      })),
      say: found.items.length
        ? `${group} ${g + 1}: ${found.name}. ` +
          found.items
            .slice(0, numberedLimits.aloud)
            .map((it, i) => `${g + 1} point ${i + 1}: ${it.title}.`)
            .join(' ') +
          (found.items.length > numberedLimits.aloud
            ? ` And ${found.items.length - numberedLimits.aloud} more on screen.`
            : '')
        : `${group} ${g + 1}: ${found.name}. It has no ${item.toLowerCase()}s loaded right now.`,
      open: null,
      send: null,
    };
  };
  const openItem = (g, i) => {
    const found = groups[g];
    if (!found) return none(`There is no ${group.toLowerCase()} ${g + 1}. You have ${groups.length}.`);
    const it = found.items[i];
    if (!it)
      return none(
        `There is no ${item.toLowerCase()} ${g + 1}.${i + 1}. ${group} ${g + 1} has ${found.items.length}.`,
      );
    return {
      at: { ...here, group: g, item: i },
      level: 'item',
      title: `${item} ${g + 1}.${i + 1} from ${found.name}`,
      rows: [{ label: `${g + 1}.${i + 1}`, text: it.title, go: null }],
      say: `${item} ${g + 1}.${i + 1} from ${found.name}: ${it.title}. Say “read it” to review reading its page.`,
      open: { group: g, item: i },
      send: null,
    };
  };
  const listPoints = (focus = null) =>
    points.length
      ? {
          at: { ...here, point: focus },
          level: 'points',
          title: 'Points of the last reply',
          rows: points.map((p, i) => ({
            label: `P${i + 1}`,
            text: p,
            go: { kind: 'point', point: i + 1, act: 'focus' },
          })),
          say: points.map((p, i) => `Point ${i + 1}: ${p}.`).join(' '),
          open: null,
          send: null,
        }
      : none('The last reply has no list of points.');
  const focusPoint = (i, act) => {
    if (!points.length) return none('The last reply has no list of points.');
    if (!points[i]) return none(`There is no point ${i + 1}. The last reply has ${points.length}.`);
    if (act === 'search')
      return {
        ...none(
          `PEA Web cannot search the web, so point ${i + 1} was not searched. Say “point ${i + 1}” to ask your model about it, or give PEA the address of a page to read.`,
        ),
        at: { ...here, point: i },
      };
    return {
      at: { ...here, point: i },
      level: 'point',
      title: `Point ${i + 1}`,
      rows: [{ label: `P${i + 1}`, text: points[i], go: null }],
      say: `Point ${i + 1}: ${points[i]}.`,
      open: null,
      send: `Tell me more about point ${i + 1} of your last reply: “${points[i]}”`,
    };
  };
  if (!command) return none('');
  switch (command.kind) {
    case 'groups':
      return listGroups();
    case 'group':
      return listItems(command.group - 1);
    case 'items':
      return here.group === null ? listGroups() : listItems(here.group);
    case 'item': {
      const g = command.group === null ? here.group : command.group - 1;
      if (g === null)
        return none(`Say which ${group.toLowerCase()} first, for example “${group.toLowerCase()} 1”.`);
      return openItem(g, command.item - 1);
    }
    case 'item-step':
      if (here.group === null)
        return none(`Say which ${group.toLowerCase()} first, for example “${group.toLowerCase()} 1”.`);
      return openItem(here.group, here.item === null ? 0 : here.item + command.step);
    case 'item-latest':
      if (here.group === null)
        return none(`Say which ${group.toLowerCase()} first, for example “${group.toLowerCase()} 1”.`);
      return openItem(here.group, 0);
    case 'read':
      if (here.group === null || here.item === null)
        return none(`Open a ${item.toLowerCase()} first, for example “1.1”.`);
      return { ...openItem(here.group, here.item), read: true };
    case 'points':
      return listPoints(here.point);
    case 'point':
      return focusPoint(command.point - 1, command.act);
    case 'point-step':
      return focusPoint(here.point === null ? 0 : here.point + command.step, 'focus');
    default:
      return none('');
  }
}
