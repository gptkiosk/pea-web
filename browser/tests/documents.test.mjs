import test from 'node:test';
import assert from 'node:assert/strict';
import {
  claimsDocument,
  docDisclaimer,
  docGuidance,
  docHTML,
  docLimits,
  docPlain,
  docProposals,
  docSummary,
  docTypes,
  typesMentioned,
} from '../documents.mjs';

const block = (value) => 'I will make that.\n```pea-doc\n' + JSON.stringify(value) + '\n```\n';
const create = (extra = {}) => ({
  op: 'doc_create',
  type: 'resume',
  title: 'Sam Rivera Resume',
  sections: [
    { heading: 'Summary', body: 'Line cook.' },
    { heading: 'Experience', body: '- Ran the grill\n- Trained cooks' },
  ],
  ...extra,
});

test('there are twenty templates plus the plain document, each with a label and layout note', () => {
  const names = Object.keys(docTypes);
  assert.equal(names.length, 21);
  assert(names.includes('document') && names.includes('rental_agreement') && names.includes('visit_prep'));
  for (const name of names) {
    assert(docTypes[name].label && docTypes[name].guide.length > 30, name);
    assert.equal(typeof docTypes[name].titled, 'boolean');
  }
  assert.deepEqual(names.filter((name) => !docTypes[name].titled).sort(), [
    'bio',
    'complaint_letter',
    'cover_letter',
    'letter',
    'resignation_letter',
    'thank_you',
  ]);
});

test('one complete doc_create block becomes a proposal with cleaned sections', () => {
  const [proposal] = docProposals(block(create()));
  assert.equal(proposal.update, false);
  assert.deepEqual(proposal.draft, {
    type: 'resume',
    title: 'Sam Rivera Resume',
    sections: [
      { heading: 'Summary', body: 'Line cook.' },
      { heading: 'Experience', body: '- Ran the grill\n- Trained cooks' },
    ],
  });
  assert.equal(docProposals(block([create()])).length, 1, 'a one-row array is accepted');
});

test('letters drop headings, and copied layout hints are not kept as headings', () => {
  const [letter] = docProposals(
    block(
      create({
        type: 'letter',
        title: 'Note to Ada',
        sections: [{ heading: 'Greeting', body: 'Dear Ada,' }],
      }),
    ),
  );
  assert.deepEqual(letter.draft.sections, [{ heading: null, body: 'Dear Ada,' }]);
  const [doc] = docProposals(
    block(
      create({
        type: 'document',
        sections: [
          { heading: 'paragraph_1', body: 'First.' },
          { heading: 'Real heading', body: 'Second.' },
          { heading: '', body: '' },
        ],
      }),
    ),
  );
  assert.deepEqual(
    doc.draft.sections.map((s) => s.heading),
    [null, 'Real heading'],
    'an empty section is dropped',
  );
});

test('malformed, mixed, oversized, unknown-type and credential-like blocks yield nothing', () => {
  const refused = [
    block(create({ op: 'doc_delete' })),
    block(create({ type: 'spreadsheet' })),
    block(create({ title: 'bad/name' })),
    block(create({ title: '' })),
    block(create({ sections: [] })),
    block(create({ sections: 'text' })),
    block(create({ sections: [{ heading: 'A', body: 7 }] })),
    block(create({ sections: [{ heading: 'A', body: 'ok', style: 'bold' }] })),
    block(create({ sections: Array.from({ length: docLimits.sections + 1 }, () => ({ body: 'x' })) })),
    block(create({ sections: [{ body: 'x'.repeat(docLimits.body + 1) }] })),
    block(create({ sections: Array.from({ length: 6 }, () => ({ body: 'x'.repeat(7000) })) })),
    block(create({ sections: [{ body: 'key sk-or-v1-' + 'a'.repeat(40) }] })),
    block(create({ folder: 'elsewhere' })),
    block([create(), create()]),
    block(create()) + block(create()),
    block(create()) + '```pea-task\n[{"op":"task_add","title":"x"}]\n```',
    'Here.\n```pea-doc\n{"op":"doc_create","type":"letter"',
    block({ op: 'doc_update', sections: [{ body: 'new' }] }),
    null,
  ];
  for (const reply of refused) assert.deepEqual(docProposals(reply), [], String(reply).slice(0, 70));
});

test('an update needs a document written earlier and keeps its type and title unless given', () => {
  const current = docProposals(block(create()))[0].draft;
  const [update] = docProposals(
    block({ op: 'doc_update', sections: [{ heading: 'Summary', body: 'Sous chef.' }] }),
    current,
  );
  assert.equal(update.update, true);
  assert.equal(update.draft.type, 'resume');
  assert.equal(update.draft.title, 'Sam Rivera Resume');
  assert.deepEqual(update.draft.sections, [{ heading: 'Summary', body: 'Sous chef.' }]);
  assert.equal(
    docProposals(block({ op: 'doc_update', title: 'Sam Rivera CV', sections: [{ body: 'x' }] }), current)[0]
      .draft.title,
    'Sam Rivera CV',
  );
});

