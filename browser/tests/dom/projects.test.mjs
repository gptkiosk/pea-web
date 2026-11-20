// Browser-level checks for Projects on Today: the owner's project engine read through the gateway,
// a reviewed draft, a chat suggestion that only fills the form, and the receipts in Harvest.
// The engine is a stand-in started for this run. Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { askModel, browserSkipReason, openConnectedPage, startStack } from './harness.mjs';

const skip = browserSkipReason();
const options = { skip, timeout: 90000 };
const HOSTILE = '<img src=x onerror="window.peaHacked=1"> SYNTHETIC ENGINE STORY';
const replies = {
  suggest:
    'Here is a draft to look over.\n```pea-project\n' +
    JSON.stringify({
      op: 'project_draft',
      title: 'Synthetic club site',
      brief: 'A small synthetic site for the club.',
      constraints: 'Static pages only',
    }) +
    '\n```\n',
  boast: 'Done. I’ve started the project in your engine.',
};

// What the stand-in engine holds. Tests change it to make the engine misbehave.
const engine = { refuse: 0, projects: [], next: 12 };
function reset() {
  engine.refuse = 0;
  engine.next = 12;
  engine.projects = [
    { id: 7, title: 'Synthetic garden plan', state: 'active' },
    { id: 5, title: 'Synthetic finished shed', state: 'closed' },
  ];
}
function answer(asked) {
  if (engine.refuse) return { status: engine.refuse, body: { detail: 'SYNTHETIC ENGINE DETAIL' } };
  if (asked.action === 'types')
    return {
      body: {
        types: [
          { id: 'local-website', label: 'Local website', summary: 'A synthetic static site.' },
          { id: 'other', label: 'Other work' },
        ],
      },
    };
  if (asked.action === 'list') return { body: { projects: engine.projects } };
  if (asked.action === 'draft') {
    const made = { id: engine.next++, title: asked.title, state: 'draft' };
    engine.projects.unshift(made);
    return { body: { project: made.id, title: made.title, state: 'draft', revision: 1 } };
  }
  if (asked.action === 'status') {
    const project = engine.projects.find((p) => p.id === asked.project);
    if (!project) return { status: 404, body: {} };
    const stories =
      project.id === 7
        ? [
            {
              title: 'Synthetic survey',
              state: 'done',
              agent: 'claude',
              model: 'synthetic-engine-model',
              seconds: 420,
              cost_usd: 0.12,
              billing: 'api',
            },
            {
              title: HOSTILE,
              state: 'review',
              agent: 'codex',
              model: 'synthetic-other-model',
              needs_operator: true,
              seconds: 61,
              cost_usd: null,
              billing: 'subscription',
            },
            { title: 'Synthetic planting', state: 'backlog' },
          ]
        : project.id === 5
          ? [
              {
                title: 'Synthetic roof',
                state: 'done',
                agent: 'claude',
                model: 'm',
                seconds: 600,
                cost_usd: 0.42,
              },
            ]
          : [];
    return { body: { project: project.id, title: project.title, state: project.state, stories } };
  }
  return null;
}

let stack, plain;
before(
  async () => {
    if (skip) return;
    reset();
    const reply = (said) => {
      const key = Object.keys(replies).find((word) => said.includes(word));
      return key ? replies[key] : 'A plain synthetic reply.';
    };
    stack = await startStack(reply, { engine: answer });
    plain = await startStack(reply);
  },
  { timeout: 120000 },
);
after(() => Promise.allSettled([stack?.close(), plain?.close()]), { timeout: 30000 });

const asked = () => stack.engine.requests.map((r) => r.asked);
const openProjects = async (page) => {
  await page.click('#tab-today');
  await page.evaluate(`document.getElementById('projects-section').open = true`);
  await page.waitFor(
    `document.querySelectorAll('#projects-list li').length > 0 && !document.getElementById('projects-refresh').disabled`,
    'the project list',
  );
};
const note = (page, text) =>
  page.waitFor(
    `document.getElementById('projects-note').textContent.includes(${JSON.stringify(text)})`,
    'the note: ' + text,
  );
const systemPrompt = (which) => which.model.requests.at(-1).messages[0].content;

