import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEmptyState,
  createSession,
  ensureActiveSession,
  nextItemId,
  normalizeReviewState,
  sortReviewItemsForExport,
  ReviewItem
} from '../src/model';

test('createEmptyState provides a default active session', () => {
  const state = createEmptyState('2026-04-12T00:00:00.000Z');

  assert.equal(state.version, 1);
  assert.equal(state.activeSessionId, 'S-001');
  assert.equal(state.sessions[0].title, 'Code Review');
  assert.equal(ensureActiveSession(state).id, 'S-001');
});

test('nextItemId increments stable review ids', () => {
  const state = createEmptyState();

  assert.equal(nextItemId(state), 'R-001');
  assert.equal(nextItemId(state), 'R-002');
});

test('createSession deactivates previous sessions', () => {
  const state = createEmptyState('2026-04-12T00:00:00.000Z');
  const session = createSession(state, 'Working Tree Review', 'working-tree', '2026-04-12T01:00:00.000Z');

  assert.equal(session.id, 'S-002');
  assert.equal(state.activeSessionId, 'S-002');
  assert.equal(state.sessions.find((candidate) => candidate.id === 'S-001')?.active, false);
});

test('normalizeReviewState recovers counters from persisted ids', () => {
  const state = normalizeReviewState({
    version: 1,
    nextItemNumber: 1,
    nextSessionNumber: 1,
    sessions: [
      {
        id: 'S-009',
        title: 'Persisted',
        scope: 'workspace',
        active: true,
        createdAt: '2026-04-12T00:00:00.000Z',
        updatedAt: '2026-04-12T00:00:00.000Z'
      }
    ],
    items: [
      {
        id: 'R-041',
        sessionId: 'S-009',
        filePath: 'src/example.ts',
        range: { startLine: 0, startCharacter: 0, endLine: 0, endCharacter: 3 },
        body: 'Fix this',
        status: 'open',
        createdAt: '2026-04-12T00:00:00.000Z',
        updatedAt: '2026-04-12T00:00:00.000Z',
        anchor: { excerpt: 'abc', before: [], after: [] }
      }
    ]
  });

  assert.equal(nextItemId(state), 'R-042');
  assert.equal(createSession(state, 'Next', 'workspace').id, 'S-010');
});

test('sortReviewItemsForExport orders by file, line, id', () => {
  const base: ReviewItem = {
    id: 'R-001',
    sessionId: 'S-001',
    filePath: 'b.ts',
    range: { startLine: 10, startCharacter: 0, endLine: 10, endCharacter: 1 },
    body: 'body',
    status: 'open',
    createdAt: 'now',
    updatedAt: 'now',
    anchor: { excerpt: 'x', before: [], after: [] }
  };

  const sorted = sortReviewItemsForExport([
    base,
    { ...base, id: 'R-002', filePath: 'a.ts' },
    { ...base, id: 'R-003', filePath: 'z.ts' },
    { ...base, id: 'R-004', filePath: 'a.ts', range: { ...base.range, startLine: 1, endLine: 1 } }
  ]);

  assert.deepEqual(sorted.map((item) => item.id), ['R-004', 'R-002', 'R-001', 'R-003']);
});
