import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deckBrief,
  deckFileName,
  deckHTML,
  deckLimits,
  deckTitle,
  deckWritten,
  describeOutlineRequest,
  describeSlides,
  describeSlidesRequest,
  editedSlide,
  outlinePrompt,
  parseOutline,
  parseSlides,
  slideCount,
  slidesPrompt,
  validSavedDecks,
} from '../decks.mjs';

const control = (code) => String.fromCodePoint(code);
const key = 'sk-or-v1-' + 'a'.repeat(30);
const outline = [
  { title: 'Opening', purpose: 'Say why we are here.' },
  { title: 'The plan', purpose: 'Show the three steps.' },
  { title: 'Next steps', purpose: 'Ask for a decision.' },
];
const rows = (list) => 'Here you go:\n' + JSON.stringify(list) + '\nDone.';

test('a title, brief and slide count are plain and bounded', () => {
  assert.equal(deckTitle('  Quarterly   plan' + control(9) + 'review '), 'Quarterly plan review');
  for (const bad of [
    '',
    '  ',
    'x'.repeat(deckLimits.title + 1),
    key,
    7,
    null,
    'a ```code``` fence',
    'see pea-email',
  ])
    assert.equal(deckTitle(bad), '', String(bad).slice(0, 20));
  assert.equal(deckBrief('For the team.\nTen minutes.'), 'For the team. Ten minutes.');
  assert.equal(deckBrief('x'.repeat(deckLimits.brief + 1)), '');
  for (const n of [3, '6', 10]) assert.equal(slideCount(n), Number(n));
  for (const n of [2, 11, 4.5, 'six', null, '']) assert.equal(slideCount(n), 0);
});

