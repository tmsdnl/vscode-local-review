import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

type PackageManifest = {
  name?: unknown;
  displayName?: unknown;
  publisher?: unknown;
  private?: unknown;
  license?: unknown;
  repository?: { url?: unknown };
  bugs?: { url?: unknown };
  icon?: unknown;
  capabilities?: {
    virtualWorkspaces?: unknown;
    untrustedWorkspaces?: { supported?: unknown };
  };
};

test('package manifest is configured for Local Review to Markdown publishing', () => {
  const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as PackageManifest;

  assert.equal(manifest.name, 'local-review-md');
  assert.equal(manifest.displayName, 'Local Review to Markdown');
  assert.equal(manifest.publisher, 'tmsdnl');
  assert.equal(manifest.private, undefined);
  assert.equal(manifest.license, 'MIT');
  assert.equal(manifest.repository?.url, 'https://github.com/tmsdnl/vscode-local-review-md.git');
  assert.equal(manifest.bugs?.url, 'https://github.com/tmsdnl/vscode-local-review-md/issues');
  assert.equal(manifest.icon, 'resources/marketplace-icon.png');
  assert.equal(manifest.capabilities?.virtualWorkspaces, false);
  assert.equal(manifest.capabilities?.untrustedWorkspaces?.supported, 'limited');
});
