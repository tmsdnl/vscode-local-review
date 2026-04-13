import assert from 'node:assert/strict';
import test from 'node:test';
import { stableStringify } from '../src/stableJson';
import { isFileMissingError } from '../src/storeErrors';

test('stableStringify sorts object keys recursively and omits undefined values', () => {
  assert.equal(
    stableStringify({ z: 1, a: { y: undefined, b: 2, a: 1 } }),
    '{\n  "a": {\n    "a": 1,\n    "b": 2\n  },\n  "z": 1\n}'
  );
});

test('isFileMissingError only accepts missing-file failures', () => {
  assert.equal(isFileMissingError({ code: 'FileNotFound', message: 'missing' }), true);
  assert.equal(isFileMissingError({ code: 'ENOENT', message: 'no such file' }), true);
  assert.equal(isFileMissingError({ code: 'NoPermissions', message: 'FileNotFound was denied' }), false);
  assert.equal(isFileMissingError({ code: 'Unavailable', message: 'ENOENT during retry' }), false);
  assert.equal(isFileMissingError(new Error('ENOENT: no such file or directory')), true);
});
