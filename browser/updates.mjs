// Updating the installed copy from the app. Pure rules: what the gateway's answers may contain,
// and the words the owner reads before and after an update. The gateway decides everything about
// where an update comes from; the page can only ask it to look, and to install exactly the version
// it has just shown.
const version = (v) => (typeof v === 'string' && /^[0-9A-Za-z.+-]{1,80}$/.test(v) ? v : '');
const commit = (v) => (typeof v === 'string' && /^[a-f0-9]{40}$/.test(v) ? v : '');
const line = (v, most) =>
  typeof v === 'string'
    ? v
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .trim()
        .slice(0, most)
    : '';
const build = (v) => {
  const known = { version: version(v?.version), commit: commit(v?.commit) };
  return known.version && known.commit ? known : null;
};
const channelOf = (v) => (v === 'release' ? 'release' : 'development');
const stages = ['starting', 'files', 'restarting', 'checking', 'done', 'putting back', 'put back'];

// The last update as the gateway recorded it, or null.
function operation(v) {
  if (!v || typeof v !== 'object' || !Number.isSafeInteger(v.at)) return null;
  return {
    kind: v.kind === 'rollback' ? 'rollback' : 'apply',
    outcome: line(v.outcome, 60),
    at: v.at,
    target: commit(v.target),
    targetVersion: version(v.targetVersion),
    previousVersion: version(v.previousVersion),
    previous: commit(v.previous),
    message: line(v.message, 400),
    stage: stages.includes(v.stage) ? v.stage : '',
    log: (Array.isArray(v.log) ? v.log : [])
      .filter((l) => l && Number.isSafeInteger(l.at) && line(l.text, 200))
      .slice(-30)
      .map((l) => ({ at: l.at, text: line(l.text, 200) })),
    // Why a go-back that was asked for did not start, and when that was said.
    note: line(v.note, 400),
    noteAt: Number.isSafeInteger(v.noteAt) ? v.noteAt : 0,
  };
}
// GET /v1/update, made safe to show.
export function updateStatus(v) {
  if (!v || typeof v !== 'object' || v.available !== true) return { available: false };
  return {
    available: true,
    channel: channelOf(v.channel),
    prerelease: v.prerelease === true,
    installed: build(v.installed),
    operation: operation(v.operation),
  };
}
// The answer to "check", made safe to show. Null if it is not one.
export function updateOffer(v) {
  const installed = build(v?.installed);
  if (!installed || typeof v.upToDate !== 'boolean') return null;
  const target = build(v.target);
  if (!v.upToDate && !target) return null;
  const ahead =
    Number.isSafeInteger(v.target?.ahead) && v.target.ahead > 0 && v.target.ahead < 100000
      ? v.target.ahead
      : 0;
  return {
    installed,
    channel: channelOf(v.channel),
    signed: v.signed === true && channelOf(v.channel) === 'release',
    upToDate: v.upToDate,
    withdrawn: line(v.withdrawn, 200),
    target:
      v.upToDate || !target
        ? null
        : {
            ...target,
            tag:
              typeof v.target.tag === 'string' && /^v[0-9A-Za-z.+-]{1,80}$/.test(v.target.tag)
                ? v.target.tag
                : '',
            ahead,
            notes: (Array.isArray(v.target.notes) ? v.target.notes : [])
              .map((n) => line(n, 160))
              .filter(Boolean)
              .slice(0, 20),
          },
  };
}

