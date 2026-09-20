# Word selection and pins

Selection is word-granular. A first tap selects one word; a second tap extends to a range. Start and end pins appear on the selection and snap to word edges.

## Sub-features

- `select-word` selects exactly one token and shows both pins.
- `select-extend` taps a second word and highlights the inclusive range as one filled bar, including spaces between words.
- `select-pins-visible` shows `pin-start` and `pin-end` after a selection exists.
- `select-deselect` drops the selection via a margin / outside tap. See [deselect-outside](./deselect-outside.md).

## How to get to it (user POV)

- Import or load a sample so the passage is on screen.
- Tap a word.
- Tap a second word to extend.
- Drag a pin (optional; helper proves visibility, not drag geometry).
- Tap the pane margin (empty space around the passage) to deselect.

## Driving it with verify-so

Preconditions:

- Sample is loaded (run `import-sample` first or use `drive.mjs word-selection`, which loads the sample).
- **Single word.** Tap the first word. Run `page.getByTestId("word").first().click()` or `page.locator('[data-word-id="0"]').click()`. Exactly one `.selected` word. `pin-start` and `pin-end` are visible (`hidden` attribute absent). `selection-toolbar` is visible with icon buttons `action-section`, `action-deeper`, `action-shallower`, `action-summary`, and `action-delete`. There is no `action-bar` and no `action-clear`. `selection-hint` is hidden.
- **Extend.** Tap a later word. Run `page.getByTestId("word").nth(4).click()`. At least two `.selected` words, still inclusive of the first tap. Pins remain visible. Spaces between those words have class `gap selected` so the highlight reads as one bar, not chips.
- **Deselect.** Tap the pane margin. Run `page.getByTestId("pane-text").click({ position: { x: 10, y: 10 } })`. Zero `.selected` words. Pins hidden. `selection-hint` visible again.
- **Proof.** `drive.mjs word-selection` writes `evidence/word-selection/range.png` and `range.aria.txt` after the extended range exists.

## Gotchas

- Pointer travel over 14px on `pointerup` is ignored as a tap. Do not drag when intending a click.
- Tapping a word that is already covered by a segment may reselect that whole segment instead of starting a new range. Prove selection on a fresh sample with no segments.
- Pins are `position: absolute` over the passage wrap. Screenshot immediately after click; a scroll without `positionPins` can desync in slow traces, but the app listens to pane scroll.
- The selection hint sits above the range and to the right of the start pin so later words stay tappable.
- Word id `0` on the sample is `The`.
- Tapping wrap padding, pane margins, or empty space between blocks clears the selection. That must not delete segments.
- **Delete** (X) removes a matching segment; it does not clear the highlight. Deselect is margin tap only.
