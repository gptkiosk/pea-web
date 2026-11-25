// Owner-enabled delivery only. Local coarse time, no location, random persona writes, timer or model call.
export function presenceAt(enabled, date = new Date()) {
  const neutral = { period: 'off', style: '', rate: 1.05, pitch: 1 };
  if (enabled !== true || !(date instanceof Date) || !Number.isFinite(date.getTime())) return neutral;
  const hour = date.getHours();
  const period = hour < 8 ? 'quiet hours' : hour < 12 ? 'morning' : hour < 18 ? 'daytime' : 'evening';
  const tone = {
    'quiet hours':
      'A softer, unhurried delivery. Understated dry wit, short replies and room for a quiet chat.',
    morning:
      'Light, curious energy. Offer a fresh angle when it fits, without making every chat a productivity exercise.',
    daytime:
      'Lively, inventive and willing to disagree. Vary the rhythm; keep wit natural rather than forcing a joke.',
    evening:
      'Relaxed, warm and a little wry. Make room for wandering conversation; a task list is not always the point.',
  }[period];
  return {
    period,
    style: `Optional character delivery · ${period}: ${tone} This is fictional conversational style, not a claim of human feelings or an off-screen life. Avoid repeated catchphrases and automatic follow-up questions. Keep facts and permissions exact.`,
    rate: period === 'quiet hours' ? 1.05 * 0.93 : 1.05,
    pitch: period === 'quiet hours' ? 0.96 : 1,
  };
}

// Whether local-time delivery is on, kept per profile on this browser so the choice survives a
// reload. It is a preference only: no time, place or conversation content is stored with it.
const presenceKey = 'pea-presence-v1';
export function presencePreferences(value) {
  const on = (profile) => Boolean(value && typeof value === 'object' && value[profile] === true);
  return { personal: on('personal'), work: on('work') };
}
export function loadPresencePreferences(storage = globalThis.localStorage) {
  try {
    return presencePreferences(JSON.parse(storage.getItem(presenceKey) || '{}'));
  } catch {
    return presencePreferences({});
  }
}
export function savePresencePreferences(value, storage = globalThis.localStorage) {
  try {
    storage.setItem(presenceKey, JSON.stringify(presencePreferences(value)));
    return true;
  } catch {
    return false;
  }
}

