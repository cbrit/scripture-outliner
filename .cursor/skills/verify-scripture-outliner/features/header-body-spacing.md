# Header to body spacing

Section headers sit the same distance above their first body word at every outline depth. A nested Psalm 23 sample (depth 0 / 1 / 2) must not add an extra blank line after some headers only.

## Sub-features

- `header-gap-even` keeps header-bottom → first following `.word` top offsets within 8px of each other across depths 0, 1, and 2.
- `measure-to-word` measures to the first body word, not the `.word-run` box. A leading `<br>` inside the run still counts as a gap.

## How to get to it (user POV)

- Load the sample.
- Select words 0–24, **Deeper**, **Summary** `The LORD is shepherd`.
- Select words 9–24, **Deeper**, **Summary** `Green pastures`.
- Select words 18–24, **Deeper**, **Summary** `Still waters`.
- Tap empty padding so pins do not cover the headers.

## Driving it with verify-so

Preconditions:

- Sample loaded. Word id `0` is `The`. Ranges match inline-outline (`0–24`, `9–24`, `18–24`).

- **Nested headers.** Drive the same Deeper / Summary clicks as inline-outline until depths `"0"`, `"1"`, and `"2"` exist.
- **Clear chrome.** `page.getByTestId("pane-text")` scrollTop 0. Margin tap to hide pins.
- **Gaps.** For each `section-header`, measure `firstWord.top - header.bottom` where `firstWord` is the next `.word` in document order. The max minus min of those three values is ≤ 8.
- **Proof.** `drive.mjs header-body-spacing` writes `evidence/header-body-spacing/nested.png` at 390×844. Keep `uneven.png` as the failing-before screenshot.

## Gotchas

- Measuring header bottom to `.word-run` top hides the bug. The extra space is a leading `<br>` inside the run when the first word follows a source newline.
- Do not special-case the "Green pastures" label. Any depth whose first body word is a paragraph start must match the others.
- Header `margin-bottom` is shared CSS. Do not assert pixel-identical gaps, only that depths stay within 8px.
