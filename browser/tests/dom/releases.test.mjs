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
async function pageFor({ build = {}, latest, ownTagPublished = true }) {
  const page = await stack.browser.newPage();
  await page.setViewport(1500, 900);
  await page.route(stack.gateway.origin + '/api/build-info', () => ({ body: { ...real, ...build } }));
  await page.route(api, (url) => {
    if (url.endsWith('/releases/latest')) return { body: release(latest) };
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
    let page = await pageFor({ latest: 'v9.0.0' });
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

    page = await pageFor({ latest: 'v0.0.1' });
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
