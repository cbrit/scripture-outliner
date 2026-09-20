# Deselect outside text

Tapping outside a text block clears the current selection. Empty padding around the passage, pane margins, and space between blocks that is not a word or header set selection to null. Segments stay. Word taps and pin drags still work.

## Sub-features

- `deselect-margin` taps wrap padding (or pane margin) after a word is selected and drops the highlight, pins, and toolbar.
- `deselect-keeps-segments` marks a Section, selects it, taps empty space, and leaves the header in the passage.
- `deselect-word-still-works` taps a word outside the remaining segment after a margin deselect and gets a new one-word selection.

## How to get to it (user POV)

- Import or load a sample so the passage is on screen.
- Tap a word so pins and the selection toolbar appear.
- Tap in the empty padding above/beside the passage, in the pane margin, or in space between blocks that is not a word.
- The selection disappears. **Delete** was not used. Existing section headers remain.

## Driving it with verify-so

Preconditions:

- Sample is loaded (`drive.mjs deselect-outside` loads it). Word id `0` is `The`.
- **Select.** Tap `data-word-id="0"`. Exactly one `.selected` word. `pin-start` and `pin-end` visible. `selection-toolbar` visible.
- **Before proof.** Capture `evidence/deselect-outside/selected.png` at 390×844 with `Scripture Outliner` visible.
- **Margin tap.** Click `passage-wrap` at `{ x: 8, y: 10 }` (top-left wrap padding, not a word). Do not click `.word`, `.gap`, `section-header`, pins, or the toolbar.
- **After proof.** Zero `.selected` words. Pins hidden. `selection-toolbar` hidden. No `action-bar`. Capture `evidence/deselect-outside/deselected.png`.
- **Keep segments.** Select words `0`–`6`, choose **Section**, then **Summary** so a header exists. Select word `0` again, tap wrap padding. Header count is unchanged. Zero `.selected` words.
- **Word tap still works.** Tap a word outside the section (`data-word-id="20"`). One `.selected` word and visible pins. Tapping a word still covered by the segment would reselect that whole range.

## Gotchas

- Pointer travel over 14px is ignored as a tap. A pane scroll must not deselect.
- Inline `.gap` spaces are still in the text stream. Do not treat those as empty. Click wrap padding or pane-text’s own box (the 16px pane padding).
- Pins and the selection toolbar are chrome. A tap there must not clear the selection.
- **Delete** removes a matching segment. A margin tap must only set `selection` to null.
