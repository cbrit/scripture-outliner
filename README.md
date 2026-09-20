# Scripture Outliner

Mobile-first PWA for outlining a scripture passage by hand. You import text, select **words** (not characters), mark sections and subsections, and write your own summary statements. Nothing is auto-outlined or auto-summarized.

One document at a time. It lives in `localStorage` on this device.

**Open on a phone:** https://cbrit.github.io/

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

1. Paste a passage, or tap **Load sample (Psalm 23 KJV)** (public domain).
2. Tap a word to select it. Tap a second word to extend the range. Drag the two pins; they snap to word edges only.
3. **Bullet** marks a depth-0 section. **Sub** marks a depth-1 subsection. **Summary** opens an editor for that range (empty until you type).
4. Switch **Text** / **Split** / **Outline**. In Split, tap an outline row to reselect that range in the passage.
5. Reload: the current document is restored from `localStorage`. **Export** downloads Markdown (and copies it when the clipboard is available).

## Manual QA (~390px viewport)

Use device mode at **390×844** (or an actual phone). After `npm run dev`:

1. Empty state shows a paste textarea and the sample button. Load the sample; words render as tappable spans within about a second.
2. Tap **The**. Selection is that word only; start and end pins sit on its edges.
3. Tap **want.** The range is word-aligned (`The` … `want.`), not a character highlight.
4. Drag the end pin onto **shepherd;** — it snaps to that word, never mid-token.
5. **Bullet**, then select a later phrase and **Sub**. Highlights use two shades; the outline lists an indented sub-bullet.
6. **Summary**, type a sentence, Save. The outline shows your text, not a generated paraphrase.
7. Switch to **Split**: passage on top, outline under it, both scrollable. Tap the outline row — the passage reselects that range.
8. **Text** hides the outline; **Outline** hides the passage. Sticky **Bullet / Sub / Summary** stay tappable (44px targets) above the home indicator.
9. Reload the tab. Title, segments, summaries, and view mode return.
10. **Export** produces a `.md` file with indented bullets.

Secondary: **Clear** drops the selection; **Delete** removes the segment that exactly matches the selection; **New** returns to import.

## Domain

The app follows the locked design in the task’s `DESIGN.md`: flat `Segment[]` (`depth` 0 or 1), `Selection` as inclusive word ids, one `Document`. Overlapping new ranges clip or split older ones (newest wins). Nested outline trees were not used.

## Stack

Vite, TypeScript, vanilla DOM. No React/Vue, no backend, no accounts, no multi-doc library.
