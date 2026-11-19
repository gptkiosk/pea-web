// The one credential PEA can keep on this browser: the connection token of the owner's own PEA
// server, and only after the owner ticks "Remember on this browser". It is kept apart from the
// remembered choices so that nothing which copies, exports or shares those can carry it along.
// Provider keys, GitHub tokens and Google access are never kept here. The OpenRouter key alone can
// be kept elsewhere, sealed in the encrypted library (memory.mjs), when the owner ticks its box.
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
