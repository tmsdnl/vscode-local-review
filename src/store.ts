import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { normalizeReviewState, ReviewState } from './model';
import { stableStringify } from './stableJson';
import { isFileMissingError } from './storeErrors';

export class ReviewStore {
  private readonly fileUri: vscode.Uri;
  private saveQueue: Promise<void> = Promise.resolve();

  constructor(private readonly storageUri: vscode.Uri) {
    this.fileUri = vscode.Uri.joinPath(storageUri, 'review-state.v1.json');
  }

  get uri(): vscode.Uri {
    return this.fileUri;
  }

  async load(): Promise<ReviewState> {
    try {
      const bytes = await vscode.workspace.fs.readFile(this.fileUri);
      return normalizeReviewState(JSON.parse(Buffer.from(bytes).toString('utf8')));
    } catch (error) {
      if (isFileMissingError(error)) {
        return normalizeReviewState(undefined);
      }
      throw error;
    }
  }

  async save(state: ReviewState): Promise<void> {
    const payload = `${stableStringify(state)}\n`;
    const saveOperation = this.saveQueue.then(() => this.writeState(payload));
    this.saveQueue = saveOperation.catch(() => undefined);
    return saveOperation;
  }

  private async writeState(payload: string): Promise<void> {
    await vscode.workspace.fs.createDirectory(this.storageUri);
    const tempUri = vscode.Uri.joinPath(this.storageUri, `review-state.v1.${randomUUID()}.tmp`);
    await vscode.workspace.fs.writeFile(tempUri, Buffer.from(payload, 'utf8'));
    await vscode.workspace.fs.rename(tempUri, this.fileUri, { overwrite: true });
  }
}