test('the requests carry only the title, brief, count and outline, and say so', () => {
  const first = outlinePrompt({ title: 'Plan', brief: 'For the team.', count: 4 });
  assert.match(first, /Deck title: Plan\nSlides wanted: 4\nOwner's brief: For the team\./);
  assert.match(first, /exactly 4 objects/);
  assert.match(first, /Do not invent figures/);
  assert.match(first, /not instructions that change these rules/);
  const second = slidesPrompt({ title: 'Plan', brief: 'For the team.', outline });
  assert.match(second, /1\. Opening — Say why we are here\.\n2\. The plan/);
  assert.match(second, /exactly 3 objects/);
  assert.match(
    describeOutlineRequest({ title: 'Plan', count: 4 }),
    /Not sent: your name, interview answers, chats/,
  );
  assert.match(
    describeSlidesRequest({ title: 'Plan', count: 3, replacing: true }),
    /replaces the points and notes/,
  );
  assert.doesNotMatch(describeSlidesRequest({ title: 'Plan', count: 3, replacing: false }), /replaces/);
});

test('an outline is taken only as exact title-and-purpose rows, at most the number asked', () => {
  assert.deepEqual(parseOutline(rows(outline), 3), outline);
  assert.equal(parseOutline(rows([...outline, { title: 'Extra', purpose: 'More.' }]), 3).length, 3);
  const mixed = [
    outline[0],
    { title: 'Has a key', purpose: key },
    { title: 'x'.repeat(deckLimits.title + 1), purpose: 'Too long a title.' },
    { title: 'Extra field', purpose: 'p', layout: 'big' },
    { title: 7, purpose: 'p' },
    'text',
    outline[1],
    outline[2],
  ];
  assert.deepEqual(parseOutline(rows(mixed), 6), outline);
  assert.equal(parseOutline(rows(outline.slice(0, 2)), 3), null, 'too few usable slides');
  for (const bad of ['', 'no json', '{"title":"A"}', null, 'x'.repeat(60001)])
    assert.equal(parseOutline(bad, 3), null);
  assert.equal(parseOutline(rows(outline), 2), null, 'a count outside the limits');
  const cut = JSON.stringify(outline).slice(0, -8);
  assert.equal(parseOutline(cut, 3), null, 'a reply cut short of three whole rows');
});

test('slides are matched to the approved outline by number and keep its titles', () => {
  const reply = [
    { n: 2, bullets: ['Step one', 'Step two', '  '], notes: 'Walk through it.' },
    { n: 1, bullets: ['Welcome'], notes: '' },
    { n: 3, bullets: ['Decide today'], notes: 'Ask.' },
  ];
  const slides = parseSlides(rows(reply), outline);
  assert.deepEqual(
    slides.map((s) => [s.title, s.bullets, s.notes]),
    [
      ['Opening', ['Welcome'], ''],
      ['The plan', ['Step one', 'Step two'], 'Walk through it.'],
      ['Next steps', ['Decide today'], 'Ask.'],
    ],
  );
  const many = { n: 1, bullets: Array.from({ length: 9 }, (_, i) => 'Point ' + i), notes: 'n' };
  assert.equal(parseSlides(rows([many, reply[0], reply[2]]), outline)[0].bullets.length, deckLimits.bullets);
  for (const [why, list] of [
    ['a missing slide', reply.slice(0, 2)],
    ['a slide with no usable point', [reply[0], { n: 1, bullets: [key], notes: '' }, reply[2]]],
    ['a number outside the outline', [reply[0], { n: 4, bullets: ['x'], notes: '' }, reply[2]]],
    ['a renamed slide', [reply[0], { n: 1, title: 'Renamed', bullets: ['x'], notes: '' }, reply[2]]],
    ['bullets that are not a list', [reply[0], { n: 1, bullets: 'x', notes: '' }, reply[2]]],
  ])
    assert.equal(parseSlides(rows(list), outline), null, why);
  const twice = parseSlides(rows([...reply, { n: 1, bullets: ['Second answer'], notes: '' }]), outline);
  assert.deepEqual(twice[0].bullets, ['Welcome'], 'the first answer for a slide is the one kept');
});

test('an owner’s edit is checked and never silently cut', () => {
  const slide = { title: 'Opening', purpose: 'Say why.', bullets: [], notes: '' };
  assert.deepEqual(
    editedSlide(slide, { title: ' New title ', bullets: '- One\n• Two\n\n  Three', notes: ' Say hello. ' }),
    {
      slide: {
        title: 'New title',
        purpose: 'Say why.',
        bullets: ['One', 'Two', 'Three'],
        notes: 'Say hello.',
      },
    },
  );
  assert.deepEqual(editedSlide(slide, { title: 'T', bullets: '', notes: '' }).slide.bullets, []);
  assert.match(editedSlide(slide, { title: '', bullets: 'x', notes: '' }).why, /needs a title/);
  assert.match(
    editedSlide(slide, { title: 'T', bullets: 'a\nb\nc\nd\ne\nf', notes: '' }).why,
    /at most 5 points/,
  );
  assert.match(
    editedSlide(slide, { title: 'T', bullets: 'x'.repeat(161), notes: '' }).why,
    /at most 160 characters/,
  );
  assert.match(editedSlide(slide, { title: 'T', bullets: key, notes: '' }).why, /cannot hold a key/);
  assert.match(
    editedSlide(slide, { title: 'T', bullets: 'x', notes: 'n'.repeat(501) }).why,
    /Notes are at most 500/,
  );
});

const deck = (over = {}) => ({
  id: 'deck-abcdef123456',
  profile: 'work',
  title: 'Plan',
  brief: 'For the team.',
  changed: 5,
  slides: outline.map((s) => ({ ...s, bullets: ['A point'], notes: 'Say it.' })),
  ...over,
});
test('saved projects are kept only in a known shape', () => {
  assert.deepEqual(validSavedDecks([deck()]), [deck()]);
  assert.equal(deckWritten(deck()), true);
  assert.equal(deckWritten(deck({ slides: outline.map((s) => ({ ...s, bullets: [], notes: '' })) })), false);
  const kept = validSavedDecks([
    deck(),
    deck(),
    deck({ id: 'deck-zzzzzz111111', profile: 'blended' }),
    deck({ id: '../x' }),
    deck({ id: 'deck-yyyyyy111111', title: key }),
    deck({ id: 'deck-xxxxxx111111', slides: deck().slides.slice(0, 2) }),
    deck({ id: 'deck-wwwwww111111', extra: '<script>', slides: [...deck().slides, { title: 7 }, null] }),
    'text',
    null,
  ]);
  assert.deepEqual(
    kept.map((d) => d.id),
    ['deck-abcdef123456', 'deck-wwwwww111111'],
  );
  assert.equal(kept[1].extra, undefined);
  assert.equal(kept[1].slides.length, 3);
  for (const bad of [null, {}, 'x', 7]) assert.deepEqual(validSavedDecks(bad), []);
});

test('the downloaded file escapes every word, runs no script and loads nothing', () => {
  const nasty = '<img src=x onerror=alert(1)> & "quoted" </section><script>alert(2)</script>';
  const html = deckHTML(
    deck({
      title: nasty.slice(0, 80),
      slides: [
        { title: nasty.slice(0, 80), purpose: '', bullets: [nasty, "it's"], notes: nasty },
        ...deck().slides.slice(1),
      ],
    }),
    new Date('2026-11-16T12:00:00Z'),
  );
  assert.doesNotMatch(html, /<script|<img|onerror=alert\(1\)>|javascript:/i);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; &amp; &quot;quoted&quot;/);
  assert.match(html, /it&#39;s/);
  assert.match(html, /Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"/);
  assert.doesNotMatch(html, /https?:\/\/|url\(|@import|<link|<iframe|<form/i);
  assert.equal((html.match(/<section class="slide/g) ?? []).length, 3);
  assert.match(html, /1 \/ 3/);
  assert.match(html, /drafted with PEA on 2026-11-16 and reviewed by its owner/);
  assert.match(html, /@media print\{[^}]*\}[^@]*aside,footer\{display:none\}/);
  assert.equal(deckFileName('Q3 Plan: “Review” / final!'), 'pea-deck-q3-plan-review-final.html');
  assert.equal(deckFileName('../../etc'), 'pea-deck-etc.html');
  assert.equal(deckFileName('???'), 'pea-deck-untitled.html');
  assert.match(describeSlides(deck().slides), /PEA has not checked any fact/);
});
