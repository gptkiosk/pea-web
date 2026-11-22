// Browser-level checks for Curated sources on Today. The catalog is a stand-in answered by this
// run with the public project's own sample output; nothing leaves this machine. Nothing is
// fetched before the owner approves, every file is checked before it is used, and a file that
// fails leaves what PEA had.
// Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { browserSkipReason, openConnectedPage, startStack } from './harness.mjs';

const skip = browserSkipReason();
const options = { skip, timeout: 90000 };
const base = 'https://gptkiosk.github.io/pea-knowledge-processor/';
const dist = Object.fromEntries(
  Object.entries(
    JSON.parse(readFileSync(new URL('../fixtures/KnowledgeDist.json', import.meta.url), 'utf8')).files,
  ).map(([path, b64]) => [path, Buffer.from(b64, 'base64').toString('utf8')]),
);

let stack;
before(
  async () => {
    if (!skip) stack = await startStack(() => 'A plain synthetic reply.');
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

const reviewOpen = `document.getElementById('review').open`;
const idle = `!document.getElementById('curated-browse').disabled`;
const cards = (page) =>
  page.evaluate(`[...document.querySelectorAll('#curated-list > li')].map((li) => ({
    name: li.querySelector('strong').textContent,
    button: li.querySelector('button').textContent,
    held: li.querySelector('.curated-held')?.textContent ?? '',
    banner: li.querySelector('.curated-banner')?.textContent ?? '',
  }))`);
const rows = (page) =>
  page.evaluate(
    `[...document.querySelectorAll('#curated-activity li')].map((li) => li.querySelector('span:last-child').textContent)`,
  );
const note = (page) => page.evaluate(`document.getElementById('curated-note').textContent`);
const asked = (page) =>
  page.intercepted.filter((r) => r.url.startsWith(base)).map((r) => r.url.slice(base.length));

// Opens Today with the stand-in catalog. `catalog.files` can be changed by a test.
async function openToday() {
  const page = await openConnectedPage(stack, { width: 1500 });
  const catalog = { files: { ...dist } };
  await page.route(base, (url) => {
    const path = url.slice(base.length);
    return path in catalog.files
      ? { type: 'application/json; charset=utf-8', text: catalog.files[path] }
      : { status: 404, text: 'not found' };
  });
  await page.click('#tab-today');
  await page.evaluate(`document.getElementById('curated-section').open = true`);
  return { page, catalog };
}
async function browse(page) {
  await page.evaluate(`document.getElementById('curated-browse').click()`);
  await page.waitFor(reviewOpen, 'the review');
  await page.click('#review-approve');
  await page.waitFor(`document.querySelectorAll('#curated-list > li').length > 0 && ${idle}`, 'the list');
}
const press = async (page, label) => {
  await page.evaluate(
    `document.querySelector('#curated-list button[aria-label=${JSON.stringify(label)}]').click()`,
  );
};

test(
  'nothing is fetched until the owner approves; then one list, and a followed show’s checked briefs',
  options,
  async () => {
    const { page } = await openToday();
    assert.equal(await page.evaluate(`document.getElementById('curated-status').textContent`), 'Off');
    assert.deepEqual(asked(page), [], 'opening the card asks nothing');

    await page.evaluate(`document.getElementById('curated-browse').click()`);
    await page.waitFor(reviewOpen, 'the review');
    const shown = await page.text('#review-body');
    assert.match(shown, /gptkiosk\.github\.io \(GitHub Pages\)/);
    assert.match(shown, /the same for everyone/);
    assert.match(shown, /the host can tell which shows this address follows/);
    assert.match(shown, /kept in this browser, in plain form \(they are public files\)/);
    assert.match(shown, /unless you turn on Stay current/);
    await page.click('#review-cancel');
    await page.waitFor(`!${reviewOpen}`);
    assert.deepEqual(asked(page), [], 'declining asks nothing');
    assert.equal(await page.evaluate(`localStorage.getItem('pea-curated-v1')`), null);

    await browse(page);
    assert.deepEqual(asked(page), ['store.json'], 'browsing fetches the one list and nothing else');
    const listed = await cards(page);
    assert.equal(listed.length, 3, 'a show with nothing to talk about yet is not offered');
    assert.ok(listed.every((c) => c.button === 'Follow'));
    assert.ok(listed.some((c) => c.name === 'Harbor Voices'));
    assert.deepEqual(await rows(page), [
      'Read and checked the curator’s list: 5 sources',
      'No show is followed, so nothing else was fetched.',
    ]);

    await press(page, 'Follow Harbor Voices');
    await page.waitFor(
      `/briefs kept in this browser/.test(document.querySelector('#curated-list .curated-held')?.textContent ?? '') && ${idle}`,
      'the followed show',
    );
    const after = asked(page).slice(1);
    assert.equal(after[0], 'store.json', 'the list is checked again first');
    assert.equal(after[1], 'sources/harbor-voices/items.json');
    assert.equal(after.length, 5, 'then that show’s three briefs, and no digest or transcript');
    assert.ok(after.slice(2).every((path) => /^sources\/harbor-voices\/[a-z0-9-]+\.brief\.json$/.test(path)));
    const mine = (await cards(page)).find((c) => c.name === 'Harbor Voices');
    assert.equal(mine.button, 'Unfollow');
    assert.equal(mine.held, '3 briefs kept in this browser');
    assert.match((await rows(page)).join(' | '), /Harbor Voices: 3 briefs checked and kept/);
    assert.equal(await page.evaluate(`document.getElementById('curated-status').textContent`), '1 followed');
    const choice = JSON.parse(await page.evaluate(`localStorage.getItem('pea-curated-v1')`));
    assert.ok(Number.isSafeInteger(choice.checked) && choice.checked <= Date.now());
    delete choice.checked;
    assert.deepEqual(
      choice,
      { on: true, followed: ['harbor-voices'], numbers: { 'harbor-voices': 1 } },
      'the choice, the show’s id, its number and the time of the check are saved',
    );
    // The checked public files are kept beside it, exactly as they arrived.
    const kept = JSON.parse(await page.evaluate(`localStorage.getItem('pea-curated-kept-v1')`));
    assert.equal(kept.store, dist['store.json']);
    assert.deepEqual(Object.keys(kept.shows), ['harbor-voices']);
    assert.equal(Object.keys(kept.shows['harbor-voices'].briefs).length, 3);

    // Requests carry no cookie, no sign-in and no referrer.
    for (const r of page.intercepted.filter((x) => x.url.startsWith(base))) {
      const names = Object.keys(r.headers).map((h) => h.toLowerCase());
      assert.ok(
        !names.includes('cookie') && !names.includes('authorization') && !names.includes('referer'),
        r.url,
      );
      assert.equal(new URL(r.url).search, '');
    }

    // After a reload the choice and the kept briefs are back, checked again, and nothing is asked.
    const before = asked(page).length;
    await page.reload();
    await page.waitFor(
      `document.getElementById('curated-status')?.textContent === '1 followed'`,
      'the reload',
    );
    assert.equal(asked(page).length, before, 'a reload asks nothing');
    await page.waitFor(
      `document.getElementById('curated-peek').textContent === '3 briefs ready' && ${idle}`,
      'the kept briefs to be checked and back',
    );
    assert.equal(asked(page).length, before, 'bringing them back asks nothing');
    assert.equal(
      (await cards(page)).find((c) => c.name === 'Harbor Voices').held,
      '3 briefs kept in this browser',
    );
    assert.equal(
      await page.evaluate(`document.querySelectorAll('#curated-lately-list > li').length`),
      3,
      'and the newest episodes are listed',
    );

    // A kept file that was altered in storage fails the same checks and is left out.
    await page.evaluate(`(() => {
      const kept = JSON.parse(localStorage.getItem('pea-curated-kept-v1'));
      const id = Object.keys(kept.shows['harbor-voices'].briefs)[0];
      kept.shows['harbor-voices'].briefs[id] = kept.shows['harbor-voices'].briefs[id].replace('"', ' "');
      localStorage.setItem('pea-curated-kept-v1', JSON.stringify(kept));
    })()`);
    await page.reload();
    await page.waitFor(
      `document.getElementById('curated-peek')?.textContent === '2 briefs ready' && ${idle}`,
      'the altered brief to be left out',
    );
    assert.equal(asked(page).length, before);

    await page.evaluate(`document.getElementById('curated-off').click()`);
    assert.equal(await page.evaluate(`localStorage.getItem('pea-curated-v1')`), null);
    assert.equal(await page.evaluate(`localStorage.getItem('pea-curated-kept-v1')`), null);
    assert.equal(await page.evaluate(`document.querySelectorAll('#curated-list > li').length`), 0);
    assert.deepEqual(
      page.outsideRequests().filter((url) => !url.startsWith(base)),
      [],
    );
    await page.close();
  },
);

test(
  'a file that fails its checks is not used, and a bad list leaves the last good one in place',
  options,
  async () => {
    const { page, catalog } = await openToday();
    // One brief arrives with a word changed: the bytes are not the promised ones.
    const path = Object.keys(dist).find((p) => /^sources\/harbor-voices\/.*\.brief\.json$/.test(p));
    catalog.files[path] = dist[path].replace('Grey Point', 'GREY POINT');
    assert.notEqual(catalog.files[path], dist[path]);
    await browse(page);
    await press(page, 'Follow Harbor Voices');
    await page.waitFor(
      `/kept in this browser/.test(document.querySelector('#curated-list .curated-held')?.textContent ?? '') && ${idle}`,
      'the followed show',
    );
    assert.equal(
      (await cards(page)).find((c) => c.name === 'Harbor Voices').held,
      '2 briefs kept in this browser, 1 refused',
    );
    assert.match(
      (await rows(page)).join(' | '),
      /Harbor Voices: 2 briefs checked and kept, 1 refused or missing/,
    );
    assert.doesNotMatch(await page.text('#curated-section'), /GREY POINT/);

    // The list comes back as a web page, then with a link hidden in a message: both are ignored whole.
    for (const bad of [
      '<html><body>Sign in</body></html>',
      dist['store.json'].replace('"Harbor Voices"', '"See https://evil.example.org"'),
    ]) {
      catalog.files['store.json'] = bad;
      await page.evaluate(`document.getElementById('curated-browse').click()`);
      await page.waitFor(
        `/Couldn’t check for updates/.test(document.getElementById('curated-note').textContent) && ${idle}`,
        'the notice',
      );
      assert.equal((await cards(page)).length, 3, 'the last good list is still shown');
      assert.equal(
        (await cards(page)).find((c) => c.name === 'Harbor Voices').held,
        '2 briefs kept in this browser, 1 refused',
      );
      assert.doesNotMatch(await page.text('#curated-section'), /evil\.example|Sign in/);
      await page.evaluate(`document.getElementById('curated-note').textContent = ''`);
    }

    // A show the curator took out of the list is unfollowed, with a plain note.
    const store = JSON.parse(dist['store.json']);
    store.sources = store.sources.filter((s) => s.id !== 'harbor-voices');
    catalog.files['store.json'] = JSON.stringify(store);
    await page.evaluate(`document.getElementById('curated-browse').click()`);
    await page.waitFor(
      `/The curator removed Harbor Voices\\./.test(document.getElementById('curated-note').textContent) && ${idle}`,
      'the removal',
    );
    assert.equal((await cards(page)).length, 2);
    const left = JSON.parse(await page.evaluate(`localStorage.getItem('pea-curated-v1')`));
    delete left.checked;
    assert.deepEqual(left, { on: true, followed: [], numbers: { 'harbor-voices': 1 } });
    await page.close();
  },
);

test(
  'a podcast request is only a filled-in link the owner opens; nothing is sent from the page',
  options,
  async () => {
    const { page } = await openToday();
    assert.equal(await page.evaluate(`document.getElementById('curated-request').hidden`), true);
    await browse(page);
    await page.evaluate(`document.getElementById('curated-request').open = true`);
    const prepare = async (name, feed, site = '', notes = '') => {
      await page.fill('#curated-request-name', name);
      await page.fill('#curated-request-feed', feed);
      await page.fill('#curated-request-site', site);
      await page.fill('#curated-request-notes', notes);
      await page.evaluate(`document.getElementById('curated-request-form').requestSubmit()`);
      return page.evaluate(`({
      hidden: document.getElementById('curated-request-open').hidden,
      href: document.getElementById('curated-request-open').getAttribute('href'),
      note: document.getElementById('curated-request-note').textContent,
    })`);
    };
    for (const [feed, why] of [
      ['http://feeds.example.org/show.xml', /full public https/],
      ['https://user:pass@feeds.example.org/show.xml', /full public https/],
      ['https://10.0.0.5/show.xml', /full public https/],
      ['', /feed address or its website/],
    ]) {
      const got = await prepare('Synthetic Show', feed);
      assert.equal(got.hidden, true, feed);
      assert.equal(got.href, null);
      assert.match(got.note, why);
    }
    const before = page.intercepted.length;
    const got = await prepare(
      'Synthetic Show',
      'https://feeds.example.org/show.xml',
      '',
      'Transcripts are on each\nepisode page.',
    );
    assert.equal(got.hidden, false);
    const url = new URL(got.href);
    assert.equal(url.origin + url.pathname, 'https://github.com/gptkiosk/pea-knowledge-processor/issues/new');
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      template: 'request-podcast.yml',
      labels: 'source-request',
      title: 'Podcast request: Synthetic Show',
      show_name: 'Synthetic Show',
      feed_url: 'https://feeds.example.org/show.xml',
      notes: 'Transcripts are on each episode page.',
    });
    assert.match(got.note, /Nothing has been sent/);
    assert.equal(page.intercepted.length, before, 'preparing the link asks nobody');
    // Typing again withdraws the link until it is prepared again.
    await page.fill('#curated-request-name', 'Another');
    await page.evaluate(`document.getElementById('curated-request-name').dispatchEvent(new Event('input'))`);
    assert.equal(await page.evaluate(`document.getElementById('curated-request-open').hidden`), true);
    await page.close();
  },
);

