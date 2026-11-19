import {
  publicBuild,
  validRepository,
  suggestionDraft,
  issueURL,
  compareMain,
  newestRelease,
  notesBlocks,
  buildDetail,
  buildLine,
  footerLine,
  releaseStanding,
  stalePage,
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
  // Release notes and the changelog arrive as Markdown. Each piece is put in as text.
  function showNotes(markdown) {
    const out = [];
    let list = null;
    for (const block of notesBlocks(markdown)) {
      if (block.kind === 'item') {
        if (!list) out.push((list = document.createElement('ul')));
        list.append(Object.assign(document.createElement('li'), { textContent: block.text }));
        continue;
      }
      list = null;
      out.push(
        Object.assign(
          document.createElement(block.kind === 'code' ? 'pre' : block.kind === 'heading' ? 'h4' : 'p'),
          { textContent: block.text },
        ),
      );
    }
    $('release-notes').replaceChildren(...out);
  }
  function link(id, url) {
    const a = $(id);
    a.href = url;
    a.hidden = false;
  }
  function render() {
    $('footer-product').textContent = info.organization
      ? `${info.product} · A ${info.organization} product`
      : info.product + ' · Personal Executive Assistant';
    $('footer-build').textContent = footerLine(info);
    $('footer-build').title = buildDetail(info);
    $('release-version').textContent = 'v' + info.version;
    $('release-build').textContent = buildLine(info);
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
  // PEA can be updated while this page stays open. Ask the gateway which build it runs now and,
  // when that is not the build this page loaded, say so and offer a reload. Nothing reloads by
  // itself. Asked when the window opens and when the tab comes back into view.
  let serverConfig = null,
    looked = 0;
  async function look(force = false) {
    if (!info?.serverCommit || (!force && Date.now() - looked < 20000)) return;
    looked = Date.now();
    let stale = null;
    try {
      const running = publicBuild({ ...serverConfig, ...(await boundedJSON('/api/build-info', 4096)) });
      stale = stalePage({ version: info.version, commit: info.serverCommit }, running);
    } catch {
      return; // PEA is restarting or unreachable; what is shown stays as it is.
    }
    $('release-stale').hidden = $('footer-reload').hidden = !stale;
    $('release-stale-text').textContent = stale?.text ?? '';
    $('footer-reload').textContent = stale ? `Reload for v${stale.version}` : '';
    // The update panel keeps its own reload button out of the way while this notice offers one.
    document.dispatchEvent(new Event('pea-stale'));
  }
  // An update started from this page has just landed: look now, not at the next visit.
  document.addEventListener('pea-updated', () => void look(true));
  $('release-reload').onclick = $('footer-reload').onclick = () => location.reload();
  window.addEventListener('focus', () => void look());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void look();
  });
  $('releases-open').onclick = () => {
    $('release-dialog').showModal();
    void look(true);
  };
  $('changelog-open').onclick = async () => {
    $('release-dialog').showModal();
    void look(true);
    try {
      const r = await fetch('CHANGELOG.md', { credentials: 'omit', redirect: 'error', cache: 'no-store' });
      if (!r.ok) throw new Error();
      const text = await r.text();
      if (text.length > 100000) throw new Error();
      showNotes(text);
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
      showNotes(String(row.body || 'No release notes.').slice(0, 50000));
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
    serverConfig = config;
    render();
  } catch {
    note('Build identity unavailable; this is not a verified release.');
    $('footer-build').textContent = 'Version identity unavailable';
    $('release-check').disabled = true;
    $('main-check').disabled = true;
  }
}
