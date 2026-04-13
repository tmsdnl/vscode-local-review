import assert from 'node:assert/strict';
import test from 'node:test';
import { generateMarkdownExport } from '../src/exporter';
import type { ReviewState } from '../src/model';

test('generateMarkdownExport writes deterministic agent-oriented markdown', () => {
  const state: ReviewState = {
    version: 1,
    nextItemNumber: 3,
    nextSessionNumber: 2,
    activeSessionId: 'S-001',
    sessions: [
      {
        id: 'S-001',
        title: 'Working Tree Review',
        scope: 'working-tree',
        active: true,
        createdAt: '2026-04-12T00:00:00.000Z',
        updatedAt: '2026-04-12T00:00:00.000Z',
        repository: { branch: 'main', head: 'abc123' }
      }
    ],
    items: [
      {
        id: 'R-002',
        sessionId: 'S-001',
        filePath: 'src/b.ts',
        range: { startLine: 9, startCharacter: 0, endLine: 9, endCharacter: 1 },
        body: 'Optional note',
        status: 'open',
        createdAt: 'now',
        updatedAt: 'now',
        anchor: { excerpt: 'b', before: [], after: [] }
      },
      {
        id: 'R-001',
        sessionId: 'S-001',
        filePath: 'src/a.ts',
        range: { startLine: 1, startCharacter: 0, endLine: 2, endCharacter: 1 },
        body: 'Required fix',
        status: 'open',
        createdAt: 'now',
        updatedAt: 'now',
        anchor: { excerpt: 'a\nb', before: [], after: [] }
      },
      {
        id: 'R-003',
        sessionId: 'S-001',
        filePath: 'src/c.ts',
        range: { startLine: 0, startCharacter: 0, endLine: 0, endCharacter: 1 },
        body: 'Already handled',
        status: 'resolved',
        createdAt: 'now',
        updatedAt: 'now',
        anchor: { excerpt: 'c', before: [], after: [] }
      }
    ]
  };

  const markdown = generateMarkdownExport(state, { generatedAt: '2026-04-12T10:15:00.000Z' });

  assert.match(markdown, /^# Local Review: Working Tree Review/);
  assert.match(markdown, /Generated: 2026-04-12T10:15:00.000Z/);
  assert.match(markdown, /Branch: main/);
  assert.match(markdown, /HEAD: abc123/);
  assert.ok(markdown.indexOf('### R-001') < markdown.indexOf('### R-002'));
  assert.doesNotMatch(markdown, /Already handled/);
  assert.match(markdown, /Location: src\/a\.ts:2-3/);
  assert.match(markdown, /Required fix/);
});

test('generateMarkdownExport selects the requested code review', () => {
  const state: ReviewState = {
    version: 1,
    nextItemNumber: 3,
    nextSessionNumber: 3,
    activeSessionId: 'S-001',
    sessions: [
      {
        id: 'S-001',
        title: 'First Review',
        scope: 'workspace',
        active: true,
        createdAt: '2026-04-12T00:00:00.000Z',
        updatedAt: '2026-04-12T00:00:00.000Z'
      },
      {
        id: 'S-002',
        title: 'Selected Review',
        scope: 'workspace',
        active: false,
        createdAt: '2026-04-12T00:00:00.000Z',
        updatedAt: '2026-04-12T00:00:00.000Z'
      }
    ],
    items: [
      {
        id: 'R-001',
        sessionId: 'S-001',
        filePath: 'src/a.ts',
        range: { startLine: 0, startCharacter: 0, endLine: 0, endCharacter: 1 },
        body: 'First body',
        status: 'open',
        createdAt: 'now',
        updatedAt: 'now',
        anchor: { excerpt: 'a', before: [], after: [] }
      },
      {
        id: 'R-002',
        sessionId: 'S-002',
        filePath: 'src/b.ts',
        range: { startLine: 1, startCharacter: 0, endLine: 1, endCharacter: 1 },
        body: 'Selected body',
        status: 'open',
        createdAt: 'now',
        updatedAt: 'now',
        anchor: { excerpt: 'b', before: [], after: [] }
      }
    ]
  };

  const markdown = generateMarkdownExport(state, { sessionId: 'S-002', generatedAt: '2026-04-12T10:15:00.000Z' });

  assert.match(markdown, /^# Local Review: Selected Review/m);
  assert.match(markdown, /Selected body/);
  assert.doesNotMatch(markdown, /First body/);
});

test('generateMarkdownExport preserves blank lines inside comments and excerpts', () => {
  const state: ReviewState = {
    version: 1,
    nextItemNumber: 2,
    nextSessionNumber: 2,
    activeSessionId: 'S-001',
    sessions: [
      {
        id: 'S-001',
        title: 'Spacing Review',
        scope: 'workspace',
        active: true,
        createdAt: '2026-04-12T00:00:00.000Z',
        updatedAt: '2026-04-12T00:00:00.000Z'
      }
    ],
    items: [
      {
        id: 'R-001',
        sessionId: 'S-001',
        filePath: 'src/a.ts',
        range: { startLine: 0, startCharacter: 0, endLine: 4, endCharacter: 1 },
        body: 'first\n\n\nsecond',
        status: 'open',
        createdAt: 'now',
        updatedAt: 'now',
        anchor: { excerpt: 'a\n\n\nb', before: [], after: [] }
      }
    ]
  };

  const markdown = generateMarkdownExport(state, { generatedAt: '2026-04-12T10:15:00.000Z' });

  assert.match(markdown, /first\n\n\nsecond/);
  assert.match(markdown, /```\na\n\n\nb\n```/);
});
