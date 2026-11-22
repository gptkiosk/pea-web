// "Her history" in the library. There are no cards until the owner asks their own model to write
// them: one reviewed request, an optional reviewed read of one public page about her home, and a
// second review of every card before any is kept. Personal profile only. Kept cards stay in this
// browser; in Chat at most two go with a message, under the owner's introduction-sharing switch.
import { containsCredential } from './connections.mjs';
import { describeLife, lifeBrief, lifeOf, validSeed } from './life.mjs';
import { describeRead, pageAddress, pageText } from './research.mjs';
import {
  canonLimits,
  describeCards,
  describeHistoryRequest,
  historyPrompt,
  historyRequest,
  homeAnswer,
  parseCanon,
  selectCards,
  validSavedCanon,
} from './canon.mjs';

const $ = (id) => document.getElementById(id);
const storageKey = 'pea-canon-v1';
const lifeKey = 'pea-life-v1';

export function installCanon({ profile, interview, review, run, compose, isBusy, key, read }) {
  let saved = { made: 0, cards: [] },
    working = false,
    // Completed Chat requests since a card last went with one. Starts ready.
    sinceLast = canonLimits.gap;
  try {
    saved = validSavedCanon(JSON.parse(globalThis.localStorage.getItem(storageKey) || 'null'));
  } catch {
    // Nothing usable was saved; there are no cards.
  }
  const store = () => {
    try {
      if (saved.cards.length) globalThis.localStorage.setItem(storageKey, JSON.stringify(saved));
      else globalThis.localStorage.removeItem(storageKey);
    } catch {
      // Private browsing may refuse storage; the cards then last for this tab.
    }
  };
  const say = (text) => ($('canon-note').textContent = text);
  // Her hand of interests and people: dealt once for this browser from a number kept here, so it
  // stays the same from day to day. No request is made for it and nothing about the owner is in it.
  let seed = 0;
  const newSeed = () => globalThis.crypto.getRandomValues(new Uint32Array(1))[0] || 1;
  try {
    seed = JSON.parse(globalThis.localStorage.getItem(lifeKey) || 'null')?.seed;
  } catch {
    // Nothing usable was saved; she is dealt a hand now.
  }
  const keepSeed = () => {
    try {
      globalThis.localStorage.setItem(lifeKey, JSON.stringify({ seed }));
    } catch {
      // Private browsing may refuse storage; the hand then lasts for this tab.
    }
  };
  if (!validSeed(seed)) {
    seed = newSeed();
    keepSeed();
  }
  $('life-deal').onclick = async () => {
    if (working || isBusy()) return say('Finish the current request first.');
    if (
      !(await review(
        'Give her a different set of interests and friends?',
        `Now: ${describeLife(lifeOf(seed))}\n\nA new set is dealt from PEA’s own list. No request is made and nothing is sent anywhere.${saved.cards.length ? '\n\nHer history cards and her days were written around the present set and may no longer fit. Delete and write them again if you want them to match.' : ''}`,
      ))
    )
      return;
    seed = newSeed();
    keepSeed();
    render();
    say('She has a new set of interests and friends.');
  };
  const personal = () => profile() === 'personal';

  function render() {
    const count = saved.cards.length;
    $('life-hand').textContent = personal() ? describeLife(lifeOf(seed)) : '';
    $('life-deal').hidden = !personal();
    $('canon-status').textContent = !personal()
      ? 'Her history belongs to the Personal profile. It is never used in Work or Blended.'
      : count
        ? `${count} cards, written by your model on ${new Date(saved.made).toISOString().slice(0, 10)}.`
        : 'No cards yet. Nothing is written until you ask.';
    $('canon-write').disabled = !personal() || working;
    $('canon-write').textContent = count ? 'Write her history again…' : 'Write her history…';
    $('canon-source').disabled = !personal() || working;
    $('canon-clear').hidden = !personal() || !count;
    $('canon-list').replaceChildren(
      ...(personal() ? saved.cards : []).map((card) => {
        const row = document.createElement('li'),
          words = document.createElement('span'),
          topic = document.createElement('strong'),
          remove = document.createElement('button');
        topic.textContent = card.topic;
        words.append(
          topic,
          document.createTextNode(' · ' + card.tags.join(', ')),
          document.createElement('br'),
        );
        words.append(document.createTextNode(card.text));
        remove.type = 'button';
        remove.className = 'text-button';
        remove.textContent = 'Delete';
        remove.setAttribute('aria-label', 'Delete the card ' + card.topic);
        remove.onclick = () => {
          saved = { made: saved.made, cards: saved.cards.filter((c) => c !== card) };
          store();
          render();
          say('Card deleted. Your model is not given it again.');
        };
        row.append(words, remove);
        return row;
      }),
    );
  }

  // The plain words of one public page the owner approves, or null (with the reason said).
  async function placeFacts(value) {
    const address = pageAddress(value);
    if (!address) return (say('Enter the full https:// address of a public page, or leave it empty.'), null);
    if (!key())
      return (
        say(
          'Reading a page needs your PEA server. Connect it in Connections → Local model, or leave the address empty.',
        ),
        null
      );
    if (
      !(await review(
        'Read this public web page?',
        describeRead(address, { profile: profile(), from: 'owner' }),
      ))
    )
      return (say('Nothing was read or sent.'), null);
    const answer = await run(() => read(key(), address.url));
    if (!answer) return (say('The page could not be read. Nothing was sent to your model.'), null);
    if (answer.outcome === 'redirect') {
      const moved = pageAddress(answer.location);
      return (
        say(
          moved
            ? `That page has moved to ${moved.url}. PEA did not follow it; enter that address if you want it.`
            : 'That page points somewhere PEA will not read.',
        ),
        null
      );
    }
    const kept = pageText(answer.type, answer.text);
    if (!kept.text)
      return (say('That page had no words PEA could keep. Nothing was sent to your model.'), null);
    if (containsCredential(kept.text))
      return (
        say('That page shows something that looks like a password or key, so PEA did not use it.'),
        null
      );
    return { source: address.url, facts: kept.text.slice(0, canonLimits.facts) };
  }

  async function write() {
    if (working || isBusy()) return say('Finish the current request first.');
    if (!personal()) return say('Choose the Personal profile first.');
    const answers = interview();
    const home = homeAnswer(answers.assistantHome);
    if (!home)
      return say(
        'Tell PEA which city she should call home first: Interview & persona, step 1, then Save. Her history is set there.',
      );
    working = true;
    render();
    try {
      let place = { source: '', facts: '' };
      const wanted = $('canon-source').value.trim();
      if (wanted) {
        place = await placeFacts(wanted);
        if (!place) return;
      }
      if (!personal()) return say('Profile changed. Nothing was sent.');
      say('Waiting for your review…');
      const result = await run(() =>
        compose({
          title: 'Write her history with your model?',
          about: describeHistoryRequest({
            home,
            facts: place.facts,
            source: place.source,
            existing: saved.cards.length,
          }),
          system: historyPrompt({
            home,
            persona: answers.persona,
            facts: place.facts,
            life: lifeBrief(lifeOf(seed)),
          }),
          user: historyRequest,
        }),
      );
      if (!result?.started) return say('No cards were written. Nothing was kept.');
      if (!personal()) return say('Profile changed. Nothing was kept.');
      const cards = parseCanon(result.text);
      if (!cards)
        return say(
          'Your model’s reply was not a usable set of cards, so nothing was kept. You can try again; each try is one request.',
        );
      if (!(await review('Keep these cards?', describeCards(cards, saved.cards.length))))
        return say('Not kept. The cards your model wrote were discarded.');
      if (!personal()) return say('Profile changed. Nothing was kept.');
      saved = { made: Date.now(), cards };
      sinceLast = canonLimits.gap;
      store();
      say(`${cards.length} cards kept. Read them below and delete any you do not want.`);
    } finally {
      working = false;
      render();
    }
  }

  $('canon-write').onclick = () => void write();
  $('canon-clear').onclick = async () => {
    if (working || !saved.cards.length) return;
    if (
      !(await review(
        'Delete all of her history?',
        `This deletes all ${saved.cards.length} cards from this browser. Your model is not given them again. It does not undo anything already said in a chat.`,
      ))
    )
      return;
    saved = { made: 0, cards: [] };
    store();
    render();
    say('All cards deleted.');
  };

  render();
  return {
    render,
    // For one Chat message: the cards that would go with it, an identity for the whole kept set,
    // and that set in words for the review. Null when there is nothing this profile may share.
    pick(message) {
      if (!personal() || !saved.cards.length) return null;
      return {
        send: selectCards(saved.cards, message, sinceLast),
        stamp: saved.made + ':' + saved.cards.map((c) => c.id).join(','),
        all: saved.cards.map((c) => `${c.topic}: ${c.text}`).join('\n'),
      };
    },
    sent(count) {
      sinceLast = count ? 0 : sinceLast + 1;
    },
    count: () => saved.cards.length,
    // Her interests and people, in Personal only: the hand itself, and as a block for a prompt.
    life: () => (personal() ? lifeOf(seed) : null),
    lifeBrief: () => (personal() ? lifeBrief(lifeOf(seed)) : ''),
    // For other parts of her story, such as her days: the kept cards, in Personal only.
    cards: () => (personal() ? saved.cards : []),
    // Cards from a reviewed backup, added under new local ids. Gives how many were added.
    bringIn(cards) {
      if (!personal() || !cards.length) return 0;
      const used = new Set(saved.cards.map((c) => c.id));
      let n = 1;
      const added = cards.map((c) => {
        while (used.has('card-' + n)) n++;
        used.add('card-' + n);
        return { id: 'card-' + n, ...c };
      });
      const next = validSavedCanon({ made: saved.made || Date.now(), cards: [...saved.cards, ...added] });
      if (next.cards.length !== saved.cards.length + added.length)
        throw new Error('These cards do not fit her history. Nothing was added.');
      saved = next;
      store();
      render();
      return added.length;
    },
  };
}
