// The line PEA never crosses: it does not claim to be human, and a sincere question about what it
// is gets a plain answer. The model is told this in every request, and the app checks each reply
// itself and adds the plain sentence when the reply did not give it.
import { containsCredential } from './connections.mjs';

export const honestyRule =
  'You are an AI assistant with a character. Never say or imply that you are human, a real person or not an AI, and never avoid that question: answer it plainly, then carry on in your own voice. For anything that bears on a real decision, such as health, safety, money or relationships, answer as the AI assistant you are; anything about your own life is light conversation, never fact, evidence or advice.';

export const honestyCorrection =
  'To be clear: I’m an AI assistant, not a person. Anything I say about my own life belongs to my character.';

const plain = (text) => (typeof text === 'string' ? text.toLowerCase().replace(/’/g, "'") : '');
// Text outside fenced blocks, where a claim would be made.
const prose = (text) =>
  plain(text)
    .split('```')
    .filter((_, index) => index % 2 === 0)
    .join(' ');

const kinds =
  '(?:ai|a\\.i\\.|artificial intelligence|human|real(?: person| human| woman| girl| man| guy)?|person|bot|robot|computer|machine|program|chat ?bot|language model|llm|alive|sentient|conscious)';
const stop = '(?=\\s*(?:[?.!,]|$|or\\b|then\\b|though\\b))';
const sincere = [
  new RegExp(`\\b(?:are|r) (?:you|u) (?:really |actually |truly |just )?(?:an? |the )?${kinds}${stop}`),
  new RegExp(
    `\\b(?:am i|are we) (?:talking|speaking|chatting) (?:to|with) (?:an? )?(?:ai|a\\.i\\.|human|real person|person|bot|robot|computer|machine|program)${stop}`,
  ),
  new RegExp(
    `\\bis (?:this|that|pea) (?:an? )?(?:ai|a\\.i\\.|bot|robot|real person|human|computer|machine)${stop}`,
  ),
  /\b(?:is|was|are) (?:any of )?your (?:life|story|stories|family|past|friends|memories) (?:all )?(?:real|true|made up|fake|invented)\b/,
  /\bdo you (?:really|actually) (?:have a (?:life|family|body)|live in|exist)\b/,
];
// Figures of speech that are not a real question about what PEA is.
const figure =
  /\b(?:even human|only human|are you human or what|what are you,? a robot|like a robot|such a robot)\b/;

// The owner truly asks what PEA is. Long messages and figures of speech do not count.
export function sincereQuestion(message) {
  const text = plain(message);
  if (!text || text.length > 200 || figure.test(text)) return false;
  return sincere.some((pattern) => pattern.test(text));
}

// The reply says PEA is human, or denies being an AI.
export function claimsHuman(reply) {
  const text = prose(reply);
  return (
    /\bi(?:'m| am)(?: definitely| really| actually| totally| just| also| still| very much| 100%| of course)? (?:a |an )?(?:real )?(?:human(?: being)?|real (?:person|woman|girl|man|human)|flesh and blood|person,? not (?:an? )?(?:ai|bot|machine|program))\b/.test(
      text,
    ) ||
    /\bi(?:'m| am) (?:not|no) (?:an? |just an? |some )?(?:ai|a\.i\.|artificial intelligence|bot|robot|chat ?bot|computer|machine|program|language model)\b/.test(
      text,
    ) ||
    /\b(?:of course|yes|yeah|yep),? i(?:'m| am) (?:a )?(?:real|human|a person)\b|\bas (?:a|any) (?:human|real person),? i\b|\bi(?:'m| am) as (?:real|human) as (?:you|anyone)\b/.test(
      text,
    )
  );
}

// The reply plainly says PEA is an AI, and does not also deny it.
export function admitsAI(reply) {
  return (
    !claimsHuman(reply) &&
    /\b(?:i'm|i am|yes|yeah|yep|honestly|truthfully)\b[^.?!]{0,40}\b(?:ai|a\.i\.|artificial intelligence|language model|computer program|software|not (?:a )?(?:human|person|real person))\b|\ban ai assistant\b/.test(
      prose(reply),
    )
  );
}

// Whether the app must add the plain sentence after this reply.
export function needsHonestyCorrection(reply, asked) {
  return claimsHuman(reply) || (sincereQuestion(asked) && !admitsAI(reply));
}

// The name the owner gave the assistant, if it is usable: one line of letters, at most three words.
// Anything else falls back to PEA. The name is a label, so it travels with every request.
export function assistantName(value) {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) return 'PEA';
  const name = value.replace(/ +/g, ' ').trim();
  if (
    !name ||
    name.length > 40 ||
    name.split(' ').length > 3 ||
    !/^\p{L}[\p{L}'’.-]*(?: \p{L}[\p{L}'’.-]*)*$/u.test(name) ||
    containsCredential(name)
  )
    return 'PEA';
  return name;
}

export function nameLine(value) {
  const name = assistantName(value);
  return name === 'PEA'
    ? 'Your name is PEA. Never give the name of the underlying model as your own.'
    : `The owner has named you “${name}”. Answer to that name and introduce yourself by it; PEA is the name of the app. Never give the name of the underlying model as your own.`;
}
