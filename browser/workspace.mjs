// Which workspaces are on screen. Pure layout state: names and a width, never content.
// On a wide screen two workspaces can sit side by side; on a narrow one only the focused
// workspace is shown and the saved pair is kept for when there is room again.
export const workspaces = ['chat', 'today', 'greenhouse'];
export const minimumSplitWidth = 1100;
export const ratioLimits = { min: 0.3, max: 0.7 };
const storageKey = 'pea-workspace-v1';

const known = (name) => workspaces.includes(name);
const clampRatio = (value) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(ratioLimits.max, Math.max(ratioLimits.min, Math.round(value * 1000) / 1000))
    : 0.5;

export const initialLayout = () => ({ panes: ['chat'], focus: 'chat', ratio: 0.5 });

// Accepts anything, such as stored text edited by hand, and returns a usable layout.
export function normalizeLayout(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.panes)) return initialLayout();
  const panes = [...new Set(value.panes.filter(known))].slice(0, 2);
  if (!panes.length) return initialLayout();
  return {
    panes,
    focus: panes.includes(value.focus) ? value.focus : panes[0],
    ratio: clampRatio(value.ratio),
  };
}

// Going to a workspace: focus it if it is already on screen, otherwise it takes the focused pane's place.
export function openWorkspace(layout, name) {
  const current = normalizeLayout(layout);
  if (!known(name)) return current;
  if (current.panes.includes(name)) return { ...current, focus: name };
  return {
    ...current,
    panes: current.panes.map((pane) => (pane === current.focus ? name : pane)),
    focus: name,
  };
}

// Putting a workspace beside the focused one. The focused workspace stays on the left and keeps focus.
export function openBeside(layout, name) {
  const current = normalizeLayout(layout);
  if (!known(name) || name === current.focus) return current;
  return { ...current, panes: [current.focus, name] };
}

// Closing a pane leaves the other one, focused. The last pane cannot be closed.
export function closePane(layout, name) {
  const current = normalizeLayout(layout);
  if (current.panes.length < 2 || !current.panes.includes(name)) return current;
  const panes = current.panes.filter((pane) => pane !== name);
  return { ...current, panes, focus: panes[0] };
}

export function focusPane(layout, name) {
  const current = normalizeLayout(layout);
  return current.panes.includes(name) ? { ...current, focus: name } : current;
}

export function swapPanes(layout) {
  const current = normalizeLayout(layout);
  return current.panes.length === 2 ? { ...current, panes: [current.panes[1], current.panes[0]] } : current;
}

export function resizeSplit(layout, ratio) {
  const current = normalizeLayout(layout);
  return { ...current, ratio: clampRatio(ratio) };
}

// The workspace a split would add: the most useful partner for the one in focus.
export function partnerFor(layout) {
  const current = normalizeLayout(layout);
  if (current.panes.length === 2) return current.panes.find((pane) => pane !== current.focus);
  return current.focus === 'chat' ? 'today' : 'chat';
}

// What is actually drawn. Below the minimum width only the focused workspace shows.
export function visiblePanes(layout, width) {
  const current = normalizeLayout(layout);
  return width >= minimumSplitWidth ? current.panes : [current.focus];
}

export function loadLayout(storage = globalThis.localStorage) {
  try {
    return normalizeLayout(JSON.parse(storage.getItem(storageKey) || 'null'));
  } catch {
    return initialLayout();
  }
}

// Returns false when the browser refuses storage; the layout then lasts for this tab only.
export function saveLayout(layout, storage = globalThis.localStorage) {
  try {
    storage.setItem(storageKey, JSON.stringify(normalizeLayout(layout)));
    return true;
  } catch {
    return false;
  }
}
