// Provider voices (ElevenLabs, Fish Audio) for reading replies aloud. Pure rules: what may be
// sent, what the owner is told before the first paid read-aloud, and how a failure is explained.
// The text goes to the owner's own PEA gateway, which sends it on with the owner's own key.

export const speechLimits = { text: 3000, voices: 100, name: 80, audio: 6000000 };
const keyShape = /^[A-Za-z0-9_-]{16,200}$/,
  voiceShape = /^[A-Za-z0-9]{8,64}$/;
// Prices are what each provider's own pricing page listed on the date given, for the model the
// gateway uses. They are shown as a dated quote, never as a promise.
export const speechProviders = {
  elevenlabs: {
    name: 'ElevenLabs',
    price: '$0.04 per 1,000 characters (Flash v2.5), as ElevenLabs listed on 16 November 2026',
    keeps:
      'ElevenLabs keeps a history of generated speech in your account unless you delete it or have its enterprise zero-retention mode.',
    advice:
      'Use a key limited to text to speech, with a credit limit; ElevenLabs lets you set both on a key.',
  },
  fish: {
    name: 'Fish Audio',
    price: '$15 per million bytes of text (s2.1-pro), as Fish Audio listed on 16 November 2026',
    keeps: 'Fish Audio’s developer pages do not say how long it keeps text or audio.',
    advice: 'Use a key made only for PEA, so you can delete it without affecting anything else.',
  },
};
export const validSpeechKey = (key) => typeof key === 'string' && keyShape.test(key);
export const validVoiceId = (id) => typeof id === 'string' && voiceShape.test(id);
const cleanName = (name) =>
  [...String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ')].slice(0, speechLimits.name).join('').trim();

// The provider and voice the owner last chose. No key is ever part of it.
export function speechChoice(value) {
  const provider = Object.hasOwn(speechProviders, value?.provider) ? value.provider : '';
  const voice = provider && validVoiceId(value?.voice) ? value.voice : '';
  return { provider, voice, name: voice ? cleanName(value?.name) || voice : '' };
}

// The voices a gateway listed, as [{ id, name }]. Anything else in the answer is dropped.
export function voiceRows(answer) {
  return (Array.isArray(answer?.voices) ? answer.voices : [])
    .filter((v) => validVoiceId(v?.id) && typeof v.name === 'string' && cleanName(v.name))
    .slice(0, speechLimits.voices)
    .map((v) => ({ id: v.id, name: cleanName(v.name) }));
}

// What may be sent for one read-aloud. Characters are counted the way the gateway counts them.
export function speechText(text) {
  const clean =
    typeof text === 'string' ? text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim() : '';
  const count = [...clean].length;
  if (!count) return { ok: false, count: 0, why: 'There is nothing to read aloud.' };
  if (count > speechLimits.text)
    return {
      ok: false,
      count,
      why: `This is ${count.toLocaleString('en-US')} characters, more than the ${speechLimits.text.toLocaleString('en-US')} a provider voice reads at once. Choose the short version, or switch to the device voice. Nothing was sent.`,
    };
  try {
    encodeURIComponent(clean); // a broken character pair cannot be sent
  } catch {
    return { ok: false, count, why: 'This text has a character that cannot be sent. Nothing was sent.' };
  }
  return { ok: true, count, text: clean };
}

const reasons = {
  key: 'rejected your key. Check it under Connections → Voice providers.',
  credit: 'says your key has no credit for this.',
  busy: 'is busy or limiting your key right now.',
  voice: 'did not accept this voice or this text. Choose the voice again.',
  failed: 'could not be reached or failed.',
};
// Why nothing was spoken, in PEA's own words. The provider's and the gateway's wording is not shown.
export function speechFailure(provider, status, reason) {
  const who = speechProviders[provider]?.name ?? 'The voice provider';
  const tail = ' Nothing was read aloud, and PEA did not switch to another voice.';
  if (status === 502 && Object.hasOwn(reasons, reason)) return `${who} ${reasons[reason]}` + tail;
  if (status === 401)
    return 'Your PEA gateway rejected its connection token. Reconnect under Local model.' + tail;
  if (status === 404)
    return 'This PEA gateway cannot use provider voices yet. Update PEA on the machine that runs it.' + tail;
  if (status === 429) return 'Another voice request is still running. Try again when it ends.' + tail;
  if (status === 400) return 'Your PEA gateway refused this text, key or voice as malformed.' + tail;
  return 'The provider voice did not answer.' + tail;
}

// The one review before a provider voice is used in a profile.
export function describeSpeechReview({ provider, voice, profile, origin }) {
  const p = speechProviders[provider];
  return [
    `Profile: ${profile}`,
    `Voice: ${voice} · ${p.name}`,
    '',
    `Each time you press Read aloud, the words of that reply go from this tab to your PEA gateway at ${origin}, and from there to ${p.name} with your key. Up to ${speechLimits.text.toLocaleString('en-US')} characters go at once; a longer reply is not sent.`,
    '',
    `Cost: ${p.name} bills your account for every character sent. ${p.price}. Check its current prices; PEA does not track your spending and sets no monthly cap.`,
    '',
    `Privacy: the words leave your machine. ${p.keeps} PEA cannot delete anything there. Replies can include what you shared with your model, such as calendar or mail details.`,
    '',
    `Your key stays in this tab’s memory and is sent only to your own gateway, which uses it for that one request and does not keep it. ${p.advice}`,
    '',
    'If the provider fails, PEA says why and reads nothing; it does not fall back to another voice. After you approve, later read-alouds in this tab and profile with this voice go without asking again.',
  ].join('\n');
}
