# Section, deeper, and summary

With a selection, the user marks a depth-0 **Section**, nests with **Deeper** / **Shallower**, or writes a **Summary** heading for that range. A header appears only after a non-empty Summary. Nothing is generated.

## Sub-features

- `section-create` marks a depth-0 range. No header is created or shown.
- `deeper-create` nests an inner range (depth 1). No header until that range has a Summary.
- `summary-write` opens the dialog, saves typed text, and shows a bold header for that range.
- `segment-delete` removes the segment that exactly matches the selection.

## How to get to it (user POV)

- Select a word range in the text.
- Choose **Section**, **Deeper**, **Shallower**, **Summary**, or **Delete** (X) on the icon toolbar attached to the highlight.
- After a Summary, tap the header to reselect its range. Proven by `drive.mjs header-select` (see [header-select](./header-select.md)).
- Choose **Delete** when the selection matches a segment exactly.

## Driving it with verify-so

Preconditions:

- Sample loaded.
- No segments yet.

- **Section.** Select words 1–6, choose **Section**. Run `page.getByTestId("word").nth(1).click()`, `page.getByTestId("word").nth(6).click()`, `page.getByTestId("action-section").click()`. Zero `section-header` nodes. **Delete** is enabled (exact segment). Capture `after-section.png`.
- **Deeper.** Shrink to an inner word then extend inside the section, choose **Deeper**. Run `page.getByTestId("word").nth(3).click()`, `page.getByTestId("word").nth(5).click()`, `page.getByTestId("action-deeper").click()`. Still zero `section-header` nodes.
- **Summary.** With the inner selection, choose **Summary**, type `Shepherd care`, choose **Save**. Run `page.getByTestId("action-summary").click()`, `page.getByTestId("summary-field").fill("Shepherd care")`, `page.getByTestId("summary-save").click()`. One `section-header` at `data-depth="1"` contains that text. The dialog is closed. Tap the pane margin to hide chrome, then capture `after-summary.png`.
- **Delete.** Reselect the exact inner range, choose **Delete**. Run `page.getByTestId("action-delete").click()`. That header is gone. **Delete** is disabled when the selection is not an exact segment.
- **Proof.** `drive.mjs section-deeper-summary` writes `evidence/section-deeper-summary/after-section.png` (no header) and `after-summary.png` (bold header after Summary).

## Gotchas

- **Summary** on a new range also creates a segment (depth from `suggestedDepth`) and is the only action that shows a header. Assert the header text, not only that the dialog closed.
- **Delete** no-ops unless the selection exactly matches a segment. Partial overlaps do not enable a useful delete.
- Choosing **Section** on an existing exact segment sets depth 0 instead of duplicating the header.
- **Shallower** is disabled when there is no exact segment or the segment is already depth 0.
- Confirm dialogs: **New** uses `window.confirm`. Playwright auto-dismisses unless you `page.on("dialog")`.
- Toolbar buttons are icons with `aria-label`. Do not assert visible text "Section" / "Delete".
