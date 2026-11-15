// Browser-level checks for documents written from templates: nothing is written until the owner
// has read and approved the exact text. Without a Google folder the result is a file to download.
// Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { askModel, browserSkipReason, openConnectedPage, openReview, startStack } from './harness.mjs';

const skip = browserSkipReason();
const options = { skip, timeout: 60000 };
const block = (value) => '```pea-doc\n' + JSON.stringify(value) + '\n```\n';
const replies = {
  resume:
    'I will draft that resume.\n' +
    block({
      op: 'doc_create',
      type: 'resume',
      title: 'Sam Rivera Resume',
      sections: [
        { heading: 'Summary', body: 'Synthetic line cook <script>window.injected = 1</script>' },
        { heading: 'Experience', body: '- Ran the synthetic grill\n- Trained cooks' },
      ],
    }),
  shorten:
    'Shortened the summary.\n' +
    block({ op: 'doc_update', sections: [{ heading: 'Summary', body: 'Synthetic sous chef.' }] }),
  rental:
    'Here is a plain agreement.\n' +
    block({
      op: 'doc_create',
      type: 'rental_agreement',
      title: 'Rental agreement',
      sections: [{ heading: 'Parties', body: '[Landlord] and [Tenant]' }],
    }),
  boast: 'All set, I’ve created the invoice for you.',
  spreadsheet:
    'Here.\n' + block({ op: 'doc_create', type: 'spreadsheet', title: 'Budget', sections: [{ body: 'x' }] }),
};

let stack;
before(
  async () => {
    if (!skip)
      stack = await startStack((said) => {
        const key = Object.keys(replies).find((word) => said.includes(word));
        return key ? replies[key] : 'A plain synthetic reply.';
      });
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

const downloads = (page) => page.evaluate(`document.querySelectorAll('#messages a[download]').length`);
const lastDownload = (page) =>
  page.evaluate(
    `(() => { const a = [...document.querySelectorAll('#messages a[download]')].at(-1); return { name: a.download, html: decodeURIComponent(a.href.slice(a.href.indexOf(',') + 1)) }; })()`,
  );
const systemPrompt = () => stack.model.requests.at(-1).messages[0].content;

test(
  'a document is shown in full for approval and becomes a download when no folder is connected',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1500 });
    await askModel(stack, page, 'Please write my resume.');
    assert.match(
      systemPrompt(),
      /resume: Needs the person’s name/,
      'the layout for the kind asked about is sent',
    );
    assert.doesNotMatch(systemPrompt(), /invoice: Needs/, 'other layouts are not');
    assert.match(systemPrompt(), /file to download; never say it is in Google Docs/);
    assert.doesNotMatch(await page.text('#messages'), /pea-doc|doc_create/, 'the action block is hidden');
    assert.equal(await downloads(page), 0);

    await openReview(page, 'Review document: Sam Rivera Resume');
    const shown = await page.text('#review-body');
    assert.match(shown, /Create a resume called “Sam Rivera Resume” \(Summary, Experience\)/);
    assert.match(shown, /## Experience\n- Ran the synthetic grill\n- Trained cooks/);
    assert.match(shown, /nothing is created in Google/);
    await page.click('#review-cancel');
    await page.waitFor(`!document.getElementById('review').open`);
    assert.equal(await downloads(page), 0, 'cancel changes nothing');

    await openReview(page, 'Review document: Sam Rivera Resume');
    await page.click('#review-approve');
    await page.waitFor(`document.querySelector('#messages a[download]')`, 'the download link');
    const file = await lastDownload(page);
    assert.equal(file.name, 'Sam Rivera Resume.html');
    assert(file.html.includes('<h1>Sam Rivera Resume</h1><h2>Summary</h2>'));
    assert(file.html.includes('<ul><li>Ran the synthetic grill</li><li>Trained cooks</li></ul>'));
    assert.equal(/<script/i.test(file.html), false, 'text from the model cannot become markup');
    assert(file.html.includes('&lt;script&gt;'));
    assert.equal(await page.evaluate(`window.injected`), undefined);
    assert.match(await page.text('#messages'), /is ready as a file\. Nothing was created in Google\./);
    assert.equal(await page.hasText('Review document'), false, 'the proposal cannot be approved twice');
    assert.deepEqual(page.outsideRequests(), [], 'nothing was sent to Google or anywhere else');

    await askModel(stack, page, 'Please shorten it.');
    assert.match(systemPrompt(), /doc_update/);
    assert.match(
      systemPrompt(),
      /## Experience\n- Ran the synthetic grill/,
      'the current text is given back for revising',
    );
    await openReview(page, 'Review new version: Sam Rivera Resume');
    assert.match(await page.text('#review-body'), /## Summary\nSynthetic sous chef\./);
    await page.click('#review-approve');
    await page.waitFor(`document.querySelectorAll('#messages a[download]').length === 2`, 'the second file');
    assert((await lastDownload(page)).html.includes('<p>Synthetic sous chef.</p>'));
    await page.close();
  },
);

test(
  'a rental agreement always carries the not-legal-advice note, in the review and in the file',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1500 });
    await askModel(stack, page, 'I need a rental agreement.');
    await openReview(page, 'Review document: Rental agreement');
    assert.match(await page.text('#review-body'), /It is not legal advice/);
    await page.click('#review-approve');
    await page.waitFor(`document.querySelector('#messages a[download]')`, 'the download link');
    assert.match(
      (await lastDownload(page)).html,
      /<p><i>[^<]*not legal advice[^<]*<\/i><\/p><\/body><\/html>$/,
    );
    await page.close();
  },
);

test('an update with no document, an unknown type and a bare claim write nothing', options, async () => {
  const page = await openConnectedPage(stack, { width: 1500 });
  await askModel(stack, page, 'Please shorten it.');
  assert.equal(await page.hasText('Review new version'), false, 'there is no document to change yet');
  await askModel(stack, page, 'Make a spreadsheet.');
  assert.equal(await page.hasText('Review document'), false);
  await askModel(stack, page, 'Please boast.');
  await page.waitFor(
    `document.getElementById('messages').innerText.includes('PEA did not create a document from this reply')`,
    'the correction',
  );
  assert.equal(await downloads(page), 0);
  assert.doesNotMatch(await page.text('#messages'), /doc_create|doc_update/);
  await page.close();
});

test(
  'a document belongs to one profile: another profile cannot revise it or see its text',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1500 });
    await askModel(stack, page, 'Please write my resume.');
    await openReview(page, 'Review document: Sam Rivera Resume');
    await page.click('#review-approve');
    await page.waitFor(`document.querySelector('#messages a[download]')`, 'the download link');
    // Connections are per profile, so Work connects the synthetic model for itself.
    await page.fill('#profile', 'work');
    await page.fill('#local-token', stack.gateway.token);
    await page.click('#local-connect');
    await page.waitFor(
      `[...document.querySelector('#chat-model').options].some((o) => o.value.startsWith('local:'))`,
      'the local model list for Work',
    );
    await page.fill('#chat-model', 'local:synthetic-model');
    await askModel(stack, page, 'Please shorten it.');
    assert.equal(
      await page.hasText('Review new version'),
      false,
      'another profile has no document to change',
    );
    assert.doesNotMatch(systemPrompt(), /synthetic grill/, 'and its text is not sent from the other profile');
    await page.close();
  },
);
