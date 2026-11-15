import test from 'node:test';
import assert from 'node:assert/strict';
import {
  claimsOpen,
  describeOpen,
  openGuidance,
  openLabel,
  openLink,
  openProposals,
  phoneNumber,
  replySegments,
  spokenReply,
} from '../handoff.mjs';

const block = (value) => 'I can open that.\n```pea-open\n' + JSON.stringify(value) + '\n```\n';

test('fenced text becomes copy boxes with their label, and prose stays prose', () => {
  assert.deepEqual(replySegments('Here it is:\n```python\nprint("hi")\n```\nUse it well.'), [
    { kind: 'prose', text: 'Here it is:' },
    { kind: 'box', label: 'python', text: 'print("hi")' },
    { kind: 'prose', text: 'Use it well.' },
  ]);
  assert.deepEqual(replySegments('```\nSlide one\nSlide two\n```'), [
    { kind: 'box', label: '', text: 'Slide one\nSlide two' },
  ]);
  assert.deepEqual(replySegments('```file:src/app.js\nlet a = 1;\n```'), [
    { kind: 'box', label: 'file:src/app.js', text: 'let a = 1;' },
  ]);
  assert.deepEqual(
    replySegments('```\nFirst line with spaces\nsecond\n```')[0].text,
    'First line with spaces\nsecond',
  );
  assert.deepEqual(replySegments('Just words.'), [{ kind: 'prose', text: 'Just words.' }]);
  assert.deepEqual(replySegments(''), []);
  assert.deepEqual(replySegments(null), []);
  assert.deepEqual(
    replySegments('Before\n```\n\n```\nAfter').map((s) => s.kind),
    ['prose', 'prose'],
    'an empty box is dropped',
  );
});

test('a reply still arriving already shows its unfinished block as a box', () => {
  assert.deepEqual(replySegments('Here:\n```text\nhalf a li'), [
    { kind: 'prose', text: 'Here:' },
    { kind: 'box', label: 'text', text: 'half a li' },
  ]);
  assert.deepEqual(
    replySegments('Here:\n```pyth'),
    [{ kind: 'prose', text: 'Here:' }],
    'a label alone shows nothing yet',
  );
});

test('only the prose is read aloud', () => {
  assert.equal(spokenReply('Copy this:\n```\nSECRET SLIDE TEXT\n```\nDone.'), 'Copy this:\n\nDone.');
  assert.equal(spokenReply('```\nonly a box\n```'), '');
  assert.equal(spokenReply('Plain.'), 'Plain.');
  assert.equal(spokenReply('Starts\n```\nunfinished box'), 'Starts');
});

test('a phone number is 7 to 15 digits with an optional plus and ordinary punctuation', () => {
  assert.equal(phoneNumber('+1 (555) 010-0100'), '+15550100100');
  assert.equal(phoneNumber('555 0100'), '5550100');
  for (const bad of [
    '12345',
    '1'.repeat(16),
    '555-0100 ext 4',
    'tel:5550100',
    '5550100;rm',
    '',
    null,
    5550100,
  ])
    assert.equal(phoneNumber(bad), null, String(bad));
});

test('one call, text or directions row becomes a proposal', () => {
  assert.deepEqual(openProposals(block({ op: 'open_call', who: 'Ana', number: '+1 555 010 0100' })), [
    { kind: 'call', number: '+15550100100', who: 'Ana' },
  ]);
  assert.deepEqual(
    openProposals(
      block({ op: 'open_text', number: '555 010 0100', message: '  Leaving now.\r\nSee you.  ' }),
    ),
    [{ kind: 'text', number: '5550100100', who: '', message: 'Leaving now.\nSee you.' }],
  );
  assert.deepEqual(
    openProposals(block({ op: 'open_directions', to: ' Central   Library ', mode: 'Walking' })),
    [{ kind: 'directions', place: 'Central Library', mode: 'walking' }],
  );
  assert.equal(openProposals(block({ op: 'open_directions', to: 'Airport' }))[0].mode, 'driving');
  assert.equal(
    openProposals(block({ op: 'open_directions', to: 'Airport', mode: 'teleport' }))[0].mode,
    'driving',
  );
});

