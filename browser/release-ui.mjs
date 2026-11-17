import {
  publicBuild,
  validRepository,
  suggestionDraft,
  issueURL,
  compareMain,
  newestRelease,
  releaseStanding,
} from './releases.mjs';
const $ = (id) => document.getElementById(id);
async function boundedJSON(url, max = 200000) {
  const response = await fetch(url, {
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(12000),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Release information is unavailable.');
  const reader = response.body.getReader();
  let size = 0,
    text = '';
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) throw new Error('Release response exceeds the size limit.');
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  return JSON.parse(text);
}
export async function installReleaseUI() {
  let info = null,
    download = null;
  const note = (text) => ($('release-note').textContent = text);
  function link(id, url) {
    const a = $(id);
    a.href = url;
    a.hidden = false;
  }
  function render() {
    const commit = info.commit?.slice(0, 7) ?? 'unknown';
    $('footer-product').textContent = info.organization
      ? `${info.product} · A ${info.organization} product`
      : info.product + ' · Personal Executive Assistant';
    $('footer-build').textContent =
      `v${info.version} · ${info.environment} · web ${commit} · api ${info.serverCommit?.slice(0, 7) ?? 'not connected'} · ${info.modified === true ? 'modified' : info.modified === null ? 'unverified source' : 'clean'}`;
    $('release-build').textContent = $('footer-build').textContent;
    $('feedback-open-upstream').hidden = true;
    $('release-check').disabled = !validRepository(info.repository);
    $('main-check').disabled = !validRepository(info.repository);
    $('footer-classic').hidden = info.legacyVoice !== true;
    if (info.repository) {
      link('release-upstream', `https://github.com/${info.repository}/releases`);
      if (info.commit) link('footer-source', `https://github.com/${info.repository}/commit/${info.commit}`);
    } else
      note(
        'Public upstream and production signing are not configured yet. You can read this build’s changelog and prepare a suggestion draft.',
      );
  }
  $('releases-open').onclick = () => {
    $('release-dialog').showModal();
  };
  $('changelog-open').onclick = async () => {
    $('release-dialog').showModal();
    try {
      const r = await fetch('CHANGELOG.md', { credentials: 'omit', redirect: 'error', cache: 'no-store' });
      if (!r.ok) throw new Error();
      const text = await r.text();
      if (text.length > 100000) throw new Error();
      $('release-notes').textContent = text;
    } catch {
      note('This build’s changelog could not be loaded.');
    }
  };
  $('release-check').onclick = async () => {
    if (!info?.repository) return;
    $('release-check').disabled = true;
    note('Checking the configured public upstream. No keys or chats are sent.');
    try {
      // A stable build is compared with the latest stable release only. Any other build is
      // compared with the newest release of either kind, because GitHub's "latest" leaves
      // pre-releases out and would report nothing while only release candidates exist.
      let row;
      if (info.channel === 'stable') {
        row = await boundedJSON(`https://api.github.com/repos/${info.repository}/releases/latest`);
        if (row.draft || row.prerelease || !/^v[0-9A-Za-z.+-]{1,80}$/.test(row.tag_name))
          throw new Error('No eligible stable release returned.');
        if (row.html_url !== `https://github.com/${info.repository}/releases/tag/${row.tag_name}`)
          throw new Error('Unexpected release destination.');
      } else {
        const newest = newestRelease(
          await boundedJSON(`https://api.github.com/repos/${info.repository}/releases?per_page=10`),
          info.repository,
        );
        if (!newest) throw new Error('This upstream has not published a release yet. Nothing was changed.');
        row = { tag_name: newest.tag, prerelease: newest.prerelease, body: newest.notes };
      }
      const expected = `https://github.com/${info.repository}/releases/tag/${row.tag_name}`;
      $('release-notes').textContent = String(row.body || 'No release notes.').slice(0, 50000);
      link('release-upstream', expected);
      // A stable build also checks that its own version is still published. A missing one may
      // have been withdrawn.
      let installedPublished = null;
      if (info.channel === 'stable') {
        try {
          const own = await fetch(
            `https://api.github.com/repos/${info.repository}/releases/tags/v${info.version}`,
            {
              credentials: 'omit',
              redirect: 'error',
              cache: 'no-store',
              referrerPolicy: 'no-referrer',
              signal: AbortSignal.timeout(12000),
              headers: { Accept: 'application/json' },
            },
          );
          await own.body?.cancel();
          installedPublished = own.status === 200 ? true : own.status === 404 ? false : null;
        } catch {
          installedPublished = null;
        }
      }
      const standing = releaseStanding({
        installed: info.version,
        channel: info.channel,
        latest: row.tag_name,
        installedPublished,
        prerelease: row.prerelease === true,
      });
      $('release-note').dataset.level = standing.level;
      note(standing.text);
    } catch (error) {
      note(
        error.message === 'Release information is unavailable.'
          ? 'Unable to check releases. GitHub could not be reached or is limiting requests; try again later. Nothing was changed.'
          : error.message,
      );
    } finally {
      $('release-check').disabled = false;
    }
  };
  // The way from this window to where an update is installed, so nobody has to know that the
  // button lives under Connections.
  $('release-update-open').onclick = () => {
    $('release-dialog').close();
    // The same control the guided setup uses to open every setting at once.
    $('collab-config').click();
    const group = $('updates-group');
    group.open = true;
    group.scrollIntoView({ block: 'start' });
  };
  $('main-check').onclick = async () => {
    if (!info?.repository) return;
    $('main-check').disabled = true;
    note('Checking the public main branch. No keys or conversations are sent.');
    try {
      const row = await boundedJSON(`https://api.github.com/repos/${info.repository}/commits/main`);
      note(compareMain(row.sha, info.commit, info.modified));
    } catch (error) {
      note(
        error.message === 'Invalid main-branch commit returned.'
          ? error.message
          : 'Unable to check the public main branch. Nothing was changed.',
      );
    } finally {
      $('main-check').disabled = false;
    }
  };
  $('feedback-open').onclick = () => {
    $('feedback-dialog').showModal();
  };
  $('feedback-prepare').onclick = () => {
    try {
      if (!info) throw new Error('Build information has not loaded.');
      const title = $('feedback-title').value.trim(),
        body = suggestionDraft({
          kind: $('feedback-kind').value,
          title,
          description: $('feedback-description').value,
          version: info.version,
          commit: info.commit,
        });
      $('feedback-preview').textContent = body;
      const file = new Blob([body], { type: 'text/markdown' });
      if (download) URL.revokeObjectURL(download);
      download = URL.createObjectURL(file);
      $('feedback-download').href = download;
      $('feedback-download').hidden = false;
      $('feedback-open-upstream').hidden = true;
      if (info.repository) {
        try {
          $('feedback-open-upstream').href = issueURL(info.repository, title, body);
          $('feedback-open-upstream').hidden = false;
        } catch {}
      }
      $('feedback-status').textContent =
        'Review the exact draft below. Open GitHub only when you are ready to share it; GitHub still requires you to submit. The downloadable brief can also accompany a code PR.';
    } catch (error) {
      $('feedback-preview').textContent = '';
      $('feedback-open-upstream').hidden = true;
      $('feedback-download').hidden = true;
      $('feedback-status').textContent = error.message;
    }
  };
  for (const id of ['feedback-title', 'feedback-description', 'feedback-kind'])
    $(id).addEventListener('input', () => {
      $('feedback-open-upstream').hidden = true;
      $('feedback-download').hidden = true;
      $('feedback-preview').textContent = '';
    });
  window.addEventListener('pagehide', () => {
    if (download) URL.revokeObjectURL(download);
  });
  try {
    const config = await boundedJSON('release.json', 4096);
    let stamp,
      serverLive = false;
    try {
      stamp = await boundedJSON('/api/build-info', 4096);
      serverLive = true;
    } catch {
      try {
        stamp = await boundedJSON('build-info.json', 4096);
      } catch {
        stamp = { ...config, commit: null, modified: null, environment: 'source' };
      }
    }
    info = { ...publicBuild({ ...config, ...stamp }), serverCommit: serverLive ? stamp.commit : null };
    render();
  } catch {
    note('Build identity unavailable; this is not a verified release.');
    $('footer-build').textContent = 'Version identity unavailable';
    $('release-check').disabled = true;
    $('main-check').disabled = true;
  }
}
