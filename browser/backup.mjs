// The portable backup: one encrypted file holding one profile's interview answers, reviewed
// memories, to-dos, the character's history cards and day lines, and deck projects. It is the
// format described in docs/CONTRACTS.md, meant to be read by any PEA app. Pure rules: what a file
// may hold, how it is sealed and opened, and how a file is combined with what is already here.
// Combining only ever adds: nothing already here is changed or removed.
// Keys, tokens, permissions, sharing switches, chats and local ids never travel.
import { ServiceError, containsCredential } from './connections.mjs';
import { introductionLimits, validIntroduction } from './memory.mjs';
import { planProfileImport } from './profile-transfer.mjs';
import { todoLimits, validTodo } from './todos.mjs';
import { canonLimits, validSavedCanon } from './canon.mjs';
import { dayKey, dayLimits, pruneEntries, validSavedDays } from './days.mjs';
import { deckLimits, validSavedDecks } from './decks.mjs';

export const backupFormat = 'pea-backup-v1';
export const backupLimits = {
  iterations: 600000,
  fileCharacters: 1200000,
  contentBytes: 800000,
  memories: 150,
  memoryText: 600,
  todos: todoLimits.perProfile,
  cards: canonLimits.max,
  days: dayLimits.entries,
  decks: deckLimits.projects,
};
const profiles = ['personal', 'work'];
const sections = ['profile', 'made', 'introduction', 'memories', 'todos', 'history', 'days', 'decks'];
const refusal = 'Could not verify this backup file. Check the file and passphrase; nothing was changed.';
const time = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000;
const exact = (value, names) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === names.length &&
  names.every((name) => Object.hasOwn(value, name));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fold = (text) => text.trim().toLowerCase();

const validMemory = (m) =>
  exact(m, ['text', 'quote', 'created', 'expires']) &&
  [m.text, m.quote].every(
    (t) => typeof t === 'string' && t.trim() && t.length <= backupLimits.memoryText && !containsCredential(t),
  ) &&
  m.text === m.text.trim() &&
  time(m.created) &&
  (m.expires === null || (time(m.expires) && m.expires > m.created));
// Each travelling item is checked by the same rule the app uses for its own saved copy.
const validPortableTodo = (t) =>
  exact(t, ['title', 'due', 'remind', 'done', 'created', 'completed']) &&
  validTodo({ ...t, id: 'backup-item-0', profile: 'personal' });
const validCard = (c) =>
  exact(c, ['topic', 'tags', 'text']) &&
  same(validSavedCanon({ made: 0, cards: [{ id: 'card-1', ...c }] }).cards, [{ id: 'card-1', ...c }]);
const validLine = (d) =>
  exact(d, ['day', 'text', 'from']) && same(validSavedDays({ notes: false, entries: [d] }).entries, [d]);
const validDeck = (d, profile) =>
  exact(d, ['title', 'brief', 'slides']) &&
  Array.isArray(d.slides) &&
  d.slides.every((s) => exact(s, ['title', 'purpose', 'bullets', 'notes'])) &&
  same(
    validSavedDecks([{ id: 'deck-backup0', profile, changed: 1, ...d }]).map(({ title, brief, slides }) => ({
      title,
      brief,
      slides,
    })),
    [d],
  );

// Whether `content` is exactly one profile's backup. Work has no character history or days.
export function validBackup(content) {
  if (!exact(content, sections) || !profiles.includes(content.profile) || !time(content.made)) return false;
  const lists = [
    ['memories', backupLimits.memories, validMemory],
    ['todos', backupLimits.todos, validPortableTodo],
    ['history', backupLimits.cards, validCard],
    ['days', backupLimits.days, validLine],
    ['decks', backupLimits.decks, (d) => validDeck(d, content.profile)],
  ];
  if (
    !validIntroduction(content.introduction) ||
    !exact(content.introduction, Object.keys(introductionLimits)) ||
    lists.some(([name, most, valid]) => {
      const list = content[name];
      return !Array.isArray(list) || list.length > most || !list.every(valid);
    })
  )
    return false;
  return content.profile === 'personal' || (!content.history.length && !content.days.length);
}