test(
  'a show keeps its number for good, and keeps three episodes unless the owner chooses another number',
  options,
  async () => {
    const { page } = await openToday();
    await browse(page);
    const follow = async (name) => {
      await press(page, 'Follow ' + name);
      await page.waitFor(
        `[...document.querySelectorAll('#curated-list > li')].some((li) => li.querySelector('strong').textContent === ${JSON.stringify(name)} && /kept in this browser/.test(li.querySelector('.curated-held')?.textContent ?? '')) && ${idle}`,
        'following ' + name,
      );
    };
    const keeping = (name) =>
      page.evaluate(`(() => {
        const li = [...document.querySelectorAll('#curated-list > li')].find((x) => x.querySelector('strong').textContent === ${JSON.stringify(name)});
        return li ? { label: li.querySelector('.curated-keep')?.firstChild.textContent ?? '', keep: li.querySelector('select')?.value ?? '', held: li.querySelector('.curated-held')?.textContent ?? '' } : null;
      })()`);
    const shows = async () => {
      await page.click('#tab-chat');
      await page.fill('#thought', 'list shows');
      await page.evaluate(`document.querySelector('#composer').requestSubmit()`);
      await page.waitFor(`!document.getElementById('numbered').hidden`, 'the list of shows');
      const rows = await page.evaluate(
        `[...document.querySelectorAll('#numbered ol > li')].map((li) => li.querySelector('.numbered-label').textContent + ' ' + li.querySelector('.numbered-label').nextElementSibling.firstChild.textContent)`,
      );
      await page.click('#tab-today');
      return rows;
    };
    await follow('Harbor Voices');
    await follow('Tide Tables');
    assert.deepEqual(await keeping('Harbor Voices'), {
      label: 'Show 1 · keep the newest ',
      keep: '3',
      held: '3 briefs kept in this browser',
    });
    // Tide Tables has four episodes; three are kept unless the owner asks for more.
    assert.deepEqual(await keeping('Tide Tables'), {
      label: 'Show 2 · keep the newest ',
      keep: '3',
      held: '3 briefs kept in this browser',
    });
    assert.deepEqual(await shows(), ['1 Harbor Voices', '2 Tide Tables']);

    // Unfollowing Show 1 leaves Show 2 as Show 2, and following it again gives it back its number.
    await press(page, 'Unfollow Harbor Voices');
    assert.deepEqual(await shows(), ['2 Tide Tables']);
    await page.fill('#thought', '2.1');
    await page.click('#tab-chat');
    await page.evaluate(`document.querySelector('#composer').requestSubmit()`);
    await page.waitFor(
      `document.querySelector('#numbered .numbered-head strong')?.textContent.startsWith('Episode 2.1')`,
      'episode 2.1 of the show that kept its number',
    );
    await page.click('#tab-today');
    await follow('The Lamp Room');
    await follow('Harbor Voices');
    assert.deepEqual(await shows(), ['1 Harbor Voices', '2 Tide Tables', '3 The Lamp Room']);

    // Fewer episodes takes effect at once with no fetch; more fetches that show again.
    const choose = async (name, n) => {
      await page.evaluate(`(() => {
        const select = document.querySelector('#curated-list select[aria-label=${JSON.stringify('Episodes to keep for ' + name)}]');
        select.value = ${JSON.stringify(String(n))};
        select.dispatchEvent(new Event('change'));
      })()`);
    };
    let before = asked(page).length;
    await choose('Tide Tables', 1);
    await page.waitFor(
      `/Keeping the newest 1 for Tide Tables\\. Nothing was fetched\\./.test(document.getElementById('curated-note').textContent)`,
      'the note',
    );
    assert.equal((await keeping('Tide Tables')).held, '1 brief kept in this browser');
    assert.equal(asked(page).length, before, 'keeping fewer fetches nothing');
    await choose('Tide Tables', 5);
    await page.waitFor(
      `[...document.querySelectorAll('#curated-list .curated-held')].some((n) => n.textContent === '4 briefs kept in this browser') && ${idle}`,
      'all four episodes',
    );
    assert.ok(asked(page).length > before, 'keeping more asks for that show again');
    const saved = JSON.parse(await page.evaluate(`localStorage.getItem('pea-curated-v1')`));
    delete saved.checked;
    assert.deepEqual(saved, {
      on: true,
      followed: ['tide-tables', 'lamp-room', 'harbor-voices'],
      numbers: { 'harbor-voices': 1, 'tide-tables': 2, 'lamp-room': 3 },
      keep: { 'tide-tables': 5 },
    });

    // Only the explicit action gives new numbers, and it says a number may change.
    await page.evaluate(`document.getElementById('curated-renumber').click()`);
    await page.waitFor(reviewOpen, 'the review');
    assert.match(
      await page.text('#review-body'),
      /A show’s number may change, so “Show 2” may mean a different show afterwards/,
    );
    await page.click('#review-approve');
    await page.waitFor(
      `!${reviewOpen} && ${idle} && [...document.querySelectorAll('#curated-list .curated-held')].filter((n) => /kept in this browser/.test(n.textContent)).length === 3`,
      'the refresh',
    );
    assert.deepEqual(await shows(), ['1 Tide Tables', '2 The Lamp Room', '3 Harbor Voices']);
    await page.close();
  },
);

