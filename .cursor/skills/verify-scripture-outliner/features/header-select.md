# Header tap selects the section

Tapping a section header selects that segment’s full word range. The highlight, pins, and toolbar match `start`/`end` on the stored segment.

## Sub-features

- `header-select-range` taps `section-header` after Clear and selects every word from that segment’s `start` through `end`.
- `header-select-current` marks the tapped header `aria-current` while its range is selected.

## How to get to it (user POV)

- Load the sample.
- Select a range and choose **Section**, then **Summary**.
- Choose **Clear** so no words are selected.
- Tap the bold header above the section body.

## Driving it with verify-so

Preconditions:

- Sample loaded. Word id `0` is `The`. Words `0–8` are `The LORD is my shepherd; I shall not want.`

- **Section with summary.** Select `data-word-id` 0 then 8, choose **Section**. No `section-header` yet. Then **Summary** `The LORD is shepherd`. Run `page.locator('[data-word-id="0"]').click()`, `page.locator('[data-word-id="8"]').click()`, `page.getByTestId("action-section").click()`, fill and save summary. One `section-header` contains that text. Stored `segments[0]` is `{ start: 0, end: 8 }`.
- **Clear.** Choose **Clear**. Run `page.getByTestId("action-clear").click()`. Zero `.selected` words. Pins hidden. Header still visible.
- **Tap header.** Tap the header. Run `page.getByTestId("section-header").first().click()`. Selected word ids are exactly `0` through `8`. First/last selected `data-word-id` equal the stored segment `start`/`end`. The header has `aria-current`. Pins and `selection-toolbar` are visible.
- **Proof.** `drive.mjs header-select` writes `evidence/header-select/cleared.png` after Clear and `evidence/header-select/selected.png` after the header tap, both 390×844.

## Gotchas

- Header taps use the same 14px pointer-travel ignore as word taps. Click the heading text, not a drag from a pin.
- After **Clear**, do not tap a body word first; that starts a one-word selection instead of the whole segment.
- `aria-current` is present only while the selection exactly matches that header’s segment.
- Nested headers each select their own range. This recipe uses one depth-0 section.
- Headers appear only after a non-empty Summary. **Section** alone does not create a tappable heading.
- A tap on empty passage padding clears the selection. Click the heading text, not the margin.