// What this browser holds for one profile, in the travelling shape. Local ids, sharing switches
// and anything belonging to the other profile are left behind.
export function gatherBackup({ profile, introduction, memories, todos, cards, days, decks, now }) {
  const personal = profile === 'personal';
  const full = {
    ...Object.fromEntries(Object.keys(introductionLimits).map((k) => [k, ''])),
    ...introduction,
  };
  const content = {
    profile,
    made: now,
    introduction: Object.fromEntries(Object.keys(introductionLimits).map((k) => [k, full[k]])),
    memories: memories
      .filter((m) => m.profile === profile)
      .map((m) => ({ text: m.text, quote: m.source.quote, created: m.created, expires: m.expires })),
    todos: todos
      .filter((t) => t.profile === profile)
      .map(({ title, due, remind, done, created, completed }) => ({
        title,
        due,
        remind,
        done,
        created,
        completed,
      })),
    history: personal ? cards.map(({ topic, tags, text }) => ({ topic, tags, text })) : [],
    days: personal ? days.map(({ day, text, from }) => ({ day, text, from })) : [],
    decks: decks
      .filter((d) => d.profile === profile)
      .slice(0, backupLimits.decks)
      .map(({ title, brief, slides }) => ({
        title,
        brief,
        slides: slides.map(({ title: name, purpose, bullets, notes }) => ({
          title: name,
          purpose,
          bullets,
          notes,
        })),
      })),
  };
  if (!validBackup(content))
    throw new ServiceError('Something in this profile cannot be put in a backup. Nothing was written.');
  return content;
}

const toBase64 = (bytes) => {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x6000)
    text += String.fromCharCode(...bytes.subarray(i, i + 0x6000));
  return btoa(text);
};
function fromBase64(text, most) {
  if (
    typeof text !== 'string' ||
    text.length > most ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)
  )
    throw Error('encoding');
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
async function keyFor(passphrase, salt) {
  if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 256)
    throw new ServiceError('Use a passphrase of 12–256 characters.');
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: backupLimits.iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
// Seals bytes as a backup file. The salt and iv are random unless given, which only the test
// vectors do. The format name is authenticated, so a file cannot be relabelled.
export async function sealBytes(plain, passphrase, { salt, iv, format = backupFormat } = {}) {
  salt ??= crypto.getRandomValues(new Uint8Array(16));
  iv ??= crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFor(passphrase, salt);
  const data = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(format) },
      key,
      plain,
    ),
  );
  return JSON.stringify({
    format,
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(data),
  });
}
export async function sealBackup(content, passphrase) {
  if (!validBackup(content))
    throw new ServiceError('Something in this profile cannot be put in a backup. Nothing was written.');
  const plain = new TextEncoder().encode(JSON.stringify(content));
  if (plain.byteLength > backupLimits.contentBytes)
    throw new ServiceError('This profile is too large for one backup file. Nothing was written.');
  return sealBytes(plain, passphrase);
}
// Opens a backup file. Any fault at all gives the same refusal and changes nothing.
export const openBackup = (serialized, passphrase) =>
  openSealed(serialized, passphrase, {
    format: backupFormat,
    limits: backupLimits,
    size: 'Choose a backup file under 1.2 MB.',
    valid: validBackup,
  });
async function openSealed(serialized, passphrase, { format, limits, size, valid }) {
  if (typeof serialized !== 'string' || serialized.length > limits.fileCharacters)
    throw new ServiceError(size);
  try {
    const envelope = JSON.parse(serialized);
    if (!exact(envelope, ['format', 'salt', 'iv', 'data']) || envelope.format !== format)
      throw Error('format');
    const salt = fromBase64(envelope.salt, 24),
      iv = fromBase64(envelope.iv, 16),
      data = fromBase64(envelope.data, limits.fileCharacters);
    if (salt.length !== 16 || iv.length !== 12 || data.length < 16 || data.length > limits.contentBytes + 16)
      throw Error('size');
    const key = await keyFor(passphrase, salt),
      plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(envelope.format) },
        key,
        data,
      );
    const content = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain));
    if (!valid(content)) throw Error('contents');
    return content;
  } catch (error) {
    if (error instanceof ServiceError && /passphrase of/.test(error.message)) throw error;
    throw new ServiceError(refusal);
  }
}

