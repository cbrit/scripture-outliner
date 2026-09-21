# Repro: leftover line break after Delete

Viewport 390×844. Import `The LORD is my shepherd, I shall not want`.

1. Before Deeper, `shepherd,` and `I` share a line. `want` may wrap. That wrap is not the bug.
2. Deeper on `I shall not want` (words 5–8). The second half starts a new line. `passage` innerText contains `shepherd,\nI`. Two `.word-run` nodes. No `<br>`. The split is `display:block` on `.word-run`.
3. Delete (X) on that section. Words 5–8 rejoin `shepherd,` on the original line. One `.word-run`. This path already matches the expected layout on current main.
4. Sibling leftover (the failing path). Deeper on words 0–4, then 5–8. Delete the second section. `shepherd,` stays on its line and `I` stays on the next line. Remaining headerless segment 0–4 is still a block run, so the space that used to sit between `shepherd,` and `I` never comes back.

Discriminating check: `shepherd,` and `I` y-coordinates, and whether innerText includes `shepherd,\nI`. Do not assert that every word shares one y. At this width `want` wraps in the original.
