// Browser-level checks for using another curated catalog: only after a review, read through the
// owner's PEA server one public file at a time, checked like the usual catalog, kept apart from
// it, and refused in plain words when the address or the server is not right.
// Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { browserSkipReason, openConnectedPage, startStack } from './harness.mjs';
import { catalogBase } from '../../knowledge.mjs';

const skip = browserSkipReason();
const options = { skip, timeout: 120000 };
const dist = Object.fromEntries(
  Object.entries(
    JSON.parse(readFileSync(new URL('../fixtures/KnowledgeDist.json', import.meta.url), 'utf8')).files,
  ).map(([path, b64]) => [path, Buffer.from(b64, 'base64').toString('utf8')]),
);
const otherHost = 'catalog.othercurator.example',
  other = `https://${otherHost}/pea/`;
// What the other catalog serves. A test can change it.
const served = { ...dist };
const site = {
  names: [otherHost],
  answer({ host, path }) {
    const file = path.startsWith('/pea/') ? path.slice(5) : null;
    return host === otherHost && file !== null && file in served
      ? { type: 'application/json; charset=utf-8', body: served[file] }
      : { status: 404, body: 'Not here.' };
  },
};

let stack;
before(
  async () => {
    if (!skip) stack = await startStack(() => 'A plain synthetic reply.', { site });
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

const idle = `!document.getElementById('curated-browse').disabled`;
const reviewOpen = `document.getElementById('review').open`;
const note = (page) => page.evaluate(`document.getElementById('curated-other-note').textContent`);
const now = (page) => page.evaluate(`document.getElementById('curated-other-now').textContent`);
const names = (page) =>
  page.evaluate(
    `[...document.querySelectorAll('#curated-list > li')].map((li) => li.querySelector('strong').textContent)`,
  );
const usual = (page) => page.intercepted.filter((r) => r.url.startsWith(catalogBase)).map((r) => r.url);
const asked = () => stack.site.requests.map((r) => r.path);
async function tryAddress(page, address) {
  await page.fill('#curated-other-address', address);
  await page.evaluate(`document.getElementById('curated-other-use').click()`);
}

test(
  'another catalog is used only after a review, read through the PEA server, checked the same way, and kept apart from the usual one',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1500 });
    // The usual catalog, with one show of its own, so that the two can be told apart.
    const usualStore = JSON.parse(dist['store.json']);
    usualStore.sources = usualStore.sources.filter((s) => s.id === 'lamp-room');
    await page.route(catalogBase, (url) =>
      url === catalogBase + 'store.json'
        ? { type: 'application/json; charset=utf-8', text: JSON.stringify(usualStore) }
        : { status: 404, text: 'not found' },
    );
    await page.click('#tab-today');
    await page.evaluate(`document.getElementById('curated-section').open = true`);
    await page.evaluate(`document.getElementById('curated-browse').click()`);
    await page.waitFor(reviewOpen, 'the review');
    await page.click('#review-approve');
    await page.waitFor(`document.querySelectorAll('#curated-list > li').length === 1 && ${idle}`, 'the list');
    assert.deepEqual(await names(page), ['The Lamp Room']);
    assert.equal(await now(page), `Using the usual catalog at ${catalogBase}`);
    assert.equal(await page.evaluate(`document.getElementById('curated-request').hidden`), false);

    // Addresses that are not a plain public https catalog are refused, and nothing is asked.
    for (const bad of [
      'http://catalog.othercurator.example/pea/',
      'https://localhost/pea/',
      'https://192.168.1.4/pea/',
      'https://catalog.othercurator.example:8443/pea/',
      'https://user@catalog.othercurator.example/pea/',
      'https://catalog.othercurator.example/pea/?x=1',
      'https://CATALOG.othercurator.example/pea/',
      'https://router.local/pea/',
      'not an address',
    ]) {
      await tryAddress(page, bad);
      assert.match(await note(page), /^Enter a public https address in lower case/, bad);
    }
    await tryAddress(page, catalogBase);
    assert.equal(await note(page), 'That is the catalog already in use.');
    await tryAddress(page, 'https://catalog.othercurator.example/sk-or-v1-' + 'a'.repeat(64) + '/');
    assert.match(await note(page), /looks like a key or password/);
    assert.equal(await page.evaluate(reviewOpen), false);
    assert.deepEqual(asked(), []);

    // A good address asks first, and declining changes nothing. The missing slash is added.
    await tryAddress(page, other.slice(0, -1));
    await page.waitFor(reviewOpen, 'the review of the other catalog');
    const shown = await page.text('#review-body');
    assert.ok(shown.startsWith(`Catalog: ${other}`));
    assert.match(
      shown,
      /your PEA server reads the files for it: one public file at a time from catalog\.othercurator\.example/,
    );
    assert.match(shown, /PEA does not know them and has not looked at it/);
    assert.match(shown, /are removed from this browser/);
    await page.click('#review-cancel');
    await page.waitFor(`!${reviewOpen}`, 'the review to close');
    assert.equal(await note(page), 'Nothing was changed.');
    assert.deepEqual(asked(), []);
    assert.deepEqual(await names(page), ['The Lamp Room']);

    // Approved: the server reads the list, the browser asks the other host for nothing itself.
    const before = usual(page).length;
    await tryAddress(page, other);
    await page.waitFor(reviewOpen, 'the review of the other catalog');
    await page.click('#review-approve');
    await page.waitFor(
      `document.querySelectorAll('#curated-list > li').length === 3 && ${idle}`,
      'the other catalog’s list',
    );
    assert.deepEqual(asked(), ['/pea/store.json']);
    assert.deepEqual(await names(page), ['Harbor Voices', 'Tide Tables', 'The Lamp Room']);
    assert.match(
      await now(page),
      /^Using the catalog at https:\/\/catalog\.othercurator\.example\/pea\/ Its files are read through your PEA server/,
    );
    assert.equal(JSON.parse(await page.evaluate(`localStorage.getItem('pea-curated-v1')`)).catalog, other);
    assert.equal(await page.evaluate(`document.getElementById('curated-request').hidden`), true);
    const sent = stack.site.requests[0].headers;
    assert.ok(
      !('cookie' in sent) && !('authorization' in sent) && !('referer' in sent) && !('origin' in sent),
    );

    // Following a show reads its files through the server, each checked by size and fingerprint.
    await page.evaluate(
      `document.querySelector('#curated-list button[aria-label="Follow Harbor Voices"]').click()`,
    );
    await page.waitFor(
      `/Harbor Voices: 3 briefs checked and kept; 3 with their digest/.test(document.getElementById('curated-activity').textContent) && ${idle}`,
      'the followed show',
    );
    assert.equal(asked().filter((p) => p.endsWith('.brief.json')).length, 3);
    assert.equal(asked().filter((p) => p.endsWith('.digest.json')).length, 3);
    assert.ok(asked().every((p) => p.startsWith('/pea/')));
    assert.equal(usual(page).length, before, 'the usual catalog is not asked while another is in use');
    assert.deepEqual(
      page.outsideRequests().filter((url) => !url.startsWith(catalogBase)),
      [],
      'the browser itself never contacts the other host',
    );

    // A file that was changed on the way fails the same checks.
    const items = JSON.parse(dist['sources/tide-tables/items.json']).items;
    served[items[0].brief.path] = dist[items[0].brief.path].replace('"', ' "');
    await page.evaluate(
      `document.querySelector('#curated-list button[aria-label="Follow Tide Tables"]').click()`,
    );
    await page.waitFor(
      `/Tide Tables: 2 briefs checked and kept, 1 refused or missing/.test(document.getElementById('curated-activity').textContent) && ${idle}`,
      'the altered brief to be refused',
    );
    served[items[0].brief.path] = dist[items[0].brief.path];

    // After a reload the kept files are back with no fetch; without the server connected a
    // Refresh says what is needed and keeps everything.
    const reads = asked().length;
    await page.reload();
    await page.click('#tab-today');
    await page.waitFor(
      `document.getElementById('curated-peek').textContent === '5 briefs ready' && ${idle}`,
      'the kept files back',
    );
    assert.equal(asked().length, reads);
    await page.evaluate(`document.getElementById('curated-section').open = true`);
    await page.evaluate(`document.getElementById('curated-browse').click()`);
    await page.waitFor(
      `/^Another catalog is read through your PEA server\\. Connect it under Connections/.test(document.getElementById('curated-note').textContent) && ${idle}`,
      'the plain notice',
    );
    assert.equal(asked().length, reads, 'nothing is read without the server');
    assert.equal(
      await page.evaluate(`document.getElementById('curated-peek').textContent`),
      '5 briefs ready',
    );

    // Going back to the usual catalog asks first and starts over.
    await page.evaluate(`document.getElementById('curated-other-default').click()`);
    await page.waitFor(reviewOpen, 'the review');
    assert.ok((await page.text('#review-body')).startsWith(`Catalog: ${catalogBase}`));
    await page.click('#review-approve');
    await page.waitFor(
      `document.querySelectorAll('#curated-list > li').length === 1 && ${idle}`,
      'the usual list again',
    );
    assert.deepEqual(await names(page), ['The Lamp Room']);
    const saved = JSON.parse(await page.evaluate(`localStorage.getItem('pea-curated-v1')`));
    assert.deepEqual([saved.catalog, saved.followed], [undefined, []]);
    assert.equal(await page.evaluate(`localStorage.getItem('pea-curated-kept-v1')`), null);
    assert.equal(asked().length, reads);
    await page.close();
  },
);
