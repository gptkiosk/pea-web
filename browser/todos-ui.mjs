// The to-do list on Today, its reminders, and the review of changes a model proposes.
// Items live with the story board: in this tab only, or encrypted on this browser when the owner
// has chosen that. Reminders appear only while this page is open.
import {
  addTodo,
  applyTodoRequests,
  clearFinished,
  describeRequests,
  dueReminders,
  removeTodo,
  setTodoDone,
  todoGuidance,
} from './todos.mjs';

const $ = (id) => document.getElementById(id);
const when = (ms) =>
  new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export function installTodos({ store, profile, notice, review }) {
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
  }

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
      if ('Notification' in globalThis && Notification.permission === 'granted') {
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
  const timer = setInterval(check, 20000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) check();
  });
  globalThis.addEventListener('pagehide', () => clearInterval(timer));

  render();
  return {
    render,
    check,
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
    profileChanged() {
      $('todo-add').reset();
      $('todo-reminders-dismiss').click();
      render();
    },
  };
}
