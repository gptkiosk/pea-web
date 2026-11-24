import {
  storyGuidance,
  emailGuidance,
  calendarGuidance,
  calendarEditGuidance,
  navigationGuidance,
} from './actions.mjs';
import { presenceAt } from './presence.mjs';
import { docGuidance, docHTML, docPlain, docSummary } from './documents.mjs';
import { openGuidance } from './handoff.mjs';
import { choiceGuidance } from './choices.mjs';
import { pointsGuidance } from './numbered.mjs';
import { lookupGuidance, papersGuidance, readGuidance, searchGuidance } from './research.mjs';
import { assistantName, honestyRule, nameLine } from './honesty.mjs';
import { canonContext } from './canon.mjs';
import { describeLife, lifeContext, styleRule } from './life.mjs';
import { toldContext } from './memory.mjs';
import { dayKey, noteGuidance } from './days.mjs';
import { beginWork, contextSteps, endWork, took, workStep, workWaiting } from './activity.mjs';
import { showWork } from './activity-ui.mjs';
import {
  Services,
  ServiceError,
  safeName,
  containsCredential,
  driveScope,
  knownPrice,
  validCode,
  validRepo,
  madeByPEA,
  labelledPEA,
  matchModels,
} from './connections.mjs';
import { parseConfiguration } from './shared-config.mjs';
import { present } from './settings-ui.mjs';
import { settingsGuidance, settingsOpenLine } from './settings.mjs';
import { sourcesLine } from './shownav.mjs';
import { LocalModel } from './local-model.mjs';
import { forgetChoices, loadChoices, profileChoices, saveChoices } from './preferences.mjs';
import { forgetLocalToken, loadLocalToken, saveLocalToken } from './local-token.mjs';
const $ = (id) => document.getElementById(id);
const calendarScope = 'https://www.googleapis.com/auth/calendar.events.readonly',
  // See and change events on calendars the owner owns: the narrowest permission Google offers that
  // can add to the main calendar. Asked for only when the owner ticks the box for it.
  calendarWriteScope = 'https://www.googleapis.com/auth/calendar.events.owned',
  mailScope = 'https://www.googleapis.com/auth/gmail.readonly';
