# Import and sample

Import lets a user paste any text or load the built-in Psalm 23 sample, then see the passage as tappable words with a title. Nothing is outlined until the user marks a range.

## Sub-features

- `import-empty` shows the paste field and both import actions on a fresh session.
- `import-paste` tokenizes pasted text into words and opens the editor.
- `import-sample` loads the sample title and word stream in one tap.
- `import-reject-empty` leaves the user on import when the textarea is empty.

## How to get to it (user POV)

- Open the app with no saved document.
- Choose **Import** after pasting into the textarea.
- Choose **Load sample (Psalm 23 KJV)**.

## Driving it with verify-so

Preconditions:

- Preview is healthy at the URL in `.run/state.json`.
- `doctor.sh` reports `OK`.
- `scripture-outliner.document.v1` is empty (drive helper clears it).

- **Empty state.** Open the preview. Run `node scripts/drive.mjs import-sample` (it asserts this first) or `page.getByTestId("import-view")`. The heading **Import a passage**, textarea `import-text`, buttons `import-submit` and `load-sample` are visible. `editor` is hidden.
- **Reject empty.** Choose **Import** with an empty field. Run `page.getByTestId("import-submit").click()`. `import-view` stays visible and no `word` nodes exist.
- **Paste import.** Fill `import-text` with `Alpha beta.` and choose **Import**. Run `page.getByTestId("import-text").fill("Alpha beta.")` then `page.getByTestId("import-submit").click()`. `title-input` is `Untitled passage`. Words `Alpha` and `beta.` exist. `load-sample` is gone.
- **Sample.** From empty import, choose **Load sample (Psalm 23 KJV)**. Run `page.getByTestId("load-sample").click()`. `title-input` contains `Psalm 23`. `passage` is visible with at least 50 `word` nodes. Word id `0` currently reads `1` (verse token). The first prose word is id `1` `The`.
- **Proof.** Capture empty and loaded states. `drive.mjs import-sample` writes `evidence/import-sample/empty.png`, `sample-loaded.png`, `*.aria.txt`, and `result.json`. Artifacts must show **Scripture Outliner** and, after load, **Psalm 23**.

## Gotchas

- A leftover `localStorage` document skips import entirely. Clear the key and reload, or the empty-state assertions fail.
- **Load sample** also fills the textarea, then imports. Assert the editor, not the textarea value.
- Empty import does not throw; it focuses the textarea. Wait for missing `word` nodes, not an error toast (there is none).
- Local preview uses `VITE_BASE=/`. Do not expect `/scripture-outliner/` asset prefixes here.
