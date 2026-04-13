import * as vscode from 'vscode';
import type { ReviewItem, ReviewState } from './model';

export type ReviewGroup = string;
type NodeKind = 'group' | 'item';

export interface ReviewExplorerNode {
  kind: NodeKind;
  group?: ReviewGroup;
  item?: ReviewItem;
}

export class ReviewExplorer implements vscode.TreeDataProvider<ReviewExplorerNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<ReviewExplorerNode | undefined | void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(private state: ReviewState) {}

  update(state: ReviewState): void {
    this.state = state;
    this.onDidChangeTreeDataEmitter.fire();
  }

  getTreeItem(element: ReviewExplorerNode): vscode.TreeItem {
    if (element.kind === 'group' && element.group) {
      const items = this.itemsForGroup(element.group);
      const count = items.length;
      const review = this.state.sessions.find((session) => session.id === element.group);
      const item = new vscode.TreeItem(
        `${review?.title ?? element.group} (${count})`,
        vscode.TreeItemCollapsibleState.Expanded
      );
      item.contextValue = count > 0 ? 'reviewGroup.nonempty' : 'reviewGroup.empty';
      item.description = summarizeGroup(items, review?.id === this.state.activeSessionId);
      item.tooltip = summarizeGroupTooltip(review?.title ?? element.group, items, review?.id === this.state.activeSessionId);
      item.iconPath = new vscode.ThemeIcon('folder-library');
      return item;
    }

    if (element.kind === 'item' && element.item) {
      const review = element.item;
      const treeItem = new vscode.TreeItem(
        `${review.id}: ${firstLine(review.body)}`,
        vscode.TreeItemCollapsibleState.None
      );
      treeItem.description = `${review.filePath}:${review.range.startLine + 1}`;
      treeItem.tooltip = `${review.filePath}:${review.range.startLine + 1}\n${review.body}`;
      treeItem.contextValue = `reviewItem.${review.status}`;
      treeItem.iconPath = new vscode.ThemeIcon(iconForStatus(review.status));
      return treeItem;
    }

    return new vscode.TreeItem('Unknown Review Item');
  }

  getChildren(element?: ReviewExplorerNode): ReviewExplorerNode[] {
    if (!element) {
      return this.state.sessions
        .sort((left, right) => {
          if (left.id === this.state.activeSessionId) {
            return -1;
          }
          if (right.id === this.state.activeSessionId) {
            return 1;
          }
          return left.title.localeCompare(right.title);
        })
        .map((session) => ({ kind: 'group', group: session.id }));
    }

    if (element.kind === 'group' && element.group) {
      return this.itemsForGroup(element.group)
        .sort((left, right) => {
          return compareByStatus(left.status, right.status)
            || left.filePath.localeCompare(right.filePath)
            || left.range.startLine - right.range.startLine
            || left.range.startCharacter - right.range.startCharacter
            || left.id.localeCompare(right.id);
        })
        .map((item) => ({ kind: 'item', group: element.group, item }));
    }

    return [];
  }

  private itemsForGroup(group: ReviewGroup): ReviewItem[] {
    return this.state.items.filter((item) => item.sessionId === group);
  }
}

export function nodeToItemId(candidate: unknown): string | undefined {
  if (typeof candidate === 'string') {
    return candidate;
  }
  if (typeof candidate === 'object' && candidate !== null && 'item' in candidate) {
    const item = (candidate as { item?: ReviewItem }).item;
    return item?.id;
  }
  return undefined;
}

export function nodeToGroup(candidate: unknown): ReviewGroup | undefined {
  if (typeof candidate === 'object' && candidate !== null && 'group' in candidate) {
    return (candidate as { group?: ReviewGroup }).group;
  }
  return undefined;
}

function firstLine(value: string): string {
  const line = value.split(/\r?\n/, 1)[0].trim();
  return line.length > 72 ? `${line.slice(0, 69)}...` : line || '(empty comment)';
}

function iconForStatus(status: ReviewItem['status']): string {
  switch (status) {
    case 'open':
      return 'comment-unresolved';
    case 'resolved':
      return 'pass';
    case 'dismissed':
      return 'circle-slash';
    case 'stale':
      return 'warning';
  }
}

function summarizeGroup(items: readonly ReviewItem[], active: boolean): string | undefined {
  const parts: string[] = [];
  if (active) {
    parts.push('active');
  }

  for (const status of ['open', 'stale', 'resolved', 'dismissed'] as const) {
    const count = items.filter((item) => item.status === status).length;
    if (count > 0) {
      parts.push(`${count} ${status}`);
    }
  }

  return parts.length > 0 ? parts.join(' · ') : active ? 'active' : 'empty';
}

function summarizeGroupTooltip(title: string, items: readonly ReviewItem[], active: boolean): string {
  return `${title}\n${summarizeGroup(items, active) ?? 'empty'}`;
}

function compareByStatus(left: ReviewItem['status'], right: ReviewItem['status']): number {
  return statusOrder(left) - statusOrder(right);
}

function statusOrder(status: ReviewItem['status']): number {
  switch (status) {
    case 'open':
      return 0;
    case 'stale':
      return 1;
    case 'dismissed':
      return 2;
    case 'resolved':
      return 3;
  }
}
