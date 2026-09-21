# Show text

**Show text** is a header checkbox that hides or shows body words for the whole document. Off, the passage shows only section headers (summaries) with their indent. It is an app pref, not a document field.

## Sub-features

- `show-text-default` starts checked. Body words are in the passage. Prefs default is `{ showText: true }`.
- `show-text-off` omits `.word` nodes. Headers stay, including nested `data-depth` indent. Unsectioned body is also gone.
- `show-text-header-toolbar` taps a header with text off and shows `selection-toolbar` from that header. Pins stay hidden.
- `show-text-persist` writes `scripture-outliner.prefs.v1` immediately. Reload restores the checkbox and hidden or shown body. **New** keeps this pref.

## How to get to it (user POV)

- Load the sample (or import text).
- Mark nested ranges and write Summaries so headers exist.
- Uncheck **Show text** in the header (before Export / New).
- Tap a header to select that segment. Check the box again to restore body words.

## Driving it with verify-so

Preconditions:

- Drive clears `scripture-outliner.prefs.v1` with the document key, so recipes start with text shown.
- Sample loaded. Words `0–24` / `9–24` match the inline-outline range.

- **Nested headers.** Select `data-word-id` 0 then 24, **Deeper**, **Summary** `The LORD is shepherd`. Inner range 9–24, **Deeper**, **Summary** `Green pastures`. Depth 2 on 18–24 is optional.
- **On.** `show-text-input` is checked. `getByTestId("word").count() > 0`. At least two `section-header` nodes. `drive.mjs show-text` writes `evidence/show-text/text-on.png` at 390×844 with heading `Scripture Outliner` visible.
- **Off.** Uncheck the real checkbox (`show-text-input`). Word count is 0. Headers remain. Depth 1 `paddingLeft` is greater than depth 0. Checkbox is unchecked. Snapshot `text-off.png`.
- **Header tap.** Tap a `section-header`. `selection-toolbar` is visible. `pin-start` and `pin-end` are hidden.
- **Reload.** `page.reload()`. Still headers only. Checkbox unchecked. Prefs JSON is `{ "showText": false }`. Check the box. Words return.

## Gotchas

- Hiding is omission in `buildPassage()`, not CSS `display:none` on still-present `.word` nodes. Assert `data-testid="word"` count is 0, not that words are invisible.
- Storage key is `scripture-outliner.prefs.v1`. It is separate from `scripture-outliner.document.v1`. **New** must not clear it. Drive must clear it so leftover off-state does not break other recipes.
- There is no Text / Outline / Split three-way toggle and no separate outline pane. This control is only **Show text**.
- Export does not follow this pref yet. Do not assert that Markdown omits body.
- Header tap still sets `doc.selection` to that segment start/end. Toolbar placement uses the header box only when words are absent.
- `viewMode` is not a document field. Do not write it.
