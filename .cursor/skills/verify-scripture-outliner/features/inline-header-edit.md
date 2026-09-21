# Inline header edit

Tap **Summary** on the selection toolbar. A `textarea` appears in the passage at the header slot for that range. Type there. Press Enter or tap away to commit. There is no dialog, Save, or Cancel control.

## Sub-features

- `new-header-slot` opens Summary on a new range, types in `summary-field` inside `passage`, then commits a `section-header` in that slot.
- `edit-existing-prefill` opens Summary on an existing heading and prefills `summary-field` with that heading.
- `tap-away-commit` types in the field, taps wrap padding, and leaves a header whose text equals the field text.
- `tap-away-empty-new` taps away with an empty field on a new range and inserts no header.
- `tap-away-empty-existing` taps away with an empty field on an existing segment. The header is gone. The segment remains.
- `slot-geometry` measures the field box against the committed header. Top and left stay within about 8px.

## How to get to it (user POV)

- Load the sample.
- Select a word range.
- Tap **Summary**. Type in the header slot.
- Press Enter, or tap empty padding, to commit.
- Tap a heading, then **Summary**, to edit it.
- Press Escape to discard the draft.

## Driving it with verify-so

Preconditions:

- Sample loaded. Word id `0` is `The`. Words `0–8` are `The LORD is my shepherd; I shall not want.`

- **New header.** Select `data-word-id` 0 then 8. Tap **Summary**. Run `page.getByTestId("action-summary").click()`. Wait for `summary-field`. It sits inside `passage`. `summary-dialog` and `summary-save` are absent. Fill `The LORD is shepherd`. Capture `new-field.png`. Press Enter. Wait until `summary-field` is hidden. One `section-header` contains that text. Capture `new-committed.png`.
- **Edit existing.** Tap the header, tap **Summary**. `summary-field` value is `The LORD is shepherd`. Capture `edit-prefilled.png`. Press Enter.
- **Tap away with text.** Open **Summary** again, fill `Shepherd care`, tap wrap padding (`passage-wrap` at `{ x: 8, y: 10 }`). Do not tap the pane margin inside `saveSummary`. The heading text is `Shepherd care`. Capture `tap-away-commit.png`.
- **Tap away empty on a new range.** Select words `20–24`, tap **Summary**, leave the field empty, tap wrap padding. Header count stays 1. Capture `tap-away-empty-new.png`.
- **Tap away empty on an existing segment.** Tap the heading, tap **Summary**, clear the field, tap wrap padding. Zero `section-header` nodes. Stored `segments[0]` keeps the same `start`/`end` with `summary` `""`. Tapping word `0` reselects that range. Capture `tap-away-empty-existing.png`.
- **Slot geometry.** After the first Enter commit, the field box and the heading box differ by at most 8px in `x` and `y`.
- **Proof.** `drive.mjs inline-header-edit` writes those shots under `evidence/inline-header-edit/` at 390×844.

## Gotchas

- `saveSummary` clicks **Summary**, fills `summary-field`, and presses Enter. It does not click `summary-save`. It does not tap the pane margin. Recipes that hide chrome after a heading do that as their own step.
- Header tap still selects the range. It does not open the field. **Summary** opens the field.
- Empty after trim on a new range writes no segment. Empty on an existing segment stores `summary` as the raw value and keeps the segment. `segmentHasHeader` uses trim, so whitespace-only text hides the heading.
- `section-header` is only the committed `h2` through `h6`. The editor uses `summary-field` only.
- Press Escape to abort. That write path does not run.
