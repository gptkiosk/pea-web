// "Curated sources" on Today: podcasts a curator has prepared for PEA, each new episode with a
// short checked brief. Nothing is fetched until the owner browses, and every file is checked by
// knowledge.mjs before any of it is shown or kept. Briefs are kept in this tab only. The owner's
// followed shows are remembered in this browser by their ids.
import {
  catalogBase,
  checkBrief,
  checkItems,
  checkStore,
  knowledgeLimits,
  refusal,
  requestAddress,
} from './knowledge.mjs';
import { containsCredential } from './connections.mjs';
import { beginWork, endWork, workStep, workWaiting } from './activity.mjs';
import { showWork } from './activity-ui.mjs';

const $ = (id) => document.getElementById(id);
const storageKey = 'pea-curated-v1';
// How many of a show's newest episodes are fetched and kept: three unless the owner chooses
// another number for that show, and never more than five.
export const keepDefault = 3,
  keepMost = 5;
export const curatedHost = new URL(catalogBase).host;

export function describeBrowse() {
  return `If you approve, this browser asks ${curatedHost} (GitHub Pages) for the curator’s list of sources: one file, the same for everyone, so asking for it says nothing about what interests you. As with any website, the host sees your internet address. No cookie, no account and nothing about you or your chats is sent.\n\nNothing more is fetched until you follow a show. Following a show fetches that show’s list of episodes and the briefs of its ${keepDefault} newest (you can keep up to ${keepMost}, or none), so the host can tell which shows this address follows. PEA checks every file against the size and fingerprint the curator’s list promised before using it.\n\nBriefs are kept in this tab only. The shows you follow are remembered in this browser by name, for every profile. PEA asks again only when you press Refresh. It never opens an episode’s own page by itself.`;
}

// One file from the catalog, as bytes, or a typed failure. Never more than `limit` bytes.
async function download(path, limit) {
  let response;
  try {
    response = await fetch(catalogBase + path, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    return { failed: 'network' };
  }
  if (response.status === 404) return { failed: 'missing' };
  if (!response.ok) return { failed: 'network' };
  const reader = response.body.getReader(),
    chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        return { failed: 'too_large' };
      }
      chunks.push(value);
    }
  } catch {
    return { failed: 'network' };
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  return { bytes };
}