test('a PEA with no engine says so, asks nothing and offers no project drafts', options, async () => {
  const page = await openConnectedPage(plain, { width: 1500 });
  await page.click('#tab-today');
  await page.waitFor(
    `document.getElementById('projects-count').textContent === 'No engine'`,
    'the card to say there is no engine',
  );
  assert.match(
    await page.evaluate(`document.getElementById('projects-status').textContent`),
    /not connected to a project engine/,
  );
  assert.equal(await page.evaluate(`document.getElementById('projects-live').hidden`), true);
  // The model is not told about projects, and a suggestion it makes anyway offers nothing.
  await page.click('#tab-chat');
  await askModel(plain, page, 'please suggest a project');
  assert.equal(systemPrompt(plain).includes('pea-project'), false);
  assert.equal(
    await page.evaluate(
      `[...document.querySelectorAll('#messages button')].some((b) => b.textContent.startsWith('Review project'))`,
    ),
    false,
  );
  await page.close();
});

test(
  'nothing is asked of the engine until the owner opens the card; then it lists projects',
  options,
  async () => {
    reset();
    const before = stack.engine.requests.length;
    const page = await openConnectedPage(stack, { width: 1500 });
    await page.click('#tab-today');
    await page.waitFor(
      `document.getElementById('projects-count').textContent === 'Connected'`,
      'the card to say it is connected',
    );
    assert.equal(stack.engine.requests.length, before);

    await openProjects(page);
    assert.deepEqual(asked().slice(before), [{ action: 'types' }, { action: 'list' }]);
    assert.equal(await page.text('#projects-count'), '2 projects');
    assert.deepEqual(
      await page.evaluate(`[...document.querySelectorAll('#projects-list li')].map((li) => li.textContent)`),
      ['Synthetic garden planIn progress', 'Synthetic finished shedFinished'],
    );
    // The gateway used the engine's own credential, never the page's token, and sent no browser headers.
    const sent = stack.engine.requests.at(-1);
    assert.equal(sent.headers.authorization, 'Bearer ' + stack.engine.token);
    assert.notEqual(stack.engine.token, stack.gateway.token);
    for (const header of ['origin', 'referer', 'cookie']) assert.equal(sent.headers[header], undefined);
    assert.equal(JSON.stringify(stack.engine.requests).includes(stack.gateway.token), false);
    await page.close();
  },
);

test('a project’s stories show agent, model, time and cost, as plain text', options, async () => {
  reset();
  const page = await openConnectedPage(stack, { width: 1500 });
  await openProjects(page);
  await page.clickText('Synthetic garden plan');
  await page.waitFor(`document.querySelectorAll('#project-stories li').length === 3`, 'the stories');
  assert.deepEqual(asked().at(-1), { action: 'status', project: 7 });
  assert.equal(await page.text('#project-title'), 'Synthetic garden plan · In progress');
  assert.equal(
    await page.text('#project-totals'),
    '1 of 3 stories done · 8 min of run time · $0.12 reported so far, some costs not known · 1 waiting for you in the engine',
  );
  const stories = await page.evaluate(
    `[...document.querySelectorAll('#project-stories li')].map((li) => [...li.children].map((c) => c.textContent))`,
  );
  assert.deepEqual(stories, [
    ['Synthetic survey', 'Done', 'claude · synthetic-engine-model · 7 min · $0.12'],
    [
      HOSTILE,
      'Waiting for review',
      'codex · synthetic-other-model · 1 min · on a subscription',
      'Waiting for you in the engine',
    ],
    ['Synthetic planting', 'Backlog', 'No agent yet · cost not known'],
  ]);
  // The engine's text is text: no element was made from it and no script ran.
  assert.equal(await page.evaluate(`document.querySelectorAll('#project-stories img').length`), 0);
  assert.equal(await page.evaluate(`window.peaHacked === undefined`), true);
  // The lane has nothing to press: it is read-only.
  assert.equal(
    await page.evaluate(
      `document.querySelectorAll('#project-stories button, #project-stories a, #project-stories input, #project-stories select').length`,
    ),
    0,
  );

  // Nothing the engine said reaches the model.
  await page.click('#tab-chat');
  await askModel(stack, page, 'a plain question after looking at projects');
  const shared = JSON.stringify(stack.model.requests.at(-1));
  for (const secret of [
    'Synthetic garden plan',
    'SYNTHETIC ENGINE STORY',
    'synthetic-engine-model',
    'Local website',
  ])
    assert.equal(shared.includes(secret), false, secret);
  assert.equal(systemPrompt(stack).includes('pea-project'), true);
  await page.close();
});

