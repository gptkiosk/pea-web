import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// Walks the braces and reports each declaration block with the at-rules and selector that enclose it.
function declarationBlocks(text) {
  const stack = [];
  const blocks = [];
  let start = 0;
  let leaf = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      stack.push(text.slice(start, i).trim());
      start = i + 1;
      leaf = true;
    } else if (text[i] === '}') {
      assert(stack.length > 0, 'a closing brace has no matching opening brace');
      if (leaf) blocks.push({ context: [...stack], body: text.slice(start, i) });
      stack.pop();
      start = i + 1;
      leaf = false;
    }
  }
  assert.equal(stack.length, 0, 'unclosed block: ' + stack.join(' > ').slice(0, 120));
  return blocks;
}

test('every block in the stylesheet is closed', () => {
  assert(declarationBlocks(css).length > 300);
});

test('a reduced-motion preference only removes motion, never layout or color', () => {
  const motionOnly = new Set(['animation', 'transition', 'transform', 'opacity']);
  const guarded = declarationBlocks(css).filter((block) =>
    block.context.some((rule) => /prefers-reduced-motion\s*:\s*no-preference/.test(rule)),
  );
  assert(guarded.length > 0, 'the stylesheet still guards its motion');
  for (const block of guarded) {
    const properties = block.body
      .split(';')
      .map((declaration) => declaration.split(':')[0].trim())
      .filter(Boolean);
    for (const property of properties)
      assert(
        motionOnly.has(property),
        `${property} in "${block.context.at(-1)}" is hidden from owners who prefer reduced motion`,
      );
  }
});

test('motion is only declared where a reduced-motion preference can switch it off', () => {
  for (const block of declarationBlocks(css)) {
    if (block.context.some((rule) => /^@keyframes/.test(rule))) continue;
    if (!/(^|;)\s*(animation|transition)\s*:/.test(block.body)) continue;
    assert(
      block.context.some((rule) => /prefers-reduced-motion\s*:\s*no-preference/.test(rule)),
      `"${block.context.at(-1)}" animates without a reduced-motion guard`,
    );
  }
});
