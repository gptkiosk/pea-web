import test from 'node:test';
import assert from 'node:assert/strict';
import { dayOf, idle, plainAddress, sectionsOf, showCommand, showMove } from '../shownav.mjs';
import { numberedCommand } from '../numbered.mjs';

const brief = (n) => ({
  headline: `Headline ${n}`,
  claims: Array.from({ length: n }, (_, i) => ({ text: `Claim ${i + 1} of ${n}.` })),
});
const episode = (id, title, date, claims) => ({ item: { id, title, date }, brief: brief(claims) });
const shows = [
  {
    name: 'Harbor Voices',
    episodes: [
      episode('a', 'Who counts the ships?', '2026-11-12', 3),
      episode('b', 'The lamp', '2026-11-11', 8),
      episode('c', 'A ledger', '2026-11-10', 0),
    ],
  },
  {
    name: 'The Quay Notes',
    episodes: Array.from({ length: 7 }, (_, i) =>
      episode('q' + i, 'Quay ' + (i + 1), '2026-11-0' + (9 - i), 2),
    ),
  },
];
const open = { show: 1, episode: 2, section: null, offset: 0 };
const ask = (said, at = idle()) => showCommand(said, { at, shows });

test('addresses are read most specific first, said or typed, alone or inside a sentence', () => {
  for (const [said, expected, at] of [
    ['list shows', { kind: 'shows' }],
    ['back to shows', { kind: 'shows' }],
    ['Show 1', { kind: 'show', show: 1 }],
    ['episodes for show 2', { kind: 'show', show: 2 }],
    ['first podcast', { kind: 'show', show: 1 }],
    ['list episodes for Harbor Voices', { kind: 'show', show: 1 }],
    ['episodes in the quay notes', { kind: 'show', show: 2 }],
    ['1.2', { kind: 'episode', show: 1, episode: 2 }],
    ['open 2.1', { kind: 'episode', show: 2, episode: 1 }],
    ['episode 1.2', { kind: 'episode', show: 1, episode: 2 }],
    ['one point two', { kind: 'episode', show: 1, episode: 2 }],
    ['show 1 episode 2', { kind: 'episode', show: 1, episode: 2 }],
    ['1.2.3', { kind: 'section', show: 1, episode: 2, section: 3 }],
    ['one point two point three', { kind: 'section', show: 1, episode: 2, section: 3 }],
    ['show 1 episode 2 section 3', { kind: 'section', show: 1, episode: 2, section: 3 }],
    [
      'No, this would be 2.4.3 is there a section there?',
      { kind: 'section', show: 2, episode: 4, section: 3 },
    ],
    ['search 1.2.3', { kind: 'search', show: 1, episode: 2, section: 3 }],
    ['fact check 1.2.3', { kind: 'search', show: 1, episode: 2, section: 3 }],
    ['1.2.3.c.1', { kind: 'citations', show: 1, episode: 2, section: 3 }],
    ['1.2.3 c 1', { kind: 'citations', show: 1, episode: 2, section: 3 }],
    ['one point two point three c one', { kind: 'citations', show: 1, episode: 2, section: 3 }],
    ['studies on 1.2.3', { kind: 'citations', show: 1, episode: 2, section: 3 }],
    // Inside a show or an open episode.
    ['episode 2', { kind: 'episode', show: 1, episode: 2 }, { ...open, episode: null }],
    ['second episode', { kind: 'episode', show: 1, episode: 2 }, { ...open, episode: null }],
    ['more episodes', { kind: 'more' }, open],
    ['back to episodes', { kind: 'episodes' }, open],
    ['next episode', { kind: 'episode-step', step: 1 }, open],
    ['previous episode', { kind: 'episode-step', step: -1 }, open],
    ['latest', { kind: 'episode', show: 1, episode: 1 }, open],
    ['the newest from yesterday is great', { kind: 'episode', show: 1, episode: 1 }, open],
    ['oldest episode', { kind: 'episode', show: 1, episode: -1 }, open],
    ['section 2', { kind: 'section', show: 1, episode: 2, section: 2 }, open],
    ['point 2', { kind: 'section', show: 1, episode: 2, section: 2 }, open],
    ['next section', { kind: 'section-step', step: 1 }, open],
    ['back to episode', { kind: 'sections' }, open],
    ['list sections', { kind: 'sections' }, open],
    ['search section 2', { kind: 'search', show: 1, episode: 2, section: 2 }, open],
    ['list citations', { kind: 'citations', show: 1, episode: 2, section: null }, open],
    ['where am I', { kind: 'where' }, open],
    ['which episode is this', { kind: 'where' }, open],
  ])
    assert.deepEqual(ask(said, at), expected, said);
  for (const [said, at] of [
    ['version 1.2.3 is out'],
    ['v1.2.3'],
    ['What shows should I watch?'],
    ['2.5 percent of people'],
    ['I have one point to make'],
    ['list episodes for a show I do not follow'],
    ['where am I'],
    ['section 2'],
    ['next episode'],
    ['the latest news from Paris, please', open],
    ['tell me about 1.2 million dollars', open],
    ['', open],
    ['list shows '.repeat(30)],
  ])
    assert.equal(ask(said, at), null, said);
  assert.equal(showCommand(null), null);
  assert.equal(plainAddress('One point two point three.'), '1.2.3');
  // With an episode open, "point 2" is its section; with none, it stays a point of the last reply.
  assert.equal(ask('point 2'), null);
  assert.deepEqual(numberedCommand('point 2'), { kind: 'point', point: 2, act: 'focus' });
});

