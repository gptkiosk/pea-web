// A question from PEA with a few set answers, as pure functions. A model may end a reply with one
// pea-choices block; the page shows the answers as numbered buttons. The owner presses one, says
// its number, or answers in their own words. A picked answer is sent as the owner's next message,
// exactly as written, through the same send and the same sharing review as typed words. Picking
// an answer approves nothing: every action still has its own review.

export const choiceLimits = { least: 2, most: 6, option: 80, question: 200 };

export const choiceGuidance =
  'When you need the owner to pick between a few set answers before you can go on, you may end the reply with one fenced pea-choices JSON block with exactly {"op":"choose","question":"The question in one sentence","options":["First answer","Second answer"]}. Give two to six answers of at most 80 characters, each a complete answer in the owner’s own voice that makes sense as their next message. Ask the question in the reply itself too. The app shows the answers as numbered buttons; the owner can press one, say its number, or answer in their own words, and what they pick comes back to you as their next message exactly as written. Use it only for a real choice between set answers, never to get approval for an action (those have their own blocks and reviews), and do not include another action block in the same reply.';

// One line of plain words: control and direction-changing characters removed, spaces collapsed.
function line(value) {
  return typeof value === 'string'
    ? value
        .replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : '';
}
// How two answers are compared, and how a spoken or typed answer is matched: letters and digits
// only, lower case.
const plain = (value) =>
  line(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

// The one choice a reply offers, or none. Anything not exactly the shape above offers nothing.
export function choiceProposals(raw) {
  if (
    typeof raw !== 'string' ||
    raw.length > 50000 ||
    [...raw.matchAll(/```pea-[^\n`]*\r?\n/gi)].length !== 1
  )
    return [];
  const blocks = [...raw.matchAll(/```pea-choices[ \t]*\r?\n([\s\S]*?)```/gi)];
  if (blocks.length !== 1) return [];
  try {
    const v = JSON.parse(blocks[0][1]);
    if (
      !v ||
      Array.isArray(v) ||
      typeof v !== 'object' ||
      Object.keys(v).sort().join(',') !== 'op,options,question' ||
      v.op !== 'choose' ||
      !Array.isArray(v.options) ||
      v.options.length < choiceLimits.least ||
      v.options.length > choiceLimits.most
    )
      return [];
    const question = line(v.question),
      options = v.options.map(line);
    if (
      !question ||
      [...question].length > choiceLimits.question ||
      options.some((o, i) => !o || [...o].length > choiceLimits.option || o !== v.options[i].trim()) ||
      options.some((o) => !plain(o)) ||
      new Set(options.map(plain)).size !== options.length
    )
      return [];
    return [{ question, options }];
  } catch {
    return [];
  }
}

const NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const ORDINALS = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  '1st': 1,
  '2nd': 2,
  '3rd': 3,
  '4th': 4,
  '5th': 5,
  '6th': 6,
};
// Words speech recognition often writes for a number. Taken as a number only after "option",
// "number", "choice" or "answer", never alone.
const HEARD = { won: 1, to: 2, too: 2, tu: 2, tree: 3, free: 3, for: 4, fore: 4, fife: 5, sex: 6, sicks: 6 };
const LEAD =
  '(?:(?:i ?ll|i will|i would|i d|let s|lets|please|ok|okay|um|uh|yes|yeah)\\s+)*(?:(?:pick|choose|take|select|go with|go for|i want|i choose|i pick|i ll take|make it|it s|its)\\s+)?';

// Which answer the owner's words name, as a position from 0, or -1 for none. Their words name an
// answer when they are a number ("2", "two", "option two", "the second one", "the last one") or
// the answer's own words. Anything else is the owner's own answer and is left alone.
export function spokenChoice(text, options) {
  if (!Array.isArray(options) || !options.length || typeof text !== 'string' || text.length > 200) return -1;
  const said = plain(text);
  if (!said) return -1;
  const exact = options.findIndex((o) => plain(o) === said);
  if (exact >= 0) return exact;
  const within = (n) => (Number.isInteger(n) && n >= 1 && n <= options.length ? n - 1 : -1);
  let m = said.match(
    new RegExp(
      `^${LEAD}(?:the\\s+)?(?:(?:option|number|choice|answer)\\s+)?(?:number\\s+)?(\\d|one|two|three|four|five|six)$`,
    ),
  );
  if (m) return within(NUMBERS[m[1]] ?? Number(m[1]));
  m = said.match(
    new RegExp(
      `^${LEAD}(?:the\\s+)?(?:option|number|choice|answer)\\s+(?:number\\s+)?(${Object.keys(HEARD).join('|')})$`,
    ),
  );
  if (m) return within(HEARD[m[1]]);
  m = said.match(
    new RegExp(
      `^${LEAD}(?:the\\s+)?(${Object.keys(ORDINALS).join('|')}|last)(?:\\s+(?:one|option|choice|answer))?$`,
    ),
  );
  if (m) return m[1] === 'last' ? options.length - 1 : within(ORDINALS[m[1]]);
  return -1;
}

// The answers as PEA says them aloud after a reply, so they can be picked by number hands-free.
export function choicesAloud(choice) {
  return (
    choice.options.map((o, i) => `Option ${i + 1}: ${o}.`).join(' ') +
    ' Say a number, or answer in your own words.'
  );
}
