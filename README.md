# Code Review

Local-first VS Code inline review extension. It captures editor-anchored review
comments, stores canonical JSON state in workspace-specific extension storage,
and exports agent-ready Markdown review context.

## Development

```sh
pnpm install
pnpm run compile
pnpm test
```

## Try It Locally

Open this repository in VS Code and run the `Run Extension` debug configuration,
or press `F5`. That launches an Extension Development Host with the extension
loaded.

In the development host:

1. Open a file.
2. Use the gutter `+` to start a native review comment, or select code and run `Add Comment`.
3. Enter the comment in the native inline comments widget.
4. Open the `Code Review` Activity Bar view to manage reviews. Items are grouped
   by code review, with per-item actions for open, resolve, reopen, dismiss,
   copy, and delete. Drag items between code reviews to move them.
5. Use the code review header actions to resolve or delete a whole code review.
6. Run `Export Markdown` from the side pane title bar or command palette to
   write the selected review to `.review/` and open it in an editor tab.

Canonical review state is stored in VS Code workspace-specific extension
storage.

The extension uses VS Code's native Comments API for creation, so review
threads also appear in the built-in `Comments` panel.

New code reviews are always workspace reviews. Git metadata is captured
automatically whenever the active workspace folder is inside a Git repository.
