# Repro: uneven header→body gap

Viewport: 390×844. Preview: `http://127.0.0.1:4173/` (local Vite, not Pages).

## Clicks

1. Load sample.
2. Select words 0–24. Deeper. Summary `The LORD is shepherd` (depth 0).
3. Select words 9–24. Deeper. Summary `Green pastures` (depth 1).
4. Select words 18–24. Deeper. Summary `Still waters` (depth 2).
5. Tap passage-wrap padding to hide pins/toolbar.

## Measured (header bottom → first `.word` top)

| Header | Depth | Gap |
| --- | --- | --- |
| The LORD is shepherd | 0 | 5.09px |
| Green pastures | 1 | **36.88px** |
| Still waters | 2 | 4.70px |

The extra ~32px (one line) after **Green pastures** is inside the following `.word-run`, not extra `.section-header` margin. That run's first child is a leading `<br>` (height 21px) before word `He`. Depth 0 and depth 2 runs start with a word. The unsectioned run after the nested range (starting `He restoreth`) also begins with `<br>` and shows the same extra blank.

Screenshot: `evidence/header-body-spacing/uneven.png`.

Drive (unfixed): `Header-to-body gaps differ across depths by 32.17px` (5.09 / 36.88 / 4.70).

Drive (fixed): spread `0.39px` (5.09 / 4.80 / 4.70). Screenshot: `evidence/header-body-spacing/nested.png`.
