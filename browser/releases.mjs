export function validRepository(repo) {
  return (
    typeof repo === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(repo) &&
    !repo.includes('..')
  );
}
export function versionParts(value) {
  if (typeof value !== 'string' || value.length > 80) return null;
  const m = value
    .replace(/^v/, '')
    .match(
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/,
    );
  if (
    !m ||
    m.slice(1, 4).some((n) => !Number.isSafeInteger(Number(n))) ||
    m[4]?.split('.').some((n) => /^\d+$/.test(n) && n.length > 1 && n.startsWith('0'))
  )
    return null;
  return { numbers: m.slice(1, 4).map(Number), pre: m[4]?.split('.') ?? [] };
}
export function newerVersion(candidate, current) {
  const a = versionParts(candidate),
    b = versionParts(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a.numbers[i] !== b.numbers[i]) return a.numbers[i] > b.numbers[i];
  if (!a.pre.length || !b.pre.length) return !a.pre.length && !!b.pre.length;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    if (a.pre[i] === undefined) return false;
    if (b.pre[i] === undefined) return true;
    if (a.pre[i] === b.pre[i]) continue;
    const an = /^\d+$/.test(a.pre[i]),
      bn = /^\d+$/.test(b.pre[i]);
    return an && bn ? Number(a.pre[i]) > Number(b.pre[i]) : an !== bn ? !an : a.pre[i] > b.pre[i];
  }
  return false;
}
// The newest published release in GitHub's list of releases for `repository`, pre-releases
// included, or null when none is usable. GitHub's "latest release" answer leaves pre-releases out,
// so a project that has only published release candidates looks as if it had published nothing.
// A row counts only if it is not a draft, its tag is a version, and its page is that tag's page
// in this repository.
export function newestRelease(rows, repository) {
  if (!Array.isArray(rows) || !validRepository(repository)) return null;
  let best = null;
  for (const row of rows.slice(0, 30)) {
    if (!row || typeof row !== 'object' || row.draft !== false) continue;
    if (typeof row.tag_name !== 'string' || !/^v[0-9A-Za-z.+-]{1,80}$/.test(row.tag_name)) continue;
    if (!versionParts(row.tag_name)) continue;
    if (row.html_url !== `https://github.com/${repository}/releases/tag/${row.tag_name}`) continue;
    if (best && !newerVersion(row.tag_name, best.tag)) continue;
    best = {
      tag: row.tag_name,
      prerelease: row.prerelease === true,
      url: row.html_url,
      notes: typeof row.body === 'string' ? row.body : '',
    };
  }
  return best;
}
// What to tell the owner after comparing this build with the published releases. Nothing is ever
// installed from here. `installedPublished` is true or false when a stable build's own version
// was looked up, and null when it was not or could not be.
// `prerelease` says the newest published release is a release candidate, not a stable version.
export function releaseStanding({
  installed,
  channel,
  latest,
  installedPublished = null,
  prerelease = false,
}) {
  if (!versionParts(installed) || !versionParts(latest))
    throw new Error('No eligible stable release returned.');
  const shown = latest.startsWith('v') ? latest : 'v' + latest;
  if (prerelease) {
    if (newerVersion(latest, installed))
      return {
        level: 'update',
        text: `Available: ${shown}, a pre-release for trying out. Read its notes first. Where the person who runs this PEA has turned it on, Connections → PEA updates installs it after your review; otherwise use the update command. No installation has started.`,
      };
    return {
      level: 'info',
      text:
        installed.replace(/^v/, '') === shown.slice(1)
          ? `This copy is the newest published release, ${shown}, a pre-release. No stable version has been published yet; nothing was changed.`
          : `This ${channel} build (${installed}) is ahead of the newest published release, ${shown}, a pre-release. Nothing was changed.`,
    };
  }
  if (channel === 'stable' && installedPublished === false)
    return {
      level: 'warning',
      text: `Version ${installed} is no longer among the published releases, so it may have been withdrawn. The latest published stable version is ${shown}. Read its notes and consider changing version; nothing was changed.`,
    };
  if (newerVersion(latest, installed))
    return {
      level: 'update',
      text: `Available: ${shown}. Read its notes first. Where the person who runs this PEA has turned it on, Connections → PEA updates installs it after your review; otherwise download the signed package, then stage and activate it locally. No installation has started.`,
    };
  if (newerVersion(installed, latest))
    return channel === 'stable'
      ? {
          level: 'warning',
          text: `This build (${installed}) is newer than the latest published stable version (${shown}). A stable version that is no longer the latest may have been withdrawn; check the releases page. Nothing was changed.`,
        }
      : {
          level: 'info',
          text: `This ${channel} build (${installed}) is ahead of the latest published stable version (${shown}), as expected. Nothing was changed.`,
        };
  return {
    level: 'info',
    text: `Latest published stable version: ${shown}. No newer version was identified; nothing was changed.`,
  };
}
export function publicBuild(value) {
  if (
    !value ||
    !versionParts(value.version) ||
    !['development', 'prerelease', 'stable'].includes(value.channel) ||
    !['source', 'development', 'release'].includes(value.environment) ||
    (value.commit !== null && !/^[a-f0-9]{40}$/.test(value.commit)) ||
    ![true, false, null].includes(value.modified) ||
    (value.repository !== null && !validRepository(value.repository))
  )
    throw new Error('Invalid public build identity.');
  return value;
}
export function suggestionDraft({ kind, title, description, version, commit }) {
  if (
    !['suggestion', 'bug'].includes(kind) ||
    typeof title !== 'string' ||
    !title.trim() ||
    title.length > 120 ||
    typeof description !== 'string' ||
    !description.trim() ||
    description.length > 4000
  )
    throw new Error('Use a title and a description under 4,000 characters.');
  if (
    /sk-or-v1-|sk-proj-|github_pat_|ghp_[A-Za-z0-9]|AIza[A-Za-z0-9]|-----BEGIN .*PRIVATE KEY/i.test(
      title + description,
    )
  )
    throw new Error('Remove credential-like text before sharing.');
  return `## ${kind === 'bug' ? 'Problem' : 'Suggestion'}\n${title.trim()}\n\n${description.trim()}\n\n## Build\nPEA Web ${version} · ${commit?.slice(0, 7) ?? 'source identity unavailable'}\n\n## Expected outcome / acceptance\n- [ ] Describe the outcome before implementation.\n\nNo chats, account details, files, keys, logs or machine identifiers were attached automatically. Review this draft for personal information before submitting.\n`;
}
export function issueURL(repo, title, body) {
  if (!validRepository(repo)) throw new Error('Public upstream is not configured.');
  const url = new URL(`https://github.com/${repo}/issues/new`);
  url.search = new URLSearchParams({ title, body });
  if (url.href.length > 7000)
    throw new Error('Download the proposal instead; this draft is too long for an issue link.');
  return url.href;
}

// A different commit is not necessarily an ancestor or an eligible signed release.
export function compareMain(remote, current, modified) {
  if (typeof remote !== 'string' || !/^[a-f0-9]{40}$/.test(remote))
    throw new Error('Invalid main-branch commit returned.');
  if (current !== null && (typeof current !== 'string' || !/^[a-f0-9]{40}$/.test(current)))
    throw new Error('Invalid installed commit.');
  if (current === null)
    return `Upstream main: ${remote.slice(0, 7)}. This build has no verified commit identity; compare manually. No update was installed.`;
  if (remote !== current)
    return `Upstream main ${remote.slice(0, 7)} differs from this build ${current.slice(0, 7)}. This does not establish ancestry or release eligibility. Review the changelog and signed releases; no update was installed.`;
  return `Upstream main matches commit ${remote.slice(0, 7)}${modified === true ? ', but this build has local modifications' : modified === null ? ', but local integrity is unknown' : ''}. No update was installed.`;
}