test('a name without a number, iPhone-only actions and anything malformed yield nothing', () => {
  const refused = [
    block({ op: 'open_call', who: 'Mom' }),
    block({ op: 'open_text', who: 'Sam', message: 'Hi' }),
    block({ op: 'open_call', number: '12' }),
    block({ op: 'open_call', number: '+1 555 010 0100', url: 'https://example.invalid' }),
    block({ op: 'open_text', number: '555 010 0100' }),
    block({ op: 'open_text', number: '555 010 0100', message: 'x'.repeat(501) }),
    block({ op: 'open_text', number: '555 010 0100', message: 'key sk-or-v1-' + 'a'.repeat(40) }),
    block({ op: 'open_facetime', number: '555 010 0100' }),
    block({ op: 'open_shortcut', name: 'Lights' }),
    block({ op: 'open_directions', to: '' }),
    block({ op: 'open_directions', to: 'Airport', link: 'https://example.invalid' }),
    block({ op: 'open_url', to: 'https://example.invalid' }),
    block([
      { op: 'open_call', number: '555 010 0100' },
      { op: 'open_call', number: '555 010 0101' },
    ]),
    block({ op: 'open_call', number: '555 010 0100' }) + block({ op: 'open_call', number: '555 010 0101' }),
    'Here.\n```pea-open\n{"op":"open_call","number":"555',
    null,
  ];
  for (const reply of refused) assert.deepEqual(openProposals(reply), [], String(reply).slice(0, 70));
});

test('the app builds every link itself and encodes what a model wrote', () => {
  assert.equal(openLink({ kind: 'call', number: '+15550100100', who: '' }), 'tel:+15550100100');
  assert.equal(
    openLink({ kind: 'text', number: '5550100100', who: '', message: 'Half & half? Yes #1\nok' }),
    'sms:5550100100?&body=Half%20%26%20half%3F%20Yes%20%231%0Aok',
  );
  const place = { kind: 'directions', place: 'Café & Bar?x=1#top', mode: 'transit' };
  assert.equal(
    openLink(place),
    'https://www.google.com/maps/dir/?api=1&destination=Caf%C3%A9%20%26%20Bar%3Fx%3D1%23top&travelmode=transit',
  );
  assert.equal(
    openLink(place, { apple: true }),
    'https://maps.apple.com/?daddr=Caf%C3%A9%20%26%20Bar%3Fx%3D1%23top&dirflg=r',
  );
  for (const action of [place, { kind: 'directions', place: 'javascript:alert(1)', mode: 'driving' }]) {
    const url = new URL(openLink(action));
    assert(['www.google.com'].includes(url.host), 'the destination cannot change where the link goes');
  }
  assert.equal(openLink({ kind: 'other' }), null);
});

test('the review states exactly what opens and that the owner still presses the final button', () => {
  const call = describeOpen({ kind: 'call', number: '+15550100100', who: 'Ana' });
  assert.match(call, /call Ana \(\+15550100100\)/);
  assert.match(call, /does not place the call/);
  const text = describeOpen({ kind: 'text', number: '5550100100', who: '', message: 'Leaving now.' });
  assert.match(text, /text to 5550100100 with these words:\n\nLeaving now\./);
  assert.match(text, /press Send yourself/);
  const route = describeOpen({ kind: 'directions', place: 'Central Library', mode: 'walking' });
  assert.match(route, /Google Maps with walking directions to:\n\nCentral Library/);
  assert.match(route, /sends this place to Google/);
  assert.match(
    describeOpen({ kind: 'directions', place: 'X', mode: 'driving' }, { apple: true }),
    /Apple Maps/,
  );
  assert.equal(openLabel({ kind: 'call', number: '5550100', who: 'Ana' }), 'Call Ana');
  assert.equal(openLabel({ kind: 'directions', mode: 'transit' }), 'Open transit directions');
});

test('the model is told a browser has no contacts, and a claimed call is recognized', () => {
  assert.match(openGuidance, /pea-open/);
  assert.match(openGuidance, /no contact list/);
  assert.match(openGuidance, /never guess one/);
  for (const claim of [
    'I’ll call the dentist now.',
    'Calling Ana for you.',
    "I've opened directions to the airport.",
    'Texting Sam that you are late.',
  ])
    assert.equal(claimsOpen(claim), true, claim);
  for (const fine of ['What number should I use?', 'The library closes at six.', '', null])
    assert.equal(claimsOpen(fine), false, String(fine));
});
