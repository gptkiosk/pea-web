// A publisher's transcript: read into lines from each kind of file, and the passages nearest one
// claim picked word for word. A stranger's text: cut and quoted, never run.
// Run with: node --test browser/tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clock,
  passageLines,
  passagesFor,
  parseTranscript,
  refSeconds,
  timeOf,
  transcriptLimits,
  usable,
} from '../transcript.mjs';
import { briefInPlay, idle, showCommand, showMove, sourceOf } from '../shownav.mjs';

const filler = (n) => `Tide table ${n} was read aloud at the harbour office that morning as usual.`;
const cue = (i, said, voice = 'Mara') =>
  `00:${String(Math.floor(i / 6)).padStart(2, '0')}:${String((i % 6) * 10).padStart(2, '0')}.000 --> 00:59:00.000\n<v ${voice}>${said}`;
const vtt =
  'WEBVTT\n\n' +
  Array.from({ length: 30 }, (_, i) =>
    cue(
      i,
      i === 4
        ? 'The Trust voted on it in March. The old lamp won, 42 votes to nine.'
        : i === 20
          ? 'An electric lamp would have cost 150 thousand dollars, <b>before</b> one night of light.'
          : filler(i),
      i === 20 ? 'Tobias Renn' : 'Mara',
    ),
  ).join('\n\n');
const claim = 'The Grey Point Trust voted on it in March, and the old lamp won by 42 votes to nine.';

test('times are read as publishers write them', () => {
  assert.equal(timeOf('00:02:03.450'), 123);
  assert.equal(timeOf('00:02:03,450'), 123);
  assert.equal(timeOf('1:02:03'), 3723);
  assert.equal(timeOf('[02:03]'), 123);
  for (const wrong of ['2:75', '99', 'two', '', null, '00:61:00']) assert.equal(timeOf(wrong), null);
  assert.equal(clock(123), '2:03');
  assert.equal(clock(3723), '1:02:03');
  assert.equal(clock(-1), '');
  assert.equal(refSeconds('00:00:42'), 42);
  assert.equal(refSeconds('L74'), null);
  assert.equal(refSeconds(null), null);
});

test('captions, plain words and markdown become lines; anything else is refused', () => {
  const lines = parseTranscript(vtt, 'vtt');
  assert.equal(lines.length, 30);
  assert.deepEqual(lines[4], {
    t: 40,
    who: 'Mara',
    text: 'The Trust voted on it in March. The old lamp won, 42 votes to nine.',
  });
  assert.equal(lines[20].who, 'Tobias Renn');
  assert.doesNotMatch(lines[20].text, /</, 'markup is dropped');
  const srt = Array.from(
    { length: 12 },
    (_, i) => `${i + 1}\n00:00:${String(i * 5).padStart(2, '0')},000 --> 00:00:59,000\n${filler(i)}`,
  ).join('\n\n');
  assert.equal(parseTranscript(srt, 'srt')[2].t, 10);
  // Captions cut mid-sentence are joined under one speaker.
  const broken =
    'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nthe old lamp\n\n00:00:02.000 --> 00:00:03.000\nwon the vote.\n\n' +
    Array.from({ length: 8 }, (_, i) => cue(i + 1, filler(i))).join('\n\n');
  assert.equal(parseTranscript(broken, 'vtt')[0].text, 'the old lamp won the vote.');
  const text = [
    '[00:01:05] Mara: ' + filler(1),
    '**Tobias Renn:** ' + filler(2),
    ...Array.from({ length: 6 }, (_, i) => filler(i + 3)),
  ].join('\n');
  const prose = parseTranscript(text, 'text');
  assert.deepEqual([prose[0].t, prose[0].who], [65, 'Mara']);
  assert.equal(parseTranscript('# Episode\n\n' + text, 'markdown')[0].text, 'Episode');
  for (const [body, format] of [
    [vtt, 'html'],
    [vtt, 'pdf'],
    ['', 'vtt'],
    ['WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nToo short.', 'vtt'],
    ['x'.repeat(transcriptLimits.bytes + 1), 'text'],
    [null, 'text'],
  ])
    assert.equal(parseTranscript(body, format), null);
  assert.equal(usable(null), null);
});

