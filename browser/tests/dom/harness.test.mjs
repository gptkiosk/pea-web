// Checks of the test setup itself: a browser that fails to come up is started again, so a slow test
// machine does not fail tests of the app, while a browser that never starts still fails plainly.
// Run with: node --test browser/tests/dom/harness.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserSkipReason, chromePath, launchBrowser } from './harness.mjs';

const skip = browserSkipReason();

// A stand-in for the browser's program: it gives up at once the first `failures` times it is run,
// then runs the real browser.
function unreliableChrome(folder, failures) {
  const real = chromePath();
  const script = join(folder, 'chrome');
  const count = join(folder, 'count');
  writeFileSync(
    script,
    [
      '#!/bin/sh',
      `n=$(cat "${count}" 2>/dev/null || echo 0)`,
      `echo $((n + 1)) > "${count}"`,
      `if [ "$n" -lt ${failures} ]; then echo "stand-in: not starting" >&2; exit 1; fi`,
      `exec "${real}" "$@"`,
      '',
    ].join('\n'),
  );
  chmodSync(script, 0o755);
  return script;
}

async function withChrome(failures, run) {
  const folder = mkdtempSync(join(tmpdir(), 'pea-harness-'));
  const before = process.env.CHROME_BIN;
  process.env.CHROME_BIN = unreliableChrome(folder, failures);
  try {
    await run(() => Number(readFileSync(join(folder, 'count'), 'utf8')));
  } finally {
    if (before === undefined) delete process.env.CHROME_BIN;
    else process.env.CHROME_BIN = before;
    rmSync(folder, { recursive: true, force: true });
  }
}

test('a browser that fails to start twice is started a third time and works', { skip }, async () => {
  await withChrome(2, async (tries) => {
    const browser = await launchBrowser();
    assert.equal(tries(), 3);
    try {
      const page = await browser.newPage();
      assert.equal(await page.evaluate('1 + 1'), 2);
      await page.close();
    } finally {
      await browser.close();
    }
  });
});

test('a browser that never starts fails with its own words after three tries', { skip }, async () => {
  await withChrome(99, async (tries) => {
    await assert.rejects(launchBrowser(), /^Error: Chrome exited: .*stand-in: not starting/s);
    assert.equal(tries(), 3);
  });
});
