import assert from 'node:assert/strict';
import test from 'node:test';
import { selectVisibleThreadItems } from '../src/threadVisibility';
import type { ReviewItem } from '../src/model';

function item(overrides: Partial<ReviewItem>): ReviewItem {
  return {
    id: 'R-001',
    sessionId: 'S-001',
    filePath: 'src/example.ts',
    fileUri: 'file:///workspace/src/example.ts',
    range: { startLine: 10, startCharacter: 0, endLine: 10, endCharacter: 5 },
    body: 'comment',
    status: 'open',
    createdAt: '2026-04-12T00:00:00.000Z',
    updatedAt: '2026-04-12T00:00:00.000Z',
    anchor: { excerpt: 'abc', before: [], after: [] },
    ...overrides
  };
}

test('selectVisibleThreadItems hides resolved items on lines with active reviews', () => {
  const items = [
    item({ id: 'R-001', status: 'resolved' }),
    item({ id: 'R-002', status: 'open' }),
    item({ id: 'R-003', status: 'stale' }),
    item({ id: 'R-004', status: 'resolved', range: { startLine: 11, startCharacter: 0, endLine: 11, endCharacter: 5 } })
  ];

  assert.deepEqual(selectVisibleThreadItems(items).map((review) => review.id), ['R-002', 'R-003', 'R-004']);
});

test('selectVisibleThreadItems keeps resolved items when no active review shares the line', () => {
  const items = [
    item({ id: 'R-001', status: 'resolved' }),
    item({ id: 'R-002', status: 'resolved', range: { startLine: 11, startCharacter: 0, endLine: 11, endCharacter: 5 } })
  ];

  assert.deepEqual(selectVisibleThreadItems(items).map((review) => review.id), ['R-001', 'R-002']);
});
