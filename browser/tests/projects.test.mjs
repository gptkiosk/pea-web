// Rules for the Projects pages: what may be sent as a draft, what a model may suggest, and how
// the engine's answers are made safe to show. Run with: node --test browser/tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LocalModel } from '../local-model.mjs';
import {
  claimsProject,
  describeDraft,
  draftAnswer,
  draftRequest,
  finishedReceipt,
  formatCost,
  formatSeconds,
  projectFailure,
  projectFinished,
  projectGuidance,
  projectLimits,
  projectList,
  projectProposals,
  projectStatus,
  projectTypes,
  stateLabel,
  storyCost,
  totalsLine,
} from '../projects.mjs';

const contract = JSON.parse(
  readFileSync(new URL('../server/contract.json', import.meta.url), 'utf8'),
).projects;
const block = (value) => 'Here it is.\n```pea-project\n' + JSON.stringify(value) + '\n```\n';

test('the page keeps the gateway contract’s limits', () => {
  assert.equal(projectLimits.title, contract.titleCharacters);
  assert.equal(projectLimits.brief, contract.briefCharacters);
  assert.equal(projectLimits.constraints, contract.constraintsCharacters);
  assert.equal(projectLimits.projectMax, contract.projectMax);
  assert.equal(projectLimits.type.source, `^${contract.typePattern}$`);
  // The page never asks for more than the contract names.
  assert.deepEqual(Object.keys(contract.actions).sort(), ['draft', 'get', 'list', 'status', 'types']);
});

test('a draft is checked the way the gateway checks it', () => {
  assert.deepEqual(draftRequest({ type: 'local-website', title: ' A site ', brief: ' For the club.\n' }), {
    body: { action: 'draft', type: 'local-website', title: 'A site', brief: 'For the club.' },
  });
  assert.deepEqual(
    draftRequest({ type: 'other', title: 'T', brief: 'B', constraints: ' No trackers ' }).body,
    { action: 'draft', type: 'other', title: 'T', brief: 'B', constraints: 'No trackers' },
  );
  // Blank constraints are left out, not sent empty.
  assert.equal(
    'constraints' in draftRequest({ type: 'other', title: 'T', brief: 'B', constraints: ' \n' }).body,
    false,
  );
  for (const bad of [
    { type: '', title: 'T', brief: 'B' },
    { type: 'Other', title: 'T', brief: 'B' },
    { type: '../x', title: 'T', brief: 'B' },
    { type: 'other', title: ' \t', brief: 'B' },
    { type: 'other', title: 'T', brief: '\n' },
    { type: 'other', title: 'T'.repeat(201), brief: 'B' },
    { type: 'other', title: 'T', brief: 'B'.repeat(20001) },
    { type: 'other', title: 'T', brief: 'B', constraints: 'C'.repeat(10001) },
    { type: 'other', title: 'T', brief: 'B', constraints: 7 },
    { type: 'other', title: 'T', brief: 'key sk-proj-' + 'a'.repeat(30) },
  ]) {
    const result = draftRequest(bad);
    assert.equal(typeof result.error, 'string', JSON.stringify(bad).slice(0, 80));
    assert.equal(result.body, undefined);
  }
  // Limits count characters, as the gateway does, not UTF-16 units.
  assert.ok(draftRequest({ type: 'other', title: '🌱'.repeat(200), brief: 'B' }).body);
});

test('the review names everything that will leave and what will not happen', () => {
  const text = describeDraft(
    {
      action: 'draft',
      type: 'other',
      title: 'Synthetic title',
      brief: 'Synthetic brief',
      constraints: 'Synthetic limit',
    },
    'Other work',
  );
  for (const part of [
    'Other work',
    'Synthetic title',
    'Synthetic brief',
    'Synthetic limit',
    'no planning',
    'no spending',
  ])
    assert.ok(text.includes(part), part);
  assert.ok(describeDraft({ type: 'other', title: 'T', brief: 'B' }).includes('Template: other'));
});

