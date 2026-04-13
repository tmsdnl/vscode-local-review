import type { ReviewItem } from './model';

export const HOVER_COMMANDS = [
  'codeReview.openItem',
  'codeReview.editItem',
  'codeReview.resolveItem',
  'codeReview.reopenItem',
  'codeReview.dismissItem',
  'codeReview.deleteItem'
] as const;

export function buildReviewHoverMarkdown(item: ReviewItem): string {
  const lines = [
    `**${escapeMarkdown(item.id)}**`,
    '',
    `Status: ${escapeMarkdown(item.status)}`,
    `Range: ${formatRange(item)}`,
    '',
    escapeMarkdown(item.body),
    '',
    buildActions(item)
  ];

  return lines.join('\n');
}

function buildActions(item: ReviewItem): string {
  const actions = [
    commandLink('Open', 'codeReview.openItem', item.id),
    commandLink('Edit', 'codeReview.editItem', item.id)
  ];

  if (item.status === 'open' || item.status === 'stale') {
    actions.push(commandLink('Resolve', 'codeReview.resolveItem', item.id));
    actions.push(commandLink('Dismiss', 'codeReview.dismissItem', item.id));
  } else if (item.status === 'resolved' || item.status === 'dismissed') {
    actions.push(commandLink('Reopen', 'codeReview.reopenItem', item.id));
    if (item.status === 'resolved') {
      actions.push(commandLink('Dismiss', 'codeReview.dismissItem', item.id));
    }
  }

  actions.push(commandLink('Delete', 'codeReview.deleteItem', item.id));
  return actions.join(' · ');
}

function commandLink(label: string, command: string, itemId: string): string {
  const args = encodeURIComponent(JSON.stringify([itemId]));
  return `[${label}](command:${command}?${args})`;
}

function formatRange(item: ReviewItem): string {
  const start = item.range.startLine + 1;
  const end = item.range.endLine + 1;
  return start === end ? `line ${start}` : `lines ${start}-${end}`;
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}\[\]()#+\-.!|>]/g, '\\$&');
}
