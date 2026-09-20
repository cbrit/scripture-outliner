# Scripture Outliner verification map

This directory is the maintained source for verifying user-facing behavior. Read this index, then the matching feature file.

## Baseline preconditions

- Launch via `.cursor/skills/verify-scripture-outliner/scripts/launch.sh`.
- Confirm `.cursor/skills/verify-scripture-outliner/scripts/doctor.sh` prints `OK` for a `127.0.0.1` preview URL.
- Start from a cleared `scripture-outliner.document.v1` (the drive helper does this).
- Viewport 390×844 unless a recipe says otherwise.
- Never drive a preview this run did not start. Never drive Whatley sites or `https://cbrit.github.io/` root.

## Driving conventions

- Start every recipe from the import empty state unless its preconditions say otherwise.
- Prefer `getByTestId` handles listed in the skill. Keep quoted names unchanged.
- Run browser actions through `node .cursor/skills/verify-scripture-outliner/scripts/drive.mjs <feature-id>` or the same locators in an ad-hoc Playwright session against the launched URL.
- Restore the empty import state between unrelated features (`new-document` confirm, or clear storage + reload). Do not remove proof artifacts during cleanup.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes a text snapshot and a 390px screenshot with `Scripture Outliner` visible.
- Persistence proof includes a reload (or a second load of the same origin) that still shows the title and outline.
- Record the feature ID with every artifact under `evidence/<feature-id>/`.
- Report an unreachable path with the command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features`
2. `How to get to it (user POV)`
3. `Driving it with verify-so`
4. `Gotchas`

## Features

- [Import and sample](./import-sample.md) covers paste import and the Psalm 23 sample.
- [Word selection and pins](./word-selection.md) covers tap, extend, and pin visibility.
- [Bullet, sub, and summary](./bullet-sub-summary.md) covers marking ranges and writing a summary.
- [View modes](./view-modes.md) covers Text, Split, and Outline.
- [Persistence](./persistence.md) covers `localStorage` restore after reload.