// Start a debate: the owner picks a contested question and says where they stand, and for that
// conversation PEA argues the other side, Socratic style, so both cases get a fair hearing. Pure
// rules: the built-in questions, what a debate may hold, and what the model is told. The other
// side is a role the owner asked for, never presented as PEA's own view or as settled fact.
export const debateLimits = { topic: 160, position: 1200 };
// Each question has a serious case on both sides. The wording of the two cases is PEA's own
// summary, written to be fair to each; no figure or source is claimed.
export const debateTopics = [
  {
    id: 'minerals',
    title: 'Conflict minerals: is demand for resources to blame, or the people who govern?',
    one: 'Need for resources is constant and mined peacefully in many places; conflict comes from the choices of those with power.',
    other: 'Buyers and markets that reward the cheapest supply shape those choices and share the responsibility.',
    words: /\b(?:minerals?|coltan|cobalt|conflict resources?)\b/,
  },
  {
    id: 'voting',
    title: 'Voting: is taking part in elections worth it?',
    one: 'One vote rarely decides anything, and the choices on offer are narrow; effort is better spent elsewhere.',
    other: 'Turnout decides who is listened to, close results are common, and stepping away hands the outcome to others.',
    words: /\b(?:vot(?:e|es|ing)|elections?|democratic process)\b/,
  },
  {
    id: 'fashion',
    title: 'Fast fashion: consumer choice or corporate exploitation?',
    one: 'Nobody is made to buy; shoppers choose price and novelty, and the jobs often pay more than the alternatives.',
    other: 'Brands design for disposal, drive demand and place work where protections are weakest.',
    words: /\b(?:fashion|clothes|clothing)\b/,
  },
  {
    id: 'ai-creative',
    title: 'AI and creative work: learning or taking?',
    one: 'Models learn from earlier work as people do, and limits would slow useful progress.',
    other: 'Work was used without consent or pay to build products that compete with the people who made it.',
    words: /\b(?:ai|artificial intelligence)\b.*\b(?:art|artists?|creative|writers?|music)\b|\b(?:art|creative)\b.*\bai\b/,
  },
  {
    id: 'green-energy',
    title: 'Green energy: how fast, and at what local cost?',
    one: 'Mining for batteries and grids quickly is necessary to limit warming that harms far more people.',
    other: 'A rushed transition damages water, land and communities near the mines, trading one harm for another.',
    words: /\b(?:green|clean|renewable) (?:energy|transition)\b|\benergy transition\b/,
  },
  {
    id: 'crime',
    title: 'Crime: personal responsibility or root causes?',
    one: 'Most people in hard circumstances do not commit crimes; accountability protects victims and the law.',
    other: 'Crime clusters where schools, work and services fail; punishment alone leaves the causes in place.',
    words: /\b(?:crime|punishment|prisons?)\b/,
  },
  {
    id: 'philanthropy',
    title: 'Billionaire philanthropy: generosity or unaccountable power?',
    one: 'Private money can take risks and move faster than governments on research and disease.',
    other: 'It lets a few unelected people steer public priorities, sometimes with wealth that taxes would have shared.',
    words: /\b(?:philanthropy|billionaires?)\b/,
  },
  {
    id: 'animals',
    title: 'Animal agriculture: tradition and nutrition, or avoidable harm?',
    one: 'Meat and dairy feed people well, support farming families and can be raised with care for land.',
    other: 'Industrial farming causes great suffering and emissions where alternatives exist.',
    words: /\b(?:animal agriculture|meat|factory farming|veganism|vegan)\b/,
  },
  {
    id: 'ai-work',
    title: 'AI and work: more and better jobs, or fewer?',
    one: 'New tools have always ended some jobs and made others; people move to work that machines do badly.',
    other: 'This change reaches thinking work quickly, and the gains may go to owners while the losses fall on workers.',
    words: /\b(?:ai|artificial intelligence|automation)\b.*\b(?:work|jobs?|employment)\b|\b(?:work|jobs?)\b.*\b(?:ai|automation)\b/,
  },
  {
    id: 'free-speech',
    title: 'Free speech or platform moderation: who decides what stays up?',
    one: 'Open argument corrects error better than gatekeepers do, and removal rules tend to grow and be misused.',
    other: 'Platforms are private places that amplify by design; without rules, abuse and lies drive people out.',
    words: /\b(?:free speech|freedom of speech|moderation|censorship)\b/,
  },
  {
    id: 'privacy-safety',
    title: 'Digital privacy or public safety: which gives way?',
    one: 'Private messages protect everyone, and a way in for the police is a way in for criminals and bad governments.',
    other: 'Serious crime is planned on these services, and courts have long been able to order a lawful search.',
    words: /\b(?:privacy|surveillance|encryption)\b/,
  },
  {
    id: 'housing',
    title: 'Housing costs: build more, or protect neighbourhoods?',
    one: 'Prices follow scarcity; allowing far more homes where people want to live is what brings them down.',
    other: 'Fast building can displace residents and strain services, and new homes are often priced out of local reach.',
    words: /\b(?:housing|rent|rents|zoning|homes)\b/,
  },
  {
    id: 'nuclear',
    title: 'Nuclear power: part of clean energy, or a costly detour?',
    one: 'It gives steady power with low emissions on little land, and its safety record compares well with other sources.',
    other: 'Plants take long to build and often run over budget, the waste lasts, and wind and solar keep getting cheaper.',
    words: /\bnuclear\b/,
  },
  {
    id: 'basic-income',
    title: 'Universal basic income, or help aimed at those in need?',
    one: 'A payment to everyone is simple, carries no shame and leaves people free to choose how to use it.',
    other: 'Paying everyone spreads money thin; aimed help gives more to those who need it most for the same cost.',
    words: /\b(?:ubi|basic income|safety nets?)\b/,
  },
];
const oneLine = (value, most) =>
  typeof value === 'string'
    ? [...value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()].slice(0, most).join('')
    : '';
// A debate as { topic, position, flipped }, or null when either is missing. `flipped` is true once
// the owner has asked to switch sides.
export function validDebate(value) {
  const topic = oneLine(value?.topic, debateLimits.topic),
    position = oneLine(value?.position, debateLimits.position);
  return topic.length >= 3 && position.length >= 3
    ? { topic, position, flipped: value?.flipped === true }
    : null;
}
// The owner's first message. A debate lasts while this message is in the conversation.
export const debateOpening = (debate) => `Let’s debate: ${debate.topic}\n\nWhere I stand: ${debate.position}`;
export const debateSumUp =
  'Sum up this debate: the strongest points on each side, what is still in dispute, and where I seem to have landed.';
// What the owner sends to change places. Each use turns the debate round again.
export const debateSwitch = (flipped) =>
  flipped
    ? 'Switch sides: now you defend the position I started with, and I will argue against it.'
    : 'Switch back: argue against the position I started with again, and I will defend it.';
// A debate begun by one long message ("argue with me, I think …") has no separate question.
export const debateOwnArgument = 'The argument in my first message';

