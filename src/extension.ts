import * as path from 'node:path';
import * as vscode from 'vscode';
import { createAnchor, resolveAnchor } from './anchor';
import { generateMarkdownExport } from './exporter';
import {
  createSession,
  ensureActiveSession,
  nextItemId,
  ReviewItem,
  ReviewRange,
  ReviewState,
  ReviewStatus
} from './model';
import { readRepositoryContext } from './repository';
import { nodeToGroup, nodeToItemId, ReviewExplorer, type ReviewExplorerNode, type ReviewGroup } from './reviewExplorer';
import { ReviewStore } from './store';
import { isFileMissingError } from './storeErrors';
import { selectVisibleThreadItems } from './threadVisibility';

const THREAD_CONTEXT_DRAFT = 'draft';
const THREAD_CONTEXT_OPEN = 'reviewOpen';
const THREAD_CONTEXT_STALE = 'reviewStale';
const THREAD_CONTEXT_RESOLVED = 'reviewResolved';
const COMMENT_CONTEXT_PREVIEW = 'reviewComment';
const COMMENT_CONTEXT_EDITING = 'reviewCommentEditing';
const REVIEW_TREE_MIME = 'application/vnd.code.tree.codereviewexplorer.items';

class ReviewComment implements vscode.Comment {
  body: string | vscode.MarkdownString;
  mode: vscode.CommentMode;
  author: vscode.CommentAuthorInformation;
  contextValue?: string;
  label?: string;
  timestamp?: Date;
  savedBody: string | vscode.MarkdownString;

  constructor(
    readonly itemId: string,
    public parent: vscode.CommentThread,
    body: string,
    timestamp: Date
  ) {
    this.body = body;
    this.savedBody = body;
    this.mode = vscode.CommentMode.Preview;
    this.author = { name: '' };
    this.contextValue = COMMENT_CONTEXT_PREVIEW;
    this.timestamp = timestamp;
  }

  sync(item: ReviewItem): void {
    this.body = item.body;
    this.savedBody = item.body;
    this.mode = vscode.CommentMode.Preview;
    this.contextValue = COMMENT_CONTEXT_PREVIEW;
    this.label = undefined;
    this.timestamp = new Date(item.updatedAt);
  }

  startEditing(): void {
    this.savedBody = this.body;
    this.mode = vscode.CommentMode.Editing;
    this.contextValue = COMMENT_CONTEXT_EDITING;
  }

  cancelEditing(): void {
    this.body = this.savedBody;
    this.mode = vscode.CommentMode.Preview;
    this.contextValue = COMMENT_CONTEXT_PREVIEW;
  }
}

