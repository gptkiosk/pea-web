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
    // Text that belongs to a window's home takes its button with it when a section is open.
    if (text.classList.contains('home-only')) more.classList.add('home-only');
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
  // The guided setup: the sections Settings already has, one at a time, in the order a new owner
  // needs them, with what is known about each. It opens and shows; it reads no key, fills no
  // field and connects nothing. Every step can be skipped.
  const connections = panels.get('connections'),
    picked = (id) => $(id).selectedOptions[0]?.textContent.trim() ?? '',
    text = (id) => $(id).textContent.trim();
  let at = -1,
    route = 'local-model',
    watching = 0;
  const steps = [
    {
      id: 'model',
      title: 'Connect a model',
      hint: 'Use a model on this machine, or your own OpenRouter key.',
      place: () => route,
      done: () => [...$('chat-model').options].some((o) => o.value),
      state: (done) => (done ? status('models') || 'Connected' : 'Not connected'),
    },
    {
      id: 'areas',
      title: 'Choose your models',
      hint: 'One for Chat, and one for each kind of Greenhouse work.',
      place: () => 'models',
      done: () => Boolean($('chat-model').value),
      state: (done) => (done ? 'Chat: ' + picked('chat-model') : 'No Chat model yet'),
    },
    {
      id: 'voice',
      title: 'Voice',
      hint: 'Your device already reads aloud. Add a provider voice if you like.',
      place: () => 'voices',
      done: () => text('provider-voice-status').startsWith('Read aloud uses'),
      state: (done) => (done ? picked('provider-voice') + ' voice' : 'Device voice'),
    },
    {
      id: 'search',
      title: 'Web search',
      hint: 'Let Chat look things up with your own search key.',
      place: () => 'web-search',
      done: () => status('web-search') === 'Key entered',
      state: (done) => (done ? 'Key entered' : 'No key'),
    },
    {
      id: 'google',
      title: 'Google',
      hint: 'Calendar, Gmail, and a Drive folder for your Docs.',
      place: () => 'google',
      done: () => status('google') === 'Connected',
      state: (done) => (done ? 'Connected' : 'Not connected'),
    },
    {
      id: 'sources',
      title: 'Knowledge sources',
      hint: 'Follow shows PEA can talk about with you.',
      place: () => null,
      done: () => !/^off\b/i.test(text('curated-status')),
      state: (done) => (done ? text('curated-peek') || 'On' : 'Off'),
    },
  ];
  function drawStep() {
    if (at < 0) return;
    const step = steps[at],
      done = step.done(),
      last = at === steps.length - 1,
      line = (done ? '✓ ' : '') + step.state(done);
    // Written only when it changes, so a screen reader hears each state once.
    if ($('setup-state').textContent !== line) $('setup-state').textContent = line;
    $('setup-state').dataset.done = String(done);
    $('setup-next').textContent = last ? 'Finish' : done ? 'Next →' : 'Skip →';
    $('setup-next').classList.toggle('primary', done || last);
    $('setup-next').classList.toggle('text-button', !done && !last);
    [...$('setup-track').children].forEach((dot, i) => {
      dot.dataset.done = String(steps[i].done());
      dot.dataset.here = String(i === at);
    });
    if (step.id === 'sources') {
      $('setup-sources-state').textContent = done
        ? 'Knowledge sources are on. ' + text('curated-peek')
        : 'Knowledge sources are off. Browsing asks before it fetches the list of shows.';
      $('setup-sources-open').textContent = done ? 'Open knowledge sources' : 'Browse shows';
    }
  }
  function showStep(index) {
    const { panel } = connections,
      step = steps[index];
    if (!panel.open) openers.connections();
    if (!panel.open) return;
    at = index;
    if (step.id === 'model' && index === 0 && status('local-model') !== 'Connected' && steps[0].done())
      route = 'models';
    const place = step.place();
    if (place) connections.showSection(place);
    else {
      connections.showHome();
      panel.dataset.section = 'setup';
    }
    panel.dataset.setup = step.id;
    $('connections-title').textContent = 'Set up PEA';
    $('guided-connection').hidden = $('setup-nav').hidden = false;
    $('setup-sources').hidden = step.id !== 'sources';
    $('setup-count').textContent = `Step ${index + 1} of ${steps.length}`;
    $('guided-title').textContent = step.title;
    $('guided-description').textContent = step.hint;
    $('setup-switch').hidden = step.id !== 'model';
    for (const button of $('setup-switch').children)
      button.setAttribute('aria-pressed', String(button.dataset.route === route));
    $('setup-track').replaceChildren(...steps.map(() => document.createElement('i')));
    $('guided-back').textContent = index ? '← Back' : '← Overview';
    drawStep();
    clearInterval(watching);
    // Connecting happens in the section's own controls; this only notices that it did.
    watching = setInterval(drawStep, 500);
    panel.querySelector('.dialog-body')?.scrollTo?.(0, 0);
    $('guided-title').focus?.();
  }
  function endSetup() {
    if (at < 0) return;
    at = -1;
    clearInterval(watching);
    delete connections.panel.dataset.setup;
    $('guided-connection').hidden = $('setup-nav').hidden = $('setup-sources').hidden = true;
  }
  function setup() {
    if ([...document.querySelectorAll('dialog[open]')].some((d) => d.matches(':modal'))) {
      notice('Finish what is open first, then try again.');
      return;
    }
    const states = steps.map((step) => step.done()),
      count = states.filter(Boolean).length,
      next = states.indexOf(false);
    $('setup-steps').replaceChildren(
      ...steps.map((step, i) => {
        const row = document.createElement('button'),
          mark = document.createElement('span'),
          words = document.createElement('span'),
          title = document.createElement('strong'),
          state = document.createElement('small'),
          arrow = document.createElement('span');
        row.type = 'button';
        row.className = 'setup-step';
        row.setAttribute('role', 'listitem');
        row.dataset.step = step.id;
        row.dataset.done = String(states[i]);
        mark.className = 'setup-mark';
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = states[i] ? '✓' : String(i + 1);
        title.textContent = step.title;
        state.textContent = step.state(states[i]);
        words.append(title, state);
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '→';
        row.append(mark, words, arrow);
        row.onclick = () => {
          $('setup-wizard').close();
          showStep(i);
        };
        return row;
      }),
    );
    $('setup-summary').textContent = count
      ? `${count} of ${steps.length} set up.`
      : `${steps.length} short steps. Skip any of them.`;
    $('setup-start').textContent = !count ? 'Start' : next < 0 ? 'Go through again' : 'Continue';
    $('setup-start').onclick = () => {
      $('setup-wizard').close();
      showStep(Math.max(next, 0));
    };
    $('setup-wizard').showModal();
  }
  $('setup-all').onclick = () => {
    $('setup-wizard').close();
    openers.connections();
  };
  $('guided-back').onclick = () => {
    if (at > 0) return showStep(at - 1);
    // Ended here, not only when the window's close event arrives: that comes a moment later.
    endSetup();
    connections.panel.close();
    setup();
  };
  $('setup-next').onclick = () => {
    if (at < steps.length - 1) return showStep(at + 1);
    endSetup();
    connections.panel.close();
    setup();
  };
  for (const button of $('setup-switch').children)
    button.onclick = () => {
      route = button.dataset.route;
      showStep(at);
    };
  $('setup-sources-open').onclick = () => {
    const off = !steps.at(-1).done();
    endSetup();
    connections.panel.close();
    if (go('curated-sources') && off) $('curated-browse').click();
  };
  $('guided-all').addEventListener('click', () => {
    endSetup();
    connections.showHome();
  });
  connections.panel.addEventListener('close', endSetup);
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
    endSetup();
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
    setup,
    fromAddress,
    // The place whose panel is open beside the page now, or null.
    open: () =>
      here?.dialog && $(here.dialog).open && $(here.dialog).classList.contains('beside') ? here.id : null,
  };
}
