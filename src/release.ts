export type ReleaseBump = 'patch' | 'minor' | 'major';

type ReleaseBucket = 'Features' | 'Fixes' | 'Other Changes';

const CHANGELOG_TITLE = '# Changelog';
const STABLE_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const STABLE_TAG_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const RELEASE_BUCKETS: readonly ReleaseBucket[] = ['Features', 'Fixes', 'Other Changes'];

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function parseStableVersion(version: string): [number, number, number] {
  const match = version.match(STABLE_VERSION_PATTERN);
  if (!match) {
    throw new Error(`Expected a stable semver version, received "${version}".`);
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function bumpStableVersion(version: string, releaseBump: ReleaseBump): string {
  const [major, minor, patch] = parseStableVersion(version);

  switch (releaseBump) {
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'major':
      return `${major + 1}.0.0`;
  }
}

export function parseReleaseTag(tag: string): string {
  const match = tag.match(STABLE_TAG_PATTERN);
  if (!match) {
    throw new Error(`Expected a release tag in the form vX.Y.Z, received "${tag}".`);
  }

  return `${match[1]}.${match[2]}.${match[3]}`;
}

export function validateReleaseTag(tag: string, version: string): string {
  const parsedVersion = parseReleaseTag(tag);
  const packageVersion = parseStableVersion(version).join('.');

  if (parsedVersion !== packageVersion) {
    throw new Error(`Release tag "${tag}" does not match package.json version "${version}".`);
  }

  return parsedVersion;
}

export function summarizeCommitSubject(subject: string): { bucket: ReleaseBucket; summary: string } {
  const trimmed = subject.trim();
  if (!trimmed) {
    throw new Error('Commit subjects must not be empty.');
  }

  const match = trimmed.match(/^([a-z]+)(?:\([^)]*\))?(!)?:\s+(.+)$/i);
  if (!match) {
    return { bucket: 'Other Changes', summary: trimmed };
  }

  const type = match[1].toLowerCase();
  const breakingMarker = match[2] ? ' [breaking]' : '';
  const summary = `${match[3].trim()}${breakingMarker}`;

  switch (type) {
    case 'feat':
      return { bucket: 'Features', summary };
    case 'fix':
      return { bucket: 'Fixes', summary };
    default:
      return { bucket: 'Other Changes', summary };
  }
}

export function buildChangelogSection(version: string, commitSubjects: readonly string[]): string {
  parseStableVersion(version);

  if (commitSubjects.length === 0) {
    throw new Error('Release prep requires at least one commit subject to build the changelog.');
  }

  const buckets: Record<ReleaseBucket, string[]> = {
    Features: [],
    Fixes: [],
    'Other Changes': []
  };

  for (const subject of commitSubjects) {
    const { bucket, summary } = summarizeCommitSubject(subject);
    buckets[bucket].push(summary);
  }

  if (RELEASE_BUCKETS.every((bucket) => buckets[bucket].length === 0)) {
    throw new Error('Release prep could not derive changelog entries from the commit history.');
  }

  const lines: string[] = [`## ${version}`, ''];
  for (const bucket of RELEASE_BUCKETS) {
    const entries = buckets[bucket];
    if (entries.length === 0) {
      continue;
    }

    lines.push(`### ${bucket}`);
    for (const entry of entries) {
      lines.push(`- ${entry}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

export function insertChangelogSection(changelog: string, version: string, section: string): string {
  parseStableVersion(version);

  const normalized = normalizeLineEndings(changelog);
  const lines = normalized.split('\n');

  if (lines[0] !== CHANGELOG_TITLE) {
    throw new Error(`Expected ${JSON.stringify(CHANGELOG_TITLE)} at the top of CHANGELOG.md.`);
  }

  if (lines.some((line) => line.trim() === `## ${version}`)) {
    throw new Error(`CHANGELOG.md already contains a section for ${version}.`);
  }

  const body = lines.slice(1).join('\n').replace(/^\n*/, '');
  const nextSection = section.trim();

  return body.length > 0
    ? `${CHANGELOG_TITLE}\n\n${nextSection}\n\n${body}`
    : `${CHANGELOG_TITLE}\n\n${nextSection}\n`;
}

export function extractReleaseNotes(changelog: string, version: string): string {
  parseStableVersion(version);

  const normalized = normalizeLineEndings(changelog);
  const lines = normalized.split('\n');
  const heading = `## ${version}`;
  const startIndex = lines.findIndex((line) => line.trim() === heading);

  if (startIndex === -1) {
    throw new Error(`CHANGELOG.md does not contain a section for ${version}.`);
  }

  const bodyLines: string[] = [];
  for (const line of lines.slice(startIndex + 1)) {
    if (/^##\s+/.test(line)) {
      break;
    }

    bodyLines.push(line);
  }

  const notes = bodyLines.join('\n').trim();
  if (!notes) {
    throw new Error(`CHANGELOG.md section ${version} does not contain release notes.`);
  }

  return notes;
}
