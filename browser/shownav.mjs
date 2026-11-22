// Numbered navigation through the shows the owner follows in Curated sources, as pure functions:
//   Show S  →  Episode S.E  →  Section S.E.P
// Shows are in the owner's order, episodes newest first, and an episode's sections are the claims
// of its checked brief. The owner's own words are matched against a fixed grammar, most specific
// address first, so "1.2.3" always means the same place and every place can be traced back up
// ("where am I"). No model reads the words or chooses the move. This parser receives the owner's
// submitted words only, never a model's output.

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
    (m = said.match(/(?<![\d.])(\d{1,2})\.(\d{1,2})\.(\d{1,2})[ .]?(?:c|cite|citation)[ .]?\d{1,2}(?![\d.])/))
  )
    return { kind: 'citations', show: +m[1], episode: +m[2], section: +m[3] };
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
    if (
      is('(?:list\\s+|show\\s+)?(?:citations|studies|papers)') ||
      is('(?:next|previous|first)\\s+citation') ||
      is(`(?:citation|c|paper|study)\\s*${N}`)
    )
      return { kind: 'citations', show: at.show, episode: at.episode, section: at.section };
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
const clip = (text, max) => ([...text].length > max ? [...text].slice(0, max - 1).join('') + '…' : text);
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// One move. `shows` is [{ name, episodes: [{ item, brief }] }]. Gives
//   { at, level, title, rows: [{ label, text, say }], hint, footer: [{ label, say }], say, send }
// where each row and footer button carries the words that pressing it stands for, `say` is the
// answer in words, and `send` a message to pass to the model as the owner's own (a section only).
export function showMove(command, { shows = [], at = idle() } = {}) {
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
  const show = (s) => shows[s - 1],
    episodeAt = (s, e) => show(s)?.episodes[e - 1],
    noShow = (s) => none(`There is no show ${s}. You follow ${shows.length}.`),
    noEpisode = (s, e) =>
      none(
        `There is no episode ${s}.${e}. Show ${s} has ${count(show(s).episodes.length, 'episode', 'episodes')} kept.`,
      );
  const listShows = () => ({
    at: idle(),
    level: 'shows',
    title: 'Your shows',
    rows: shows.map((s, i) => ({
      label: String(i + 1),
      text: s.name,
      sub: count(s.episodes.length, 'episode', 'episodes'),
      say: `show ${i + 1}`,
    })),
    hint: 'Say “Show 1” for episodes, “1.1” for the latest, or press a show.',
    footer: [],
    say: shows.map((s, i) => `Show ${i + 1}: ${s.name}.`).join(' '),
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
      hint: 'Sent to your model as your next message. Say “next section”, “back to episode” or “where am I”.',
      footer: [
        { label: 'Back to episode', say: 'back to episode' },
        { label: 'Episodes', say: 'back to episodes' },
        { label: 'Shows', say: 'list shows' },
      ],
      say: `Section ${s}.${e}.${p}: ${text}`,
      send: `Tell me more about section ${p} of the episode “${episode.item.title}” (${found.name}, ${dayOf(episode.item.date)}). Its curated brief says: “${text}”`,
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
      return none(
        `PEA Web cannot search the web, so section ${command.show}.${command.episode}.${command.section} was not searched. Say “${command.show}.${command.episode}.${command.section}” to ask your model about it.`,
      );
    case 'citations':
      return none(
        'No scientific citations are kept for this section. PEA Web does not read or look up citations yet.',
      );
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
      return none(
        `Section ${at.show}.${at.episode}.${at.section}. ${place}. ${clip(text, showLimits.snippet)} Say “back to episode”, “back to episodes”, or “back to shows”.`,
      );
    }
    default:
      return none('');
  }
}

// The brief of the episode the owner has open, as the quoted evidence that goes with a Chat
// message: its label, the exact words, and a key that changes when the brief does. Sections carry
// their addresses so the owner and the model can name the same one. Null when no episode is open.
export function briefInPlay(shows, at) {
  if (!at || at.show === null || at.episode === null) return null;
  const show = shows[at.show - 1],
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
  return {
    label: `“${episode.item.title}” (${show.name}, ${dayOf(episode.item.date)})`,
    title: episode.item.title,
    text: lines.join('\n'),
    key: `${show.id ?? show.name}/${episode.item.id}/${episode.item.brief?.sha256 ?? ''}`,
  };
}
