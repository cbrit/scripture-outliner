# Summary modal baseline (pre-change)

Captured from `main` at 390×844 against local `vite preview` before replacing the Summary modal with inline header editing.

| File | What it shows |
| --- | --- |
| `01-selection-toolbar.png` | Range selected, icon toolbar, no header yet |
| `02-modal-empty-new.png` | Summary tap opens the floating dialog with empty field |
| `03-modal-typed.png` | Typed heading still inside the dialog |
| `04-header-after-save.png` | After Save, bold header sits above the range |
| `05-modal-prefilled-existing.png` | Summary again opens the dialog prefilled |
| `06-cancel-leaves-header.png` | Cancel leaves the existing header |

The dialog is a `<dialog class="summary-dialog">` centered over a dimmed passage. It is not in the header slot.
