---
name: verify-scripture-outliner
description: Drive the Scripture Outliner Vite PWA in a real browser (Playwright + Chrome against `vite preview` at 390×844). Use when proving import, word selection, pins, inline headers, nested outline depth, summaries, Show text, export (Markdown/Word), or localStorage persistence.
---

# Verify Scripture Outliner

Mobile-first vanilla DOM PWA. One document in `localStorage`. Users import text, tap **words** (not characters), and mark Deeper / Shallower / Summary by hand. The passage view **is** the outline: bold headers sit above their body. Nothing is auto-outlined.

This skill is for agents. Drive the real UI. Do not call `mount()`, `setDoc`, or `localStorage.setItem` as a substitute for a user action.

## Launch

From the repo root:

```bash
chmod +x .cursor/skills/verify-scripture-outliner/scripts/*.sh
.cursor/skills/verify-scripture-outliner/scripts/launch.sh
```

What it does:

1. Builds with `VITE_BASE=/` (local preview is served at `/`, not the GitHub Pages subdirectory).
2. Starts `npm run preview -- --host 127.0.0.1 --port 4173 --strictPort` (or the next free port if 4173 is taken).
3. Writes `.cursor/skills/verify-scripture-outliner/.run/state.json` with `pid`, `url`, `port`.

Ready when `curl -fsS <url>` returns HTML that contains `#app`. `launch.sh` waits for that itself.

Override port with `VERIFY_PORT`. Override bind host with `VERIFY_HOST` (keep `127.0.0.1` so two runs on different ports do not share `localhost` origin storage).

Ready log line: `Launched Scripture Outliner preview pid=… url=http://127.0.0.1:<port>/`

Teardown: `scripts/cleanup.sh` (kills only the pid in `state.json`).

Do not drive `https://cbrit.github.io/scripture-outliner/` with this skill unless a recipe explicitly says so. Local preview is the verification instance. Never start a second preview against an existing `state.json` pid.

## Doctor

```bash
.cursor/skills/verify-scripture-outliner/scripts/doctor.sh
```

Pass means: `state.json` exists, that pid is alive, the recorded URL returns 200 with `#app` and `Scripture Outliner`. Fail means stop and relaunch; do not click through a leftover user session.

## Drive

Harness: Playwright Core + system Chrome (`CHROME_PATH` or `/usr/local/bin/google-chrome`) at viewport **390×844**.

```bash
node .cursor/skills/verify-scripture-outliner/scripts/drive.mjs <feature-id>
```

`drive.mjs` installs `playwright-core` into `scripts/node_modules` on first use. It always clears `localStorage` keys `scripture-outliner.document.v1` and `scripture-outliner.prefs.v1` and reloads before the feature, so recipes start from the import screen with **Show text** on.

Stable handles (prefer `data-testid`):

| Handle | Meaning |
| --- | --- |
| `app-title` | Brand heading |
| `import-view` | Empty-state import section |
| `import-text` | Paste textarea |
| `import-submit` | Import button |
| `load-sample` | Load sample |
| `title-input` | Document title |
| `editor` | One-page editor (passage is the outline) |
| `pane-text` | Scrollable passage pane, including empty padding |
| `passage-wrap` | Passage plus pins/toolbar; top/side padding is not a word |
| `passage` | Word stream plus inline section headers |
| `word` | One token; also `data-word-id` |
| `section-header` | Bold inline heading from a non-empty summary; `data-depth` is `0`+. Absent until Summary is written |
| `pin-start` / `pin-end` | Selection pins (`aria-label` Selection start/end) |
| `selection-toolbar` | Icon hint attached to the current selection (Deeper / Shallower / Summary / Delete) |
| `action-deeper` `action-shallower` `action-summary` `action-delete` | Icon action buttons (`aria-label` only; no text labels). Delete is the X in this group. |
| *(removed)* `action-section` `action-bar` `action-clear` | Section (H), sticky bar, and Clear are gone. Deeper creates structure on loose text. Margin / outside tap deselects. |
| `summary-dialog` `summary-field` `summary-save` `summary-cancel` | Summary modal |
| `export` `export-menu` `export-markdown` `export-docx` `new-document` | Header actions. Export opens a format menu. |
| `show-text` | Clickable **Show text** label in `.header-actions` (44px min tap height) |
| `show-text-input` | The checkbox inside that label. Checked by default. |

Do not click words by CSS `.word` index in new recipes if a `data-word-id` is known. After **Load sample**, word id `0` is `The`.

Feature recipes live in [`features/`](features/README.md). Drive the mapped entry points, not a shortcut.

There is no Text / Outline / Split toggle and no separate outline pane. **Show text** only hides body words. It is an app pref in `scripture-outliner.prefs.v1` (default on). Drive clears that key.

## Evidence

Write under `.cursor/skills/verify-scripture-outliner/evidence/<feature-id>/`.

Required for a UI proof:

- Screenshot **before** the mutating action and **after**, at 390×844, with the heading `Scripture Outliner` visible.
- Text snapshot (`*.aria.txt`) of `body` inner text plus title/url.
- `result.json` from `drive.mjs` (feature id, url, counts).

Proof standards:

- Exercise the real click/type path. Reloading after Deeper is how persistence is proved, not reading the store module.
- Capture action and resulting state (empty import → sample loaded; tap → `.selected` + visible pins).
- Side effects: `localStorage` key `scripture-outliner.document.v1` after import; `scripture-outliner.prefs.v1` after toggling Show text; no `section-header` after Deeper alone; `section-header` nodes after a non-empty Summary save.
- No mocks. This app has no backend.

Seeded proof from the first skill run: `evidence/import-sample/`.

**Standing rule:** every future feature PR must include a screenshot or screen recording as proof of the change (390×844 for UI). Attach it in the PR (evidence path and/or walkthrough artifact). Do not merge interaction changes on description alone. Inline-outline PRs must show (1) a bold section header in the passage, (2) a nested indented subsection, and (3) depth ≥ 2 when practical. Nested body text must share the passage color. Only `.selected` may tint words. Icon-toolbar PRs must show the icon hint including the Delete X, without a Section (H) button. Show-text PRs must include 390×844 screenshots with (a) toggle on and body visible and (b) toggle off and headers only. Export PRs must include the format menu at 390×844 plus Markdown with text on, Markdown headers-only with text off, and a `.docx` download smoke.

## Cleanup

```bash
.cursor/skills/verify-scripture-outliner/scripts/cleanup.sh
```

Kills the pid recorded in `.run/state.json` only. Removes the state file and preview log. **Does not delete `evidence/`.**

If a drive fails, still run cleanup before the next launch so port/pid are not stranded.

## Helpers

All under `.cursor/skills/verify-scripture-outliner/scripts/`:

| Command | Purpose |
| --- | --- |
| `./scripts/launch.sh` | Build + isolated `vite preview`; writes `.run/state.json` |
| `./scripts/doctor.sh` | Read-only instance check |
| `node ./scripts/drive.mjs <feature-id>` | Playwright recipe |
| `./scripts/cleanup.sh` | Stop pid; keep evidence |

`scripts/common.sh` is sourced by the shell helpers. `scripts/package.json` pins `playwright-core`. `scripts/node_modules` is local to the skill and gitignored.

Known feature ids: `import-sample`, `word-selection`, `deselect-outside`, `section-deeper-summary`, `inline-outline`, `persistence`, `header-select`, `icon-toolbar`, `show-text`, `export-markdown`, `export-headers-only`, `export-docx`, `header-body-spacing`.
