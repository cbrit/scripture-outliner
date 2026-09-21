# Export markdown headers only

When body text is hidden, Markdown export writes the title and visible headings and omits passage body text. Empty-summary segments do not become headings.

## Sub-features

- `headers-only-md` downloads Markdown that includes the summary heading and excludes body phrases such as `I shall not want`.

## How to get to it (user POV)

- Load the sample and write a Summary header.
- Turn off **Show text** if that control is present.
- Tap **Export**, then **Markdown (.md)**.

## Driving it with verify-so

Preconditions:

- Same outlined sample as [export-markdown](./export-markdown.md).

- **Hide body.** Uncheck `show-text-input`. Word count is 0. Record `hideHow` as `show-text-input` in the snapshot extra field.
- **Menu.** Tap `export`. Capture `export-menu-open.png`.
- **Download.** Wait for `download`, tap `export-markdown`. The file contains `# Sample` and `## The LORD is shepherd`. It must not contain `I shall not want`. Copy it to `evidence/export-headers-only/outline.md`.

## Gotchas

- Export reads the live `prefs.showText` flag (same `loadPrefs()` / checkbox that `buildPassage` uses). Off means headers only.
- Empty-summary segments never become headings. Only trimmed `segment.summary` is written.
- A header still exports when body text is hidden. Only `words` runs are dropped.
