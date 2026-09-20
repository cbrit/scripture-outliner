# Inline outline

The passage is the outline. Section summaries render as bold headers above their body. Nested ranges start on a new line and indent by depth (0 section, 1 subsection, 2 subsubsection).

## Sub-features

- `header-inline` shows a bold depth-0 header in the passage above the section body.
- `nested-indent` shows a depth-1 header on its own line, indented under the parent.
- `depth-two` shows a depth-2 header indented further than the subsection.
- `summary-header-only` shows no header after Section/Deeper until a non-empty Summary is saved.

## How to get to it (user POV)

- Load the sample (or import text).
- Select a wide range and choose **Section**.
- Select an inner range and choose **Deeper**. Repeat on a still-inner range for depth 2.
- **Summary** after each mark so the bold header appears.

## Driving it with verify-so

Preconditions:

- Sample loaded. Word id `0` is `The`. Words `0–24` are the first two verses (`The` … `waters.`). Words `9–24` are the second verse. Words `18–24` are `he leadeth me beside the still waters.`

- **Section header.** Select `data-word-id` 0 then 24, choose **Section**. No `section-header` yet. Then **Summary** `The LORD is shepherd`. Run `page.locator('[data-word-id="0"]').click()`, `page.locator('[data-word-id="24"]').click()`, `page.getByTestId("action-section").click()`, fill and save summary. One `section-header[data-depth="0"]` is visible in `passage`, bold, above the body words.
- **Subsection.** Tap word 9 (shrinks the selected section to that word), tap word 24, choose **Deeper**, **Summary** `Green pastures`. A `section-header[data-depth="1"]` sits on its own line with greater left padding than depth 0.
- **Subsubsection.** Tap word 18, tap word 24, choose **Deeper**, **Summary** `Still waters`. A `section-header[data-depth="2"]` is present. Depths include `"0"`, `"1"`, and `"2"`.
- **Clear chrome.** Choose **Clear** so pins and the toolbar do not cover headers.
- **Proof.** `drive.mjs inline-outline` writes `evidence/inline-outline/nested.png` at 390×844 showing the three headers in the passage. Also capture `before.png` after sample load.

## Gotchas

- Tapping a word inside an already-selected covering segment shrinks to that word (so you can mark an inner range). Do not tap a word outside the parent if you intend to nest.
- Headers rebuild the passage DOM. Wait for `section-header` after each **Summary** save, not after Section/Deeper.
- There is no outline list and no view toggle. Do not look for `outline-row` or `view-split`.
- Inner overflow does not expand a `fullPage` screenshot. Set the passage pane `scrollTop` to 0 before capturing nested headers.