test(
  'a followed show can be switched off and on, topics filter the list locally, and Stay current checks by itself only when chosen and due',
  options,
  async () => {
    const { page } = await openToday();
    await browse(page);
    const held = (n) =>
      `[...document.querySelectorAll('#curated-list .curated-held')].filter((x) => /kept in this browser/.test(x.textContent)).length === ${n} && ${idle}`;
    await press(page, 'Follow Harbor Voices');
    await page.waitFor(held(1), 'the first show');
    await press(page, 'Follow Tide Tables');
    await page.waitFor(held(2), 'the second show');
    const said = async (text) => {
      await page.click('#tab-chat');
      await page.fill('#thought', text);
      await page.evaluate(`document.querySelector('#composer').requestSubmit()`);
      await page.waitFor(`!document.getElementById('numbered').hidden`, 'the list of shows');
      const out = await page.evaluate(
        `[...document.querySelectorAll('#numbered ol > li')].map((li) => li.querySelector('.numbered-label').textContent + ' ' + li.querySelector('.numbered-label').nextElementSibling.firstChild.textContent)`,
      );
      await page.click('#tab-today');
      return out;
    };
    const use = (name) =>
      page.evaluate(`(() => {
        const li = [...document.querySelectorAll('#curated-list > li')].find((x) => x.querySelector('strong').textContent === ${JSON.stringify(name)});
        li.querySelector('.curated-use input').click();
      })()`);
    assert.deepEqual(await said('list shows'), ['1 Harbor Voices', '2 Tide Tables']);

    // Off: not offered in conversation, not fetched, and its number and briefs stay.
    let before = asked(page).length;
    await use('Harbor Voices');
    await page.waitFor(
      `/Harbor Voices is switched off/.test(document.getElementById('curated-note').textContent)`,
      'the note',
    );
    assert.equal(asked(page).length, before, 'switching off asks nothing');
    assert.deepEqual(await said('list shows'), ['2 Tide Tables'], 'Show 2 is still Show 2');
    assert.deepEqual(JSON.parse(await page.evaluate(`localStorage.getItem('pea-curated-v1')`)).off, [
      'harbor-voices',
    ]);
    assert.equal(await page.evaluate(`document.querySelectorAll('#curated-lately-list > li').length`), 3);
    await page.evaluate(`document.getElementById('curated-browse').click()`);
    await page.waitFor(
      `/Tide Tables: 3 briefs checked/.test(document.getElementById('curated-activity').textContent) && ${idle}`,
      'the refresh',
    );
    assert.deepEqual(
      asked(page)
        .slice(before)
        .filter((p) => p.includes('harbor-voices')),
      [],
      'a refresh leaves a switched-off show alone',
    );
    assert.equal(
      (await cards(page)).find((c) => c.name === 'Harbor Voices').held,
      '3 briefs kept in this browser',
    );

    // On again: used at once, with its old number, and checked.
    before = asked(page).length;
    await use('Harbor Voices');
    await page.waitFor(
      `/Harbor Voices: 3 briefs checked/.test(document.getElementById('curated-activity').textContent) && ${idle}`,
      'the show to be checked',
    );
    assert.ok(asked(page).slice(before).includes('sources/harbor-voices/items.json'));
    assert.deepEqual(await said('list shows'), ['1 Harbor Voices', '2 Tide Tables']);

    // Topic buttons filter what is already here and fetch nothing.
    before = asked(page).length;
    const topics = await page.evaluate(
      `[...document.querySelectorAll('#curated-topics button')].map((b) => b.textContent)`,
    );
    assert.equal(topics[0], 'All');
    assert.ok(topics.includes('Technology') && topics.includes('History'));
    assert.ok(!topics.includes('Sports'), 'only topics a listed show has');
    await page.evaluate(
      `[...document.querySelectorAll('#curated-topics button')].find((b) => b.textContent === 'Technology').click()`,
    );
    assert.deepEqual(
      (await cards(page)).map((c) => c.name),
      ['The Lamp Room'],
    );
    await page.evaluate(`document.querySelector('#curated-topics button').click()`);
    assert.equal((await cards(page)).length, 3);
    assert.equal(asked(page).length, before, 'filtering asks nothing');

    // Stay current is off until chosen: an old check and a reload ask nothing.
    const age = async (hours, current) => {
      await page.evaluate(`(() => {
        const saved = JSON.parse(localStorage.getItem('pea-curated-v1'));
        saved.checked = Date.now() - ${hours} * 3600000;
        ${current ? 'saved.current = true;' : 'delete saved.current;'}
        localStorage.setItem('pea-curated-v1', JSON.stringify(saved));
      })()`);
      await page.reload();
    };
    const back = `document.getElementById('curated-peek').textContent === '6 briefs ready' && ${idle}`;
    await age(7, false);
    await page.waitFor(back, 'the reload');
    assert.equal(await page.evaluate(`document.getElementById('curated-current').checked`), false);
    assert.equal(asked(page).length, before, 'off: nothing is asked');
    // On and checked less than six hours ago: still nothing.
    await age(5, true);
    await page.waitFor(back, 'the reload');
    assert.equal(await page.evaluate(`document.getElementById('curated-current').checked`), true);
    await page.evaluate(`document.dispatchEvent(new Event('visibilitychange'))`);
    assert.equal(asked(page).length, before, 'not due: nothing is asked');
    // On and due: one check by itself, of the list and the followed shows.
    await age(7, true);
    await page.waitFor(
      `/6 briefs are kept in this browser/.test(document.getElementById('curated-activity').textContent) && ${idle}`,
      'the check by itself',
    );
    const own = asked(page).slice(before);
    assert.equal(own[0], 'store.json');
    assert.ok(
      own.includes('sources/harbor-voices/items.json') && own.includes('sources/tide-tables/items.json'),
    );
    assert.ok(
      Date.now() - JSON.parse(await page.evaluate(`localStorage.getItem('pea-curated-v1')`)).checked < 60000,
    );
    const after = asked(page).length;
    await page.evaluate(`document.dispatchEvent(new Event('visibilitychange'))`);
    assert.equal(asked(page).length, after, 'and not again until six hours have passed');
    assert.deepEqual(
      page.outsideRequests().filter((url) => !url.startsWith(base)),
      [],
    );
    await page.close();
  },
);
