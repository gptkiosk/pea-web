// "Update this copy" in the Versions & updates window: look for an update to the installed copy
// and, after a review that names the exact version, ask PEA's own gateway to install it. The page chooses nothing about
// where an update comes from, and a model has no way to reach any of this.
import { reveal } from './settings-ui.mjs';
import { gatherSettings, travellingSettings } from './backup.mjs';
import {
  describeGoingBack,
  describeOffer,
  describeOutcome,
  describeSettingsCheck,
  describeStatus,
  describeUpdate,
  settingsMarks,
  updateOffer,
  updateSteps,
  updateStatus,
  wayBack,
} from './updates.mjs';

const $ = (id) => document.getElementById(id);

export function installUpdates({ localKey, ask, review, isBusy, notice }) {
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
  // What is under way: { title, op, lost }, drawn as a bar, a list of steps and a log.
  let progress = null;
  function draw() {
    const box = $('update-progress'),
      op = progress?.op ?? (status.available ? status.operation : null);
    box.hidden = !progress;
    if (progress) {
      const view = updateSteps(progress.op, progress.lost);
      $('update-progress-title').textContent = progress.title;
      $('update-bar').value = view.value;
      box.dataset.failed = view.failed ? '1' : '';
      $('update-steps').replaceChildren(
        ...view.steps.map((step) => {
          const item = document.createElement('li');
          item.dataset.state = step.state;
          item.textContent = step.label;
          if (step.state === 'now') item.setAttribute('aria-current', 'step');
          return item;
        }),
      );
    }
    const lines = op?.log ?? [];
    $('update-log-box').hidden = !lines.length;
    $('update-log').replaceChildren(
      ...lines.map((entry) => {
        const item = document.createElement('li'),
          when = document.createElement('time');
        when.textContent = new Date(entry.at * 1000).toLocaleTimeString();
        item.append(when, ' ' + entry.text);
        return item;
      }),
    );
  }
  // Before an update the saved settings are noted; after the reload they are checked against it.
  const checkKey = 'pea-update-check-v1',
    labels = new Map(travellingSettings);
  function noteSettings(to) {
    try {
      globalThis.localStorage.setItem(
        checkKey,
        JSON.stringify({ to, page: performance.timeOrigin, marks: settingsMarks(gatherSettings().settings) }),
      );
    } catch {
      // A browser that refuses storage has no settings to check.
    }
  }
  function checkSettings() {
    let kept = null;
    try {
      kept = JSON.parse(globalThis.localStorage.getItem(checkKey) || 'null');
      // The page that noted them is still open: the check is for the next load.
      if (!kept || kept.page === performance.timeOrigin) return;
      globalThis.localStorage.removeItem(checkKey);
    } catch {
      return;
    }
    const text = describeSettingsCheck(kept, settingsMarks(gatherSettings().settings), labels);
    $('update-settings').textContent = text;
    $('update-settings').hidden = !text;
    if (text) notice?.(text);
  }

  function render() {
    const key = localKey();
    $('update-status').textContent = key
      ? describeStatus(status)
      : 'To check for an update and install it from here, connect this PEA first: paste its server connection token under Local model. Tick Remember this token on this browser there, and this is not needed again after a reload.';
    $('release-update-open').hidden = Boolean(key);
    $('update-check').hidden = !key || !status.available || Boolean(watching);
    $('update-check').disabled = working;
    $('update-check').textContent = offer ? 'Check again' : 'Check for updates';
    // Where this copy cannot update itself, looking at published releases is the main thing to do.
    $('release-check').className = key && !status.available ? 'primary' : 'text-button';
    const target = offer && !offer.upToDate ? offer.target : null;
    $('update-apply').hidden = !target || !status.available || Boolean(watching);
    $('update-apply').disabled = working;
    $('update-apply').textContent = target ? `Update to ${target.version}…` : '';
    $('update-found').textContent = offer ? describeOffer(offer) : '';
    // One reload button at a time: the out-of-date notice above has its own.
    $('update-reload').hidden = !$('update-reload').dataset.ready || !$('release-stale').hidden;
    // After an update from here, the version it replaced is one reviewed step away.
    const back = key && !watching ? wayBack(status) : null;
    $('update-back').hidden = !back;
    $('update-back').disabled = working;
    $('update-back').textContent = back ? `Go back to ${back.version}…` : '';
    draw();
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
  async function watch(target, since, back = false) {
    const mine = ++watching,
      doing = back ? 'Going back' : 'Updating';
    progress = { title: `${doing} to ${target.version}`, op: null, lost: false };
    draw();
    for (let attempt = 0; attempt < 120 && mine === watching; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      try {
        const answer = await ask(localKey());
        // Something in front of PEA, such as a private-network proxy, answers for it while it is down.
        if (answer.status >= 500) throw new Error('restarting');
        const now = answer.status === 200 ? updateStatus(answer.body) : null;
        const op = now?.operation;
        const ours = op && op.at * 1000 >= since - 5000;
        progress = { ...progress, op: ours ? op : progress.op, lost: false };
        // A go-back that was refused leaves the update's own record in place, with the reason.
        if (back && op && !ours && op.noteAt * 1000 >= since - 5000) {
          status = now;
          progress = null;
          watching = 0;
          say(`Did not go back. ${op.note}`, 'warn');
          return render();
        }
        if (ours && op.outcome !== 'started') {
          status = now;
          const outcome = describeOutcome(op);
          const landed = op.outcome === 'succeeded' && now.installed?.commit === target.commit;
          say(
            op.outcome === 'succeeded' && !landed
              ? 'PEA says it finished, but it is not reporting that version. Check again.'
              : outcome.text,
            landed ? 'ok' : 'warn',
          );
          progress = { ...progress, title: landed ? `${back ? 'Went back' : 'Updated'} to ${target.version}` : `${doing} to ${target.version} did not go through` };
          if (landed) {
            $('update-reload').dataset.ready = '1';
            document.dispatchEvent(new Event('pea-updated'));
          }
          offer = null;
          watching = 0;
          return render();
        }
        say(`${doing} to ${target.version}… PEA is working on it.`);
        draw();
      } catch {
        progress = { ...progress, lost: true };
        say(`${doing} to ${target.version}… PEA is restarting; this page will reconnect by itself.`);
        draw();
      }
    }
    if (mine === watching) {
      watching = 0;
      progress = null;
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
    if (
      !(await review(`Update PEA to ${target.version}?`, describeUpdate(offer, location.origin), {
        prose: true,
      }))
    )
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
      noteSettings(target.version);
      say(`Updating to ${target.version}… PEA will restart.`);
      void watch(target, since);
    } catch {
      say('PEA’s gateway could not be reached. Nothing was changed.', 'warn');
    } finally {
      working = false;
      render();
    }
  }

  async function goBack() {
    const back = wayBack(status);
    if (!back || working || watching) return;
    if (isBusy()) return say('Finish the current request first. Going back restarts PEA.', 'warn');
    if (
      !(await review(`Go back to ${back.version}?`, describeGoingBack(back, location.origin), { prose: true }))
    )
      return say('Not changed. You are still on ' + back.from + '.');
    working = true;
    render();
    const since = Date.now();
    try {
      const answer = await ask(localKey(), { action: 'rollback', commit: back.commit });
      if (answer.status !== 202)
        return say(
          typeof answer.body?.error === 'string'
            ? answer.body.error.slice(0, 400)
            : 'Going back did not start. Nothing was changed.',
          'warn',
        );
      noteSettings(back.version);
      say(`Going back to ${back.version}… PEA will restart.`);
      void watch(back, since, true);
    } catch {
      say('PEA’s gateway could not be reached. Nothing was changed.', 'warn');
    } finally {
      working = false;
      render();
    }
  }
  $('update-back').onclick = () => void goBack();
  // The backup file is made in one place, under Settings.
  $('update-backup').onclick = () => {
    $('release-dialog').close();
    $('collab-config').click();
    const group = $('full-backup-group');
    reveal(group);
    group.open = true;
    group.scrollIntoView({ block: 'start' });
    $('full-pass').focus();
  };
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
    reveal(group);
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
  document.addEventListener('pea-stale', render);
  checkSettings();
  render();
  return { render, refresh };
}
