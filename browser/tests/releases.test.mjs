import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newerVersion,
  versionParts,
  validRepository,
  publicBuild,
  suggestionDraft,
  issueURL,
  compareMain,
} from '../releases.mjs';

test('SemVer ordering respects numeric releases and prerelease precedence', () => {
  for (const [a, b] of [
    ['1.10.0', '1.9.9'],
    ['2.0.0', '1.99.99'],
    ['1.0.0', '1.0.0-rc.9'],
    ['1.0.0-rc.10', '1.0.0-rc.2'],
    ['1.0.0-beta', '1.0.0-9'],
  ])
    assert.equal(newerVersion(a, b), true);
  for (const [a, b] of [
    ['1.0.0', '1.0.0'],
    ['1.0.0+build.2', '1.0.0+build.1'],
    ['1.0.0-rc', '1.0.0'],
    ['0.9.9', '1.0.0'],
    ['not-a-release', '1.0.0'],
  ])
    assert.equal(newerVersion(a, b), false);
  for (const v of ['01.0.0', '1.0', '1.0.0-01', '1.0.0-', '1.0.0/../../x', null])
    assert.equal(versionParts(v), null);
});
test('Public identity refuses unknown channels, invalid commits and external upstreams', () => {
  const clean = {
    version: '0.1.0-dev.1',
    channel: 'development',
    environment: 'source',
    commit: null,
    modified: null,
    repository: null,
  };
  assert.equal(publicBuild(clean), clean);
  for (const patch of [
    { commit: 'short' },
    { repository: 'https://evil.invalid' },
    { repository: 'owner/../repo' },
    { environment: 'customer-host-path' },
    { modified: 'false' },
    { channel: 'anything' },
  ])
    assert.throws(() => publicBuild({ ...clean, ...patch }));
  assert.equal(validRepository('gptkiosk/pea-web'), true);
  assert.equal(validRepository('gptkiosk/pea-web?token=x'), false);
});
test('Feedback includes only deliberately entered text and public build identity', () => {
  const args = {
    kind: 'suggestion',
    title: 'Improve keyboard hiding',
    description: 'Keep the microphone visible.',
    version: '0.1.0',
    commit: 'a'.repeat(40),
  };
  const body = suggestionDraft(args);
  assert.match(body, /Improve keyboard hiding/);
  assert.match(body, /aaaaaaa/);
  assert.match(body, /No chats.*attached automatically/);
  assert.equal(body.includes('undefined'), false);
  const url = new URL(issueURL('gptkiosk/pea-web', args.title, body));
  assert.equal(url.origin, 'https://github.com');
  assert.equal(url.pathname, '/gptkiosk/pea-web/issues/new');
  assert.equal(url.searchParams.get('body'), body);
  assert.equal(url.searchParams.has('token'), false);
  for (const text of [
    'sk-or-v1-synthetic',
    '-----BEGIN ' + 'OPENSSH PRIVATE KEY-----',
    'github_pat_synthetic',
  ])
    assert.throws(() => suggestionDraft({ ...args, description: text }));
  assert.throws(() => suggestionDraft({ ...args, description: 'x'.repeat(4001) }));
  assert.throws(() => issueURL('attacker/../route', 't', 'b'));
  assert.throws(() => issueURL('gptkiosk/pea-web', 't', 'x'.repeat(7100)));
});

test('main branch comparison makes no unsupported ancestry or integrity claim', () => {
  const a = 'a'.repeat(40),
    b = 'b'.repeat(40);
  assert.match(compareMain(a, a, false), /matches commit/);
  assert.match(compareMain(a, a, true), /local modifications/);
  assert.match(compareMain(a, a, null), /integrity is unknown/);
  assert.match(compareMain(a, b, false), /differs.*does not establish ancestry/);
  assert.match(compareMain(a, null, null), /no verified commit identity/);
  assert.throws(() => compareMain('not-a-commit', a, false));
  assert.throws(() => compareMain(a, 'short', false));
});