test('a model can suggest one narrowly shaped project draft and nothing more', () => {
  assert.deepEqual(
    projectProposals(block({ op: 'project_draft', title: 'Club site', brief: 'A small site.' })),
    [{ title: 'Club site', brief: 'A small site.', constraints: '' }],
  );
  assert.deepEqual(
    projectProposals(
      block({ op: 'project_draft', title: 'Club site', brief: 'B', constraints: ' Static only ' }),
    ),
    [{ title: 'Club site', brief: 'B', constraints: 'Static only' }],
  );
  for (const bad of [
    { op: 'project_start', title: 'T', brief: 'B' },
    { op: 'project_draft', title: 'T' },
    { op: 'project_draft', title: 'T', brief: ' ' },
    { op: 'project_draft', title: ' T', brief: 'B' },
    { op: 'project_draft', title: 'T\nU', brief: 'B' },
    { op: 'project_draft', title: 'T'.repeat(121), brief: 'B' },
    { op: 'project_draft', title: 'T', brief: 'B'.repeat(6001) },
    { op: 'project_draft', title: 'T', brief: 'B', constraints: 5 },
    // A model cannot choose the template, the folder, an agent, a model or approval.
    { op: 'project_draft', title: 'T', brief: 'B', type: 'other' },
    { op: 'project_draft', title: 'T', brief: 'B', working_dir: '/' },
    { op: 'project_draft', title: 'T', brief: 'B', agent: 'x' },
    { op: 'project_draft', title: 'T', brief: 'B', approve: true },
    { op: 'project_draft', title: 'T', brief: 'ghp_' + 'a'.repeat(30) },
    ['project_draft'],
    null,
  ])
    assert.deepEqual(projectProposals(block(bad)), [], JSON.stringify(bad).slice(0, 80));
  const one = block({ op: 'project_draft', title: 'T', brief: 'B' });
  assert.deepEqual(projectProposals(one + one), []);
  assert.deepEqual(projectProposals(one + '```pea-story\n{}\n```'), []);
  assert.deepEqual(projectProposals('```pea-project\nnot json\n```'), []);
  assert.deepEqual(projectProposals(7), []);
  assert.ok(projectGuidance.includes('pea-project'));
  assert.ok(projectGuidance.includes('cannot start'));
});

test('a claim to have made a project is recognised', () => {
  assert.equal(claimsProject('I’ve created the project in your engine.'), true);
  assert.equal(claimsProject('I have started your website project.'), true);
  assert.equal(claimsProject('Here is a suggestion for the project.'), false);
  assert.equal(claimsProject(null), false);
});

test('templates and projects from the engine are cut down to what is safe to show', () => {
  assert.deepEqual(
    projectTypes({
      types: [
        { id: 'local-website', label: ' Local‮ website\n', summary: 'A <b>site</b>' },
        { id: 'local-website', label: 'Again' },
        { id: 'BAD ID', label: 'x' },
        { id: 'other' },
        'nonsense',
        null,
      ],
    }),
    [
      { id: 'local-website', label: 'Local website', summary: 'A <b>site</b>' },
      { id: 'other', label: 'other', summary: '' },
    ],
  );
  assert.deepEqual(projectTypes(null), []);
  assert.deepEqual(projectTypes({ types: 'no' }), []);
  assert.equal(projectTypes({ types: Array.from({ length: 90 }, (_, i) => ({ id: 't' + i })) }).length, 40);

  assert.deepEqual(
    projectList({
      projects: [
        { id: 3, title: 'T'.repeat(300), state: 'active' },
        { id: 3, title: 'duplicate' },
        { id: '4', title: 'text id' },
        { id: 0, title: 'zero' },
        { id: 2147483648, title: 'too big' },
        { id: 5 },
        [],
      ],
    }),
    [
      { id: 3, title: 'T'.repeat(200), state: 'active' },
      { id: 5, title: 'Project 5', state: 'unknown' },
    ],
  );
  assert.equal(projectList({ projects: Array.from({ length: 80 }, (_, i) => ({ id: i + 1 })) }).length, 50);
  assert.deepEqual(draftAnswer({ project: 12, title: 'Club site', state: 'draft' }), {
    id: 12,
    title: 'Club site',
    state: 'draft',
  });
  assert.equal(draftAnswer({ echo: {} }), null);
  assert.equal(draftAnswer([]), null);
});

