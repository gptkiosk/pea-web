// Browser-level stability checks: failures from the model, long use, full lists, large files and
// two tabs at once. After each one the app must still work, say plainly what happened, and have
// thrown no errors of its own.
// Run with: node --test browser/tests/dom/*.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { askModel, browserSkipReason, openConnectedPage, startStack } from './harness.mjs';

const skip = browserSkipReason();
const options = { skip, timeout: 120000 };
const emailBlock =
  '```pea-email\n' +
  JSON.stringify({
    op: 'email_draft',
    to: 'owner@example.invalid',
    subject: 'Synthetic',
    body: 'x'.repeat(400),
  }) +
  '\n```\n';

let stack;
before(
  async () => {
    if (!skip)
      stack = await startStack((said) => {
        if (said.includes('overloaded')) return { status: 500 };
        if (said.includes('busy')) return { status: 429 };
        if (said.includes('denied')) return { status: 401 };
        if (said.includes('interrupted'))
          return { text: 'Here is the draft so far. ' + emailBlock, cut: true };
        if (said.includes('slowly')) return { text: 'A slow synthetic reply.', delay: 4000 };
        return 'A plain synthetic reply.';
      });
  },
  { timeout: 60000 },
);
after(() => stack?.close(), { timeout: 30000 });

const idle = (page) =>
  page.waitFor(`!document.getElementById('profile').disabled`, 'the app to be idle again');
const noticed = (page, text) =>
  page.waitFor(
    `(window.peaNotices || []).some((n) => n.includes(${JSON.stringify(text)}))`,
    'notice: ' + text,
  );
const messages = (page) => page.evaluate(`document.querySelectorAll('#messages .utterance').length`);
// Sends without waiting for a reply, approving the sharing review if it appears.
async function send(page, text) {
  await page.fill('#thought', text);
  await page.evaluate(`document.getElementById('composer').requestSubmit()`);
  await page.evaluate(`new Promise((resolve) => setTimeout(resolve, 150))`);
  if (await page.evaluate(`document.getElementById('review').open`)) await page.click('#review-approve');
}

