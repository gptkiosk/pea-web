// Browser-level checks for the list of what PEA did when it reads a page, writes a document or
// makes a picture. Sites and OpenRouter are stand-ins started or answered by this run.
// Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { askModel, browserSkipReason, openConnectedPage, openReview, startStack } from './harness.mjs';

const skip = browserSkipReason();
const options = { skip, timeout: 90000 };
const block = (kind, value) => '```pea-' + kind + '\n' + JSON.stringify(value) + '\n```\n';
const story = 'https://pages.example/story';
const site = {
  names: ['pages.example'],
  answer({ path }) {
    if (path === '/story')
      return { body: '<title>Synthetic Gazette</title><p>Rain is expected in Fixtureville.</p>' };
    if (path === '/old') return { status: 301, location: story };
    return { status: 404, body: 'SITE ERROR WORDS' };
  },
};
const replies = {
  gazette: 'I can read that page.\n' + block('read', { op: 'read', url: story }),
  resume:
    'I will draft that resume.\n' +
    block('doc', {
      op: 'doc_create',
      type: 'resume',
      title: 'Sam Rivera Resume',
      sections: [{ heading: 'Summary', body: 'Synthetic line cook' }],
    }),
};

let stack;
before(
  async () => {
    if (!skip)
      stack = await startStack(
        (said) => {
          const key = Object.keys(replies).find((word) => said.includes(word));
          return key ? replies[key] : 'A plain synthetic reply.';
        },
        { site },
      );
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

// A work list at `selector`, read from the page: null when there is none.
const list = (page, selector) =>
  page.evaluate(`(() => {
    const box = document.querySelector(${JSON.stringify(selector)});
    if (!box) return null;
    return {
      open: box.open,
      state: box.dataset.state,
      summary: box.querySelector('summary').textContent,
      rows: [...box.querySelectorAll('li')].map((li) => li.querySelector('span:last-child').textContent),
      icons: [...box.querySelectorAll('li')].every((li) => li.querySelector('svg.activity-icon path, .activity-spinner')),
      problems: box.querySelectorAll('li[data-state="problem"]').length,
    };
  })()`);
const reviewOpen = `document.getElementById('review').open`;
const ask = (page, text) =>
  page.evaluate(
    `(() => { document.getElementById('thought').value = ${JSON.stringify(text)}; document.getElementById('composer').requestSubmit(); })()`,
  );

test(
  'reading a page lists the approval, the read and what was kept, over the page card',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1400, height: 900 });
    assert.equal(await page.evaluate(`document.getElementById('page-activity').hidden`), true);

    // A read the model suggested: nothing is listed until the owner approves.
    await askModel(stack, page, 'What does the gazette say today?');
    await openReview(page, 'Review page: pages.example');
    await page.click('#review-cancel');
    await page.waitFor(`!${reviewOpen}`);
    assert.equal(await list(page, '#page-activity details.activity'), null);

    await openReview(page, 'Review page: pages.example');
    await page.click('#review-approve');
    await page.waitFor(`!document.getElementById('context-page').hidden`, 'the page to be kept');
    let seen = await list(page, '#page-activity details.activity');
    assert.equal(seen.state, 'done');
    assert.equal(seen.open, false);
    assert.equal(seen.icons, true);
    assert.match(seen.summary, /^What PEA did · 3 steps · /);
    assert.equal(seen.rows[0], 'You approved reading pages.example, which PEA’s reply suggested');
    assert.equal(seen.rows[1], 'Your PEA server read the page at pages.example');
    assert.match(seen.rows[2], /^Kept \d+ of \d+ characters as plain words, in this tab only$/);
    // The list sits just over the page card, and none of it went to the model.
    assert.equal(
      await page.evaluate(`document.getElementById('page-activity').nextElementSibling.id`),
      'context-page',
    );
    assert.ok(!JSON.stringify(stack.model.requests).includes('Your PEA server read the page'));

    // The owner's own request, to an address that has moved: both approvals are listed.
    await ask(page, 'read https://pages.example/old');
    await page.waitFor(reviewOpen, 'the first review');
    await page.click('#review-approve');
    await page.waitFor(
      `${reviewOpen} && document.getElementById('review-title').textContent.includes('moved')`,
      'the review of the new address',
    );
    const waiting = await list(page, '#page-activity details.activity');
    assert.equal(waiting.state, 'active');
    assert.deepEqual(waiting.rows, [
      'You approved reading pages.example',
      'pages.example answered that the page has moved',
    ]);
    await page.click('#review-approve');
    await page.waitFor(
      `document.querySelector('#page-activity details.activity')?.dataset.state === 'done'`,
      'the moved page to be read',
    );
    seen = await list(page, '#page-activity details.activity');
    assert.deepEqual(seen.rows.slice(0, 4), [
      'You approved reading pages.example',
      'pages.example answered that the page has moved',
      'You approved the new address at pages.example',
      'Your PEA server read the page at pages.example',
    ]);

    // A page that cannot be read says so and stays open; the site's own words are not shown.
    await ask(page, 'read https://pages.example/missing');
    await page.waitFor(reviewOpen, 'the review');
    await page.click('#review-approve');
    await page.waitFor(
      `document.querySelector('#page-activity details.activity')?.dataset.state === 'failed'`,
      'the failed read',
    );
    seen = await list(page, '#page-activity details.activity');
    assert.equal(seen.open, true);
    assert.equal(seen.problems, 1);
    assert.match(seen.summary, /did not finish$/);
    assert.ok(!seen.rows.join(' ').includes('SITE ERROR WORDS'));
    assert.ok(!seen.rows.some((r) => /^(Your PEA server read|Kept )/.test(r)));

    // Stop sharing takes the list away with the page.
    await page.evaluate(`document.getElementById('context-page-clear').click()`);
    assert.equal(await page.evaluate(`document.getElementById('page-activity').hidden`), true);
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();
  },
);

