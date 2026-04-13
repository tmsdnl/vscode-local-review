import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import {
  buildChangelogSection,
  bumpStableVersion,
  extractReleaseNotes,
  insertChangelogSection,
  validateReleaseTag,
  type ReleaseBump
} from '../src/release';

type PackageManifest = {
  version: string;
  [key: string]: unknown;
};

const repositoryRoot = path.resolve(__dirname, '../..');

function readTextFile(relativePath: string): string {
  return readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

function writeTextFile(relativePath: string, contents: string): void {
  writeFileSync(path.join(repositoryRoot, relativePath), contents, 'utf8');
}

function readPackageManifest(): PackageManifest {
  return JSON.parse(readTextFile('package.json')) as PackageManifest;
}

function writePackageManifest(manifest: PackageManifest): void {
  writeTextFile('package.json', `${JSON.stringify(manifest, null, 2)}\n`);
}

function readGit(args: string[]): string {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function runGit(args: string[]): void {
  execFileSync('git', args, {
    cwd: repositoryRoot,
    stdio: 'inherit'
  });
}

function ensureCleanWorktree(): void {
  const statusOutput = readGit(['status', '--porcelain', '--untracked-files=all']);
  if (statusOutput.length > 0) {
    throw new Error('Release prep requires a clean git worktree.');
  }
}

function getCurrentBranch(): string | null {
  const branch = readGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  return branch === 'HEAD' ? null : branch;
}

function getPreviousReleaseTag(): string | null {
  const result = spawnSync('git', ['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*.[0-9]*.[0-9]*'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (result.status !== 0) {
    return null;
  }

  const tag = result.stdout.trim();
  return tag.length > 0 ? tag : null;
}

function getCommitSubjects(previousReleaseTag: string | null): string[] {
  const args = ['log', '--format=%s', '--reverse', '--no-merges'];
  if (previousReleaseTag) {
    args.push(`${previousReleaseTag}..HEAD`);
  }

  const output = readGit(args);
  return output
    .split('\n')
    .map((subject) => subject.trim())
    .filter((subject) => subject.length > 0);
}

function requireReleaseBump(value: string | undefined): ReleaseBump {
  switch (value) {
    case 'patch':
    case 'minor':
    case 'major':
      return value;
    default:
      throw new Error('Usage: node ./dist/scripts/release.js prepare <patch|minor|major>');
  }
}

function requireTag(value: string | undefined): string {
  if (!value) {
    throw new Error('Usage: node ./dist/scripts/release.js notes <vX.Y.Z>');
  }

  return value;
}

function runPrepare(releaseBump: ReleaseBump): void {
  ensureCleanWorktree();

  const manifest = readPackageManifest();
  const nextVersion = bumpStableVersion(manifest.version, releaseBump);
  const previousReleaseTag = getPreviousReleaseTag();
  const commitSubjects = getCommitSubjects(previousReleaseTag);
  const changelogSection = buildChangelogSection(nextVersion, commitSubjects);
  const nextChangelog = insertChangelogSection(readTextFile('CHANGELOG.md'), nextVersion, changelogSection);

  writePackageManifest({ ...manifest, version: nextVersion });
  writeTextFile('CHANGELOG.md', nextChangelog);

  const tag = `v${nextVersion}`;
  runGit(['add', 'package.json', 'CHANGELOG.md']);
  runGit(['commit', '-m', `chore(release): ${tag}`]);
  runGit(['tag', tag]);

  const currentBranch = getCurrentBranch();
  const pushTarget = currentBranch ? `git push origin ${currentBranch}` : 'git push origin <branch-name>';
  console.log(`Prepared ${tag}. Review CHANGELOG.md if needed, then push:\n  ${pushTarget}\n  git push origin ${tag}`);
}

function runNotes(tag: string): void {
  const manifest = readPackageManifest();
  const version = validateReleaseTag(tag, manifest.version);
  const notes = extractReleaseNotes(readTextFile('CHANGELOG.md'), version);
  process.stdout.write(`${notes}\n`);
}

function main(): void {
  const [command, value] = process.argv.slice(2);

  switch (command) {
    case 'prepare':
      runPrepare(requireReleaseBump(value));
      return;
    case 'notes':
      runNotes(requireTag(value));
      return;
    default:
      throw new Error('Usage: node ./dist/scripts/release.js <prepare|notes> ...');
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
