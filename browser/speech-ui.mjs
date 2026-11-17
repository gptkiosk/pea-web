// Provider voices in Connections → Voice providers, and reading a reply aloud with one.
// The key lives in this tab's memory only. The first read-aloud with a voice in a profile is
// reviewed; a failure is explained and nothing else is read in its place.
import {
  describeSpeechReview,
  speechChoice,
  speechFailure,
  speechProviders,
  speechText,
  validSpeechKey,
  validVoiceId,
  voiceRows,
} from './speech.mjs';

const $ = (id) => document.getElementById(id);
const storageKey = 'pea-provider-voice-v1';

export function installSpeech({ voices, speak, localKey, profile, review, notice }) {
  let choice = speechChoice(null),
    key = '',
    listed = [],
    working = false,
    generation = 0,
    stopper = null,
    playing = null;
  const approved = new Set();
  try {
    choice = speechChoice(JSON.parse(globalThis.localStorage.getItem(storageKey) || 'null'));
  } catch {
    // Nothing usable was saved; the device voice is used.
  }
  const store = () => {
    try {
      if (choice.provider) globalThis.localStorage.setItem(storageKey, JSON.stringify(choice));
      else globalThis.localStorage.removeItem(storageKey);
    } catch {
      // Private browsing may refuse storage; the choice then lasts for this tab.
    }
  };
  const say = (text) => ($('provider-voice-note').textContent = text);
  const state = (value) => ($('provider-voice-note').dataset.state = value);
  const name = () => speechProviders[choice.provider]?.name ?? '';
  const ready = () => Boolean(choice.provider && choice.voice && validSpeechKey(key) && localKey());

  function render() {
    const on = Boolean(choice.provider);
    $('provider-voice').value = choice.provider;
    for (const id of [
      'provider-voice-key-row',
      'provider-voice-load',
      'provider-voice-pick',
      'provider-voice-test',
    ])
      $(id).hidden = !on;
    $('provider-voice-forget').hidden = !on && !key;
    $('provider-voice-load').disabled = $('provider-voice-test').disabled = working;
    const select = $('provider-voice-choice'),
      rows = listed.some((v) => v.id === choice.voice)
        ? listed
        : choice.voice
          ? [{ id: choice.voice, name: choice.name }, ...listed]
          : listed;
    select.replaceChildren(
      new Option(rows.length ? 'Choose a voice' : 'Load voices, or enter a voice ID below', ''),
      ...rows.map((v) => new Option(v.name, v.id)),
    );
    select.value = choice.voice;
    $('provider-voice-status').textContent = !on
      ? 'Reading aloud uses your browser or device voice. No provider is contacted.'
      : !localKey()
        ? `${name()} needs your PEA gateway. Connect it under Local model first; a provider voice cannot be used without it.`
        : !validSpeechKey(key)
          ? `Paste your ${name()} key to use this voice. It is kept in this tab only and is asked for again after a reload.`
          : !choice.voice
            ? 'Load your voices and choose one.'
            : `Read aloud uses ${choice.name} from ${name()}. Each read-aloud is billed to your ${name()} account.`;
  }
  function changed() {
    approved.clear();
    stop();
    store();
    render();
  }

  // Stops a request that is on its way and any speech that is playing.
  function stop() {
    generation++;
    stopper?.abort();
    stopper = null;
    if (playing) {
      const { source, context } = playing;
      playing = null;
      try {
        source.onended = null;
        source.stop();
      } catch {
        // It had not started or had already ended.
      }
      context.close().catch(() => {});
    }
    state('idle');
  }

  // Reads `text` with the chosen provider voice. Resolves true if speech started.
  async function read(text, { test = false } = {}) {
    stop();
    if (!ready()) {
      notice(
        'The provider voice is not ready: it needs your PEA gateway, your key and a chosen voice. Nothing was read aloud.',
      );
      return false;
    }
    const plan = speechText(text);
    if (!plan.ok) {
      notice(plan.why);
      return false;
    }
    const who = profile(),
      provider = choice.provider,
      voice = choice.voice,
      ticket = `${who}|${provider}|${voice}`,
      mine = ++generation;
    if (!approved.has(ticket)) {
      const ok = await review(
        `Read aloud with ${name()}?`,
        describeSpeechReview({ provider, voice: choice.name, profile: who, origin: location.origin }) +
          (test ? '\n\nThis first try reads one short greeting.' : ''),
      );
      if (
        !ok ||
        mine !== generation ||
        who !== profile() ||
        provider !== choice.provider ||
        voice !== choice.voice
      )
        return false;
      approved.add(ticket);
    }
    stopper = new AbortController();
    const signal = stopper.signal;
    state('asking');
    say(`Asking ${name()} for speech…`);
    let data;
    try {
      data = await speak(localKey(), { provider, key, voice, text: plan.text }, signal);
    } catch (error) {
      if (mine !== generation) return false;
      state('idle');
      const why = signal.aborted ? 'Stopped. Nothing was read aloud.' : error.message;
      say(why);
      notice(why);
      return false;
    }
    if (mine !== generation) return false;
    try {
      const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext,
        context = new Context(),
        source = context.createBufferSource();
      playing = { source, context };
      source.buffer = await context.decodeAudioData(data);
      if (mine !== generation) return false;
      source.connect(context.destination);
      source.onended = () => {
        if (playing?.source !== source) return;
        playing = null;
        context.close().catch(() => {});
        state('idle');
        say(`Finished reading with ${choice.name}.`);
      };
      // A browser may hold sound back until the page has been clicked. Waiting on it forever would
      // leave PEA saying it is reading while nothing is heard.
      await Promise.race([context.resume(), new Promise((resolve) => setTimeout(resolve, 2500))]);
      if (mine !== generation) return false;
      if (context.state !== 'running') throw new Error('held');
      source.start();
    } catch {
      if (mine !== generation) return false;
      stop();
      const why = `${name()} answered, but this browser did not play it: the sound was not playable, or the browser is holding sound back until you click the page. Nothing was read aloud, and the request may still have been billed.`;
      say(why);
      notice(why);
      return false;
    }
    state('playing');
    say(`Reading with ${choice.name} from ${name()}. Stop ends playback.`);
    notice(`Reading with ${choice.name} from ${name()}. Stop ends playback.`);
    return true;
  }

  $('provider-voice').onchange = () => {
    const provider = $('provider-voice').value;
    if (provider === choice.provider) return;
    // A key belongs to one provider; it is never carried over to another.
    key = '';
    listed = [];
    $('provider-voice-key').value = '';
    $('provider-voice-id').value = '';
    choice = speechChoice({ provider });
    changed();
    say('');
  };
  $('provider-voice-key').onchange = () => {
    const typed = $('provider-voice-key').value.trim();
    key = validSpeechKey(typed) ? typed : '';
    listed = [];
    approved.clear();
    render();
    say(typed && !key ? 'That does not look like a provider key. Nothing was sent.' : '');
  };
  $('provider-voice-load').onclick = async () => {
    if (working) return;
    $('provider-voice-key').onchange();
    if (!localKey()) return say('Connect your PEA gateway under Local model first.');
    if (!key) return say(`Paste your ${name()} key first.`);
    const provider = choice.provider;
    working = true;
    render();
    say(`Asking ${name()} for your voices…`);
    try {
      const rows = voiceRows(await voices(localKey(), provider, key));
      if (provider !== choice.provider) return;
      listed = rows;
      say(
        rows.length
          ? `${rows.length} ${rows.length === 1 ? 'voice' : 'voices'} listed. Listing costs nothing; reading aloud does.`
          : `${name()} listed no voices for this key. You can enter a voice ID below.`,
      );
    } catch (error) {
      if (provider === choice.provider) say(error.message);
    } finally {
      working = false;
      render();
    }
  };
  $('provider-voice-choice').onchange = () => {
    const id = $('provider-voice-choice').value,
      row = listed.find((v) => v.id === id);
    choice = speechChoice({ provider: choice.provider, voice: id, name: row?.name });
    $('provider-voice-id').value = '';
    changed();
    say(id ? `Voice set to ${choice.name}.` : '');
  };
  $('provider-voice-id').onchange = () => {
    const id = $('provider-voice-id').value.trim();
    if (!id) return;
    if (!validVoiceId(id)) return say('A voice ID is 8 to 64 letters and digits. Nothing was changed.');
    choice = speechChoice({ provider: choice.provider, voice: id, name: 'Voice ' + id.slice(0, 8) });
    changed();
    say(`Voice set to the ID you entered.`);
  };
  $('provider-voice-test').onclick = () => {
    $('provider-voice-key').onchange();
    void read('Hello! Ready when you are.', { test: true });
  };
  $('provider-voice-forget').onclick = () => {
    key = '';
    listed = [];
    $('provider-voice-key').value = '';
    $('provider-voice-id').value = '';
    choice = speechChoice(null);
    changed();
    say('Provider voice turned off and the key forgotten in this tab. Reading aloud uses the device voice.');
  };

  state('idle');
  render();
  return {
    render,
    read,
    stop,
    // Whether Read aloud should go to a provider. A provider that is chosen but not ready still
    // counts, so PEA says what is missing instead of quietly using another voice.
    chosen: () => Boolean(choice.provider),
  };
}
