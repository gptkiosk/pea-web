// Browser-level checks for Check for updates, with GitHub's answers supplied by the test so nothing
// is fetched from GitHub. The check never installs anything; it only tells the owner where this
// build stands.
// Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { browserSkipReason, startStack } from './harness.mjs';

const skip = browserSkipReason();
const options = { skip, timeout: 60000 };
const api = 'https://api.github.com/';

let stack, real;
before(
  async () => {
    if (skip) return;
    stack = await startStack(() => 'A plain synthetic reply.');
    real = await (await fetch(stack.gateway.origin + '/api/build-info')).json();
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

const release = (tag) => ({
  tag_name: tag,
  draft: false,
  prerelease: false,
  html_url: `https://github.com/${real.repository}/releases/tag/${tag}`,
  body: 'Synthetic release notes.',
});

// Opens the app pretending to be the given build, with GitHub answering as described.
async function pageFor({ build = {}, latest, ownTagPublished = true, list = null }) {
  const page = await stack.browser.newPage();
  await page.setViewport(1500, 900);
  await page.route(stack.gateway.origin + '/api/build-info', () => ({ body: { ...real, ...build } }));
  await page.route(api, (url) => {
    // GitHub's "latest" answer leaves pre-releases out: with only release candidates it is 404.
    if (url.endsWith('/releases/latest')) return latest ? { body: release(latest) } : { status: 404 };
    if (url.endsWith('/releases?per_page=10')) return { body: list ?? (latest ? [release(latest)] : []) };
    if (url.includes('/releases/tags/')) return ownTagPublished ? { body: release('own') } : { status: 404 };
    return { status: 404 };
  });
  await page.goto(stack.gateway.origin + '/');
  await page.waitFor(`!document.getElementById('release-check').disabled`, 'the build identity');
  return page;
}
const check = async (page) => {
  await page.click('#release-check');
  await page.waitFor(
    `/nothing was changed|No installation has started/i.test(document.getElementById('release-note').textContent)`,
    'the result of the check',
  );
  return {
    text: await page.text('#release-note'),
    level: await page.evaluate(`document.getElementById('release-note').dataset.level`),
  };
};

test(
  'a development build is told when a release is available, and otherwise that it is ahead as expected',
  options,
  async () => {
    let page = await pageFor({ build: { channel: 'development' }, latest: 'v9.0.0' });
    let result = await check(page);
    assert.equal(result.level, 'update');
    assert.match(result.text, /^Available: v9\.0\.0\./);
    assert.match(result.text, /No installation has started/);
    assert.equal(
      page.intercepted.filter((r) => r.url.startsWith(api)).some((r) => r.url.includes('/releases/tags/')),
      false,
      'a development build does not ask about its own tag',
    );
    await page.close();

    page = await pageFor({ build: { channel: 'development' }, latest: 'v0.0.1' });
    result = await check(page);
    assert.equal(result.level, 'info');
    assert.match(
      result.text,
      /development build .* is ahead of the latest published stable version \(v0\.0\.1\), as expected/,
    );
    await page.close();
  },
);

test('a stable build is warned when its own version is no longer published', options, async () => {
  const page = await pageFor({
    build: { version: '0.2.0', channel: 'stable', environment: 'release' },
    latest: 'v0.2.1',
    ownTagPublished: false,
  });
  const result = await check(page);
  assert.equal(result.level, 'warning');
  assert.match(
    result.text,
    /Version 0\.2\.0 is no longer among the published releases, so it may have been withdrawn/,
  );
  assert.match(result.text, /latest published stable version is v0\.2\.1/);

  const asked = page.intercepted.filter((r) => r.url.startsWith(api));
  assert.deepEqual(
    asked.map((r) => r.url.replace(api, '')).sort(),
    [`repos/${real.repository}/releases/latest`, `repos/${real.repository}/releases/tags/v0.2.0`],
    'only the two release questions are asked',
  );
  for (const request of asked) {
    assert.equal(request.method, 'GET');
    const names = Object.keys(request.headers).map((name) => name.toLowerCase());
    assert.equal(
      names.includes('authorization') || names.includes('cookie'),
      false,
      'no credentials are sent',
    );
    assert.equal(names.includes('referer'), false, 'and no referrer');
  }
  await page.close();
});

test('a stable build that is published and current gets no warning', options, async () => {
  const page = await pageFor({
    build: { version: '0.2.0', channel: 'stable', environment: 'release' },
    latest: 'v0.2.0',
  });
  const result = await check(page);
  assert.equal(result.level, 'info');
  assert.match(result.text, /Latest published stable version: v0\.2\.0\. No newer version was identified/);
  await page.close();
});

test('a stable build newer than anything published is warned', options, async () => {
  const page = await pageFor({
    build: { version: '0.3.0', channel: 'stable', environment: 'release' },
    latest: 'v0.2.0',
  });
  const result = await check(page);
  assert.equal(result.level, 'warning');
  assert.match(result.text, /newer than the latest published stable version \(v0\.2\.0\)/);
  await page.close();
});

const candidate = (tag) => ({ ...release(tag), prerelease: true, body: 'Notes for ' + tag });

test(
  'with only release candidates published, the newest one is found and offered, never "no release"',
  options,
  async () => {
    const page = await pageFor({
      build: { version: '0.1.0-rc.1.dev.3', channel: 'development' },
      list: [candidate('v0.1.0-rc.1'), candidate('v0.1.0-rc.2'), { ...candidate('v9.9.9'), draft: true }],
    });
    const result = await check(page);
    assert.equal(result.level, 'update');
    assert.match(result.text, /^Available: v0\.1\.0-rc\.2, a pre-release/);
    assert.match(result.text, /Connections → PEA updates/);
    assert.match(result.text, /No installation has started/);
    assert.equal(await page.text('#release-notes'), 'Notes for v0.1.0-rc.2');
    assert.equal(
      await page.evaluate(`document.getElementById('release-upstream').href`),
      `https://github.com/${real.repository}/releases/tag/v0.1.0-rc.2`,
    );
    const asked = page.intercepted.filter((r) => r.url.startsWith(api)).map((r) => r.url.slice(api.length));
    assert.deepEqual(asked, [`repos/${real.repository}/releases?per_page=10`]);
    await page.close();
  },
);

test(
  'a copy on the newest release candidate is told so, and that no stable version exists',
  options,
  async () => {
    const page = await pageFor({
      build: { version: '0.1.0-rc.2', channel: 'prerelease' },
      list: [candidate('v0.1.0-rc.2'), candidate('v0.1.0-rc.1')],
    });
    const result = await check(page);
    assert.equal(result.level, 'info');
    assert.match(result.text, /newest published release, v0\.1\.0-rc\.2, a pre-release/);
    assert.match(result.text, /No stable version has been published yet/);
    await page.close();
  },
);

test(
  'a release whose page is somewhere else is not counted, and an empty list is said plainly',
  options,
  async () => {
    let page = await pageFor({
      build: { version: '0.1.0-rc.1', channel: 'prerelease' },
      list: [{ ...candidate('v0.1.0-rc.5'), html_url: 'https://example.com/releases/tag/v0.1.0-rc.5' }],
    });
    await page.click('#release-check');
    await page.waitFor(
      `/has not published a release yet/.test(document.getElementById('release-note').textContent)`,
      'the plain answer',
    );
    await page.close();

    page = await pageFor({ build: { version: '0.1.0-rc.1', channel: 'prerelease' }, list: [] });
    await page.click('#release-check');
    await page.waitFor(
      `/has not published a release yet\\. Nothing was changed/.test(document.getElementById('release-note').textContent)`,
      'the plain answer',
    );
    await page.close();
  },
);

test('a stable build still looks only at the latest stable release', options, async () => {
  const page = await pageFor({
    build: { version: '0.2.0', channel: 'stable' },
    latest: 'v0.2.0',
    list: [candidate('v0.3.0-rc.1')],
  });
  const result = await check(page);
  assert.equal(result.level, 'info');
  assert.doesNotMatch(result.text, /0\.3\.0/);
  assert.equal(
    page.intercepted.some((r) => r.url.includes('/releases?per_page')),
    false,
  );
  await page.close();
});

test(
  'the window leads to where an update is installed: Connections, with PEA updates open',
  options,
  async () => {
    const page = await pageFor({ build: { channel: 'development' }, latest: 'v0.0.1' });
    await page.click('#releases-open');
    await page.waitFor(`document.getElementById('release-dialog').open`, 'the versions window');
    assert.match(
      await page.evaluate(`document.getElementById('release-dialog').textContent`),
      /This page never downloads or runs program code itself/,
    );
    await page.click('#release-update-open');
    await page.waitFor(
      `document.getElementById('connections').open && document.getElementById('updates-group').open`,
      'the update panel',
    );
    assert.equal(await page.evaluate(`document.getElementById('release-dialog').open`), false);
    assert.equal(await page.evaluate(`document.getElementById('setup-wizard').open`), false);
    assert.equal(
      await page.evaluate(
        `(() => { const r = document.getElementById('updates-group').getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; })()`,
      ),
      true,
      'the panel is in view',
    );
    await page.close();
  },
);