class CodeReviewExtension implements vscode.Disposable {
  private state?: ReviewState;
  private store?: ReviewStore;
  private explorer?: ReviewExplorer;
  private controller?: vscode.CommentController;
  private selectedReviewId?: string;
  private readonly threads = new Map<string, vscode.CommentThread>();
  private readonly threadToItem = new WeakMap<vscode.CommentThread, string>();
  private readonly openRangeDecoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: 'rgba(224, 176, 63, 0.10)',
    overviewRulerColor: 'rgba(224, 176, 63, 0.65)',
    overviewRulerLane: vscode.OverviewRulerLane.Right,
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
  });
  private readonly staleRangeDecoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: 'rgba(242, 139, 130, 0.14)',
    overviewRulerColor: 'rgba(242, 139, 130, 0.85)',
    overviewRulerLane: vscode.OverviewRulerLane.Right,
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
  });
  private readonly resolvedRangeDecoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: 'rgba(137, 180, 250, 0.08)',
    overviewRulerColor: 'rgba(137, 180, 250, 0.55)',
    overviewRulerLane: vscode.OverviewRulerLane.Right,
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
  });
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {}

  async initialize(): Promise<void> {
    const storageUri = this.context.storageUri ?? this.context.globalStorageUri;
    this.store = new ReviewStore(storageUri);
    this.state = await this.store.load();
    this.explorer = new ReviewExplorer(this.state);
    this.controller = vscode.comments.createCommentController('local-review', 'Local Review');
    this.controller.options = {
      prompt: 'Add local review note',
      placeHolder: 'Describe the review note'
    };
    this.controller.commentingRangeProvider = {
      provideCommentingRanges: (document) => {
        if (document.uri.scheme !== 'file') {
          return [];
        }
        return [new vscode.Range(0, 0, Math.max(0, document.lineCount - 1), 0)];
      }
    };

    const treeView = vscode.window.createTreeView('codeReviewExplorer', {
      treeDataProvider: this.explorer,
      dragAndDropController: {
        dragMimeTypes: [REVIEW_TREE_MIME],
        dropMimeTypes: [REVIEW_TREE_MIME],
        handleDrag: (source, dataTransfer) => {
          const itemIds = source
            .map((node) => nodeToItemId(node))
            .filter((itemId): itemId is string => Boolean(itemId));
          dataTransfer.set(REVIEW_TREE_MIME, new vscode.DataTransferItem(itemIds));
        },
        handleDrop: async (target, dataTransfer) => {
          const targetReviewId = nodeToGroup(target);
          if (!targetReviewId) {
            return;
          }

          const item = dataTransfer.get(REVIEW_TREE_MIME);
          const itemIds = await readDraggedItemIds(item);
          if (itemIds.length === 0) {
            return;
          }

          await this.moveItemsToReview(itemIds, targetReviewId);
        }
      }
    });

    this.disposables.push(
      this.openRangeDecoration,
      this.staleRangeDecoration,
      this.resolvedRangeDecoration,
      this.controller,
      treeView,
      treeView.onDidChangeSelection((event) => {
        this.selectedReviewId = selectedReviewIdFromNodes(event.selection);
        const itemId = selectedItemIdFromNodes(event.selection);
        if (itemId) {
          void this.revealItem(itemId, false);
        }
      }),
      vscode.window.onDidChangeVisibleTextEditors(() => this.refreshDecorations()),
      vscode.workspace.onDidOpenTextDocument((document) => {
        void this.reanchorSavedDocument(document);
      }),
      vscode.workspace.onDidSaveTextDocument((document) => {
        void this.reanchorSavedDocument(document);
      }),
      ...this.registerCommands()
    );

    await this.reanchorAllItems();
    this.syncThreadsFromState();
    this.refreshDecorations();
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private registerCommands(): vscode.Disposable[] {
    return [
      vscode.commands.registerCommand('codeReview.startSession', () => this.startSession()),
      vscode.commands.registerCommand('codeReview.addComment', () => this.addComment()),
      vscode.commands.registerCommand('codeReview.createComment', (reply: vscode.CommentReply) => this.createComment(reply)),
      vscode.commands.registerCommand('codeReview.editComment', (comment: ReviewComment) => this.editCommentInline(comment)),
      vscode.commands.registerCommand('codeReview.saveComment', (comment: ReviewComment) => this.saveComment(comment)),
      vscode.commands.registerCommand('codeReview.cancelComment', (comment: ReviewComment) => this.cancelComment(comment)),
      vscode.commands.registerCommand('codeReview.exportMarkdown', () => this.exportMarkdown()),
      vscode.commands.registerCommand('codeReview.openItem', (candidate?: unknown) => this.openItem(nodeToItemId(candidate))),
      vscode.commands.registerCommand('codeReview.resolveItem', (candidate?: unknown) => this.updateStatus(candidate, 'resolved')),
      vscode.commands.registerCommand('codeReview.dismissItem', (candidate?: unknown) => this.updateStatus(candidate, 'dismissed')),
      vscode.commands.registerCommand('codeReview.reopenItem', (candidate?: unknown) => this.updateStatus(candidate, 'open')),
      vscode.commands.registerCommand('codeReview.deleteItem', (candidate?: unknown) => this.deleteItem(candidate)),
      vscode.commands.registerCommand('codeReview.editItem', (candidate?: unknown) => this.editItem(candidate)),
      vscode.commands.registerCommand('codeReview.copyItem', (candidate?: unknown) => this.copyItem(candidate)),
      vscode.commands.registerCommand('codeReview.resolveGroup', (candidate?: unknown) => this.updateGroup(candidate, 'resolved')),
      vscode.commands.registerCommand('codeReview.deleteGroup', (candidate?: unknown) => this.deleteGroup(candidate))
    ];
  }

  private async startSession(): Promise<void> {
    const state = this.requireState();
    const title = await vscode.window.showInputBox({
      title: 'New Local Review',
      prompt: 'Local review name',
      value: 'Local Review'
    });
    if (!title) {
      return;
    }

    const workspaceFolder = activeWorkspaceFolder();
    const repository = await readRepositoryContext(workspaceFolder);

    createSession(state, title, 'workspace', new Date().toISOString(), repository);
    await this.persistAndRefresh();
  }

  private addComment(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== 'file') {
      vscode.window.showWarningMessage('Open a file-backed editor before adding a review comment.');
      return;
    }

    const range = editor.selection.isEmpty
      ? editor.document.lineAt(editor.selection.active.line).range
      : new vscode.Range(editor.selection.start, editor.selection.end);

    this.createDraftThread(editor.document.uri, range);
  }

  private async createComment(reply: vscode.CommentReply): Promise<void> {
    const body = reply.text.trim();
    if (!body) {
      return;
    }

    const range = reply.thread.range;
    if (!range) {
      reply.thread.dispose();
      return;
    }

    const item = await this.createItem(reply.thread.uri, range, body);
    this.attachThreadToItem(reply.thread, item);
    await this.persistAndRefresh();
  }

  private editCommentInline(comment: ReviewComment | undefined): void {
    if (!comment?.parent) {
      return;
    }
    comment.startEditing();
    comment.parent.comments = [...comment.parent.comments];
  }

  private async saveComment(comment: ReviewComment | undefined): Promise<void> {
    if (!comment?.parent) {
      return;
    }

    const item = this.findItem(comment.itemId);
    const body = commentBodyText(comment.body).trim();
    if (!item || !body) {
      return;
    }

    item.body = body;
    item.updatedAt = new Date().toISOString();
    comment.sync(item);
    comment.parent.comments = [...comment.parent.comments];
    await this.persistAndRefresh();
  }

  private cancelComment(comment: ReviewComment | undefined): void {
    if (!comment?.parent) {
      return;
    }
    comment.cancelEditing();
    comment.parent.comments = [...comment.parent.comments];
  }

  private async openItem(itemId?: string): Promise<void> {
    await this.revealItem(itemId, true);
  }

  private async updateStatus(candidate: unknown, status: ReviewStatus): Promise<void> {
    const item = this.findItemFromCandidate(candidate);
    if (!item) {
      return;
    }

    item.status = status;
    item.updatedAt = new Date().toISOString();
    await this.persistAndRefresh();
  }

  private async deleteItem(candidate: unknown): Promise<void> {
    const draftThread = this.findDraftThread(candidate);
    if (draftThread) {
      draftThread.dispose();
      return;
    }

    const item = this.findItemFromCandidate(candidate);
    if (!item) {
      return;
    }

    this.disposeThread(item.id);
    this.requireState().items = this.requireState().items.filter((existing) => existing.id !== item.id);
    await this.persistAndRefresh();
  }

  private async editItem(candidate: unknown): Promise<void> {
    const inlineComment = candidate instanceof ReviewComment ? candidate : undefined;
    if (inlineComment) {
      this.editCommentInline(inlineComment);
      return;
    }

    const item = this.findItemFromCandidate(candidate);
    if (!item) {
      return;
    }

    const revealed = await this.revealItem(item.id, true);
    if (!revealed) {
      return;
    }

    const current = this.ensureThreadForItem(item).comments[0];
    if (current instanceof ReviewComment) {
      this.editCommentInline(current);
    }
  }

  private async copyItem(candidate: unknown): Promise<void> {
    const item = this.findItemFromCandidate(candidate);
    if (!item) {
      return;
    }

    await vscode.env.clipboard.writeText(item.body);
    vscode.window.showInformationMessage(`Copied ${item.id}`);
  }

  private async updateGroup(candidate: unknown, status: ReviewStatus): Promise<void> {
    const group = nodeToGroup(candidate);
    if (!group) {
      return;
    }

    const now = new Date().toISOString();
    for (const item of this.itemsForGroup(group)) {
      if (status === 'resolved') {
        if (item.status !== 'dismissed' && item.status !== 'resolved') {
          item.status = 'resolved';
          item.updatedAt = now;
        }
        continue;
      }

      if (item.status !== status) {
        item.status = status;
        item.updatedAt = now;
      }
    }
    await this.persistAndRefresh();
  }

  private async deleteGroup(candidate: unknown): Promise<void> {
    const group = nodeToGroup(candidate);
    if (!group) {
      return;
    }

    const items = this.itemsForGroup(group);

    const confirmation = await vscode.window.showWarningMessage(
      `Delete this local review and its ${items.length} note${items.length === 1 ? '' : 's'}?`,
      { modal: true },
      'Delete'
    );
    if (confirmation !== 'Delete') {
      return;
    }

    for (const item of items) {
      this.disposeThread(item.id);
    }
    const itemIds = new Set(items.map((item) => item.id));
    this.requireState().items = this.requireState().items.filter((item) => !itemIds.has(item.id));
    this.requireState().sessions = this.requireState().sessions.filter((session) => session.id !== group);
    if (this.requireState().activeSessionId === group) {
      const nextActive = this.requireState().sessions[0];
      this.requireState().activeSessionId = nextActive?.id;
      this.requireState().sessions = this.requireState().sessions.map((session) => ({
        ...session,
        active: session.id === nextActive?.id
      }));
    }
    await this.persistAndRefresh();
  }

  private async exportMarkdown(): Promise<void> {
    const state = this.requireState();
    const sessionId = this.exportSessionId();
    await this.ensureExportRepositoryContext(sessionId);
    const markdown = generateMarkdownExport(state, { sessionId });
    const exportTarget = this.exportTarget(sessionId);
    if (!exportTarget) {
      vscode.window.showWarningMessage('Open a workspace folder before exporting review Markdown.');
      return;
    }

    await vscode.workspace.fs.createDirectory(exportTarget.directoryUri);
    await vscode.workspace.fs.writeFile(exportTarget.fileUri, Buffer.from(markdown, 'utf8'));
    const document = await vscode.workspace.openTextDocument(exportTarget.fileUri);
    await vscode.window.showTextDocument(document, { preview: false });
  }

  private async createItem(uri: vscode.Uri, vscodeRange: vscode.Range, body: string): Promise<ReviewItem> {
    const state = this.requireState();
    const document = await vscode.workspace.openTextDocument(uri);
    const range = fromVscodeRange(vscodeRange);
    const lines = documentLines(document);
    const session = ensureActiveSession(state);
    const now = new Date().toISOString();
    const item: ReviewItem = {
      id: nextItemId(state),
      sessionId: session.id,
      filePath: workspaceRelativePath(uri),
      fileUri: uri.toString(),
      range,
      body,
      status: 'open',
      createdAt: now,
      updatedAt: now,
      anchor: createAnchor(lines, range)
    };
    state.items.push(item);
    return item;
  }

  private async reanchorAllItems(): Promise<void> {
    let changed = false;

    for (const document of vscode.workspace.textDocuments) {
      if (document.uri.scheme === 'file') {
        changed = this.reanchorItemsForDocument(document) || changed;
      }
    }

    if (changed) {
      await this.persistAndRefresh();
    }
  }

  private async reanchorSavedDocument(document: vscode.TextDocument): Promise<void> {
    if (document.uri.scheme !== 'file' || !this.state) {
      return;
    }

    const changed = this.reanchorItemsForDocument(document);
    if (changed) {
      await this.persistAndRefresh();
    } else {
      this.syncThreadsFromState();
      this.refreshDecorations();
    }
  }

  private reanchorItemsForDocument(document: vscode.TextDocument): boolean {
    const state = this.requireState();
    const uriString = document.uri.toString();
    const lines = documentLines(document);
    let changed = false;

    for (const item of state.items) {
      if (this.uriForItem(item).toString() !== uriString) {
        continue;
      }

      const resolution = resolveAnchor(lines, item.range, item.anchor);
      if (resolution.stale && item.status === 'open') {
        item.status = 'stale';
        item.updatedAt = new Date().toISOString();
        changed = true;
      }
      if (!resolution.stale && rangesDiffer(item.range, resolution.range)) {
        item.range = resolution.range;
        item.updatedAt = new Date().toISOString();
        changed = true;
      }
    }

    return changed;
  }

  private markMissingItemsStale(uriString: string): boolean {
    const state = this.requireState();
    let changed = false;

    for (const item of state.items) {
      if (this.uriForItem(item).toString() !== uriString) {
        continue;
      }
      if (item.status === 'open') {
        item.status = 'stale';
        item.updatedAt = new Date().toISOString();
        changed = true;
      }
    }

    return changed;
  }

  private async persistAndRefresh(): Promise<void> {
    const state = this.requireState();
    await this.requireStore().save(state);
    this.explorer?.update(state);
    this.syncThreadsFromState();
    this.refreshDecorations();
  }

  private syncThreadsFromState(): void {
    const controller = this.requireController();
    const visibleItems = selectVisibleThreadItems(this.requireState().items);
    const activeIds = new Set(visibleItems.map((item) => item.id));

    for (const [itemId, thread] of this.threads) {
      if (!activeIds.has(itemId)) {
        thread.dispose();
        this.threads.delete(itemId);
      }
    }

    for (const item of visibleItems) {
      let thread = this.threads.get(item.id);
      if (!thread) {
        thread = controller.createCommentThread(this.uriForItem(item), toVscodeRange(item.range), []);
        this.threads.set(item.id, thread);
        this.threadToItem.set(thread, item.id);
      }
      this.attachThreadToItem(thread, item);
    }
  }

  private attachThreadToItem(thread: vscode.CommentThread, item: ReviewItem): void {
    const current = thread.comments[0];
    const preservesEditing = current instanceof ReviewComment
      && current.itemId === item.id
      && current.mode === vscode.CommentMode.Editing;

    this.threads.set(item.id, thread);
    this.threadToItem.set(thread, item.id);
    thread.range = toVscodeRange(item.range);
    thread.canReply = false;
    if (!preservesEditing) {
      thread.collapsibleState = vscode.CommentThreadCollapsibleState.Collapsed;
    }
    thread.contextValue = threadContextValue(item.status);
    thread.state = item.status === 'resolved'
      ? vscode.CommentThreadState.Resolved
      : vscode.CommentThreadState.Unresolved;
    thread.label = buildThreadLabel(item);

    const reviewComment = current instanceof ReviewComment && current.itemId === item.id
      ? current
      : new ReviewComment(item.id, thread, item.body, new Date(item.updatedAt));
    reviewComment.parent = thread;
    if (!preservesEditing) {
      reviewComment.sync(item);
    }
    thread.comments = [reviewComment];
  }

  private ensureThreadForItem(item: ReviewItem): vscode.CommentThread {
    let thread = this.threads.get(item.id);
    if (!thread) {
      thread = this.requireController().createCommentThread(this.uriForItem(item), toVscodeRange(item.range), []);
      this.attachThreadToItem(thread, item);
    }
    return thread;
  }

  private async revealItem(itemId: string | undefined, expandThread: boolean): Promise<boolean> {
    const item = itemId ? this.findItem(itemId) : undefined;
    if (!item) {
      return false;
    }

    const uri = this.uriForItem(item);
    let document: vscode.TextDocument;
    try {
      document = await vscode.workspace.openTextDocument(uri);
    } catch (error) {
      if (!isFileMissingError(error)) {
        throw error;
      }

      const changed = this.markMissingItemsStale(uri.toString());
      if (changed) {
        await this.persistAndRefresh();
      }
      vscode.window.showWarningMessage(`Marked ${item.id} stale because its file no longer exists.`);
      return false;
    }

    const changed = this.reanchorItemsForDocument(document);
    if (changed) {
      await this.persistAndRefresh();
    }

    const editor = await vscode.window.showTextDocument(document, { preserveFocus: !expandThread });
    const range = toVscodeRange(item.range);
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(
      range,
      expandThread ? vscode.TextEditorRevealType.InCenter : vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );

    if (expandThread && item.status !== 'dismissed') {
      const thread = this.ensureThreadForItem(item);
      thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
    }
    return true;
  }

  private createDraftThread(uri: vscode.Uri, range: vscode.Range): void {
    const controller = this.requireController();
    const thread = controller.createCommentThread(uri, range, []);
    thread.canReply = true;
    thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
    thread.contextValue = THREAD_CONTEXT_DRAFT;
    thread.label = 'Draft review';
  }

  private refreshDecorations(): void {
    if (!this.state) {
      return;
    }

    for (const editor of vscode.window.visibleTextEditors) {
      const editorUri = editor.document.uri.toString();
      const openRanges: vscode.Range[] = [];
      const staleRanges: vscode.Range[] = [];
      const resolvedRanges: vscode.Range[] = [];

      for (const item of this.state.items) {
        if (this.uriForItem(item).toString() !== editorUri || item.status === 'dismissed') {
          continue;
        }

        const range = toVscodeRange(item.range);
        if (item.status === 'stale') {
          staleRanges.push(range);
        } else if (item.status === 'resolved') {
          resolvedRanges.push(range);
        } else {
          openRanges.push(range);
        }
      }

      editor.setDecorations(this.openRangeDecoration, openRanges);
      editor.setDecorations(this.staleRangeDecoration, staleRanges);
      editor.setDecorations(this.resolvedRangeDecoration, resolvedRanges);
    }
  }

  private findItemFromCandidate(candidate: unknown): ReviewItem | undefined {
    return this.findItem(this.itemIdFromCandidate(candidate));
  }

  private itemIdFromCandidate(candidate: unknown): string | undefined {
    const nodeItemId = nodeToItemId(candidate);
    if (nodeItemId) {
      return nodeItemId;
    }
    if (candidate instanceof ReviewComment) {
      return candidate.itemId;
    }
    const thread = asCommentThread(candidate) ?? asCommentReply(candidate)?.thread;
    return thread ? this.threadToItem.get(thread) : undefined;
  }

  private findDraftThread(candidate: unknown): vscode.CommentThread | undefined {
    const thread = asCommentThread(candidate) ?? asCommentReply(candidate)?.thread;
    if (!thread) {
      return undefined;
    }
    return this.threadToItem.get(thread) ? undefined : thread;
  }

  private findItem(itemId?: string): ReviewItem | undefined {
    if (!itemId) {
      return undefined;
    }
    return this.requireState().items.find((item) => item.id === itemId);
  }

  private itemsForGroup(group: ReviewGroup): ReviewItem[] {
    return this.requireState().items.filter((item) => item.sessionId === group);
  }

  private async moveItemsToReview(itemIds: readonly string[], targetReviewId: string): Promise<void> {
    const state = this.requireState();
    const targetExists = state.sessions.some((session) => session.id === targetReviewId);
    if (!targetExists) {
      return;
    }

    const now = new Date().toISOString();
    let changed = false;
    for (const item of state.items) {
      if (!itemIds.includes(item.id) || item.sessionId === targetReviewId) {
        continue;
      }
      item.sessionId = targetReviewId;
      item.updatedAt = now;
      changed = true;
    }

    if (changed) {
      await this.persistAndRefresh();
    }
  }

  private disposeThread(itemId: string): void {
    const thread = this.threads.get(itemId);
    if (!thread) {
      return;
    }
    thread.dispose();
    this.threads.delete(itemId);
  }

  private uriForItem(item: ReviewItem): vscode.Uri {
    if (item.fileUri) {
      return vscode.Uri.parse(item.fileUri);
    }
    const workspaceFolder = activeWorkspaceFolder();
    return workspaceFolder ? vscode.Uri.joinPath(workspaceFolder.uri, item.filePath) : vscode.Uri.file(item.filePath);
  }

  private requireState(): ReviewState {
    if (!this.state) {
      throw new Error('Local Review extension state has not been initialized.');
    }
    return this.state;
  }

  private requireStore(): ReviewStore {
    if (!this.store) {
      throw new Error('Local Review store has not been initialized.');
    }
    return this.store;
  }

  private requireController(): vscode.CommentController {
    if (!this.controller) {
      throw new Error('Local Review comment controller has not been initialized.');
    }
    return this.controller;
  }

  private exportSessionId(): string | undefined {
    const state = this.requireState();
    if (this.selectedReviewId && state.sessions.some((session) => session.id === this.selectedReviewId)) {
      return this.selectedReviewId;
    }
    return state.activeSessionId;
  }

  private async ensureExportRepositoryContext(sessionId?: string): Promise<void> {
    const state = this.requireState();
    const session = state.sessions.find((candidate) => candidate.id === sessionId);
    if (!session || session.repository?.root) {
      return;
    }

    const workspaceFolder = this.workspaceFolderForSession(session.id) ?? activeWorkspaceFolder();
    const repository = await readRepositoryContext(workspaceFolder);
    if (!repository) {
      return;
    }

    session.repository = repository;
    session.updatedAt = new Date().toISOString();
    await this.requireStore().save(state);
  }

  private workspaceFolderForSession(sessionId: string): vscode.WorkspaceFolder | undefined {
    const item = this.requireState().items.find((candidate) => candidate.sessionId === sessionId);
    if (!item) {
      return undefined;
    }
    return vscode.workspace.getWorkspaceFolder(this.uriForItem(item));
  }

  private exportTarget(sessionId?: string): { directoryUri: vscode.Uri; fileUri: vscode.Uri } | undefined {
    const state = this.requireState();
    const session = sessionId ? state.sessions.find((candidate) => candidate.id === sessionId) : undefined;
    const workspaceFolder = sessionId ? this.workspaceFolderForSession(sessionId) : undefined;
    const root = workspaceFolder ?? activeWorkspaceFolder();
    if (!root) {
      return undefined;
    }

    const filename = `${slugFilePart(session?.title ?? 'local-review')}-${session?.id ?? 'all'}.md`;
    const directoryUri = vscode.Uri.joinPath(root.uri, '.review');
    return { directoryUri, fileUri: vscode.Uri.joinPath(directoryUri, filename) };
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const extension = new CodeReviewExtension(context);
  context.subscriptions.push(extension);
  await extension.initialize();
}

