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