test('moves walk shows, episodes and sections, each row carrying the words it stands for', () => {
  let m = showMove(ask('list shows'), { shows });
  assert.equal(m.level, 'shows');
  assert.deepEqual(
    m.rows.map((r) => [r.label, r.text, r.sub, r.say]),
    [
      ['1', 'Harbor Voices', '3 episodes', 'show 1'],
      ['2', 'The Quay Notes', '7 episodes', 'show 2'],
    ],
  );
  assert.equal(m.say, 'Show 1: Harbor Voices. Show 2: The Quay Notes.');

  m = showMove(ask('show 2'), { shows, at: m.at });
  assert.equal(m.title, 'Show 2: The Quay Notes');
  assert.deepEqual(
    m.rows.map((r) => r.label),
    ['2.1', '2.2', '2.3', '2.4', '2.5'],
    'five to a page',
  );
  assert.deepEqual(
    m.footer.map((b) => b.label),
    ['More episodes', 'Back to shows'],
  );
  m = showMove(ask('more episodes', m.at), { shows, at: m.at });
  assert.deepEqual(
    m.rows.map((r) => r.label),
    ['2.6', '2.7'],
  );
  assert.deepEqual(
    m.footer.map((b) => b.label),
    ['Back to shows'],
  );
  assert.match(
    showMove(ask('more episodes', m.at), { shows, at: m.at }).say,
    /^No more episodes are kept for Show 2\. It has 7\.$/,
  );

  m = showMove(ask('1.2'), { shows });
  assert.equal(m.level, 'episode');
  assert.equal(m.title, 'Episode 1.2: The lamp');
  assert.deepEqual(
    m.rows.map((r) => r.label),
    ['1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6'],
    'at most six sections',
  );
  assert.equal(m.rows[0].say, '1.2.1');
  assert.match(
    m.say,
    /^Episode 1\.2 from Harbor Voices: The lamp, 11 November 2026\. Section 1: Claim 1 of 8\./,
  );
  assert.equal(m.send, null, 'opening an episode sends nothing');
  assert.deepEqual(
    m.footer.map((b) => b.say),
    ['next episode', 'back to episodes', 'list shows'],
  );

  const section = showMove(ask('section 2', m.at), { shows, at: m.at });
  assert.equal(section.level, 'section');
  assert.equal(
    section.send,
    'Tell me more about section 2 of the episode “The lamp” (Harbor Voices, 11 November 2026). Its curated brief says: “Claim 2 of 8.”',
  );
  assert.equal(
    showCommand(section.send, { at: section.at, shows }),
    null,
    'what is sent is not itself a command',
  );
  assert.equal(showMove(ask('next section', section.at), { shows, at: section.at }).title, 'Section 1.2.3');
  assert.match(
    showMove(ask('where am I', section.at), { shows, at: section.at }).say,
    /^Section 1\.2\.2\. Show 1: Harbor Voices, Episode 1\.2: “The lamp” \(11 November 2026\)\. Claim 2 of 8\. Say “back to episode”/,
  );
  assert.match(
    showMove(ask('where am I', m.at), { shows, at: m.at }).say,
    /^Episode 1\.2\. Show 1: Harbor Voices/,
  );
  assert.match(
    showMove({ kind: 'where' }, { shows, at: { ...idle(), show: 2 } }).say,
    /^You’re browsing Show 2: The Quay Notes \(7 episodes\)\. Say “2\.1” to open the latest/,
  );

  // An episode with no claims has its headline as the one section.
  assert.deepEqual(
    showMove(ask('1.3'), { shows }).rows.map((r) => r.text),
    ['Headline 0'],
  );
  assert.equal(showMove(ask('next episode', m.at), { shows, at: m.at }).title, 'Episode 1.3: A ledger');
  assert.equal(showMove(ask('oldest episode', m.at), { shows, at: m.at }).title, 'Episode 1.3: A ledger');
  assert.equal(
    showMove(ask('latest', m.at), { shows, at: m.at }).title,
    'Episode 1.1: Who counts the ships?',
  );

  // Plain words when a number is not there, or there is nothing to do it with.
  assert.match(
    showMove(ask('1.9'), { shows }).say,
    /^There is no episode 1\.9\. Show 1 has 3 episodes kept\.$/,
  );
  assert.match(showMove(ask('9.1'), { shows }).say, /^There is no show 9\. You follow 2\.$/);
  assert.match(
    showMove(ask('1.1.9'), { shows }).say,
    /^There is no section 1\.1\.9\. Episode 1\.1 has 3 sections\.$/,
  );
  assert.match(
    showMove(ask('search 1.2.3'), { shows }).say,
    /cannot search the web, so section 1\.2\.3 was not searched/,
  );
  assert.equal(showMove(ask('search 1.2.3'), { shows }).send, null);
  assert.match(showMove(ask('1.2.3.c.1'), { shows }).say, /No scientific citations are kept/);
  assert.match(
    showMove(ask('list shows'), { shows: [] }).say,
    /^You follow no shows with briefs in this tab\./,
  );
  assert.equal(dayOf('2026-02-03'), '3 February 2026');
  assert.equal(dayOf('nonsense'), '');
  assert.deepEqual(sectionsOf(null), []);
});
