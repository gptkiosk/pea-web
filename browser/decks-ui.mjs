// "Deck projects" in Greenhouse. The owner's model drafts an outline and then the slides, each in
// one request the owner reviews first and reads before anything is kept. The owner edits every
// slide and downloads the deck as one file. Work and Personal each have their own projects, kept
// in this browser; nothing is created in any account.
import {
  deckBrief,
  deckFileName,
  deckHTML,
  deckLimits,
  deckTitle,
  deckWritten,
  describeOutline,
  describeOutlineRequest,
  describeSlides,
  describeSlidesRequest,
  editedSlide,
  outlinePrompt,
  outlineRequest,
  parseOutline,
  parseSlides,
  slideCount,
  slidesPrompt,
  slidesRequest,
  validSavedDecks,
} from './decks.mjs';

const $ = (id) => document.getElementById(id);
const storageKey = 'pea-decks-v1';

export function installDecks({ profile, review, run, compose, isBusy }) {
  let decks = [],
    open = null,
    working = false;
  try {
    decks = validSavedDecks(JSON.parse(globalThis.localStorage.getItem(storageKey) || 'null'));
  } catch {
    // Nothing usable was saved; there are no projects.
  }
  const store = () => {
    try {
      if (decks.length) globalThis.localStorage.setItem(storageKey, JSON.stringify(decks));
      else globalThis.localStorage.removeItem(storageKey);
    } catch {
      // Private browsing may refuse storage; the projects then last for this tab.
    }
  };
  const say = (text) => ($('decks-note').textContent = text);
  const usable = () => ['work', 'personal'].includes(profile());
  const mine = () => decks.filter((d) => d.profile === profile());
  const current = () => mine().find((d) => d.id === open) ?? null;
  const touch = (deck) => {
    deck.changed = Date.now();
    store();
  };
  const button = (text, onclick, kind = 'text-button') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = kind;
    b.textContent = text;
    b.onclick = onclick;
    return b;
  };
  const field = (label, control) => {
    const wrap = document.createElement('label');
    wrap.append(label, control);
    return wrap;
  };

  function slideEditor(deck, slide, index) {
    const box = document.createElement('fieldset'),
      legend = document.createElement('legend'),
      title = document.createElement('input'),
      bullets = document.createElement('textarea'),
      notes = document.createElement('textarea'),
      row = document.createElement('div');
    box.className = 'deck-slide';
    legend.textContent = `Slide ${index + 1}`;
    title.value = slide.title;
    title.maxLength = deckLimits.title;
    bullets.rows = 4;
    bullets.value = slide.bullets.join('\n');
    bullets.placeholder = slide.purpose ? 'Not written yet. Purpose: ' + slide.purpose : 'One point per line';
    notes.rows = 2;
    notes.value = slide.notes;
    notes.maxLength = deckLimits.notes;
    row.className = 'filters';
    row.append(
      button('Save slide', () => {
        const result = editedSlide(slide, { title: title.value, bullets: bullets.value, notes: notes.value });
        if (!result.slide) return say(result.why + ' Nothing was changed.');
        deck.slides[index] = result.slide;
        touch(deck);
        render();
        say(`Slide ${index + 1} saved.`);
      }),
      button('Delete slide', () => {
        if (deck.slides.length <= deckLimits.slidesMin)
          return say(`A deck keeps at least ${deckLimits.slidesMin} slides. Nothing was deleted.`);
        deck.slides.splice(index, 1);
        touch(deck);
        render();
        say('Slide deleted.');
      }),
    );
    box.append(
      legend,
      field('Title', title),
      field('Points, one per line', bullets),
      field('Speaker notes', notes),
      row,
    );
    return box;
  }

  function render() {
    const on = usable(),
      list = on ? mine() : [],
      deck = on ? current() : null;
    if (!deck) open = null;
    $('decks-status').textContent = !on
      ? 'Deck projects belong to Work or Personal. Choose one of those profiles.'
      : list.length
        ? `${list.length} ${list.length === 1 ? 'project' : 'projects'} in this profile, kept in this browser without encryption.`
        : 'No deck projects yet. Nothing is sent until you review a request.';
    for (const id of ['deck-title', 'deck-brief', 'deck-count', 'deck-outline'])
      $(id).disabled = !on || working;
    $('decks-list').replaceChildren(
      ...list.map((d) => {
        const item = document.createElement('li'),
          words = document.createElement('span');
        words.textContent = `${d.title} · ${d.slides.length} slides · ${deckWritten(d) ? 'written' : 'outline only'}`;
        item.append(
          words,
          button(d.id === open ? 'Close' : 'Open', () => {
            open = d.id === open ? null : d.id;
            render();
            say('');
          }),
          button('Delete', async () => {
            if (working) return;
            if (
              !(await review(
                'Delete this deck project?',
                `“${d.title}”, ${d.slides.length} slides, is deleted from this browser. A file you already downloaded is not affected. This cannot be undone.`,
              ))
            )
              return;
            decks = decks.filter((x) => x !== d);
            store();
            render();
            say('Deck project deleted.');
          }),
        );
        item.firstChild.after(' ');
        return item;
      }),
    );
    $('deck-editor').hidden = !deck;
    if (!deck) return $('deck-slides').replaceChildren();
    const written = deckWritten(deck);
    $('deck-editor-title').textContent = deck.title;
    $('deck-write').textContent = written
      ? 'Rewrite the slides with your model…'
      : 'Write the slides with your model…';
    $('deck-write').disabled = working;
    const link = $('deck-download');
    link.hidden = !written;
    if (written) {
      link.download = deckFileName(deck.title);
      link.href = 'data:text/html;charset=utf-8,' + encodeURIComponent(deckHTML(deck));
    } else link.removeAttribute('href');
    $('deck-hint').textContent = written
      ? 'The file opens in any browser: scroll or press Space to move between slides, and print it to make a PDF. Speaker notes show on screen and are left out of print.'
      : 'This deck is an outline. Write the slides with your model, or type the points yourself and save each slide; the file is offered once every slide has a point.';
    $('deck-slides').replaceChildren(...deck.slides.map((s, i) => slideEditor(deck, s, i)));
  }

  async function outline() {
    if (working || isBusy()) return say('Finish the current request first.');
    if (!usable()) return say('Choose Work or Personal first.');
    const who = profile(),
      title = deckTitle($('deck-title').value),
      brief = deckBrief($('deck-brief').value),
      count = slideCount($('deck-count').value);
    if (!title) return say(`Give the deck a title of at most ${deckLimits.title} characters.`);
    if (!brief)
      return say(
        `Say in a few sentences what the deck is for and who will see it (at most ${deckLimits.brief} characters).`,
      );
    if (!count) return say('Choose how many slides.');
    if (mine().length >= deckLimits.projects)
      return say(`This profile already has ${deckLimits.projects} deck projects. Delete one first.`);
    working = true;
    render();
    try {
      say('Waiting for your review…');
      const result = await run(() =>
        compose({
          title: 'Ask your model for a deck outline?',
          about: describeOutlineRequest({ title, count }),
          system: outlinePrompt({ title, brief, count }),
          user: outlineRequest,
        }),
      );
      if (!result?.started) return say('No outline was written. Nothing was kept.');
      if (who !== profile()) return say('Profile changed. Nothing was kept.');
      const slides = parseOutline(result.text, count);
      if (!slides)
        return say(
          'Your model’s reply was not a usable outline, so nothing was kept. You can try again; each try is one request.',
        );
      if (!(await review('Keep this outline?', describeOutline(slides))))
        return say('Not kept. The outline your model wrote was discarded.');
      if (who !== profile()) return say('Profile changed. Nothing was kept.');
      const deck = {
        id: 'deck-' + crypto.randomUUID().replace(/-/g, '').slice(0, 20),
        profile: who,
        title,
        brief,
        changed: Date.now(),
        slides: slides.map((s) => ({ ...s, bullets: [], notes: '' })),
      };
      decks.push(deck);
      store();
      open = deck.id;
      $('deck-title').value = $('deck-brief').value = '';
      say(`Outline kept: ${slides.length} slides. Rename or delete slides below, then write them.`);
    } finally {
      working = false;
      render();
    }
  }

  async function write() {
    const deck = current();
    if (!deck) return;
    if (working || isBusy()) return say('Finish the current request first.');
    const who = profile(),
      replacing = deck.slides.some((s) => s.bullets.length),
      asked = deck.slides.map((s) => ({
        title: s.title,
        purpose: s.purpose || 'Decide what this slide must get across.',
      }));
    working = true;
    render();
    try {
      say('Waiting for your review…');
      const result = await run(() =>
        compose({
          title: 'Ask your model to write the slides?',
          about: describeSlidesRequest({ title: deck.title, count: asked.length, replacing }),
          system: slidesPrompt({ title: deck.title, brief: deck.brief, outline: asked }),
          user: slidesRequest,
        }),
      );
      if (!result?.started) return say('No slides were written. Nothing was changed.');
      if (who !== profile() || !decks.includes(deck))
        return say('The project or profile changed. Nothing was kept.');
      const slides = parseSlides(result.text, asked);
      if (!slides)
        return say(
          'Your model’s reply did not give usable points for every slide, so nothing was changed. You can try again; each try is one request.',
        );
      if (
        !(await review(
          replacing ? 'Replace the slides with these?' : 'Keep these slides?',
          describeSlides(slides),
        ))
      )
        return say('Not kept. The slides your model wrote were discarded.');
      if (who !== profile() || !decks.includes(deck))
        return say('The project or profile changed. Nothing was kept.');
      // Titles and purposes stay the owner's; only points and notes are taken.
      deck.slides = deck.slides.map((s, i) => ({ ...s, bullets: slides[i].bullets, notes: slides[i].notes }));
      touch(deck);
      say('Slides kept. Read and edit each one, then download the deck.');
    } finally {
      working = false;
      render();
    }
  }

  $('deck-outline').onclick = () => void outline();
  $('deck-write').onclick = () => void write();
  render();
  return { render };
}
