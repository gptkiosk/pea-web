// Takes the owner to a place in PEA's settings. On a wide screen a panel opened this way sits
// beside the workspace, so the chat stays in use while the owner follows along; on a narrow one it
// opens over the page as it always has. It only opens, scrolls and marks a section. It reads no
// field, fills none, approves nothing and grants nothing.
import { placeInAddress, settingsPlace } from './settings.mjs';

const $ = (id) => document.getElementById(id);
export const besideWidth = 1180;
let wantBeside = false,
  here = null;

// Opens one of the settings panels. Every opener calls this, so a panel that is already open
// beside the page is left as it is and never opened twice.
export function present(dialog) {
  const beside = wantBeside;
  wantBeside = false;
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

// `openers` gives, for each panel, the function that draws and opens it; `tab(name)` goes to a
// workspace. Returns { go(id), open() }.
export function installSettings({ openers, tab, notice }) {
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
    const group = place.group ? $(place.group) : null;
    if (group) {
      group.hidden = false;
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
