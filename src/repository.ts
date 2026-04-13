import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as vscode from 'vscode';
import { parsePorcelainStatus } from './gitStatus';
import type { RepositoryContext } from './model';

const execFileAsync = promisify(execFile);

export async function readRepositoryContext(workspaceFolder?: vscode.WorkspaceFolder): Promise<RepositoryContext | undefined> {
  if (!vscode.workspace.isTrusted || !workspaceFolder || workspaceFolder.uri.scheme !== 'file') {
    return undefined;
  }

  try {
    const cwd = workspaceFolder.uri.fsPath;
    const [root, branch, head, changedFiles] = await Promise.all([
      git(cwd, ['rev-parse', '--show-toplevel']),
      git(cwd, ['branch', '--show-current']),
      git(cwd, ['rev-parse', 'HEAD']),
      git(cwd, ['status', '--porcelain=v1', '-z'])
    ]);

    return {
      root: root.trim() || cwd,
      branch: branch.trim() || undefined,
      head: head.trim() || undefined,
      changedFiles: parsePorcelainStatus(changedFiles)
    };
  } catch {
    return undefined;
  }
}

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', [...args], { cwd, timeout: 1500 });
  return stdout;
}
