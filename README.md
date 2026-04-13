# Local Review to Markdown

Capture local inline review notes in VS Code and export them as Markdown for handoff.

Local Review to Markdown stores canonical review state in VS Code workspace extension storage. It does not write review state into project files. Markdown exports are written to `.review/` only when export is run.

## Use

1. Open a file-backed workspace.
2. Use the editor gutter comment action, or select code and run `Local Review: Add Review Note`.
3. Write the review note in the native VS Code comments UI.
4. Open the `Local Review` Activity Bar view to open, resolve, reopen, dismiss, copy, delete, or move notes between local reviews.
5. Run `Local Review: Export Markdown` from the view title or command palette.

The exported Markdown includes open and stale notes, file locations, excerpts, and Git metadata when the workspace is trusted and Git is available.

## Privacy

Review state stays on the local machine in VS Code workspace extension storage. The extension has no telemetry and no network service integration.

In untrusted workspaces, Git metadata capture is disabled. Local review notes and Markdown export still work for file-backed workspaces.

## Limitations

- Virtual workspaces are not supported.
- Reviews are local to the VS Code workspace storage.
- Exported Markdown is written into `.review/` in the workspace folder.
- Resolved and dismissed notes are kept in local state but omitted from the default Markdown export.

## Development

```sh
pnpm install
pnpm run compile
pnpm run lint
pnpm test
pnpm run test:integration
```

To package locally:

```sh
pnpm run package:list
pnpm run package:vsix
```

## Release

Prepare the next release locally with an automatic semver bump and generated changelog section:

```sh
pnpm release:prepare patch
```

The command requires a clean git worktree, updates `package.json`, prepends a new `CHANGELOG.md` section from commit subjects since the last release tag, creates a `chore(release): vX.Y.Z` commit, and creates the matching local tag.

After reviewing the generated changelog, push the commit and tag. GitHub Actions will build the VSIX and publish the GitHub Release using the matching `CHANGELOG.md` section as the release notes.
