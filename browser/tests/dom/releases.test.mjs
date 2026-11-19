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
    assert.match(result.text, /“Update this copy” below installs it after your review/);
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

const shown = (page, id) =>
  page.evaluate(
    `(() => { const e = document.getElementById(${JSON.stringify(id)}); return !e.hidden && e.offsetParent !== null; })()`,
  );

test(
  'without the token, the window says what is missing and leads to Local model; Connections points back',
  options,
  async () => {
    const page = await pageFor({ build: { channel: 'development' }, latest: 'v0.0.1' });
    await page.click('#releases-open');
    await page.waitFor(`document.getElementById('release-dialog').open`, 'the versions window');
    const text = await page.evaluate(`document.getElementById('release-dialog').textContent`);
    assert.match(text, /This page never downloads or runs program code itself/);
    assert.match(text, /Update this copy/);
    assert.match(
      await page.text('#update-status'),
      /connect this PEA first: paste its server connection token under Local model\. Tick Remember this token on this browser there/,
    );
    assert.equal(await shown(page, 'release-update-open'), true, 'the way to connect is offered');
    assert.equal(await shown(page, 'update-check'), false);
    assert.equal(await shown(page, 'update-apply'), false);

    await page.click('#release-update-open');
    await page.waitFor(
      `document.getElementById('connections').open && document.getElementById('local-group').open`,
      'Local model in Connections',
    );
    assert.equal(await page.evaluate(`document.getElementById('release-dialog').open`), false);
    assert.equal(await page.evaluate(`document.getElementById('setup-wizard').open`), false);
    assert.equal(await page.evaluate(`document.activeElement.id`), 'local-token');
    assert.equal(
      await page.evaluate(
        `(() => { const r = document.getElementById('local-group').getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; })()`,
      ),
      true,
      'the token field is in view',
    );

    // The old place under Connections no longer holds the buttons; it leads to the window.
    assert.equal(
      await page.evaluate(
        `document.getElementById('connections').contains(document.getElementById('update-check'))`,
      ),
      false,
    );
    await page.click('#updates-open-versions');
    await page.waitFor(`document.getElementById('release-dialog').open`, 'the versions window again');
    assert.equal(await page.evaluate(`document.getElementById('connections').open`), false);
    await page.close();
  },
);

test(
  'the buttons in the window sit apart on one row, and notes read as plain sentences',
  options,
  async () => {
    const body =
      '**This is a pre-release.** Read [the guide](https://github.com/x/y/blob/v1/G.md).\n\n## Added\n\n- **One.** Uses `code`.\n\n```sh\nrun --this\n```\n';
    const page = await pageFor({
      build: { version: '0.1.0-rc.1', channel: 'prerelease' },
      list: [{ ...candidate('v0.1.0-rc.2'), body }],
    });
    await page.click('#releases-open');
    await check(page);
    // Notes are set out as a paragraph, a heading, a list and a code line, each put in as text.
    assert.deepEqual(
      JSON.parse(
        await page.evaluate(
          `JSON.stringify([...document.getElementById('release-notes').children].map((e) => [e.tagName, e.textContent]))`,
        ),
      ),
      [
        ['P', 'This is a pre-release. Read the guide.'],
        ['H4', 'Added'],
        ['UL', 'One. Uses code.'],
        ['PRE', 'run --this'],
      ],
    );
    assert.equal(
      await page.evaluate(
        `document.querySelectorAll('#release-notes a, #release-notes img, #release-notes script').length`,
      ),
      0,
      'nothing in the notes becomes a link, picture or script',
    );
    assert.notEqual(
      await page.evaluate(`getComputedStyle(document.querySelector('#release-notes p')).fontFamily`),
      await page.evaluate(`getComputedStyle(document.querySelector('#release-notes pre')).fontFamily`),
      'sentences are in the reading typeface, only code is fixed-width',
    );
    const gaps = await page.evaluate(
      `(() => { const r = (id) => document.getElementById(id).getBoundingClientRect(); const [a, b, c] = ['release-check', 'main-check', 'release-upstream'].map(r); return { ab: b.left - a.right, bc: c.left - b.right, row: Math.abs((b.top + b.bottom) / 2 - (c.top + c.bottom) / 2) }; })()`,
    );
    assert.ok(gaps.ab >= 12 && gaps.bc >= 12, 'a gap between the three: ' + JSON.stringify(gaps));
    assert.ok(gaps.row < 4, 'on one line at this width');
    await page.close();
  },
);