export function installConnections(hooks) {
  const service = new Services(),
    local = new LocalModel(),
    sessions = new Map(),
    selectedCleanup = new Set();
  let operationActive = false,
    controller = null,
    currentAttachment = null,
    // What PEA did for the latest picture in this tab: { profile, trail }.
    pictureWork = null,
    nonce = 0,
    draftForm = false,
    imageCatalog = [],
    previewURL = null,
    generatedURL = null;
  const p = () => hooks.profile();
  // Choices remembered on this browser. Keys and tokens are never part of them.
  let choices = loadChoices();
  const state = () => {
    const profile = p();
    if (!sessions.has(profile))
      sessions.set(profile, {
        models: [],
        localModels: [],
        localKey: '',
        key: '',
        image: '',
        ...profileChoices(choices.profiles[profile]),
        google: null,
        workspace: null,
        roots: [],
        github: null,
        // The document PEA last wrote for this profile in this tab: its text, and its Drive file if one was made.
        currentDoc: null,
        // Agreeing that a provider may retain or train on data is asked again in every tab.
        allowData: false,
        calendar: [],
        // The coming events PEA added for this profile, each with the short ref a model is given.
        ownEvents: [],
        mail: [],
        scheduleAt: 0,
        approvals: new Set(),
        artifacts: [],
      });
    return sessions.get(profile);
  };
  // Writes down the choices of every profile used in this tab, and the Google boxes. Called after
  // each change of a choice; what it saves is the fixed list in preferences.mjs and nothing else.
  function remember() {
    for (const [name, s] of sessions) choices.profiles[name] = profileChoices(s);
    choices.google = {
      client: $('google-client').value.trim(),
      calendar: $('google-calendar-access').checked,
      write: $('google-calendar-write').checked,
      mail: $('google-mail-access').checked,
    };
    saveChoices(choices);
    choices = loadChoices();
  }
  function note(s) {
    $('connection-note').textContent = s;
    hooks.notice(s);
  }
  function busy(on) {
    $('profile').disabled = on;
    $('greenhouse-role').disabled = on;
    document
      .querySelectorAll('#connections button,#connections input,#connections select')
      .forEach((b) => (b.disabled = on));
    for (const id of [
      'router-connect',
      'google-connect',
      'drive-refresh',
      'collab-send',
      'github-connect',
      'cleanup',
      'confirm-created',
      'draft-create',
    ])
      $(id).disabled = on;
  }
  function stop() {
    if (operationActive && !controller) {
      note(
        'An approved cloud operation may still complete. Wait for its result before changing profiles or retrying.',
      );
      return;
    }
    nonce++;
    controller?.abort();
    controller = null;
    if (!operationActive) busy(false);
  }
  function modelID(s, surface) {
    return surface === 'chat' ? s.chat : s[s.role];
  }
  // The one local model, when this server lists exactly one and Chat has none chosen.
  function onlyLocalModel(s = state()) {
    return s.localKey && !s.chat && s.localModels.length === 1 ? s.localModels[0] : null;
  }
  function render() {
    const s = state(),
      all = [...s.localModels, ...s.models],
      found = new Set(matchModels(all, $('model-filter').value));
    // A short list needs no filter.
    $('model-filter-row').hidden = all.length <= 8;
    if (all.length <= 8) $('model-filter').value = '';
    $('model-filter-count').textContent = $('model-filter').value.trim()
      ? found.size
        ? `${found.size} of ${all.length} models match`
        : `No model matches. ${all.length} are loaded.`
      : `${all.length} models loaded`;
    const only = onlyLocalModel(s);
    for (const button of document.querySelectorAll('.use-only-model')) {
      button.hidden = !only;
      button.textContent = only ? `Use ${only.name} for Chat` : '';
    }
    for (const [id, key] of [
      ['chat-model', 'chat'],
      ['collaboration-model', 'collaboration'],
      ['coding-model', 'coding'],
    ]) {
      const select = $(id);
      select.replaceChildren(
        new Option(key === 'chat' ? 'Choose a Chat model' : 'Not configured', ''),
        // What is typed in "Find a model" narrows every list; a model already chosen always stays.
        ...all
          .filter((m) => found.has(m) || m.id === s[key])
          .map(
            (m) =>
              new Option(
                `${m.local ? 'Local · ' : 'OpenRouter · '}${m.name} ${m.prompt === 0 && m.completion === 0 && m.request === 0 ? '· free' : '· API billing'}`,
                m.id,
              ),
          ),
      );
      select.value = s[key];
    }
    $('image-model').value = s.image;
    $('github-repo').value = s.github?.repo ?? s.githubRepo;
    $('allow-data').checked = s.allowData;
    $('share-calendar').checked = s.shareCalendar;
    $('share-mail').checked = s.shareMail;
    $('share-pea-files').checked = s.sharePeaFiles;
    $('share-todos').checked = s.shareTodos;
    $('share-intro').checked = s.shareIntro;
    $('greenhouse-role').value = s.role;
    $('drive-name').value = `PEA · ${p() === 'work' ? 'Work' : 'Personal'}`;
    $('drive-root').replaceChildren(
      new Option('Choose your PEA folder', ''),
      ...s.roots.map((w, i) => new Option(w.folder.title + ' · ' + w.folder.id.slice(-6), String(i))),
    );
    $('connection-status').textContent =
      (s.localKey || s.key) && !s.chat
        ? 'Connected · no Chat model chosen yet'
        : s.localKey && s.key
          ? 'Local + OpenRouter ready'
          : s.localKey
            ? 'Local model connected'
            : s.key
              ? 'OpenRouter connected'
              : s.google
                ? 'Google connected · no model'
                : 'Choose a model';
    $('local-origin').textContent = location.origin;
    const libraryOpen = Boolean(lib()?.open());
    $('router-remember').checked = libraryOpen && (wanted.has(p()) || Boolean(s.keyKept));
    $('router-remember').disabled = !libraryOpen;
    $('router-remember-note').textContent = libraryOpen
      ? 'Off, the key stays in this tab’s memory and a reload asks for it again. On, it is sealed with your library passphrase on this browser, comes back when you unlock the library and leaves the tab when you lock it. It is never in a backup or a profile file.'
      : 'To keep this key between reloads, set or unlock a passphrase under Past chats & memory. Until then it stays in this tab’s memory only.';
    $('context-drive').textContent = s.workspace
      ? s.workspace.folder.title
      : s.google
        ? 'Choose a folder'
        : 'Not connected';
    $('workspace-state').textContent = s.workspace ? 'Your Drive' : 'Samples';
    $('preview-state').textContent =
      s.key || s.localKey ? 'CUSTOMER-OWNED CONNECTIONS' : 'LOCAL PREVIEW · SAMPLE DATA';
    // Offered only when some file carries the public label without this app's own private mark.
    $('confirm-created').hidden = !unconfirmed().length;
    $('context-file').hidden = !currentAttachment;
    $('context-file-name').textContent = currentAttachment?.name ?? '';
    const id = modelID(s, hooks.surface());
    const ticker =
      s.key || s.localKey
        ? `${hooks.surface() === 'chat' ? 'Chat' : s.role} · ${[...s.localModels, ...s.models].find((m) => m.id === id)?.name || id || 'choose a model in Set up'}`
        : 'Your keys · or your local model';
    const badge = $('active-model'),
      label = document.createElement('span');
    badge.hidden = !(s.localKey || s.key);
    label.textContent = ticker;
    label.className = 'ticker-text';
    badge.replaceChildren(label);
    badge.title = ticker;
    requestAnimationFrame(() => label.classList.toggle('overflow', label.scrollWidth > badge.clientWidth));
    $('google-origin').textContent = location.origin;
  }
  // prose: the text is an explanation to read, not exact content to check character by character,
  // so it is set in the reading typeface.
  async function review(title, text, { publicRepo = false, prose = false } = {}) {
    if ($('review').open) return false;
    $('review-title').textContent = title;
    $('review-body').textContent = text;
    $('review-body').classList.toggle('prose', prose);
    $('review-extra').replaceChildren();
    let acknowledge = null;
    if (publicRepo) {
      const label = document.createElement('label');
      acknowledge = document.createElement('input');
      acknowledge.type = 'checkbox';
      label.append(
        acknowledge,
        document.createTextNode(' I understand these files will be publicly visible.'),
      );
      $('review-extra').append(label);
    }
    $('review').showModal();
    return new Promise((resolve) => {
      const finish = (value) => {
        $('review-body').textContent = '';
        $('review').close();
        $('review').onclose = null;
        resolve(value);
      };
      $('review-approve').onclick = () => {
        if (acknowledge && !acknowledge.checked) return;
        finish(true);
      };
      $('review-cancel').onclick = () => finish(false);
      // Closing a dialog reports it a moment later. If the next review has already opened by then,
      // that late report belongs to the previous one and must not cancel this one.
      $('review').onclose = () => {
        if (!$('review').open) finish(false);
      };
    });
  }
  // Where a written document goes: the PEA folder when Google and a folder are connected,
  // otherwise a file the owner downloads.
  function documentDestination() {
    const s = state();
    return s.google && s.google.expires > Date.now() && s.workspace ? 'folder' : 'file';
  }
  // Shows the owner the whole document, then creates it, replaces it or prepares it as a file.
  // Returns what actually happened, or null if the owner cancelled.
  // `onWork(work)` is told each time the list of what PEA did for this document changes.
  async function writeDocument(request, onWork = () => {}) {
    const s = state(),
      who = p(),
      draft = request.draft,
      html = docHTML(draft),
      text = `${docSummary(request)}\n\n${docPlain(draft)}`;
    if (documentDestination() === 'file') {
      const ok = await review(
        'Prepare this document as a file?',
        `Profile: ${who}\n\n${text}\n\nNo PEA folder is connected, so nothing is created in Google. Approval offers this document as a file to download and nothing is sent to anyone.`,
      );
      if (!ok) return null;
      if (who !== p()) throw new ServiceError('Profile changed. Review the document again.');
      s.currentDoc = { file: null, draft };
      const made = beginWork(performance.now());
      workStep(made, 'shield', `You reviewed the document “${draft.title}”`);
      endWork(
        made,
        'done',
        'file',
        'Prepared it as a file in this browser. Nothing was created in Google or sent to anyone.',
        performance.now(),
      );
      onWork(made);
      return { status: 'file', html, title: draft.title };
    }
    const g = googleSession(),
      replacing = request.update && s.currentDoc?.file;
    const ok = await review(
      replacing ? 'Replace this document in your PEA folder?' : 'Create this document in your PEA folder?',
      `${g.account}\n${s.workspace.folder.title}\nProfile: ${who}\n\n${text}\n\n${replacing ? 'The whole text is replaced, and only if nobody has changed the document since PEA wrote it.' : 'A new Google Doc is created in this folder.'} Nothing is shared or sent to anyone.`,
    );
    if (!ok) return null;
    if (who !== p()) throw new ServiceError('Profile changed. Review the document again.');
    const work = beginWork(performance.now());
    workStep(work, 'shield', `You reviewed the document “${draft.title}”`);
    return run(async () => {
      busy(true);
      let wrote = false;
      try {
        workWaiting(
          work,
          replacing ? 'Google Docs is replacing the text…' : 'Google Docs is creating the document…',
        );
        onWork(work);
        const file = replacing
          ? await service.replaceDocument(s.currentDoc.file, html, s.workspace, g.token)
          : await service.createRichDocument(draft.title, html, s.workspace, g.token);
        wrote = true;
        if (who === p()) s.currentDoc = { file, draft };
        workStep(
          work,
          'file',
          replacing
            ? `Replaced the text of “${draft.title}” in your PEA folder`
            : `Created “${draft.title}” in your PEA folder`,
        );
        workWaiting(work, 'Reading your PEA folder list again…');
        onWork(work);
        await refresh();
        endWork(
          work,
          'done',
          'check',
          'Your PEA folder list is up to date. Nothing was shared or sent to anyone.',
          performance.now(),
        );
        onWork(work);
      } catch (error) {
        endWork(
          work,
          'failed',
          'warn',
          wrote
            ? 'The document was written, but your PEA folder list could not be read again.'
            : 'The document was not written. PEA did not try again.',
          performance.now(),
        );
        onWork(work);
        throw error;
      }
      return { status: replacing ? 'replaced' : 'created', title: draft.title };
    });
  }
  // The local server's token, from this profile or failing that another one connected in this tab.
  const localKey = () =>
    state().localKey || [...sessions.values()].map((s) => s.localKey).find(Boolean) || '';
  // Keeps the token on this browser when the owner has ticked the box, and drops any kept copy
  // when they have not. Says whether it is kept.
  function keepLocal(key) {
    if ($('local-remember').checked && saveLocalToken(key)) return true;
    forgetLocalToken();
    $('local-remember').checked = false;
    return false;
  }
  // The OpenRouter key can be kept sealed in the owner's encrypted library, never in plain storage.
  // It is kept only while the box is ticked and the library is unlocked, comes back when the
  // library is unlocked, and is put away again when the library is locked.
  const lib = () => hooks.secrets?.() ?? null,
    routerSecret = (who) => 'openrouter:' + who,
    routerKey = /^sk-or-v1-[A-Za-z0-9_-]{16,}$/;
  // The profiles whose box is ticked in this tab.
  const wanted = new Set();
  let restoringRouter = false;
  async function keepRouter(s, who) {
    if (!wanted.has(who) || !s.key || !lib()?.open()) return false;
    await lib().keep(routerSecret(who), s.key);
    s.keyKept = true;
    return true;
  }
  // After the library is unlocked, or the profile changes while it is: connect with the kept key.
  // It asks OpenRouter to confirm the key and list its models, and nothing else.
  async function restoreRouter() {
    const who = p();
    if (restoringRouter || state().key || !lib()?.open()) return;
    restoringRouter = true;
    try {
      const key = await lib().read(routerSecret(who));
      if (!routerKey.test(key) || who !== p() || state().key) return;
      wanted.add(who);
      await run(async () => {
        try {
          const models = await service.catalogue(key);
          if (who !== p() || state().key || !lib()?.open()) return;
          const s = state();
          s.key = key;
          s.models = models;
          s.keyKept = true;
          s.approvals.clear();
          note('OpenRouter connected with the key kept in your library. No inference was requested.');
        } catch (error) {
          // A key OpenRouter no longer accepts is of no use to keep.
          if (error instanceof ServiceError && [401, 403].includes(error.status)) {
            await lib()
              ?.forget(routerSecret(who))
              .catch(() => {});
            wanted.delete(who);
            throw new ServiceError(
              'OpenRouter no longer accepts the key kept in your library, so it was removed. Paste a current one.',
            );
          }
          throw error;
        }
      });
    } finally {
      restoringRouter = false;
      render();
    }
  }
  // Locking the library puts a kept key away: it leaves this tab too.
  function libraryChanged(unlocked) {
    render();
    if (unlocked) return void restoreRouter();
    for (const s of sessions.values())
      if (s.keyKept) {
        s.key = '';
        s.models = [];
        s.keyKept = false;
        s.approvals.clear();
      }
    render();
  }
  // Connects this profile with the remembered token, if there is one. It asks this PEA server
  // for its model list and nothing else. A token the server no longer accepts is forgotten.
  let restoring = false;
  async function restoreLocal() {
    const key = loadLocalToken(),
      who = p();
    if (!key || restoring || state().localKey) return;
    restoring = true;
    try {
      const models = await local.catalogue(key);
      if (who !== p() || state().localKey || loadLocalToken() !== key) return;
      const s = state();
      s.localKey = key;
      s.localModels = models;
      render();
      hooks.localChanged?.();
    } catch (error) {
      if (error instanceof ServiceError && error.rejected && loadLocalToken() === key) {
        forgetLocalToken();
        $('local-remember').checked = false;
        note(
          'This server no longer accepts the remembered connection token, so it was forgotten. Paste the current one under Local model.',
        );
      }
      // Anything else (the server is not answering yet) leaves the token for the next try.
    } finally {
      restoring = false;
      if (who !== p()) void restoreLocal();
    }
  }
  async function run(action) {
    if (operationActive) {
      note('Finish or stop the active request first.');
      return null;
    }
    operationActive = true;
    busy(true);
    try {
      return await action();
    } catch (error) {
      note(
        error instanceof ServiceError
          ? error.message
          : error?.name === 'AbortError'
            ? 'Stopped. Already incurred provider charges may remain.'
            : 'Connection failed. No automatic retry or fallback.',
      );
    } finally {
      operationActive = false;
      busy(false);
      render();
      hooks.busyChanged?.();
    }
  }
  // `spoken` says the reply will be read aloud (voice chat with reading on, or I type, you talk).
  async function chat(surface, text, onDispatch = () => {}, { spoken = false } = {}) {
    const s = state(),
      who = p(),
      ticket = nonce,
      role = surface === 'chat' ? 'chat' : s.role;
    if (!s.key && !s.localKey) return false;
    if (who === 'blended')
      throw new ServiceError('Choose Work or Personal for live browser conversations in this slice.');
    if (surface === 'greenhouse' && role === 'image') {
      return await image(text, onDispatch);
    }
    const model = [...s.localModels, ...s.models].find((m) => m.id === modelID(s, surface));
    if (!model) throw new ServiceError(`Choose a ${role} model in Connections first.`);
    if (model.local && !s.localKey) throw new ServiceError('Reconnect the local server.');
    if (!model.local && !s.key) throw new ServiceError('Reconnect OpenRouter.');
    const context = hooks.context(text),
      intro = s.shareIntro ? context.introduction : '',
      persona = (
        context.persona || 'Warm, curious, quick-witted, a little mischievous; willing to disagree.'
      ).slice(0, 900),
      delivery = presenceAt(context.presence),
      memories = context.memories,
      // Her notes on what the owner told her go with conversation only.
      told = surface === 'chat' ? (context.notes ?? []) : [];
    const attachment =
      currentAttachment?.profile === who
        ? currentAttachment.content.slice(0, currentAttachment.peaAuto ? 2000 : 4000)
        : '';
    // Events PEA added go with the calendar snapshot, under the same switch, so the owner can ask
    // to move or cancel one. Only the ref, title and times are sent.
    const shownOwn = sharedOwnEvents().map(({ ref, title, start, end }) => ({ ref, title, start, end }));
    const snapshot = Boolean(s.scheduleAt && Date.now() - s.scheduleAt < 900000),
      sentCalendar =
        snapshot && s.shareCalendar ? s.calendar.filter((e) => e.profile === who).slice(0, 4) : [],
      sentMail = snapshot && s.shareMail ? s.mail.filter((e) => e.profile === who).slice(0, 3) : [];
    const sources = snapshot
      ? JSON.stringify({
          calendar: sentCalendar,
          ...(shownOwn.length ? { ownEvents: shownOwn } : {}),
          mail: sentMail,
        })
      : '';
    // A web page the owner read is shared in Chat only, and only through the review below.
    const page = surface === 'chat' ? (hooks.page?.() ?? null) : null;
    // The brief of a curated episode the owner has open, in Chat only, through the same review.
    const brief = surface === 'chat' ? (hooks.brief?.() ?? null) : null;
    // Her history: at most two kept cards, in Chat, under the same switch as the introduction.
    const canon = surface === 'chat' && s.shareIntro ? (hooks.canon?.(text) ?? null) : null;
    // Her own interests and people: PEA's fiction, in Chat, under the same switch.
    const life = surface === 'chat' && s.shareIntro ? (hooks.life?.() ?? null) : null;
    // Her days: the kept lines around today, and leave to offer a note, under the same switch.
    const days = surface === 'chat' && s.shareIntro ? (hooks.days?.() ?? null) : null;
    const history = hooks.history(surface),
      body = service.body({
        model: { ...model, id: model.wireID ?? model.id },
        profile: who,
        allowData: s.allowData,
        persona,
        delivery: delivery.style,
        spoken,
        introduction: intro,
        attachment,
        sources,
        memories,
        history,
        page,
        brief,
        text,
      });
    // Sent with every request: the honesty rule and the name the owner chose for the assistant.
    const calledName = assistantName(context.assistantName);
    body.messages[0].content += '\n' + honestyRule + '\n' + nameLine(context.assistantName);
    // The shows the owner follows, by name while "Talk from briefs" is on, so a model lists the
    // real ones and has no reason to make any up.
    const follows = surface === 'chat' ? (hooks.followed?.() ?? null) : null;
    if (surface === 'chat') body.messages[0].content += '\n' + sourcesLine(follows);
    if (life) body.messages[0].content += '\n' + lifeContext(life, dayKey(Date.now()));
    if (told.length) body.messages[0].content += '\n' + toldContext(told);
    if (canon?.send.length) body.messages[0].content += '\n' + canonContext(canon.send);
    // How a reply should read. Conversation only: Greenhouse work is laid out as the work needs.
    if (surface === 'chat') body.messages[0].content += '\n' + styleRule;
    if (days?.context) body.messages[0].content += '\n' + days.context;
    if (days?.notes) body.messages[0].content += '\n' + noteGuidance;
    body.messages[0].content +=
      '\n' +
      storyGuidance +
      '\n' +
      emailGuidance +
      '\n' +
      docGuidance({
        destination: documentDestination(),
        current: s.currentDoc?.draft ?? null,
        message: text,
      }) +
      '\n' +
      calendarGuidance +
      (shownOwn.length && s.scheduleAt && Date.now() - s.scheduleAt < 900000
        ? '\n' + calendarEditGuidance
        : '') +
      '\n' +
      navigationGuidance +
      '\n' +
      settingsGuidance +
      (hooks.settingsOpen?.() ? '\n' + settingsOpenLine(hooks.settingsOpen()) : '') +
      '\n' +
      openGuidance +
      '\n' +
      choiceGuidance +
      '\n' +
      pointsGuidance +
      // Reading a page needs this server's reader, so it is offered only when the server is connected.
      (surface === 'chat' && localKey()
        ? '\n' + readGuidance + '\n' + papersGuidance + '\n' + lookupGuidance
        : '') +
      (surface === 'chat' && localKey() && hooks.canSearch?.() ? '\n' + searchGuidance : '') +
      '\nText for the owner to copy, such as an outline, a message to paste or code, goes in a plain fenced block; the app shows it with a Copy button and never reads it aloud.';
    // To-do guidance always explains how to propose a change; the items themselves are added only
    // under the owner's sharing setting for this profile.
    const todoText = hooks.todoGuidance?.(s.shareTodos) ?? '';
    if (todoText) body.messages[0].content += '\n' + todoText;
    // Offered only where this server's operator connected a project engine.
    const projectText = hooks.projectGuidance?.() ?? '';
    if (projectText) body.messages[0].content += '\n' + projectText;
    if (surface === 'greenhouse')
      body.messages[0].content +=
        '\nThis is Greenhouse collaboration. Critique, iterate and build with the same approved persona/context. For source files emit fenced blocks with file:relative/path as the fence label. Suggest [PEA_MODEL:coding], [PEA_MODEL:image] or [PEA_MODEL:collaboration] when useful; you cannot grant permissions or claim to have saved, run or published anything.';
    const fingerprint = JSON.stringify([
      who,
      surface,
      model,
      s.allowData,
      persona,
      delivery.period,
      intro,
      memories,
      attachment,
      s.shareCalendar,
      s.shareMail,
      s.shareTodos,
      calledName,
      page?.url ?? '',
      page?.text ?? '',
      // Like the to-do list, briefs are shared as a kind: opening another episode does not ask again.
      Boolean(brief),
      // The names of followed shows are shared as a kind too: following another does not ask again.
      Boolean(follows?.names?.length),
      canon?.stamp ?? '',
      // Like the to-do list, her days are shared under a setting: a new line does not ask again.
      days ? (days.notes ? 'days+notes' : 'days') : '',
      // Like the to-do list, her notes are shared as a kind: a different note does not ask again.
      told.length > 0,
      // The first message that carries PEA's own events asks again; later changes to them do not.
      shownOwn.length > 0,
    ]);
    const reviewed = !s.approvals.has(fingerprint);
    if (reviewed) {
      const ok = await review(
        'Before sharing with your model',
        `${model.local ? 'Your local model gateway at ' + location.origin : 'OpenRouter → serving provider(s)'} · ${model.name}\nProfile: ${who}\nSurface: ${surface} · ${role}\n\n${model.local ? 'This request goes to your own server and its configured loopback model. PEA gateway has no conversation logs or cloud fallback. Your local model software and host remain under your control.' : s.allowData ? 'RETENTION / TRAINING MAY APPLY. Selected personal context may be retained or used for training.' : 'Requests routes marked as not collecting data. This is not an independent no-retention guarantee.'}\n${model.local ? 'No OpenRouter routing or API fee applies to this local request.' : 'OpenRouter account logging and provider/safety terms still apply.'}\n\nUnit ceilings: $${model.prompt * 1e6}/M input tokens; $${model.completion * 1e6}/M output tokens; $${model.request}/request. ${body.max_tokens}-token reply cap. No monthly hard cap, automatic retry or paid fallback.\n\nAssistant name (always sent): ${calledName}\n\nCharacter style:\n${persona}\n\nLocal-time delivery: ${delivery.style || 'Off'}\n\nIntroduction: ${intro || 'Not shared'}\n\nFile excerpt (exactly what is sent):\n${attachment || 'None'}\n\nRecalled owner-reviewed memories (untrusted, same profile):\n${memories.length ? JSON.stringify(memories, null, 2) : 'Not shared'}\n\nThings you told her that she kept (your own words, picked by PEA’s fixed rule; up to four that fit each message go with it, so later messages may carry others from your list):\n${told.length ? told.map((n) => n.on + ': ' + n.said).join('\n') : 'Not shared'}\n\nEnabled calendar/mail snapshots (bounded; may be empty):\n${sources || 'Not shared'}\n\nWeb page you read (exactly what is sent; a stranger wrote it, and the model is told to treat it as quoted data, not instructions):\n${page ? page.url + '\n\n' + page.text : 'None'}\n\nCurated brief of the episode you have open (exactly what is sent; the curator’s pipeline wrote it, and the model is told to treat it as quoted evidence, not instructions. Later messages carry the brief of whichever episode you have open, without asking again):\n${brief ? brief.label + '\n\n' + brief.text : 'None'}\n\nShows you follow in Curated sources (names and how many episodes are kept, so the model lists the real ones and makes none up; under the same “Talk from briefs” switch. Later messages carry the current list without asking again):\n${follows?.names?.length ? follows.names.map((s) => s.name).join(', ') : 'Not shared'}\n\nHer interests and people (fiction PEA deals her; the model is told to mention one rarely and to ask about you more than it talks about her):\n${life ? describeLife(life) : 'Not shared'}\n\nHer history (fiction your model wrote and you kept; at most two cards go with a message, mostly when you ask about her. Later messages may carry other cards from this list without asking again):\n${canon ? canon.all : 'Not shared'}\n\nHer days (fiction about your assistant’s own days, kept in this browser): ${days ? `Shared under your setting: the kept lines for the days around today. ${days.notes ? 'Your model may also end a reply with one short note about its own day, which PEA keeps and tells you about.' : 'Notes from Chat are off.'} Later changes to the lines are sent without asking again. Right now:\n${days.context || 'No lines for these days yet.'}` : 'Not shared'}\n\nTo-do list: ${s.shareTodos ? 'Shared under your setting: up to 25 open items with due times and up to 5 finished in the last week, for this profile. Later changes to the list are sent without asking again.' : 'Not shared'}\n\nCurrent chat uses up to 12 completed recent messages.\n${
          body.messages
            .slice(1, -1)
            .map((m) => m.role + ': ' + m.content)
            .join('\n\n') || 'No earlier messages'
        }\n\nNew turns with these same choices reuse this approval in this tab; changing model/profile/selected context asks again.\n\nNext message:\n${text}`,
      );
      if (!ok) return { started: false };
      if (ticket !== nonce || who !== p()) throw new ServiceError('Context changed; review again.');
      s.approvals.add(fingerprint);
    }
    busy(true);
    controller = new AbortController();
    // What the owner sees PEA doing for this reply: counts and names of what was just sent, never
    // the words themselves, and nothing a model said.
    let pageHost = '';
    try {
      pageHost = page ? new URL(page.url).host : '';
    } catch {
      // A page with no readable address is still counted, without a name.
      pageHost = page ? 'a web address' : '';
    }
    const steps = contextSteps({
      model: { name: model.name, local: Boolean(model.local) },
      reviewed,
      introduction: Boolean(intro),
      memories: memories.length,
      notes: told.length,
      file: attachment ? String(currentAttachment?.name ?? 'your file') : '',
      calendar: sentCalendar.length,
      ownEvents: snapshot ? shownOwn.length : 0,
      mail: sentMail.length,
      todos: Boolean(s.shareTodos && todoText),
      page: pageHost,
      brief: brief?.title ?? '',
      canon: canon?.send.length ?? 0,
      days: Boolean(days?.context),
      history: Math.max(0, body.messages.length - 2),
    });
    // For the owner's own debug export: sizes and names only.
    const detail = {
      at: Date.now(),
      surface,
      profile: who,
      model: String(model.id),
      local: Boolean(model.local),
      messages: body.messages.length,
      characters: body.messages.reduce((sum, m) => sum + String(m.content ?? '').length, 0),
      system: String(body.messages[0]?.content ?? '').length,
      cap: body.max_tokens,
      guidance: [
        'stories',
        'email',
        'documents',
        'calendar',
        ...(shownOwn.length && snapshot ? ['calendar changes'] : []),
        'navigation',
        'phone links',
        'choices',
        ...(spoken ? ['spoken reply'] : []),
        'numbered points',
        ...(surface === 'chat' && localKey()
          ? [
              'page reading',
              'paper lookup',
              'wikipedia and tv lookup',
              ...(hooks.canSearch?.() ? ['web search'] : []),
            ]
          : []),
        ...(brief ? ['curated brief'] : []),
        ...(todoText ? ['to-dos'] : []),
        ...(projectText ? ['projects'] : []),
        ...(life ? ['her life'] : []),
        ...(told.length ? ['your life'] : []),
        ...(surface === 'chat' ? ['plain style'] : []),
        ...(canon?.send.length ? ['her history'] : []),
        ...(days?.context ? ['her days'] : []),
        ...(days?.notes ? ['day notes'] : []),
        ...(surface === 'greenhouse' ? ['greenhouse'] : []),
      ],
    };
    const reply = hooks.beginReply(surface, text, { sourced: Boolean(page), steps, detail });
    onDispatch();
    if (canon) hooks.canonSent?.(canon.send.length);
    try {
      await (model.local ? local : service).stream(
        model.local ? s.localKey : s.key,
        body,
        (delta) => {
          if (who === p() && ticket === nonce) hooks.appendReply(surface, reply, delta);
        },
        controller.signal,
      );
      hooks.finishReply(surface, reply, true);
      if (surface === 'greenhouse') {
        const output = reply.text;
        const blocks = [...output.matchAll(/```(?:file:|path:)([^\n]+)\n([\s\S]*?)```/g)];
        s.artifacts = blocks
          .map((m) => ({ path: m[1].trim(), text: m[2] }))
          .filter((f) => validCode(f))
          .slice(0, 20);
        const roleMatch = output.match(/\[PEA_MODEL:(coding|image|collaboration)\]/);
        if (roleMatch) {
          $('role-suggestion').hidden = false;
          $('role-suggestion').textContent = `PEA suggests ${roleMatch[1]} →`;
          $('role-suggestion').onclick = () => {
            s.role = roleMatch[1];
            $('greenhouse-role').value = s.role;
            $('role-suggestion').hidden = true;
            render();
          };
        }
      }
    } catch (error) {
      hooks.finishReply(surface, reply, false, { stopped: error?.name === 'AbortError' });
      throw error;
    } finally {
      controller = null;
      busy(false);
      render();
    }
    return { started: true, complete: true, text: reply.text };
  }
  // One reviewed request outside the conversation, for the Chat model of this profile. Nothing from
  // the chat, the interview or any service is added: the model gets exactly `system` and `user`,
  // and the reply is handed back to the caller instead of being shown. Reviewed every time.
  // `trail` is the caller's list of what PEA did, and `redraw` shows it again after each step.
  async function compose({ title, about, system, user, trail = null, redraw = () => {} }) {
    const s = state(),
      who = p(),
      ticket = nonce;
    if (who === 'blended') throw new ServiceError('Choose Work or Personal first.');
    const model = [...s.localModels, ...s.models].find((m) => m.id === modelID(s, 'chat'));
    if (!model) throw new ServiceError('Choose a chat model in Connections first.');
    if (model.local && !s.localKey) throw new ServiceError('Reconnect the local server.');
    if (!model.local && !s.key) throw new ServiceError('Reconnect OpenRouter.');
    if (containsCredential(system + user))
      throw new ServiceError('Something in this request looks like a password or key. Nothing was sent.');
    const body = service.body({
      model: { ...model, id: model.wireID ?? model.id },
      profile: who,
      allowData: s.allowData,
      text: user,
    });
    body.messages = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
    const ok = await review(
      title,
      `${model.local ? 'Your local model gateway at ' + location.origin : 'OpenRouter → serving provider(s)'} · ${model.name}\nProfile: ${who}\n\n${model.local ? 'This request goes to your own server and its configured loopback model. PEA gateway has no conversation logs or cloud fallback.' : s.allowData ? 'RETENTION / TRAINING MAY APPLY. What is sent may be retained or used for training.' : 'Requests routes marked as not collecting data. This is not an independent no-retention guarantee.'}\n${model.local ? 'No OpenRouter routing or API fee applies to this local request.' : 'OpenRouter account logging and provider/safety terms still apply.'}\n\nUnit ceilings: $${model.prompt * 1e6}/M input tokens; $${model.completion * 1e6}/M output tokens; $${model.request}/request. ${body.max_tokens}-token reply cap. No automatic retry or paid fallback.\n\n${about}\n\nEverything the model is told (exactly what is sent):\n${system}\n\n${user}`,
    );
    if (!ok) return { started: false };
    if (ticket !== nonce || who !== p()) throw new ServiceError('Context changed; review again.');
    busy(true);
    controller = new AbortController();
    let text = '';
    const sentAt = performance.now();
    workStep(trail, 'shield', 'You reviewed exactly what is sent');
    workStep(
      trail,
      'send',
      `Sent to ${model.name} ${model.local ? 'on your own server' : 'through OpenRouter'}`,
    );
    workWaiting(trail, 'Waiting for your model’s reply…');
    redraw();
    try {
      await (model.local ? local : service).stream(
        model.local ? s.localKey : s.key,
        body,
        (delta) => {
          if (text.length < 60000) text += delta;
        },
        controller.signal,
      );
    } catch (error) {
      const stopped = error?.name === 'AbortError';
      endWork(
        trail,
        stopped ? 'stopped' : 'failed',
        stopped ? 'stop' : 'warn',
        stopped
          ? 'Stopped before the reply was finished. Nothing was kept.'
          : 'The request did not finish. PEA did not retry or use another model. Nothing was kept.',
        performance.now(),
      );
      redraw();
      throw error;
    } finally {
      controller = null;
      busy(false);
      render();
    }
    workWaiting(trail, '');
    workStep(
      trail,
      'pen',
      `Your model answered in ${took(performance.now() - sentAt)} (${text.length.toLocaleString('en-US')} characters)`,
    );
    redraw();
    if (ticket !== nonce || who !== p()) {
      endWork(trail, 'failed', 'warn', 'The profile changed. Nothing was kept.', performance.now());
      redraw();
      throw new ServiceError('Profile changed. Nothing was kept.');
    }
    return { started: true, text };
  }
  async function googleConnect() {
    if (p() === 'blended') throw new ServiceError('Choose Work or Personal.');
    const client = $('google-client').value.trim();
    if (!/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(client))
      throw new ServiceError(
        'Enter a Google Web OAuth client ID registered for this origin, not a secret or API key.',
      );
    const who = p(),
      ticket = nonce;
    note(
      'Google account chooser will open. Access stays in this tab; reconnect when its short-lived token expires.',
    );
    if (!globalThis.google?.accounts?.oauth2) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.onload = resolve;
        script.onerror = reject;
        document.head.append(script);
      });
    }
    // requestAccessToken must remain driven by a click. Once the SDK is loaded the first click may need a second user gesture.
    if (ticket !== nonce) return;
    await new Promise((resolve, reject) => {
      const c = google.accounts.oauth2.initTokenClient({
        client_id: client,
        scope: `openid email ${driveScope}${$('google-calendar-write').checked ? ' ' + calendarWriteScope : $('google-calendar-access').checked ? ' ' + calendarScope : ''}${$('google-mail-access').checked ? ' ' + mailScope : ''}`,
        include_granted_scopes: false,
        callback: async (response) => {
          try {
            if (response.error || !response.access_token || !response.scope?.split(' ').includes(driveScope))
              throw new ServiceError('Drive permission was not granted.');
            if (ticket !== nonce || who !== p()) throw new ServiceError('Profile changed; reconnect.');
            const identity = await service.call('drive', '/oauth2/v3/userinfo', {
              token: response.access_token,
            });
            if (!identity.email) throw new ServiceError('Google account identity was not returned.');
            const s = state();
            s.google = {
              calendar: [calendarScope, calendarWriteScope].some((x) =>
                response.scope.split(' ').includes(x),
              ),
              calendarWrite: response.scope.split(' ').includes(calendarWriteScope),
              mail: response.scope.split(' ').includes(mailScope),
              token: response.access_token,
              account: identity.email,
              expires: Date.now() + Math.min(3600, Number(response.expires_in) || 0) * 1000,
            };
            s.roots = await service.discover(who, identity.email, s.google.token);
            await refreshToday();
            note(
              'Connected ' +
                identity.email +
                '. Calendar/mail are separate services; choose a PEA folder or review creating one.',
            );
            render();
            resolve();
          } catch (error) {
            reject(error);
          }
        },
        error_callback: () =>
          reject(
            new ServiceError(
              'Google sign-in was closed or blocked. Click Connect again after allowing the account chooser.',
            ),
          ),
      });
      c.requestAccessToken({ prompt: 'consent' });
    });
  }
  function googleSession() {
    const s = state();
    if (!s.google || s.google.expires <= Date.now()) {
      s.google = null;
      throw new ServiceError(
        'Google access expired. Reconnect from a user click; no background credential refresh.',
      );
    }
    return s.google;
  }
  // What a model may be told of PEA's own events right now, and so what a ref can mean.
  function sharedOwnEvents() {
    const s = state(),
      g = s.google;
    return s.shareCalendar &&
      g &&
      g.expires > Date.now() &&
      g.calendarWrite &&
      s.scheduleAt &&
      Date.now() - s.scheduleAt < 900000
      ? s.ownEvents.slice(0, 8)
      : [];
  }
  // What the last refresh of calendar and mail did, for the profile that asked.
  let todayWork = null;
  const showToday = () => showWork($('today-activity'), todayWork?.profile === p() ? todayWork.trail : null);
  async function refreshToday() {
    const s = state(),
      who = p(),
      trail = beginWork(performance.now());
    todayWork = { profile: who, trail };
    let g;
    try {
      g = googleSession();
    } catch (error) {
      endWork(
        trail,
        'failed',
        'warn',
        'Google is not connected for this profile, so nothing was asked.',
        performance.now(),
      );
      showToday();
      throw error;
    }
    const wanted = [
      g.calendar && 'your next calendar events',
      g.mail && 'your newest inbox items',
      g.calendarWrite && 'the events PEA added',
    ].filter(Boolean);
    workWaiting(trail, wanted.length ? `Asking Google for ${wanted.join(', ')}…` : '');
    showToday();
    const responses = await Promise.allSettled([
      g.calendar ? service.calendar(g.token, who) : Promise.resolve([]),
      g.mail ? service.mail(g.token, who) : Promise.resolve([]),
      g.calendarWrite ? service.ownEvents(g.token, who) : Promise.resolve([]),
    ]);
    workWaiting(trail, '');
    const read = (on, i, icon, one, many, failed) => {
      if (!on) return;
      const r = responses[i];
      if (r.status === 'fulfilled')
        workStep(trail, icon, `Read ${r.value.length} ${r.value.length === 1 ? one : many}`);
      else workStep(trail, 'warn', failed, true);
    };
    read(
      g.calendar,
      0,
      'calendar',
      'coming event from your Google calendar',
      'coming events from your Google calendar',
      'Your Google calendar could not be read. It is left out of what a model sees.',
    );
    read(
      g.mail,
      1,
      'mail',
      'newest inbox item from Gmail: sender, subject and a short preview',
      'newest inbox items from Gmail: sender, subject and a short preview',
      'Gmail could not be read. It is left out of what a model sees.',
    );
    read(
      g.calendarWrite,
      2,
      'calendar',
      'event that PEA added',
      'events that PEA added',
      'The events PEA added could not be read, so none can be changed from Chat for now.',
    );
    const missed = responses.filter((r) => r.status === 'rejected').length;
    endWork(
      trail,
      missed ? 'failed' : 'done',
      missed ? 'warn' : 'check',
      !wanted.length
        ? 'Calendar and mail are not connected for this profile, so nothing was asked.'
        : missed
          ? 'Some of it could not be refreshed. PEA did not try again.'
          : 'Kept in this tab only. A model sees it only when you share it, after the usual review.',
      performance.now(),
    );
    if (who !== p()) return;
    showToday();
    s.ownEvents = (responses[2].status === 'fulfilled' ? responses[2].value : []).map((e, i) => ({
      ...e,
      ref: 'e' + (i + 1),
    }));
    s.calendar = responses[0].status === 'fulfilled' ? responses[0].value : [];
    s.mail = responses[1].status === 'fulfilled' ? responses[1].value : [];
    s.scheduleAt = Date.now();
    hooks.setSchedule(s.calendar, s.mail, g.calendar, g.mail);
    if (responses.some((r) => r.status === 'rejected'))
      note(
        'Some Google previews could not refresh. Check service API/permissions in settings. Failed sources were excluded from model context.',
      );
  }
  async function refresh() {
    const s = state(),
      g = googleSession(),
      who = p();
    if (!s.workspace) throw new ServiceError('Choose your PEA folder in Connections first.');
    busy(true);
    const files = await service.tree(s.workspace, g.token);
    if (who !== p()) return;
    selectedCleanup.clear();
    currentAttachment = null;
    hooks.setFiles(
      files.map((f) => ({
        ...f,
        profile: who,
        live: true,
        kind: /\.(mmd)$/.test(f.name)
          ? 'diagram'
          : /\.(py|js|swift|json|ts|tsx|html|css)$/.test(f.name)
            ? 'code'
            : 'document',
      })),
    );
    note(
      'PEA folder refreshed. Contents are not sent to a model until a file is opened under your PEA source setting or explicitly selected for Discuss, followed by model review.',
    );
  }
  async function open(file) {
    if (!file.live) return file;
    const s = state(),
      g = googleSession(),
      who = p();
    const result = await service.read(file, s.workspace, g.token);
    if (who !== p()) throw new ServiceError('Profile changed.');
    let url;
    if (result.mime.startsWith('image/')) {
      if (previewURL) URL.revokeObjectURL(previewURL);
      url = previewURL = URL.createObjectURL(new Blob([result.data], { type: result.mime }));
    }
    return {
      ...file,
      ...result.file,
      mimeType: result.mime,
      content: result.mime.startsWith('image/') ? '' : new TextDecoder().decode(result.data).slice(0, 60000),
      url,
    };
  }
  function maybeAutoAttach(file) {
    const s = state();
    if (
      file.live &&
      // The private mark, not the public label: another app can set the label on any file.
      madeByPEA(file) &&
      s.sharePeaFiles &&
      !file.mimeType.startsWith('image/') &&
      file.content &&
      !containsCredential(file.content)
    ) {
      currentAttachment = { ...file, profile: p(), peaAuto: true };
      note('Opened PEA-created text is available to this profile under your Drive source setting.');
      render();
    }
  }
  function attach(file) {
    if (file.mimeType.startsWith('image/'))
      throw new ServiceError(
        'Images can be previewed here; text discussion currently needs a text/OCR excerpt.',
      );
    currentAttachment = { ...file, profile: p() };
    note('Selected the first 4,000 text characters for the next reviewed model request.');
    render();
  }
  async function createDraft() {
    const s = state(),
      g = googleSession(),
      who = p();
    if (!s.workspace) throw new ServiceError('Choose a PEA folder first.');
    const draft = { title: $('draft-title').value, text: $('draft-text').value, form: draftForm };
    if (!safeName(draft.title)) throw new ServiceError('Choose a clear name without path separators.');
    if (
      !(await review(
        'Create in your PEA folder',
        `${g.account}\n${s.workspace.folder.title}\n${draft.form ? 'Unpublished form, one long-answer question per line' : 'Google document'}: ${draft.title}\n\n${draft.text}\n\nNo sharing permissions are changed. A form may first be created empty, then moved into this folder before questions are added. A lost response may leave a partial file; no retry.`,
      ))
    )
      return;
    if (who !== p()) throw new ServiceError('Profile changed.');
    busy(true);
    await service.createDraft(draft, s.workspace, g.token);
    $('draft').close();
    await refresh();
    note('Created in your PEA folder. Nothing was sent to anyone.');
  }
  function draft(form = false, content = '') {
    draftForm = form;
    $('draft-title').value = form ? 'Untitled form' : 'PEA draft';
    $('draft-text').value = content;
    $('draft').showModal();
  }
  // Files labelled as PEA-created that this app has not marked itself. They were made before the
  // private mark existed, by the iPhone app, or labelled by something else.
  const unconfirmed = () =>
    hooks
      .files()
      .filter(
        (f) => f.live && f.profile === p() && labelledPEA(f) && !madeByPEA(f) && !/folder$/.test(f.mimeType),
      );
  async function confirmCreated() {
    const s = state(),
      g = googleSession(),
      who = p(),
      files = unconfirmed().slice(0, 25);
    if (!files.length) throw new ServiceError('There is nothing to confirm.');
    if (
      !(await review(
        'Confirm files PEA created',
        `${g.account} · ${s.workspace.folder.title}\n\nThese files are labelled as created by PEA, but the label can be set by any app with access to them:\n${files.map((f) => f.name).join('\n')}\n\nConfirm only files you recognize as PEA\u2019s. Confirmed files can be shared with your model automatically when you open them (under your Drive source setting) and can be replaced by a document revision. Their contents are not changed, and nothing is shared or sent now.${unconfirmed().length > 25 ? '\n\nMore remain; this review covers the first 25.' : ''}`,
      ))
    )
      return;
    if (who !== p()) throw new ServiceError('Profile changed.');
    busy(true);
    const count = await service.confirmCreated(files, s.workspace, g.token);
    await refresh();
    note(`Confirmed ${count} file${count === 1 ? '' : 's'} as created by PEA. Nothing was shared.`);
  }
  async function cleanup() {
    const s = state(),
      g = googleSession(),
      who = p(),
      files = hooks.files().filter((f) => selectedCleanup.has(f.id) && f.live);
    if (!files.length) throw new ServiceError('Select one or more live files. Folders are protected.');
    if (files.length > 25) throw new ServiceError('Choose up to 25 files per review.');
    if (
      !(await review(
        'Review recoverable cleanup',
        `${g.account} · ${s.workspace.folder.title}\n\nMove exactly these files to Google Trash:\n${files.map((f) => f.name).join('\n')}\n\nNo permanent deletion. One approval for this batch; it is not automatically replayed.`,
      ))
    )
      return;
    if (who !== p()) throw new ServiceError('Profile changed.');
    busy(true);
    for (const f of files) {
      const current = await service.member(f.id, s.workspace, g.token);
      if (current.version !== f.version || current.name !== f.name)
        throw new ServiceError('Selection changed. No batch started; refresh and review.');
    }
    let done = 0;
    selectedCleanup.clear();
    try {
      for (const f of files) {
        await service.change({ kind: 'trash', file: f }, s.workspace, g.token);
        done++;
      }
    } catch {
      throw new ServiceError(
        `${done} files changed. A partial batch may exist; refresh and check Google Trash before any new action. No replay.`,
      );
    }
    await refresh();
    note(`Moved ${done} files to recoverable Google Trash.`);
  }
  async function image(prompt, onDispatch = () => {}) {
    const s = state();
    if (!s.key || !s.image) throw new ServiceError('Configure an image model and connect OpenRouter first.');
    const max = Number($('image-cap').value);
    if (
      !Number.isFinite(max) ||
      max < 0 ||
      max > 10 ||
      !prompt.trim() ||
      prompt.length > 4000 ||
      containsCredential(prompt)
    )
      throw new ServiceError('Check the exact prompt and price ceiling.');
    const rows = await service.call('router', `/api/v1/images/models/${s.image}/endpoints`);
    const endpoints = (rows.endpoints ?? []).filter(
      (e) =>
        e.provider_tag &&
        e.pricing?.length === 1 &&
        e.pricing[0].billable === 'output_image' &&
        e.pricing[0].unit === 'image' &&
        !e.pricing[0].variant &&
        knownPrice(e.pricing[0].cost_usd) !== undefined &&
        Number(e.pricing[0].cost_usd) <= max,
    );
    if (!endpoints.length)
      throw new ServiceError(
        'No verified simple fixed-price endpoint fits this cap. Unknown/token/variant prices are excluded.',
      );
    const endpoint = endpoints[0],
      who = p();
    if (
      !(await review(
        'One image · one reviewed request',
        `OpenRouter → ${endpoint.provider_tag}\nModel: ${s.image}\nProfile: ${who}\nVerified fixed price: $${endpoint.pricing[0].cost_usd}/image\nMaximum: $${max}/image\n\n${s.allowData ? 'Retention/training permitted by your profile choice.' : 'Requests no-data-collection routing; provider and account terms still apply.'}\n\nOnly this exact prompt is sent. No private chat or memory is included:\n${prompt}\n\nNo automatic retry or provider/model fallback.`,
      ))
    )
      return;
    if (who !== p()) throw new ServiceError('Profile changed.');
    busy(true);
    controller = new AbortController();
    onDispatch();
    // What PEA did for this picture, shown over it. Every line names something that has happened.
    const work = beginWork(performance.now());
    pictureWork = { profile: who, trail: work };
    const drawPicture = () =>
      showWork($('generated-activity'), pictureWork?.profile === p() ? pictureWork.trail : null);
    workStep(
      work,
      'list',
      `Checked prices for ${s.image}: ${endpoints.length} ${endpoints.length === 1 ? 'provider fits' : 'providers fit'} your $${max} ceiling`,
    );
    workStep(
      work,
      'shield',
      `You reviewed the exact prompt and the price, $${endpoint.pricing[0].cost_usd} for one picture`,
    );
    workStep(work, 'send', `Sent the prompt to ${endpoint.provider_tag} through OpenRouter`);
    workWaiting(work, 'Waiting for the picture…');
    drawPicture();
    const pictureEnded = (outcome, icon, text) => {
      endWork(work, outcome, icon, text, performance.now());
      drawPicture();
    };
    let result;
    try {
      result = await requestPicture();
    } catch (error) {
      if (error?.name === 'AbortError')
        pictureEnded(
          'stopped',
          'stop',
          'Stopped before a picture arrived. A charge may already have been made.',
        );
      else
        pictureEnded(
          'failed',
          'warn',
          'The request did not finish. PEA did not retry or use another provider or model.',
        );
      throw error;
    }
    async function requestPicture() {
      return service.call('router', '/api/v1/images', {
        token: s.key,
        method: 'POST',
        body: {
          model: s.image,
          prompt,
          n: 1,
          stream: false,
          provider: {
            only: [endpoint.provider_tag],
            allow_fallbacks: false,
            data_collection: s.allowData ? 'allow' : 'deny',
            sort: 'latency',
            max_price: { image: max },
          },
        },
        max: 16000000,
        signal: controller.signal,
      });
    }
    const output = result.data?.[0];
    if (
      result.data?.length !== 1 ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(output?.media_type) ||
      typeof output.b64_json !== 'string' ||
      output.b64_json.length > 12000000
    ) {
      pictureEnded('failed', 'warn', 'The answer was not one picture PEA accepts. Nothing was opened.');
      throw new ServiceError('Unexpected image result; nothing was opened.');
    }
    let bytes;
    try {
      bytes = Uint8Array.from(atob(output.b64_json), (c) => c.charCodeAt(0));
    } catch {
      pictureEnded('failed', 'warn', 'The answer was not one picture PEA accepts. Nothing was opened.');
      throw new ServiceError('Unexpected image result; nothing was opened.');
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: output.media_type }));
    if (who !== p()) {
      URL.revokeObjectURL(url);
      pictureEnded('stopped', 'stop', 'The profile changed, so the picture was discarded.');
      return;
    }
    pictureEnded(
      'done',
      'check',
      `A picture arrived (${output.media_type}, ${Math.max(1, Math.round(bytes.length / 1024)).toLocaleString('en-US')} KB). It is kept in this tab only.`,
    );
    if (generatedURL) URL.revokeObjectURL(generatedURL);
    generatedURL = url;
    const img = document.createElement('img');
    img.src = url;
    img.alt = prompt;
    const save = document.createElement('a');
    save.href = url;
    save.download =
      'pea-greenhouse-image.' +
      (output.media_type === 'image/png' ? 'png' : output.media_type === 'image/webp' ? 'webp' : 'jpg');
    save.textContent = 'Save generated image';
    $('generated-output').replaceChildren(img, save);
    note('Generated image kept in this tab. Nothing added to Drive or GitHub.');
    return {
      started: true,
      complete: true,
      text: 'Generated image available in Greenhouse. Save the image before closing this tab; only this receipt is stored on the task board.',
    };
  }
  async function githubInspect(repo, token) {
    if (!validRepo(repo) || !/^(github_pat_[A-Za-z0-9_]{20,240}|ghp_[A-Za-z0-9]{20,240})$/.test(token))
      throw new ServiceError('Enter owner/repository and a repository-scoped token.');
    const r = await service.call('github', '/repos/' + repo, { token });
    if (
      r.full_name?.toLowerCase() !== repo.toLowerCase() ||
      typeof r.private !== 'boolean' ||
      !/^[A-Za-z0-9][A-Za-z0-9_./-]{0,199}$/.test(r.default_branch) ||
      r.default_branch.includes('..')
    )
      throw new ServiceError('Repository identity was not verified.');
    const ref = await service.call('github', `/repos/${repo}/git/ref/heads/${r.default_branch}`, { token });
    if (!/^[a-f0-9]{40}$/.test(ref.object?.sha)) throw new ServiceError('Default branch is not ready.');
    return { repo: r.full_name, private: r.private, branch: r.default_branch, sha: ref.object.sha, token };
  }
  // What the last GitHub delivery did, for the profile that asked.
  let githubWork = null;
  const showGithub = () =>
    showWork($('github-activity'), githubWork?.profile === p() ? githubWork.trail : null);
  async function githubDeliver() {
    const s = state(),
      g = s.github,
      who = p();
    if (!g || !s.artifacts.length)
      throw new ServiceError('Configure GitHub and ask the Greenhouse coding model for source files first.');
    const work = beginWork(performance.now()),
      files = (n) => `${n} ${n === 1 ? 'file' : 'files'}`,
      end = (outcome, icon, text) => {
        endWork(work, outcome, icon, text, performance.now());
        showGithub();
      };
    githubWork = { profile: who, trail: work };
    workWaiting(work, 'Asking GitHub about the repository…');
    showGithub();
    try {
      await githubSend(s, g, who, work, files, end);
    } catch (error) {
      // A step that had already ended the list said why; this covers the rest.
      end(
        error?.name === 'AbortError' ? 'stopped' : 'failed',
        error?.name === 'AbortError' ? 'stop' : 'warn',
        'The delivery did not start. Nothing was written to GitHub.',
      );
      throw error;
    }
  }
  async function githubSend(s, g, who, work, count, end) {
    const fresh = await githubInspect(g.repo, g.token);
    workStep(
      work,
      'shield',
      `GitHub confirmed the repository: ${fresh.private ? 'private' : 'PUBLIC'}, and its main branch`,
    );
    workWaiting(work, '');
    showGithub();
    const files = s.artifacts;
    if (files.some((f) => !validCode(f)) || new Set(files.map((f) => f.path)).size !== files.length)
      throw new ServiceError('Check the source paths and remove credentials.');
    const id = crypto.randomUUID(),
      branch = 'pea/greenhouse-' + id,
      directory = 'pea-greenhouse/' + id;
    const ok = await review(
      'Review GitHub delivery',
      `${fresh.repo} · ${fresh.private ? 'private' : 'PUBLIC — output will be visible to others'}\nNew branch: ${branch}\nNew directory: ${directory}\nDraft PR into: ${fresh.branch}\nExisting code is not overwritten; nothing is merged or executed by PEA. Existing repository CI may run.\n\n${files.map((f) => `FILE: ${f.path}\n${f.text}`).join('\n\n')}`,
      { publicRepo: !fresh.private },
    );
    if (!ok) return end('stopped', 'stop', 'You did not approve it. Nothing was written to GitHub.');
    if (who !== p()) throw new ServiceError('Profile changed.');
    workStep(work, 'shield', `You reviewed ${count(files.length)} and where they go`);
    workWaiting(work, 'Checking that the repository has not changed since your review…');
    showGithub();
    busy(true);
    const latest = await githubInspect(g.repo, g.token);
    if (latest.sha !== fresh.sha || latest.private !== fresh.private) {
      end('failed', 'warn', 'The repository changed after your review. Nothing was written to GitHub.');
      throw new ServiceError('Repository changed. Review again.');
    }
    workStep(work, 'check', 'The repository is the same as the one you reviewed');
    workWaiting(work, 'Creating a new branch…');
    showGithub();
    try {
      await service.call('github', `/repos/${fresh.repo}/git/refs`, {
        token: g.token,
        method: 'POST',
        body: { ref: 'refs/heads/' + branch, sha: fresh.sha },
      });
      workStep(work, 'send', 'Created a new branch for this delivery');
      workWaiting(work, `Adding ${count(files.length)} to a new folder on that branch…`);
      showGithub();
      for (const file of files)
        await service.call(
          'github',
          `/repos/${fresh.repo}/contents/${directory}/${file.path.split('/').map(encodeURIComponent).join('/')}`,
          {
            token: g.token,
            method: 'PUT',
            body: {
              branch,
              message: 'PEA Greenhouse: ' + file.path,
              content: btoa(
                Array.from(new TextEncoder().encode(file.text), (b) => String.fromCharCode(b)).join(''),
              ),
            },
          },
        );
      workStep(work, 'file', `Added ${count(files.length)} in a new folder. No existing file was changed.`);
      workWaiting(work, 'Opening a draft pull request…');
      showGithub();
      const pr = await service.call('github', `/repos/${fresh.repo}/pulls`, {
        token: g.token,
        method: 'POST',
        body: {
          title: 'PEA Greenhouse output',
          head: branch,
          base: fresh.branch,
          draft: true,
          body: `Owner-reviewed source under ${directory}. No code was executed by PEA. Review and test before merging.`,
        },
      });
      const url = new URL(pr.html_url);
      if (url.origin !== 'https://github.com' || !url.pathname.startsWith('/' + fresh.repo + '/pull/'))
        throw new Error('Unexpected PR');
      note('Created a draft PR. Nothing was merged.');
      end('done', 'check', 'Opened a draft pull request. Nothing was merged and PEA ran no code.');
      const link = document.createElement('a');
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Open draft PR';
      $('generated-output').append(link);
    } catch {
      end(
        'failed',
        'warn',
        'It stopped part way. A branch, some files or a draft pull request may exist. Check GitHub; PEA did not try again.',
      );
      throw new ServiceError(
        'A branch, partial delivery or draft PR may exist. Check GitHub; no automatic retry or merge.',
      );
    }
  }
  function exportConfiguration() {
    const s = state(),
      models = {};
    for (const role of ['chat', 'collaboration', 'coding', 'image']) {
      const id = s[role];
      if (id)
        models[role] = {
          provider: id.startsWith('local:') ? 'local' : 'openRouter',
          id: id.startsWith('local:') ? id.slice(6) : id,
        };
    }
    const text = JSON.stringify({ schema: 'pea-config-v1', profile: p(), models }, null, 2);
    parseConfiguration(text, p());
    $('shared-config').value = text;
    return text;
  }
  $('config-export').onclick = () => {
    try {
      exportConfiguration();
      note(
        'Exported model choices only. No keys, account grants, personal notes or history. Save a configuration document in your PEA folder to open on another device.',
      );
    } catch (e) {
      note(e.message);
    }
  };
  $('config-import').onclick = () =>
    run(async () => {
      const config = parseConfiguration($('shared-config').value, p()),
        s = state(),
        who = p();
      const chosen = {};
      for (const [role, m] of Object.entries(config.models)) {
        const id = m.provider === 'local' ? 'local:' + m.id : m.id;
        if (role !== 'image' && ![...s.localModels, ...s.models].some((x) => x.id === id))
          throw new ServiceError('Connect this device and load the matching model catalogue first.');
        chosen[role] = id;
      }
      if (
        !(await review(
          'Apply shared model choices',
          JSON.stringify(config, null, 2) +
            '\n\nApplies only listed model choices in this profile. Credentials, sharing permissions, persona, conversations and tasks stay unchanged. No model request is made.',
        ))
      )
        return;
      if (who !== p()) throw new ServiceError('Profile changed.');
      Object.assign(s, chosen);
      s.approvals.clear();
      render();
      note(
        'Applied this configuration snapshot. Nothing was sent to a model. Edits on other devices require another explicit import.',
      );
    });
  $('config-save').onclick = () => {
    try {
      draft(false, exportConfiguration());
      $('draft-title').value = 'PEA configuration · ' + p();
    } catch (e) {
      note(e.message);
    }
  };
  $('config-from-file').onclick = () => {
    const f = hooks.selected();
    try {
      parseConfiguration(f?.content, p());
      $('shared-config').value = f.content;
      render();
      present($('connections'));
      $('config-group').open = true;
    } catch (e) {
      note(e.message);
    }
  };
  $('connections-open').onclick = $('collab-config').onclick = () => {
    render();
    present($('connections'));
  };
  $('router-connect').onclick = () =>
    run(async () => {
      const key = $('router-key').value.trim();
      $('router-key').value = '';
      if (!/^sk-or-v1-[A-Za-z0-9_-]{16,}$/.test(key))
        throw new ServiceError('Enter an OpenRouter API key, not a membership login.');
      const who = p();
      busy(true);
      const models = await service.catalogue(key);
      if (who !== p()) return;
      const s = state();
      s.key = key;
      s.models = models;
      s.keyKept = false;
      s.approvals.clear();
      const kept = await keepRouter(s, who);
      note(
        'OpenRouter verified. Choose Chat and Greenhouse models independently; no inference was requested.' +
          (kept ? ' The key is kept in your encrypted library.' : ''),
      );
    });
  $('local-connect').onclick = () =>
    run(async () => {
      const key = $('local-token').value.trim();
      $('local-token').value = '';
      const who = p(),
        models = await local.catalogue(key);
      if (who !== p()) return;
      const s = state();
      s.localKey = key;
      s.localModels = models;
      s.approvals.clear();
      const kept = keepLocal(key);
      hooks.localChanged?.();
      note(
        'Local model list loaded. Choose Local models for Chat and/or Greenhouse. No inference or cloud request was made.' +
          (kept ? ' The connection token is remembered on this browser.' : ''),
      );
    });
  $('local-forget').onclick = () => {
    stop();
    // Every profile's copy goes, or the next one opened would quietly connect again.
    for (const s of sessions.values()) {
      s.localKey = '';
      s.localModels = [];
      s.approvals.clear();
    }
    forgetLocalToken();
    $('local-remember').checked = false;
    render();
    hooks.localChanged?.();
    note('Forgot the local server token, in this tab and on this browser.');
  };
  $('local-remember').checked = Boolean(loadLocalToken());
  $('local-remember').onchange = () => {
    if (!$('local-remember').checked) {
      forgetLocalToken();
      return note('The connection token is no longer remembered on this browser. This tab stays connected.');
    }
    const key = localKey();
    if (!key) return note('Paste the token and connect. It will be remembered on this browser.');
    note(
      keepLocal(key)
        ? 'The connection token is remembered on this browser.'
        : 'This browser refused to keep the token. It stays in this tab only.',
    );
  };
  $('context-clear').onclick = () => {
    currentAttachment = null;
    render();
  };
  $('router-forget').onclick = () => {
    stop();
    const s = state();
    s.key = '';
    s.models = [];
    s.keyKept = false;
    s.approvals.clear();
    $('router-key').value = '';
    wanted.delete(p());
    render();
    // The kept copy goes too, or the next unlock would quietly connect again.
    Promise.resolve(lib()?.forget(routerSecret(p()))).then(
      () =>
        note(
          'Forgot this key, in this tab and in your library. Revoke it in OpenRouter to disable it elsewhere.',
        ),
      () => note('Forgot this tab’s key, but the copy in your library could not be removed. Try again.'),
    );
  };
  $('router-remember').onchange = async () => {
    const who = p(),
      s = state();
    const want = $('router-remember').checked;
    if (want) wanted.add(who);
    else wanted.delete(who);
    try {
      if (!want) {
        await lib()?.forget(routerSecret(who));
        s.keyKept = false;
        note('The OpenRouter key is no longer kept in your library. It stays in this tab until you reload.');
      } else if (!lib()?.open()) {
        wanted.delete(who);
        note('Set or unlock a passphrase under Past chats & memory first. The key was not kept.');
      } else if (s.key) {
        if (await keepRouter(s, who)) note('The OpenRouter key is now kept in your encrypted library.');
      } else note('The next key you verify will be kept in your encrypted library.');
    } catch {
      if (s.keyKept) wanted.add(who);
      else wanted.delete(who);
      note('The library could not be changed. Nothing was kept or removed.');
    }
    render();
  };
  for (const [id, field] of [
    ['chat-model', 'chat'],
    ['collaboration-model', 'collaboration'],
    ['coding-model', 'coding'],
    ['image-model', 'image'],
  ])
    $(id).onchange = () => {
      state()[field] = $(id).value;
      state().approvals.clear();
      remember();
      render();
    };
  $('model-filter').oninput = () => render();
  // One press chooses the only local model for Chat. It is the owner's press that chooses it: PEA
  // never picks a model by itself, and nothing is sent to the model by choosing.
  for (const button of document.querySelectorAll('.use-only-model'))
    button.onclick = () => {
      const only = onlyLocalModel();
      if (!only) return;
      state().chat = only.id;
      state().approvals.clear();
      remember();
      render();
      note(`${only.name} is now the Chat model. Nothing was sent to it.`);
    };
  $('allow-data').onchange = () => {
    state().allowData = $('allow-data').checked;
    state().approvals.clear();
  };
  $('share-intro').onchange = () => {
    state().shareIntro = $('share-intro').checked;
    state().approvals.clear();
    remember();
  };
  for (const [id, field] of [
    ['share-calendar', 'shareCalendar'],
    ['share-mail', 'shareMail'],
    ['share-pea-files', 'sharePeaFiles'],
    ['share-todos', 'shareTodos'],
  ])
    $(id).onchange = () => {
      state()[field] = $(id).checked;
      state().approvals.clear();
      remember();
      if (field === 'sharePeaFiles' && !state().sharePeaFiles && currentAttachment?.peaAuto)
        currentAttachment = null;
    };
  $('today-refresh').onclick = () => run(refreshToday);
  $('greenhouse-role').onchange = () => {
    state().role = $('greenhouse-role').value;
    remember();
    render();
  };
  $('request-stop').onclick = stop;
  $('image-catalogue').onclick = () =>
    run(async () => {
      const result = await service.call('router', '/api/v1/images/models', { max: 4000000 });
      imageCatalog = (result.data ?? []).filter(
        (m) => /^[A-Za-z0-9_.:/-]{1,180}$/.test(m.id) && !m.id.includes('..'),
      );
      $('image-model').replaceChildren(
        new Option('Not configured', ''),
        ...imageCatalog.map((m) => new Option(m.name, m.id)),
      );
      note('Image catalogue loaded. No generation requested.');
    });
  // The Google boxes are the same for every profile; they are remembered as they are changed.
  $('google-client').value = choices.google.client;
  $('google-calendar-access').checked = choices.google.calendar;
  $('google-calendar-write').checked = choices.google.write;
  $('google-mail-access').checked = choices.google.mail;
  for (const id of ['google-client', 'google-calendar-access', 'google-calendar-write', 'google-mail-access'])
    $(id).addEventListener('change', remember);
  $('choices-forget').onclick = () => {
    forgetChoices();
    choices = loadChoices();
    forgetLocalToken();
    $('local-remember').checked = false;
    note(
      'Forgot the choices and the connection token remembered on this browser. What is set in this tab stays until you reload.',
    );
  };
  $('google-connect').onclick = () => run(googleConnect);
  $('google-forget').onclick = () => {
    stop();
    const s = state();
    s.google = null;
    s.workspace = null;
    s.roots = [];
    s.calendar = [];
    s.ownEvents = [];
    s.mail = [];
    s.scheduleAt = 0;
    hooks.setSchedule([], [], false, false);
    currentAttachment = null;
    selectedCleanup.clear();
    hooks.setFiles([]);
    render();
    note('Forgot Google access in this tab. Revoke PEA in your Google account to withdraw the remote grant.');
  };
  $('drive-use').onclick = () =>
    run(async () => {
      const s = state(),
        g = googleSession(),
        w = s.roots[Number($('drive-root').value)];
      if ($('drive-root').value === '' || !w) throw new ServiceError('Choose a folder.');
      await service.member(w.folder.id, w, g.token);
      s.workspace = w;
      await refresh();
    });
  $('drive-create').onclick = () =>
    run(async () => {
      const s = state(),
        g = googleSession(),
        name = $('drive-name').value,
        who = p();
      if (!safeName(name)) throw new ServiceError('Choose a valid folder name.');
      if (
        !(await review(
          'Create your PEA folder',
          `${g.account} · ${who}\n\nCreate “${name}” in Google Drive. No files are moved and no sharing permissions change. Work and Personal have separate spaces. If a connection fails, discover existing PEA folders before retrying.`,
        ))
      )
        return;
      if (who !== p()) throw new ServiceError('Profile changed.');
      busy(true);
      s.workspace = await service.createRoot(name, who, g.account, g.token);
      s.roots = await service.discover(who, g.account, g.token);
      await refresh();
    });
  $('drive-refresh').onclick = () => run(refresh);
  $('cleanup').onclick = () => run(cleanup);
  $('confirm-created').onclick = () => run(confirmCreated);
  $('new-doc').onclick = () => draft(false);
  $('new-form').onclick = () => draft(true);
  $('use-reply-doc').onclick = () =>
    draft(
      false,
      hooks
        .history('greenhouse')
        .filter((m) => m.role === 'assistant' && !m.incomplete)
        .at(-1)?.text ?? '',
    );
  $('draft-create').onclick = () => run(createDraft);
  $('rename-confirm').onclick = () =>
    run(async () => {
      const f = hooks.selected(),
        s = state(),
        g = googleSession(),
        name = $('rename-file').value;
      if (!f?.live) throw new ServiceError('Select a live PEA file.');
      if (!safeName(name)) throw new ServiceError('Choose a valid name.');
      if (
        !(await review(
          'Rename inside PEA',
          `${g.account}\n${f.name} → ${name}\nIn ${s.workspace.folder.title}`,
        ))
      )
        return;
      await service.change({ kind: 'rename', file: f, name }, s.workspace, g.token);
      await refresh();
    });
  $('github-connect').onclick = () =>
    run(async () => {
      const token = $('github-token').value.trim(),
        repo = $('github-repo').value.trim(),
        who = p();
      $('github-token').value = '';
      busy(true);
      const g = await githubInspect(repo, token);
      if (who === p()) {
        state().github = g;
        state().githubRepo = g.repo;
        remember();
      }
      note(
        'Verified ' + g.repo + ' · ' + (g.private ? 'private' : 'PUBLIC') + '. Token kept in this tab only.',
      );
    });
  $('github-forget').onclick = () => {
    state().github = null;
    $('github-token').value = '';
    note('Forgot the GitHub token locally.');
  };
  $('github-deliver').onclick = () => run(githubDeliver);
  window.addEventListener('pagehide', () => {
    nonce++;
    controller?.abort();
    $('review').close();
    for (const s of sessions.values()) s.approvals.clear();
    if (previewURL) URL.revokeObjectURL(previewURL);
    if (generatedURL) URL.revokeObjectURL(generatedURL);
  });
  render();
  // After the rest of the page has started: connect with the remembered token, if there is one.
  setTimeout(() => void restoreLocal(), 0);
  return {
    chat,
    compose,
    open,
    attach,
    maybeAutoAttach,
    render,
    run,
    review,
    writeDocument,
    // Whether this profile's Google sign-in may add events right now, and to whose calendar.
    eventAccount() {
      const g = state().google;
      return g && g.expires > Date.now() && g.calendarWrite ? g.account : null;
    },
    // Adds an event the owner has just approved. Returns null if it could not be added.
    addEvent(draft, id, onWork = () => {}) {
      const who = p(),
        work = beginWork(performance.now(), 'Calendar');
      workStep(work, 'shield', `You approved adding “${draft.title}” to your main Google calendar`);
      workWaiting(work, 'Asking Google to add the event…');
      onWork(work);
      return run(async () => {
        try {
          const g = googleSession();
          if (!g.calendarWrite)
            throw new ServiceError('Calendar changes are not connected for this profile.');
          const added = await service.addEvent(g.token, who, draft, id);
          workStep(
            work,
            'calendar',
            added.already
              ? 'Google answered that this event was already there from an earlier try'
              : 'Google added the event',
          );
          workWaiting(work, 'Reading your coming events again…');
          onWork(work);
          // The Upcoming card should show it; a failed refresh does not undo the event.
          if (who === p()) await refreshToday().catch(() => {});
          endWork(
            work,
            'done',
            'check',
            added.already
              ? 'Nothing was added twice. Nobody was invited.'
              : 'Nobody was invited, and Google was asked to send no notices.',
            performance.now(),
          );
          onWork(work);
          return added;
        } catch (error) {
          endWork(
            work,
            'failed',
            'warn',
            'The event may not have been added. Trying again is safe: it cannot be added twice.',
            performance.now(),
          );
          onWork(work);
          throw error;
        }
      });
    },
    // The event a ref meant in the list the model was last given, or null.
    ownEvent: (ref) => sharedOwnEvents().find((e) => e.ref === ref) ?? null,
    // The event as it is in the calendar now, for the owner to review. Null if PEA may not touch it.
    currentOwnEvent(id) {
      const who = p();
      return run(async () => {
        const g = googleSession();
        if (!g.calendarWrite) throw new ServiceError('Calendar changes are not connected for this profile.');
        return service.ownEventNow(g.token, who, id);
      });
    },
    // Carries out a reviewed change or removal on exactly the version the owner saw.
    editEvent(event, edit, onWork = () => {}) {
      const who = p(),
        removing = edit.op === 'delete',
        work = beginWork(performance.now(), 'Calendar');
      workStep(work, 'calendar', 'Read the event as it is in your calendar now, for your review');
      workStep(
        work,
        'shield',
        `You approved ${removing ? 'removing' : 'changing'} “${event.title}” in your main Google calendar`,
      );
      workWaiting(work, 'Checking that the event has not changed since your review…');
      onWork(work);
      return run(async () => {
        let asked = false;
        try {
          const g = googleSession();
          if (!g.calendarWrite)
            throw new ServiceError('Calendar changes are not connected for this profile.');
          const now = await service.ownEventNow(g.token, who, event.id);
          if (now.etag !== event.etag) {
            endWork(
              work,
              'failed',
              'warn',
              'The event changed after you reviewed it. Nothing was changed.',
              performance.now(),
            );
            onWork(work);
            throw new ServiceError(
              'The event changed after you reviewed it. Nothing was changed. Review it again.',
            );
          }
          workStep(work, 'check', 'The event is the same as the one you reviewed');
          workWaiting(work, removing ? 'Asking Google to remove it…' : 'Asking Google to change it…');
          onWork(work);
          asked = true;
          const done = removing
            ? await service.deleteEvent(g.token, who, now)
            : await service.changeEvent(g.token, who, now, edit);
          workStep(
            work,
            'calendar',
            removing
              ? done.already
                ? 'Google answered that the event was already gone'
                : 'Google removed the event'
              : 'Google changed the title and times. Its notes stay as they were.',
          );
          workWaiting(work, 'Reading your coming events again…');
          onWork(work);
          if (who === p()) await refreshToday().catch(() => {});
          endWork(work, 'done', 'check', 'Google was asked to send no notices.', performance.now());
          onWork(work);
          return done;
        } catch (error) {
          endWork(
            work,
            'failed',
            'warn',
            asked
              ? 'Google did not confirm it. Look in your calendar before trying again.'
              : 'The event could not be checked. Nothing was changed.',
            performance.now(),
          );
          onWork(work);
          throw error;
        }
      });
    },
    currentDocument: () => state().currentDoc?.draft ?? null,
    forgetDocument() {
      state().currentDoc = null;
    },
    prepareDocument(proposal) {
      if ($('draft').open) throw new ServiceError('Close the current document draft first.');
      draft(proposal.kind === 'form', proposal.content);
      $('draft-title').value = proposal.title;
    },
    contextChanged() {
      for (const s of sessions.values()) s.approvals.clear();
    },
    isBusy: () => operationActive,
    localKey,
    // Whether a Google account is connected in this tab. The account itself is not handed out.
    googleAccount: () => Boolean(state().google?.account),
    libraryChanged,
    readPage: (key, url) => local.read(key, url),
    searchWeb: (key, provider, providerKey, query) => local.search(key, provider, providerKey, query),
    voices: (key, provider, providerKey, library) => local.voices(key, provider, providerKey, library),
    speak: (key, request, signal) => local.speak(key, request, signal),
    update: (key, body) => local.update(key, body),
    macReminders: (key, list) => local.reminders(key, list),
    projects: (key, body) => local.projects(key, body),
    model(surface, role) {
      const s = state();
      if (!s.key && !s.localKey) return null;
      const id = surface === 'chat' ? s.chat : s[role];
      return (
        [...s.localModels, ...s.models].find((m) => m.id === id) ??
        (role === 'image' ? imageCatalog.find((m) => m.id === id) : null)
      );
    },
    setRole(role) {
      state().role = role;
      currentAttachment = null;
      render();
    },
    profileChanged() {
      stop();
      if (previewURL) URL.revokeObjectURL(previewURL);
      if (generatedURL) URL.revokeObjectURL(generatedURL);
      previewURL = generatedURL = null;
      currentAttachment = null;
      selectedCleanup.clear();
      $('generated-output').replaceChildren();
      pictureWork = null;
      showWork($('generated-activity'), null);
      showToday();
      showGithub();
      $('connection-note').textContent = '';
      $('role-suggestion').hidden = true;
      $('router-key').value = '';
      $('github-token').value = '';
      $('local-token').value = '';
      $('shared-config').value = '';
      render();
      void restoreLocal();
      void restoreRouter();
    },
    selectCheckbox(file) {
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.className = 'file-select';
      check.setAttribute('aria-label', 'Select ' + file.name + ' for cleanup');
      check.onclick = (e) => e.stopPropagation();
      check.onchange = () => {
        if (check.checked) selectedCleanup.add(file.id);
        else selectedCleanup.delete(file.id);
      };
      return check;
    },
  };
}
