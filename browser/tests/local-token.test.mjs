// The kept connection token: only a token-shaped value is ever stored or read back.
// Run with: node --test browser/tests/local-token.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  forgetLocalToken,
  forgetTabKey,
  loadLocalToken,
  loadTabKey,
  saveLocalToken,
  saveTabKey,
  validLocalToken,
  validRouterKey,
} from '../local-token.mjs';
import { LocalModel } from '../local-model.mjs';

const store = (start = {}) => {
  const data = new Map(Object.entries(start));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => void data.set(key, String(value)),
    removeItem: (key) => void data.delete(key),
  };
};
const refusing = {
  getItem() {
    throw new Error('blocked');
  },
  setItem() {
    throw new Error('blocked');
  },
  removeItem() {
    throw new Error('blocked');
  },
};
const token = 'synthetic-token-'.repeat(3);

test('a token is kept under its own name, read back and forgotten', () => {
  const storage = store();
  assert.equal(loadLocalToken(storage), '');
  assert.equal(saveLocalToken(token, storage), true);
  assert.deepEqual([...storage.data.keys()], ['pea-local-token-v1']);
  assert.equal(loadLocalToken(storage), token);
  forgetLocalToken(storage);
  assert.equal(storage.data.size, 0);
  assert.equal(loadLocalToken(storage), '');
});

test('only a value shaped like the gateway token is stored or returned', () => {
  for (const bad of [
    '',
    'short',
    'x'.repeat(129),
    'has spaces '.repeat(4),
    'sk-or-v1-' + 'a.b'.repeat(12),
    7,
    null,
  ])
    assert.equal(validLocalToken(bad), false, String(bad));
  assert.equal(validLocalToken('a'.repeat(32)), true);
  assert.equal(validLocalToken('A_-9'.repeat(32)), true);
  const storage = store();
  assert.equal(saveLocalToken('not a token', storage), false);
  assert.equal(storage.data.size, 0);
  assert.equal(loadLocalToken(store({ 'pea-local-token-v1': '<script>alert(1)</script>' })), '');
});

test('a browser that refuses storage keeps nothing and breaks nothing', () => {
  assert.equal(loadLocalToken(refusing), '');
  assert.equal(saveLocalToken(token, refusing), false);
  assert.doesNotThrow(() => forgetLocalToken(refusing));
});

test('a refused token is told apart from a server that is not answering', async () => {
  const answer = (status) =>
    new LocalModel('http://127.0.0.1:18770', async () => new Response('{}', { status }));
  await assert.rejects(answer(401).catalogue(token), (error) => error.rejected === true);
  await assert.rejects(answer(503).catalogue(token), (error) => error.rejected === false);
  await assert.rejects(answer(404).catalogue(token), (error) => error.rejected === false);
});

test('the OpenRouter key kept for a tab is per profile, key-shaped only, and forgotten on request', () => {
  const key = 'sk-or-v1-' + 'syntheticSYNTHETIC'.repeat(2),
    other = 'sk-or-v1-' + 'otherOTHER'.repeat(3);
  const storage = store();
  assert.equal(loadTabKey('personal', storage), '');
  assert.equal(saveTabKey('personal', key, storage), true);
  assert.deepEqual([...storage.data.keys()], ['pea-router-tab-v1:personal']);
  assert.equal(loadTabKey('personal', storage), key);
  assert.equal(loadTabKey('work', storage), '', 'the other profile has none');
  assert.equal(saveTabKey('work', other, storage), true);
  forgetTabKey('personal', storage);
  assert.equal(loadTabKey('personal', storage), '');
  assert.equal(loadTabKey('work', storage), other, 'forgetting one leaves the other');

  for (const bad of ['', 'sk-or-v1-short', 'sk-or-v1-' + 'a b'.repeat(12), 'x'.repeat(40), token, 7, null])
    assert.equal(validRouterKey(bad), false, String(bad));
  const empty = store();
  assert.equal(saveTabKey('personal', 'not a key', empty), false);
  assert.equal(saveTabKey('../personal', key, empty), false, 'only a profile name');
  assert.equal(saveTabKey('', key, empty), false);
  assert.equal(empty.data.size, 0);
  assert.equal(loadTabKey('personal', store({ 'pea-router-tab-v1:personal': '<script>alert(1)</script>' })), '');

  assert.equal(saveTabKey('personal', key, refusing), false);
  assert.equal(loadTabKey('personal', refusing), '');
  assert.doesNotThrow(() => forgetTabKey('personal', refusing));
  assert.equal(saveTabKey('personal', key, undefined), false, 'no storage at all');
});
