// Draws a list of what PEA did: one line per step with an icon, a turning last line while PEA
// waits, and one summary line to fold it under. Open while PEA works and when something went
// wrong; folded once it is done, unless the owner opened it.
import {
  activityIcons,
  trailActive,
  trailRows,
  trailSummary,
  workActive,
  workRows,
  workSummary,
} from './activity.mjs';

function icon(name) {
  const NS = 'http://www.w3.org/2000/svg',
    svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'activity-icon');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of activityIcons[name] ?? activityIcons.check) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

// `record` is the trail or work itself: the owner's choice to open or fold it is kept on it,
// because the page redraws these lists as the work goes on.
function box(record, rows, summaryText, state) {
  const node = document.createElement('details');
  node.className = 'activity';
  node.dataset.state = state;
  node.open = record.open ?? state !== 'done';
  const summary = document.createElement('summary');
  summary.textContent = summaryText;
  summary.onclick = () => {
    record.open = !node.open;
  };
  const list = document.createElement('ul');
  for (const row of rows) {
    const item = document.createElement('li');
    item.dataset.state = row.state;
    if (row.state === 'active') {
      const spinner = document.createElement('span');
      spinner.className = 'activity-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      item.append(spinner);
    } else item.append(icon(row.icon));
    const words = document.createElement('span');
    words.textContent = row.text;
    item.append(words);
    list.append(item);
  }
  node.append(summary, list);
  return node;
}

// The list over a conversation reply.
export const trailBox = (trail) =>
  box(trail, trailRows(trail), trailSummary(trail), trailActive(trail) ? 'active' : trail.outcome);
// The list for other approved work: a page read, a picture, a document.
export const workBox = (work) =>
  box(work, workRows(work), workSummary(work), workActive(work) ? 'active' : work.outcome);
// Puts a work list in its own place on the page, or empties and hides that place.
export function showWork(place, work) {
  place.hidden = !work;
  place.replaceChildren(...(work ? [workBox(work)] : []));
}