test('model errors are reported plainly, leak nothing, and leave the app usable', options, async () => {
  const page = await openConnectedPage(stack, { width: 1500 });
  await askModel(stack, page, 'Warm up.');
  // The gateway reports every failure of the owner's model server the same way, whatever it was,
  // so nothing about that server leaks to the page.
  for (const [word, expected] of [
    ['overloaded', 'Local model unavailable'],
    ['busy', 'Local model unavailable'],
    ['denied', 'Local model unavailable'],
  ]) {
    const before = stack.model.requests.length;
    const seen = await page.evaluate(
      `(window.peaNotices || []).filter((n) => n.includes('${expected}')).length`,
    );
    await send(page, `The model is ${word}.`);
    await page.waitFor(
      `(window.peaNotices || []).filter((n) => n.includes('${expected}')).length > ${seen}`,
      'a new notice for the ' + word + ' model',
    );
    await idle(page);
    assert.equal(stack.model.requests.length, before + 1, word + ': one attempt, never a retry');
  }
  assert.doesNotMatch(
    await page.text('body'),
    /SYNTHETIC UPSTREAM DETAIL/,
    'the upstream error text is never shown',
  );
  await askModel(stack, page, 'Still there?');
  assert.match(await page.text('#messages'), /A plain synthetic reply\./);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('a reply cut off mid-stream offers no action and does not leave the app stuck', options, async () => {
  const page = await openConnectedPage(stack, { width: 1500 });
  await send(page, 'This one gets interrupted.');
  await noticed(page, 'Connection ended before the reply completed.');
  await idle(page);
  assert.match(await page.text('#messages'), /Here is the draft so far\./, 'what arrived is kept');
  assert.doesNotMatch(
    await page.text('#messages'),
    /pea-email|email_draft/,
    'a half-received block stays hidden',
  );
  assert.equal(await page.hasText('Review email draft'), false, 'and is never offered for approval');
  await askModel(stack, page, 'And now?');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('Stop ends a slow request at once and the app carries on', options, async () => {
  const page = await openConnectedPage(stack, { width: 1500 });
  await send(page, 'Answer slowly please.');
  await page.waitFor(`document.getElementById('profile').disabled`, 'the request to be in progress');
  await page.evaluate(`document.getElementById('request-stop').click()`);
  await noticed(page, 'Stopped.');
  await idle(page);
  await page.evaluate(`new Promise((resolve) => setTimeout(resolve, 4500))`);
  assert.doesNotMatch(
    await page.text('#messages'),
    /A slow synthetic reply\./,
    'a stopped reply does not arrive later',
  );
  await askModel(stack, page, 'Carry on.');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('leaving the page during a request starts clean on return', options, async () => {
  const page = await openConnectedPage(stack, { width: 1500 });
  await send(page, 'Answer slowly please.');
  await page.waitFor(`document.getElementById('profile').disabled`, 'the request to be in progress');
  await page.goto(stack.gateway.origin + '/');
  await page.waitFor(
    `document.getElementById('local-connect').onclick && !document.getElementById('profile').disabled`,
    'a clean start',
  );
  assert.equal(await messages(page), 0);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('a long conversation stays bounded in what it sends and responsive in the page', options, async () => {
  const page = await openConnectedPage(stack, { width: 1500 });
  for (let turn = 1; turn <= 30; turn++) await askModel(stack, page, `Synthetic question number ${turn}.`);
  assert.equal(await messages(page), 60);
  const sent = stack.model.requests.at(-1).messages;
  assert(sent.length <= 14, 'only recent messages are sent: ' + sent.length);
  assert.doesNotMatch(
    JSON.stringify(sent),
    /Synthetic question number 3\./,
    'early messages are no longer sent',
  );
  const started = Date.now();
  await page.click('#tab-today');
  await page.click('#tab-chat');
  assert(Date.now() - started < 2000, 'switching workspace stays quick');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test(
  'a full story board and a full to-do list refuse more, with a reason, and keep working',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1500 });
    await page.click('#tab-today');
    // Added twenty at a time: each addition redraws the whole board, and on a slow machine one
    // command adding all four hundred took longer than the harness allows any single command.
    for (let from = 1; from <= 200; from += 20)
      await page.evaluate(
        `(() => {
        const story = document.getElementById('story-title'), board = document.getElementById('board-add');
        for (let i = ${from}; i < ${from} + 20; i++) { story.value = 'Synthetic story ' + i; board.requestSubmit(); }
        const todo = document.getElementById('todo-title'), list = document.getElementById('todo-add');
        for (let i = ${from}; i < ${from} + 20; i++) { todo.value = 'Synthetic to-do ' + i; list.requestSubmit(); }
      })()`,
      );
    const filled = await page.evaluate(
      `(() => {
      return {
        stories: document.querySelectorAll('#board-columns [data-story], #board-columns .story, #board-columns article').length,
        todos: document.querySelectorAll('#todo-list .todo-item').length,
      };
    })()`,
    );
    assert.equal(filled.todos, 200);
    assert.match(await page.text('#board-count'), /200/);

    await page.fill('#story-title', 'One story too many');
    await page.evaluate(`document.getElementById('board-add').requestSubmit()`);
    await noticed(page, 'Board limit: 200 stories');
    await page.fill('#todo-title', 'One to-do too many');
    await page.evaluate(`document.getElementById('todo-add').requestSubmit()`);
    await noticed(page, 'This list is full at 200 items.');
    assert.equal(await page.evaluate(`document.querySelectorAll('#todo-list .todo-item').length`), 200);

    await page.evaluate(`document.querySelector('#todo-list .todo-item input').click()`);
    await page.waitFor(
      `document.querySelectorAll('#todo-finished .todo-item').length === 1`,
      'checking one off still works',
    );
    assert.deepEqual(page.errors, []);
    await page.close();
  },
);

test(
  'a large file is accepted up to the limit and only a bounded excerpt is ever shared',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1500 });
    await page.evaluate(
      `(() => {
      const text = 'START-OF-SYNTHETIC-FILE ' + 'lorem ipsum '.repeat(330000) + ' END-OF-SYNTHETIC-FILE';
      const data = new DataTransfer();
      data.items.add(new File([text], 'large-synthetic.txt', { type: 'text/plain' }));
      window.largeSize = new Blob([text]).size;
      document.getElementById('chat').dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
    })()`,
    );
    await page.waitFor(
      `!document.getElementById('context-file').hidden`,
      'the large file to be attached',
      20000,
    );
    assert((await page.evaluate(`window.largeSize`)) > 3_900_000);
    await page.fill('#thought', 'Summarize it.');
    await page.evaluate(`document.getElementById('composer').requestSubmit()`);
    await page.waitFor(`document.getElementById('review').open`, 'the model sharing review');
    const shown = await page.text('#review-body');
    assert.match(shown, /START-OF-SYNTHETIC-FILE/);
    assert.doesNotMatch(shown, /END-OF-SYNTHETIC-FILE/, 'the end of a 4 MB file is far outside the excerpt');
    await page.click('#review-approve');
    await idle(page);
    const sent = JSON.stringify(stack.model.requests.at(-1));
    assert(sent.length < 40000, 'the request carries an excerpt, not the file: ' + sent.length);
    assert.doesNotMatch(sent, /END-OF-SYNTHETIC-FILE/);
    assert.deepEqual(page.errors, []);
    await page.close();
  },
);

test(
  'two tabs on one encrypted board: the second writer is stopped instead of overwriting',
  options,
  async () => {
    const first = await openConnectedPage(stack, { width: 1500 });
    const unlock = async (page) => {
      await page.click('#tab-today');
      await page.evaluate(`document.getElementById('tasks-section').open = true`);
      await page.click('#board-storage');
      await page.waitFor(`document.getElementById('board-unlock').open`, 'the passphrase dialog');
      await page.fill('#board-passphrase', 'synthetic board passphrase');
      await page.click('#board-unlock-submit');
      await page.waitFor(`!document.getElementById('board-unlock').open`, 'the board to unlock', 20000);
    };
    const addStory = async (page, title) => {
      await page.fill('#story-title', title);
      await page.evaluate(`document.getElementById('board-add').requestSubmit()`);
    };
    await unlock(first);
    await addStory(first, 'Synthetic story from tab one');
    await first.waitFor(
      `document.getElementById('board-storage-note').textContent.includes('saved')`,
      'the first save',
    );

    const second = await openConnectedPage(stack, { width: 1500, beside: first });
    await unlock(second);
    await second.waitFor(
      `document.getElementById('board-columns').textContent.includes('Synthetic story from tab one')`,
      'the second tab to load the saved board',
    );
    await addStory(second, 'Synthetic story from tab two');
    await second.waitFor(
      `document.getElementById('board-storage-note').textContent.includes('saved')`,
      'the second tab to save',
    );

    await addStory(first, 'A stale write from tab one');
    await noticed(first, 'Another tab changed this board.');
    assert.match(
      await first.text('#board-storage-note'),
      /changes in this tab are not saved/,
      'the stale tab says its change was not saved',
    );

    await second.goto(stack.gateway.origin + '/');
    await unlock(second);
    await second.waitFor(
      `document.getElementById('board-columns').textContent.includes('Synthetic story from tab two')`,
      'the saved board after reload',
    );
    assert.equal(
      await second.evaluate(
        `document.getElementById('board-columns').textContent.includes('A stale write from tab one')`,
      ),
      false,
      'the stale write never reached storage',
    );
    assert.deepEqual([...first.errors, ...second.errors], []);
    await second.close();
    await first.close();
  },
);

test(
  'an encrypted library survives a reload, refuses a wrong passphrase and never stores readable text',
  options,
  async () => {
    const page = await openConnectedPage(stack, { width: 1500 });
    await askModel(stack, page, 'SYNTHETIC PRIVATE QUESTION about tulips.');
    const openUnlock = async () => {
      // The button is disabled while the library starts up; a click then does nothing.
      await page.waitFor(`!document.getElementById('library-storage').disabled`, 'the library to be ready');
      await page.click('#library-storage');
      await page.waitFor(`document.getElementById('library-unlock').open`, 'the library passphrase dialog');
    };
    const submit = async (passphrase) => {
      await page.fill('#library-passphrase', passphrase);
      await page.click('#library-unlock-submit');
    };
    await openUnlock();
    await submit('synthetic library passphrase');
    await page.waitFor(
      `!document.getElementById('library-unlock').open`,
      'the library to be encrypted',
      20000,
    );
    await page.waitFor(
      `/encrypt|saved/i.test(document.getElementById('memory-status').textContent)`,
      'the saved status',
      20000,
    );

    const stored = await page.evaluate(
      `new Promise((resolve) => {
      indexedDB.databases().then((list) => {
        const names = list.map((d) => d.name);
        let text = '';
        let left = names.length;
        if (!left) resolve({ names, text });
        for (const name of names) {
          const open = indexedDB.open(name);
          open.onsuccess = () => {
            const db = open.result;
            const stores = [...db.objectStoreNames];
            if (!stores.length) { if (!--left) resolve({ names, text }); return; }
            const tx = db.transaction(stores);
            let pending = stores.length;
            for (const s of stores) {
              const all = tx.objectStore(s).getAll();
              all.onsuccess = () => {
                for (const row of all.result) text += new TextDecoder().decode(row.data ?? new Uint8Array()) + JSON.stringify(row, (k, v) => (v instanceof ArrayBuffer || ArrayBuffer.isView(v) ? '[bytes]' : v));
                if (!--pending && !--left) resolve({ names, text });
              };
            }
          };
        }
      });
    })`,
    );
    assert(stored.names.length >= 1, 'something was saved');
    assert.doesNotMatch(stored.text, /SYNTHETIC PRIVATE|tulips/i, 'no readable conversation text is stored');

    await page.goto(stack.gateway.origin + '/');
    await page.waitFor(`document.getElementById('local-connect').onclick`, 'the app after reload');
    assert.equal(await messages(page), 0, 'a locked library shows nothing');
    // Opening a saved library replaces what is in the tab, so the app asks first.
    const submitSaved = async (passphrase) => {
      await submit(passphrase);
      await page.waitFor(`document.getElementById('review').open`, 'the open-saved-library review');
      assert.match(await page.text('#review-body'), /replaces the current tab-only library/);
      await page.click('#review-approve');
    };
    await openUnlock();
    await submitSaved('the wrong synthetic passphrase');
    await noticed(page, 'Could not unlock the library. Check the passphrase. Nothing was overwritten.');
    assert.equal(await page.evaluate(`document.getElementById('library-unlock').open`), true, 'still locked');
    await submitSaved('synthetic library passphrase');
    await page.waitFor(`!document.getElementById('library-unlock').open`, 'the library to unlock', 20000);
    await page.click('#library-open');
    await page.waitFor(
      `document.getElementById('library-threads').textContent.includes('SYNTHETIC PRIVATE QUESTION')`,
      'the saved conversation after unlocking',
    );
    assert.deepEqual(page.errors, []);
    await page.close();
  },
);
