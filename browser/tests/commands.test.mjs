import test from 'node:test';
import assert from 'node:assert/strict';
import { commandList, matchCommands, shortcutFor, shortcutLabel, shortcuts } from '../commands.mjs';

const key = (key, extra = {}) => ({ key, code: '', ...extra });
const ids = (list) => list.map((command) => command.id);

test('the list offers only things the owner could click, and fits what is on screen', () => {
  const single = commandList({ panes: ['chat'], focus: 'chat', wide: true, profile: 'personal' });
  assert(ids(single).includes('go-today'));
  assert(ids(single).includes('beside-today') && ids(single).includes('beside-greenhouse'));
  assert.equal(ids(single).includes('beside-chat'), false, 'a workspace cannot open beside itself');
  assert.equal(ids(single).includes('swap'), false);
  assert.equal(ids(single).includes('profile-personal'), false, 'the active profile is not offered');
  assert(ids(single).includes('profile-work') && ids(single).includes('profile-blended'));

  const split = commandList({ panes: ['chat', 'today'], focus: 'chat', wide: true, profile: 'work' });
  assert(ids(split).includes('swap'));
  assert.equal(ids(split).includes('beside-today'), false, 'already beside');
  assert(ids(split).includes('beside-greenhouse'));
  assert.equal(split.find((command) => command.id === 'split').title, 'Return to one workspace');

  const narrow = commandList({ panes: ['chat'], focus: 'chat', wide: false, profile: 'personal' });
  assert.equal(
    ids(narrow).some((id) => id.startsWith('beside-') || id === 'split' || id === 'swap'),
    false,
    'a narrow screen has no split commands',
  );
  for (const command of [...single, ...split, ...narrow])
    assert.doesNotMatch(
      command.id,
      /approve|review|grant|send|create|delete/,
      'no command acts for the owner',
    );
});

test('while a request runs, changing profile or conversation is not offered', () => {
  const busy = commandList({ panes: ['chat'], focus: 'chat', wide: true, profile: 'personal', busy: true });
  assert.equal(
    ids(busy).some((id) => id === 'new-chat' || id.startsWith('profile-')),
    false,
  );
  assert(ids(busy).includes('go-today'));
});

test('matching needs every word, ranks title matches first and treats odd input as text', () => {
  const list = commandList({ panes: ['chat'], focus: 'chat', wide: true, profile: 'personal' });
  assert.deepEqual(matchCommands(list, ''), list);
  assert.deepEqual(matchCommands(list, '   '), list);
  assert.equal(matchCommands(list, 'today')[0].id, 'go-today');
  assert.equal(matchCommands(list, 'GO GREEN')[0].id, 'go-greenhouse');
  assert.equal(matchCommands(list, 'dark')[0].id, 'theme');
  assert.equal(matchCommands(list, 'microphone')[0].id, 'voice', 'keywords match too');
  assert.deepEqual(matchCommands(list, 'today zebra'), []);
  assert.deepEqual(matchCommands(list, '.*'), [], 'no pattern syntax');
  assert.deepEqual(matchCommands(list, null), list);
  assert.equal(matchCommands(list, 'beside today')[0].id, 'beside-today');
});

test('shortcuts use Command on a Mac and Control elsewhere, and never plain keys while typing', () => {
  assert.equal(shortcutFor(key('k', { metaKey: true }), { mac: true }), 'palette');
  assert.equal(shortcutFor(key('K', { ctrlKey: true }), { mac: false }), 'palette');
  assert.equal(shortcutFor(key('k', { ctrlKey: true }), { mac: true }), null);
  assert.equal(shortcutFor(key('k', { metaKey: true }), { mac: false }), null);
  assert.equal(shortcutFor(key('k', { metaKey: true }), { mac: true, typing: true }), 'palette');
  assert.equal(shortcutFor(key('\\', { metaKey: true }), { mac: true }), 'split');
  assert.equal(shortcutFor(key('Enter', { ctrlKey: true }), { mac: false, typing: true }), 'send');
  assert.equal(shortcutFor(key('Enter', { ctrlKey: true }), { mac: false, typing: false }), null);
  assert.equal(shortcutFor(key('Enter'), { typing: true }), null, 'plain Enter is left to the field');

  assert.equal(shortcutFor(key('/')), 'compose');
  assert.equal(shortcutFor(key('?')), 'help');
  assert.equal(shortcutFor(key('/'), { typing: true }), null);
  assert.equal(shortcutFor(key('?'), { typing: true }), null);
  assert.equal(shortcutFor(key('k')), null);
});

test('workspace shortcuts go by key position and avoid the browser tab shortcuts', () => {
  const digit = (n, extra) => ({ key: String(n), code: 'Digit' + n, ...extra });
  assert.equal(shortcutFor(digit(1, { ctrlKey: true }), { mac: true }), 'workspace-1');
  assert.equal(shortcutFor(digit(3, { ctrlKey: true }), { mac: true, typing: true }), 'workspace-3');
  assert.equal(shortcutFor(digit(2, { altKey: true }), { mac: false }), 'workspace-2');
  assert.equal(shortcutFor({ key: '™', code: 'Digit2', altKey: true }, { mac: false }), 'workspace-2');
  assert.equal(
    shortcutFor(digit(1, { metaKey: true }), { mac: true }),
    null,
    'Command+1 stays the browser tab',
  );
  assert.equal(
    shortcutFor(digit(1, { ctrlKey: true }), { mac: false }),
    null,
    'Control+1 stays the browser tab',
  );
  assert.equal(
    shortcutFor(digit(1, { altKey: true, ctrlKey: true }), { mac: false }),
    null,
    'AltGr is typing',
  );
  assert.equal(shortcutFor(digit(4, { altKey: true }), { mac: false }), null);
  assert.equal(shortcutFor(digit(1)), null);
});

test('held keys, text composition and missing events do nothing', () => {
  assert.equal(shortcutFor(key('k', { metaKey: true, repeat: true }), { mac: true }), null);
  assert.equal(shortcutFor(key('k', { metaKey: true, isComposing: true }), { mac: true }), null);
  assert.equal(shortcutFor(null), null);
  assert.equal(shortcutFor({}), null);
});

test('every shortcut has a label for both kinds of keyboard, and commands refer to real ones', () => {
  for (const shortcut of shortcuts) {
    assert(shortcut.does && shortcut.mac && shortcut.other);
    assert.equal(shortcutLabel(shortcut.name, true), shortcut.mac);
    assert.equal(shortcutLabel(shortcut.name, false), shortcut.other);
  }
  assert.equal(shortcutLabel('nothing', true), '');
  const list = commandList({ panes: ['chat', 'today'], focus: 'chat', wide: true, profile: 'personal' });
  for (const command of list)
    if (command.shortcut)
      assert(
        shortcuts.some((shortcut) => shortcut.name === command.shortcut),
        command.id,
      );
  assert.equal(new Set(ids(list)).size, list.length, 'command ids are unique');
});
