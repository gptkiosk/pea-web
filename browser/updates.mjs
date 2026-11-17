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
    message: line(v.message, 400),
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
    'Your conversations, saved library and board, settings and connection token are not touched. A request that is running when PEA restarts is cut off, so finish it first.',
  ].join('\n');
}
// What to say about the last update the gateway recorded.
export function describeOutcome(op) {
  if (!op) return { text: '', level: '' };
  const to = op.targetVersion ? ` to ${op.targetVersion}` : '';
  if (op.outcome === 'succeeded')
    return { text: `Updated${to}. Reload this page to load the new version.`, level: 'ok', done: true };
  if (op.outcome === 'started') return { text: `Updating${to}…`, level: '', done: false };
  return {
    text: `The update${to} did not go through. ${op.message || 'The previous version was kept.'}`,
    level: 'warn',
    done: true,
  };
}
