import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnchor, getRangeText, resolveAnchor } from '../src/anchor';
import type { ReviewRange } from '../src/model';

test('getRangeText reads single and multi-line ranges', () => {
  const lines = ['const x = 1;', 'return x;', ''];

  assert.equal(getRangeText(lines, { startLine: 0, startCharacter: 6, endLine: 0, endCharacter: 7 }), 'x');
  assert.equal(
    getRangeText(lines, { startLine: 0, startCharacter: 0, endLine: 1, endCharacter: 6 }),
    'const x = 1;\nreturn'
  );
});

test('resolveAnchor keeps a matching original range', () => {
  const lines = ['alpha', 'target', 'omega'];
  const range: ReviewRange = { startLine: 1, startCharacter: 0, endLine: 1, endCharacter: 6 };
  const anchor = createAnchor(lines, range);

  assert.deepEqual(resolveAnchor(lines, range, anchor), { range, stale: false });
});

test('resolveAnchor relocates a unique exact excerpt match', () => {
  const original = ['alpha', 'target', 'omega'];
  const range: ReviewRange = { startLine: 1, startCharacter: 0, endLine: 1, endCharacter: 6 };
  const anchor = createAnchor(original, range);
  const updated = ['intro', 'alpha', 'target', 'omega'];

  assert.deepEqual(resolveAnchor(updated, range, anchor), {
    range: { startLine: 2, startCharacter: 0, endLine: 2, endCharacter: 6 },
    stale: false
  });
});

test('resolveAnchor marks ambiguous matches stale', () => {
  const original = ['alpha', 'target', 'omega'];
  const range: ReviewRange = { startLine: 1, startCharacter: 0, endLine: 1, endCharacter: 6 };
  const anchor = createAnchor(original, range);
  const updated = ['target', 'changed', 'target'];

  assert.equal(resolveAnchor(updated, range, anchor).stale, true);
});

test('resolveAnchor marks out-of-bounds empty excerpts stale', () => {
  const original = ['alpha', '', 'omega'];
  const range: ReviewRange = { startLine: 1, startCharacter: 0, endLine: 1, endCharacter: 0 };
  const anchor = createAnchor(original, range);
  const updated = ['alpha'];

  assert.equal(resolveAnchor(updated, range, anchor).stale, true);
});

test('resolveAnchor marks empty excerpts stale when context no longer matches', () => {
  const original = ['alpha', '', 'omega'];
  const range: ReviewRange = { startLine: 1, startCharacter: 0, endLine: 1, endCharacter: 0 };
  const anchor = createAnchor(original, range);
  const updated = ['alpha', 'omega'];

  assert.equal(resolveAnchor(updated, range, anchor).stale, true);
});

test('resolveAnchor relocates empty excerpts by unique context', () => {
  const original = ['alpha', '', 'omega'];
  const range: ReviewRange = { startLine: 1, startCharacter: 0, endLine: 1, endCharacter: 0 };
  const anchor = createAnchor(original, range);
  const updated = ['intro', 'alpha', '', 'omega'];

  assert.deepEqual(resolveAnchor(updated, range, anchor), {
    range: { startLine: 2, startCharacter: 0, endLine: 2, endCharacter: 0 },
    stale: false
  });
});
