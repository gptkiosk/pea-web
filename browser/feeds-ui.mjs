// The Headlines card on Today. It holds no feeds, and asks nothing of anyone, until the owner adds
// a feed's address and approves it. After that PEA's own server reads each feed only when the
// owner presses Refresh. Titles live in this tab, are shown to the owner only, and never reach a model.
import { ServiceError } from './connections.mjs';
import { pageAddress } from './research.mjs';
import {
  describeFeed,
  feedLimits,
  headlineDate,
  mergeHeadlines,
  readFeed,
  validSavedFeeds,
} from './feeds.mjs';

const $ = (id) => document.getElementById(id);
const storageKey = 'pea-headlines-v1';

export function installHeadlines({ review, key, read, readInChat, changed = () => {} }) {
  let feeds = [],
    busy = false,
    refreshedAt = 0;
  // What each feed last gave, by address: { items } or { error }. Kept for this tab only.
  const latest = new Map();
  try {
    feeds = validSavedFeeds(JSON.parse(globalThis.localStorage.getItem(storageKey) || 'null'));
  } catch {
    // Nothing usable was saved; the card starts empty.
  }
  const save = () => {
    try {
      if (feeds.length)
        globalThis.localStorage.setItem(
          storageKey,
          JSON.stringify({ feeds: feeds.map(({ url, name }) => ({ url, name })) }),
        );
      else globalThis.localStorage.removeItem(storageKey);
    } catch {
      // Private browsing may refuse storage; the list then lasts for this tab.
    }
  };
  const say = (text) => ($('headline-note').textContent = text);
  const headlines = () => mergeHeadlines(feeds, latest);

  function render() {
    const items = headlines();
    $('headline-status').textContent = feeds.length
      ? items.length
        ? `${items.length} shown`
        : 'Not loaded'
      : 'Off';
    $('headline-peek').textContent =
      items[0]?.title ?? (feeds.length ? 'Press Refresh to load' : 'Off until you add a feed');
    $('headline-refresh').hidden = !feeds.length;
    $('headline-refresh').disabled = busy;
    $('headline-add').disabled = busy;
    $('headline-feeds').replaceChildren(
      ...feeds.map((feed) => {
        const row = document.createElement('li'),
          name = document.createElement('span'),
          remove = document.createElement('button');
        const state = latest.get(feed.url);
        name.textContent = `${feed.name} · ${feed.host}${state?.error ? ' · ' + state.error : ''}`;
        remove.type = 'button';
        remove.className = 'text-button';
        remove.textContent = 'Remove';
        remove.setAttribute('aria-label', 'Remove the feed ' + feed.name);
        remove.onclick = () => {
          feeds = feeds.filter((f) => f !== feed);
          latest.delete(feed.url);
          save();
          render();
          say('Removed. PEA will not ask that site again.');
        };
        row.append(name, remove);
        return row;
      }),
    );
    $('headline-list').replaceChildren(
      ...items.map((item) => {
        const row = document.createElement('li'),
          about = document.createElement('small');
        let title;
        if (item.link) {
          title = document.createElement('a');
          title.href = item.link.href;
          title.target = '_blank';
          title.rel = 'noopener noreferrer';
        } else title = document.createElement('span');
        title.textContent = item.title;
        about.textContent = [item.source, headlineDate(item.at)].filter(Boolean).join(' · ');
        row.append(title, about);
        if (item.link) {
          const inChat = document.createElement('button');
          inChat.type = 'button';
          inChat.className = 'text-button';
          inChat.textContent = 'Read in Chat';
          inChat.setAttribute('aria-label', 'Read in Chat: ' + item.title);
          inChat.onclick = () => readInChat(item.link.readable, item.source);
          row.append(inChat);
        }
        return row;
      }),
    );
    changed();
  }

  // One read of one feed. Gives { name, items } or throws a ServiceError in PEA's own words.
  async function load(feed) {
    const answer = await read(key(), feed.url);
    if (answer.outcome === 'redirect') {
      const moved = pageAddress(answer.location);
      throw new ServiceError(
        moved
          ? `This feed has moved to ${moved.url}. PEA does not follow it; add that address if you want it.`
          : 'This feed has moved somewhere PEA will not read.',
      );
    }
    const feedRead = readFeed(answer.text);
    if (!feedRead) throw new ServiceError('That address is not an RSS or Atom feed PEA can read.');
    return feedRead;
  }
  const needsServer = () => {
    if (key()) return false;
    say('Headlines need your PEA server. Connect it in Connections → Local model, then try again.');
    return true;
  };

  $('headline-form').onsubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const address = pageAddress($('headline-address').value.trim());
    if (!address) return say('Enter the full https:// address of a site’s RSS or Atom feed.');
    if (feeds.some((f) => f.url === address.url)) return say('That feed is already in your list.');
    if (feeds.length >= feedLimits.feeds)
      return say(`PEA keeps up to ${feedLimits.feeds} feeds. Remove one first.`);
    if (needsServer()) return;
    if (!(await review('Add this feed to Headlines?', describeFeed(address)))) return;
    busy = true;
    render();
    say('Reading the feed…');
    try {
      const found = await load(address);
      feeds = [...feeds, { url: address.url, host: address.host, name: found.name || address.host }];
      latest.set(address.url, { items: found.items });
      refreshedAt = Date.now();
      save();
      $('headline-address').value = '';
      say(found.items.length ? 'Feed added.' : 'Feed added. It has no headlines right now.');
    } catch (error) {
      say(error instanceof ServiceError ? error.message : 'The feed could not be read. Nothing was added.');
    } finally {
      busy = false;
      render();
    }
  };

  $('headline-refresh').onclick = async () => {
    if (busy || !feeds.length || needsServer()) return;
    busy = true;
    render();
    say('Refreshing…');
    let failed = 0;
    // One at a time: the server reads at most two pages at once, and Chat may want the other.
    for (const feed of [...feeds]) {
      try {
        latest.set(feed.url, { items: (await load(feed)).items });
      } catch (error) {
        failed++;
        latest.set(feed.url, {
          items: latest.get(feed.url)?.items ?? [],
          error: error instanceof ServiceError ? error.message.slice(0, 300) : 'Could not be read.',
        });
      }
    }
    refreshedAt = Date.now();
    busy = false;
    render();
    say(
      failed
        ? `${failed} of ${feeds.length} feeds could not be read; see the list. Nothing was retried.`
        : 'Up to date. PEA asks again only when you press Refresh.',
    );
  };

  render();
  return {
    // For the summary on Today: the newest few titles already on screen, and when they were read.
    top: (count) => headlines().slice(0, count),
    refreshedAt: () => refreshedAt,
    count: () => feeds.length,
  };
}