test('progress keeps unknown costs unknown and never estimates', () => {
  const status = projectStatus(
    {
      project: 12,
      title: 'Club site',
      state: 'active',
      totals: { stories: 99, done: 99, seconds: 1, cost_usd: 99, cost_known: true },
      stories: [
        {
          title: 'Plan',
          state: 'done',
          agent: 'claude',
          model: 'm-1',
          seconds: 420,
          cost_usd: 0.12,
          billing: 'api',
        },
        {
          title: 'Build',
          state: 'review',
          agent: 'codex',
          model: 'm-2',
          needs_operator: true,
          seconds: 61,
          cost_usd: null,
        },
        {
          title: 'Check',
          state: 'backlog',
          seconds: -5,
          cost_usd: 'free',
          billing: 'invoice',
          needs_operator: 'yes',
        },
        'nonsense',
      ],
    },
    12,
  );
  assert.equal(status.stories.length, 3);
  assert.deepEqual(status.stories[2], {
    title: 'Check',
    state: 'backlog',
    agent: '',
    model: '',
    billing: '',
    waiting: false,
    seconds: null,
    cost: null,
  });
  // Totals are counted from the stories shown, not taken from the engine's own sums.
  assert.deepEqual(status.totals, {
    stories: 3,
    done: 1,
    waiting: 1,
    seconds: 481,
    timed: true,
    cost: 0.12,
    costKnown: false,
    costSeen: true,
  });
  assert.equal(
    totalsLine(status.totals),
    '1 of 3 stories done · 8 min of run time · $0.12 reported so far, some costs not known · 1 waiting for you in the engine',
  );

  // An answer about another project, or no project, is not shown at all.
  assert.equal(projectStatus({ project: 13, stories: [] }, 12), null);
  assert.equal(projectStatus({ stories: [] }, 12), null);
  assert.equal(projectStatus('x', 12), null);

  const known = projectStatus(
    { project: 1, stories: [{ title: 'A', state: 'done', seconds: 30, cost_usd: 0 }] },
    1,
  );
  assert.equal(known.totals.costKnown, true);
  assert.equal(totalsLine(known.totals), '1 of 1 story done · 30 s of run time · $0.00');
  // The engine saying a cost is missing wins over every story carrying a number.
  const doubted = projectStatus(
    { project: 1, totals: { cost_known: false }, stories: [{ title: 'A', state: 'done', cost_usd: 1 }] },
    1,
  );
  assert.equal(doubted.totals.costKnown, false);
  const empty = projectStatus({ project: 1, stories: [] }, 1);
  assert.equal(totalsLine(empty.totals), '0 of 0 stories done · cost not known');
  assert.equal(
    projectStatus({ project: 1, stories: Array.from({ length: 300 }, () => ({ title: 'S' })) }, 1).stories
      .length,
    200,
  );
});

test('time, cost and state are worded plainly', () => {
  assert.equal(formatSeconds(null), 'time not given');
  assert.equal(formatSeconds(42), '42 s');
  assert.equal(formatSeconds(420), '7 min');
  assert.equal(formatSeconds(3900), '1 h 5 min');
  assert.equal(formatCost(null), 'cost not known');
  assert.equal(formatCost(0.004), 'under $0.01');
  assert.equal(formatCost(1.5), '$1.50');
  assert.equal(storyCost({ cost: null, billing: '' }), 'cost not known');
  assert.equal(storyCost({ cost: 0, billing: 'subscription' }), 'on a subscription');
  assert.equal(storyCost({ cost: null, billing: 'subscription' }), 'on a subscription');
  assert.equal(storyCost({ cost: null, billing: 'free' }), 'no charge');
  assert.equal(storyCost({ cost: 0.3, billing: 'api' }), '$0.30');
  assert.equal(stateLabel('closed'), 'Finished');
  assert.equal(stateLabel('in_progress'), 'In progress');
  assert.equal(projectFinished('closed'), true);
  assert.equal(projectFinished('active'), false);
  assert.equal(finishedReceipt({ title: 'Club site' }), 'Project finished: Club site');
  assert.equal(
    finishedReceipt(
      { title: 'Club site' },
      projectStatus(
        { project: 1, stories: [{ title: 'A', state: 'done', seconds: 600, cost_usd: 0.42 }] },
        1,
      ),
    ),
    'Project finished: Club site · 1 story · 10 min · $0.42',
  );
});

test('a failure is told in PEA’s words', () => {
  assert.ok(projectFailure(409).includes('not connected'));
  assert.ok(projectFailure(429).includes('already asking'));
  assert.ok(projectFailure(502, 'refused').includes('grant'));
  assert.ok(projectFailure(502, 'declined').includes('did not accept that request'));
  assert.ok(projectFailure(502, 'failed').includes('could not be reached'));
  assert.ok(projectFailure(500).includes('could not be reached'));
});

test('the page asks only its own server about projects', async () => {
  const calls = [];
  const local = new LocalModel('http://127.0.0.1:18770', async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(options.body ? { result: { ok: true } } : { available: true }), {
      status: 200,
    });
  });
  const key = 'k'.repeat(43);
  assert.deepEqual(await local.projects(key), { status: 200, body: { available: true } });
  assert.deepEqual(await local.projects(key, { action: 'list' }), {
    status: 200,
    body: { result: { ok: true } },
  });
  assert.deepEqual(
    calls.map((c) => [c.url, c.options.method, c.options.body, c.options.credentials, c.options.redirect]),
    [
      ['http://127.0.0.1:18770/v1/projects', 'GET', undefined, 'omit', 'error'],
      ['http://127.0.0.1:18770/v1/projects', 'POST', '{"action":"list"}', 'omit', 'error'],
    ],
  );
  // An answer that is not JSON is no answer.
  const broken = new LocalModel(
    'http://127.0.0.1:18770',
    async () => new Response('<html>', { status: 502 }),
  );
  assert.deepEqual(await broken.projects(key, { action: 'list' }), { status: 502, body: null });
});