test('a draft is sent only after its review, exactly as reviewed', options, async () => {
  reset();
  const page = await openConnectedPage(stack, { width: 1500 });
  await openProjects(page);
  const drafts = () => asked().filter((a) => a.action === 'draft');
  const count = drafts().length;

  // Without a template nothing is reviewed or sent.
  await page.fill('#project-new-title', '  Synthetic shed  ');
  await page.fill('#project-brief', 'A synthetic shed for synthetic tools.');
  await page.click('#project-send');
  await note(page, 'Choose a project template first.');
  assert.equal(await page.evaluate(`document.querySelector('#review').open`), false);

  await page.fill('#project-type', 'local-website');
  assert.equal(await page.text('#project-type-summary'), 'A synthetic static site.');
  await page.click('#project-send');
  await page.waitFor(`document.querySelector('#review').open`, 'the draft review');
  const review = await page.evaluate(`document.querySelector('#review').textContent`);
  for (const part of [
    'Local website',
    'Synthetic shed',
    'A synthetic shed for synthetic tools.',
    'no planning',
  ])
    assert.ok(review.includes(part), part);
  // Declined: nothing left the browser.
  await page.click('#review-cancel');
  await note(page, 'Not sent.');
  assert.equal(drafts().length, count);
  assert.equal(
    await page.evaluate(`document.getElementById('project-new-title').value`),
    '  Synthetic shed  ',
  );

  await page.click('#project-send');
  await page.waitFor(`document.querySelector('#review').open`, 'the draft review again');
  await page.click('#review-approve');
  await note(page, 'Drafted in your project engine: Synthetic shed (project 12)');
  assert.deepEqual(drafts().slice(count), [
    {
      action: 'draft',
      type: 'local-website',
      title: 'Synthetic shed',
      brief: 'A synthetic shed for synthetic tools.',
    },
  ]);
  // The form is emptied, and the new draft is listed and shown with no stories.
  await page.waitFor(
    `document.getElementById('project-title').textContent === 'Synthetic shed · Draft'`,
    'the new draft to be shown',
  );
  assert.equal(
    await page.evaluate(
      `document.getElementById('project-new-title').value + document.getElementById('project-brief').value`,
    ),
    '',
  );
  assert.match(await page.text('#project-totals'), /No stories yet/);
  assert.equal(await page.text('#projects-count'), '3 projects');
  await page.close();
});

test(
  'a chat suggestion only fills the form; the sent draft leaves a receipt in Harvest',
  options,
  async () => {
    reset();
    const page = await openConnectedPage(stack, { width: 1500 });
    const count = stack.engine.requests.length;
    await askModel(stack, page, 'please suggest a project');
    await page.waitFor(
      `[...document.querySelectorAll('#messages button')].some((b) => b.textContent === 'Review project: Synthetic club site')`,
      'the project suggestion',
    );
    // Harvest gathers it as waiting.
    assert.deepEqual(
      await page.evaluate(
        `[...document.querySelectorAll('#harvest-waiting li')].map((li) => li.children[1].textContent)`,
      ),
      ['Review project: Synthetic club site'],
    );
    await page.clickText('Review project: Synthetic club site');
    await page.waitFor(
      `document.getElementById('project-new-title').value === 'Synthetic club site'`,
      'the form to be filled',
    );
    assert.equal(
      await page.evaluate(`document.getElementById('project-brief').value`),
      'A small synthetic site for the club.',
    );
    assert.equal(
      await page.evaluate(`document.getElementById('project-constraints').value`),
      'Static pages only',
    );
    assert.equal(
      await page.evaluate(
        `document.getElementById('projects-section').open && !document.getElementById('today').hidden`,
      ),
      true,
    );
    // Filling the form asked the engine only what the card shows. No draft was sent.
    await page.waitFor(
      `document.querySelectorAll('#projects-list li').length > 0 && !document.getElementById('project-send').disabled`,
      'the list',
    );
    assert.equal(
      asked()
        .slice(count)
        .some((a) => a.action === 'draft'),
      false,
    );

    await page.fill('#project-type', 'other');
    await page.click('#project-send');
    await page.waitFor(`document.querySelector('#review').open`, 'the draft review');
    await page.click('#review-approve');
    await note(page, 'Drafted in your project engine: Synthetic club site (project 12)');
    assert.deepEqual(
      asked()
        .filter((a) => a.action === 'draft')
        .at(-1),
      {
        action: 'draft',
        type: 'other',
        title: 'Synthetic club site',
        brief: 'A small synthetic site for the club.',
        constraints: 'Static pages only',
      },
    );
    // The reply now carries a receipt in place of its button, and Harvest keeps it with a way back.
    await page.waitFor(
      `[...document.querySelectorAll('#harvest-done li')].some((li) => li.textContent.includes('Drafted in your project engine: Synthetic club site (project 12)'))`,
      'the receipt in Harvest',
    );
    assert.equal(await page.evaluate(`document.querySelectorAll('#harvest-waiting li').length`), 0);
    assert.equal(
      await page.evaluate(
        `[...document.querySelectorAll('#messages button')].some((b) => b.textContent.startsWith('Review project'))`,
      ),
      false,
    );
    assert.equal(
      await page.evaluate(
        `[...document.querySelectorAll('#harvest-done li')].find((li) => li.textContent.includes('Drafted')).querySelector('button').textContent`,
      ),
      'Show projects',
    );
    await page.close();
  },
);

