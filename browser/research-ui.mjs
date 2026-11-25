// Public research in Chat: the owner approves one exact address, PEA's own server reads it, and
// the plain words are kept in this tab only. They are shown here and reach a model only through
// the model-sharing review of the next message. Nothing here is saved, and nothing is read unasked.
import { ServiceError, containsCredential } from './connections.mjs';
import {
  describeRead,
  describeSearch,
  lookupKinds,
  lookupOff,
  lookupSwitches,
  lookupsKey,
  pageAddress,
  pageText,
  readSearch,
  researchLimits,
  savedLookups,
  searchLimits,
  searchProviders,
  validLookups,
} from './research.mjs';
import { beginWork, endWork, workStep, workWaiting } from './activity.mjs';
import { showWork } from './activity-ui.mjs';

const $ = (id) => document.getElementById(id);

export function installResearch(hooks) {
  // The one page being shared, if any: { profile, url, host, title, text, length }.
  let page = null,
    reading = false,
    // What PEA did for the latest read in this tab: { profile, trail }. Shown over the page card.
    work = null;

  function render() {
    const shown = page && page.profile === hooks.profile() ? page : null;
    $('context-page').hidden = !shown;
    $('context-page-name').textContent = shown ? shown.title || shown.host : '';
    $('context-page-note').textContent = shown
      ? `${shown.url}\n${shown.text.length.toLocaleString('en-US')} of ${shown.length.toLocaleString('en-US')} characters kept, as plain words. This is everything a model would be given, and only after you review your next message. It is not saved with your chats.`
      : '';
    $('context-page-text').textContent = shown ? shown.text : '';
    showWork($('page-activity'), work && work.profile === hooks.profile() ? work.trail : null);
  }
  function clear() {
    if (!page && !work) return;
    page = null;
    work = null;
    render();
  }
  $('context-page-clear').onclick = () => {
    clear();
    hooks.notice('That page is no longer shared.');
  };

  // Reviews and reads one address. `from` is 'owner', 'model' or 'feed' (with the feed's name). Returns true when a page was kept.
  async function read(address, from, feed = '') {
    if (reading || hooks.isBusy()) {
      hooks.notice('Finish the current request first.');
      return false;
    }
    const who = hooks.profile();
    if (who === 'blended') {
      hooks.notice('Choose Work or Personal before reading a page.');
      return false;
    }
    if (!hooks.key()) {
      hooks.notice(
        'Reading a page needs your PEA server. Connect it in Connections → Local model, then try again.',
      );
      return false;
    }
    reading = true;
    let trail = null;
    const finish = (outcome, icon, text) => {
      endWork(trail, outcome, icon, text, performance.now());
      render();
    };
    try {
      let next = address,
        moved = null;
      for (let hop = 0; ; hop++) {
        const approved = await hooks.review(
          moved ? 'This page has moved. Read the new address?' : 'Read this public web page?',
          describeRead(next, { profile: who, from: moved ? 'site' : from, moved, feed }),
        );
        if (!approved) {
          finish('stopped', 'stop', 'You did not approve the new address. Nothing was read.');
          return false;
        }
        if (who !== hooks.profile()) throw new ServiceError('Profile changed. Review the page again.');
        const asked = next;
        // The list starts at the first approval. Every line names something that has happened.
        if (!trail) {
          trail = beginWork(performance.now());
          work = { profile: who, trail };
          workStep(
            trail,
            'shield',
            `You approved reading ${asked.host}` +
              (from === 'model'
                ? ', which PEA’s reply suggested'
                : from === 'feed'
                  ? ', from your headlines'
                  : ''),
          );
        } else workStep(trail, 'shield', `You approved the new address at ${asked.host}`);
        workWaiting(trail, 'Your PEA server is reading the page…');
        render();
        // `run` reports a failure to the owner itself and then gives back nothing.
        const answer = await hooks.run(() => hooks.read(hooks.key(), asked.url));
        if (!answer) {
          finish(
            'failed',
            'warn',
            'The page could not be read. Nothing was kept, and PEA did not try again.',
          );
          return false;
        }
        if (who !== hooks.profile()) throw new ServiceError('Profile changed. Review the page again.');
        workWaiting(trail, '');
        if (answer.outcome === 'redirect') {
          workStep(trail, 'globe', `${asked.host} answered that the page has moved`);
          render();
          next = pageAddress(answer.location);
          if (!next || hop + 1 >= researchLimits.hops)
            throw new ServiceError(
              next
                ? 'That page kept pointing somewhere else. Nothing was read.'
                : 'That page points somewhere PEA will not read. Nothing was read.',
            );
          moved = asked.url;
          continue;
        }
        const kept = pageText(answer.type, answer.text);
        if (!kept.text)
          throw new ServiceError(
            'That page had no words PEA could keep. It may only work with scripts, which PEA never runs.',
          );
        if (containsCredential(kept.text) || containsCredential(kept.title))
          throw new ServiceError(
            'That page shows something that looks like a password or key, so PEA did not keep it.',
          );
        page = { profile: who, url: asked.url, host: asked.host, ...kept };
        workStep(trail, 'globe', `Your PEA server read the page at ${asked.host}`);
        finish(
          'done',
          'file',
          `Kept ${kept.text.length.toLocaleString('en-US')} of ${kept.length.toLocaleString('en-US')} characters as plain words, in this tab only`,
        );
        hooks.notice(
          `Page read. ${kept.text.length.toLocaleString('en-US')} characters are kept in this tab; your model sees them only after you review your next message.`,
        );
        return true;
      }
    } catch (error) {
      const said = error instanceof ServiceError ? error.message : 'The page could not be read.';
      finish('failed', 'warn', said);
      hooks.notice(said);
      return false;
    } finally {
      reading = false;
    }
  }

  // The owner's own search keys: typed under Connections, held in this tab, and kept sealed in the
  // encrypted library only if the owner ticks the box. They are in no export, and in a backup file
  // only when the owner ticks the box for that one file under Backup & restore.
  const searchKeys = new Map();
  const field = (provider) => $(`search-key-${provider}`);
  const noteSearch = (text) => ($('search-note').textContent = text);
  function showSearch() {
    const have = Object.keys(searchProviders).filter((p) => searchKeys.has(p));
    $('search-provider').disabled = have.length < 2;
    if (have.length === 1) $('search-provider').value = have[0];
    $('search-status').textContent = have.length
      ? `Web search is ready with ${have.map((p) => searchProviders[p].name).join(' and ')}.`
      : 'No search key in this tab.';
  }
  for (const provider of Object.keys(searchProviders))
    field(provider).onchange = () =>
      Promise.resolve()
        .then(async () => {
          const typed = field(provider).value.trim();
          field(provider).value = '';
          if (!typed) return;
          if (!searchLimits.key.test(typed))
            return noteSearch(
              `That does not look like a ${searchProviders[provider].name} key. Nothing was kept.`,
            );
          searchKeys.set(provider, typed);
          const lib = hooks.secrets?.();
          if ($('search-keep').checked && lib?.open()) {
            await lib.keep(searchProviders[provider].secret, typed);
            noteSearch(
              `${searchProviders[provider].name} key held in this tab and kept sealed in your encrypted library.`,
            );
          } else
            noteSearch(
              `${searchProviders[provider].name} key held in this tab only. It goes to your PEA server only when you approve a search.`,
            );
          showSearch();
        })
        .catch(() => noteSearch('The key could not be kept in the library. It is held in this tab.'));
  $('search-keep').onchange = () =>
    Promise.resolve()
      .then(async () => {
        const lib = hooks.secrets?.();
        if (!$('search-keep').checked) {
          for (const p of Object.values(searchProviders)) await lib?.forget(p.secret);
          return noteSearch(
            'Search keys are no longer kept in your library. Any typed here stay until you reload.',
          );
        }
        if (!lib?.open()) {
          $('search-keep').checked = false;
          return noteSearch('Unlock your encrypted library first, under Past chats & memory.');
        }
        for (const [provider, value] of searchKeys) await lib.keep(searchProviders[provider].secret, value);
        noteSearch('Search keys typed here are kept sealed in your encrypted library, and are not part of the library’s backup.');
      })
      .catch(() => noteSearch('The library could not be changed.'));
  $('search-forget').onclick = () =>
    Promise.resolve()
      .then(async () => {
        searchKeys.clear();
        $('search-keep').checked = false;
        for (const p of Object.values(searchProviders)) await hooks.secrets?.()?.forget(p.secret);
        noteSearch('Search keys were removed from this tab and from your library.');
        showSearch();
      })
      .catch(() => noteSearch('The library could not be changed.'));
  // Keys kept in the library come back when it is unlocked and a search is first wanted.
  async function restoreSearchKeys() {
    const lib = hooks.secrets?.();
    if (!lib?.open()) return;
    for (const [provider, about] of Object.entries(searchProviders)) {
      if (searchKeys.has(provider)) continue;
      const value = await lib.read(about.secret);
      if (searchLimits.key.test(value)) {
        searchKeys.set(provider, value);
        $('search-keep').checked = true;
      }
    }
    showSearch();
  }
  // The provider and key a search will use, or null after saying what is missing.
  async function searchWith() {
    await restoreSearchKeys().catch(() => {});
    const chosen = $('search-provider').value,
      provider = searchKeys.has(chosen) ? chosen : [...searchKeys.keys()][0];
    if (!provider) {
      hooks.notice(
        'Web search needs your own Brave Search or Browserbase key. Enter one in Connections → Web search.',
      );
      return null;
    }
    return { provider, key: searchKeys.get(provider) };
  }
  showSearch();

  // Reviews and makes one search of the public index of papers. `address` comes from
  // papersAddress(); `from` is 'owner' or 'model'. Returns true when a list was kept.
  async function lookup(address, from) {
    const kind = lookupKinds[address.lookup];
    if (!kind) return false;
    // Switched off under Knowledge sources: nothing is asked, and the owner is told why.
    if (hooks.lookupOn && !hooks.lookupOn(address.lookup)) {
      hooks.notice(lookupOff(address.lookup));
      return false;
    }
    // A web search goes to the provider the owner chose in Connections, with their own key.
    const web = address.lookup === 'search' ? await searchWith() : null;
    if (address.lookup === 'search' && !web) return false;
    const service = web ? searchProviders[web.provider].name : kind.service;
    if (reading || hooks.isBusy()) {
      hooks.notice('Finish the current request first.');
      return false;
    }
    const who = hooks.profile();
    if (who === 'blended') {
      hooks.notice('Choose Work or Personal first.');
      return false;
    }
    if (!hooks.key()) {
      hooks.notice(
        `${kind.need} needs your PEA server. Connect it in Connections → Local model, then try again.`,
      );
      return false;
    }
    reading = true;
    let trail = null;
    const finish = (outcome, icon, text) => {
      if (trail) endWork(trail, outcome, icon, text, performance.now());
      render();
    };
    try {
      if (
        !(await hooks.review(
          kind.review,
          web
            ? describeSearch(address, { profile: who, from, provider: web.provider })
            : kind.describe(address, { profile: who, from }),
        ))
      )
        return false;
      if (who !== hooks.profile()) throw new ServiceError('Profile changed. Review the search again.');
      trail = beginWork(performance.now());
      work = { profile: who, trail };
      workStep(
        trail,
        'shield',
        `You approved a search of ${service} for “${address.query}”` +
          (from === 'model' ? ', which PEA’s reply suggested' : ''),
      );
      workWaiting(trail, `Your PEA server is asking ${service}…`);
      render();
      const answer = web
        ? await hooks.run(async () => ({
            outcome: 'page',
            text: await hooks.search(hooks.key(), web.provider, web.key, address.query),
          }))
        : await hooks.run(() => hooks.read(hooks.key(), address.url));
      if (!answer) {
        finish(
          'failed',
          'warn',
          'The search could not be made. Nothing was kept, and PEA did not try again.',
        );
        return false;
      }
      if (who !== hooks.profile()) throw new ServiceError('Profile changed. Review the search again.');
      workWaiting(trail, '');
      const kept =
        answer.outcome !== 'page'
          ? null
          : web
            ? readSearch(web.provider, answer.text, address.query)
            : kind.read(answer.text, address.query);
      if (!kept) throw new ServiceError(kind.odd);
      if (!kept.count) throw new ServiceError(kind.none);
      page = {
        profile: who,
        url: web ? `https://${searchProviders[web.provider].host}/` : address.url,
        host: web ? searchProviders[web.provider].host : address.host,
        title: kept.title,
        text: kept.text,
        length: kept.length,
      };
      workStep(trail, 'globe', `Your PEA server asked ${service} once`);
      finish('done', 'file', kind.kept(kept.count));
      hooks.notice(kind.told(kept.count));
      return true;
    } catch (error) {
      const said = error instanceof ServiceError ? error.message : 'The search could not be made.';
      finish('failed', 'warn', said);
      hooks.notice(said);
      return false;
    } finally {
      reading = false;
    }
  }

  render();
  return {
    read,
    lookup,
    papers: lookup,
    // Whether a search key is in this tab, so the model may be told it can offer a search.
    canSearch: () => searchKeys.size > 0,
    // For a backup file the owner chose to put keys in, and back from one after its review.
    keys: () => Object.fromEntries([...searchKeys].map(([provider, key]) => ['search-' + provider, key])),
    offerKeys(keys) {
      const put = [];
      for (const provider of Object.keys(searchProviders))
        if (keys['search-' + provider]) {
          field(provider).value = keys['search-' + provider];
          field(provider).onchange();
          put.push('search-' + provider);
        }
      return put;
    },
    clear,
    render,
    // What the next Chat message would share, or null.
    current: () => (page && page.profile === hooks.profile() ? { url: page.url, text: page.text } : null),
    profileChanged: clear,
    // Leaving the page or locking the library drops the keys held in this tab.
    forgetKeys() {
      searchKeys.clear();
      showSearch();
    },
  };
}

