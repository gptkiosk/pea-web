// Headlines, as pure functions. The owner adds the address of a site's RSS or Atom feed and
// approves it once; PEA's own server reads it when the owner presses Refresh. Titles are shown to
// the owner only and are never given to a model. Everything in a feed is a stranger's text: it is
// reduced to plain words here and only ever placed on the page as text.
import { decodeEntities, pageAddress, pageText } from './research.mjs';

export const feedLimits = { feeds: 8, perFeed: 20, shown: 30, title: 200, name: 60, characters: 2100000 };

const line = (text, limit) => {
  let kept = pageText('text/html', text).text.replace(/\s+/g, ' ').trim().slice(0, limit);
  if (/[\ud800-\udbff]$/.test(kept)) kept = kept.slice(0, -1);
  return kept.trim();
};

// The text inside the first <name>…</name> of a piece of feed, with XML escaping undone once.
function field(piece, lower, name) {
  for (let from = 0; ;) {
    const at = lower.indexOf('<' + name, from);
    if (at < 0) return '';
    const after = lower[at + name.length + 1];
    from = at + 1;
    if (after !== '>' && after !== ' ' && after !== '\n' && after !== '\t' && after !== '\r') continue;
    const open = lower.indexOf('>', at);
    if (open < 0 || lower[open - 1] === '/') return '';
    const close = lower.indexOf('</' + name, open);
    if (close < 0) return '';
    const inner = piece.slice(open + 1, close).trim();
    const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(inner);
    return cdata ? cdata[1] : decodeEntities(inner);
  }
}

// An Atom entry's own page: the href of its link with rel "alternate", or with no rel at all.
function atomLink(piece, lower) {
  for (let from = 0, tries = 0; tries < 12; tries++) {
    const at = lower.indexOf('<link', from);
    if (at < 0) return '';
    const end = lower.indexOf('>', at);
    if (end < 0) return '';
    from = end;
    const tag = piece.slice(at, Math.min(end, at + 2500));
    const read = (key) => {
      const found = new RegExp('\\s' + key + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')', 'i').exec(tag);
      return found ? decodeEntities(found[1] ?? found[2]).trim() : null;
    };
    const rel = read('rel');
    if (rel === null || rel.toLowerCase() === 'alternate') return read('href') ?? '';
  }
  return '';
}

// A link the owner may open in their own browser: https to a named site, nothing else.
export function headlineLink(value) {
  if (typeof value !== 'string' || value.length > 2000) return null;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443'))
    return null;
  // The same address without its fragment must be one PEA's reader would accept.
  const readable = pageAddress(url.href.split('#')[0]);
  return readable ? { href: url.href, readable } : null;
}

function when(text, now) {
  const at = Date.parse(text.trim().slice(0, 60));
  return Number.isFinite(at) && at > 631152000000 && at < now + 2 * 86400000 ? at : null;
}

// What PEA keeps of a feed: { name, items: [{ title, link, at }] }, or null when it is not a feed.
export function readFeed(text, now = Date.now()) {
  if (typeof text !== 'string' || text.length > feedLimits.characters) return null;
  const lower = text.toLowerCase();
  const root = /<(rss|feed|rdf:rdf)[\s>]/.exec(lower.slice(0, 4000));
  if (!root) return null;
  const tag = root[1] === 'feed' ? 'entry' : 'item';
  const items = [],
    seen = new Set();
  let from = 0,
    first = -1;
  for (let scanned = 0; scanned < 200 && items.length < feedLimits.perFeed; scanned++) {
    const at = lower.indexOf('<' + tag, from);
    if (at < 0) break;
    const after = lower[at + tag.length + 1];
    from = at + 1;
    if (after !== '>' && !/\s/.test(after ?? '')) continue;
    const close = lower.indexOf('</' + tag, at);
    if (close < 0) break;
    if (first < 0) first = at;
    from = close + 1;
    const piece = text.slice(at, close),
      low = lower.slice(at, close);
    const title = line(field(piece, low, 'title'), feedLimits.title);
    if (!title) continue;
    const link = headlineLink(tag === 'entry' ? atomLink(piece, low) : field(piece, low, 'link'));
    const key = link?.href ?? title;
    if (seen.has(key)) continue;
    seen.add(key);
    const date =
      field(piece, low, 'pubdate') ||
      field(piece, low, 'published') ||
      field(piece, low, 'updated') ||
      field(piece, low, 'dc:date');
    items.push({ title, link, at: when(date, now) });
  }
  const head = first < 0 ? text : text.slice(0, first);
  return { name: line(field(head, head.toLowerCase(), 'title'), feedLimits.name), items };
}

// The saved list: addresses and the names shown for them. Titles themselves are never saved.
export function validSavedFeeds(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.feeds)) return [];
  const kept = [];
  for (const feed of value.feeds.slice(0, feedLimits.feeds)) {
    const address = pageAddress(feed?.url);
    if (!address || typeof feed.name !== 'string' || kept.some((k) => k.url === address.url)) continue;
    kept.push({
      url: address.url,
      host: address.host,
      name: line(feed.name, feedLimits.name) || address.host,
    });
  }
  return kept;
}

// One list across every feed, newest first; items with no date keep their feed's order at the end.
export function mergeHeadlines(feeds, read) {
  const all = [];
  for (const feed of feeds)
    for (const item of read.get(feed.url)?.items ?? []) all.push({ ...item, source: feed.name });
  return all
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (b.item.at ?? -1) - (a.item.at ?? -1) || a.index - b.index)
    .slice(0, feedLimits.shown)
    .map(({ item }) => item);
}

export function describeFeed(address) {
  return `Feed address (exactly what is requested):\n${address.url}\n\nIf you approve, your PEA server asks ${address.host} for this feed now, and again each time you press Refresh in Headlines; never on its own. The site sees your internet address, the address above and a fixed description of PEA’s reader, as it would for any visitor. It gets no cookies, no sign-in and nothing from your chats.\n\nPEA keeps the feed’s address and name in this browser, for every profile, until you remove it. Headlines are shown to you only: they are not saved and are never given to a model. Opening one in your browser, or reading it in Chat, is a separate step you choose each time.`;
}

export function headlineDate(at, now = Date.now()) {
  if (!Number.isFinite(at)) return '';
  const minutes = Math.max(0, Math.round((now - at) / 60000));
  if (minutes < 60) return minutes <= 1 ? 'just now' : `${minutes} minutes ago`;
  if (minutes < 1440)
    return Math.round(minutes / 60) === 1 ? '1 hour ago' : `${Math.round(minutes / 60)} hours ago`;
  const days = Math.round(minutes / 1440);
  return days === 1 ? 'yesterday' : days < 30 ? `${days} days ago` : new Date(at).toISOString().slice(0, 10);
}
