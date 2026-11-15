// The command palette's list and the keyboard shortcuts, as plain data and pure functions.
// A command only names something the owner could already click. Nothing here can approve a review,
// grant access or reach a model, and model output never becomes a command.
const titles = { chat: 'Chat', today: 'Today', greenhouse: 'Greenhouse' };
const names = Object.keys(titles);

// `context` is what is on screen now: { panes, focus, wide, profile, busy }.
export function commandList(context = {}) {
  const panes = Array.isArray(context.panes) ? context.panes : ['chat'];
  const split = panes.length === 2;
  const list = [];
  for (const name of names)
    list.push({
      id: 'go-' + name,
      title: 'Go to ' + titles[name],
      keywords: 'open show switch tab workspace',
      shortcut: 'workspace-' + (names.indexOf(name) + 1),
    });
  if (context.wide) {
    for (const name of names)
      if (name !== context.focus && !(split && panes.includes(name)))
        list.push({
          id: 'beside-' + name,
          title: `Open ${titles[name]} beside ${titles[context.focus] || 'this workspace'}`,
          keywords: 'split side pane two',
        });
    if (split) {
      list.push({
        id: 'split',
        title: 'Return to one workspace',
        keywords: 'close pane single',
        shortcut: 'split',
      });
      list.push({ id: 'swap', title: 'Swap the two workspaces', keywords: 'sides left right pane' });
    } else
      list.push({
        id: 'split',
        title: 'Show two workspaces side by side',
        keywords: 'pane split',
        shortcut: 'split',
      });
  }
  list.push(
    { id: 'new-chat', title: 'New chat', keywords: 'start fresh conversation clear' },
    { id: 'compose', title: 'Write a message', keywords: 'type composer focus ask', shortcut: 'compose' },
    { id: 'voice', title: 'Voice chat', keywords: 'talk speak microphone dictate' },
    { id: 'add-story', title: 'Add a story to Today', keywords: 'task board capture to-do' },
    { id: 'history', title: 'Past chats & memory', keywords: 'library conversations remember search' },
    { id: 'interview', title: 'Interview & persona', keywords: 'profile introduction about me questions' },
    {
      id: 'connections',
      title: 'Connections & settings',
      keywords: 'model key openrouter google github local',
    },
    { id: 'privacy', title: 'Privacy & voice', keywords: 'preferences speech sharing' },
    { id: 'theme', title: 'Switch light or dark theme', keywords: 'appearance colour color night' },
  );
  for (const profile of ['personal', 'work', 'blended'])
    if (profile !== context.profile)
      list.push({
        id: 'profile-' + profile,
        title: 'Switch to the ' + profile[0].toUpperCase() + profile.slice(1) + ' profile',
        keywords: 'account context',
      });
  list.push({
    id: 'shortcuts',
    title: 'Keyboard shortcuts',
    keywords: 'help keys hotkeys',
    shortcut: 'help',
  });
  // While a request is running, nothing that changes profile or conversation is offered.
  const blocked = /^(?:new-chat|profile-)/;
  return context.busy ? list.filter((command) => !blocked.test(command.id)) : list;
}

// Every word typed must appear in the title or keywords. A match at the start of the title ranks
// first, then the start of a word, then inside a word, then keywords; ties keep the list's order.
export function matchCommands(list, query) {
  const words = String(query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  if (!words.length) return [...list];
  const scored = [];
  list.forEach((command, index) => {
    const title = command.title.toLowerCase(),
      all = title + ' ' + (command.keywords || '');
    if (!words.every((word) => all.includes(word))) return;
    let score = 0;
    for (const word of words) {
      const at = title.indexOf(word);
      score += at < 0 ? 3 : at === 0 ? 0 : title[at - 1] === ' ' ? 1 : 2;
    }
    scored.push({ command, score, index });
  });
  return scored.sort((a, b) => a.score - b.score || a.index - b.index).map((entry) => entry.command);
}

// Shortcuts by name, so the help screen and the key handler cannot drift apart.
// `mod` is Command on a Mac and Control elsewhere. Workspaces use Control on a Mac and Alt elsewhere,
// because browsers keep Command/Control with a digit for their own tabs.
export const shortcuts = [
  { name: 'palette', does: 'Open the command palette', mac: '⌘K', other: 'Ctrl+K' },
  { name: 'workspace-1', does: 'Go to Chat', mac: '⌃1', other: 'Alt+1' },
  { name: 'workspace-2', does: 'Go to Today', mac: '⌃2', other: 'Alt+2' },
  { name: 'workspace-3', does: 'Go to Greenhouse', mac: '⌃3', other: 'Alt+3' },
  { name: 'split', does: 'Show or hide the second workspace', mac: '⌘\\', other: 'Ctrl+\\' },
  { name: 'send', does: 'Send the message you are writing', mac: '⌘Return', other: 'Ctrl+Enter' },
  { name: 'compose', does: 'Start writing a message', mac: '/', other: '/' },
  { name: 'help', does: 'Show these shortcuts', mac: '?', other: '?' },
];

export const shortcutLabel = (name, mac) => {
  const entry = shortcuts.find((shortcut) => shortcut.name === name);
  return entry ? (mac ? entry.mac : entry.other) : '';
};

// Which shortcut a key press means, or null. `typing` is true when focus is in a text field,
// where plain keys must stay ordinary typing.
export function shortcutFor(event, { mac = false, typing = false } = {}) {
  if (!event || event.isComposing || event.repeat) return null;
  const mod = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  const key = typeof event.key === 'string' ? event.key : '';
  if (mod && !event.altKey && !event.shiftKey) {
    if (key.toLowerCase() === 'k') return 'palette';
    if (key === '\\') return 'split';
    if (key === 'Enter') return typing ? 'send' : null;
    return null;
  }
  const workspaceModifier = mac
    ? event.ctrlKey && !event.metaKey && !event.altKey
    : event.altKey && !event.ctrlKey && !event.metaKey;
  if (workspaceModifier && !event.shiftKey) {
    const digit = /^Digit([123])$/.exec(event.code || '');
    return digit ? 'workspace-' + digit[1] : null;
  }
  if (typing || event.metaKey || event.ctrlKey || event.altKey) return null;
  if (key === '/') return 'compose';
  if (key === '?') return 'help';
  return null;
}