// How a file would combine with what is here (`current`, gathered the same way). Only additions:
// an item already here is left exactly as it is, and where the two differ the one here stays and
// the difference is reported. `room` is how many more memories this browser's library can hold.
export function planRestore(current, incoming, { now, memoryRoom = backupLimits.memories } = {}) {
  if (!validBackup(current) || !validBackup(incoming) || current.profile !== incoming.profile)
    throw new ServiceError('This backup is for the other profile, or is not usable. Nothing was changed.');
  const plan = {
    profile: incoming.profile,
    made: incoming.made,
    introduction: planProfileImport(current.introduction, incoming.introduction, 'missing'),
  };
  // One section: `key` names an item, `equal` says whether two with the same name are the same.
  const section = (name, key, equal, most, admit = () => '') => {
    const have = new Map(current[name].map((item) => [key(item), item]));
    const out = { add: [], same: 0, differ: [], noRoom: 0, skipped: {} };
    for (const item of incoming[name]) {
      const id = key(item),
        mine = have.get(id);
      if (mine) {
        if (equal(mine, item)) out.same++;
        else if (!out.differ.includes(id)) out.differ.push(id);
        continue;
      }
      const why = admit(item, [...have.values()]);
      if (why) out.skipped[why] = (out.skipped[why] ?? 0) + 1;
      else if (have.size >= most) out.noRoom++;
      else {
        have.set(id, item);
        out.add.push(item);
      }
    }
    return out;
  };
  const whole = (a, b) => same(a, b);
  plan.memories = section(
    'memories',
    (m) => fold(m.text),
    () => true,
    Math.min(backupLimits.memories, current.memories.length + Math.max(0, memoryRoom)),
    (m) => (m.expires !== null && m.expires <= now ? 'expired' : ''),
  );
  plan.todos = section(
    'todos',
    (t) => fold(t.title),
    (a, b) => a.due === b.due && a.remind === b.remind && a.done === b.done,
    backupLimits.todos,
  );
  plan.history = section(
    'history',
    (c) => fold(c.topic),
    (a, b) => a.text === b.text,
    backupLimits.cards,
  );
  const today = dayKey(now);
  plan.days = section(
    'days',
    (d) => d.day + '|' + fold(d.text),
    () => true,
    backupLimits.days,
    (d, have) =>
      !pruneEntries([d], now).length
        ? 'outside the days PEA keeps'
        : have.filter((e) => e.day === d.day).length >= dayLimits.perDay
          ? 'day already full'
          : '',
  );
  plan.today = today;
  plan.decks = section(
    'decks',
    (d) => fold(d.title),
    (a, b) => whole(a.slides, b.slides),
    backupLimits.decks,
  );
  plan.nothing =
    !plan.introduction.changes.length &&
    ['memories', 'todos', 'history', 'days', 'decks'].every((name) => !plan[name].add.length);
  return plan;
}

