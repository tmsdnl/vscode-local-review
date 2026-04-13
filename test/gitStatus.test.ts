import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePorcelainStatus } from '../src/gitStatus';

test('parsePorcelainStatus parses nul-delimited porcelain records', () => {
  const output = [
    ' M src/a.ts',
    '?? src/new file.ts',
    'R  src/new-name.ts',
    'src/old-name.ts',
    'C  src/copy.ts',
    'src/source.ts'
  ].join('\0') + '\0';

  assert.deepEqual(parsePorcelainStatus(output), [
    'src/a.ts',
    'src/new file.ts',
    'src/new-name.ts',
    'src/copy.ts'
  ]);
});
