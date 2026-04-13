import assert from 'node:assert/strict';
import * as vscode from 'vscode';

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension('tmsdnl.vscode-local-review');
  assert.ok(extension, 'expected the Code Review extension to be installed in the extension host');

  await extension.activate();

  const commands = await vscode.commands.getCommands(true);
  for (const command of [
    'codeReview.startSession',
    'codeReview.addComment',
    'codeReview.createComment',
    'codeReview.editComment',
    'codeReview.saveComment',
    'codeReview.cancelComment',
    'codeReview.exportMarkdown',
    'codeReview.editItem',
    'codeReview.copyItem',
    'codeReview.resolveGroup',
    'codeReview.deleteGroup'
  ]) {
    assert.ok(commands.includes(command), `expected command to be registered: ${command}`);
  }
}
