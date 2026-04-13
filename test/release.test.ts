import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildChangelogSection,
  bumpStableVersion,
  extractReleaseNotes,
  insertChangelogSection,
  parseReleaseTag,
  summarizeCommitSubject,
  validateReleaseTag
} from '../src/release';

test('bumpStableVersion increments patch, minor, and major releases', () => {
  assert.equal(bumpStableVersion('0.1.0', 'patch'), '0.1.1');
  assert.equal(bumpStableVersion('0.1.0', 'minor'), '0.2.0');
  assert.equal(bumpStableVersion('0.1.0', 'major'), '1.0.0');
});

test('parseReleaseTag accepts stable release tags only', () => {
  assert.equal(parseReleaseTag('v1.2.3'), '1.2.3');
  assert.throws(() => parseReleaseTag('1.2.3'), /vX\.Y\.Z/);
  assert.throws(() => parseReleaseTag('v1.2.3-beta.1'), /vX\.Y\.Z/);
});

test('validateReleaseTag requires an exact package version match', () => {
  assert.equal(validateReleaseTag('v0.1.0', '0.1.0'), '0.1.0');
  assert.throws(() => validateReleaseTag('v0.1.1', '0.1.0'), /does not match package\.json version/);
});

test('summarizeCommitSubject groups conventional commits into release buckets', () => {
  assert.deepEqual(summarizeCommitSubject('feat(export): add grouped markdown output'), {
    bucket: 'Features',
    summary: 'add grouped markdown output'
  });
  assert.deepEqual(summarizeCommitSubject('fix: preserve stale note locations'), {
    bucket: 'Fixes',
    summary: 'preserve stale note locations'
  });
  assert.deepEqual(summarizeCommitSubject('docs: explain export privacy model'), {
    bucket: 'Other Changes',
    summary: 'explain export privacy model'
  });
  assert.deepEqual(summarizeCommitSubject('refine release workflow copy'), {
    bucket: 'Other Changes',
    summary: 'refine release workflow copy'
  });
});

test('buildChangelogSection creates grouped notes from commit subjects', () => {
  const section = buildChangelogSection('0.2.0', [
    'feat: add release workflow',
    'fix(ci): rerun uploads with clobber',
    'docs: add maintainer release steps',
    'cleanup commit message'
  ]);

  assert.equal(
    section,
    [
      '## 0.2.0',
      '',
      '### Features',
      '- add release workflow',
      '',
      '### Fixes',
      '- rerun uploads with clobber',
      '',
      '### Other Changes',
      '- add maintainer release steps',
      '- cleanup commit message'
    ].join('\n')
  );
});

test('insertChangelogSection adds the new release below the changelog title', () => {
  const nextChangelog = insertChangelogSection(
    ['# Changelog', '', '## 0.1.0', '', '- Initial release'].join('\n'),
    '0.1.1',
    ['## 0.1.1', '', '### Fixes', '- patch release'].join('\n')
  );

  assert.equal(
    nextChangelog,
    ['# Changelog', '', '## 0.1.1', '', '### Fixes', '- patch release', '', '## 0.1.0', '', '- Initial release'].join(
      '\n'
    )
  );
});

test('extractReleaseNotes returns the matching changelog body for a version', () => {
  const changelog = [
    '# Changelog',
    '',
    '## 0.2.0',
    '',
    '### Features',
    '- add release workflow',
    '',
    '## 0.1.0',
    '',
    '- Initial release'
  ].join('\n');

  assert.equal(extractReleaseNotes(changelog, '0.2.0'), ['### Features', '- add release workflow'].join('\n'));
  assert.throws(() => extractReleaseNotes(changelog, '0.1.1'), /does not contain a section/);
});
