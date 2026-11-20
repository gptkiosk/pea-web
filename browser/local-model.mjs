import { ServiceError, consumeStream } from './connections.mjs';
import { readFailure } from './research.mjs';
import { speechFailure, speechLimits } from './speech.mjs';
// Same-origin gateway only: no arbitrary URL proxy, credential forwarding or cloud fallback.
export class LocalModel {
  constructor(origin = globalThis.location?.origin, transport = globalThis.fetch.bind(globalThis)) {
    const url = new URL(origin);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw new ServiceError('Use your own PEA gateway origin.');
    this.origin = url.origin;
    this.transport = transport;
  }
  async request(path, key, { body, signal, anyStatus = false } = {}) {
    if (
      ![
        '/v1/models',
        '/v1/chat/completions',
        '/v1/reminders',
        '/v1/read',
        '/v1/speak',
        '/v1/voices',
        '/v1/update',
        '/v1/projects',
      ].includes(path) ||
      typeof key !== 'string' ||
      !/^[A-Za-z0-9_-]{32,128}$/.test(key)
    )
      throw new ServiceError('Enter this server’s connection token.');
    const r = await this.transport(this.origin + path, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: signal ?? AbortSignal.timeout(45000),
    });
    if (!r.ok && !anyStatus) {
      const failure = new ServiceError(
        r.status === 401
          ? 'Local server token rejected.'
          : r.status === 429
            ? 'Local model is busy. No automatic retry.'
            : r.status === 404
              ? 'Run this web app with the PEA local-model gateway first.'
              : 'Local model unavailable. Refresh the model list; no cloud fallback.',
      );
      // Lets a caller tell "this token is wrong" from "the server is not answering".
      failure.rejected = r.status === 401;
      throw failure;
    }
    return r;
  }
  // Asks whether this server can show reminders as system notifications (only PEA for Mac can), or,
  // given a list, replaces the reminders it is holding with exactly that list.
  async reminders(key, list) {
    const r = await this.request('/v1/reminders', key, {
      body: list ? { reminders: list } : undefined,
      signal: AbortSignal.timeout(8000),
    });
    let answer = null;
    try {
      answer = JSON.parse((await r.text()).slice(0, 200));
    } catch {
      // Treated as not available below.
    }
    return {
      available: answer?.available === true,
      scheduled: Number.isInteger(answer?.scheduled) ? answer.scheduled : 0,
    };
  }
  // Asks this server to read one public page the owner has just approved. The answer is the page
  // as text, or the address the site pointed to instead (never followed here or by the server).
  // Refusals are told in PEA's own words; the server's and the site's wording is not shown.
  async read(key, url, signal) {
    const r = await this.request('/v1/read', key, {
      body: { url },
      signal: signal ?? AbortSignal.timeout(25000),
      anyStatus: true,
    });
    let answer = null;
    try {
      answer = await r.json();
    } catch {
      // Handled as a failed read below.
    }
    if (r.ok && answer?.outcome === 'page' && answer.url === url && typeof answer.text === 'string')
      return {
        outcome: 'page',
        type: answer.type === 'text/plain' ? 'text/plain' : 'text/html',
        text: answer.text,
      };
    if (r.ok && answer?.outcome === 'redirect' && answer.url === url && typeof answer.location === 'string')
      return { outcome: 'redirect', location: answer.location };
    throw new ServiceError(readFailure(r.ok ? 0 : r.status, answer?.status));
  }
  // Asks this server for the voices a provider key can use. `providerKey` goes only to this server.
  async voices(key, provider, providerKey) {
    const r = await this.request('/v1/voices', key, {
      body: { provider, key: providerKey },
      signal: AbortSignal.timeout(70000),
      anyStatus: true,
    });
    let answer = null;
    try {
      answer = JSON.parse((await r.text()).slice(0, 2000000));
    } catch {
      // Handled as a failure below.
    }
    if (r.ok && Array.isArray(answer?.voices)) return answer;
    throw new ServiceError(speechFailure(provider, r.ok ? 0 : r.status, answer?.reason));
  }
  // Asks this server to speak reviewed text with a provider voice. Resolves with the sound.
  async speak(key, { provider, key: providerKey, voice, text }, signal) {
    const r = await this.request('/v1/speak', key, {
      body: { provider, key: providerKey, voice, text },
      signal: signal ?? AbortSignal.timeout(70000),
      anyStatus: true,
    });
    if (r.ok && (r.headers.get('Content-Type') ?? '').split(';')[0] === 'audio/mpeg') {
      const data = await r.arrayBuffer();
      if (data.byteLength > 0 && data.byteLength <= speechLimits.audio) return data;
      throw new ServiceError(speechFailure(provider, 0));
    }
    let answer = null;
    try {
      answer = JSON.parse((await r.text()).slice(0, 2000));
    } catch {
      // Handled as a failure below.
    }
    throw new ServiceError(speechFailure(provider, r.ok ? 0 : r.status, answer?.reason));
  }
  // Asks this server about updating its own installed copy: with no body, whether it can and how
  // the last update went; otherwise to look for one or to install one exact commit.
  async update(key, body) {
    const r = await this.request('/v1/update', key, {
      body,
      signal: AbortSignal.timeout(body ? 90000 : 8000),
      anyStatus: true,
    });
    let answer = null;
    try {
      answer = JSON.parse((await r.text()).slice(0, 20000));
    } catch {
      // Left as null; the caller treats that as no usable answer.
    }
    return { status: r.status, body: answer };
  }
  // Asks this server about the owner's project engine: with no body, whether its operator
  // connected one; otherwise one of the five named requests the server passes on. The answer is
  // the engine's, as data.
  async projects(key, body) {
    const r = await this.request('/v1/projects', key, {
      body,
      signal: AbortSignal.timeout(body ? 30000 : 8000),
      anyStatus: true,
    });
    let answer = null;
    try {
      answer = JSON.parse((await r.text()).slice(0, 600000));
    } catch {
      // Left as null; the caller treats that as no usable answer.
    }
    return { status: r.status, body: answer };
  }
  async catalogue(key) {
    const r = await this.request('/v1/models', key),
      reader = r.body.getReader();
    let count = 0,
      text = '';
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        count += value.length;
        if (count > 500000) throw new ServiceError('Model list too large.');
        text += decoder.decode(value, { stream: true });
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    const rows = JSON.parse(text).data;
    if (!Array.isArray(rows)) throw new ServiceError('Invalid local model list.');
    const ids = [
      ...new Set(
        rows
          .map((m) => m.id)
          .filter((id) => typeof id === 'string' && /^[A-Za-z0-9._:/@+\-]{1,100}$/.test(id)),
      ),
    ].slice(0, 100);
    if (!ids.length) throw new ServiceError('Load a local model on your machine first.');
    return ids.map((id) => ({
      id: 'local:' + id,
      wireID: id,
      name: id,
      local: true,
      prompt: 0,
      completion: 0,
      request: 0,
    }));
  }
  async stream(key, body, onText, signal) {
    const { provider, ...localBody } = body;
    return consumeStream(
      await this.request('/v1/chat/completions', key, { body: localBody, signal }),
      onText,
    );
  }
}
