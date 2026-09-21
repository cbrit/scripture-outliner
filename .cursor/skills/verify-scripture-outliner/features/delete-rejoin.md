# Delete rejoins the original line

Deleting a mid-phrase section removes the layout break that section introduced. Contiguous body words go back to the same line when the original break was a space.

## Sub-features

- `delete-rejoin-second-half` sections `I shall not want` on a one-line import, then Delete (X). `shepherd,` and `I` share a line again.
- `delete-rejoin-sibling` sections both halves, then Delete on the second half. Trailing loose words still rejoin the first half.

## How to get to it (user POV)

- Import `The LORD is my shepherd, I shall not want` (one paragraph, no typed newline).
- Select `I shall not want`, choose **Deeper**, tap the margin.
- Tap that second-half range and hit Delete (X).

## Driving it with verify-so

Preconditions:

- Import the one-line sentence above. Word id `4` is `shepherd,`. Word id `5` is `I`.

- **Before.** `shepherd,` and `I` share a y-coordinate. Passage inner text has no newline between them. Snapshot `before.png`.
- **Split.** Select word 5 then 8. `action-deeper`. Margin deselect. `I` is on a new line. Snapshot `after-section.png`.
- **Delete.** Tap word 5 (covers the section). `action-delete`. Margin deselect. `shepherd,` and `I` share a line again. Snapshot `after-delete.png`.
- **Sibling leftover.** **New**, import the same sentence. Deeper on words 0–4, margin deselect, then Deeper on 5–8. Delete the second section. Same join assertion. Snapshot `after-sibling-delete.png`.

## Gotchas

- At 390×844, `want` may wrap to the next line even before sectioning. Assert `shepherd,` vs `I`, not “every word on one row”.
- Delete is disabled until the selection matches a segment. After a margin deselect, tap a word inside the second half so covering selection enables X.
- Headerless depth-0 sections still use a block word-run, which is the visible split. Delete must not leave that break when the original token break was a space.
