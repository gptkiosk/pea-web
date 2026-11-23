// Reads a publisher's transcript of one episode when the owner asks to go deeper, and keeps it in
// this tab. One address, reviewed first, asked through the owner's own PEA server; the catalog
// says where it is. Nothing is saved: a reload forgets it. What a model sees of it is the few
// passages nearest the section the owner has open, with a Chat message, after the usual review.
import { catalogAddress } from './knowledge.mjs';
import { pageLines, parseTranscript, transcriptLimits, usable } from './transcript.mjs';

const keep = 6;

// `review(title, body)` asks the owner; `key()` is the PEA server's token or ''; `read(key, url)`
// is the server's reader; `notice(text)` says a short thing.
export function installTranscripts({ review, key, read, notice }) {
  const kept = new Map();
  let busy = false;
  const name = (show, episode) => `${show?.id ?? show?.name}/${episode?.item?.id}`;
  const size = (bytes) => (bytes ? `, about ${Math.max(1, Math.round(bytes / 1000))} KB` : '');

  async function fetch(show, episode, source) {
    if (kept.has(name(show, episode))) return true;
    if (busy) {
      notice('A transcript is already being read.');
      return false;
    }
    if (!key()) {
      notice(
        'Reading a transcript needs your PEA server. Connect it in Connections → Local model, then try again.',
      );
      return false;
    }
    busy = true;
    try {
      let address = source.link;
      for (let hop = 0; hop < 3; hop++) {
        const ok = await review(
          hop ? 'The publisher sent PEA elsewhere' : 'Read the publisher’s transcript?',
          `${hop ? 'The address above answered with another address. Read the transcript there?' : `“${episode.item.title}” (${show.name})`}\n\n${address}\n\nIf you approve, your PEA server makes one request to this address${size(hop ? 0 : source.bytes)}. It is the publisher’s own file; the curator’s catalog only says where it is. Nothing of yours is sent with the request, but the publisher’s server sees that your server asked.\n\nThe transcript is kept in this tab only and forgotten on reload. It is not saved and is in no backup. While a section of this episode is open, up to ${transcriptLimits.passages} short passages nearest that section go with your Chat messages, word for word, after the usual review.`,
        );
        if (!ok) return false;
        const answer = await read(key(), address);
        if (answer.outcome === 'redirect') {
          let next = '';
          try {
            next = new URL(answer.location, address).href;
          } catch {
            // Not an address at all.
          }
          if (!catalogAddress(next))
            throw new Error('The publisher sent PEA to an address it will not read.');
          address = next;
          continue;
        }
        const lines =
          source.format === 'html'
            ? usable(pageLines(new DOMParser().parseFromString(answer.text, 'text/html'), source.extract))
            : parseTranscript(answer.text, source.format);
        if (!lines)
          throw new Error('That file did not hold a transcript PEA can read. The brief is all there is.');
        kept.set(name(show, episode), lines);
        while (kept.size > keep) kept.delete(kept.keys().next().value);
        return true;
      }
      throw new Error('The publisher kept sending PEA elsewhere. Nothing was read.');
    } catch (error) {
      notice(error.message || 'The transcript could not be read.');
      return false;
    } finally {
      busy = false;
    }
  }
  return {
    of: (show, episode) => kept.get(name(show, episode)) ?? null,
    fetch,
    forget: () => kept.clear(),
    count: () => kept.size,
  };
}
