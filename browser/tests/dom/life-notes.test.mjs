// Browser-level checks for the notes PEA keeps on what the owner tells her: off until chosen,
// only the owner's own sentences, shown and removable, recalled in a later conversation, named in
// the review, and sealed in the encrypted library across a reload.
// Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { askModel, browserSkipReason, openConnectedPage, startStack } from './harness.mjs';

const skip = browserSkipReason();
const passphrase = 'synthetic test passphrase';
const sentence = 'My sister Ana is visiting from Porto on Friday.';
let stack;
before(
  async () => {
    if (!skip)
      stack = await startStack(() => 'I’m so glad my own sister is visiting too. I have a plan already.');
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

const notes = (page) =>
  page.evaluate(`[...document.querySelectorAll('#notes-list article p')].map((p) => p.textContent)`);
const approve = async (page, what) => {
  await page.waitFor(`document.getElementById('review').open`, what);
  const shown = await page.text('#review-body');
  await page.click('#review-approve');
  await page.waitFor(`!document.getElementById('review').open`, what + ' to close');
  return shown;
};
async function freshChat(page) {
  await page.evaluate(`document.getElementById('library-new-chat').click()`);
  await approve(page, 'the new chat review');
  await page.waitFor(`!document.querySelector('#messages .utterance')`, 'an empty chat');
}
async function unlock(page) {
  await page.waitFor(`!document.getElementById('library-storage').disabled`, 'the library to be ready');
  await page.evaluate(`document.getElementById('library-storage').click()`);
  await page.waitFor(`document.getElementById('library-unlock').open`, 'the passphrase dialog');
  await page.fill('#library-passphrase', passphrase);
  await page.evaluate(`document.getElementById('library-unlock-submit').click()`);
  await page.waitFor(
    `document.getElementById('review').open || !document.getElementById('library-unlock').open`,
    'the review or the unlock',
    20000,
  );
  if (await page.evaluate(`document.getElementById('review').open`)) await page.click('#review-approve');
  await page.waitFor(`!document.getElementById('library-unlock').open`, 'the library to unlock', 20000);
  await page.waitFor(
    `document.getElementById('memory-status').textContent === 'Encrypted saving · unlocked'`,
    'the library to settle',
    20000,
  );
}
const stored = (page) =>
  page.evaluate(`new Promise((resolve) => {
    const open = indexedDB.open('pea-conversation-library-v1');
    open.onsuccess = () => {
      const rows = open.result.transaction('encrypted').objectStore('encrypted').getAll();
      rows.onsuccess = () => {
        let text = '';
        for (const row of rows.result)
          for (const part of Object.values(row))
            text += part instanceof ArrayBuffer || ArrayBuffer.isView(part) ? new TextDecoder('latin1').decode(part) : String(part);
        open.result.close();
        resolve(text);
      };
    };
  })`);

test(
  'PEA keeps the owner’s own sentences only when asked, recalls them in a later conversation, and forgets them on request',
  { skip, timeout: 120000 },
  async () => {
    const page = await openConnectedPage(stack);
    const system = () => stack.model.requests.at(-1).messages[0].content;
    const status = () => page.evaluate(`document.getElementById('notes-status').textContent`);

    // Off until chosen: nothing is kept.
    assert.equal(await page.evaluate(`document.getElementById('notes-keep').checked`), false);
    await askModel(stack, page, 'I started pottery classes in March. Any tips?');
    assert.deepEqual(await notes(page), []);
    assert.equal(await status(), 'Off. Nothing is kept.');

    // Turning it on is a review that says what is kept, for how long and where it goes.
    await page.evaluate(`document.getElementById('notes-keep').click()`);
    const terms = await approve(page, 'the notes review');
    assert.match(terms, /your own sentences from Chat in the personal profile/);
    assert.match(terms, /no model chooses or writes them, and nothing a model says is kept/);
    assert.match(terms, /kept for 60 days, up to 60 at a time/);
    assert.match(terms, /otherwise in this tab only/);
    await page.waitFor(`document.getElementById('notes-keep').checked`, 'the switch to be on');
    assert.equal(JSON.parse(await page.evaluate(`localStorage.getItem('pea-life-notes-v1')`)).personal, true);
    assert.deepEqual(await notes(page), [], 'what was said before the switch is not gone back over');

    // Her own sentence is kept; the question, and everything the model said, is not.
    await askModel(stack, page, sentence + ' What should I cook?');
    await page.waitFor(`document.querySelectorAll('#notes-list article').length === 1`, 'the note');
    assert.deepEqual(await notes(page), [sentence]);
    assert.match(await status(), /^1 of up to 60 kept for this profile, saved on this browser/);
    assert.ok(!system().includes('Things this person told you'), 'not repeated into the same conversation');

    // A later conversation is given it, and the review before sharing lists it.
    await freshChat(page);
    await page.fill('#thought', 'Any ideas for dinner on Friday?');
    await page.evaluate(`document.querySelector('#composer').requestSubmit()`);
    const shown = await approve(page, 'the sharing review');
    assert.ok(shown.includes('Things you told her that she kept (your own words'), 'named in the review');
    assert.ok(shown.includes(sentence), 'with the exact words');
    await page.waitFor(
      `document.querySelectorAll('#messages .utterance.assistant').length === 1 && !document.querySelector('#profile').disabled`,
      'the reply',
    );
    assert.match(system(), /Things this person told you in earlier conversations, in their own words/);
    assert.ok(system().includes(`“${sentence}”`));
    assert.match(system(), /never claim to remember anything that is not written here/);
    // The honesty rule is unchanged and still sent.
    assert.match(system(), /If you are sincerely asked whether you are a human or an AI, say plainly/);

    // Work is a separate profile: it has no notes and is given none.
    await page.fill('#profile', 'work');
    await page.waitFor(`!document.getElementById('notes-keep').checked`, 'Work, with the switch off');
    assert.deepEqual(await notes(page), []);
    await page.fill('#profile', 'personal');
    await page.waitFor(`document.querySelectorAll('#notes-list article').length === 1`, 'her note again');

    // Sealed in the encrypted library: unreadable at rest, and back after a reload and unlock.
    await unlock(page);
    assert.match(await status(), /^1 of up to 60 kept for this profile, saved on this browser\.$/);
    assert.ok(!(await stored(page)).includes('Ana is visiting'), 'not readable in this browser’s storage');
    await page.goto(stack.gateway.origin + '/');
    await page.waitFor(`!document.getElementById('library-storage').disabled`, 'the library to be ready');
    assert.deepEqual(await notes(page), [], 'locked after a reload');
    await unlock(page);
    await page.waitFor(`document.querySelectorAll('#notes-list article').length === 1`, 'the note back');
    assert.deepEqual(await notes(page), [sentence]);
    assert.equal(await page.evaluate(`document.getElementById('notes-keep').checked`), true);

    // Forgetting it removes it for good.
    await page.evaluate(`document.querySelector('#notes-list article button').click()`);
    await page.waitFor(`!document.querySelector('#notes-list article')`, 'the note to go');
    await page.waitFor(
      `document.getElementById('memory-status').textContent === 'Encrypted saving · unlocked'`,
      'the save',
    );
    await page.goto(stack.gateway.origin + '/');
    await unlock(page);
    assert.deepEqual(await notes(page), []);
    assert.deepEqual(page.outsideRequests(), []);
    await page.close();
  },
);