test(
  'when PEA is updated under an open page, the page says so and offers a reload; nothing reloads by itself',
  options,
  async () => {
    // A gateway that reports no commit gives the page nothing to compare, so the build is given one.
    const build = { channel: 'development', version: '9.9.9-dev.1', commit: 'b'.repeat(40) };
    const page = await pageFor({ build, latest: 'v0.0.1' });
    const notice = () => page.evaluate(`document.getElementById('release-stale-text').textContent`);
    await page.click('#releases-open');
    await page.waitFor(
      `performance.getEntriesByType('resource').filter((r) => r.name.endsWith('/api/build-info')).length >= 2`,
      'the second look at the build',
    );
    assert.equal(await shown(page, 'release-stale'), false, 'same build: no notice');
    assert.equal(await shown(page, 'footer-reload'), false);
    // The window leads with this copy's version in plain words.
    assert.equal(await page.text('#release-version'), 'v9.9.9-dev.1');
    assert.match(await page.text('#release-build'), /^Development build · commit bbbbbbb( · |$)/);
    // An update that has just landed offers its own reload while no notice is showing.
    await page.evaluate(
      `document.getElementById('update-reload').dataset.ready = '1'; document.dispatchEvent(new Event('pea-stale'))`,
    );
    assert.equal(await shown(page, 'update-reload'), true);

    // PEA is updated while the page stays open.
    build.version = '9.9.9-dev.2';
    build.commit = 'c'.repeat(40);
    await page.evaluate(`document.getElementById('release-dialog').close(); window.__stillHere = true`);
    await page.click('#releases-open');
    await page.waitFor(`!document.getElementById('release-stale').hidden`, 'the notice');
    assert.match(
      await notice(),
      /now runs 9\.9\.9-dev\.2 \(ccccccc\)\. This page is still showing 9\.9\.9-dev\.1 \(bbbbbbb\)/,
    );
    assert.equal(await shown(page, 'release-reload'), true);
    assert.equal(await shown(page, 'update-reload'), false, 'one reload button in the window, not two');
    assert.equal(await page.text('#footer-reload'), 'Reload for v9.9.9-dev.2');
    assert.equal(await page.evaluate(`window.__stillHere`), true, 'the page did not reload by itself');

    // An answer that is not a build identity changes nothing.
    build.version = 'not a version';
    await page.evaluate(`document.getElementById('release-dialog').close()`);
    await page.click('#releases-open');
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.match(await notice(), /now runs 9\.9\.9-dev\.2/);

    // Reloading loads the build PEA runs now, and the notice is gone.
    build.version = '9.9.9-dev.2';
    await page.click('#release-reload');
    await page.waitFor(
      `window.__stillHere === undefined && document.getElementById('release-check') && !document.getElementById('release-check').disabled`,
      'the reloaded page',
    );
    assert.match(await page.text('#footer-build'), /^v9\.9\.9-dev\.2( · files changed since this commit)?$/);
    assert.match(
      await page.evaluate(`document.getElementById('footer-build').title`),
      /^v9\.9\.9-dev\.2 .* web ccccccc · api ccccccc/,
    );
    await page.click('#releases-open');
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(await shown(page, 'release-stale'), false);
    await page.close();
  },
);

test('coming back to the tab is enough to be told, without opening the window', options, async () => {
  const build = { channel: 'development', version: '9.9.9-dev.1', commit: 'b'.repeat(40) };
  const page = await pageFor({ build, latest: 'v0.0.1' });
  build.version = '9.9.9-dev.3';
  build.commit = 'd'.repeat(40);
  await page.evaluate(`window.dispatchEvent(new Event('focus'))`);
  await page.waitFor(`!document.getElementById('footer-reload').hidden`, 'the footer button');
  assert.equal(await page.text('#footer-reload'), 'Reload for v9.9.9-dev.3');
  assert.equal(await shown(page, 'footer-reload'), true);
  assert.equal(await page.evaluate(`document.getElementById('release-dialog').open`), false);
  await page.close();
});

test(
  'a gateway that reports no commit gives nothing to compare, so no notice is shown',
  options,
  async () => {
    const build = { channel: 'development', commit: null, modified: null };
    const page = await pageFor({ build, latest: 'v0.0.1' });
    build.version = '9.9.9-dev.4';
    await page.click('#releases-open');
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(await shown(page, 'release-stale'), false);
    assert.equal(await shown(page, 'footer-reload'), false);
    await page.close();
  },
);
