// "Move this profile" in Past chats & memory: write one encrypted backup file of the profile in
// view, or bring one in. Bringing in only adds, after the owner has read every addition; nothing
// already here is changed or removed. The format is the shared one in docs/CONTRACTS.md.
import {
  backupLimits,
  describeBackup,
  describeRestore,
  gatherBackup,
  openBackup,
  planRestore,
  sealBackup,
} from './backup.mjs';
import { ServiceError } from './connections.mjs';

const $ = (id) => document.getElementById(id);

export function installBackup({ profile, review, isBusy, notice, memory, todos, canon, days, decks }) {
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

  render();
  return { render, profileChanged: forgetFile };
}
