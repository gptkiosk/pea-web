// The numbered list that answers a navigation command: a small panel over the page, and the same
// rows in the voice room. The owner's own words are matched by fixed rules (numbered.mjs); no
// model reads them, and nothing here is put in a conversation or given to a model. Headline
// titles shown here stay in this tab, as they do in the Headlines card.
import { numberedCommand, numberedMove, replyPoints } from './numbered.mjs';

const $ = (id) => document.getElementById(id);

// `groups()` gives the owner's feeds in their order, each { name, items: [{ title, link }] }.
// `lastReply(surface)` gives the newest finished reply's words. `readInChat(link, name)` opens the
// usual review for one page. `speak(words)` reads with the device's own voice.
export function installNumbered({ groups, lastReply, readInChat, speak, profile }) {
  let at = { group: null, item: null, point: null },
    shown = null,
    whose = null;

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
      close.onclick = clear;
      head.append(title, close);
      place.append(head);
      if (mine.rows.length) {
        const list = document.createElement('ol');
        for (const row of mine.rows) {
          const li = document.createElement('li'),
            label = document.createElement('span'),
            words = document.createElement('span');
          label.className = 'numbered-label';
          label.textContent = row.label;
          words.textContent = row.text;
          if (row.go) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'numbered-row';
            b.append(label, words);
            b.setAttribute('aria-label', `${row.label}: ${row.text}`);
            b.onclick = () => press(row.go);
            li.append(b);
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
      const note = document.createElement('small');
      note.textContent = mine.note;
      place.append(note);
    }
  }
  function clear() {
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
    shown = {
      title: move.title,
      rows: move.rows,
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
  let surfaceNow = 'chat',
    onSend = () => {};
  // A pressed row does what saying its number does.
  function press(go) {
    const done = run(go, surfaceNow);
    if (done.send) onSend(surfaceNow, done.send);
  }

  return {
    // The owner's submitted words. Not a command: { handled: false }.
    command(text, surface, { aloud = false } = {}) {
      const command = numberedCommand(text);
      if (!command) return { handled: false, send: null, say: '' };
      surfaceNow = surface;
      const done = run(command, surface);
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
      clear();
    },
    draw,
  };
}