const short = (c) => c.slice(0, 12);
const kind = (signed) => (signed ? 'a signed release' : 'an unsigned development build');
export function describeStatus(status) {
  if (!status.available)
    return 'Updating from the app is not set up for this PEA. A copy installed from the repository can still be updated with the update command.';
  const what =
    status.channel === 'release'
      ? `signed releases${status.prerelease ? ', including pre-releases' : ''}`
      : 'development builds, which are not signed';
  const now = status.installed
    ? `Installed: ${status.installed.version} (${short(status.installed.commit)}).`
    : 'The installed copy cannot be read right now; check for updates to see why.';
  return `This copy can update itself. It follows ${what}. ${now}`;
}
export function describeOffer(offer) {
  const warn = offer.withdrawn
    ? `The publisher has withdrawn the version you are running: ${offer.withdrawn} `
    : '';
  if (offer.upToDate)
    return (
      warn +
      (offer.withdrawn
        ? 'Nothing newer is published. Going back to an earlier release is done with the update command, not from here.'
        : `You are on the newest ${offer.signed ? 'signed release' : 'development build'} this copy follows. Nothing to do.`)
    );
  const t = offer.target;
  return `${warn}Version ${t.version} is available${t.tag ? ` (release ${t.tag})` : ''}: ${kind(offer.signed)}, ${t.ahead} change${t.ahead === 1 ? '' : 's'} ahead of yours.`;
}
// The review before anything is installed.
export function describeUpdate(offer, origin) {
  const t = offer.target;
  return [
    `PEA at ${origin}`,
    '',
    `Now: ${offer.installed.version} (${short(offer.installed.commit)})`,
    `After: ${t.version} (${short(t.commit)})${t.tag ? `, release ${t.tag}` : ''}`,
    '',
    offer.signed
      ? 'This is a signed release. Its manifest was checked against the release key this copy already trusts, and its tag is exactly the signed commit.'
      : 'This is a development build. It comes from the official repository at exactly the commit above. No signature is checked.',
    ...(t.notes.length ? ['', `Changes (${t.ahead}):`, ...t.notes.map((n) => '  - ' + n)] : []),
    '',
    'Approving installs exactly this version and restarts PEA on its machine. This page will lose contact for a moment and then say what happened. If PEA does not come back healthy on the new version, the previous version is put back.',
    '',
    'Your conversations, saved library and board, settings and connection token are not touched: only program files change. PEA notes your settings now and checks them again when you reload, and says what it found. A request that is running when PEA restarts is cut off, so finish it first.',
  ].join('\n');
}
// The version the last update replaced, while that update is still what is installed. Null otherwise.
export function wayBack(status) {
  const op = status?.available ? status.operation : null;
  return op &&
    op.kind === 'apply' &&
    op.outcome === 'succeeded' &&
    op.previous &&
    op.previousVersion &&
    op.target &&
    status.installed?.commit === op.target
    ? { version: op.previousVersion, commit: op.previous, from: status.installed.version }
    : null;
}
// The review before going back.
export function describeGoingBack(back, origin) {
  return [
    `PEA at ${origin}`,
    '',
    `Now: ${back.from}`,
    `After: ${back.version} (${short(back.commit)}), the version the last update replaced`,
    '',
    'Approving puts exactly that version’s program files back and restarts PEA on its machine. If PEA does not come back healthy on it, the version you have now is kept.',
    '',
    'Only program files change. Your conversations, saved library and board, settings and connection token are not touched. An older program may not understand something a newer one saved, so if you have used a new feature since updating, make a backup file first (Settings → Backup & restore).',
    '',
    'A request that is running when PEA restarts is cut off, so finish it first.',
  ].join('\n');
}
// The steps of an update or a go-back as a short list, with how far it got. `op` is the
// gateway's record; `lost` is true while the page cannot reach PEA because it is restarting.
const stepNames = [
  ['starting', 'Note where you are now'],
  ['files', 'Put the program files in place'],
  ['restarting', 'Restart PEA'],
  ['checking', 'Check PEA answers on that version'],
  ['done', 'Finished'],
];
export function updateSteps(op, lost = false) {
  const failed = op?.stage === 'putting back' || op?.stage === 'put back';
  let reached = stepNames.findIndex(([name]) => name === op?.stage);
  if (failed) reached = 3;
  if (reached < 0) reached = lost ? 2 : 0;
  if (lost && reached < 2) reached = 2;
  const done = op?.stage === 'done';
  const steps = stepNames.map(([, label], i) => ({
    label,
    state: failed && i === 3 ? 'failed' : i < reached || done ? 'done' : i === reached && !failed ? 'now' : 'todo',
  }));
  if (failed)
    steps[4] = {
      label: op.stage === 'put back' ? 'The version you had was put back' : 'Putting the version you had back',
      state: op.stage === 'put back' ? 'done' : 'now',
    };
  return { value: done || op?.stage === 'put back' ? 5 : reached, max: 5, steps, failed, ended: done || op?.stage === 'put back' };
}
// A mark for each saved setting, taken before an update and compared after the reload. The mark
// is a short number worked out from the setting's text; the text itself is not kept twice.
export function settingsMarks(settings) {
  const mark = (text) => {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return (h >>> 0).toString(16) + ':' + text.length;
  };
  return Object.fromEntries(Object.entries(settings).map(([name, text]) => [name, mark(text)]));
}
// `kept` is what was noted before: { to, marks }. `labels` names each setting.
export function describeSettingsCheck(kept, now, labels) {
  if (!kept || typeof kept !== 'object' || !kept.marks || typeof kept.marks !== 'object') return '';
  const names = Object.keys(kept.marks).filter((name) => labels.has(name)),
    gone = names.filter((name) => !Object.hasOwn(now, name)),
    changed = names.filter((name) => Object.hasOwn(now, name) && now[name] !== kept.marks[name]),
    to = version(kept.to);
  const about = to ? ` before the move to ${to}` : ' before the update';
  if (!names.length) return `No settings were saved in this browser${about}, so there was nothing to check.`;
  if (!gone.length && !changed.length)
    return `Settings checked: all ${names.length} saved in this browser are exactly as they were${about}.`;
  const list = (items) => items.map((name) => labels.get(name)).join('; ');
  return (
    `Settings checked: ${names.length - gone.length - changed.length} of ${names.length} are exactly as they were${about}.` +
    (changed.length ? ` Different now: ${list(changed)}.` : '') +
    (gone.length ? ` No longer saved: ${list(gone)}.` : '') +
    ' An update does not write settings, so a difference usually means it was changed in this browser in the meantime. A backup file made earlier can bring it back (Settings → Backup & restore).'
  );
}
// What to say about the last update the gateway recorded.
export function describeOutcome(op) {
  if (!op) return { text: '', level: '' };
  const to = op.targetVersion ? ` to ${op.targetVersion}` : '',
    back = op.kind === 'rollback';
  if (op.outcome === 'succeeded')
    return {
      text: `${back ? 'Went back' : 'Updated'}${to}. Reload this page to load ${back ? 'that' : 'the new'} version.`,
      level: 'ok',
      done: true,
    };
  if (op.outcome === 'started') return { text: `${back ? 'Going back' : 'Updating'}${to}…`, level: '', done: false };
  return {
    text: `${back ? 'Going back' : 'The update'}${to} did not go through. ${op.message || 'The previous version was kept.'}`,
    level: 'warn',
    done: true,
  };
}
