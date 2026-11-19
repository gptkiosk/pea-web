// "Update this copy" in the Versions & updates window: look for an update to the installed copy
// and, after a review that names the exact version, ask PEA's own gateway to install it. The page chooses nothing about
// where an update comes from, and a model has no way to reach any of this.
import {
  describeOffer,
  describeOutcome,
  describeStatus,
  describeUpdate,
  updateOffer,
  updateStatus,
} from './updates.mjs';

const $ = (id) => document.getElementById(id);

export function installUpdates({ localKey, ask, review, isBusy }) {
  let status = { available: false },
    offer = null,
    working = false,
    watching = 0,
    // Set while the person is away in Connections pasting the token, so they are brought back.
    returning = false;
  const say = (text, level = '') => {
    $('update-note').textContent = text;
    $('update-note').dataset.level = level;
  };

  function render() {
    const key = localKey();
    $('update-status').textContent = key
      ? describeStatus(status)
      : 'To check for an update and install it from here, connect this PEA first: paste its server connection token under Local model. Tick Remember this token on this browser there, and this is not needed again after a reload.';
    $('release-update-open').hidden = Boolean(key);
    $('update-check').hidden = !key || !status.available;
    $('update-check').disabled = working;
    const target = offer && !offer.upToDate ? offer.target : null;
    $('update-apply').hidden = !target || !status.available;
    $('update-apply').disabled = working;
    $('update-apply').textContent = target ? `Update to ${target.version}…` : '';
    $('update-found').textContent = offer ? describeOffer(offer) : '';
    $('update-reload').hidden = !$('update-reload').dataset.ready;
  }
  // Asks the gateway what it can do. Quiet when it cannot be reached.
  async function refresh() {
    offer = null;
    status = { available: false };
    const key = localKey();
    if (key) {
      try {
        const answer = await ask(key);
        if (answer.status === 200) status = updateStatus(answer.body);
      } catch {
        // Shown as not available.
      }
    }
    if (status.available && status.operation && !watching) {
      const outcome = describeOutcome(status.operation);
      if (outcome.done && outcome.level === 'warn') say(outcome.text, outcome.level);
    }
    render();
    if (returning && key) {
      returning = false;
      if ($('connections').open) $('connections').close();
      if (!$('release-dialog').open) $('release-dialog').showModal();
    }
  }
  // The Versions window was opened: ask afresh, unless an update is under way.
  function opened() {
    if (working || watching) return render();
    void refresh();
  }
  async function check() {
    if (working) return;
    working = true;
    offer = null;
    render();
    say('Looking for an update…');
    try {
      const answer = await ask(localKey(), { action: 'check' });
      if (answer.status === 200 && (offer = updateOffer(answer.body))) say('');
      else
        say(
          typeof answer.body?.error === 'string'
            ? answer.body.error.slice(0, 400)
            : 'The check did not complete. Nothing was changed.',
          'warn',
        );
    } catch {
      say('PEA’s gateway could not be reached. Nothing was changed.', 'warn');
    } finally {
      working = false;
      render();
    }
  }
  // After an update starts, PEA restarts. Keep asking until it says how the update went.
  async function watch(target, since) {
    const mine = ++watching;
    for (let attempt = 0; attempt < 120 && mine === watching; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      try {
        const answer = await ask(localKey());
        const now = answer.status === 200 ? updateStatus(answer.body) : null;
        const op = now?.operation;
        if (op && op.at * 1000 >= since - 5000 && op.outcome !== 'started') {
          status = now;
          const outcome = describeOutcome(op);
          const landed = op.outcome === 'succeeded' && now.installed?.commit === target.commit;
          say(
            op.outcome === 'succeeded' && !landed
              ? 'PEA says the update finished, but it is not reporting the new version. Check again.'
              : outcome.text,
            landed ? 'ok' : 'warn',
          );
          if (landed) $('update-reload').dataset.ready = '1';
          offer = null;
          watching = 0;
          return render();
        }
        say(`Updating to ${target.version}… PEA is working on it.`);
      } catch {
        say(`Updating to ${target.version}… PEA is restarting; this page will reconnect by itself.`);
      }
    }
    if (mine === watching) {
      watching = 0;
      say(
        'PEA has not said how the update went. Check the machine it runs on; the update command’s record is in its private updates folder.',
        'warn',
      );
      render();
    }
  }
  async function apply() {
    const target = offer && !offer.upToDate ? offer.target : null;
    if (!target || working) return;
    if (isBusy()) return say('Finish the current request first. An update restarts PEA.', 'warn');
    if (!(await review(`Update PEA to ${target.version}?`, describeUpdate(offer, location.origin))))
      return say('Not updated. Nothing was changed.');
    working = true;
    render();
    const since = Date.now();
    try {
      const answer = await ask(localKey(), { action: 'apply', commit: target.commit });
      if (answer.status !== 202) {
        offer = null;
        return say(
          typeof answer.body?.error === 'string'
            ? answer.body.error.slice(0, 400)
            : 'The update did not start. Nothing was changed.',
          'warn',
        );
      }
      say(`Updating to ${target.version}… PEA will restart.`);
      void watch(target, since);
    } catch {
      say('PEA’s gateway could not be reached. Nothing was changed.', 'warn');
    } finally {
      working = false;
      render();
    }
  }

  $('update-check').onclick = () => void check();
  $('update-apply').onclick = () => void apply();
  $('update-reload').onclick = () => location.reload();
  // The token is entered in one place only, under Local model. Go there, and come back here
  // once it is connected.
  $('release-update-open').onclick = () => {
    $('release-dialog').close();
    // The same control the guided setup uses to open every setting at once.
    $('collab-config').click();
    returning = true;
    const group = $('local-group');
    group.open = true;
    group.scrollIntoView({ block: 'start' });
    $('local-token').focus();
  };
  $('connections').addEventListener('close', () => (returning = false));
  // Opening Connections any other way is a fresh visit. A dialog's close event arrives a moment
  // after it closes, so it alone would leave a reopened Connections still marked as the trip.
  for (const id of ['connections-open', 'collab-config'])
    $(id).addEventListener('click', () => (returning = false));
  $('updates-open-versions').onclick = () => {
    $('connections').close();
    $('releases-open').click();
  };
  for (const id of ['releases-open', 'changelog-open']) $(id).addEventListener('click', opened);
  render();
  return { render, refresh };
}
