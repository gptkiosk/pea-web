// Draws the workspace layout: one workspace on a narrow screen, up to two side by side on a wide one.
// It only shows, hides and sizes the existing panels. It never reads their content, approves a review
// or grants anything, and the saved layout holds workspace names and a width only.
import {
  closePane,
  focusPane,
  loadLayout,
  minimumSplitWidth,
  openBeside,
  openWorkspace,
  partnerFor,
  resizeSplit,
  saveLayout,
  swapPanes,
  visiblePanes,
  workspaces,
} from './workspace.mjs';

const titles = { chat: 'Chat', today: 'Today', greenhouse: 'Greenhouse' };
const $ = (id) => document.getElementById(id);

export function installWorkspace({ onFocus, canChange = () => true }) {
  const wide = globalThis.matchMedia(`(min-width: ${minimumSplitWidth}px)`);
  const panes = $('panes'),
    divider = $('pane-divider'),
    toggle = $('split-toggle');
  let layout = loadLayout();
  let focused = null;

  // Each panel gets a small bar, shown only while two workspaces are side by side.
  const bars = Object.fromEntries(
    workspaces.map((name) => {
      const bar = document.createElement('div');
      bar.className = 'pane-bar';
      bar.hidden = true;
      const label = document.createElement('strong');
      label.textContent = titles[name];
      const swap = document.createElement('button');
      swap.type = 'button';
      swap.className = 'text-button';
      swap.textContent = 'Swap sides';
      swap.onclick = () => set(swapPanes(layout));
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'text-button';
      close.textContent = 'Close';
      close.setAttribute('aria-label', `Close ${titles[name]} pane`);
      close.onclick = () => set(closePane(layout, name));
      bar.append(label, swap, close);
      $(name).prepend(bar);
      return [name, bar];
    }),
  );

  function render() {
    const shown = visiblePanes(layout, wide.matches ? minimumSplitWidth : 0);
    const split = shown.length === 2;
    for (const name of workspaces) {
      const panel = $(name),
        index = shown.indexOf(name);
      panel.hidden = index < 0;
      panel.classList.toggle('active', index >= 0);
      panel.classList.toggle('pane-focus', split && name === layout.focus);
      panel.style.order = index < 0 ? '' : String(index * 2 + 1);
      bars[name].hidden = !split;
    }
    panes.classList.toggle('split', split);
    panes.style.gridTemplateColumns = split
      ? `minmax(0, ${layout.ratio}fr) 14px minmax(0, ${Math.round((1 - layout.ratio) * 1000) / 1000}fr)`
      : '';
    divider.hidden = !split;
    divider.setAttribute('aria-valuenow', String(Math.round(layout.ratio * 100)));
    for (const button of document.querySelectorAll('[data-tab]')) {
      const chosen = button.dataset.tab === layout.focus;
      button.classList.toggle('selected', chosen);
      button.classList.toggle('beside', !chosen && shown.includes(button.dataset.tab));
      button.setAttribute('aria-selected', String(chosen));
      button.tabIndex = chosen ? 0 : -1;
    }
    toggle.setAttribute('aria-pressed', String(split));
    toggle.setAttribute(
      'aria-label',
      split ? 'Return to one workspace' : `Show ${titles[partnerFor(layout)]} beside ${titles[layout.focus]}`,
    );
    toggle.title = toggle.getAttribute('aria-label') + ' (Shift-click a tab to choose)';
    $('page-title').textContent = titles[layout.focus];
    const changed = focused !== layout.focus;
    focused = layout.focus;
    onFocus(layout.focus, changed);
  }

  function set(next, { save = true } = {}) {
    if (!canChange()) return false;
    layout = next;
    if (save) saveLayout(layout);
    render();
    return true;
  }

  toggle.onclick = () =>
    set(
      layout.panes.length === 2
        ? closePane(layout, partnerFor(layout))
        : openBeside(layout, partnerFor(layout)),
    );

  // Shift-click (or Alt-click) on a tab puts that workspace beside the current one.
  document.querySelector('[role=tablist]').addEventListener(
    'click',
    (event) => {
      const button = event.target.closest?.('[data-tab]');
      if (!button || !(event.shiftKey || event.altKey) || !wide.matches) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      set(openBeside(layout, button.dataset.tab));
    },
    true,
  );

  // Working in a pane makes it the focused workspace.
  for (const name of workspaces) {
    const claim = () => {
      if (layout.focus !== name && layout.panes.includes(name)) set(focusPane(layout, name));
    };
    $(name).addEventListener('pointerdown', claim);
    $(name).addEventListener('focusin', claim);
  }

  // The divider drags with a pointer and moves with the arrow keys.
  divider.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    divider.setPointerCapture(event.pointerId);
    const move = (e) => {
      const box = panes.getBoundingClientRect();
      if (box.width > 0) set(resizeSplit(layout, (e.clientX - box.left) / box.width), { save: false });
    };
    const done = () => {
      divider.removeEventListener('pointermove', move);
      saveLayout(layout);
    };
    divider.addEventListener('pointermove', move);
    divider.addEventListener('pointerup', done, { once: true });
    divider.addEventListener('pointercancel', done, { once: true });
  });
  divider.addEventListener('keydown', (event) => {
    const step = { ArrowLeft: -0.02, ArrowRight: 0.02 }[event.key];
    if (step) set(resizeSplit(layout, layout.ratio + step));
    else if (event.key === 'Home') set(resizeSplit(layout, 0));
    else if (event.key === 'End') set(resizeSplit(layout, 1));
    else return;
    event.preventDefault();
  });

  wide.addEventListener('change', render);

  return {
    go: (name) => set(openWorkspace(layout, name)),
    beside: (name) => (wide.matches ? set(openBeside(layout, name)) : set(openWorkspace(layout, name))),
    close: (name) => set(closePane(layout, name)),
    toggle: () => toggle.click(),
    swap: () => set(swapPanes(layout)),
    wide: () => wide.matches,
    layout: () => ({ ...layout, panes: [...layout.panes] }),
    shown: () => visiblePanes(layout, wide.matches ? minimumSplitWidth : 0),
    render,
  };
}
