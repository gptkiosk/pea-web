// Browser-level checks for the list of what PEA did in a GitHub delivery. GitHub is a stand-in
// answered by this run; nothing leaves this machine and no real account or token is used.
// Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { browserSkipReason, openConnectedPage, startStack } from './harness.mjs';

const skip = browserSkipReason();
const api = 'https://api.github.com/',
  repo = 'synthetic-owner/synthetic-repo',
  // Shaped like a token and made here; it opens nothing.
  token = ['ghp', 'A1b2C3d4E5'.repeat(3)].join('_'),
  sha = 'a'.repeat(40);
const source =
  'Here are the files.\n```file:hello.txt\nSYNTHETIC SOURCE WORDS\n```\n```file:notes/read.md\nMore.\n```\n';

let stack;
before(
  async () => {
    if (!skip) stack = await startStack(() => source);
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

const reviewOpen = `document.querySelector('#review').open`;
const list = (page) =>
  page.evaluate(`(() => {
    const box = document.querySelector('#github-activity details.activity');
    if (!box) return null;
    return {
      open: box.open,
      state: box.dataset.state,
      summary: box.querySelector('summary').textContent,
      rows: [...box.querySelectorAll('li')].map((li) => li.querySelector('span:last-child').textContent),
      problems: box.querySelectorAll('li[data-state="problem"]').length,
    };
  })()`);

test(
  'a GitHub delivery lists each thing PEA did, and says so when it stops part way',
  { skip, timeout: 90000 },
  async () => {
    const page = await openConnectedPage(stack);
    const github = { failFiles: false, head: sha };
    await page.route(api, (url, request) => {
      const path = new URL(url).pathname;
      if (request.method === 'OPTIONS') return { status: 204, text: '' };
      if (path === '/repos/' + repo)
        return { body: { full_name: repo, private: true, default_branch: 'main' } };
      if (path === `/repos/${repo}/git/ref/heads/main`) return { body: { object: { sha: github.head } } };
      if (path === `/repos/${repo}/git/refs`) return { status: 201, body: { ref: 'made' } };
      if (path.startsWith(`/repos/${repo}/contents/`))
        return github.failFiles
          ? { status: 500, body: { message: 'SYNTHETIC GITHUB DETAIL' } }
          : { status: 201, body: { content: {} } };
      if (path === `/repos/${repo}/pulls`)
        return { status: 201, body: { html_url: `https://github.com/${repo}/pull/7` } };
      return { status: 404, body: {} };
    });

    // Source files come from a Greenhouse reply.
    await page.click('#tab-greenhouse');
    await page.fill('#collaboration-model', 'local:synthetic-model');
    const asked = stack.model.requests.length;
    await page.fill('#collab-thought', 'Write two synthetic files.');
    await page.evaluate(`document.getElementById('collab-send').click()`);
    await page.waitFor(reviewOpen, 'the sharing review');
    await page.click('#review-approve');
    await page.waitFor(
      `!document.querySelector('#profile').disabled && /SYNTHETIC SOURCE WORDS/.test(document.querySelector('#collab-messages').textContent)`,
      'the reply with files',
    );
    assert.equal(stack.model.requests.length, asked + 1);

    await page.fill('#github-repo', repo);
    await page.fill('#github-token', token);
    await page.evaluate(`document.getElementById('github-connect').click()`);
    await page.waitFor(
      `document.querySelector('#connection-note').textContent.startsWith('Verified ${repo}')`,
      'the repository check',
    );
    assert.equal(await list(page), null, 'checking a repository is not a delivery');

    const deliver = async () => {
      await page.evaluate(`document.getElementById('github-deliver').click()`);
      await page.waitFor(reviewOpen, 'the delivery review');
    };
    await deliver();
    let seen = await list(page);
    assert.equal(seen.state, 'active');
    assert.deepEqual(seen.rows, ['GitHub confirmed the repository: private, and its main branch']);
    await page.click('#review-cancel');
    await page.waitFor(
      `document.querySelector('#github-activity details.activity')?.dataset.state === 'stopped'`,
    );
    seen = await list(page);
    assert.equal(seen.rows.at(-1), 'You did not approve it. Nothing was written to GitHub.');
    const writes = () =>
      page.intercepted.filter((r) => r.url.startsWith(api) && !['GET', 'OPTIONS'].includes(r.method));
    assert.equal(writes().length, 0, 'declining writes nothing');

    await page.waitFor(`!document.querySelector('#profile').disabled`);
    await deliver();
    await page.click('#review-approve');
    await page.waitFor(
      `document.querySelector('#github-activity details.activity')?.dataset.state === 'done'`,
    );
    seen = await list(page);
    assert.equal(seen.open, false);
    assert.equal(seen.problems, 0);
    assert.match(seen.summary, /^What PEA did · 6 steps · /);
    assert.deepEqual(seen.rows, [
      'GitHub confirmed the repository: private, and its main branch',
      'You reviewed 2 files and where they go',
      'The repository is the same as the one you reviewed',
      'Created a new branch for this delivery',
      'Added 2 files in a new folder. No existing file was changed.',
      'Opened a draft pull request. Nothing was merged and PEA ran no code.',
    ]);
    assert.equal(writes().length, 4, 'one branch, two files, one draft pull request');
    const said = seen.rows.join(' ');
    assert.ok(!said.includes(token) && !said.includes(repo) && !/SYNTHETIC SOURCE/.test(said));

    // The second file fails: the list says a partial delivery may exist, in PEA's own words.
    github.failFiles = true;
    await page.waitFor(`!document.querySelector('#profile').disabled`);
    await deliver();
    await page.click('#review-approve');
    await page.waitFor(
      `document.querySelector('#github-activity details.activity')?.dataset.state === 'failed'`,
    );
    seen = await list(page);
    assert.equal(seen.open, true);
    assert.equal(seen.problems, 1);
    assert.match(
      seen.rows.at(-1),
      /^It stopped part way\. A branch, some files or a draft pull request may exist\./,
    );
    assert.doesNotMatch(seen.rows.join(' '), /SYNTHETIC GITHUB DETAIL/);

    // The repository moving on after the review stops it before anything is written.
    github.failFiles = false;
    const before = writes().length;
    await page.waitFor(`!document.querySelector('#profile').disabled`);
    await deliver();
    github.head = 'b'.repeat(40);
    await page.click('#review-approve');
    await page.waitFor(
      `document.querySelector('#github-activity details.activity')?.dataset.state === 'failed'`,
    );
    seen = await list(page);
    assert.equal(
      seen.rows.at(-1),
      'The repository changed after your review. Nothing was written to GitHub.',
    );
    assert.equal(writes().length, before);
    assert.deepEqual(
      page.outsideRequests().filter((url) => !url.startsWith(api)),
      [],
    );
    await page.close();
  },
);