export function deactivate(): void {}

function activeWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri) {
    return vscode.workspace.getWorkspaceFolder(activeUri);
  }
  return vscode.workspace.workspaceFolders?.[0];
}

function slugFilePart(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'local-review';
}


function workspaceRelativePath(uri: vscode.Uri): string {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  if (!workspaceFolder || uri.scheme !== workspaceFolder.uri.scheme) {
    return uri.fsPath || uri.toString();
  }
  return path.posix.normalize(path.relative(workspaceFolder.uri.fsPath, uri.fsPath).split(path.sep).join(path.posix.sep));
}

function documentLines(document: vscode.TextDocument): string[] {
  const lines: string[] = [];
  for (let line = 0; line < document.lineCount; line += 1) {
    lines.push(document.lineAt(line).text);
  }
  return lines;
}

function buildThreadLabel(item: ReviewItem): string {
  const parts = [item.id];
  if (item.status === 'stale') {
    parts.push('stale');
  }
  return parts.join(' · ');
}

function threadContextValue(status: ReviewStatus): string {
  switch (status) {
    case 'resolved':
      return THREAD_CONTEXT_RESOLVED;
    case 'stale':
      return THREAD_CONTEXT_STALE;
    case 'dismissed':
      return THREAD_CONTEXT_RESOLVED;
    case 'open':
      return THREAD_CONTEXT_OPEN;
  }
}

