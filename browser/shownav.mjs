// Numbered navigation through the shows the owner follows in Curated sources, as pure functions:
//   Show S  →  Episode S.E  →  Section S.E.P  →  Citation S.E.P.c.K
// Shows are in the owner's order, episodes newest first, and an episode's sections are the claims
// of its checked brief. The owner's own words are matched against a fixed grammar, most specific
// address first, so "1.2.3" always means the same place and every place can be traced back up
// ("where am I"). No model reads the words or chooses the move. This parser receives the owner's
// submitted words only, never a model's output.
import { catalogAddress, digestLines, knowledgeLimits, textReason } from './knowledge.mjs';

export const showLimits = { said: 180, sections: 6, page: 5, aloud: 6, snippet: 120 };

const COUNT = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
];
const ORDER = [
  '',
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
];
const WORD = `(?:${COUNT.slice(1).join('|')})`;
const N = '(\\d{1,2})';
const NTH = `(${ORDER.slice(1).join('|')}|\\d{1,2}(?:st|nd|rd|th))`;
const LEAD =
  '(?:(?:please|ok|okay|hey|pea|um|uh|now|and|then|no|yes|can you|could you|go to|go|open|show me|give me|read me|read|play|jump to|take me to|tell me about|lets hear|let s hear)\\s+)*';
const TAIL = '(?:\\s+(?:please|now|again|for me))*';
const nth = (word) => (ORDER.indexOf(word) > 0 ? ORDER.indexOf(word) : parseInt(word, 10));

