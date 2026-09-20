# Icon selection toolbar

With a selection, actions are icon-only buttons on the attached toolbar: Section, Deeper, Shallower, Summary, and Delete (X). There is no sticky bottom bar and no Clear button.

## Sub-features

- `toolbar-icons` shows SVG icons, not text labels, for the five actions.
- `toolbar-delete` places Delete (X) in `selection-toolbar` as `action-delete`.
- `toolbar-targets` keeps each action at least 44×44 CSS pixels.
- `toolbar-a11y` exposes `aria-label` (and `title`) on each icon button.

## How to get to it (user POV)

- Load the sample.
- Tap a word so the selection toolbar appears.
- Read the icons; use the accessible name if the glyph is unclear.
- Tap the X to delete a matching segment, or tap the margin to deselect.

## Driving it with verify-so

Preconditions:

- Sample loaded. Word id `0` is `The`.

- **Icons.** Tap word 0. Run `page.locator('[data-word-id="0"]').click()`. `selection-toolbar` is visible. Buttons `action-section`, `action-deeper`, `action-shallower`, `action-summary`, and `action-delete` are inside it, each with an `svg`, empty inner text, a 44px tap target, and `aria-label` Section / Deeper / Shallower / Summary / Delete.
- **Removed chrome.** `action-clear` and `action-bar` are absent from the DOM.
- **Proof.** `drive.mjs icon-toolbar` writes `evidence/icon-toolbar/toolbar.png` at 390×844 with the icon toolbar (including X) and the heading `Scripture Outliner` visible.

## Gotchas

- The X is Delete (remove the exact matching segment), not deselect. Deselect is a margin tap.
- Delete is disabled until the selection exactly matches a segment. The icon stays visible.
- Do not assert the old text labels Section / Deeper / Shallower / Summary / Clear / Delete in `body` inner text.