test('the release check says plainly whether this build is behind, current, ahead or possibly withdrawn', async () => {
  const { releaseStanding } = await import('../releases.mjs');
  const behind = releaseStanding({
    installed: '0.1.0',
    channel: 'stable',
    latest: 'v0.2.0',
    installedPublished: true,
  });
  assert.equal(behind.level, 'update');
  assert.match(behind.text, /^Available: v0\.2\.0\./);
  assert.match(behind.text, /No installation has started/);

  const current = releaseStanding({
    installed: '0.2.0',
    channel: 'stable',
    latest: 'v0.2.0',
    installedPublished: true,
  });
  assert.equal(current.level, 'info');
  assert.match(current.text, /No newer version was identified/);

  const development = releaseStanding({ installed: '0.3.0-dev.4', channel: 'development', latest: 'v0.2.0' });
  assert.equal(development.level, 'info');
  assert.match(development.text, /development build \(0\.3\.0-dev\.4\) is ahead .* as expected/);

  const ahead = releaseStanding({
    installed: '0.3.0',
    channel: 'stable',
    latest: 'v0.2.0',
    installedPublished: null,
  });
  assert.equal(ahead.level, 'warning');
  assert.match(ahead.text, /newer than the latest published stable version \(v0\.2\.0\)/);
  assert.match(ahead.text, /may have been withdrawn/);

  const gone = releaseStanding({
    installed: '0.2.0',
    channel: 'stable',
    latest: 'v0.2.1',
    installedPublished: false,
  });
  assert.equal(gone.level, 'warning', 'a withdrawn version is a warning even when an update exists');
  assert.match(gone.text, /Version 0\.2\.0 is no longer among the published releases/);
  assert.match(gone.text, /latest published stable version is v0\.2\.1/);

  const devMissing = releaseStanding({
    installed: '0.2.0-dev.1',
    channel: 'development',
    latest: 'v0.1.0',
    installedPublished: false,
  });
  assert.equal(devMissing.level, 'info', 'a development build is never published, so that is not a warning');
  for (const text of [behind, current, development, ahead, gone].map((s) => s.text))
    assert.match(text, /nothing was changed|No installation has started/i);
  assert.throws(() => releaseStanding({ installed: 'not-a-version', channel: 'stable', latest: 'v1.0.0' }));
  assert.throws(() => releaseStanding({ installed: '1.0.0', channel: 'stable', latest: 'latest' }));
});

test('the newest published release is found among pre-releases, and only real release pages count', async () => {
  const { newestRelease, releaseStanding } = await import('../releases.mjs');
  const repo = 'owner/project';
  const row = (tag, more = {}) => ({
    tag_name: tag,
    draft: false,
    prerelease: /-/.test(tag),
    html_url: `https://github.com/${repo}/releases/tag/${tag}`,
    body: 'notes ' + tag,
    ...more,
  });
  assert.deepEqual(newestRelease([row('v0.1.0-rc.1'), row('v0.1.0-rc.2')], repo), {
    tag: 'v0.1.0-rc.2',
    prerelease: true,
    url: `https://github.com/${repo}/releases/tag/v0.1.0-rc.2`,
    notes: 'notes v0.1.0-rc.2',
  });
  // A stable version outranks its own release candidates, whatever the order of the list.
  assert.equal(newestRelease([row('v0.1.0-rc.2'), row('v0.1.0'), row('v0.1.0-rc.1')], repo).tag, 'v0.1.0');
  assert.equal(newestRelease([row('v0.1.0')], repo).prerelease, false);
  for (const bad of [
    row('v9.0.0', { draft: true }),
    row('v9.0.0', { draft: undefined }),
    row('v9.0.0', { html_url: 'https://github.com/other/project/releases/tag/v9.0.0' }),
    row('v9.0.0', { html_url: `https://github.com/${repo}/releases/tag/v9.0.0?x=1` }),
    row('latest'),
    row('9.0.0'),
    { tag_name: 9 },
    null,
    'v9.0.0',
  ])
    assert.equal(newestRelease([bad, row('v0.1.0-rc.1')], repo).tag, 'v0.1.0-rc.1');
  assert.equal(newestRelease([], repo), null);
  assert.equal(newestRelease({ tag_name: 'v1.0.0' }, repo), null);
  assert.equal(newestRelease([row('v1.0.0')], 'not a repository'), null);
  assert.equal(newestRelease([row('v1.0.0', { body: 7 })], repo).notes, '');

  const offered = releaseStanding({
    installed: '0.1.0-rc.1.dev.3',
    channel: 'development',
    latest: 'v0.1.0-rc.2',
    prerelease: true,
  });
  assert.equal(offered.level, 'update');
  assert.match(offered.text, /^Available: v0\.1\.0-rc\.2, a pre-release/);
  assert.match(offered.text, /No installation has started/);
  const same = releaseStanding({
    installed: '0.1.0-rc.2',
    channel: 'prerelease',
    latest: 'v0.1.0-rc.2',
    prerelease: true,
  });
  assert.equal(same.level, 'info');
  assert.match(same.text, /No stable version has been published yet; nothing was changed/);
  const ahead = releaseStanding({
    installed: '0.1.0-rc.2.dev.2',
    channel: 'development',
    latest: 'v0.1.0-rc.2',
    prerelease: true,
  });
  assert.equal(ahead.level, 'info');
  assert.match(
    ahead.text,
    /is ahead of the newest published release, v0\.1\.0-rc\.2, a pre-release\. Nothing was changed/,
  );
});

