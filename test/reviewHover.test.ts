import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReviewHoverMarkdown } from '../src/reviewHoverText';
import type { ReviewItem } from '../src/model';

const baseItem: ReviewItem = {
  id: 'R-001',
  sessionId: 'S-001',
  filePath: 'src/example.ts',
  range: { startLine: 9, startCharacter: 0, endLine: 11, endCharacter: 5 },
  body: 'Handle the error path before retrying.',
  status: 'open',
  createdAt: 'now',
  updatedAt: 'now',
  anchor: { excerpt: 'x', before: [], after: [] }
};

test('buildReviewHoverMarkdown includes summary and actionable links for open items', () => {
  const hover = buildReviewHoverMarkdown(baseItem);

  assert.match(hover, /\*\*R\\-001\*\*/);
  assert.match(hover, /Status: open/);
  assert.match(hover, /Range: lines 10-12/);
  assert.match(hover, /\[Resolve\]\(command:codeReview\.resolveItem\?/);
  assert.match(hover, /\[Dismiss\]\(command:codeReview\.dismissItem\?/);
  assert.match(hover, /\[Delete\]\(command:codeReview\.deleteItem\?/);
});

test('buildReviewHoverMarkdown uses reopen action for resolved items', () => {
  const hover = buildReviewHoverMarkdown({ ...baseItem, status: 'resolved' });

  assert.match(hover, /\[Reopen\]\(command:codeReview\.reopenItem\?/);
  assert.doesNotMatch(hover, /\[Resolve\]\(command:codeReview\.resolveItem\?/);
});