const count = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
// What is in a file about to be written, for the owner to read before choosing a passphrase.
export function describeBackup(content) {
  const answered = Object.values(content.introduction).filter((v) => v.trim()).length;
  return [
    `Profile: ${content.profile}`,
    '',
    `This file will hold: ${count(answered, 'interview answer')}, ${count(content.memories.length, 'memory', 'memories')}, ${count(content.todos.length, 'to-do')}, ${count(content.history.length, 'history card')}, ${count(content.days.length, 'day line')} and ${count(content.decks.length, 'deck project')}.`,
    '',
    'Left out: chats, files, provider and service keys, connection tokens, permissions, sharing switches and the other profile.',
    '',
    'The file is encrypted with the passphrase you choose. PEA does not keep the passphrase and cannot recover it; without it the file cannot be opened by anyone, including you.',
  ].join('\n');
}
// What bringing a file in would do, item by item, for the review before anything changes.
export function describeRestore(plan) {
  const lines = [
    `Profile: ${plan.profile}`,
    `Backup made: ${new Date(plan.made).toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    '',
    'Only additions are made. Nothing already here is changed or removed.',
    '',
  ];
  const list = (title, items, show) => {
    if (items.length)
      lines.push(`${title} to add (${items.length}):`, ...items.map((i) => '  + ' + show(i)), '');
  };
  if (plan.introduction.changes.length)
    lines.push(
      `Interview answers to fill in where yours are blank (${plan.introduction.changes.length}):`,
      ...plan.introduction.changes.map((c) => `  + ${c.field}: ${c.after}`),
      '',
    );
  list('Memories', plan.memories.add, (m) => `${m.text} (from: “${m.quote}”)`);
  list('To-dos', plan.todos.add, (t) => `${t.title}${t.done ? ' (done)' : ''}`);
  list('History cards', plan.history.add, (c) => `${c.topic}: ${c.text}`);
  list('Day lines', plan.days.add, (d) => `${d.day}: ${d.text}`);
  list('Deck projects', plan.decks.add, (d) => `${d.title} (${count(d.slides.length, 'slide')})`);
  if (plan.nothing) lines.push('Everything in this file is already here. Nothing would be added.', '');
  const notes = [];
  for (const [name, label] of [
    ['memories', 'memories'],
    ['todos', 'to-dos'],
    ['history', 'history cards'],
    ['days', 'day lines'],
    ['decks', 'deck projects'],
  ]) {
    const s = plan[name];
    if (s.same) notes.push(`${s.same} ${label} already here`);
    if (s.differ.length)
      notes.push(
        `${s.differ.length} ${label} differ from yours and yours are kept (${s.differ.slice(0, 5).join('; ')})`,
      );
    if (s.noRoom) notes.push(`${s.noRoom} ${label} left out because there is no room`);
    for (const [why, n] of Object.entries(s.skipped)) notes.push(`${n} ${label} left out: ${why}`);
  }
  if (notes.length) lines.push('Not added:', ...notes.map((n) => '  · ' + n));
  return lines.join('\n').trim();
}

// Everything in one file: what this browser remembers as settings, and both profiles' contents in
// the travelling shape above. It is for the owner's own reinstall or move to another browser, so
// it is a different format from the shared one and no other app is expected to read it.
// Settings travel as the exact text this browser keeps, by a fixed list of names; each is read
// again by its own rule when the page loads, which drops anything it does not expect. Tokens,
// chats, files and permissions are not in the list and never travel; provider keys travel only
// in a file the owner ticked the box for (see travellingKeys).
export const fullFormat = 'pea-full-backup-v1';
export const fullLimits = { iterations: backupLimits.iterations, fileCharacters: 3400000, contentBytes: 2400000, setting: 200000 };
export const travellingSettings = [
  ['pea-connections-v1', 'Model choices, sharing switches, Google client ID and repository name'],
  ['pea-provider-voice-v1', 'Provider voice for reading aloud'],
  ['pea-device-voice-v1', 'Device voice and speed'],
  ['pea-weather-v1', 'Weather place and units'],
  ['pea-headlines-v1', 'Headline feeds'],
  ['pea-curated-v1', 'Curated sources you follow'],
  ['pea-presence-v1', 'Local-time presence'],
  ['pea-life-notes-v1', 'Whether PEA keeps notes from Chat'],
  ['pea-save-chats-v1', 'Whether chats are saved'],
  ['pea-mac-reminders-v1', 'Reminders on the Mac'],
  ['pea-life-v1', 'PEA’s interests and people'],
  ['pea-workspace-v1', 'Window arrangement (Personal)'],
  ['pea-workspace-v1:work', 'Window arrangement (Work)'],
  ['pea-workspace-v1:blended', 'Window arrangement (Blended)'],
];
const settingLabel = new Map(travellingSettings);
// Keys travel only when the owner ticks the box for one file. A fixed list of names; each value is
// one unbroken run of printable characters. They are sealed with everything else and never shown.
export const travellingKeys = [
  ['openrouter', 'OpenRouter key'],
  ['github', 'GitHub token'],
  ['search-brave', 'Brave Search key'],
  ['search-browserbase', 'Browserbase key'],
  ['voice-elevenlabs', 'ElevenLabs key'],
  ['voice-fish', 'Fish Audio key'],
];
const keyLabel = new Map(travellingKeys);
export const keyPassphrase = 16;
const validKeys = (keys) =>
  keys &&
  typeof keys === 'object' &&
  !Array.isArray(keys) &&
  Object.entries(keys).every(
    ([name, value]) => keyLabel.has(name) && typeof value === 'string' && /^[\x21-\x7e]{8,400}$/.test(value),
  );
// The keys held now, from what each part of the page reports. Anything not on the list is dropped.
export const gatherKeys = (held) =>
  Object.fromEntries(travellingKeys.map(([name]) => [name, held?.[name]]).filter(([, v]) => validKeys({ openrouter: v })));
export const keyNames = (keys) => travellingKeys.filter(([name]) => Object.hasOwn(keys ?? {}, name)).map(([, label]) => label);
const fullRefusal = 'Could not verify this backup file. Check the file and passphrase; nothing was changed.';
const validSetting = (text) =>
  typeof text === 'string' &&
  text.length > 0 &&
  text.length <= fullLimits.setting &&
  !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(text) &&
  !containsCredential(text);
// The settings this browser holds now, by name. One that cannot travel is left out and named.
export function gatherSettings(storage = globalThis.localStorage) {
  const settings = {},
    left = [];
  for (const [name, label] of travellingSettings) {
    let text = null;
    try {
      text = storage.getItem(name);
    } catch {
      // A browser that refuses storage has nothing saved.
    }
    if (text === null) continue;
    if (validSetting(text)) settings[name] = text;
    else left.push(label);
  }
  return { settings, left };
}
export function validFull(content) {
  return Boolean(
    // `keys` is there only in a file the owner chose to put keys in.
    (exact(content, ['made', 'version', 'settings', 'profiles']) ||
      (exact(content, ['made', 'version', 'settings', 'profiles', 'keys']) &&
        validKeys(content.keys) &&
        Object.keys(content.keys).length > 0)) &&
      time(content.made) &&
      typeof content.version === 'string' &&
      /^[0-9A-Za-z.+-]{1,80}$/.test(content.version) &&
      content.settings &&
      typeof content.settings === 'object' &&
      !Array.isArray(content.settings) &&
      Object.entries(content.settings).every(([name, text]) => settingLabel.has(name) && validSetting(text)) &&
      exact(content.profiles, profiles) &&
      profiles.every((who) => validBackup(content.profiles[who]) && content.profiles[who].profile === who),
  );
}
export async function sealFull(content, passphrase) {
  if (!validFull(content))
    throw new ServiceError('Something here cannot be put in a backup. Nothing was written.');
  if (content.keys && (typeof passphrase !== 'string' || passphrase.length < keyPassphrase))
    throw new ServiceError(
      `A file that holds keys needs a passphrase of ${keyPassphrase} or more characters. Nothing was written.`,
    );
  const plain = new TextEncoder().encode(JSON.stringify(content));
  if (plain.byteLength > fullLimits.contentBytes)
    throw new ServiceError('There is too much here for one backup file. Nothing was written.');
  return sealBytes(plain, passphrase, { format: fullFormat });
}
export const openFull = (serialized, passphrase) =>
  openSealed(serialized, passphrase, {
    format: fullFormat,
    limits: fullLimits,
    size: 'Choose a backup file under 3.4 MB.',
    valid: validFull,
  });
// Which settings a file would replace here, which are already the same, and which it would add.
export function planSettings(current, incoming) {
  const plan = { replace: [], add: [], same: 0, write: {} };
  for (const [name, label] of travellingSettings) {
    if (!Object.hasOwn(incoming, name)) continue;
    if (current[name] === incoming[name]) plan.same++;
    else {
      (Object.hasOwn(current, name) ? plan.replace : plan.add).push(label);
      plan.write[name] = incoming[name];
    }
  }
  return plan;
}
const contents = (c) =>
  `${count(Object.values(c.introduction).filter((v) => v.trim()).length, 'interview answer')}, ${count(c.memories.length, 'memory', 'memories')}, ${count(c.todos.length, 'to-do')}, ${count(c.history.length, 'history card')}, ${count(c.days.length, 'day line')}, ${count(c.decks.length, 'deck project')}`;
// What is in a whole backup about to be written.
export function describeFull(content, left = []) {
  const names = Object.keys(content.settings).map((name) => '  - ' + settingLabel.get(name));
  return [
    `PEA ${content.version}, both profiles and this browser’s settings`,
    '',
    `Settings (${names.length}):`,
    ...(names.length ? names : ['  - none saved yet']),
    ...(left.length ? ['', 'Left out because they cannot travel: ' + left.join('; ') + '.'] : []),
    '',
    `Personal: ${contents(content.profiles.personal)}.`,
    `Work: ${contents(content.profiles.work)}.`,
    '',
    ...(content.keys
      ? [
          `Keys in this file (${keyNames(content.keys).length}): ${keyNames(content.keys).join(', ')}.`,
          'Anyone who has this file and its passphrase can use these keys and spend on your accounts. Keep the file where you would keep the keys, and use a passphrase you use nowhere else. If the file is ever lost, replace the keys at each provider.',
          '',
          'Left out: the connection token, your Google sign-in, chats, files, the story board, permissions and “may retain or train” consents. Chats have their own encrypted library backup, and the board has its own.',
        ]
      : [
          'Left out: provider and service keys, the connection token, chats, files, the story board, permissions and “may retain or train” consents. Chats have their own encrypted library backup, and the board has its own.',
        ]),
    '',
    'The file is encrypted with the passphrase you choose. PEA does not keep the passphrase and cannot recover it; without it the file cannot be opened by anyone, including you.',
  ].join('\n');
}
// What bringing a whole backup in would do. `plans` holds one planRestore result per profile.
// What putting a file's keys back would do. `later` is true when a reload has to come first.
export function describeKeys(keys, later = false) {
  const names = keyNames(keys);
  return [
    `This file holds ${count(names.length, 'key')}: ${names.join(', ')}.`,
    '',
    later
      ? 'They are not put back in this step: the restored settings need a reload, and keys live in this tab only, so they would be lost by it. After reloading, restore from the same file again and the keys go back then.'
      : 'Each goes back where you would type it, under Settings. OpenRouter and GitHub wait in their fields for you to press Connect, which checks them with the provider as usual; a search or voice key is held in this tab at once. Nothing is sent anywhere by this step, and no key is shown.',
  ].join('\n');
}
export function describeFullRestore(content, settings, plans, extra = '') {
  const added = (plan) =>
    plan.nothing
      ? 'nothing to add; everything in the file is already here'
      : [
          plan.introduction.changes.length && count(plan.introduction.changes.length, 'interview answer'),
          plan.memories.add.length && count(plan.memories.add.length, 'memory', 'memories'),
          plan.todos.add.length && count(plan.todos.add.length, 'to-do'),
          plan.history.add.length && count(plan.history.add.length, 'history card'),
          plan.days.add.length && count(plan.days.add.length, 'day line'),
          plan.decks.add.length && count(plan.decks.add.length, 'deck project'),
        ]
          .filter(Boolean)
          .join(', ') + ' added';
  return [
    `Backup made: ${new Date(content.made).toISOString().slice(0, 16).replace('T', ' ')} UTC, by PEA ${content.version}`,
    '',
    settings.replace.length || settings.add.length
      ? 'Settings that will be set to what the file holds:'
      : 'Settings: all ' + settings.same + ' in the file are already the same here.',
    ...settings.replace.map((label) => '  - ' + label + ' (replaces what is here)'),
    ...settings.add.map((label) => '  - ' + label),
    '',
    `Personal: ${added(plans.personal)}.`,
    `Work: ${added(plans.work)}.`,
    '',
    'Interview answers, memories, to-dos, history, days and decks are only added; nothing already here is changed or removed. Settings are replaced, and take effect when the page reloads.' +
      extra,
    '',
    content.keys
      ? 'The connection token, chats and permissions are not in the file and are not touched.'
      : 'Keys, tokens, chats and permissions are not in the file and are not touched.',
  ].join('\n');
}