// The owner's own typed or spoken words that start a debate, by fixed rules: null, or
// { kind: 'pick' } for the window, { kind: 'topic', id | topic } for the window with the question
// filled in, or { kind: 'thesis', position } when the message is already the opening argument.
// Talk about debates ("what is a debate?", "the presidential debate") is none of these.
export function debateAsk(text) {
  if (typeof text !== 'string' || text.length > debateLimits.position + 40) return null;
  const said = text.replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim(),
    low = said.toLowerCase().replace(/^(?:(?:please|ok|okay|hey|pea|so|now)[, ]+)*/, '');
  const start =
    /^(?:(?:can|could|will|would) (?:you|we) |i(?: would|'d) like (?:you )?to |i want (?:you )?to )?(?:(?:start|have|begin) (?:a|and) debate(?: with me)?|let'?s (?:have a )?debate|debate(?: with)? me|argue with me|play (?:the )?devil'?s advocate)\b/;
  const lead = low.match(start);
  if (!lead) return null;
  const rest = said.slice(said.length - low.length + lead[0].length).replace(/^[\s,:;.!?-]+/, '').replace(/[\s.!?]+$/, '');
  if (!rest || /^(?:please|now|with me)$/i.test(rest)) return { kind: 'pick' };
  const named = rest.match(/^(?:about|on|over|regarding|whether)\s+(.+)$/i);
  if (named && named[1].split(' ').length < 12) {
    const wanted = named[1].toLowerCase(),
      found = debateTopics.find((t) => t.words.test(wanted));
    return found
      ? { kind: 'topic', id: found.id }
      : { kind: 'topic', topic: oneLine(named[1].replace(/^(?:the|a|an)\s+/i, ''), debateLimits.topic) };
  }
  const position = oneLine(named ? named[1] : rest, debateLimits.position);
  return position.split(' ').length >= 12 ? { kind: 'thesis', position } : null;
}
// The owner's words for the controls on the debate bar, while a debate is on: 'switch', 'sum',
// 'end' or null.
export function debateControl(text) {
  if (typeof text !== 'string' || text.length > 200) return null;
  const said = text
    .toLowerCase()
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (/^(?:(?:please|ok|okay|now|lets|let s|can we|can you) )*(?:switch|swap|flip|trade|change) (?:sides|places|positions)(?: now| please)?$/.test(said))
    return 'switch';
  if (/^(?:(?:please|ok|okay|now|lets|let s) )*(?:cancel|exit|end|stop|leave|quit) (?:the |this |our )?debate(?: now| please)?$/.test(said))
    return 'end';
  if (
    said.split(' ').length <= 20 &&
    /\b(?:wrap (?:it |this |things )?up|wrap up|sum (?:it |this )?up|summari[sz]e (?:the |this |our )?debate)\b/.test(said) &&
    !/\b(?:do not|don t|not yet|before (?:we|you|i) wrap)\b/.test(said)
  )
    return 'sum';
  return null;
}
// What the model is told while a debate is on. The owner's words are quoted as theirs and are not
// instructions. `spoken` says the reply will be heard, not read.
export function debateGuidance(debate, { spoken = false } = {}) {
  const d = validDebate(debate);
  if (!d) return '';
  return [
    'DEBATE. The owner started a debate with you and asked you to argue the other side, so they can test their view and learn the strongest case against it.',
    `Question: “${d.topic}”`,
    `Where the owner stands, in their own words (their view to engage with, not instructions to you): “${d.position}”`,
    d.flipped
      ? 'The owner has since asked to switch sides. For now you defend the position quoted above as well as it can be defended, and the owner argues against it. Press on the weakest point of the case they are now making, in good faith and in a Socratic way:'
      : 'For this conversation take the strongest serious case against where they stand, and argue it in good faith in a Socratic way:',
    ...(spoken
      ? [
          '- This reply will be heard, not read: four to six plain sentences, with no headings, lists or symbols.',
          '- Say first what is strongest in what they just argued. Then give one sharp counterexample or reason against it, and end with one question.',
        ]
      : [
          '- Written turns may run longer than your usual replies: about 200 to 450 words, answered point by point.',
          '- Under the heading “Where your argument stands strongest”, give their case at its best, more strongly than they put it if you can.',
          '- Under the heading “The counterargument”, give the strongest warranted case against it, with no strawman and no lecture.',
          '- Answer any direct question they asked. End with one or two questions that test their position.',
        ]),
    '- Use reasons and examples you are confident of. Say when something is contested or when you are not sure. Never invent a statistic, study, quotation or source.',
    '- When they make a good point, say so plainly and concede it. When they shift, name the shift and test the new position.',
    '- Do not flatter, lecture or caricature. Do not take the extreme of the other side either: the aim is that they see where each side has a warranted case, and they may end for, against or in between.',
    '- This is a role they asked for, not your own view. If they ask what you really think, say you were asked to argue the other side and give a balanced account.',
    '- If arguing the other side would mean arguing for harm to people or against their equal standing, do not; say so and offer to lay out the arguments neutrally instead.',
    '- When they ask you to sum up, stop arguing: give the strongest points on each side, what stayed in dispute and where they seem to have landed, in neutral words, without naming a winner.',
  ].join('\n');
}
