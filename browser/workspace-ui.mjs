// Draws the workspace layout: one workspace on a narrow screen, two side by side on a wide one and
// three on a very wide one. Each workspace has a chip in the top bar that brings it in, focuses it
// or tucks it up.
// It only shows, hides and sizes the existing panels. It never reads their content, approves a review
// or grants anything, and the saved layout holds workspace names and a width only.
import {
  addPane,
  capacityFor,
  closePane,
  focusPane,
  loadLayout,
  minimumSplitWidth,
  movePane,
  openBeside,
  openWorkspace,
  partnerFor,
  pressChip,
  resizeSplit,
  resizeThree,
  saveLayout,
  soloPane,
  swapPanes,
  threePaneWidth,
  visiblePanes,
  workspaces,
} from './workspace.mjs';

const titles = { chat: 'Chat', today: 'Today', greenhouse: 'Greenhouse', harvest: 'Harvest' };
const $ = (id) => document.getElementById(id);

export function installWorkspace({ onFocus, onShow = () => {}, canChange = () => true }) {
  const wide = globalThis.matchMedia(`(min-width: ${minimumSplitWidth}px)`),
    wider = globalThis.matchMedia(`(min-width: ${threePaneWidth}px)`);
  // The width the layout rules are asked about: a tier, not the exact window.
  const tier = () => (wider.matches ? threePaneWidth : wide.matches ? minimumSplitWidth : 0);
  const panes = $('panes'),
    dividers = [$('pane-divider'), $('pane-divider-2')],
    divider = dividers[0],
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
      label.title = 'Drag to move this pane';
      // With three panes a pane moves one place at a time; with two, Swap sides does it.
      const mover = (text, step) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'text-button pane-move';
        button.textContent = text;
        button.setAttribute('aria-label', `Move ${titles[name]} ${step < 0 ? 'left' : 'right'}`);
        button.onclick = () => set(movePane(layout, name, step));
        return button;
      };
      const left = mover('←', -1),
        right = mover('→', 1);
      const swap = document.createElement('button');
      swap.type = 'button';
      swap.className = 'text-button';
      swap.textContent = 'Swap sides';
      swap.onclick = () => set(swapPanes(layout));
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'text-button';
      // Its chip in the top bar stays, dashed, and brings the pane back.
      close.textContent = 'Tuck up';
      close.setAttribute('aria-label', `Close ${titles[name]} pane`);
      close.onclick = () => set(closePane(layout, name));
      bar.append(label, left, right, swap, close);
      $(name).prepend(bar);
      // Dragging a pane by its name moves it past its neighbours.
      label.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        try {
          label.setPointerCapture(event.pointerId);
        } catch {
          // No such pointer to hold on to; the drag still works while it stays over the name.
        }
        const move = (e) => {
          const order = visiblePanes(layout, tier());
          const over = order.find((other) => {
            const box = $(other).getBoundingClientRect();
            return e.clientX >= box.left && e.clientX <= box.right;
          });
          if (!over || over === name) return;
          // One place at a time, until it sits where the pointer is.
          const places = order.indexOf(over) - order.indexOf(name);
          let next = layout;
          for (let n = 0; n < Math.abs(places); n++) next = movePane(next, name, places);
          set(next, { save: false });
        };
        const done = () => {
          label.removeEventListener('pointermove', move);
          saveLayout(layout);
        };
        label.addEventListener('pointermove', move);
        label.addEventListener('pointerup', done, { once: true });
        label.addEventListener('pointercancel', done, { once: true });
      });
      return [name, { bar, left, right, swap }];
    }),
  );

  let showing = [];
  function render() {
    const shown = visiblePanes(layout, tier());
    const count = shown.length,
      split = count >= 2;
    for (const name of workspaces) {
      const panel = $(name),
        index = shown.indexOf(name),
        parts = bars[name];
      panel.hidden = index < 0;
      panel.classList.toggle('active', index >= 0);
      panel.classList.toggle('pane-focus', split && name === layout.focus);
      panel.style.order = index < 0 ? '' : String(index * 2 + 1);
      parts.bar.hidden = !split;
      parts.swap.hidden = count !== 2;
      parts.left.hidden = parts.right.hidden = count !== 3;
      parts.left.disabled = index <= 0;
      parts.right.disabled = index === count - 1;
    }
    panes.classList.toggle('split', split);
    const share = (n) => `minmax(0, ${Math.round(n * 1000) / 1000}fr)`;
    panes.style.gridTemplateColumns =
      count === 3
        ? `${share(layout.sizes[0])} 14px ${share(layout.sizes[1])} 14px ${share(layout.sizes[2])}`
        : split
          ? `${share(layout.ratio)} 14px ${share(1 - layout.ratio)}`
          : '';
    dividers[0].hidden = !split;
    dividers[1].hidden = count !== 3;
    dividers[0].setAttribute(
      'aria-valuenow',
      String(Math.round((count === 3 ? layout.sizes[0] : layout.ratio) * 100)),
    );
    if (count === 3)
      dividers[1].setAttribute(
        'aria-valuenow',
        String(Math.round((layout.sizes[0] + layout.sizes[1]) * 100)),
      );
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
    // A workspace that has just come into the window is told, so it can draw what is current.
    const now = visiblePanes(layout, tier());
    for (const name of now) if (!showing.includes(name)) onShow(name);
    showing = now;
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
      layout.panes.length === 3
        ? soloPane(layout, layout.focus)
        : layout.panes.length === 2
          ? closePane(layout, partnerFor(layout))
          : openBeside(layout, partnerFor(layout)),
    );

  // Shift-click (or Alt-click) on a tab puts that workspace beside the current one.
  document.querySelector('[role=tablist]').addEventListener(
    'click',
    (event) => {
      const button = event.target.closest?.('[data-tab]');
      // On a narrow screen a chip is a tab: the page's own handler changes workspace.
      if (!button || !wide.matches) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      set(
        event.shiftKey || event.altKey
          ? openBeside(layout, button.dataset.tab)
          : pressChip(layout, button.dataset.tab, capacityFor(tier())),
      );
    },
    true,
  );
  // Pressing a chip twice quickly leaves that workspace alone in the window.
  document.querySelector('[role=tablist]').addEventListener('dblclick', (event) => {
    const button = event.target.closest?.('[data-tab]');
    if (button && wide.matches) set(soloPane(layout, button.dataset.tab));
  });

  // Working in a pane makes it the focused workspace.
  for (const name of workspaces) {
    const claim = () => {
      if (layout.focus !== name && layout.panes.includes(name)) set(focusPane(layout, name));
    };
    $(name).addEventListener('pointerdown', claim);
    $(name).addEventListener('focusin', claim);
  }

  // Each divider drags with a pointer and moves with the arrow keys. With three panes it changes
  // only the two panes beside it.
  dividers.forEach((bar, index) => {
    const place = (position) =>
      layout.sizes ? resizeThree(layout, index, position) : resizeSplit(layout, position);
    const here = () => (layout.sizes ? layout.sizes[0] + (index ? layout.sizes[1] : 0) : layout.ratio);
    bar.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      bar.setPointerCapture(event.pointerId);
      const move = (e) => {
        const box = panes.getBoundingClientRect();
        if (box.width > 0) set(place((e.clientX - box.left) / box.width), { save: false });
      };
      const done = () => {
        bar.removeEventListener('pointermove', move);
        saveLayout(layout);
      };
      bar.addEventListener('pointermove', move);
      bar.addEventListener('pointerup', done, { once: true });
      bar.addEventListener('pointercancel', done, { once: true });
    });
    bar.addEventListener('keydown', (event) => {
      const step = { ArrowLeft: -0.02, ArrowRight: 0.02 }[event.key];
      if (step) set(place(here() + step));
      else if (event.key === 'Home') set(place(0));
      else if (event.key === 'End') set(place(1));
      else return;
      event.preventDefault();
    });
  });

  wide.addEventListener('change', render);
  wider.addEventListener('change', render);

  return {
    go: (name) => set(openWorkspace(layout, name)),
    beside: (name) => (wide.matches ? set(openBeside(layout, name)) : set(openWorkspace(layout, name))),
    close: (name) => set(closePane(layout, name)),
    toggle: () => toggle.click(),
    swap: () => set(swapPanes(layout)),
    press: (name) => set(pressChip(layout, name, capacityFor(tier()))),
    add: (name) => set(addPane(layout, name, capacityFor(tier()))),
    move: (name, step) => set(movePane(layout, name, step)),
    solo: (name) => set(soloPane(layout, name)),
    wide: () => wide.matches,
    layout: () => ({ ...layout, panes: [...layout.panes] }),
    shown: () => visiblePanes(layout, tier()),
    render,
  };
}