export function installCurated({ review, changed = () => {} }) {
  let allowed = false,
    followed = [],
    store = null,
    checkedAt = 0,
    busy = false,
    work = null;
  // What is held for each followed show, by id: { listing, episodes: [{ item, brief }], refused }.
  const held = new Map();
  // The number each show was given when it was first followed. A show keeps its number when new
  // episodes arrive, when it is unfollowed and followed again, and when other shows come and go.
  let numbers = {},
    // How many episodes to keep for a show, where the owner chose a number.
    keeps = {};
  const validId = (id) => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(id);
  try {
    const saved = JSON.parse(globalThis.localStorage.getItem(storageKey) || 'null');
    if (saved && saved.on === true && Array.isArray(saved.followed)) {
      allowed = true;
      followed = saved.followed.filter(validId).slice(0, 40);
      const whole = (value, least, most) =>
        Object.fromEntries(
          Object.entries(value && typeof value === 'object' && !Array.isArray(value) ? value : {})
            .filter(([id, n]) => validId(id) && Number.isInteger(n) && n >= least && n <= most)
            .slice(0, 200),
        );
      numbers = whole(saved.numbers, 1, 999);
      keeps = whole(saved.keep, 0, keepMost);
      // Two shows never share a number, whatever was saved.
      const seen = new Set();
      for (const [id, n] of Object.entries(numbers)) {
        if (seen.has(n)) delete numbers[id];
        seen.add(n);
      }
    }
  } catch {
    // Nothing usable was saved; the card starts off.
  }
  const save = () => {
    try {
      if (allowed)
        globalThis.localStorage.setItem(
          storageKey,
          JSON.stringify({
            on: true,
            followed,
            numbers,
            ...(Object.keys(keeps).length ? { keep: keeps } : {}),
          }),
        );
      else globalThis.localStorage.removeItem(storageKey);
    } catch {
      // Private browsing may refuse storage; the choice then lasts for this tab.
    }
  };
  const say = (text) => ($('curated-note').textContent = text);
  const keepOf = (id) => keeps[id] ?? keepDefault;
  // Gives a show its number the first time it is followed: one more than the highest ever given.
  const number = (id) => {
    if (!numbers[id]) numbers[id] = Math.max(0, ...Object.values(numbers)) + 1;
    return numbers[id];
  };
  for (const id of followed) number(id);
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const listing = (id) => store?.sources.find((s) => s.id === id) ?? null;
  const trail = () => showWork($('curated-activity'), work);

  function card(s) {
    const row = el('li', 'curated-source'),
      follows = followed.includes(s.id),
      have = held.get(s.id),
      button = el('button', follows ? 'text-button' : 'primary', follows ? 'Unfollow' : 'Follow');
    row.dataset.state = s.state;
    row.append(el('strong', '', s.name), el('span', 'pill', s.state === 'active' ? s.cadence : s.state));
    row.append(el('p', '', s.description));
    if (s.state !== 'active' && s.message)
      row.append(
        el(
          'p',
          'curated-banner',
          (s.state === 'paused' ? 'This source is paused: ' : 'The curator removed this source: ') +
            s.message,
        ),
      );
    if (s.latest_titles.length) {
      const newest = el('ul', 'curated-newest');
      for (const title of s.latest_titles.slice(0, 3)) newest.append(el('li', '', title));
      row.append(newest);
    }
    row.append(el('small', '', `${s.attribution} · ${s.terms_summary}`));
    if (follows) {
      const label = el('label', 'curated-keep', `Show ${numbers[s.id]} · keep the newest `),
        select = document.createElement('select');
      for (let n = 0; n <= keepMost; n++) select.add(new Option(n === 0 ? 'none' : String(n), String(n)));
      select.value = String(keepOf(s.id));
      select.disabled = busy;
      select.setAttribute('aria-label', `Episodes to keep for ${s.name}`);
      select.onchange = () => void keep(s.id, Number(select.value));
      label.append(select);
      row.append(label);
    }
    if (follows)
      row.append(
        el(
          'small',
          'curated-held',
          have
            ? `${have.episodes.length} ${have.episodes.length === 1 ? 'brief' : 'briefs'} kept in this tab${have.refused ? `, ${have.refused} refused` : ''}`
            : 'Followed. Press Refresh to load its briefs.',
        ),
      );
    button.type = 'button';
    button.disabled = busy || (!follows && s.state !== 'active');
    button.setAttribute('aria-label', `${follows ? 'Unfollow' : 'Follow'} ${s.name}`);
    button.onclick = () => void (follows ? unfollow(s.id) : follow(s.id));
    row.append(button);
    return row;
  }
  function render() {
    const briefs = [...held.values()].reduce((sum, h) => sum + h.episodes.length, 0);
    $('curated-status').textContent = !allowed
      ? 'Off'
      : followed.length
        ? `${followed.length} followed`
        : 'On';
    $('curated-peek').textContent = !allowed
      ? 'Off until you browse'
      : followed.length
        ? briefs
          ? `${briefs} ${briefs === 1 ? 'brief' : 'briefs'} in this tab`
          : 'Press Refresh to load'
        : 'No show followed yet';
    $('curated-browse').textContent = store ? 'Refresh' : allowed ? 'Refresh' : 'Browse curated sources…';
    $('curated-browse').disabled = busy;
    $('curated-off').hidden = !allowed;
    $('curated-off').disabled = busy;
    $('curated-renumber').hidden = !allowed || !followed.length;
    $('curated-renumber').disabled = busy;
    $('curated-request').hidden = !allowed;
    $('curated-list').replaceChildren(
      ...(store
        ? store.sources.filter((s) => s.state !== 'withdrawn' || followed.includes(s.id)).map(card)
        : []),
    );
    $('curated-checked').textContent = checkedAt
      ? `Checked ${new Date(checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
      : '';
    trail();
    changed();
  }

  // One show's episodes list and the briefs of its newest few, each checked. Old copies are kept
  // when a new one fails.
  async function load(s) {
    if (s.state !== 'active' || !s.items_file) return;
    workWaiting(work, `Reading ${s.name}…`);
    trail();
    const got = await download(s.items_file.path, knowledgeLimits.items);
    if (got.failed) {
      workStep(
        work,
        'warn',
        `${s.name}: the list of episodes could not be fetched. What was kept stays.`,
        true,
      );
      return;
    }
    const items = await checkItems(got.bytes, s, store.topics ?? []);
    if (!items.value) {
      workStep(
        work,
        'warn',
        `${s.name}: the list of episodes was refused (${items.problems[0].code}). ${refusal(items.problems[0].code)}`,
        true,
      );
      return;
    }
    const before = held.get(s.id),
      episodes = [];
    let refused = 0;
    for (const item of items.value.items.filter((i) => i.brief).slice(0, keepOf(s.id))) {
      const old = before?.episodes.find(
        (e) => e.item.id === item.id && e.item.brief.sha256 === item.brief.sha256,
      );
      if (old) {
        episodes.push(old);
        continue;
      }
      const file = await download(item.brief.path, knowledgeLimits.brief),
        brief = file.failed ? null : await checkBrief(file.bytes, s, item, store.topics ?? []);
      if (brief?.value) episodes.push({ item, brief: brief.value });
      else refused++;
    }
    held.set(s.id, { listing: s, episodes, refused });
    workStep(
      work,
      refused ? 'warn' : 'book',
      `${s.name}: ${episodes.length} ${episodes.length === 1 ? 'brief' : 'briefs'} checked and kept${refused ? `, ${refused} refused or missing` : ''}`,
      Boolean(refused),
    );
  }

  // Fetches the curator's list, then the followed shows. A list that fails leaves everything as it is.
  async function refresh(only = null) {
    if (busy) return;
    busy = true;
    work = beginWork(performance.now());
    workWaiting(work, 'Asking for the curator’s list of sources…');
    render();
    try {
      const got = await download('store.json', knowledgeLimits.store),
        checked = got.failed ? null : checkStore(got.bytes);
      if (!checked?.value) {
        const why = got.failed ?? checked.problems[0].code;
        endWork(
          work,
          'failed',
          'warn',
          `Couldn’t check for updates${why === 'network' ? '' : ` (${why})`}. Everything PEA had is kept as it was.`,
          performance.now(),
        );
        say(
          store
            ? 'Couldn’t check for updates. Showing the last good list.'
            : why === 'network'
              ? 'The curator’s list could not be reached.'
              : refusal(why),
        );
        return;
      }
      store = checked.value;
      checkedAt = Date.now();
      workStep(
        work,
        'list',
        `Read and checked the curator’s list: ${store.sources.length} ${store.sources.length === 1 ? 'source' : 'sources'}`,
      );
      const notes = [];
      for (const id of [...followed]) {
        const s = listing(id);
        if (!s || s.state === 'withdrawn') {
          // A source the curator removed is switched off; with purge its kept briefs go too.
          followed = followed.filter((x) => x !== id);
          const name = s?.name ?? held.get(id)?.listing.name ?? id;
          held.delete(id);
          notes.push(`The curator removed ${name}${s?.message ? ': ' + s.message : '.'}`);
          workStep(work, 'stop', `${name} was removed by the curator. It is no longer followed.`, true);
        } else if (s.state === 'paused') {
          if (held.has(id)) held.get(id).listing = s;
          workStep(work, 'clock', `${s.name} is paused. Nothing new was fetched for it.`);
        } else if (!only || only === id) await load(s);
      }
      save();
      const total = [...held.values()].reduce((sum, h) => sum + h.episodes.length, 0);
      endWork(
        work,
        'done',
        'check',
        followed.length
          ? `${total} ${total === 1 ? 'brief is' : 'briefs are'} kept in this tab. Nothing else was fetched.`
          : 'No show is followed, so nothing else was fetched.',
        performance.now(),
      );
      say(
        notes.join(' ') ||
          (store.min_app_version
            ? `The curator asks for app version ${store.min_app_version} or later. PEA Web cannot compare that with its own version and keeps reading.`
            : ''),
      );
    } finally {
      busy = false;
      render();
    }
  }

  async function browse() {
    if (busy) return;
    if (!allowed) {
      if (!(await review('Browse curated sources?', describeBrowse())))
        return say('Not asked. Nothing was fetched.');
      allowed = true;
      save();
    }
    await refresh();
  }
  async function follow(id) {
    const s = listing(id);
    if (busy || !s || s.state !== 'active' || followed.includes(id)) return;
    if (followed.length >= 40) return say('PEA follows up to 40 shows. Unfollow one first.');
    followed = [...followed, id];
    number(id);
    save();
    await refresh(id);
  }
  // Changes how many episodes a show keeps. Fewer takes effect at once; more needs a fetch.
  async function keep(id, n) {
    if (busy || !followed.includes(id) || !Number.isInteger(n) || n < 0 || n > keepMost) return render();
    if (n === keepDefault) delete keeps[id];
    else keeps[id] = n;
    save();
    const have = held.get(id);
    if (have && have.episodes.length >= n) {
      have.episodes = have.episodes.slice(0, n);
      say(`Keeping the newest ${n === 0 ? 'none' : n} for ${have.listing.name}. Nothing was fetched.`);
      return render();
    }
    await refresh(id);
  }
  // Clears every kept brief and gives the followed shows fresh numbers, 1 upward in their order.
  async function renumber() {
    if (busy || !followed.length) return;
    if (
      !(await review(
        'Clear and refresh all shows?',
        `This removes every brief kept in this tab and gives your ${followed.length} followed ${followed.length === 1 ? 'show' : 'shows'} new numbers, 1 upward in the order you followed them. A show’s number may change, so “Show 2” may mean a different show afterwards. Then PEA fetches the curator’s list and each followed show again from ${curatedHost}.`,
      ))
    )
      return say('Nothing was changed.');
    held.clear();
    numbers = {};
    for (const id of followed) number(id);
    save();
    await refresh();
  }
  function unfollow(id) {
    if (busy) return;
    followed = followed.filter((x) => x !== id);
    held.delete(id);
    save();
    say('Unfollowed. Its briefs were removed from this tab, and PEA will not ask for that show again.');
    render();
  }

  $('curated-browse').onclick = () => void browse();
  $('curated-renumber').onclick = () => void renumber();
  $('curated-off').onclick = () => {
    if (busy) return;
    allowed = false;
    numbers = {};
    keeps = {};
    followed = [];
    store = null;
    checkedAt = 0;
    work = null;
    held.clear();
    save();
    say('Turned off. The list, your followed shows and every brief were removed from this browser.');
    render();
  };
  $('curated-request-form').onsubmit = (event) => {
    event.preventDefault();
    const made = requestAddress(
      {
        name: $('curated-request-name').value,
        feed: $('curated-request-feed').value,
        site: $('curated-request-site').value,
        notes: $('curated-request-notes').value,
      },
      { secret: containsCredential },
    );
    const link = $('curated-request-open');
    if (made.error) {
      link.hidden = true;
      link.removeAttribute('href');
      $('curated-request-note').textContent = made.error;
      return;
    }
    link.href = made.url;
    link.hidden = false;
    $('curated-request-note').textContent =
      `Ready. Nothing has been sent. The link opens a filled-in request on GitHub (${made.repository}), where you sign in and submit it yourself; it is public there. It carries only what you typed above.`;
  };
  for (const id of [
    'curated-request-name',
    'curated-request-feed',
    'curated-request-site',
    'curated-request-notes',
  ])
    $(id).oninput = () => {
      $('curated-request-open').hidden = true;
      $('curated-request-open').removeAttribute('href');
      $('curated-request-note').textContent = '';
    };

  render();
  return {
    render,
    // For numbered navigation: each followed show in the owner's order, with the episodes kept
    // for it, newest first.
    shows: () =>
      followed
        .map((id) => held.get(id))
        .filter(Boolean)
        .map((h) => ({
          id: h.listing.id,
          number: numbers[h.listing.id],
          name: h.listing.name,
          state: h.listing.state,
          episodes: h.episodes,
        }))
        .sort((a, b) => a.number - b.number),
    count: () => followed.length,
  };
}