test('the passages nearest a claim are picked word for word, by its words and its time', () => {
  const lines = parseTranscript(vtt, 'vtt');
  const found = passagesFor(lines, claim, '00:00:42');
  assert.equal(found.length, 1, 'filler that shares no words is not quoted');
  assert.equal(found[0].t, 20);
  assert.match(found[0].text, /The Trust voted on it in March\. The old lamp won, 42 votes to nine\./);
  assert.ok(found[0].text.length <= transcriptLimits.passage);
  assert.ok(lines.slice(found[0].from, found[0].to + 1).every((line) => found[0].text.includes(line.text)));
  // With no time on the claim, the words alone find it.
  assert.equal(passagesFor(lines, claim, 'L74')[0].from, found[0].from);
  // With no shared words, the time picks one passage and no more.
  const byTime = passagesFor(lines, 'Something else entirely unrelated zebra.', '00:03:20');
  assert.equal(byTime.length, 1);
  assert.ok(byTime[0].t >= 150 && byTime[0].t <= 245, 'around the claim’s time');
  assert.deepEqual(passagesFor(lines, 'Something else entirely unrelated zebra.', null), []);
  assert.deepEqual(passagesFor([], claim), []);
  assert.deepEqual(passagesFor(null, claim), []);

  const sent = passageLines(found, '1.1.1');
  assert.match(sent[0], /^From the publisher’s own transcript of this episode, word for word/);
  assert.match(sent[1], /^Transcript passage for section 1\.1\.1 \(at 0:20\), Mara: “/);
  assert.deepEqual(passageLines([], '1.1.1'), []);
  assert.deepEqual(passageLines(found, '1.1.1', 40), [], 'nothing is cut to fit');
});

test('going deeper only proposes the read; once kept, passages are shown and go with the brief', () => {
  const source = { format: 'vtt', link: 'https://harbor.example.org/e/1/transcript.vtt', bytes: 4000 };
  const shows = [
    {
      id: 'harbor',
      name: 'Harbor Voices',
      episodes: [
        {
          item: {
            id: 'a',
            title: 'The lamp',
            date: '2026-11-11',
            brief: { sha256: 'abc' },
            transcript_source: source,
          },
          brief: {
            brief_kind: 'extractive',
            headline: 'A headline.',
            claims: [
              { text: claim, ref: '00:00:42' },
              { text: 'Second claim.', ref: null },
            ],
            quotes: [],
          },
          digest: null,
        },
        {
          item: { id: 'b', title: 'No transcript', date: '2026-11-10' },
          brief: { headline: 'H', claims: [{ text: 'A claim here.' }] },
        },
      ],
    },
  ];
  assert.deepEqual(sourceOf(shows[0].episodes[0].item), { ...source, extract: {} });
  for (const wrong of [
    { ...source, format: 'pdf' },
    { ...source, link: 'http://harbor.example.org/t.vtt' },
    { ...source, link: 'https://127.0.0.1/t.vtt' },
    { ...source, bytes: transcriptLimits.bytes + 1 },
    null,
  ])
    assert.equal(sourceOf({ transcript_source: wrong }), null);

  let kept = null;
  const transcriptOf = (show, episode) => (episode === shows[0].episodes[0] ? kept : null);
  const go = (said, at = idle()) => showMove(showCommand(said, { at, shows }), { shows, at, transcriptOf });
  const section = go('1.1.1');
  assert.ok(section.footer.some((b) => b.label === 'Go deeper' && b.say === 'go deeper'));
  assert.equal(
    go('1.2.1').footer.some((b) => /deeper|Passages/.test(b.label)),
    false,
  );
  for (const said of [
    'go deeper',
    'dig deeper',
    'read the transcript',
    'what exactly did they say',
    'the exact words',
  ])
    assert.equal(showCommand(said, { at: section.at, shows }).kind, 'deeper', said);
  assert.equal(showCommand('go deeper', { at: idle(), shows }), null);

  const ask = go('go deeper', section.at);
  assert.deepEqual(ask.deeper, { show: 1, episode: 1, section: 1, source: { ...source, extract: {} } });
  assert.equal(ask.send, null);
  assert.match(ask.say, /^Review reading the publisher’s transcript for episode 1\.1\.$/);
  assert.match(go('go deeper', go('1.2.1').at).say, /^The publisher gives no transcript PEA can read/);
  assert.equal(briefInPlay(shows, section.at, transcriptOf).passages, 0);

  kept = parseTranscript(vtt, 'vtt');
  assert.ok(go('1.1.1').footer.some((b) => b.label === 'Passages'));
  const shown = go('go deeper', section.at);
  assert.equal(shown.level, 'passages');
  assert.equal(shown.deeper, undefined, 'nothing more is asked');
  assert.equal(shown.title, 'Section 1.1.1, in the publisher’s words');
  assert.deepEqual([shown.rows[0].label, shown.rows[0].sub], ['0:20', 'Mara']);
  assert.match(go('go deeper', go('1.1.2').at).say, /no passage of it matches section 1\.1\.2/);

  const sent = briefInPlay(shows, section.at, transcriptOf);
  assert.equal(sent.passages, 1);
  assert.match(
    sent.text,
    /\nTranscript passage for section 1\.1\.1 \(at 0:20\), Mara: “[^”]*42 votes to nine\./,
  );
  assert.ok(sent.text.length <= 4200);
  assert.notEqual(sent.key, briefInPlay(shows, section.at).key);
  // Only for the open section, and never for an episode whose transcript was not read.
  assert.equal(briefInPlay(shows, go('1.1').at, transcriptOf).passages, 0);
  assert.equal(briefInPlay(shows, go('1.2.1').at, transcriptOf).passages, 0);
});
