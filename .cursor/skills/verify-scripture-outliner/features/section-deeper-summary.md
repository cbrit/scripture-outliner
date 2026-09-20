# Section, deeper, and summary

With a selection, the user marks a depth-0 **Section**, nests with **Deeper** / **Shallower**, or writes a **Summary** heading for that range. Headers appear in the passage. Nothing is generated.

## Sub-features

- `section-create` adds a depth-0 bold header above the current selection.
- `deeper-create` adds a nested header (depth 1) for an inner selection.
- `summary-write` opens the dialog, saves typed text, and shows it on the header.
- `segment-delete` removes the segment that exactly matches the selection.

## How to get to it (user POV)

- Select a word range in the text.
- Choose **Section**, **Deeper**, **Shallower**, or **Summary** on the toolbar attached to the highlight (primary). Clear / Delete stay on the sticky bar.
- Tap a header to reselect its range. Proven by `drive.mjs header-select` (see [header-select](./header-select.md)).
- Choose **Delete** when the selection matches a segment exactly.

## Driving it with verify-so

Preconditions:

- Sample loaded.
- No segments yet.

- **Section.** Select words 1–6, choose **Section**. Run `page.getByTestId("word").nth(1).click()`, `page.getByTestId("word").nth(6).click()`, `page.getByTestId("action-section").click()`. One `section-header` with `data-depth="0"`. Empty summary still shows a bold placeholder snippet (`data-placeholder="true"`).
- **Deeper.** Shrink to an inner word then extend inside the section, choose **Deeper**. Run `page.getByTestId("word").nth(3).click()`, `page.getByTestId("word").nth(5).click()`, `page.getByTestId("action-deeper").click()`. A second `section-header` has `data-depth="1"`.
- **Summary.** With a selection, choose **Summary**, type `Shepherd care`, choose **Save**. Run `page.getByTestId("action-summary").click()`, `page.getByTestId("summary-field").fill("Shepherd care")`, `page.getByTestId("summary-save").click()`. A `section-header` contains that text and is not a placeholder. The dialog is closed.
- **Delete.** Reselect the exact section range, choose **Delete**. Run `page.getByTestId("action-delete").click()`. That header is gone. **Delete** is disabled when the selection is not an exact segment.
- **Proof.** `drive.mjs section-deeper-summary` writes `evidence/section-deeper-summary/outline.png` showing at least two depths and the saved summary.

## Gotchas

- **Summary** on a new range also creates a segment (depth from `suggestedDepth`). Assert the header text, not only that the dialog closed.
- **Delete** no-ops unless the selection exactly matches a segment. Partial overlaps do not enable a useful delete.
- Choosing **Section** on an existing exact segment sets depth 0 instead of duplicating the header.
- **Shallower** is disabled when there is no exact segment or the segment is already depth 0.
- Confirm dialogs: **New** uses `window.confirm`. Playwright auto-dismisses unless you `page.on("dialog")`.
