# Bullet, sub, and summary

With a selection, the user marks a depth-0 section (**Bullet**), a depth-1 subsection (**Sub**), or writes a **Summary** for that range. The outline lists rows; nothing is generated.

## Sub-features

- `bullet-create` adds a depth-0 outline row for the current selection.
- `sub-create` adds a depth-1 row for a different selection.
- `summary-write` opens the dialog, saves typed text, and shows it on the row.
- `segment-delete` removes the row that exactly matches the selection.

## How to get to it (user POV)

- Select a word range in the text.
- Choose **Bullet**, **Sub**, or **Summary** on the toolbar attached to the highlight (primary). Clear / Delete stay on the sticky bar.
- In Split or Outline, tap an outline row to reselect its range.
- Choose **Delete** when the selection matches a segment exactly.

## Driving it with verify-so

Preconditions:

- Sample loaded.
- No segments yet.

- **Bullet.** Select words 1–6, choose **Bullet**. Run `page.getByTestId("word").nth(1).click()`, `page.getByTestId("word").nth(6).click()`, `page.getByTestId("action-bullet").click()`. One `outline-row` with `data-depth="0"`. `outline-empty` is hidden.
- **Sub.** Select a later range, choose **Sub**. Run clicks on later words then `page.getByTestId("action-sub").click()`. A second `outline-row` has `data-depth="1"`.
- **Summary.** With a selection, choose **Summary**, type `Shepherd care`, choose **Save**. Run `page.getByTestId("action-summary").click()`, `page.getByTestId("summary-field").fill("Shepherd care")`, `page.getByTestId("summary-save").click()`. An outline `.summary-input` contains that text. The dialog is closed.
- **Delete.** Reselect the exact bullet range, choose **Delete**. Run `page.getByTestId("action-delete").click()`. That row is gone. **Delete** is disabled when the selection is not an exact segment.
- **Proof.** `drive.mjs bullet-sub-summary` writes `evidence/bullet-sub-summary/outline.png` showing at least two depths and the saved summary.

## Gotchas

- **Summary** on a new range also creates a segment (depth from `suggestedSummaryDepth`). Assert the outline, not only that the dialog closed.
- **Delete** no-ops unless the selection exactly matches a segment. Partial overlaps do not enable a useful delete.
- Choosing **Bullet** on an existing exact segment updates depth instead of duplicating the row.
- Confirm dialogs: **New** uses `window.confirm`. Playwright auto-dismisses unless you `page.on("dialog")`.
