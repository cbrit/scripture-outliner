# Import and sample

Import lets a user paste any text or load the built-in sample, then see the text as tappable words with a title. Nothing is outlined until the user marks a range.

## Sub-features

- `import-empty` shows the paste field and both import actions on a fresh session.
- `import-paste` tokenizes pasted text into words and opens the editor.
- `import-sample` loads the sample title and word stream in one tap.
- `import-reject-empty` leaves the user on import when the textarea is empty.

## How to get to it (user POV)

- Open the app with no saved document.
- Choose **Import** after pasting into the textarea.
- Choose **Load sample**.

## Driving it with verify-so

Preconditions:

- Preview is healthy at the URL in `.run/state.json`.
- `doctor.sh` reports `OK`.
- `scripture-outliner.document.v1` is empty (drive helper clears it).

- **Empty state.** Open the preview. Run `node scripts/drive.mjs import-sample` (it asserts this first) or `page.getByTestId("import-view")`. The heading **Import text**, textarea `import-text`, buttons `import-submit` and `load-sample` are visible. `editor` is hidden.
- **Reject empty.** Choose **Import** with an empty field. Run `page.getByTestId("import-submit").click()`. `import-view` stays visible and no `word` nodes exist.
- **Paste import.** Fill `import-text` with `Alpha beta.` and choose **Import**. Run `page.getByTestId("import-text").fill("Alpha beta.")` then `page.getByTestId("import-submit").click()`. `title-input` is `Untitled`. Words `Alpha` and `beta.` exist. `load-sample` is gone.
- **Sample.** From empty import, choose **Load sample**. Run `page.getByTestId("load-sample").click()`. `title-input` is `Sample`. `passage` is visible with at least 50 `word` nodes. Word id `0` reads `The`. Leading verse numbers are not rendered as a separate style.
- **Proof.** Capture empty and loaded states. `drive.mjs import-sample` writes `evidence/import-sample/empty.png`, `sample-loaded.png`, `*.aria.txt`, and `result.json`. Artifacts must show **Scripture Outliner** and, after load, title **Sample** with first word **The**.

## Gotchas

- A leftover `localStorage` document skips import entirely. Clear the key and reload, or the empty-state assertions fail.
- **Load sample** also fills the textarea, then imports. Assert the editor, not the textarea value.
- Empty import does not throw; it focuses the textarea. Wait for missing `word` nodes, not an error toast (there is none).
- Local preview uses `VITE_BASE=/`. Do not expect `/scripture-outliner/` asset prefixes here.
- Tokens that look like `1` or `1:1` are ordinary words. Do not expect superscript verse chrome.
