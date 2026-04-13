import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '../..');
  const extensionTestsPath = path.resolve(__dirname, './suite/index');
  const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-local-review-test-'));

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    version: '1.100.0',
    launchArgs: [workspacePath, '--disable-extensions']
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