test('release notes are shown as plain sentences, with the markup taken out', async () => {
  const { notesText } = await import('../releases.mjs');
  assert.equal(
    notesText(
      '# Title\r\n\r\n**Bold start.** Then `code` and [a `link`](https://example.com/a_b).\n\n\n\n- one\n  * two\n\n```sh\nrun --flag \\\n  **kept** `as is`\n```\nAfter 2 * 3 * 4 and snake_case_name.',
    ),
    'Title\n\nBold start. Then code and a link.\n\n• one\n  • two\n\n    run --flag \\\n      **kept** `as is`\nAfter 2 * 3 * 4 and snake_case_name.',
  );
  assert.equal(notesText('[](https://example.com/x)'), 'https://example.com/x');
  assert.equal(notesText('<img src=x onerror=1>'), '<img src=x onerror=1>', 'left as text for textContent');
  assert.equal(notesText(null), '');
});

test('a page is told when its PEA now runs other code, and only then', async () => {
  const { stalePage } = await import('../releases.mjs');
  const a = 'a'.repeat(40),
    b = 'b'.repeat(40);
  const loaded = { version: '0.1.0-rc.4.dev.1', commit: a };
  assert.equal(stalePage(loaded, { version: '0.1.0-rc.4.dev.1', commit: a }), null);
  const stale = stalePage(loaded, { version: '0.1.0-rc.4.dev.2', commit: b });
  assert.equal(stale.version, '0.1.0-rc.4.dev.2');
  assert.match(
    stale.text,
    /now runs 0\.1\.0-rc\.4\.dev\.2 \(bbbbbbb\)\. This page is still showing 0\.1\.0-rc\.4\.dev\.1 \(aaaaaaa\)/,
  );
  assert.match(stale.text, /A reload clears keys and unsaved chats in this tab/);
  for (const [x, y] of [
    [null, loaded],
    [loaded, null],
    [{ version: '1.0.0', commit: null }, loaded],
    [loaded, { version: '1.0.0', commit: null }],
  ])
    assert.equal(stalePage(x, y), null);
});

test('notes become headings, list items, paragraphs and code, as words only', async () => {
  const { notesBlocks } = await import('../releases.mjs');
  assert.deepEqual(
    notesBlocks(
      '## Added\n\n- **One.** Uses `code`.\n* Two [here](https://example.test/x)\n\nPlain <b>text</b>.\n\n```sh\nrun --this\n# not a heading\n```\n',
    ),
    [
      { kind: 'heading', text: 'Added' },
      { kind: 'item', text: 'One. Uses code.' },
      { kind: 'item', text: 'Two here' },
      { kind: 'text', text: 'Plain <b>text</b>.' },
      { kind: 'code', text: 'run --this\n# not a heading' },
    ],
  );
  assert.deepEqual(notesBlocks(''), []);
  assert.deepEqual(notesBlocks(null), []);
});

test('the build line is plain words and warns only when something is unusual', async () => {
  const { buildLine } = await import('../releases.mjs');
  const a = 'a'.repeat(40),
    b = 'b'.repeat(40);
  assert.equal(
    buildLine({ channel: 'development', commit: a, serverCommit: a, modified: false }),
    'Development build · commit aaaaaaa',
  );
  assert.equal(
    buildLine({ channel: 'stable', commit: a, serverCommit: a, modified: false }),
    'Release · commit aaaaaaa',
  );
  assert.equal(
    buildLine({ channel: 'prerelease', commit: a, serverCommit: b, modified: true }),
    'Pre-release · commit aaaaaaa · server at bbbbbbb · files changed since this commit',
  );
  assert.equal(
    buildLine({ channel: 'development', commit: null, serverCommit: null, modified: null }),
    'Development build · source not verified',
  );
});

test('the footer shows the version alone, and the full identity is kept for reports', async () => {
  const { footerLine, buildDetail } = await import('../releases.mjs');
  const a = 'a'.repeat(40),
    b = 'b'.repeat(40);
  const plain = { version: '1.2.3', environment: 'development', commit: a, serverCommit: a, modified: false };
  assert.equal(footerLine(plain), 'v1.2.3');
  assert.equal(buildDetail(plain), 'v1.2.3 · development · web aaaaaaa · api aaaaaaa · clean');
  assert.equal(
    footerLine({ ...plain, serverCommit: b, modified: true }),
    'v1.2.3 · server at bbbbbbb · files changed since this commit',
  );
  assert.equal(footerLine({ ...plain, serverCommit: null, modified: null }), 'v1.2.3 · source not verified');
  assert.equal(
    buildDetail({ ...plain, commit: null, serverCommit: null, modified: null }),
    'v1.2.3 · development · web unknown · api not connected · unverified source',
  );
});
