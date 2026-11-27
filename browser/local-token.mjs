// The one credential PEA can keep on this browser: the connection token of the owner's own PEA
// server, and only after the owner ticks "Remember on this browser". It is kept apart from the
// remembered choices so that nothing which copies, exports or shares those can carry it along.
// GitHub tokens, Google access and voice keys are never kept. The OpenRouter key alone can be kept:
// sealed in the encrypted library (memory.mjs), or, below, as it is for the life of one tab, each
// only when the owner ticks its box.
const storageKey = 'pea-local-token-v1';
// The same shape the gateway requires of its token.
export const validLocalToken = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(value);

// The kept token, or '' when there is none or what is there is not a token.
export function loadLocalToken(storage = globalThis.localStorage) {
  try {
    const value = storage.getItem(storageKey);
    return validLocalToken(value) ? value : '';
  } catch {
    return '';
  }
}
// Gives false when the value is not a token or this browser refuses storage.
export function saveLocalToken(value, storage = globalThis.localStorage) {
  if (!validLocalToken(value)) return false;
  try {
    storage.setItem(storageKey, value);
    return true;
  } catch {
    return false;
  }
}
export function forgetLocalToken(storage = globalThis.localStorage) {
  try {
    storage.removeItem(storageKey);
  } catch {
    // Nothing was kept.
  }
}

// The OpenRouter key for the life of this tab, when the owner ticks "Keep this key for this tab".
// It lives in the tab's session storage: a reload keeps it, closing the tab forgets it, and it is
// not in localStorage. One per profile; only a key-shaped value is stored or read back.
const tabKey = (profile) => 'pea-router-tab-v1:' + profile;
const validProfile = (profile) => typeof profile === 'string' && /^[a-z]{1,24}$/.test(profile);
export const validRouterKey = (value) =>
  typeof value === 'string' && /^sk-or-v1-[A-Za-z0-9_-]{16,240}$/.test(value);
const tabStorage = () => {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
};
export function loadTabKey(profile, storage = tabStorage()) {
  if (!validProfile(profile)) return '';
  try {
    const value = storage.getItem(tabKey(profile));
    return validRouterKey(value) ? value : '';
  } catch {
    return '';
  }
}
// Gives false when the value is not a key or this browser refuses storage.
export function saveTabKey(profile, value, storage = tabStorage()) {
  if (!validProfile(profile) || !validRouterKey(value)) return false;
  try {
    storage.setItem(tabKey(profile), value);
    return storage.getItem(tabKey(profile)) === value;
  } catch {
    return false;
  }
}
export function forgetTabKey(profile, storage = tabStorage()) {
  if (!validProfile(profile)) return;
  try {
    storage.removeItem(tabKey(profile));
  } catch {
    // Nothing was kept.
  }
}

// Sharing reviews the owner approved in this tab, so a reload does not ask again for exactly the
// same choices. Only SHA-256 digests are kept, never what was reviewed, in the tab's session
// storage: closing the tab forgets them. The newest few are kept.
const approvalsName = 'pea-share-approvals-v1',
  approvalsKept = 24;
const validMark = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
export function loadTabApprovals(storage = tabStorage()) {
  try {
    const list = JSON.parse(storage.getItem(approvalsName) ?? '[]');
    return Array.isArray(list) ? list.filter(validMark).slice(-approvalsKept) : [];
  } catch {
    return [];
  }
}
// Gives false when the value is not a digest or this browser refuses storage.
export function saveTabApproval(mark, storage = tabStorage()) {
  if (!validMark(mark)) return false;
  try {
    const list = loadTabApprovals(storage).filter((kept) => kept !== mark);
    storage.setItem(approvalsName, JSON.stringify([...list, mark].slice(-approvalsKept)));
    return true;
  } catch {
    return false;
  }
}
export function forgetTabApprovals(storage = tabStorage()) {
  try {
    storage.removeItem(approvalsName);
  } catch {
    // Nothing was kept.
  }
}
