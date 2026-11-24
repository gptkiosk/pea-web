// The command palette, keyboard shortcuts and their help screen.
// Every command presses a control that is already on the page, so its usual checks and reviews apply.
// Shortcuts do nothing while any other dialog is open, which includes every review.
import { settingsPlaces } from './settings.mjs';
import { commandList, matchCommands, shortcutFor, shortcutLabel, shortcuts } from './commands.mjs';

const $ = (id) => document.getElementById(id);
const press = (id) => $(id).click();

export function installCommands({ workspace, tab, context, goSetting = () => {} }) {
  const mac = /mac|iphone|ipad/i.test(
    globalThis.navigator?.userAgentData?.platform || navigator.platform || '',
  );
  const palette = $('palette'),
    input = $('palette-input'),
    listbox = $('palette-list');
  let shown = [],
    active = 0;

  const composer = () => (workspace.layout().focus === 'greenhouse' ? $('collab-thought') : $('thought'));
  const actions = {
    split: () => workspace.toggle(),
    swap: () => workspace.swap(),
    'new-chat': () => press('library-new-chat'),
    compose: () => {
      if (workspace.layout().focus === 'today') tab('chat');
      composer().focus();
    },
    voice: () => press(workspace.layout().focus === 'greenhouse' ? 'collab-voice' : 'voice-open'),
    'add-story': () => {
      tab('today');
      // The field sits inside collapsed sections; open each one so it can take focus.
      for (
        let section = $('story-title').closest('details');
        section;
        section = section.parentElement?.closest('details')
      )
        section.open = true;
      $('story-title').focus();
    },
    'add-todo': () => {
      tab('today');
      $('todos-section').open = true;
      $('todo-title').focus();
    },
    history: () => press('library-open'),
    interview: () => press('interview-open'),
    debate: () => press('home-debate'),
    connections: () => press('collab-config'),
    privacy: () => press('settings-open'),
    theme: () => press('theme'),
    shortcuts: () => openHelp(),
  };
  for (const id of Object.keys(settingsPlaces)) actions['settings-' + id] = () => goSetting(id);
  for (const name of ['chat', 'today', 'greenhouse']) {
    actions['go-' + name] = () => tab(name);
    actions['beside-' + name] = () => workspace.beside(name);
  }
  for (const profile of ['personal', 'work', 'blended'])
    actions['profile-' + profile] = () => {
      const select = $('profile');
      if (select.disabled) return;
      select.value = profile;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    };

  function run(id) {
    // Only commands on the current list can run, so a stale or invented id does nothing.
    if (!commandList(context()).some((command) => command.id === id)) return;
    actions[id]?.();
  }

  function draw() {
    shown = matchCommands(commandList(context()), input.value);
    active = Math.min(active, Math.max(0, shown.length - 1));
    listbox.replaceChildren(
      ...shown.map((command, index) => {
        const row = document.createElement('div');
        row.id = 'palette-option-' + index;
        row.className = 'palette-option';
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(index === active));
        row.dataset.command = command.id;
        const title = document.createElement('span');
        title.textContent = command.title;
        row.append(title);
        const keys = command.shortcut && shortcutLabel(command.shortcut, mac);
        if (keys) {
          const hint = document.createElement('kbd');
          hint.textContent = keys;
          row.append(hint);
        }
        row.onclick = () => choose(index);
        return row;
      }),
    );
    if (!shown.length) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'No matching command.';
      listbox.append(empty);
    }
    input.setAttribute('aria-activedescendant', shown.length ? 'palette-option-' + active : '');
    listbox.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' });
  }

  // The chosen command runs once the palette has finished closing. Closing a dialog moves focus
  // back to where it was, which would undo a command that puts focus somewhere new.
  let chosen = null;
  function choose(index) {
    chosen = shown[index]?.id ?? null;
    palette.close();
  }
  palette.addEventListener('close', () => {
    const id = chosen;
    chosen = null;
    if (id) run(id);
  });

  function openPalette() {
    if (palette.open) {
      chosen = null;
      return palette.close();
    }
    if (document.querySelector('dialog:modal')) return;
    $('workspace-menu').open = false;
    input.value = '';
    active = 0;
    draw();
    palette.showModal();
    input.focus();
  }

  function openHelp() {
    if (document.querySelector('dialog:modal')) return;
    $('shortcut-list').replaceChildren(
      ...shortcuts.flatMap((shortcut) => {
        const keys = document.createElement('dt'),
          kbd = document.createElement('kbd'),
          does = document.createElement('dd');
        kbd.textContent = mac ? shortcut.mac : shortcut.other;
        keys.append(kbd);
        does.textContent = shortcut.does;
        return [keys, does];
      }),
    );
    $('shortcuts-dialog').showModal();
  }

  input.oninput = () => {
    active = 0;
    draw();
  };
  input.onkeydown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (shown.length) active = (active + (event.key === 'ArrowDown' ? 1 : shown.length - 1)) % shown.length;
      draw();
    } else if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      choose(active);
    }
  };
  // A click on the dimmed area around the palette closes it.
  palette.onclick = (event) => {
    if (event.target === palette) palette.close();
  };

  const typingIn = (target) =>
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

  document.addEventListener('keydown', (event) => {
    const name = shortcutFor(event, { mac, typing: typingIn(event.target) });
    if (!name) return;
    // A settings panel open beside the page is not in the way.
    const dialog = document.querySelector('dialog:modal');
    // With a dialog open, the only shortcut is closing the palette with its own key.
    if (dialog && !(dialog === palette && name === 'palette')) return;
    if (name === 'send') {
      if (event.target === $('thought')) $('composer').requestSubmit();
      else if (event.target === $('collab-thought')) press('collab-send');
      else return;
    } else if (name === 'palette') openPalette();
    else if (name === 'help') openHelp();
    else if (name === 'split') {
      if (!commandList(context()).some((command) => command.id === 'split')) return;
      workspace.toggle();
    } else if (name === 'compose') run('compose');
    else if (name.startsWith('workspace-')) tab(['chat', 'today', 'greenhouse'][Number(name.slice(-1)) - 1]);
    event.preventDefault();
  });

  $('menu-palette').onclick = () => {
    $('workspace-menu').open = false;
    openPalette();
  };
  // Commands and shortcuts are one place: each has a way to the other.
  $('palette-shortcuts').onclick = () => {
    chosen = null;
    palette.close();
    openHelp();
  };
  $('shortcuts-commands').onclick = () => {
    $('shortcuts-dialog').close();
    openPalette();
  };
  $('menu-palette').append(
    Object.assign(document.createElement('kbd'), { textContent: shortcutLabel('palette', mac) }),
  );

  return { openPalette, openHelp, run };
}
