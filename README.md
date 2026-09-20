# Scripture Outliner

Mobile-first PWA for outlining text by hand. You import text, select **words** (not characters), and mark sections in the passage itself. Summaries show as bold headers above their body. Nothing is auto-outlined or auto-summarized.

One document at a time. It lives in `localStorage` on this device.

**Open on a phone:** https://cbrit.github.io/scripture-outliner/

That URL is the user-site subdirectory (`cbrit.github.io` → `/scripture-outliner/` only). It does not replace `https://cbrit.github.io/` and does not use the Whatley Solutions / Whatley Brothers Pages sites.

Project Pages from this repo (same path once public) is the preferred host. `.github/workflows/pages.yml` builds with `VITE_BASE=/scripture-outliner/` and deploys via Actions on push to `main`. The deploy agent cannot make this repository public or enable Pages (`visibility` / `pages` API 403: *Resource not accessible by integration*). Until the owner sets the repo to **public** and Pages source to **GitHub Actions**, use the user-site URL above.

## Verification

Agents prove UI behavior with `.cursor/skills/verify-scripture-outliner/` (Playwright against a local `vite preview` at 390×844). Launch, doctor, drive, and cleanup helpers live in that skill’s `scripts/` directory. Feature recipes are in `features/`.

Seeded proof from the first skill run (import + sample, after cleanup) is in `.cursor/skills/verify-scripture-outliner/evidence/import-sample/`. Cleanup removes the preview process only; it does not delete evidence.

Every future feature PR must include a screenshot or screen recording as proof of the change.

## Run

```bash
npm install
npm run dev
```

Open the printed local URL (typically `http://localhost:5173`).

Production build and preview:

```bash
npm run build
npm run preview -- --host
```

`preview --host` is useful when checking Add to Home Screen from a phone on the same network.

## Add to Home Screen

The Vite build emits a web manifest, PNG icons, and a service worker that precaches the app shell so it works offline after the first load.

**iPhone / iPad (Safari)**

1. Open the preview (or deployed) URL in Safari. Home Screen install does not work from Chrome on iOS.
2. Share → **Add to Home Screen**.
3. Open **Outliner** from the home screen. It should launch without browser chrome.

**Android (Chrome)**

1. Open the URL in Chrome.
2. Menu → **Install app** / **Add to Home Screen**, or use the install banner if shown.
3. Launch from the home screen.

Install and the service worker require a secure context: `localhost` or HTTPS.

## Core loop

1. Paste text, or tap **Load sample**.
2. Tap a word to select it. Tap a second word to extend the range. Drag the two pins; they snap to word edges only.
3. **Section** marks a depth-0 range. **Deeper** / **Shallower** change nesting. **Summary** writes the bold header. A header appears only after a non-empty Summary.
4. Headers sit in the passage above their body. Nested ranges start on a new line and indent by depth.
5. Reload: the current document is restored from `localStorage`. **Export** downloads Markdown with ATX headers by depth (and copies it when the clipboard is available).

## Manual QA (~390px viewport)

Use device mode at **390×844** (or an actual phone). After `npm run dev`:

1. Empty state shows a paste textarea and the sample button. Load the sample; words render as tappable spans within about a second.
2. Tap **The**. Selection is that word only; start and end pins sit on its edges.
3. Tap **want.** The range is word-aligned (`The` … `want.`), not a character highlight.
4. Drag the end pin onto **shepherd;** — it snaps to that word, never mid-token.
5. **Section**, then select an inner phrase and **Deeper**. No header yet. The subsection starts on its own indented line.
6. **Deeper** again on a still-inner range (depth 2). **Summary**, type a sentence, Save. The bold header appears above that range. Empty summaries do not render a header.
7. Highlights use stacked shades; selection fill stays one continuous bar. There is no Text / Outline / Split toggle.
8. Reload the tab. Title, nested segments, and summaries return.
9. **Export** produces a `.md` file with `#` title and `##` / `###` / `####` outline headings.

Secondary: **Clear** drops the selection; **Delete** removes the segment that exactly matches the selection; **New** returns to import.

## Domain

The app uses a flat `Segment[]` with numeric `depth` (0 = section, 1 = subsection, …). `Selection` is inclusive word ids. One `Document`. Nested ranges must sit strictly inside a shallower parent or be non-overlapping siblings; insert clips partial overlaps and splits same-depth containers. Old documents with depth `0 | 1` still load.

## Stack

Vite, TypeScript, vanilla DOM. No React/Vue, no backend, no accounts, no multi-doc library.
