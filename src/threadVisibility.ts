import type { ReviewItem } from './model';

export function selectVisibleThreadItems(items: readonly ReviewItem[]): ReviewItem[] {
  const visibleItems = items.filter((item) => item.status !== 'dismissed');
  const hasActiveByLine = new Set<string>();

  for (const item of visibleItems) {
    if (item.status !== 'resolved') {
      hasActiveByLine.add(threadLineKey(item));
    }
  }

  return visibleItems.filter((item) => item.status !== 'resolved' || !hasActiveByLine.has(threadLineKey(item)));
}

function threadLineKey(item: ReviewItem): string {
  return `${item.fileUri ?? item.filePath}:${item.range.startLine}`;
}
