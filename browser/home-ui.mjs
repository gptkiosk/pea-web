// The summary card at the top of Today. It only repeats what the cards below already show, so it
// asks nothing of anyone. Each line opens the card it came from.
import { homeLines } from './home.mjs';

const $ = (id) => document.getElementById(id);

export function installHome({ weather, event, todos, headlines }) {
  let waiting = false;
  function draw() {
    waiting = false;
    const lines = homeLines({
      weather: weather(),
      event: event(),
      todos: todos(),
      headlines: headlines(),
      now: Date.now(),
    });
    $('home-empty').hidden = lines.length > 0;
    $('home-lines').replaceChildren(
      ...lines.map((line) => {
        const row = document.createElement('li'),
          button = document.createElement('button'),
          kind = document.createElement('span'),
          text = document.createElement('span');
        button.type = 'button';
        button.className = 'home-line';
        kind.className = 'home-kind';
        kind.textContent = line.kind;
        text.textContent = line.detail ? `${line.text} (${line.detail})` : line.text;
        button.append(kind, text);
        button.onclick = () => {
          const card = $(line.target);
          card.open = true;
          card.scrollIntoView({ block: 'start', behavior: 'auto' });
          card.querySelector('summary').focus({ preventScroll: true });
        };
        row.append(button);
        return row;
      }),
    );
  }
  // Several cards may change in one moment; the summary is drawn once after them.
  const render = () => {
    if (waiting) return;
    waiting = true;
    queueMicrotask(draw);
  };
  render();
  return { render };
}