test(
  'an approved document lists what PEA did under the reply that proposed it, and in a debug export',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1400, height: 900 });
    await askModel(stack, page, 'Please draft my resume.');
    const work = '#messages .utterance.assistant details.activity:not(:first-of-type)';
    const count = () => page.evaluate(`document.querySelectorAll('#messages details.activity').length`);
    assert.equal(await count(), 1, 'only the reply’s own list before approval');

    await openReview(page, 'Review document: Sam Rivera Resume');
    await page.click('#review-cancel');
    await page.waitFor(`!${reviewOpen}`);
    assert.equal(await count(), 1, 'a cancelled review lists nothing');

    await openReview(page, 'Review document: Sam Rivera Resume');
    await page.click('#review-approve');
    await page.waitFor(`document.querySelectorAll('#messages details.activity').length === 2`, 'the document list');
    const seen = await list(page, work);
    assert.equal(seen.state, 'done');
    assert.equal(seen.icons, true);
    assert.deepEqual(seen.rows, [
      'You reviewed the document “Sam Rivera Resume”',
      'Prepared it as a file in this browser. Nothing was created in Google or sent to anyone.',
    ]);
    assert.match(await page.text('#messages'), /is ready as a file/);

    await page.evaluate(
      `(() => { const make = URL.createObjectURL.bind(URL); URL.createObjectURL = (blob) => { window.__exported = blob; return make(blob); }; })()`,
    );
    await page.evaluate(`document.getElementById('menu-export-chat').click()`);
    await page.click('#chat-export-debug');
    await page.click('#chat-export-submit');
    const text = await page.evaluate(`window.__exported.text()`);
    assert.match(
      text,
      /  Document · What PEA did · 2 steps · [^\n]+\n  - You reviewed the document “Sam Rivera Resume”\n  - Prepared it as a file/,
    );
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();
  },
);