// Lower case, marks dropped, and numbers said as words inside an address turned into digits:
// "one point two point three" and "show 1 episode 2 section 3" both become "1.2.3".
export function plainAddress(text) {
  let said = text
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/(\d)\s*\.\s*(?=\d)/g, '$1.')
    .replace(/[^\p{L}\p{N}.]+/gu, ' ')
    .replace(/\.(?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  said = said.replace(new RegExp(`\\b${WORD}\\b`, 'g'), (word) => String(COUNT.indexOf(word)));
  said = said
    .replace(/\b(\d{1,2}) point (\d{1,2}) point (\d{1,2})\b/g, '$1.$2.$3')
    .replace(/\b(\d{1,2}) point (\d{1,2})\b(?! point)/g, '$1.$2')
    .replace(/\bshow (\d{1,2}) episode (\d{1,2}) (?:section|point|claim) (\d{1,2})\b/g, '$1.$2.$3')
    .replace(/\bshow (\d{1,2}) episode (\d{1,2})\b/g, '$1.$2');
  return said;
}
const nameOf = (text) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

// What the owner's words ask for, or null. `at` is where the owner is (see showMove), and `shows`
// the followed shows, for a show asked for by name.
export function showCommand(text, { at = idle(), shows = [] } = {}) {
  if (typeof text !== 'string' || text.length > showLimits.said) return null;
  const said = plainAddress(text);
  if (!said) return null;
  const is = (pattern) => said.match(new RegExp(`^${LEAD}${pattern}${TAIL}$`));
  const active = at.show !== null && at.episode !== null,
    inShow = at.show !== null;
  let m;
  // 1. Where am I.
  if (
    inShow &&
    /^(?:where am i|what am i on|which (?:show|episode|section|point|citation|paper|study) is this)$/.test(
      said,
    )
  )
    return { kind: 'where' };
  // 2 and 3. A citation by its address, or the citations of a section.
  if (
    (m = said.match(
      /(?<![\d.])(\d{1,2})\.(\d{1,2})\.(\d{1,2})[ .]?(?:c|cite|citation)[ .]?(\d{1,2})(?![\d.])/,
    ))
  )
    return { kind: 'citation', show: +m[1], episode: +m[2], section: +m[3], number: +m[4] };
  if (
    (m = said.match(
      /\b(?:check|find|look up)(?: the)?(?: scientific)? (?:studies|papers|research) (?:for|on|behind)(?: section)? (\d{1,2})\.(\d{1,2})\.(\d{1,2})(?![\d.])/,
    ))
  )
    return { kind: 'studies', show: +m[1], episode: +m[2], section: +m[3] };
  if (
    (m = said.match(
      /\b(?:citations|studies|papers|evidence) (?:for|on) (\d{1,2})\.(\d{1,2})\.(\d{1,2})(?![\d.])/,
    ))
  )
    return { kind: 'citations', show: +m[1], episode: +m[2], section: +m[3] };
  // 4. Searching a section by its address.
  if (
    (m = said.match(
      /\b(?:search|fact check|verify|look up)(?: section)? (\d{1,2})\.(\d{1,2})\.(\d{1,2})(?![\d.])/,
    ))
  )
    return { kind: 'search', show: +m[1], episode: +m[2], section: +m[3] };
  // 5. A section by its address, alone or inside a sentence. Never a version number.
  if (!/\bversion\b/.test(said) && (m = said.match(/(?<![\d.v])(\d{1,2})\.(\d{1,2})\.(\d{1,2})(?![\d.])/)))
    return { kind: 'section', show: +m[1], episode: +m[2], section: +m[3] };
  // 6. An episode by its address: the whole message.
  if ((m = is(`(?:episode\\s+)?${N}\\.${N}`))) return { kind: 'episode', show: +m[1], episode: +m[2] };
  if (active) {
    // 7. Searching a section of the open episode.
    if ((m = is(`(?:search|fact check|verify|look up)\\s+(?:section|point|claim)\\s+${N}`)))
      return { kind: 'search', show: at.show, episode: at.episode, section: +m[1] };
    // 8. Citations of the open section.
    const here = { show: at.show, episode: at.episode, section: at.section };
    if (is('(?:list\\s+|show\\s+)?(?:the\\s+)?(?:citations|studies|papers)|back to\\s+(?:the\\s+)?citations'))
      return { kind: 'citations', ...here };
    if ((m = is('(?:the\\s+)?(next|previous|first)\\s+citation')))
      return { kind: 'citation', ...here, number: null, step: { next: 1, previous: -1, first: 0 }[m[1]] };
    if ((m = is(`(?:citation|c|paper|study)\\s*(?:number\\s+)?${N}`)))
      return { kind: 'citation', ...here, number: +m[1] };
    // Looking for studies behind the open section, or searching the web for it.
    if (
      is(
        '(?:check|find|look up)\\s+(?:the\\s+)?(?:scientific\\s+)?(?:studies|papers|research)(?:\\s+(?:for|on|behind)\\s+(?:this|the)\\s+(?:section|point|claim))?',
      )
    )
      return { kind: 'studies', ...here };
    if (is('(?:search|fact check|verify|look up)\\s+(?:this|the)\\s+(?:section|point|claim)'))
      return { kind: 'search', ...here };
    // 9. Sections of the open episode.
    if (
      is('(?:back to\\s+(?:the\\s+)?(?:episode|section)|(?:list|repeat)\\s+(?:the\\s+)?(?:sections|points))')
    )
      return { kind: 'sections' };
    if (is('(?:the\\s+)?next\\s+(?:section|point)')) return { kind: 'section-step', step: 1 };
    if (is('(?:the\\s+)?previous\\s+(?:section|point)')) return { kind: 'section-step', step: -1 };
    if (
      (m = is(
        `(?:dig into\\s+|more on\\s+|expand on\\s+)?(?:the\\s+)?(?:section|point|claim)\\s+(?:number\\s+)?${N}`,
      ))
    )
      return { kind: 'section', show: at.show, episode: at.episode, section: +m[1] };
  }
  // 10. The shows, and one show's episodes by number or by name.
  if (
    is(
      '(?:list\\s+(?:of\\s+)?(?:the\\s+|my\\s+)?shows|back to\\s+(?:the\\s+)?shows|shows? list|my shows|list\\s+(?:the\\s+|my\\s+)?podcasts)',
    )
  )
    return { kind: 'shows' };
  if (
    (m = is(
      `(?:(?:list\\s+)?(?:the\\s+)?episodes\\s+(?:for|of|in|from)\\s+)?(?:the\\s+)?(?:show|podcast)\\s+(?:number\\s+)?${N}`,
    ))
  )
    return { kind: 'show', show: +m[1] };
  if (
    (m = is(
      `(?:(?:list\\s+)?(?:the\\s+)?episodes\\s+(?:for|of|in|from)\\s+)?the\\s+${NTH}\\s+(?:show|podcast)`,
    )) ||
    (m = is(`${NTH}\\s+(?:show|podcast)`))
  )
    return { kind: 'show', show: nth(m[1]) };
  if (
    (m = said.match(
      /^(?:show references for|list episodes for|list the episodes for|episodes in|episodes for|episodes of|episodes from) (.+)$/,
    ))
  ) {
    const wanted = nameOf(m[1]).replace(/^the /, ''),
      found = shows.findIndex((s) => nameOf(s.name).replace(/^the /, '') === wanted);
    // A show keeps the number it was given, so its number is not always its place in the list.
    if (found >= 0 && Number.isInteger(shows[found].number))
      return { kind: 'show', show: shows[found].number };
    if (found >= 0) return { kind: 'show', show: found + 1 };
  }
  if (inShow) {
    // 11. Inside a show.
    if (is('(?:more|older)\\s+(?:episodes|ones)')) return { kind: 'more' };
    if (is('(?:back to|list)\\s+(?:the\\s+)?episodes')) return { kind: 'episodes' };
    if (is('(?:the\\s+)?next\\s+episode')) return { kind: 'episode-step', step: 1 };
    if (is('(?:the\\s+)?previous\\s+episode')) return { kind: 'episode-step', step: -1 };
    // Also a remark that starts with it, as speech often does: "the newest from yesterday is great".
    if (
      is('(?:the\\s+)?(?:latest|newest)(?:\\s+(?:episode|one))?') ||
      (/^the (?:latest|newest)(?: one| episode)? (?:from|is|was|sounds|looks)\b/.test(said) &&
        said.split(' ').length <= 8)
    )
      return { kind: 'episode', show: at.show, episode: 1 };
    if (is('(?:the\\s+)?(?:last|oldest)\\s+episode')) return { kind: 'episode', show: at.show, episode: -1 };
    if ((m = is(`(?:the\\s+)?episode\\s+(?:number\\s+)?${N}`)))
      return { kind: 'episode', show: at.show, episode: +m[1] };
    if ((m = is(`(?:the\\s+)?${NTH}\\s+episode`)))
      return { kind: 'episode', show: at.show, episode: nth(m[1]) };
  }
  return null;
}

// A show's number: the permanent one it was given when first followed, or its place in the list.
const numberOf = (show, index) => (Number.isInteger(show.number) ? show.number : index + 1);
const showNumbered = (shows, n) => shows.find((s, i) => numberOf(s, i) === n);

// Where the owner is: positions from 1, or null. `offset` is how far "more episodes" has gone.
export function idle() {
  return { show: null, episode: null, section: null, offset: 0 };
}
// A date as words, in the same form for every reader.
export function dayOf(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');
  if (!m) return '';
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return `${+m[3]} ${months[+m[2] - 1]} ${m[1]}`;
}
// An episode's sections: the claims of its brief, or its headline when it has none.
export function sectionsOf(brief) {
  const claims = (brief?.claims ?? []).map((c) => c.text).filter((t) => typeof t === 'string' && t);
  return (claims.length ? claims : [brief?.headline].filter(Boolean)).slice(0, showLimits.sections);
}
// What the curator's pipeline may say about how a paper bears on a claim, in plain words.
export const stances = {
  supports: 'supports the claim',
  mixed: 'mixed evidence',
  limited_human_evidence: 'limited evidence in people',
  contradicts: 'contradicts the claim',
  related: 'related, not a direct test of the claim',
};
export const citationLimits = {
  each: 4,
  title: 180,
  journal: 100,
  summary: 220,
  correlation: 220,
  shared: 1200,
};
// One claim's citations that are exactly in the expected form. The published schema does not
// describe them yet, so each is checked here and one that is not in this form is left out whole.
export function citationsOf(claim) {
  if (!Array.isArray(claim?.citations)) return [];
  const words = (v, max) => typeof v === 'string' && v.trim() && [...v].length <= max && !textReason(v);
  return claim.citations
    .filter(
      (c) =>
        c &&
        typeof c === 'object' &&
        !Array.isArray(c) &&
        Object.hasOwn(stances, c.stance) &&
        words(c.title, citationLimits.title) &&
        words(c.journal, citationLimits.journal) &&
        words(c.summary, citationLimits.summary) &&
        words(c.correlation, citationLimits.correlation) &&
        catalogAddress(c.link) &&
        (c.year == null || (Number.isInteger(c.year) && c.year >= 1800 && c.year <= 2100)) &&
        (c.cited_by == null || (Number.isInteger(c.cited_by) && c.cited_by >= 0)),
    )
    .slice(0, citationLimits.each)
    .map((c) => ({
      title: c.title,
      journal: c.journal,
      year: c.year ?? null,
      cited: c.cited_by ?? null,
      stance: c.stance,
      summary: c.summary,
      correlation: c.correlation,
      link: c.link,
    }));
}
// The citations of one section of a brief, counted as sectionsOf counts its sections.
export function sectionCitations(brief, section) {
  const claims = (brief?.claims ?? []).filter((c) => typeof c?.text === 'string' && c.text);
  return section >= 1 && section <= showLimits.sections ? citationsOf(claims[section - 1]) : [];
}
const paperLine = (c) =>
  [c.journal, c.year, c.cited === null ? null : `cited by ${c.cited}`].filter((x) => x !== null).join(' · ');
// A section's claim as words to search with: the speaker's lead dropped, marks a search cannot
// carry removed, and cut at a word within the limit. The owner reviews the exact words first.
export function claimQuery(text, max = 120) {
  if (typeof text !== 'string') return '';
  let words = text
    .replace(/^[^,]{0,60}?\b(?:says|said|argues|claims|explains|notes|reports|describes)\b(?: that)?,? /i, '')
    .replace(/[^\p{L}\p{N} ,.'’:()+&/-]+/gu, ' ')
    .replace(/\/\/|www\./gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.?!,:]+$/, '');
  if (words.length > max)
    words = words
      .slice(0, max + 1)
      .replace(/\s+\S*$/, '')
      .replace(/[,:(]+$/, '');
  return words;
}
const clip = (text, max) => ([...text].length > max ? [...text].slice(0, max - 1).join('') + '…' : text);
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// One move. `shows` is [{ name, episodes: [{ item, brief }] }]. Gives
//   { at, level, title, rows: [{ label, text, say }], hint, footer: [{ label, say }], say, send }
// where each row and footer button carries the words that pressing it stands for, `say` is the
// answer in words, and `send` a message to pass to the model as the owner's own (a section only).
export function showMove(command, { shows = [], at = idle() } = {}) {
  const move = plainMove(command, { shows, at }),
    here = move.at,
    back = [
      ...(here.episode !== null ? [{ label: 'Back to episode', say: 'back to episode' }] : []),
      ...(here.show !== null ? [{ label: 'Episodes', say: 'back to episodes' }] : []),
      ...(shows.length ? [{ label: 'Shows', say: 'list shows' }] : []),
    ];
  // Every move the answer names aloud is also a button, so it can be pressed instead of said.
  if (move.level === 'episode')
    move.footer = [
      { label: 'Next episode', say: 'next episode' },
      ...(here.episode > 1 ? [{ label: 'Previous episode', say: 'previous episode' }] : []),
      { label: 'Episodes', say: 'back to episodes' },
      { label: 'Shows', say: 'list shows' },
      { label: 'Where am I', say: 'where am I' },
    ];
  else if (move.level === 'section')
    move.footer = [
      { label: 'Next section', say: 'next section' },
      ...(here.section > 1 ? [{ label: 'Previous section', say: 'previous section' }] : []),
      ...(move.cited ? [{ label: `Citations (${move.cited})`, say: 'list citations' }] : []),
      { label: 'Check studies', say: 'check studies' },
      ...back,
      { label: 'Where am I', say: 'where am I' },
    ];
  else if (move.level === 'citations' || move.level === 'citation')
    move.footer = [
      ...(move.level === 'citation' && move.cited > 1
        ? [
            { label: 'Next citation', say: 'next citation' },
            { label: 'Citations', say: 'list citations' },
          ]
        : []),
      { label: 'Back to section', say: `${here.show}.${here.episode}.${here.section}` },
      ...back,
      { label: 'Where am I', say: 'where am I' },
    ];
  else if (move.level === 'none') move.footer = back;
  return move;
}
function plainMove(command, { shows = [], at = idle() } = {}) {
  const none = (say, here = at) => ({
    at: here,
    level: 'none',
    title: '',
    rows: [],
    hint: '',
    footer: [],
    say,
    send: null,
  });
  if (!shows.length)
    return none(
      'You follow no shows with briefs in this tab. Follow one in Curated sources on Today, or press Refresh there.',
      idle(),
    );
  const show = (s) => showNumbered(shows, s),
    episodeAt = (s, e) => show(s)?.episodes[e - 1],
    noShow = (s) =>
      none(`There is no show ${s}. Your shows are ${shows.map((x, i) => numberOf(x, i)).join(', ')}.`),
    noEpisode = (s, e) =>
      none(
        `There is no episode ${s}.${e}. Show ${s} has ${count(show(s).episodes.length, 'episode', 'episodes')} kept.`,
      );
  const listShows = () => ({
    at: idle(),
    level: 'shows',
    title: 'Your shows',
    rows: shows.map((s, i) => ({
      label: String(numberOf(s, i)),
      text: s.name,
      sub: count(s.episodes.length, 'episode', 'episodes'),
      say: `show ${numberOf(s, i)}`,
    })),
    hint: `Say “Show ${numberOf(shows[0], 0)}” for episodes, “${numberOf(shows[0], 0)}.1” for the latest, or press a show.`,
    footer: [],
    say: shows.map((s, i) => `Show ${numberOf(s, i)}: ${s.name}.`).join(' '),
    send: null,
  });
  const listEpisodes = (s, offset = 0) => {
    const found = show(s);
    if (!found) return noShow(s);
    if (offset >= found.episodes.length && offset > 0)
      return none(`No more episodes are kept for Show ${s}. It has ${found.episodes.length}.`, {
        ...at,
        show: s,
      });
    const page = found.episodes.slice(offset, offset + showLimits.page);
    return {
      at: { show: s, episode: null, section: null, offset },
      level: 'episodes',
      title: `Show ${s}: ${found.name}`,
      rows: page.map((e, i) => ({
        label: `${s}.${offset + i + 1}`,
        text: e.item.title,
        sub: dayOf(e.item.date),
        say: `${s}.${offset + i + 1}`,
      })),
      hint: `Say “${s}.1” or “episode 1”, “more episodes”, “back to shows”, or press one.`,
      footer: [
        ...(found.episodes.length > offset + showLimits.page
          ? [{ label: 'More episodes', say: 'more episodes' }]
          : []),
        { label: 'Back to shows', say: 'list shows' },
      ],
      say: page.length
        ? `Show ${s}: ${found.name}. ` +
          page.map((e, i) => `${s} point ${offset + i + 1}: ${e.item.title}.`).join(' ')
        : `Show ${s}: ${found.name}. No episodes are kept for it in this tab.`,
      send: null,
    };
  };
  const openEpisode = (s, e) => {
    const found = show(s);
    if (!found) return noShow(s);
    const index = e === -1 ? found.episodes.length : e,
      episode = found.episodes[index - 1];
    if (!episode) return noEpisode(s, index);
    const sections = sectionsOf(episode.brief);
    return {
      at: { show: s, episode: index, section: null, offset: at.show === s ? at.offset : 0 },
      level: 'episode',
      title: `Episode ${s}.${index}: ${episode.item.title}`,
      rows: sections.map((text, i) => ({
        label: `${s}.${index}.${i + 1}`,
        text,
        sub: `Section ${s}.${index}.${i + 1}`,
        say: `${s}.${index}.${i + 1}`,
      })),
      hint: `Say “${s}.${index}.1” or “section 1” to dig in, or press one. ${found.name}, ${dayOf(episode.item.date)}.`,
      footer: [
        { label: 'Next episode', say: 'next episode' },
        { label: 'Episodes', say: 'back to episodes' },
        { label: 'Shows', say: 'list shows' },
      ],
      say:
        `Episode ${s}.${index} from ${found.name}: ${episode.item.title}, ${dayOf(episode.item.date)}. ` +
        sections
          .slice(0, showLimits.aloud)
          .map((text, i) => `Section ${i + 1}: ${text}`)
          .join(' '),
      send: null,
    };
  };
  const openSection = (s, e, p) => {
    const found = show(s);
    if (!found) return noShow(s);
    const episode = episodeAt(s, e);
    if (!episode) return noEpisode(s, e);
    const sections = sectionsOf(episode.brief),
      text = sections[p - 1];
    if (!text)
      return none(
        `There is no section ${s}.${e}.${p}. Episode ${s}.${e} has ${count(sections.length, 'section', 'sections')}.`,
        { ...at, show: s, episode: e, section: null },
      );
    return {
      at: { show: s, episode: e, section: p, offset: at.show === s ? at.offset : 0 },
      level: 'section',
      title: `Section ${s}.${e}.${p}`,
      rows: [{ label: `${s}.${e}.${p}`, text, sub: `${found.name} · ${episode.item.title}`, say: null }],
      cited: sectionCitations(episode.brief, p).length,
      hint:
        'Sent to your model as your next message. Say “next section”, “back to episode” or “where am I”.' +
        (sectionCitations(episode.brief, p).length
          ? ` The curator’s pipeline found ${count(sectionCitations(episode.brief, p).length, 'paper', 'papers')} for it: say “list citations”.`
          : ' Say “check studies” to look for papers on it.'),
      footer: [
        { label: 'Back to episode', say: 'back to episode' },
        { label: 'Episodes', say: 'back to episodes' },
        { label: 'Shows', say: 'list shows' },
      ],
      say: `Section ${s}.${e}.${p}: ${text}`,
      send: `Tell me more about section ${p} of the episode “${episode.item.title}” (${found.name}, ${dayOf(episode.item.date)}). Its curated brief says: “${text}”`,
    };
  };
  // One section by a command's address: where it is, its words and its citations, or a refusal.
  const section = ({ show: s, episode: e, section: p }) => {
    if (p === null || p === undefined) return { refusal: none('Open a section first, for example “1.1.1”.') };
    const found = show(s);
    if (!found) return { refusal: noShow(s) };
    const episode = episodeAt(s, e);
    if (!episode) return { refusal: noEpisode(s, e) };
    const text = sectionsOf(episode.brief)[p - 1];
    if (!text)
      return {
        refusal: none(`There is no section ${s}.${e}.${p}.`, { ...at, show: s, episode: e, section: null }),
      };
    return {
      at: { show: s, episode: e, section: p, offset: at.show === s ? at.offset : 0 },
      address: `${s}.${e}.${p}`,
      text,
      papers: sectionCitations(episode.brief, p),
    };
  };
  const needShow = () => none('Say which show first, for example “Show 1”.');
  const needEpisode = () => none('Open an episode first, for example “1.1”.');
  switch (command?.kind) {
    case 'shows':
      return listShows();
    case 'show':
      return listEpisodes(command.show);
    case 'episodes':
      return at.show === null ? needShow() : listEpisodes(at.show, 0);
    case 'more':
      return at.show === null ? needShow() : listEpisodes(at.show, at.offset + showLimits.page);
    case 'episode':
      return command.show === null ? needShow() : openEpisode(command.show, command.episode);
    case 'episode-step':
      if (at.show === null) return needShow();
      return openEpisode(at.show, at.episode === null ? 1 : at.episode + command.step);
    case 'sections':
      return at.episode === null ? needEpisode() : openEpisode(at.show, at.episode);
    case 'section':
      return command.episode === null
        ? needEpisode()
        : openSection(command.show, command.episode, command.section);
    case 'section-step':
      if (at.episode === null) return needEpisode();
      return openSection(at.show, at.episode, at.section === null ? 1 : at.section + command.step);
    case 'search':
    case 'studies': {
      const place = section(command);
      if (place.refusal) return place.refusal;
      const query = claimQuery(place.text),
        studies = command.kind === 'studies';
      if (query.length < 3)
        return none(`Section ${place.address} has no words PEA can search with.`, place.at);
      // Nothing is asked here: the page shows the exact words for the owner to approve first.
      return {
        ...none(
          studies
            ? `Review the search for papers on section ${place.address}.`
            : `Review the web search for section ${place.address}.`,
          place.at,
        ),
        lookup: { kind: studies ? 'papers' : 'search', query },
      };
    }
    case 'citations': {
      const place = section(command);
      if (place.refusal) return place.refusal;
      if (!place.papers.length)
        return none(
          `No citations are kept for section ${place.address}. Say “check studies” to look for papers on it.`,
          place.at,
        );
      return {
        at: place.at,
        level: 'citations',
        cited: place.papers.length,
        title: `Citations for section ${place.address}`,
        rows: place.papers.map((c, i) => ({
          label: `${place.address}.c.${i + 1}`,
          text: c.title,
          sub: `${paperLine(c)} · ${stances[c.stance]}`,
          say: `${place.address}.c.${i + 1}`,
        })),
        hint: `Found by the curator’s pipeline in a search of published papers; the episode did not name them. Say “citation 1” or press one.`,
        footer: [],
        say:
          `${count(place.papers.length, 'paper', 'papers')} for section ${place.address}. ` +
          place.papers.map((c, i) => `Citation ${i + 1}: ${c.title}.`).join(' '),
        send: null,
      };
    }
    case 'citation': {
      const place = section(command);
      if (place.refusal) return place.refusal;
      const number = command.number ?? (command.step === 0 ? 1 : (at.citation ?? 0) + (command.step ?? 1)),
        c = place.papers[number - 1];
      if (!c)
        return none(
          place.papers.length
            ? `There is no citation ${place.address}.c.${number}. Section ${place.address} has ${count(place.papers.length, 'citation', 'citations')}.`
            : `No citations are kept for section ${place.address}. Say “check studies” to look for papers on it.`,
          place.at,
        );
      const address = `${place.address}.c.${number}`;
      return {
        at: { ...place.at, citation: number },
        level: 'citation',
        cited: place.papers.length,
        title: `Citation ${address}`,
        rows: [
          { label: address, text: c.title, sub: paperLine(c), say: null },
          { label: 'Found', text: c.summary, sub: null, say: null },
          {
            label: 'Bears on it',
            text: c.correlation,
            sub: `The pipeline’s reading: ${stances[c.stance]}`,
            say: null,
          },
        ],
        open: c.link,
        hint: 'Found by the curator’s pipeline in a search of published papers; the episode did not name it, and nobody checked the match by hand. It goes with your next Chat message, after the usual review.',
        footer: [],
        say: `Citation ${number}: ${c.title}. ${paperLine(c).replaceAll(' · ', ', ')}. ${c.summary} ${c.correlation}`,
        send: null,
      };
    }
    case 'where': {
      const found = show(at.show);
      if (!found) return noShow(at.show);
      const episode = at.episode === null ? null : episodeAt(at.show, at.episode);
      if (!episode)
        return none(
          `You’re browsing Show ${at.show}: ${found.name} (${count(found.episodes.length, 'episode', 'episodes')}). Say “${at.show}.1” to open the latest, or “back to shows”.`,
        );
      const place = `Show ${at.show}: ${found.name}, Episode ${at.show}.${at.episode}: “${episode.item.title}” (${dayOf(episode.item.date)})`;
      if (at.section === null)
        return none(
          `Episode ${at.show}.${at.episode}. ${place}. Say “${at.show}.${at.episode}.1” for section 1, “back to episodes”, or “back to shows”.`,
        );
      const text = sectionsOf(episode.brief)[at.section - 1] ?? '';
      const paper = at.citation ? sectionCitations(episode.brief, at.section)[at.citation - 1] : null;
      if (paper)
        return none(
          `Citation ${at.show}.${at.episode}.${at.section}.c.${at.citation}: ${clip(paper.title, showLimits.snippet)} It is a paper found for section ${at.show}.${at.episode}.${at.section}. ${place}. Say “list citations”, “back to episode”, or “back to shows”.`,
        );
      return none(
        `Section ${at.show}.${at.episode}.${at.section}. ${place}. ${clip(text, showLimits.snippet)} Say “back to episode”, “back to episodes”, or “back to shows”.`,
      );
    }
    default:
      return none('');
  }
}

// The most text of one episode that goes with a Chat message: its brief, then its digest.
export const briefShared = 3200;

// The brief of the episode the owner has open, as the quoted evidence that goes with a Chat
// message: its label, the exact words, and a key that changes when the brief does. Sections carry
// their addresses so the owner and the model can name the same one. Null when no episode is open.
export function briefInPlay(shows, at) {
  if (!at || at.show === null || at.episode === null) return null;
  const show = showNumbered(shows, at.show),
    episode = show?.episodes[at.episode - 1],
    b = episode?.brief;
  if (!b) return null;
  const address = `${at.show}.${at.episode}`,
    lines = [
      `Show ${at.show}: ${show.name}. Episode ${address}: “${episode.item.title}”, ${dayOf(episode.item.date)}.`,
      b.brief_kind === 'model'
        ? 'Written by a model from the transcript, then checked by the curator’s pipeline.'
        : 'Sentences picked from the episode’s digest; no model wrote it.',
    ];
  if (b.covers === 'partial' && b.covers_note) lines.push(`It covers part of the episode: ${b.covers_note}`);
  if (b.headline) lines.push(`Headline: ${b.headline}`);
  sectionsOf(b).forEach((text, i) => lines.push(`Section ${address}.${i + 1}: ${text}`));
  if (b.new) lines.push(`New: ${b.new}`);
  for (const q of b.quotes ?? []) lines.push(`Quote (${q.speaker}): “${q.text}”`);
  // The open section's citations, within their own limit: the open one first when one is open.
  const papers = at.section ? sectionCitations(b, at.section) : [],
    cited = [];
  if (papers.length) {
    const order = papers.map((c, i) => [c, i + 1]);
    if (at.citation && order[at.citation - 1]) order.unshift(...order.splice(at.citation - 1, 1));
    let room = citationLimits.shared;
    for (const [c, n] of order) {
      const line = `Citation ${address}.${at.section}.c.${n}: “${c.title}” (${paperLine(c).replaceAll(' · ', ', ')}). What it found: ${c.summary} How it bears on the section: ${c.correlation} The pipeline’s reading: ${stances[c.stance]}.`;
      if (line.length > room) break;
      room -= line.length;
      cited.push(line);
    }
    if (cited.length)
      lines.push(
        `Papers the curator’s pipeline found for section ${address}.${at.section} by searching published research. The episode did not name them and nobody checked the match by hand:`,
        ...cited,
      );
  }
  // The episode's digest, when it is kept: what it adds to the brief, within its own limit.
  const more = episode.digest
    ? digestLines(
        episode.digest,
        [b.headline, b.new, ...sectionsOf(b), ...(b.quotes ?? []).map((q) => q.text)],
        Math.max(0, Math.min(knowledgeLimits.digestShared, briefShared - lines.join('\n').length - 1)),
      )
    : [];
  lines.push(...more);
  return {
    digest: more.length > 0,
    citations: cited.length,
    label: `“${episode.item.title}” (${show.name}, ${dayOf(episode.item.date)})`,
    title: episode.item.title,
    text: lines.join('\n'),
    key: `${show.id ?? show.name}/${episode.item.id}/${episode.item.brief?.sha256 ?? ''}${more.length ? '/' + (episode.item.digest?.sha256 ?? '') : ''}${cited.length ? `/c${at.section}.${at.citation ?? 0}` : ''}`,
  };
}
