// Public research in Chat: the owner approves one exact address, PEA's own server reads it, and
// the plain words are kept in this tab only. They are shown here and reach a model only through
// the model-sharing review of the next message. Nothing here is saved, and nothing is read unasked.
import { ServiceError, containsCredential } from './connections.mjs';
import { describeRead, pageAddress, pageText, lookupKinds, researchLimits } from './research.mjs';
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

  // Reviews and makes one search of the public index of papers. `address` comes from
  // papersAddress(); `from` is 'owner' or 'model'. Returns true when a list was kept.
  async function lookup(address, from) {
    const kind = lookupKinds[address.lookup];
    if (!kind) return false;
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
      if (!(await hooks.review(kind.review, kind.describe(address, { profile: who, from })))) return false;
      if (who !== hooks.profile()) throw new ServiceError('Profile changed. Review the search again.');
      trail = beginWork(performance.now());
      work = { profile: who, trail };
      workStep(
        trail,
        'shield',
        `You approved a search of ${kind.service} for “${address.query}”` +
          (from === 'model' ? ', which PEA’s reply suggested' : ''),
      );
      workWaiting(trail, `Your PEA server is asking ${kind.service}…`);
      render();
      const answer = await hooks.run(() => hooks.read(hooks.key(), address.url));
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
      const kept = answer.outcome === 'page' ? kind.read(answer.text, address.query) : null;
      if (!kept) throw new ServiceError(kind.odd);
      if (!kept.count) throw new ServiceError(kind.none);
      page = {
        profile: who,
        url: address.url,
        host: address.host,
        title: kept.title,
        text: kept.text,
        length: kept.length,
      };
      workStep(trail, 'globe', `Your PEA server asked ${kind.service} once`);
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
    clear,
    render,
    // What the next Chat message would share, or null.
    current: () => (page && page.profile === hooks.profile() ? { url: page.url, text: page.text } : null),
    profileChanged: clear,
  };
}
