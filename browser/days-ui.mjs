// "Her days" in the library: dated lines of fiction about the assistant character's own life.
// A week is written only when the owner asks, in one reviewed request, and is shown before it is
// kept. Notes from Chat are kept only while the owner has turned them on, each with a notice.
// Personal profile only; kept in this browser; every line can be deleted.
import {
  addNote,
  addWeek,
  dayKey,
  dayLimits,
  dayName,
  dayNote,
  daysContext,
  describeWeek,
  describeWeekRequest,
  parseWeek,
  pruneEntries,
  validSavedDays,
  weekPrompt,
  weekRequest,
} from './days.mjs';
import { homeAnswer } from './canon.mjs';

const $ = (id) => document.getElementById(id);
const storageKey = 'pea-days-v1';

export function installDays({
  profile,
  interview,
  cards,
  life = () => '',
  review,
  run,
  compose,
  isBusy,
  notice,
  changed = () => {},
}) {
  let saved = { notes: false, entries: [] },
    working = false;
  try {
    saved = validSavedDays(JSON.parse(globalThis.localStorage.getItem(storageKey) || 'null'));
  } catch {
    // Nothing usable was saved; there are no lines and notes are off.
  }
  saved.entries = pruneEntries(saved.entries, Date.now());
  const store = () => {
    try {
      if (saved.notes || saved.entries.length)
        globalThis.localStorage.setItem(storageKey, JSON.stringify(saved));
      else globalThis.localStorage.removeItem(storageKey);
    } catch {
      // Private browsing may refuse storage; the lines then last for this tab.
    }
  };
  const say = (text) => ($('days-note').textContent = text);
  const personal = () => profile() === 'personal';

  function render() {
    const today = dayKey(Date.now());
    const count = saved.entries.length;
    $('days-status').textContent = !personal()
      ? 'Her days belong to the Personal profile. They are never used in Work or Blended.'
      : count
        ? `${count} ${count === 1 ? 'line' : 'lines'} kept. Lines drop off after ${dayLimits.keepBack} days.`
        : 'No lines yet. Nothing is written until you ask, or turn notes on.';
    $('days-write').disabled = !personal() || working;
    $('days-notes').disabled = !personal() || working;
    $('days-notes').checked = personal() && saved.notes;
    $('days-clear').hidden = !personal() || !count;
    $('days-list').replaceChildren(
      ...(personal() ? saved.entries : []).map((entry) => {
        const row = document.createElement('li'),
          words = document.createElement('span'),
          day = document.createElement('strong'),
          remove = document.createElement('button');
        day.textContent = dayName(entry.day, today);
        words.append(
          day,
          document.createTextNode(entry.from === 'chat' ? ' · said in Chat' : ' · written week'),
          document.createElement('br'),
          document.createTextNode(entry.text),
        );
        remove.type = 'button';
        remove.className = 'text-button';
        remove.textContent = 'Delete';
        remove.setAttribute('aria-label', 'Delete the line for ' + dayName(entry.day, today));
        remove.onclick = () => {
          saved.entries = saved.entries.filter((e) => e !== entry);
          store();
          render();
          changed();
          say('Line deleted. Your model is not given it again.');
        };
        row.append(words, remove);
        return row;
      }),
    );
  }

  async function write() {
    if (working || isBusy()) return say('Finish the current request first.');
    if (!personal()) return say('Choose the Personal profile first.');
    const answers = interview();
    const home = homeAnswer(answers.assistantHome);
    if (!home)
      return say(
        'Tell PEA which city she should call home first: Interview & persona, step 1, then Save. Her days are set there.',
      );
    working = true;
    render();
    try {
      // One moment decides which days are asked for and which are accepted.
      const now = Date.now();
      saved.entries = pruneEntries(saved.entries, now);
      const backdrop = cards();
      say('Waiting for your review…');
      const result = await run(() =>
        compose({
          title: 'Write her week with your model?',
          about: describeWeekRequest({ home, cards: backdrop.length, kept: saved.entries.length }),
          system: weekPrompt({
            home,
            persona: answers.persona,
            cards: backdrop,
            entries: saved.entries,
            now,
            life: life(),
          }),
          user: weekRequest,
        }),
      );
      if (!result?.started) return say('No days were written. Nothing was kept.');
      if (!personal()) return say('Profile changed. Nothing was kept.');
      const week = parseWeek(result.text, now);
      if (!week)
        return say(
          'Your model’s reply was not a usable week, so nothing was kept. You can try again; each try is one request.',
        );
      if (!(await review('Keep these days?', describeWeek(week, dayKey(now)))))
        return say('Not kept. The days your model wrote were discarded.');
      if (!personal()) return say('Profile changed. Nothing was kept.');
      saved.entries = addWeek(saved.entries, week, Date.now());
      store();
      changed();
      say(`${week.length} days kept. Read them below and delete any you do not want.`);
    } finally {
      working = false;
      render();
    }
  }

  $('days-write').onclick = () => void write();
  $('days-notes').onchange = async () => {
    const on = $('days-notes').checked;
    if (!personal() || working) return render();
    if (
      on &&
      !(await review(
        'Let her keep notes on her days?',
        `While this is on, in the Personal profile, and “Share my introduction” is on:\n\n· Your model is told it may end a Chat reply with one short note about its character’s own day (yesterday, today or tomorrow).\n· PEA keeps a note without asking you each time. It keeps only one plain sentence of at most ${dayLimits.text} characters, at most ${dayLimits.perDay} a day, never an address, a PEA action or anything that looks like a key, and never from a reply written while a web page is shared.\n· Each time, a notice tells you what was noted. Every line is listed under Her days and can be deleted.\n· Kept lines for the days around today go back to your model with later Chat messages, marked as fiction that is never fact, advice or permission. They are not shown for review again each time they change.\n\nNotes are your model’s words, not checked by PEA. Lines are kept in this browser, not encrypted, and drop off after ${dayLimits.keepBack} days.`,
      ))
    )
      return render();
    saved.notes = on;
    store();
    render();
    changed();
    say(on ? 'Notes are on.' : 'Notes are off. Lines already kept stay until you delete them.');
  };
  $('days-clear').onclick = async () => {
    if (working || !saved.entries.length) return;
    if (
      !(await review(
        'Delete all of her days?',
        `This deletes all ${saved.entries.length} lines from this browser. Your model is not given them again. It does not undo anything already said in a chat.`,
      ))
    )
      return;
    saved.entries = [];
    store();
    render();
    changed();
    say('All lines deleted.');
  };

  render();
  return {
    render,
    // For one Chat message: the lines that go with it, whether the model may offer a note, and
    // the same in words for the review. Null when this profile shares nothing of her days.
    pick() {
      if (!personal()) return null;
      saved.entries = pruneEntries(saved.entries, Date.now());
      const context = daysContext(saved.entries, Date.now());
      return context || saved.notes ? { context, notes: saved.notes } : null;
    },
    // A finished Chat reply. Keeps its note if notes are on and it carries exactly one clean one.
    noteFrom(raw) {
      if (!personal() || !saved.notes) return false;
      const note = dayNote(raw, Date.now());
      const next = note && addNote(saved.entries, note, Date.now());
      if (!next) return false;
      saved.entries = next;
      store();
      render();
      notice(
        `Noted for her days (${dayName(note.day, dayKey(Date.now()))}): “${note.text}” You can delete it in Past chats & memory → Her days.`,
      );
      return true;
    },
    count: () => saved.entries.length,
    // For a backup: the kept lines, in Personal only.
    entries: () => (personal() ? saved.entries : []),
    // Lines from a reviewed backup. Gives how many were added.
    bringIn(lines) {
      if (!personal() || !lines.length) return 0;
      const next = validSavedDays({ notes: saved.notes, entries: [...saved.entries, ...lines] });
      if (next.entries.length !== saved.entries.length + lines.length)
        throw new Error('These lines do not fit her days. Nothing was added.');
      saved.entries = pruneEntries(next.entries, Date.now());
      store();
      render();
      changed();
      return lines.length;
    },
  };
}