// The switches for the built-in lookups, under Knowledge sources on Today. One set for this
// browser. `changed(id, on)` runs after the owner turns one, so the cards it governs can redraw.
export function installLookups({ changed = () => {} } = {}) {
  let state = validLookups(null);
  try {
    state = validLookups(JSON.parse(globalThis.localStorage.getItem(lookupsKey) || 'null'));
  } catch {
    // Nothing usable was saved: every lookup starts on.
  }
  const list = document.getElementById('lookup-list');
  list.replaceChildren(
    ...lookupSwitches.map(({ id, name, what }) => {
      const label = document.createElement('label'),
        box = Object.assign(document.createElement('input'), { type: 'checkbox', id: 'lookup-' + id }),
        words = document.createElement('span'),
        strong = Object.assign(document.createElement('strong'), { textContent: name }),
        small = Object.assign(document.createElement('small'), { textContent: what });
      box.checked = state[id];
      box.onchange = () => {
        state = { ...state, [id]: box.checked };
        try {
          const kept = savedLookups(state);
          if (Object.keys(kept).length) globalThis.localStorage.setItem(lookupsKey, JSON.stringify(kept));
          else globalThis.localStorage.removeItem(lookupsKey);
        } catch {
          // Not kept: the switch still holds for this tab.
        }
        document.getElementById('lookup-note').textContent = box.checked
          ? `${name} is on.`
          : `${name} is off. PEA asks that service nothing until you turn it on again.`;
        changed(id, box.checked);
      };
      words.append(strong, small);
      label.append(box, words);
      return label;
    }),
  );
  return { on: (id) => state[id] !== false, all: () => ({ ...state }) };
}
