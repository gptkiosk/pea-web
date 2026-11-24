// "Move this profile" in Past chats & memory: write one encrypted backup file of the profile in
// view, or bring one in. Bringing in only adds, after the owner has read every addition; nothing
// already here is changed or removed. The format is the shared one in docs/CONTRACTS.md.
import {
  backupLimits,
  describeBackup,
  describeFull,
  describeFullRestore,
  describeKeys,
  describeRestore,
  fullLimits,
  gatherBackup,
  gatherKeys,
  gatherSettings,
  keyNames,
  keyPassphrase,
  openBackup,
  openFull,
  planRestore,
  planSettings,
  sealBackup,
  sealFull,
} from './backup.mjs';
import { ServiceError } from './connections.mjs';

const $ = (id) => document.getElementById(id);

export function installBackup({
  profile,
  review,
  isBusy,
  notice,
  memory,
  todos,
  canon,
  days,
  decks,
  keys = () => ({}),
  offerKeys = () => [],
}) {
  let working = false,
    url = null;
  const say = (text) => ($('portable-note').textContent = text);
  const usable = () => ['work', 'personal'].includes(profile());
  const forgetFile = () => {
    if (url) URL.revokeObjectURL(url);
    url = null;
    $('portable-download').hidden = true;
    $('portable-download').removeAttribute('href');
  };

  // Everything this browser holds for the profile in view, in the travelling shape, with what
  // could not be read. Throws a plain reason when a backup cannot be made or compared at all.
  function gather(now) {
    if (!usable())
      throw new ServiceError('Choose Work or Personal first. A Blended profile has nothing of its own.');
    const library = memory().portable();
    if (!library) throw new ServiceError('The saved library is not ready. Finish or resolve its save first.');
    const list = todos().portable();
    return {
      library,
      todosLocked: list === null,
      content: gatherBackup({
        profile: profile(),
        introduction: library.introduction,
        memories: library.memories,
        todos: list ?? [],
        cards: canon().cards(),
        days: days().entries(),
        decks: decks().all(),
        now,
      }),
    };
  }
  const lockedNote =
    '\n\nTo-dos are not included: the saved board is locked. Unlock it under Today first if you want them in the file.';

  function render() {
    const on = usable();
    for (const id of [
      'portable-pass',
      'portable-make',
      'portable-file',
      'portable-open-pass',
      'portable-open',
    ])
      $(id).disabled = !on || working;
    for (const id of ['full-pass', 'full-keys', 'full-make', 'full-file', 'full-open-pass', 'full-open'])
      $(id).disabled = working;
    $('portable-status').textContent = on
      ? `This is about the ${profile() === 'work' ? 'Work' : 'Personal'} profile only. Switch profile to move the other one.`
      : 'Choose Work or Personal to move a profile. A Blended profile has nothing of its own.';
  }
  async function guarded(action) {
    if (working || isBusy()) return say('Finish the current request first.');
    working = true;
    render();
    try {
      await action();
    } catch (error) {
      const why = error instanceof ServiceError ? error.message : 'That did not work. Nothing was changed.';
      say(why);
      notice(why);
    } finally {
      working = false;
      render();
    }
  }

  $('portable-make').onclick = () =>
    guarded(async () => {
      const input = $('portable-pass'),
        passphrase = input.value;
      input.value = '';
      forgetFile();
      if (passphrase.length < 12 || passphrase.length > 256)
        throw new ServiceError('Choose a passphrase of 12–256 characters for the file. Nothing was written.');
      const who = profile(),
        { content, todosLocked } = gather(Date.now());
      if (!(await review('Back up this profile?', describeBackup(content) + (todosLocked ? lockedNote : ''))))
        return say('No backup was made.');
      const file = await sealBackup(content, passphrase);
      if (who !== profile()) throw new ServiceError('Profile changed. No backup was made.');
      url = URL.createObjectURL(new Blob([file], { type: 'application/json' }));
      const link = $('portable-download');
      link.href = url;
      link.download = `pea-backup-${who}-${new Date(content.made).toISOString().slice(0, 10)}.json`;
      link.hidden = false;
      say('Backup ready. Download it and keep the passphrase somewhere safe; PEA cannot recover it.');
    });

  $('portable-open').onclick = () =>
    guarded(async () => {
      const input = $('portable-open-pass'),
        passphrase = input.value,
        file = $('portable-file').files?.[0];
      input.value = '';
      if (!file) throw new ServiceError('Choose a backup file first.');
      if (file.size > backupLimits.fileCharacters)
        throw new ServiceError('Choose a backup file under 1.2 MB.');
      const who = profile(),
        now = Date.now(),
        incoming = await openBackup(await file.text(), passphrase);
      if (who !== profile()) throw new ServiceError('Profile changed. Nothing was added.');
      if (incoming.profile !== who)
        throw new ServiceError(
          `This backup is of a ${incoming.profile === 'work' ? 'Work' : 'Personal'} profile. Switch to that profile to bring it in. Nothing was added.`,
        );
      const here = gather(now),
        plan = planRestore(here.content, incoming, { now, memoryRoom: here.library.memoryRoom });
      let extra = '';
      if (here.todosLocked && incoming.todos.length) {
        plan.todos = { add: [], same: 0, differ: [], noRoom: 0, skipped: {} };
        extra +=
          '\n\nTo-dos in this file are not added: the saved board is locked. Unlock it under Today and bring the file in again.';
      }
      if (plan.memories.add.length && !here.library.threadRoom) {
        plan.memories = { add: [], same: plan.memories.same, differ: [], noRoom: 0, skipped: {} };
        extra +=
          '\n\nMemories in this file are not added: the library already holds 40 conversations, and brought-in memories need one. Forget a conversation and bring the file in again.';
      }
      plan.nothing =
        !plan.introduction.changes.length &&
        ['memories', 'todos', 'history', 'days', 'decks'].every((name) => !plan[name].add.length);
      if (plan.nothing && !extra) {
        $('portable-file').value = '';
        return say('Everything in this file is already here. Nothing was added.');
      }
      if (!(await review('Bring in this backup?', describeRestore(plan) + extra)))
        return say('Nothing was added.');
      // What is here must still be what the owner compared against.
      if (who !== profile() || JSON.stringify(gather(now).content) !== JSON.stringify(here.content))
        throw new ServiceError(
          'Something here changed while you were reading. Nothing was added; bring the file in again.',
        );
      const done = [];
      try {
        // The library goes first: it is the one step that can refuse, and then nothing else is touched.
        const answers = plan.introduction.changes.length,
          saved =
            answers || plan.memories.add.length
              ? await memory().bringIn({
                  introduction: answers ? plan.introduction.next : null,
                  memories: plan.memories.add,
                })
              : true;
        if (answers) done.push(`${answers} interview ${answers === 1 ? 'answer' : 'answers'}`);
        if (plan.memories.add.length) done.push(`${plan.memories.add.length} memories`);
        if (plan.todos.add.length) done.push(`${todos().bringIn(plan.todos.add)} to-dos`);
        if (plan.history.add.length) done.push(`${canon().bringIn(plan.history.add)} history cards`);
        if (plan.days.add.length) done.push(`${days().bringIn(plan.days.add)} day lines`);
        if (plan.decks.add.length) done.push(`${decks().bringIn(plan.decks.add)} deck projects`);
        $('portable-file').value = '';
        say(
          `Added: ${done.join(', ') || 'nothing'}.${saved ? '' : ' Answers and memories are in this tab only; turn on encrypted saving to keep them.'}`,
        );
      } catch (error) {
        throw new ServiceError(
          `${error instanceof ServiceError ? error.message : 'One part could not be added.'} Added before that: ${done.join(', ') || 'nothing'}. Bringing the file in again adds only what is still missing.`,
        );
      }
    });

  // Everything in one file: this browser's settings and both profiles. Under Settings.
  const lastKey = 'pea-full-backup-made-v1',
    people = ['personal', 'work'];
  let fullURL = null;
  const tell = (text) => ($('full-note').textContent = text);
  const forgetFull = () => {
    if (fullURL) URL.revokeObjectURL(fullURL);
    fullURL = null;
    $('full-download').hidden = true;
    $('full-download').removeAttribute('href');
  };
  function showLast() {
    let at = 0;
    try {
      at = Number(globalThis.localStorage.getItem(lastKey)) || 0;
    } catch {
      // Not known.
    }
    $('full-last').textContent = at
      ? `Last backup file made in this browser: ${new Date(at).toLocaleString()}.`
      : 'No backup file has been made in this browser yet.';
  }
  // Both profiles in the travelling shape. The library must be open, whichever profile is in view.
  function gatherAll(now) {
    const first = memory().portable('personal');
    if (!first)
      throw new ServiceError(
        usable()
          ? 'The saved library is not ready. Finish or resolve its save first.'
          : 'Choose Work or Personal first, then back up or restore.',
      );
    const list = todos().portable();
    const profiles = Object.fromEntries(
      people.map((who) => [
        who,
        gatherBackup({
          profile: who,
          introduction: memory().portable(who).introduction,
          memories: first.memories,
          todos: list ?? [],
          cards: who === 'personal' ? canon().cards(true) : [],
          days: who === 'personal' ? days().entries(true) : [],
          decks: decks().all(),
          now,
        }),
      ]),
    );
    return { library: first, todosLocked: list === null, profiles };
  }
  async function guardedFull(action) {
    if (working || isBusy()) return tell('Finish the current request first.');
    working = true;
    render();
    try {
      await action();
    } catch (error) {
      const why = error instanceof ServiceError ? error.message : 'That did not work. Nothing was changed.';
      tell(why);
      notice(why);
    } finally {
      working = false;
      render();
    }
  }
  $('full-make').onclick = () =>
    guardedFull(async () => {
      const input = $('full-pass'),
        passphrase = input.value,
        withKeys = $('full-keys').checked;
      input.value = '';
      // The box is a choice for one file, never a setting.
      $('full-keys').checked = false;
      forgetFull();
      if (passphrase.length < 12 || passphrase.length > 256)
        throw new ServiceError('Choose a passphrase of 12–256 characters for the file. Nothing was written.');
      if (withKeys && passphrase.length < keyPassphrase)
        throw new ServiceError(
          `A file that holds keys needs a passphrase of ${keyPassphrase} or more characters. Nothing was written.`,
        );
      const held = withKeys ? gatherKeys(keys()) : {};
      if (withKeys && !Object.keys(held).length)
        throw new ServiceError(
          'There are no keys in this tab to put in the file. Connect them under Settings first, or untick the box. Nothing was written.',
        );
      const now = Date.now(),
        { profiles, todosLocked } = gatherAll(now),
        { settings, left } = gatherSettings(),
        content = {
          made: now,
          version: $('release-version').textContent.replace(/^v/, '') || 'unknown',
          settings,
          profiles,
          ...(withKeys ? { keys: held } : {}),
        };
      if (
        !(await review('Back up everything?', describeFull(content, left) + (todosLocked ? lockedNote : '')))
      )
        return tell('No backup was made.');
      const file = await sealFull(content, passphrase);
      fullURL = URL.createObjectURL(new Blob([file], { type: 'application/json' }));
      const link = $('full-download');
      link.href = fullURL;
      link.download = `pea-everything-${new Date(now).toISOString().slice(0, 10)}.json`;
      link.hidden = false;
      try {
        globalThis.localStorage.setItem(lastKey, String(now));
      } catch {
        // The date of the last backup is a convenience only.
      }
      showLast();
      tell('Backup ready. Download it and keep the passphrase somewhere safe; PEA cannot recover it.');
    });
  $('full-open').onclick = () =>
    guardedFull(async () => {
      const input = $('full-open-pass'),
        passphrase = input.value,
        file = $('full-file').files?.[0];
      input.value = '';
      if (!file) throw new ServiceError('Choose a backup file first.');
      if (file.size > fullLimits.fileCharacters) throw new ServiceError('Choose a backup file under 3.4 MB.');
      const now = Date.now(),
        incoming = await openFull(await file.text(), passphrase),
        here = gatherAll(now),
        kept = gatherSettings().settings,
        settings = planSettings(kept, incoming.settings);
      let room = here.library.memoryRoom,
        extra = '';
      const plans = {};
      for (const who of people) {
        const plan = planRestore(here.profiles[who], incoming.profiles[who], { now, memoryRoom: room });
        if (here.todosLocked && plan.todos.add.length)
          plan.todos = { add: [], same: 0, differ: [], noRoom: 0, skipped: {} };
        if (plan.memories.add.length && !here.library.threadRoom)
          plan.memories = { add: [], same: plan.memories.same, differ: [], noRoom: 0, skipped: {} };
        room -= plan.memories.add.length;
        plan.nothing =
          !plan.introduction.changes.length &&
          ['memories', 'todos', 'history', 'days', 'decks'].every((name) => !plan[name].add.length);
        plans[who] = plan;
        if (!plan.nothing) extra += '\n\n' + describeRestore(plan);
      }
      if (here.todosLocked && people.some((who) => incoming.profiles[who].todos.length))
        extra +=
          '\n\nTo-dos in this file are not added: the saved board is locked. Unlock it under Today and restore again.';
      if (!here.library.threadRoom && people.some((who) => incoming.profiles[who].memories.length))
        extra +=
          '\n\nMemories in this file are not added: the library already holds 40 conversations, and brought-in memories need one. Forget a conversation and restore again.';
      if (people.some((who) => plans[who].todos.add.length))
        extra +=
          '\n\nTo-dos are kept the way your story board is. Unless the board is saved with a passphrase on this browser (under Today), restored to-dos last only until the page reloads; save the board first if you want to keep them.';
      const writes = Object.entries(settings.write),
        hasKeys = Boolean(incoming.keys);
      // Keys live in the tab, so they go back only when no reload is still to come.
      async function putKeys() {
        if (!(await review('Put these keys back?', describeKeys(incoming.keys)))) return 'No key was put back.';
        const put = offerKeys(incoming.keys),
          waiting = keyNames(incoming.keys).length - put.length;
        return (
          `${put.length} ${put.length === 1 ? 'key' : 'keys'} put back under Settings; press Connect for OpenRouter and GitHub.` +
          (waiting ? ` ${waiting} could not be placed: a voice key goes back once that provider is chosen under Voice providers.` : '')
        );
      }
      if (!writes.length && people.every((who) => plans[who].nothing)) {
        $('full-file').value = '';
        return tell(
          hasKeys
            ? 'Everything else in this file is already here. ' + (await putKeys())
            : 'Everything in this file is already here. Nothing was changed.',
        );
      }
      if (hasKeys) extra += '\n\n' + describeKeys(incoming.keys, writes.length > 0);
      if (
        !(await review(
          'Restore from this backup?',
          describeFullRestore(incoming, settings, plans, extra),
        ))
      )
        return tell('Nothing was changed.');
      // What is here must still be what the owner compared against.
      if (
        JSON.stringify(gatherAll(now).profiles) !== JSON.stringify(here.profiles) ||
        JSON.stringify(gatherSettings().settings) !== JSON.stringify(kept)
      )
        throw new ServiceError('Something here changed while you were reading. Nothing was changed; restore again.');
      const done = [];
      try {
        // The library goes first: it is the one step that can refuse, and then nothing else is touched.
        for (const who of people) {
          const plan = plans[who],
            answers = plan.introduction.changes.length;
          if (answers || plan.memories.add.length)
            await memory().bringIn(
              { introduction: answers ? plan.introduction.next : null, memories: plan.memories.add },
              who,
            );
          const n =
            answers +
            plan.memories.add.length +
            (plan.todos.add.length ? todos().bringIn(plan.todos.add, who) : 0) +
            (plan.history.add.length ? canon().bringIn(plan.history.add, true) : 0) +
            (plan.days.add.length ? days().bringIn(plan.days.add, true) : 0) +
            (plan.decks.add.length ? decks().bringIn(plan.decks.add, who) : 0);
          if (n) done.push(`${n} ${n === 1 ? 'item' : 'items'} added to ${who === 'work' ? 'Work' : 'Personal'}`);
        }
        for (const [name, text] of writes) globalThis.localStorage.setItem(name, text);
        if (writes.length) done.push(`${writes.length} ${writes.length === 1 ? 'setting' : 'settings'} restored`);
      } catch (error) {
        throw new ServiceError(
          `${error instanceof ServiceError ? error.message : 'One part could not be restored.'} Done before that: ${done.join(', ') || 'nothing'}. Restoring again adds only what is still missing.`,
        );
      }
      $('full-file').value = '';
      $('full-reload').hidden = !writes.length;
      tell(
        `Restored: ${done.join(', ')}.${writes.length ? ' Reload this page now: the restored settings take effect when it loads, and a change made before then could be saved over them.' : ''}` +
          (hasKeys
            ? writes.length
              ? ' Then restore from the same file again to put your keys back.'
              : ' ' + (await putKeys())
            : ''),
      );
    });
  $('full-reload').onclick = () => location.reload();
  globalThis.addEventListener('pagehide', forgetFull);
  showLast();

  render();
  return { render, profileChanged: forgetFile };
}
