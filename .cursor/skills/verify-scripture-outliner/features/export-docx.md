# Export Word document

Export can write a `.docx` file (OOXML zip) with the same title, headings, and optional body as Markdown.

## Sub-features

- `export-docx-file` downloads a zip that starts with `PK` and is larger than 200 bytes. The suggested name ends with `.docx`.

## How to get to it (user POV)

- Load the sample and write a Summary header.
- Tap **Export**, then **Word (.docx)**.

## Driving it with verify-so

Preconditions:

- Same outlined sample as [export-markdown](./export-markdown.md).

- **Menu.** Tap `export`. `export-docx` is visible.
- **Download.** `page.waitForEvent("download")` before tapping `export-docx`. Suggested filename ends with `.docx`. Saved bytes start with `PK` (`0x50 0x4b`) and length is greater than 200. Copy to `evidence/export-docx/outline.docx`.

## Gotchas

- This is a client-side zip of OOXML, not a server. There is no `docx` npm dependency.
- Do not look for Apple Pages.