const router = 'https://openrouter.ai/';
const key = 'sk-or-v1-' + 'syntheticSYNTHETIC'.repeat(2);
// One transparent pixel.
const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test(
  'a picture lists the price check, the review, the provider and the outcome, over the picture',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1400, height: 900 });
    let pictures = 'ok';
    await page.route(router, (url, request) => {
      if (request.method === 'OPTIONS') return { body: {} };
      if (url.endsWith('/api/v1/key')) return { body: { data: { label: 'synthetic' } } };
      if (url.endsWith('/api/v1/images/models'))
        return { body: { data: [{ id: 'synthetic/picture', name: 'Synthetic Picture' }] } };
      if (url.endsWith('/api/v1/images/models/synthetic/picture/endpoints'))
        return {
          body: {
            endpoints: [
              { provider_tag: 'synth-one', pricing: [{ billable: 'output_image', unit: 'image', cost_usd: '0.02' }] },
              { provider_tag: 'synth-dear', pricing: [{ billable: 'output_image', unit: 'image', cost_usd: '5' }] },
            ],
          },
        };
      if (url.endsWith('/api/v1/images'))
        return pictures === 'ok'
          ? { body: { data: [{ media_type: 'image/png', b64_json: pixel }] } }
          : { status: 500, body: { error: { message: 'SYNTHETIC PROVIDER DETAIL' } } };
      if (url.includes('/api/v1/models')) return { body: { data: [] } };
      return { status: 404 };
    });
    await page.fill('#router-key', key);
    await page.click('#router-connect');
    await page.waitFor(
      `document.getElementById('image-catalogue') && !document.getElementById('image-catalogue').disabled && !document.getElementById('profile').disabled`,
      'OpenRouter to connect',
    );
    await page.evaluate(`document.getElementById('image-catalogue').click()`);
    await page.waitFor(
      `[...document.getElementById('image-model').options].some((o) => o.value === 'synthetic/picture')`,
      'the picture models',
    );
    await page.fill('#image-model', 'synthetic/picture');
    await page.fill('#image-cap', '1');
    await page.evaluate(`document.querySelector('[data-tab="greenhouse"]').click()`);
    await page.fill('#greenhouse-role', 'image');
    const send = async (prompt) => {
      await page.fill('#collab-thought', prompt);
      await page.evaluate(`document.getElementById('collab-send').click()`);
      await page.waitFor(reviewOpen, 'the picture review');
    };
    const work = '#generated-activity details.activity';
    assert.equal(await page.evaluate(`document.getElementById('generated-activity').hidden`), true);

    await send('A synthetic pea pod on a table.');
    assert.equal(await list(page, work), null, 'nothing is listed before the review is approved');
    await page.click('#review-approve');
    await page.waitFor(`document.querySelector('${work}')?.dataset.state === 'done'`, 'the picture');
    let seen = await list(page, work);
    assert.equal(seen.open, false);
    assert.equal(seen.icons, true);
    assert.match(seen.summary, /^What PEA did · 4 steps · /);
    assert.deepEqual(seen.rows.slice(0, 3), [
      'Checked prices for synthetic/picture: 1 provider fits your $1 ceiling',
      'You reviewed the exact prompt and the price, $0.02 for one picture',
      'Sent the prompt to synth-one through OpenRouter',
    ]);
    assert.match(seen.rows[3], /^A picture arrived \(image\/png, 1 KB\)\. It is kept in this tab only\.$/);
    assert.ok(!seen.rows.join(' ').includes('pea pod'), 'the prompt’s words are not in the list');
    assert.equal(
      await page.evaluate(`document.getElementById('generated-activity').nextElementSibling.id`),
      'generated-output',
    );
    assert.equal(await page.evaluate(`document.querySelectorAll('#generated-output img').length`), 1);

    // A request that fails says so, stays open, and shows none of the provider's own words.
    pictures = 'broken';
    await send('Another synthetic picture.');
    await page.click('#review-approve');
    await page.waitFor(`document.querySelector('${work}')?.dataset.state === 'failed'`, 'the failed picture');
    seen = await list(page, work);
    assert.equal(seen.open, true);
    assert.equal(seen.problems, 1);
    assert.equal(
      seen.rows.at(-1),
      'The request did not finish. PEA did not retry or use another provider or model.',
    );
    assert.ok(!seen.rows.join(' ').includes('SYNTHETIC PROVIDER DETAIL'));
    assert.ok(!seen.rows.some((r) => r.startsWith('A picture arrived')));
    await page.close();
  },
);
