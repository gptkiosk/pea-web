// Takes the owner to a place in PEA's settings. On a wide screen a panel opened this way sits
// beside the workspace, so the chat stays in use while the owner follows along; on a narrow one it
// opens over the page as it always has. It only opens, scrolls and marks a section. It reads no
// field, fills none, approves nothing and grants nothing.
import { placeInAddress, sectionsOf, settingsPlace } from './settings.mjs';

const $ = (id) => document.getElementById(id);
export const besideWidth = 1180;
let wantBeside = false,
  here = null;

// Opens one of the settings panels. Every opener calls this, so a panel that is already open
// beside the page is left as it is and never opened twice.
let whenShown = () => {},
  revealGroup = () => {};
// Shows one section of Connections at once, for a control that opens it and then uses a field.
export const reveal = (group) => revealGroup(group);
export function present(dialog) {
  const beside = wantBeside;
  wantBeside = false;
  whenShown(dialog);
  if (dialog.open) {
    if (beside || dialog.classList.contains('beside')) return;
    dialog.close();
  }
  if (beside) {
    for (const other of document.querySelectorAll('dialog.beside')) if (other !== dialog) other.close();
    dialog.classList.add('beside');
    document.body.classList.add('settings-beside');
    dialog.show();
  } else dialog.showModal();
}

// Long explanations are cut to two lines with a "More" button, once. Nothing is removed: the
// whole text is one press away, and every review still shows what it always showed.
function shorten(dialog) {
  for (const text of dialog.querySelectorAll('.dialog-body p, .dialog-body small')) {
    if (text.dataset.shortened || text.id || text.closest('.guided-connection, [aria-live]')) continue;
    text.dataset.shortened = '1';
    if (text.textContent.trim().length < 150 || text.querySelector('input, select, textarea, code, a[href]'))
      continue;
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'text-button settings-more';
    more.textContent = 'More';
    more.setAttribute('aria-expanded', 'false');
    more.onclick = () => {
      const open = text.classList.toggle('settings-whole');
      more.textContent = open ? 'Less' : 'More';
      more.setAttribute('aria-expanded', String(open));
    };
    text.classList.add('settings-short');
    text.after(more);
  }
}

// `openers` gives, for each panel, the function that draws and opens it; `tab(name)` goes to a
// workspace. Returns { go(id), open() }.
// The windows that open on a home of big tiles: its tile list, its way back and its title.
const tiled = [
  { dialog: 'connections', home: 'settings-home', back: 'settings-back', title: 'connections-title' },
  { dialog: 'library', home: 'library-home', back: 'library-back', title: 'library-title' },
  { dialog: 'preferences', home: 'preferences-home', back: 'preferences-back', title: 'preferences-title' },
];

