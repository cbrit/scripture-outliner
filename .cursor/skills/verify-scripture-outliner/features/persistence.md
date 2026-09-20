# Persistence

The current document (title, words, segments, selection) is saved to `localStorage` and restored when the page reloads. One document at a time.

## Sub-features

- `persist-save` writes `scripture-outliner.document.v1` after import and after Section.
- `persist-reload` restores title, words, and inline headers after a full reload.
- `persist-new` **New** (after confirm) returns to import and clears storage.

## How to get to it (user POV)

- Import or load a sample, mark a section, reload the tab.
- Choose **New** and confirm to throw away the document.

## Driving it with verify-so

Preconditions:

- Preview origin is the launched `127.0.0.1` port (storage is origin-scoped).

- **Save.** Load sample, select a word, choose **Section**. Run `drive.mjs persistence` or the same clicks. `page.evaluate(() => localStorage.getItem("scripture-outliner.document.v1"))` is non-null JSON with `passage.title` equal to `Sample` and `segments.length >= 1`. Depth is a number (legacy `0 | 1` still parses).
- **Reload.** `page.reload()`. `title-input` is still `Sample`. At least one `section-header` exists. `import-view` is hidden.
- **New.** Choose **New** and accept the confirm. Run `page.getByTestId("new-document").click()` with a dialog handler that accepts. `import-view` is visible. Storage key is gone.
- **Proof.** `drive.mjs persistence` writes `evidence/persistence/reload.png` after reload, with title and an inline header still present.

## Gotchas

- Storage key is exactly `scripture-outliner.document.v1`. A different origin (localhost vs 127.0.0.1, or another port) is a different document.
- **New** skips the confirm when there are no segments. After Section, the confirm appears.
- Invalid JSON in storage is treated as no document (import screen). Do not hand-edit the key in a proof.
- This is not a multi-doc library. A second import replaces the one document.
- Older documents may still include a `viewMode` field; it is ignored on load and omitted on the next save.
