// The choices PEA remembers on this browser so they need not be made again after a reload or an
// update: which models, which sharing switches, the public Google client ID and the repository
// name. It is a fixed list. Keys, tokens, passwords and the "may retain or train" consent are
// never among them, and anything that looks like a credential is dropped on the way in and out.
import { containsCredential, validRepo } from './connections.mjs';

const storageKey = 'pea-connections-v1';
export const choiceProfiles = ['personal', 'work', 'blended'];
const models = ['chat', 'collaboration', 'coding'],
  switches = ['shareIntro', 'shareCalendar', 'shareMail', 'shareTodos', 'sharePeaFiles'],
  roles = ['collaboration', 'coding', 'image'];
const modelID = (value) =>
  typeof value === 'string' && /^[A-Za-z0-9._:/@+-]{1,200}$/.test(value) && !containsCredential(value)
    ? value
    : '';
const client = (value) =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}\.apps\.googleusercontent\.com$/.test(value)
    ? value
    : '';

export const defaultChoices = () => ({
  role: 'collaboration',
  chat: '',
  collaboration: '',
  coding: '',
  shareIntro: false,
  shareCalendar: false,
  shareMail: false,
  shareTodos: false,
  sharePeaFiles: true,
  githubRepo: '',
});
// One profile's choices, with anything unexpected replaced by its default.
export function profileChoices(value) {
  const out = defaultChoices();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const name of models) out[name] = modelID(value[name]);
  for (const name of switches) if (typeof value[name] === 'boolean') out[name] = value[name];
  if (roles.includes(value.role)) out.role = value.role;
  if (validRepo(value.githubRepo) && !containsCredential(value.githubRepo)) out.githubRepo = value.githubRepo;
  return out;
}
// Everything remembered: { google: { client, calendar, write, mail }, profiles: { ... } }.
export function validChoices(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const google = source.google && typeof source.google === 'object' ? source.google : {};
  return {
    google: {
      client: client(google.client),
      calendar: google.calendar === true,
      write: google.write === true,
      mail: google.mail === true,
    },
    profiles: Object.fromEntries(
      choiceProfiles.map((name) => [name, profileChoices(source.profiles?.[name])]),
    ),
  };
}
export function loadChoices() {
  try {
    return validChoices(JSON.parse(globalThis.localStorage.getItem(storageKey) || 'null'));
  } catch {
    return validChoices(null);
  }
}
// Saves the fixed list only. Gives false when this browser refuses storage.
export function saveChoices(value) {
  try {
    globalThis.localStorage.setItem(storageKey, JSON.stringify(validChoices(value)));
    return true;
  } catch {
    return false;
  }
}
export function forgetChoices() {
  try {
    globalThis.localStorage.removeItem(storageKey);
  } catch {
    // Nothing was kept.
  }
}
