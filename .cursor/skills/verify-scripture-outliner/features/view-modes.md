# View modes

After import, the user switches **Text**, **Split**, and **Outline**. Text shows the passage, Outline shows the list, Split stacks both on a narrow viewport.

## Sub-features

- `view-text` hides the outline pane and keeps the passage.
- `view-outline` hides the passage and keeps the outline.
- `view-split` shows both panes stacked at 390px.
- `view-pressed` sets `aria-pressed` on the active toggle.

## How to get to it (user POV)

- After import, use the **Text** / **Split** / **Outline** buttons in the header.

## Driving it with verify-so

Preconditions:

- Sample loaded. Default view is `split`.

- **Text.** Choose **Text**. Run `page.getByTestId("view-text").click()`. `editor` has `data-view="text"`. That button `aria-pressed="true"`. Passage remains in the tree; outline pane is not the primary surface (CSS hides it).
- **Outline.** Choose **Outline**. Run `page.getByTestId("view-outline").click()`. `editor` has `data-view="outline"`. `outline-list` or `outline-empty` is visible.
- **Split.** Choose **Split**. Run `page.getByTestId("view-split").click()`. `editor` has `data-view="split"`. At 390px both `pane-text` and `pane-outline` are present in a column.
- **Proof.** `drive.mjs view-modes` writes `evidence/view-modes/{text,outline,split}.png`.

## Gotchas

- View mode is persisted. A leftover document may not start on Split. The drive helper clears storage first.
- Tapping an outline row from Outline switches the view to Split so the passage can reveal the range.
- Do not assert desktop two-column layout at 390px; Split is stacked.
