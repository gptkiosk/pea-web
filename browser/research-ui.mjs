// Public research in Chat: the owner approves one exact address, PEA's own server reads it, and
// the plain words are kept in this tab only. They are shown here and reach a model only through
// the model-sharing review of the next message. Nothing here is saved, and nothing is read unasked.
import { ServiceError, containsCredential } from './connections.mjs';
import { describeRead, pageAddress, pageText, researchLimits } from './research.mjs';

const $ = (id) => document.getElementById(id);

export function installResearch(hooks) {
  // The one page being shared, if any: { profile, url, host, title, text, length }.
  let page = null,
    reading = false;

  function render() {
    const shown = page && page.profile === hooks.profile() ? page : null;
    $('context-page').hidden = !shown;
    $('context-page-name').textContent = shown ? shown.title || shown.host : '';
    $('context-page-note').textContent = shown
      ? `${shown.url}\n${shown.text.length.toLocaleString('en-US')} of ${shown.length.toLocaleString('en-US')} characters kept, as plain words. This is everything a model would be given, and only after you review your next message. It is not saved with your chats.`
      : '';
    $('context-page-text').textContent = shown ? shown.text : '';
  }
  function clear() {
    if (!page) return;
    page = null;
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
    try {
      let next = address,
        moved = null;
      for (let hop = 0; ; hop++) {
        const approved = await hooks.review(
          moved ? 'This page has moved. Read the new address?' : 'Read this public web page?',
          describeRead(next, { profile: who, from: moved ? 'site' : from, moved, feed }),
        );
        if (!approved) return false;
        if (who !== hooks.profile()) throw new ServiceError('Profile changed. Review the page again.');
        const asked = next;
        // `run` reports a failure to the owner itself and then gives back nothing.
        const answer = await hooks.run(() => hooks.read(hooks.key(), asked.url));
        if (!answer) return false;
        if (who !== hooks.profile()) throw new ServiceError('Profile changed. Review the page again.');
        if (answer.outcome === 'redirect') {
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
        render();
        hooks.notice(
          `Page read. ${kept.text.length.toLocaleString('en-US')} characters are kept in this tab; your model sees them only after you review your next message.`,
        );
        return true;
      }
    } catch (error) {
      hooks.notice(error instanceof ServiceError ? error.message : 'The page could not be read.');
      return false;
    } finally {
      reading = false;
    }
  }

  render();
  return {
    read,
    clear,
    render,
    // What the next Chat message would share, or null.
    current: () => (page && page.profile === hooks.profile() ? { url: page.url, text: page.text } : null),
    profileChanged: clear,
  };
}