test('a project the engine says has ended is registered in Harvest with its totals', options, async () => {
  reset();
  const page = await openConnectedPage(stack, { width: 1500 });
  assert.equal(await page.evaluate(`document.getElementById('harvest-done-group').hidden`), true);
  await openProjects(page);
  const ended = `[...document.querySelectorAll('#harvest-done li')].find((li) => li.textContent.includes('Project finished'))`;
  await page.waitFor(`Boolean(${ended})`, 'the finished project in Harvest');
  assert.deepEqual(await page.evaluate(`[...${ended}.children].map((c) => c.textContent)`), [
    'From your project engine',
    'Project finished: Synthetic finished shed',
    'Show the project',
  ]);
  // Its button shows the project, and its time and cost then join the receipt.
  await page.click('#tab-harvest');
  await page.evaluate(`${ended}.querySelector('button').click()`);
  await page.waitFor(
    `document.getElementById('project-title').textContent === 'Synthetic finished shed · Finished'`,
    'the finished project',
  );
  assert.equal(await page.evaluate(`!document.getElementById('today').hidden`), true);
  await page.waitFor(
    `${ended}.children[1].textContent === 'Project finished: Synthetic finished shed · 1 story · 10 min · $0.42'`,
    'the totals on the receipt',
  );
  // A project still under way is not in Harvest.
  assert.equal(
    await page.evaluate(`document.getElementById('harvest-done').textContent.includes('garden')`),
    false,
  );
  await page.close();
});

test(
  'a refusal by the engine is told in PEA’s words, and a claim to have started one is corrected',
  options,
  async () => {
    reset();
    const page = await openConnectedPage(stack, { width: 1500 });
    await openProjects(page);
    engine.refuse = 403;
    await page.click('#projects-refresh');
    await note(page, 'did not accept PEA’s access');
    engine.refuse = 422;
    await page.clickText('Synthetic garden plan');
    await note(page, 'did not accept that request');
    engine.refuse = 500;
    await page.fill('#project-type', 'other');
    await page.fill('#project-new-title', 'Synthetic failure');
    await page.fill('#project-brief', 'A synthetic brief.');
    await page.click('#project-send');
    await page.waitFor(`document.querySelector('#review').open`, 'the draft review');
    await page.click('#review-approve');
    await note(page, 'may or may not have arrived');
    // The form is kept for another try, and the engine's own words are never shown.
    assert.equal(
      await page.evaluate(`document.getElementById('project-new-title').value`),
      'Synthetic failure',
    );
    assert.equal(await page.evaluate(`document.body.textContent.includes('SYNTHETIC ENGINE DETAIL')`), false);
    engine.refuse = 0;

    await page.click('#tab-chat');
    await askModel(stack, page, 'boast about it');
    await page.waitFor(
      `document.getElementById('messages').textContent.includes('PEA did not create or start a project.')`,
      'the correction',
    );
    await page.close();
  },
);
