// The kept connection token: only a token-shaped value is ever stored or read back.
// Run with: node --test browser/tests/local-token.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { forgetLocalToken, loadLocalToken, saveLocalToken, validLocalToken } from '../local-token.mjs';
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
