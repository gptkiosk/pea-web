import test from 'node:test';
import assert from 'node:assert/strict';
import {
  closePane,
  focusPane,
  initialLayout,
  loadLayout,
  minimumSplitWidth,
  normalizeLayout,
  openBeside,
  openWorkspace,
  partnerFor,
  resizeSplit,
  saveLayout,
  swapPanes,
  visiblePanes,
} from '../workspace.mjs';

const store = (initial = {}) => {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => (data[key] = String(value)),
  };
};

test('a layout starts as Chat alone and anything malformed falls back to that', () => {
  assert.deepEqual(initialLayout(), { panes: ['chat'], focus: 'chat', ratio: 0.5 });
  for (const bad of [null, 'chat', 7, {}, { panes: 'chat' }, { panes: [] }, { panes: ['settings', 7, null] }])
    assert.deepEqual(normalizeLayout(bad), initialLayout());
});

test('normalizing keeps at most two known, distinct workspaces and a bounded width', () => {
  assert.deepEqual(
    normalizeLayout({
      panes: ['today', 'today', 'vault', 'chat', 'greenhouse'],
      focus: 'greenhouse',
      ratio: 9,
    }),
    { panes: ['today', 'chat'], focus: 'today', ratio: 0.7 },
  );
  assert.equal(normalizeLayout({ panes: ['chat', 'today'], ratio: -1 }).ratio, 0.3);
  assert.equal(normalizeLayout({ panes: ['chat', 'today'], ratio: 'wide' }).ratio, 0.5);
  assert.equal(normalizeLayout({ panes: ['chat', 'today'], ratio: Number.NaN }).ratio, 0.5);
  assert.equal(
    Object.keys(
      normalizeLayout({ panes: ['chat'], focus: 'chat', ratio: 0.5, note: 'private text' }),
    ).includes('note'),
    false,
    'nothing but names and a width is kept',
  );
});

test('going to a workspace focuses it when shown and otherwise replaces the focused pane', () => {
  const single = openWorkspace(initialLayout(), 'today');
  assert.deepEqual(single, { panes: ['today'], focus: 'today', ratio: 0.5 });
  const split = openBeside(initialLayout(), 'today');
  assert.deepEqual(split, { panes: ['chat', 'today'], focus: 'chat', ratio: 0.5 });
  assert.deepEqual(openWorkspace(split, 'today').focus, 'today');
  assert.deepEqual(openWorkspace(split, 'today').panes, ['chat', 'today']);
  assert.deepEqual(openWorkspace(split, 'greenhouse'), {
    panes: ['greenhouse', 'today'],
    focus: 'greenhouse',
    ratio: 0.5,
  });
  assert.deepEqual(
    openWorkspace(split, 'https://example.invalid'),
    split,
    'unknown destinations change nothing',
  );
});

test('a workspace opens beside the focused one, which stays on the left', () => {
  const layout = openBeside(openWorkspace(initialLayout(), 'greenhouse'), 'chat');
  assert.deepEqual(layout.panes, ['greenhouse', 'chat']);
  assert.equal(layout.focus, 'greenhouse');
  assert.deepEqual(openBeside(layout, 'greenhouse'), layout, 'a workspace cannot sit beside itself');
  assert.deepEqual(openBeside(layout, 'today').panes, ['greenhouse', 'today']);
  assert.deepEqual(openBeside(layout, 'nowhere'), layout);
});

test('closing, focusing, swapping and resizing keep the layout valid', () => {
  const split = openBeside(initialLayout(), 'today');
  assert.deepEqual(closePane(split, 'chat'), { panes: ['today'], focus: 'today', ratio: 0.5 });
  assert.deepEqual(closePane(initialLayout(), 'chat'), initialLayout(), 'the last pane stays');
  assert.deepEqual(closePane(split, 'greenhouse'), split);
  assert.equal(focusPane(split, 'today').focus, 'today');
  assert.equal(focusPane(split, 'greenhouse').focus, 'chat');
  assert.deepEqual(swapPanes(split).panes, ['today', 'chat']);
  assert.deepEqual(swapPanes(initialLayout()), initialLayout());
  assert.equal(resizeSplit(split, 0.62349).ratio, 0.623);
  assert.equal(resizeSplit(split, 0.05).ratio, 0.3);
  assert.equal(resizeSplit(split, 0.99).ratio, 0.7);
});

test('the suggested partner is Today for Chat, Chat otherwise, or the other pane already shown', () => {
  assert.equal(partnerFor(initialLayout()), 'today');
  assert.equal(partnerFor(openWorkspace(initialLayout(), 'today')), 'chat');
  assert.equal(partnerFor(openWorkspace(initialLayout(), 'greenhouse')), 'chat');
  assert.equal(partnerFor(openBeside(initialLayout(), 'greenhouse')), 'greenhouse');
});

test('a narrow screen shows only the focused workspace and keeps the pair for later', () => {
  const split = focusPane(openBeside(initialLayout(), 'today'), 'today');
  assert.deepEqual(visiblePanes(split, minimumSplitWidth), ['chat', 'today']);
  assert.deepEqual(visiblePanes(split, minimumSplitWidth - 1), ['today']);
  assert.deepEqual(visiblePanes(split, 390), ['today']);
  assert.deepEqual(split.panes, ['chat', 'today']);
});

test('the saved layout round-trips, survives damage and never throws when storage is refused', () => {
  const storage = store();
  const split = resizeSplit(openBeside(initialLayout(), 'greenhouse'), 0.4);
  assert.equal(saveLayout(split, storage), true);
  assert.deepEqual(loadLayout(storage), split);
  assert.deepEqual(Object.keys(JSON.parse(storage.data['pea-workspace-v1'])).sort(), [
    'focus',
    'panes',
    'ratio',
  ]);
  assert.deepEqual(loadLayout(store({ 'pea-workspace-v1': '{not json' })), initialLayout());
  assert.deepEqual(loadLayout(store({ 'pea-workspace-v1': '{"panes":["vault"]}' })), initialLayout());
  const refused = {
    getItem() {
      throw new Error('refused');
    },
    setItem() {
      throw new Error('refused');
    },
  };
  assert.deepEqual(loadLayout(refused), initialLayout());
  assert.equal(saveLayout(split, refused), false);
});
