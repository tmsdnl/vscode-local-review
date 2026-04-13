export const REVIEW_STATUSES = ['open', 'resolved', 'dismissed', 'stale'] as const;

export type ReviewStatus = typeof REVIEW_STATUSES[number];
export type ReviewScope = 'current-file' | 'workspace' | 'working-tree';

export interface ReviewRange {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
}

export interface ReviewAnchor {
  excerpt: string;
  before: string[];
  after: string[];
}

export interface RepositoryContext {
  root?: string;
  branch?: string;
  head?: string;
  changedFiles?: string[];
}

export interface ReviewSession {
  id: string;
  title: string;
  scope: ReviewScope;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  repository?: RepositoryContext;
}

export interface ReviewItem {
  id: string;
  sessionId: string;
  filePath: string;
  fileUri?: string;
  range: ReviewRange;
  body: string;
  status: ReviewStatus;
  createdAt: string;
  updatedAt: string;
  anchor: ReviewAnchor;
}

export interface ReviewState {
  version: 1;
  nextItemNumber: number;
  nextSessionNumber: number;
  activeSessionId?: string;
  sessions: ReviewSession[];
  items: ReviewItem[];
}

export function createEmptyState(now = new Date().toISOString()): ReviewState {
  const session: ReviewSession = {
    id: 'S-001',
    title: 'Code Review',
    scope: 'workspace',
    active: true,
    createdAt: now,
    updatedAt: now
  };

  return {
    version: 1,
    nextItemNumber: 1,
    nextSessionNumber: 2,
    activeSessionId: session.id,
    sessions: [session],
    items: []
  };
}

export function ensureActiveSession(state: ReviewState, now = new Date().toISOString()): ReviewSession {
  const active = state.sessions.find((session) => session.id === state.activeSessionId);
  if (active) {
    return active;
  }

  const fallback = state.sessions.find((session) => session.active);
  if (fallback) {
    state.activeSessionId = fallback.id;
    return fallback;
  }

  const session = createSession(state, 'Code Review', 'workspace', now);
  state.activeSessionId = session.id;
  return session;
}

export function createSession(
  state: ReviewState,
  title: string,
  scope: ReviewScope,
  now = new Date().toISOString(),
  repository?: RepositoryContext
): ReviewSession {
  const session: ReviewSession = {
    id: nextSessionId(state),
    title,
    scope,
    active: true,
    createdAt: now,
    updatedAt: now,
    repository
  };

  state.sessions = state.sessions.map((existing) => ({ ...existing, active: false }));
  state.sessions.push(session);
  state.activeSessionId = session.id;
  return session;
}

export function nextItemId(state: ReviewState): string {
  state.nextItemNumber += 1;
  return `R-${String(state.nextItemNumber - 1).padStart(3, '0')}`;
}

export function normalizeReviewState(raw: unknown): ReviewState {
  if (!isRecord(raw) || raw.version !== 1) {
    return createEmptyState();
  }

  const state: ReviewState = {
    version: 1,
    nextItemNumber: numberOr(raw.nextItemNumber, 1),
    nextSessionNumber: numberOr(raw.nextSessionNumber, 1),
    activeSessionId: typeof raw.activeSessionId === 'string' ? raw.activeSessionId : undefined,
    sessions: Array.isArray(raw.sessions) ? raw.sessions.map(normalizeSession).filter(isDefined) : [],
    items: Array.isArray(raw.items) ? raw.items.map(normalizeItem).filter(isDefined) : []
  };

  if (state.sessions.length === 0) {
    const empty = createEmptyState();
    state.sessions = empty.sessions;
    state.activeSessionId = empty.activeSessionId;
    state.nextSessionNumber = Math.max(state.nextSessionNumber, empty.nextSessionNumber);
  }

  state.nextItemNumber = Math.max(state.nextItemNumber, maxNumericSuffix(state.items.map((item) => item.id)) + 1, 1);
  state.nextSessionNumber = Math.max(
    state.nextSessionNumber,
    maxNumericSuffix(state.sessions.map((session) => session.id)) + 1,
    1
  );
  ensureActiveSession(state);

  return state;
}

export function sortReviewItemsForExport(items: readonly ReviewItem[]): ReviewItem[] {
  return [...items].sort((left, right) => {
    return left.filePath.localeCompare(right.filePath)
      || left.range.startLine - right.range.startLine
      || left.range.startCharacter - right.range.startCharacter
      || left.id.localeCompare(right.id);
  });
}

export function isReviewStatus(value: string): value is ReviewStatus {
  return (REVIEW_STATUSES as readonly string[]).includes(value);
}

function nextSessionId(state: ReviewState): string {
  state.nextSessionNumber += 1;
  return `S-${String(state.nextSessionNumber - 1).padStart(3, '0')}`;
}

function normalizeSession(raw: unknown): ReviewSession | undefined {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.title !== 'string') {
    return undefined;
  }

  const now = new Date().toISOString();
  const scope = raw.scope === 'current-file' || raw.scope === 'working-tree' || raw.scope === 'workspace'
    ? raw.scope
    : 'workspace';

  return {
    id: raw.id,
    title: raw.title,
    scope,
    active: typeof raw.active === 'boolean' ? raw.active : false,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
    repository: normalizeRepository(raw.repository)
  };
}

function normalizeItem(raw: unknown): ReviewItem | undefined {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.sessionId !== 'string') {
    return undefined;
  }
  if (typeof raw.filePath !== 'string' || typeof raw.body !== 'string') {
    return undefined;
  }

  const range = normalizeRange(raw.range);
  const anchor = normalizeAnchor(raw.anchor);
  if (!range || !anchor) {
    return undefined;
  }

  const now = new Date().toISOString();
  const status = typeof raw.status === 'string' && isReviewStatus(raw.status) ? raw.status : 'open';
  return {
    id: raw.id,
    sessionId: raw.sessionId,
    filePath: raw.filePath,
    fileUri: typeof raw.fileUri === 'string' ? raw.fileUri : undefined,
    range,
    body: raw.body,
    status,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
    anchor
  };
}

function normalizeRange(raw: unknown): ReviewRange | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }

  const range: ReviewRange = {
    startLine: numberOr(raw.startLine, -1),
    startCharacter: numberOr(raw.startCharacter, -1),
    endLine: numberOr(raw.endLine, -1),
    endCharacter: numberOr(raw.endCharacter, -1)
  };

  if (Object.values(range).some((value) => value < 0)) {
    return undefined;
  }
  return range;
}

function normalizeAnchor(raw: unknown): ReviewAnchor | undefined {
  if (!isRecord(raw) || typeof raw.excerpt !== 'string') {
    return undefined;
  }

  return {
    excerpt: raw.excerpt,
    before: Array.isArray(raw.before) ? raw.before.filter((line): line is string => typeof line === 'string') : [],
    after: Array.isArray(raw.after) ? raw.after.filter((line): line is string => typeof line === 'string') : []
  };
}

function normalizeRepository(raw: unknown): RepositoryContext | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }

  return {
    root: typeof raw.root === 'string' ? raw.root : undefined,
    branch: typeof raw.branch === 'string' ? raw.branch : undefined,
    head: typeof raw.head === 'string' ? raw.head : undefined,
    changedFiles: Array.isArray(raw.changedFiles)
      ? raw.changedFiles.filter((file): file is string => typeof file === 'string')
      : undefined
  };
}

function maxNumericSuffix(values: readonly string[]): number {
  return values.reduce((max, value) => {
    const match = /(\d+)$/.exec(value);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