test('everything is escaped in the HTML, with bullets, checkboxes and paragraphs', () => {
  const [{ draft }] = docProposals(
    block(
      create({
        type: 'checklist',
        title: 'Trip <b>list',
        sections: [
          {
            heading: 'Pack & go',
            body: 'Before <script>alert(1)</script>\n\n- Socks & shoes\n• Charger\n[ ] Passport\nLast line',
          },
        ],
      }),
    ),
  );
  const html = docHTML(draft);
  assert(html.startsWith('<html><head><meta charset="utf-8"></head><body'));
  assert(html.includes('<h1>Trip &lt;b&gt;list</h1>'));
  assert(html.includes('<h2>Pack &amp; go</h2>'));
  assert(html.includes('<p>Before &lt;script&gt;alert(1)&lt;/script&gt;</p>'));
  assert(html.includes('<ul><li>Socks &amp; shoes</li><li>Charger</li></ul>'));
  assert(html.includes('<p>☐ Passport</p><p>Last line</p>'));
  assert.equal(/<script|<b>/i.test(html), false, 'no tag from the draft survives');
});

test('a letter has no title line, and a rental agreement always carries the not-legal-advice note', () => {
  const [{ draft: letter }] = docProposals(
    block(create({ type: 'letter', title: 'Note to Ada', sections: [{ body: 'Dear Ada,\n\nThank you.' }] })),
  );
  assert.equal(docHTML(letter).includes('<h1>'), false);
  assert.equal(docDisclaimer('letter'), '');

  const [{ draft: rental }] = docProposals(
    block(
      create({
        type: 'rental_agreement',
        title: 'Rental agreement',
        sections: [{ heading: 'Parties', body: '[Landlord] and [Tenant]' }],
      }),
    ),
  );
  assert.match(docDisclaimer('rental_agreement'), /not legal advice/);
  assert(docHTML(rental).includes('<p><i>' + docDisclaimer('rental_agreement') + '</i></p>'));
  assert(
    docPlain(rental).endsWith(docDisclaimer('rental_agreement')),
    'the owner sees the note in the review',
  );
});

test('the summary and plain text describe exactly what will be made', () => {
  const [request] = docProposals(block(create()));
  assert.equal(docSummary(request), 'Create a resume called “Sam Rivera Resume” (Summary, Experience)');
  assert.equal(
    docPlain(request.draft),
    '## Summary\nLine cook.\n\n## Experience\n- Ran the grill\n- Trained cooks',
  );
  const [invite] = docProposals(
    block(create({ type: 'event_invite', title: 'Garden party', sections: [{ body: 'Come along.' }] })),
  );
  assert.equal(docSummary(invite), 'Create an event invitation called “Garden party”');
  const [notes] = docProposals(
    block(create({ type: 'meeting_notes', title: 'Standup', sections: [{ heading: 'Agenda', body: 'x' }] })),
  );
  assert.equal(docSummary(notes), 'Create meeting notes called “Standup” (Agenda)');
  assert.match(
    docSummary({ update: true, draft: request.draft }),
    /^Replace the text of “Sam Rivera Resume” with the new version/,
  );
});

test('only the layouts the owner’s message names are sent, and the destination is stated honestly', () => {
  assert.deepEqual(typesMentioned('Can you write a cover letter for the bakery job?'), ['cover_letter']);
  assert.deepEqual(typesMentioned('I need a resume and an invoice'), ['resume', 'invoice']);
  assert.deepEqual(typesMentioned('a letter to my landlord'), ['letter']);
  assert.deepEqual(typesMentioned('hello there'), []);
  assert.deepEqual(typesMentioned(null), []);

  const folder = docGuidance({ destination: 'folder', message: 'make a meal plan' });
  assert.match(folder, /pea-doc/);
  assert.match(folder, /meal_plan: Needs the days/);
  assert.doesNotMatch(folder, /resume: Needs/);
  assert.match(folder, /creates a Google Doc in their PEA folder/);
  const file = docGuidance({ destination: 'file', message: 'hi' });
  assert.match(file, /file to download; never say it is in Google Docs/);
  assert.match(file, /ask in plain words which kind/);

  const current = docProposals(block(create()))[0].draft;
  const revising = docGuidance({ destination: 'folder', current, message: 'shorten it' });
  assert.match(revising, /doc_update/);
  assert.match(revising, /## Summary\nLine cook\./);
});

test('a claim of having written a document is recognized, a question is not', () => {
  for (const claim of [
    'I’ve created the resume in your folder.',
    "All set, I'll save that letter now.",
    'Done, I wrote the invoice.',
  ])
    assert.equal(claimsDocument(claim), true, claim);
  for (const fine of [
    'Which kind of document would you like?',
    'A resume usually has four sections.',
    '',
    null,
  ])
    assert.equal(claimsDocument(fine), false, String(fine));
});