export function installSettings({ openers, tab, notice, status = () => '' }) {
  // Each of these windows opens on a home of big tiles, one per section. Choosing one shows that
  // section alone, with a way back. A section some other control opens is shown the same way.
  const panels = new Map();
  for (const spec of tiled) {
    const panel = $(spec.dialog),
      home = $(spec.home),
      heading = $(spec.title),
      name = heading.textContent,
      sections = sectionsOf(spec.dialog);
    panel.classList.add('tiled');
    const showHome = () => {
      delete panel.dataset.section;
      for (const [, place] of sections) {
        $(place.group).classList.remove('settings-focus');
        $(place.group).open = false;
      }
      heading.textContent = name;
      home.replaceChildren(
        ...sections
          // A section the page has put away (for the other profile, say) gets no tile.
          .filter(([, place]) => spec.dialog === 'connections' || !$(place.group).hidden)
          .map(([id, place]) => {
            const tile = document.createElement('button'),
              glyph = document.createElement('span'),
              title = document.createElement('strong'),
              what = document.createElement('small'),
              state = status(id);
            tile.type = 'button';
            tile.className = 'settings-tile';
            tile.setAttribute('role', 'listitem');
            tile.dataset.place = id;
            glyph.className = 'settings-glyph';
            glyph.setAttribute('aria-hidden', 'true');
            glyph.textContent = place.glyph;
            title.textContent = place.title;
            what.textContent = place.what;
            tile.append(glyph, title, what);
            if (state) {
              const badge = document.createElement('span');
              badge.className = 'settings-state';
              badge.textContent = state;
              tile.append(badge);
            }
            tile.onclick = () => showSection(id);
            return tile;
          }),
      );
    };
    const showSection = (id) => {
      const place = settingsPlace(id);
      for (const [, other] of sections) $(other.group).classList.toggle('settings-focus', other === place);
      panel.dataset.section = id;
      heading.textContent = place.title;
      if (spec.dialog === 'connections') $(place.group).hidden = false;
      $(place.group).open = true;
      panel.querySelector('.dialog-body')?.scrollTo?.(0, 0);
      panel.scrollTo?.(0, 0);
    };
    $(spec.back).onclick = showHome;
    for (const [id, place] of sections)
      $(place.group).addEventListener('toggle', () => {
        if ($(place.group).open && panel.dataset.section !== id) showSection(id);
      });
    panel.addEventListener('close', showHome);
    showHome();
    panels.set(spec.dialog, { panel, sections, showHome, showSection });
  }
  $('guided-all').addEventListener('click', panels.get('connections').showHome);
  whenShown = (dialog) => {
    const tiles = panels.get(dialog.id);
    if (tiles && !dialog.open) tiles.showHome();
    shorten(dialog);
  };
  revealGroup = (group) => {
    for (const tiles of panels.values()) {
      const found = tiles.sections.find(([, place]) => $(place.group) === group);
      if (found) tiles.showSection(found[0]);
    }
  };
  // A button inside one window that leads to a place in another: this window closes first.
  for (const button of document.querySelectorAll('[data-go]'))
    button.onclick = () => {
      button.closest('dialog')?.close();
      go(button.dataset.go);
    };
  for (const id of ['interview', 'chat-export-dialog']) shorten($(id));
  for (const name of Object.keys(openers))
    $(name).addEventListener('close', () => {
      $(name).classList.remove('beside');
      if (!document.querySelector('dialog.beside[open]')) document.body.classList.remove('settings-beside');
      if (here?.dialog === name) here = null;
    });
  function go(id) {
    const place = settingsPlace(id);
    if (!place) return false;
    // A review or another question over the page comes first.
    if ([...document.querySelectorAll('dialog[open]')].some((d) => d.matches(':modal'))) {
      notice('Finish what is open first, then try again.');
      return false;
    }
    if (place.tab) tab(place.tab);
    if (place.dialog) {
      wantBeside = globalThis.innerWidth >= besideWidth;
      openers[place.dialog]();
      wantBeside = false;
    }
    const group = place.group ? $(place.group) : null,
      tiles = panels.get(place.dialog);
    if (tiles) place.group ? tiles.showSection(id) : tiles.showHome();
    if (group) {
      if (!tiles || place.dialog === 'connections') group.hidden = false;
      if ('open' in group) group.open = true;
      // After the panel has been laid out, so the section is at the top of what is seen.
      requestAnimationFrame(() => group.scrollIntoView({ block: 'start' }));
      for (const marked of document.querySelectorAll('.settings-here'))
        marked.classList.remove('settings-here');
      group.classList.add('settings-here');
      setTimeout(() => group.classList.remove('settings-here'), 6000);
      (group.querySelector('summary') ?? group).focus?.({ preventScroll: true });
    }
    here = { id, dialog: place.dialog ?? null };
    return true;
  }
  const fromAddress = () => {
    const id = placeInAddress(location.hash);
    if (id) go(id);
  };
  globalThis.addEventListener('hashchange', fromAddress);
  return {
    go,
    fromAddress,
    // The place whose panel is open beside the page now, or null.
    open: () =>
      here?.dialog && $(here.dialog).open && $(here.dialog).classList.contains('beside') ? here.id : null,
  };
}