function commentBodyText(body: string | vscode.MarkdownString): string {
  return typeof body === 'string' ? body : body.value;
}

function asCommentThread(candidate: unknown): vscode.CommentThread | undefined {
  if (typeof candidate !== 'object' || candidate === null) {
    return undefined;
  }
  if (!('uri' in candidate) || !('comments' in candidate) || !('dispose' in candidate)) {
    return undefined;
  }
  return candidate as vscode.CommentThread;
}

function asCommentReply(candidate: unknown): vscode.CommentReply | undefined {
  if (typeof candidate !== 'object' || candidate === null) {
    return undefined;
  }
  if (!('thread' in candidate) || !('text' in candidate)) {
    return undefined;
  }
  return candidate as vscode.CommentReply;
}

function fromVscodeRange(range: vscode.Range): ReviewRange {
  return {
    startLine: range.start.line,
    startCharacter: range.start.character,
    endLine: range.end.line,
    endCharacter: range.end.character
  };
}

function toVscodeRange(range: ReviewRange): vscode.Range {
  return new vscode.Range(range.startLine, range.startCharacter, range.endLine, range.endCharacter);
}

function rangesDiffer(left: ReviewRange, right: ReviewRange): boolean {
  return left.startLine !== right.startLine
    || left.startCharacter !== right.startCharacter
    || left.endLine !== right.endLine
    || left.endCharacter !== right.endCharacter;
}

async function readDraggedItemIds(item: vscode.DataTransferItem | undefined): Promise<string[]> {
  if (!item) {
    return [];
  }

  if (Array.isArray(item.value)) {
    return item.value.filter((value): value is string => typeof value === 'string');
  }

  const raw = await item.asString();
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

function selectedReviewIdFromNodes(nodes: readonly ReviewExplorerNode[]): string | undefined {
  const first = nodes[0];
  return first?.group ?? first?.item?.sessionId;
}

function selectedItemIdFromNodes(nodes: readonly ReviewExplorerNode[]): string | undefined {
  return nodes[0]?.item?.id;
}
