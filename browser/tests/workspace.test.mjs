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
  peekLines,
  resizeSplit,
  saveLayout,
  savedLayout,
  swapPanes,
  visiblePanes,
  addPane,
  capacityFor,
  movePane,
  pressChip,
  resizeThree,
  soloPane,
  threePaneWidth,
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

test('normalizing keeps at most three known, distinct workspaces and bounded widths', () => {
  assert.deepEqual(
    normalizeLayout({
      panes: ['today', 'today', 'vault', 'chat', 'greenhouse'],
      focus: 'greenhouse',
      ratio: 9,
    }),
    { panes: ['today', 'chat', 'greenhouse'], focus: 'greenhouse', ratio: 0.7, sizes: [0.3, 0.4, 0.3] },
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

const three = () => normalizeLayout({ panes: ['today', 'chat', 'greenhouse'], focus: 'chat' });

test('a window shows one, two or three workspaces by its width', () => {
  assert.equal(capacityFor(threePaneWidth), 3);
  assert.equal(capacityFor(threePaneWidth - 1), 2);
  assert.equal(capacityFor(minimumSplitWidth), 2);
  assert.equal(capacityFor(minimumSplitWidth - 1), 1);
  assert.deepEqual(visiblePanes(three(), threePaneWidth), ['today', 'chat', 'greenhouse']);
  // Room for two of three: the focused one keeps a neighbour, in the saved order.
  assert.deepEqual(visiblePanes(three(), minimumSplitWidth), ['today', 'chat']);
  assert.deepEqual(visiblePanes({ ...three(), focus: 'today' }, minimumSplitWidth), ['today', 'chat']);
  assert.deepEqual(visiblePanes({ ...three(), focus: 'greenhouse' }, minimumSplitWidth), [
    'chat',
    'greenhouse',
  ]);
  assert.deepEqual(visiblePanes(three(), 400), ['chat']);
});

test('a chip brings its workspace in, then focuses it, then tucks it up', () => {
  let layout = initialLayout();
  layout = pressChip(layout, 'chat', 3);
  assert.deepEqual(layout.panes, ['chat'], 'the only open workspace stays');
  layout = pressChip(layout, 'today', 3);
  assert.deepEqual([layout.panes, layout.focus], [['chat', 'today'], 'today'], 'opened beside and focused');
  layout = pressChip(layout, 'chat', 3);
  assert.deepEqual([layout.panes, layout.focus], [['chat', 'today'], 'chat'], 'an open one is focused first');
  layout = pressChip(layout, 'greenhouse', 3);
  assert.deepEqual(
    [layout.panes, layout.focus],
    [['chat', 'greenhouse', 'today'], 'greenhouse'],
    'beside the focused one',
  );
  assert.deepEqual(layout.sizes, [0.3, 0.4, 0.3]);
  layout = pressChip(layout, 'greenhouse', 3);
  assert.deepEqual([layout.panes, layout.focus], [['chat', 'today'], 'chat'], 'the focused one is tucked up');
  assert.equal('sizes' in layout, false, 'two panes go back to one divider');
  assert.deepEqual(pressChip(layout, 'vault', 3), layout);
});

test('with no room left a new workspace takes the place of the pane furthest from the focus', () => {
  const pair = normalizeLayout({ panes: ['chat', 'today'], focus: 'chat' });
  assert.deepEqual(addPane(pair, 'greenhouse', 2).panes, ['chat', 'greenhouse']);
  assert.deepEqual(addPane({ ...pair, focus: 'today' }, 'greenhouse', 2).panes, ['greenhouse', 'today']);
  assert.deepEqual(
    addPane(pair, 'greenhouse', 1).panes,
    ['greenhouse', 'today'],
    'one at a time swaps the focused one',
  );
  assert.equal(addPane(pair, 'greenhouse', 2).focus, 'greenhouse');
  assert.deepEqual(soloPane(three(), 'today'), { panes: ['today'], focus: 'today', ratio: 0.5 });
  // Closing one of three keeps the focus where it was.
  assert.deepEqual(closePane(three(), 'today'), { panes: ['chat', 'greenhouse'], focus: 'chat', ratio: 0.5 });
  assert.equal(closePane(three(), 'chat').focus, 'today');
});

test('a pane moves one place at a time and takes its width with it', () => {
  const start = normalizeLayout({
    panes: ['today', 'chat', 'greenhouse'],
    focus: 'chat',
    sizes: [0.2, 0.5, 0.3],
  });
  const moved = movePane(start, 'today', 1);
  assert.deepEqual(
    [moved.panes, moved.sizes],
    [
      ['chat', 'today', 'greenhouse'],
      [0.5, 0.2, 0.3],
    ],
  );
  assert.deepEqual(movePane(start, 'today', -1), start, 'nothing is left of the first pane');
  assert.deepEqual(movePane(start, 'greenhouse', 1), start);
  const pair = normalizeLayout({ panes: ['chat', 'today'], focus: 'chat', ratio: 0.6 });
  assert.deepEqual(movePane(pair, 'chat', 1), { panes: ['today', 'chat'], focus: 'chat', ratio: 0.4 });
});

test('with three panes a divider changes only the two panes beside it, within limits', () => {
  const start = three();
  assert.deepEqual(resizeThree(start, 0, 0.4).sizes, [0.4, 0.3, 0.3]);
  assert.deepEqual(resizeThree(start, 1, 0.8).sizes, [0.3, 0.5, 0.2]);
  assert.deepEqual(resizeThree(start, 0, 0).sizes, [0.18, 0.52, 0.3], 'no pane is thinner than the limit');
  assert.deepEqual(resizeThree(start, 0, 1).sizes, [0.52, 0.18, 0.3]);
  assert.deepEqual(resizeThree(start, 1, 0).sizes, [0.3, 0.18, 0.52]);
  assert.deepEqual(resizeThree(start, 2, 0.5), start);
  assert.deepEqual(resizeThree(start, 0, Number.NaN), start);
  assert.deepEqual(resizeThree(initialLayout(), 0, 0.5), initialLayout(), 'one pane has nothing to resize');
  // Damaged widths fall back to even shares, and nothing but names and widths is kept.
  assert.deepEqual(normalizeLayout({ ...start, sizes: [9, -1, 'x'] }).sizes, [0.3, 0.4, 0.3]);
  assert.deepEqual(normalizeLayout({ ...start, sizes: [0.9, 0.05, 0.05] }).sizes, [0.3, 0.4, 0.3]);
  assert.deepEqual(
    normalizeLayout({ ...start, sizes: [2, 5, 3] }).sizes,
    [0.2, 0.5, 0.3],
    'shares are scaled to add up to one',
  );
  const saved = [];
  saveLayout({ ...start, note: 'private' }, { setItem: (k, v) => saved.push(v) });
  assert.deepEqual(Object.keys(JSON.parse(saved[0])).sort(), ['focus', 'panes', 'ratio', 'sizes']);
});

test('a peek is a few short single lines, and the rest is only counted', () => {
  assert.deepEqual(peekLines(['  One\n line  ', '', null, 7, 'Two']), ['One line', 'Two']);
  const long = peekLines(['x'.repeat(300)])[0];
  assert.equal(long.length, 96);
  assert.ok(long.endsWith('…'));
  assert.deepEqual(peekLines(['a', 'b', 'c', 'd']), ['a', 'b', 'c', 'd']);
  assert.deepEqual(peekLines(['a', 'b', 'c', 'd', 'e', 'f']), ['a', 'b', 'c', 'and 3 more']);
  assert.deepEqual(peekLines(['a', 'b', 'c'], { limit: 2, length: 10 }), ['a', 'and 2 more']);
  assert.deepEqual(peekLines('not a list'), []);
  assert.deepEqual(peekLines(undefined), []);
});

test('each profile keeps its own arrangement, and Personal keeps the one saved before', () => {
  const storage = store();
  const mine = resizeSplit(openBeside(initialLayout(), 'today'), 0.6);
  const works = openWorkspace(initialLayout(), 'greenhouse');
  assert.equal(savedLayout(storage, 'work'), null, 'nothing saved yet');
  assert.equal(saveLayout(mine, storage), true);
  assert.equal(saveLayout(works, storage, 'work'), true);
  assert.deepEqual(Object.keys(storage.data).sort(), ['pea-workspace-v1', 'pea-workspace-v1:work']);
  assert.deepEqual(loadLayout(storage), mine);
  assert.deepEqual(loadLayout(storage, 'personal'), mine, 'Personal is the first key');
  assert.deepEqual(loadLayout(storage, 'work'), works);
  assert.deepEqual(savedLayout(storage, 'work'), works);
  assert.equal(savedLayout(storage, 'blended'), null);
  assert.deepEqual(loadLayout(storage, 'blended'), initialLayout());
  // A name that is not a profile cannot make a key of its own.
  assert.equal(saveLayout(works, storage, 'vault:../x'), true);
  assert.deepEqual(Object.keys(storage.data).sort(), ['pea-workspace-v1', 'pea-workspace-v1:work']);
  assert.deepEqual(loadLayout(storage), works);
  assert.equal(savedLayout(store({ 'pea-workspace-v1:work': '{not json' }), 'work'), null);
  assert.equal(
    savedLayout(
      {
        getItem() {
          throw new Error('refused');
        },
      },
      'work',
    ),
    null,
  );
});
