// Which workspaces are on screen. Pure layout state: names and widths, never content.
// A wide screen shows two workspaces side by side and a very wide one three; a narrow one shows
// only the focused workspace, and the saved arrangement is kept for when there is room again.
// Harvest is the tray that gathers what conversations proposed and what came of it.
export const workspaces = ['chat', 'today', 'greenhouse', 'harvest'];
export const minimumSplitWidth = 1100;
export const threePaneWidth = 1500;
export const sizeLimits = { min: 0.18 };
// How many workspaces a window of this width shows at once.
export const capacityFor = (width) => (width >= threePaneWidth ? 3 : width >= minimumSplitWidth ? 2 : 1);
export const ratioLimits = { min: 0.3, max: 0.7 };
const storageKey = 'pea-workspace-v1';

const known = (name) => workspaces.includes(name);
const clampRatio = (value) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(ratioLimits.max, Math.max(ratioLimits.min, Math.round(value * 1000) / 1000))
    : 0.5;

const defaultSizes = [0.3, 0.4, 0.3];
// Three shares of the width that add up to one, none thinner than the limit.
function normalizeSizes(value) {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)
  )
    return [...defaultSizes];
  const floor = value.map((n) => Math.max(sizeLimits.min, n));
  const total = floor[0] + floor[1] + floor[2];
  const a = Math.round((floor[0] / total) * 1000) / 1000,
    b = Math.round((floor[1] / total) * 1000) / 1000;
  const c = Math.round((1 - a - b) * 1000) / 1000;
  return a < sizeLimits.min || b < sizeLimits.min || c < sizeLimits.min ? [...defaultSizes] : [a, b, c];
}

export const initialLayout = () => ({ panes: ['chat'], focus: 'chat', ratio: 0.5 });

// Accepts anything, such as stored text edited by hand, and returns a usable layout.
export function normalizeLayout(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.panes)) return initialLayout();
  const panes = [...new Set(value.panes.filter(known))].slice(0, 3);
  if (!panes.length) return initialLayout();
  const layout = {
    panes,
    focus: panes.includes(value.focus) ? value.focus : panes[0],
    ratio: clampRatio(value.ratio),
  };
  // Three panes carry their three widths, in the order of the panes.
  if (panes.length === 3) layout.sizes = normalizeSizes(value.sizes);
  return layout;
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
  return normalizeLayout({
    ...current,
    panes,
    focus: panes.includes(current.focus) ? current.focus : panes[0],
  });
}

// Bringing a workspace into the window beside what is there, and focusing it. With no room left
// it takes the place of the pane furthest from the focused one.
export function addPane(layout, name, capacity = 3) {
  const current = normalizeLayout(layout);
  if (!known(name)) return current;
  if (current.panes.includes(name)) return { ...current, focus: name };
  const room = Math.min(3, Math.max(1, Math.floor(capacity) || 1));
  if (room === 1) return openWorkspace(current, name);
  const panes = [...current.panes];
  const at = panes.indexOf(current.focus);
  if (panes.length < room) panes.splice(at + 1, 0, name);
  else {
    const others = panes.map((_, i) => i).filter((i) => i !== at);
    const victim = others.reduce((far, i) => (Math.abs(i - at) >= Math.abs(far - at) ? i : far), others[0]);
    panes[victim] = name;
    panes.length = room;
    if (!panes.includes(current.focus)) panes[0] = current.focus;
  }
  return normalizeLayout({ ...current, panes, focus: name });
}

// What pressing a workspace's chip does: bring it in when it is tucked up, focus it when it is
// open but not in use, and tuck it up when it is the one in use and another is open.
export function pressChip(layout, name, capacity = 3) {
  const current = normalizeLayout(layout);
  if (!known(name)) return current;
  if (!current.panes.includes(name)) return addPane(current, name, capacity);
  if (current.focus !== name) return { ...current, focus: name };
  return current.panes.length > 1 ? closePane(current, name) : current;
}

// Only this workspace, alone.
export function soloPane(layout, name) {
  const current = normalizeLayout(layout);
  return known(name) ? normalizeLayout({ ...current, panes: [name], focus: name }) : current;
}

// Moving a pane one place left (-1) or right (1). Its width travels with it.
export function movePane(layout, name, step) {
  const current = normalizeLayout(layout);
  const from = current.panes.indexOf(name),
    to = from + (step < 0 ? -1 : 1);
  if (from < 0 || to < 0 || to >= current.panes.length) return current;
  const panes = [...current.panes];
  [panes[from], panes[to]] = [panes[to], panes[from]];
  const next = { ...current, panes };
  if (current.sizes) {
    next.sizes = [...current.sizes];
    [next.sizes[from], next.sizes[to]] = [next.sizes[to], next.sizes[from]];
  }
  if (panes.length === 2) next.ratio = clampRatio(1 - current.ratio);
  return normalizeLayout(next);
}

// With three panes: dragging the first (0) or second (1) divider to a place across the window,
// given as a share of its width. Only the two panes beside that divider change.
export function resizeThree(layout, divider, position) {
  const current = normalizeLayout(layout);
  if (!current.sizes || typeof position !== 'number' || !Number.isFinite(position)) return current;
  const [a, b, c] = current.sizes,
    min = sizeLimits.min;
  let sizes;
  if (divider === 0) {
    const first = Math.min(a + b - min, Math.max(min, position));
    sizes = [first, a + b - first, c];
  } else if (divider === 1) {
    const second = Math.min(b + c - min, Math.max(min, position - a));
    sizes = [a, second, b + c - second];
  } else return current;
  return normalizeLayout({ ...current, sizes });
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
  const room = capacityFor(width);
  if (room >= current.panes.length) return current.panes;
  if (room === 1) return [current.focus];
  // Room for two of three: the focused pane and the one before it, or after it when it is first.
  const at = current.panes.indexOf(current.focus);
  return at === 0 ? current.panes.slice(0, 2) : current.panes.slice(at - 1, at + 1);
}

// The few short lines a tucked chip shows about its workspace. Whatever is passed in is flattened to
// one line each, cut to length, and capped; the rest is counted, not shown.
export function peekLines(lines, { limit = 4, length = 96 } = {}) {
  const clean = (Array.isArray(lines) ? lines : [])
    .map((line) => (typeof line === 'string' ? line.replace(/\s+/g, ' ').trim() : ''))
    .filter(Boolean)
    .map((line) => (line.length > length ? line.slice(0, length - 1).trimEnd() + '…' : line));
  if (clean.length <= limit) return clean;
  return [...clean.slice(0, limit - 1), `and ${clean.length - limit + 1} more`];
}

// Each profile keeps its own arrangement. Personal uses the first key, so an arrangement saved
// before profiles had their own carries on as Personal's.
const keyFor = (profile) =>
  profile === 'work' || profile === 'blended' ? `${storageKey}:${profile}` : storageKey;

// The arrangement saved for a profile, or null when there is none or it cannot be read.
export function savedLayout(storage = globalThis.localStorage, profile = 'personal') {
  try {
    const kept = storage.getItem(keyFor(profile));
    return kept ? normalizeLayout(JSON.parse(kept)) : null;
  } catch {
    return null;
  }
}

export function loadLayout(storage = globalThis.localStorage, profile = 'personal') {
  return savedLayout(storage, profile) ?? initialLayout();
}

// Returns false when the browser refuses storage; the layout then lasts for this tab only.
export function saveLayout(layout, storage = globalThis.localStorage, profile = 'personal') {
  try {
    storage.setItem(keyFor(profile), JSON.stringify(normalizeLayout(layout)));
    return true;
  } catch {
    return false;
  }
}
