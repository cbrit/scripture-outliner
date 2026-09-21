# Export markdown with text shown

Export opens a format menu. Markdown writes the title, visible headings, and body text when the passage body is shown.

## Sub-features

- `export-menu` opens a menu attached to **Export** with Markdown (.md) and Word (.docx). There is no Pages item.
- `export-md-full` downloads a `.md` file whose contents match the on-screen outline plus body.

## How to get to it (user POV)

- Load the sample and write a Summary so a header is visible.
- Tap **Export**.
- Choose **Markdown (.md)**.

## Driving it with verify-so

Preconditions:

- Sample loaded. Word id `0` is `The`. Words `0–8` are `The` … `want.`
- One depth-0 header `The LORD is shepherd` after Deeper + Summary.

- **Outline.** Select `data-word-id` 0 then 8, **Deeper**, **Summary** `The LORD is shepherd`. Tap the margin to hide chrome.
- **Menu.** Tap `export`. `export-menu` is visible. `export-markdown` and `export-docx` are visible. Tap targets are at least 44px tall. Capture `menu-open.png` at 390×844 with `Scripture Outliner` in the heading.
- **Download.** `page.waitForEvent("download")` before tapping `export-markdown`. The file name ends with `.md`. The text contains `# Sample`, `## The LORD is shepherd`, and `I shall not want`. Copy it to `evidence/export-markdown/outline.md`.

## Gotchas

- Wait for the download event before the menu item click returns, or Playwright may miss the file.
- Empty-summary segments must not appear as invented headings. This recipe uses a real Summary.
- Apple Pages is out of scope. Fail if `export-pages` exists.
