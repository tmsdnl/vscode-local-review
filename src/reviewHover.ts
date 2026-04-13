import * as vscode from 'vscode';
import type { ReviewItem } from './model';
import { buildReviewHoverMarkdown, HOVER_COMMANDS } from './reviewHoverText';

export function createReviewHover(item: ReviewItem): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString(buildReviewHoverMarkdown(item));
  markdown.isTrusted = { enabledCommands: [...HOVER_COMMANDS] };
  markdown.supportThemeIcons = true;
  return markdown;
}
