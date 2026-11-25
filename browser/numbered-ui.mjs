// The numbered list that answers a navigation command: a small panel over the page, and the same
// rows in the voice room. The owner's own words are matched by fixed rules (numbered.mjs); no
// model reads them, and nothing here is put in a conversation or given to a model. Headline
// titles shown here stay in this tab, as they do in the Headlines card.
import { numberedCommand, numberedMove, replyPoints } from './numbered.mjs';
import { briefInPlay, idle, nextTip, noTips, showCommand, showMove, tipTiming } from './shownav.mjs';

const $ = (id) => document.getElementById(id);

// `groups()` gives the owner's feeds in their order, each { name, items: [{ title, link }] }.
// `lastReply(surface)` gives the newest finished reply's words. `readInChat(link, name)` opens the
// usual review for one page. `speak(words)` reads with the device's own voice.
// `shows()` gives the followed shows of Curated sources with their kept episodes, and `quiet()`
// stops anything being read aloud. `lookup({ kind, query })` opens the usual review for one search
// of published papers or of the web; nothing is asked before the owner approves it.
// `canSearch()` says whether a web search can be made at all: a key is held and the lookup is on.
export function installNumbered({
  groups,
  shows = () => [],
  lastReply,
  readInChat,
  speak,
  quiet = () => {},
  lookup = () => {},
  canSearch = () => false,
  transcripts = { of: () => null, fetch: async () => false },
  profile,
}) {
  let at = { group: null, item: null, point: null },
    showAt = idle(),
    shown = null,
    whose = null,
    tips = noTips(),
    tipTimer = null;
  const svg = (name, attributes) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  };
  // A tip goes away by itself; the list it sat on stays as it is.
  function dropTip() {
    clearTimeout(tipTimer);
    tipTimer = null;
    if (shown) shown.tip = null;
    for (const old of document.querySelectorAll('.numbered-tip')) old.remove();
  }

  function draw() {
    const mine = shown && whose === profile() ? shown : null;
    for (const place of [$('numbered'), $('voice-room-numbered')]) {
      place.hidden = !mine;
      place.replaceChildren();
      if (!mine) continue;
      const head = document.createElement('div'),
        title = document.createElement('strong'),
        close = document.createElement('button');
      head.className = 'numbered-head';
      title.textContent = mine.title || 'Numbered list';
      close.type = 'button';
      close.className = 'icon';
      close.textContent = '×';
      close.setAttribute('aria-label', 'Close the numbered list');
      // Putting the list away also leaves the open episode, so its brief stops going with messages.
      close.onclick = () => {
        showAt = idle();
        clear();
      };
      head.append(title, close);
      place.append(head);
      if (mine.tip) {
        const tip = document.createElement('button');
        tip.type = 'button';
        tip.className = 'numbered-tip';
        tip.textContent = `Try saying “${mine.tip}”`;
        tip.title = 'Press to do this now';
        tip.onclick = () => press({ say: mine.tip });
        place.append(tip);
      }
      if (mine.rows.length) {
        const list = document.createElement('ol');
        for (const row of mine.rows) {
          const li = document.createElement('li'),
            label = document.createElement('span'),
            words = document.createElement('span');
          label.className = 'numbered-label';
          label.textContent = row.label;
          words.textContent = row.text;
          if (row.sub) {
            const sub = document.createElement('small');
            sub.textContent = row.sub;
            words.append(sub);
          }
          if (row.go) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'numbered-row';
            b.append(label, words);
            b.setAttribute('aria-label', `${row.label}: ${row.text}`);
            b.onclick = () => press(row.go);
            li.append(b);
            // A section can be searched for on the web from its row, when a search can be made.
            if (row.search && canSearch()) {
              const globe = document.createElement('button'),
                icon = svg('svg', {
                  class: 'action-icon',
                  viewBox: '0 0 24 24',
                  fill: 'none',
                  stroke: 'currentColor',
                  'stroke-width': '1.8',
                  'stroke-linecap': 'round',
                  'stroke-linejoin': 'round',
                  'aria-hidden': 'true',
                });
              icon.append(
                svg('circle', { cx: '12', cy: '12', r: '9' }),
                svg('path', { d: 'M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18' }),
              );
              globe.type = 'button';
              globe.className = 'numbered-search';
              globe.title = `Search the web for section ${row.label}`;
              globe.setAttribute('aria-label', globe.title);
              globe.append(icon);
              globe.onclick = () => press({ say: row.search });
              li.className = 'numbered-searchable';
              li.append(globe);
            }
          } else {
            li.className = 'numbered-row';
            li.append(label, words);
          }
          list.append(li);
        }
        place.append(list);
      }
      if (mine.link) {
        const actions = document.createElement('div'),
          read = document.createElement('button'),
          open = document.createElement('a');
        actions.className = 'filters';
        read.type = 'button';
        read.className = 'text-button';
        read.textContent = 'Read in Chat…';
        read.onclick = () => press({ kind: 'read' });
        open.className = 'text-button';
        open.textContent = 'Open in your browser';
        open.href = mine.link.href;
        open.target = '_blank';
        open.rel = 'noopener noreferrer';
        actions.append(read, open);
        place.append(actions);
      }
      if (mine.open) {
        const actions = document.createElement('div'),
          open = document.createElement('a');
        actions.className = 'filters';
        open.className = 'text-button';
        open.textContent = 'Open the paper in your browser';
        open.href = mine.open;
        open.target = '_blank';
        open.rel = 'noopener noreferrer';
        actions.append(open);
        place.append(actions);
      }
      if (mine.footer?.length) {
        const footer = document.createElement('div');
        footer.className = 'filters numbered-footer';
        for (const button of mine.footer) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'text-button';
          b.textContent = button.label;
          b.onclick = () => press(button.go);
          footer.append(b);
        }
        place.append(footer);
      }
      const note = document.createElement('small');
      note.textContent = mine.note;
      place.append(note);
    }
  }
  function clear() {
    dropTip();
    shown = null;
    draw();
  }
  const hints = {
    groups: 'Say or press a number, for example “feed 1”.',
    items: 'Say or press a number, for example “1.2”, or “back to feeds”.',
    item: 'Say “read it”, “next headline”, “previous headline” or “back to headlines”.',
    points: 'Say or press one, for example “point 2”, or “next point”.',
    point: 'Sent to your model as your next message. Say “next point” or “list points”.',
  };

  // Carries out one command. Gives { handled, send, say }: `send` is a message for the model.
  function run(command, surface) {
    const sources = groups(),
      move = numberedMove(command, { groups: sources, points: replyPoints(lastReply(surface)), at });
    at = move.at;
    const item = move.open ? sources[move.open.group]?.items[move.open.item] : null;
    whose = profile();
    dropTip();
    tips = { ...tips, last: false };
    shown = {
      title: move.title,
      rows: move.rows,
      footer: move.footer,
      link: item?.link ?? null,
      note: move.level === 'none' ? move.say : hints[move.level],
    };
    if (move.read) {
      if (item?.link) {
        clear();
        readInChat(item.link.readable, sources[move.open.group].name);
        return { handled: true, send: null, say: 'Review the address to read it.' };
      }
      shown.note = 'This headline has no address PEA can read.';
      draw();
      return { handled: true, send: null, say: shown.note };
    }
    draw();
    return { handled: true, send: move.send, say: move.say };
  }
  // One move through the followed shows.
  function runShow(command, followed) {
    const move = showMove(command, { shows: followed, at: showAt, transcriptOf: transcripts.of });
    showAt = move.at;
    whose = profile();
    dropTip();
    const tip = nextTip(tips, move, { now: Date.now(), search: canSearch() });
    tips = tip.state;
    if (tip.phrase) tipTimer = setTimeout(dropTip, tipTiming.shown);
    shown = {
      tip: tip.phrase,
      title: move.title,
      rows: move.rows.map((row) => ({ ...row, go: row.say ? { say: row.say } : null })),
      footer: move.footer.map((button) => ({ label: button.label, go: { say: button.say } })),
      link: null,
      open: move.open ?? null,
      note:
        (move.level === 'none' ? move.say : move.hint) +
        (showAt.episode !== null && move.level !== 'none'
          ? ' While this episode is open, its brief goes with your Chat messages, after the usual review. Close this list or go back to shows to stop.'
          : ''),
    };
    draw();
    if (move.lookup) lookup(move.lookup);
    // Going deeper: the owner reviews the one address, and the passages are shown when it is read.
    if (move.deeper) {
      const { show, episode, section, source } = move.deeper,
        asker = whose,
        from = followed.find((s, i) => (Number.isInteger(s.number) ? s.number : i + 1) === show);
      void transcripts.fetch(from, from?.episodes[episode - 1], source).then((read) => {
        if (!read || asker !== profile() || showAt.show !== show || showAt.episode !== episode) return;
        runShow({ kind: 'deeper', show, episode, section }, shows());
      });
    }
    return { handled: true, send: move.send, say: move.say };
  }
  // The owner's words as a move, through shows first and then feeds and reply points; null when
  // they are not a command. A bare "1.2" means a show's episode once a show is followed.
  function handle(text, surface) {
    const followed = shows(),
      inShows = showCommand(text, { at: showAt, shows: followed }),
      other = numberedCommand(text);
    if (inShows && (followed.length || !other)) return runShow(inShows, followed);
    return other ? run(other, surface) : null;
  }
  let surfaceNow = 'chat',
    onSend = () => {};
  // A pressed row or button does what saying its words does, and ends any reading aloud first.
  function press(go) {
    quiet();
    const done = go.say ? handle(go.say, surfaceNow) : run(go, surfaceNow);
    if (done?.send) onSend(surfaceNow, done.send);
  }

  return {
    // The owner's submitted words. Not a command: { handled: false }.
    command(text, surface, { aloud = false } = {}) {
      surfaceNow = surface;
      const done = handle(text, surface);
      if (!done) return { handled: false, send: null, say: '' };
      if (aloud && done.say && !done.send) speak(done.say);
      return done;
    },
    // How a pressed point reaches the model: the page's own send.
    sendWith(send) {
      onSend = send;
    },
    surface(surface) {
      surfaceNow = surface;
    },
    clear() {
      at = { group: null, item: null, point: null };
      showAt = idle();
      tips = noTips();
      clear();
    },
    draw,
    // The open episode's brief, for a Chat request of the profile that opened it. Null otherwise.
    brief: () => (whose === profile() ? briefInPlay(shows(), showAt, transcripts.of) : null),
  };
}
