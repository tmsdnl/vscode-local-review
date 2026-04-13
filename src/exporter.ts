import {
  ReviewItem,
  ReviewSession,
  ReviewState,
  sortReviewItemsForExport
} from './model';

export interface MarkdownExportOptions {
  sessionId?: string;
  generatedAt?: string;
  includeStatuses?: readonly ReviewItem['status'][];
}

export function generateMarkdownExport(state: ReviewState, options: MarkdownExportOptions = {}): string {
  const session = selectSession(state, options.sessionId);
  const includeStatuses = options.includeStatuses ?? ['open', 'stale'];
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const sessionItems = state.items.filter((item) => !session || item.sessionId === session.id);
  const exportedItems = sortReviewItemsForExport(
    sessionItems.filter((item) => includeStatuses.includes(item.status))
  );

  const lines: string[] = [`# Local Review: ${session?.title ?? 'All Local Reviews'}`, '', `Generated: ${generatedAt}`];

  if (session?.repository?.root) {
    lines.push(`Repository Root: ${session.repository.root}`);
  }
  if (session?.repository?.branch) {
    lines.push(`Branch: ${session.repository.branch}`);
  }
  if (session?.repository?.head) {
    lines.push(`HEAD: ${session.repository.head}`);
  }

  if (exportedItems.length === 0) {
    lines.push('', 'No open or stale review findings.');
    return `${lines.join('\n')}\n`;
  }

  let currentFile: string | undefined;
  for (const item of exportedItems) {
    if (item.filePath !== currentFile) {
      currentFile = item.filePath;
      lines.push('', `## ${item.filePath}`, '');
    }

    lines.push(
      `### ${item.id}`,
      '',
      `Location: ${formatLocation(item)}`,
      `Status: ${item.status}`,
      '',
      item.body,
      '',
      fencedCodeBlock(item.anchor.excerpt),
      ''
    );
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function selectSession(state: ReviewState, sessionId?: string): ReviewSession | undefined {
  if (sessionId) {
    return state.sessions.find((session) => session.id === sessionId);
  }
  return state.sessions.find((session) => session.id === state.activeSessionId) ?? state.sessions[0];
}

function formatLocation(item: ReviewItem): string {
  return `${item.filePath}:${formatLineSpan(item)}`;
}

function formatLineSpan(item: ReviewItem): string {
  const start = item.range.startLine + 1;
  const end = item.range.endLine + 1;
  return start === end ? `${start}` : `${start}-${end}`;
}

function fencedCodeBlock(value: string): string {
  const fence = value.includes('```') ? '````' : '```';
  return `${fence}\n${value}\n${fence}`;
}
