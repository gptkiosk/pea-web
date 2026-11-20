// "Projects" on Today: what the owner's project engine (MCD or RCD) is building, read through this
// PEA's gateway, and a form that leaves a draft there after a review. Nothing here plans, approves,
// starts or pays for anything, nothing is asked unless the owner opens or presses something, and
// what the engine answers is shown as plain text and never given to a model.
import {
  describeDraft,
  draftAnswer,
  draftRequest,
  finishedReceipt,
  formatSeconds,
  projectFailure,
  projectFinished,
  projectList,
  projectStatus,
  projectTypes,
  stateLabel,
  storyCost,
  totalsLine,
} from './projects.mjs';

const $ = (id) => document.getElementById(id);

export function installProjects({ localKey, ask, review, isBusy, changed, drafted }) {
  // null: not asked yet. false: this server has no engine connection.
  let available = null,
    types = [],
    list = [],
    listed = false,
    selected = null,
    working = false,
    // The chat reply whose proposal filled the form, until that draft is sent or the form changes hands.
    source = null,
    asked = 0;
  const statuses = new Map();
  const say = (text, level = '') => {
    $('projects-note').textContent = text;
    $('projects-note').dataset.level = level;
  };
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  // One request at a time, as the gateway allows. Resolves with the engine's answer or null.
  async function call(body, { draft = false } = {}) {
    const key = localKey();
    if (!key || working) return null;
    working = true;
    render();
    try {
      const answer = await ask(key, body);
      if (answer.status === 200 && answer.body?.result && typeof answer.body.result === 'object')
        return answer.body.result;
      if (answer.status === 409) available = false;
      say(
        projectFailure(answer.status, answer.body?.reason) +
          (draft && answer.status === 502 && answer.body?.reason === 'failed'
            ? ' The draft may or may not have arrived. Look in the engine before sending it again.'
            : ''),
        'warn',
      );
    } catch {
      say(
        'PEA’s server could not be reached.' +
          (draft
            ? ' The draft may or may not have arrived. Look in the engine before sending it again.'
            : ''),
        'warn',
      );
    } finally {
      working = false;
      render();
    }
    return null;
  }

  function storyNode(story) {
    const item = el('li', 'project-story');
    item.dataset.state = story.state;
    item.append(el('strong', '', story.title), el('span', 'pill', stateLabel(story.state)));
    const who = [story.agent, story.model].filter(Boolean).join(' · ');
    item.append(
      el(
        'small',
        '',
        [
          who || 'No agent yet',
          story.seconds === null ? null : formatSeconds(story.seconds),
          storyCost(story),
        ]
          .filter(Boolean)
          .join(' · '),
      ),
    );
    if (story.waiting) item.append(el('small', 'project-waiting', 'Waiting for you in the engine'));
    return item;
  }

  function render() {
    const key = localKey();
    $('projects-count').textContent = !key
      ? 'Not connected'
      : available
        ? listed
          ? `${list.length} ${list.length === 1 ? 'project' : 'projects'}`
          : 'Connected'
        : available === false
          ? 'No engine'
          : 'Not checked';
    $('projects-status').textContent = !key
      ? 'Connect this PEA first: paste its server connection token under Local model.'
      : available === false
        ? 'This PEA server is not connected to a project engine, and PEA does not need one. MCD is an option that adds an agent project and assignment engine to your assistant. If you want it, install and start MCD, then in PEA for Mac choose Project Engine… in its menu and paste the address of your MCD server. Otherwise its operator connects one when the server starts; Self-hosting says how.'
        : available
          ? listed && !list.length
            ? 'The engine has no projects yet.'
            : ''
          : 'Open this card to see your projects.';
    $('projects-live').hidden = !key || !available;
    for (const id of ['projects-refresh', 'project-send']) $(id).disabled = working;
    $('projects-list').replaceChildren(
      ...list.map((project) => {
        const item = el('li');
        const open = el('button', 'text-button', project.title);
        open.type = 'button';
        open.disabled = working;
        open.setAttribute('aria-pressed', String(project.id === selected));
        open.onclick = () => void select(project.id);
        item.append(open, el('span', 'pill', stateLabel(project.state)));
        return item;
      }),
    );
    const status = statuses.get(selected);
    $('project-view').hidden = !status;
    if (status) {
      $('project-title').textContent = `${status.title} · ${stateLabel(status.state)}`;
      $('project-totals').textContent = status.stories.length
        ? totalsLine(status.totals)
        : 'No stories yet. A draft has none until you plan it in the engine.';
      $('project-stories').replaceChildren(...status.stories.map(storyNode));
    }
    const type = types.find((t) => t.id === $('project-type').value);
    $('project-type-summary').textContent = type?.summary ?? '';
    $('project-type-summary').hidden = !type?.summary;
  }

  function showTypes() {
    const chosen = $('project-type').value;
    const first = el('option', '', types.length ? 'Choose a template' : 'No templates offered');
    first.value = '';
    $('project-type').replaceChildren(
      first,
      ...types.map((t) => {
        const option = el('option', '', t.label);
        option.value = t.id;
        return option;
      }),
    );
    if (types.some((t) => t.id === chosen)) $('project-type').value = chosen;
  }

  // Asks this server whether it has an engine connection. Asks the engine nothing.
  async function connectionChanged() {
    const mine = ++asked,
      key = localKey();
    available = null;
    types = [];
    list = [];
    listed = false;
    selected = null;
    statuses.clear();
    say('');
    if (key) {
      try {
        const answer = await ask(key);
        if (mine !== asked) return;
        available = answer.status === 200 && answer.body?.available === true;
      } catch {
        if (mine !== asked) return;
        // Left as not checked.
      }
    }
    showTypes();
    render();
    changed();
    if (available && $('projects-section').open) void refresh();
  }

  // `keep` leaves the note as it is, for the refresh that follows a draft's confirmation.
  async function refresh({ keep = false } = {}) {
    if (!available || working) return;
    if (!keep) say('');
    if (!types.length) {
      const offered = await call({ action: 'types' });
      if (!offered) return;
      types = projectTypes(offered);
      showTypes();
    }
    const answer = await call({ action: 'list' });
    if (!answer) return;
    list = projectList(answer);
    listed = true;
    if (!list.some((p) => p.id === selected)) selected = null;
    render();
    changed();
    if (selected) await select(selected, { keep });
  }

  async function select(id, { keep = false } = {}) {
    if (working || !list.some((p) => p.id === id)) return;
    selected = id;
    if (!keep) say('');
    const answer = await call({ action: 'status', project: id });
    if (!answer) return render();
    const status = projectStatus(answer, id);
    if (!status) {
      say('The project engine’s answer was not about that project. Nothing is shown.', 'warn');
      return render();
    }
    statuses.set(id, status);
    // The list learns what the progress answer says, so a project that ended is known as ended.
    const row = list.find((p) => p.id === id);
    if (row) row.state = status.state;
    render();
    changed();
  }

  async function send() {
    if (working) return;
    if (isBusy()) return say('Finish the current request first.', 'warn');
    const request = draftRequest({
      type: $('project-type').value,
      title: $('project-new-title').value,
      brief: $('project-brief').value,
      constraints: $('project-constraints').value,
    });
    if (request.error) return say(request.error, 'warn');
    const from = source,
      label = types.find((t) => t.id === request.body.type)?.label;
    if (!(await review('Leave this draft in your project engine?', describeDraft(request.body, label))))
      return say('Not sent. Nothing left this browser.');
    const answer = await call(request.body, { draft: true });
    if (!answer) return;
    const made = draftAnswer(answer);
    const text = made
      ? `Drafted in your project engine: ${made.title || request.body.title} (project ${made.id})`
      : `Drafted in your project engine: ${request.body.title}`;
    say(text + '. Plan and approve it in the engine’s own pages; nothing has started.', 'ok');
    for (const id of ['project-new-title', 'project-brief', 'project-constraints']) $(id).value = '';
    $('project-type').value = '';
    source = null;
    if (from) drafted(from, text);
    render();
    await refresh({ keep: true });
    if (made && list.some((p) => p.id === made.id)) await select(made.id, { keep: true });
  }

  // A reviewed chat proposal fills the form. It sends nothing; the owner still chooses a template.
  function fill(proposal, from) {
    $('project-new-title').value = proposal.title;
    $('project-brief').value = proposal.brief;
    $('project-constraints').value = proposal.constraints;
    source = from;
    $('projects-section').open = true;
    say(
      'Filled in from PEA’s suggestion. Choose a template, change anything you like, then review the draft.',
    );
    render();
    if (available && !listed) void refresh();
    $('project-type').focus();
  }

  // Projects that ended, for Harvest. Only what this page has already been shown.
  const receipts = () =>
    list
      .filter((p) => projectFinished(p.state))
      .map((p) => ({ id: p.id, text: finishedReceipt(p, statuses.get(p.id)) }));

  $('projects-refresh').onclick = () => void refresh();
  $('project-send').onclick = () => void send();
  $('project-type').onchange = render;
  // Opening the card is the owner asking to see their projects.
  $('projects-section').addEventListener('toggle', () => {
    if ($('projects-section').open && available && !listed) void refresh();
  });
  render();
  return {
    connectionChanged,
    refresh,
    fill,
    receipts,
    available: () => available === true,
    show(id) {
      $('projects-section').open = true;
      if (id) void select(id);
    },
  };
}
