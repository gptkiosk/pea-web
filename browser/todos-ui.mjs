// The to-do list on Today, its reminders, and the review of changes a model proposes.
// Items live with the story board: in this tab only, or encrypted on this browser when the owner
// has chosen that. Reminders appear only while this page is open, unless the owner hands them to
// PEA for Mac, which can show them as notifications when the page is closed.
import {
  addTodo,
  applyTodoRequests,
  clearFinished,
  describeRequests,
  dueReminders,
  remindersForMac,
  removeTodo,
  setTodoDone,
  todoGuidance,
  validateTodos,
} from './todos.mjs';
import { ServiceError } from './connections.mjs';

const $ = (id) => document.getElementById(id);
const when = (ms) =>
  new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const macChoice = 'pea-mac-reminders-v1';

export function installTodos({ store, profile, notice, review, mac = null, changed = () => {} }) {
  // Reminders already shown in this page, so one is not repeated every time the list is checked.
  const reminded = new Set();
  const mine = () => store.items().filter((t) => t.profile === profile());
  const guarded = (action) => {
    try {
      action();
      return true;
    } catch (error) {
      notice(error.message || 'That could not be done.');
      return false;
    }
  };

  function row(item) {
    const li = document.createElement('li');
    li.className = 'todo-item' + (item.done ? ' done' : '');
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = item.done;
    box.onchange = () => {
      if (!guarded(() => store.change((items) => setTodoDone(items, item.id, box.checked))))
        box.checked = item.done;
    };
    const title = document.createElement('span');
    title.textContent = item.title;
    label.append(box, title);
    li.append(label);
    if (item.due !== null) {
      const due = document.createElement('small');
      const late = !item.done && item.due < Date.now();
      due.className = 'todo-due' + (late ? ' late' : '');
      due.textContent =
        (late ? 'Was due ' : 'Due ') + when(item.due) + (item.remind && !item.done ? ' · reminder' : '');
      li.append(due);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'text-button';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${item.title}`);
    remove.onclick = () => guarded(() => store.change((items) => removeTodo(items, item.id)));
    li.append(remove);
    return li;
  }

  function render() {
    // Whatever shows a summary of this list redraws after it.
    queueMicrotask(changed);
    const usable = store.usable(),
      blended = !['personal', 'work'].includes(profile());
    const items = usable && !blended ? mine() : [];
    const open = items
        .filter((t) => !t.done)
        .sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity) || a.created - b.created),
      finished = items.filter((t) => t.done).sort((a, b) => (b.completed ?? 0) - (a.completed ?? 0));
    $('todo-list').replaceChildren(...open.map(row));
    $('todo-finished').replaceChildren(...finished.map(row));
    $('todo-finished-section').hidden = !finished.length;
    $('todo-finished-count').textContent = String(finished.length);
    $('todo-count').textContent = open.length + ' open';
    $('todo-empty').hidden = open.length > 0;
    $('todo-empty').textContent = !usable
      ? 'Unlock the saved board to see your to-dos.'
      : blended
        ? 'Choose Personal or Work. To-dos are not shared into Blended.'
        : 'Nothing open. Add one above, or ask in Chat.';
    for (const id of ['todo-title', 'todo-due', 'todo-remind', 'todo-submit'])
      $(id).disabled = !usable || blended;
    $('todo-notify').hidden = !('Notification' in globalThis) || Notification.permission !== 'default';
    check();
    void macSync();
  }

  // --- Handing reminders to PEA for Mac -------------------------------------------------------
  // Off until the owner turns it on here, and possible only when this page is connected to PEA for
  // Mac with its token and the owner has turned reminders on in the Mac app as well. The whole list
  // is sent again whenever it changes; nothing is sent while the saved board is locked.
  const macWanted = () => {
    try {
      return globalThis.localStorage.getItem(macChoice) === '1';
    } catch {
      return false;
    }
  };
  const macState = {
    available: false,
    probed: 0,
    key: '',
    sent: null,
    busy: false,
    again: false,
    failed: false,
  };
  function drawMac() {
    const wanted = macWanted(),
      key = mac?.key() || '';
    $('todo-mac').hidden = !mac || !(wanted || (key && macState.available));
    $('todo-mac-on').checked = wanted;
    $('todo-mac-note').textContent = !wanted
      ? 'Shows your reminders as Mac notifications, even when this page is closed.'
      : !key
        ? 'Connect the local model again so this Mac’s reminders stay up to date. Until then it keeps the last list it was given.'
        : !macState.available
          ? 'PEA for Mac is not taking reminders now. Turn on Show Reminders as Notifications in its menu.'
          : macState.sent === null
            ? store.usable()
              ? 'Handing your reminders to this Mac…'
              : 'Unlock the saved board to update this Mac’s reminders.'
            : 'This Mac has the titles and times of your open reminders in every profile, and shows them even when this page is closed.';
  }
  async function macSync(force = false) {
    if (!mac) return;
    const key = mac.key() || '';
    if (key !== macState.key)
      Object.assign(macState, { key, available: false, probed: 0, sent: null, failed: false });
    if (!key) return drawMac();
    if (macState.busy) {
      macState.again = true;
      return;
    }
    macState.busy = true;
    try {
      // Asked again now and then, because the owner can turn reminders on or off in the Mac app at any time.
      if (force || Date.now() - macState.probed > 15000) {
        macState.probed = Date.now();
        const was = macState.available;
        macState.available = (await mac.send(key)).available;
        if (!macState.available || !was) macState.sent = null;
      }
      if (macState.available && macWanted() && store.usable()) {
        const list = remindersForMac(store.items(), Date.now()),
          text = JSON.stringify(list);
        if (text !== macState.sent) {
          macState.available = (await mac.send(key, list)).available;
          macState.sent = macState.available ? text : null;
        }
      }
      macState.failed = false;
    } catch {
      macState.available = false;
      macState.sent = null;
      if (macWanted() && !macState.failed)
        notice('PEA for Mac did not take your reminders. They still appear here.');
      macState.failed = true;
    } finally {
      macState.busy = false;
      drawMac();
      if (macState.again) {
        macState.again = false;
        void macSync();
      }
    }
  }
  $('todo-mac-on').onchange = async () => {
    const box = $('todo-mac-on'),
      key = mac?.key() || '';
    if (box.checked) {
      box.checked = false;
      const ok = await review(
        'Hand reminders to PEA for Mac',
        'PEA for Mac will be given the title and time of every open reminder, in your Personal and Work profiles alike, and again whenever they change.\n\nIt asks macOS to show each one as a notification at its time, even when this page or the PEA app is closed. macOS keeps those titles in plain form, outside this browser’s encrypted storage, and may show them on the lock screen.\n\nNothing else is handed over: no to-do without a reminder, no finished to-do, no chat.\n\nTurning this off again withdraws them from the Mac.',
      );
      if (!ok) return drawMac();
      try {
        globalThis.localStorage.setItem(macChoice, '1');
      } catch {
        return notice('This browser would not save that choice.');
      }
      macState.sent = null;
      return macSync(true);
    }
    try {
      globalThis.localStorage.removeItem(macChoice);
    } catch {
      // The choice lives in this page until it is closed.
    }
    macState.sent = null;
    drawMac();
    if (!key)
      return notice(
        'Turned off here. Connect the local model to withdraw the reminders this Mac already has.',
      );
    try {
      await mac.send(key, []);
      notice('This Mac’s reminders were withdrawn.');
    } catch {
      notice('Turned off here, but this Mac could not be reached to withdraw its reminders.');
    }
  };
  const macHasIt = () => macWanted() && macState.available && macState.sent !== null;

  $('todo-add').onsubmit = (event) => {
    event.preventDefault();
    const raw = $('todo-due').value,
      due = raw ? new Date(raw).getTime() : null;
    if (raw && !Number.isFinite(due)) return notice('That due time was not understood.');
    if ($('todo-remind').checked && (due === null || due <= Date.now()))
      return notice('A reminder needs a due time in the future.');
    if (
      guarded(() =>
        store.change((items) =>
          addTodo(items, profile(), $('todo-title').value, { due, remind: $('todo-remind').checked }),
        ),
      )
    )
      $('todo-add').reset();
  };
  $('todo-clear').onclick = () => guarded(() => store.change((items) => clearFinished(items, profile())));
  // The system notification is optional and asked for only by this click.
  $('todo-notify').onclick = async () => {
    try {
      const answer = await Notification.requestPermission();
      notice(
        answer === 'granted'
          ? 'Reminders will also appear as system notifications while PEA is open.'
          : 'Reminders will stay inside PEA.',
      );
    } catch {
      notice('This browser cannot show system notifications.');
    }
    render();
  };

  // Shows reminders that have come due. Runs on a slow timer and whenever the list is drawn.
  function check() {
    if (!store.usable()) return;
    for (const item of dueReminders(store.items(), profile(), Date.now(), reminded)) {
      reminded.add(item.id);
      notice('Reminder: ' + item.title);
      const li = document.createElement('li');
      li.textContent = `${item.title} · due ${when(item.due)}`;
      $('todo-reminders').append(li);
      $('todo-reminders-box').hidden = false;
      // The Mac shows its own notification for this reminder, so the browser's would be a second one.
      if (!macHasIt() && 'Notification' in globalThis && Notification.permission === 'granted') {
        try {
          new Notification('PEA reminder', { body: item.title, tag: 'pea-todo-' + item.id });
        } catch {
          // The in-page reminder above is the one that counts.
        }
      }
    }
  }
  $('todo-reminders-dismiss').onclick = () => {
    $('todo-reminders').replaceChildren();
    $('todo-reminders-box').hidden = true;
  };
  const timer = setInterval(() => {
    check();
    void macSync();
  }, 20000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) check();
  });
  globalThis.addEventListener('pagehide', () => clearInterval(timer));

  render();
  return {
    render,
    check,
    // For a backup: every to-do, or null while the list cannot be read.
    portable: () => (store.usable() ? store.items() : null),
    // To-dos from a reviewed backup, added to this profile under new local ids.
    bringIn(list, who = profile()) {
      store.change((items) => {
        const next = [...items, ...list.map((t) => ({ ...t, id: crypto.randomUUID(), profile: who }))];
        if (!validateTodos(next))
          throw new ServiceError('These to-dos do not fit the list. Nothing was added.');
        return next;
      });
      render();
      return list.length;
    },
    // This profile's open to-dos, for the summary on Today.
    open: () =>
      store.usable() && ['personal', 'work'].includes(profile()) ? mine().filter((t) => !t.done) : [],
    // What the model is told about to-dos. The items are included only under the owner's setting.
    guidance: (shared) =>
      ['personal', 'work'].includes(profile())
        ? todoGuidance(store.usable() ? store.items() : [], profile(), shared)
        : '',
    describe: (requests) => describeRequests(requests),
    // Applies changes the owner has just approved, and returns what actually happened.
    apply(requests) {
      let outcome;
      store.change((items) => {
        outcome = applyTodoRequests(requests, items, profile());
        return outcome.items;
      });
      return outcome.say;
    },
    connectionChanged: () => macSync(true),
    profileChanged() {
      $('todo-add').reset();
      $('todo-reminders-dismiss').click();
      render();
    },
  };
}
