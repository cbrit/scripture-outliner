#!/usr/bin/env node
/**
 * Drive Scripture Outliner in Chrome via Playwright against the launched preview.
 *
 * Usage: node drive.mjs <feature-id>
 * Features: import-sample | word-selection | deselect-outside | section-deeper-summary | inline-outline | persistence | header-select | icon-toolbar
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(scriptDir, "..");
const stateFile = path.join(skillDir, ".run/state.json");
const evidenceRoot = path.join(skillDir, "evidence");
const viewport = { width: 390, height: 844 };

const feature = process.argv[2];
if (!feature) {
  console.error("Usage: node drive.mjs <feature-id>");
  process.exit(2);
}

function ensurePlaywright() {
  const marker = path.join(scriptDir, "node_modules/playwright-core/package.json");
  if (fs.existsSync(marker)) {
    return;
  }
  const result = spawnSync("npm", ["install", "--no-fund", "--no-audit"], {
    cwd: scriptDir,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error("Failed to install playwright-core for verification helpers");
  }
}

function readState() {
  if (!fs.existsSync(stateFile)) {
    throw new Error(`Missing ${stateFile}. Run launch.sh then doctor.sh.`);
  }
  return JSON.parse(fs.readFileSync(stateFile, "utf8"));
}

function chromePath() {
  return (
    process.env.CHROME_PATH ||
    ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"].find(
      (candidate) => fs.existsSync(candidate),
    ) ||
    "google-chrome"
  );
}

async function openPage(url) {
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({
    executablePath: chromePath(),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.removeItem("scripture-outliner.document.v1"));
  await page.reload({ waitUntil: "networkidle" });
  return { browser, page, errors };
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function snapshot(page, dir, name, extra) {
  fs.mkdirSync(dir, { recursive: true });
  const png = path.join(dir, `${name}.png`);
  const aria = path.join(dir, `${name}.aria.txt`);
  await page.screenshot({ path: png, fullPage: true });
  const body = await page.locator("body").innerText();
  fs.writeFileSync(
    aria,
    [
      `title: ${await page.title()}`,
      `url: ${page.url()}`,
      `h1: ${(await page.getByTestId("app-title").textContent()) ?? ""}`,
      extra ? `extra: ${JSON.stringify(extra)}` : "",
      "---",
      body,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return {
    png: path.relative(skillDir, png),
    aria: path.relative(skillDir, aria),
  };
}

const TOOLBAR_ACTIONS = [
  { id: "action-deeper", label: "Deeper" },
  { id: "action-shallower", label: "Shallower" },
  { id: "action-summary", label: "Summary" },
  { id: "action-delete", label: "Delete" },
];

async function assertIconToolbar(page) {
  const toolbar = page.getByTestId("selection-toolbar");
  if (!(await toolbar.isVisible())) {
    throw new Error("Selection toolbar should be visible");
  }
  for (const action of TOOLBAR_ACTIONS) {
    const btn = page.getByTestId(action.id);
    if (!(await btn.isVisible())) {
      throw new Error(`Missing toolbar action ${action.id}`);
    }
    const inToolbar = await btn.evaluate(
      (el) => el.closest("[data-testid='selection-toolbar']") !== null,
    );
    if (!inToolbar) {
      throw new Error(`${action.id} is not inside selection-toolbar`);
    }
    const aria = await btn.getAttribute("aria-label");
    if (aria !== action.label) {
      throw new Error(`${action.id} aria-label is ${JSON.stringify(aria)}`);
    }
    const text = ((await btn.innerText()) ?? "").trim();
    if (text) {
      throw new Error(`${action.id} still shows a text label: ${JSON.stringify(text)}`);
    }
    if ((await btn.locator("svg").count()) < 1) {
      throw new Error(`${action.id} is missing an icon`);
    }
    const box = await btn.boundingBox();
    if (!box || box.width < 44 || box.height < 44) {
      throw new Error(
        `${action.id} tap target is ${box?.width}x${box?.height}, expected >= 44`,
      );
    }
  }
  if ((await page.getByTestId("action-section").count()) !== 0) {
    throw new Error("action-section should be removed");
  }
  if ((await page.getByTestId("action-clear").count()) !== 0) {
    throw new Error("action-clear should be removed");
  }
  if ((await page.getByTestId("action-bar").count()) !== 0) {
    throw new Error("action-bar should be removed");
  }
}

async function deselectByMargin(page) {
  await tapWrapPadding(page);
}

async function clickWordId(page, id) {
  const word = page.locator(`[data-word-id="${id}"]`);
  await word.scrollIntoViewIfNeeded();
  const box = await word.boundingBox();
  if (!box) {
    throw new Error(`Word ${id} has no bounding box`);
  }
  await word.click({ position: { x: Math.min(6, box.width / 2), y: Math.min(6, box.height / 2) } });
}

async function saveSummary(page, text) {
  await page.getByTestId("action-summary").click();
  await page.getByTestId("summary-field").fill(text);
  await page.getByTestId("summary-save").click();
  await page.getByTestId("summary-dialog").waitFor({ state: "hidden" });
}

async function headerDepths(page) {
  return page.getByTestId("section-header").evaluateAll((headers) =>
    headers.map((header) => header.getAttribute("data-depth")),
  );
}

function isTransparentColor(value) {
  const compact = value.replace(/\s+/g, "");
  return (
    compact === "transparent" ||
    compact === "rgba(0,0,0,0)" ||
    compact === "rgb(0,0,0,0)" ||
    /^rgba\(\d+,\d+,\d+,0(?:\.0+)?\)$/.test(compact)
  );
}

async function assertNoHierarchyTints(page) {
  const offenders = await page.locator(".word, .gap").evaluateAll((nodes) =>
    nodes
      .filter((el) => /\bseg-[0-3]\b/.test(el.className))
      .map((el) => ({
        className: el.className,
        wordId: el.getAttribute("data-word-id"),
        before: el.getAttribute("data-before"),
      })),
  );
  if (offenders.length) {
    throw new Error(
      `Hierarchy tint classes still present: ${JSON.stringify(offenders.slice(0, 8))}`,
    );
  }
}

async function wordPaint(page, ids) {
  return page.evaluate((wordIds) => {
    return wordIds.map((id) => {
      const el = document.querySelector(`[data-word-id="${id}"]`);
      if (!(el instanceof HTMLElement)) {
        throw new Error(`Missing word ${id}`);
      }
      return {
        id,
        backgroundColor: getComputedStyle(el).backgroundColor,
        selected: el.classList.contains("selected"),
      };
    });
  }, ids);
}

async function assertUniformBodyPaint(page, ids) {
  await assertNoHierarchyTints(page);
  const paints = await wordPaint(page, ids);
  const selected = paints.filter((entry) => entry.selected);
  if (selected.length) {
    throw new Error(`Expected no selection on body paint check, got ${JSON.stringify(selected)}`);
  }
  const colors = new Set(paints.map((entry) => entry.backgroundColor));
  if (colors.size !== 1) {
    throw new Error(`Body colors differ by hierarchy: ${JSON.stringify(paints)}`);
  }
  if (!isTransparentColor(paints[0].backgroundColor)) {
    throw new Error(`Unselected body should use passage color, got ${JSON.stringify(paints)}`);
  }
  return paints;
}

async function assertSelectionFill(page, startId, endId) {
  const selectedIds = [];
  for (let id = startId; id <= endId; id += 1) {
    selectedIds.push(id);
  }
  const paints = await wordPaint(page, selectedIds);
  const missing = paints.filter((entry) => !entry.selected);
  if (missing.length) {
    throw new Error(`Expected selected ${startId}–${endId}, missing ${JSON.stringify(missing)}`);
  }
  const opaque = paints.filter((entry) => !isTransparentColor(entry.backgroundColor));
  if (opaque.length !== paints.length) {
    throw new Error(`Selection fill missing on ${JSON.stringify(paints)}`);
  }
  const colors = new Set(opaque.map((entry) => entry.backgroundColor));
  if (colors.size !== 1) {
    throw new Error(`Selection fill is not continuous: ${JSON.stringify(paints)}`);
  }
  if (endId > startId) {
    const filledGaps = await page.locator(".gap.selected").count();
    if (filledGaps < 1) {
      throw new Error("Expected highlighted spaces between selected words");
    }
  }
  return paints;
}

async function driveImportSample(page) {
  const importView = page.getByTestId("import-view");
  if (!(await importView.isVisible())) {
    throw new Error("Import view is not visible on a fresh session");
  }
  const before = await snapshot(page, path.join(evidenceRoot, "import-sample"), "empty", {
    step: "empty-import",
  });
  await page.getByTestId("load-sample").click();
  await page.getByTestId("passage").waitFor({ state: "visible" });
  const words = page.getByTestId("word");
  await words.first().waitFor();
  const wordCount = await words.count();
  const title = await page.getByTestId("title-input").inputValue();
  if (wordCount < 50) {
    throw new Error(`Expected sample words, got ${wordCount}`);
  }
  if (title !== "Sample") {
    throw new Error(`Unexpected title after sample: ${title}`);
  }
  const firstWord = (await words.first().textContent()) ?? "";
  if (firstWord !== "The") {
    throw new Error(`Expected first sample word "The", got ${JSON.stringify(firstWord)}`);
  }
  const after = await snapshot(page, path.join(evidenceRoot, "import-sample"), "sample-loaded", {
    step: "sample-loaded",
    wordCount,
    title,
  });
  return { wordCount, title, before, after };
}

async function tapWrapPadding(page) {
  const wrap = page.getByTestId("passage-wrap");
  await wrap.click({ position: { x: 8, y: 10 }, force: true });
}

async function driveDeselectOutside(page) {
  await driveImportSample(page);
  await clickWordId(page, 0);
  await page.getByTestId("pin-start").waitFor({ state: "visible" });
  const selectedBefore = await page.locator('[data-testid="word"].selected').count();
  if (selectedBefore !== 1) {
    throw new Error(`Expected 1 selected word before margin tap, got ${selectedBefore}`);
  }
  if (!(await page.getByTestId("selection-toolbar").isVisible())) {
    throw new Error("Selection toolbar should be visible before margin tap");
  }
  const before = await snapshot(page, path.join(evidenceRoot, "deselect-outside"), "selected", {
    step: "selected",
    selected: selectedBefore,
  });
  await tapWrapPadding(page);
  const selectedAfter = await page.locator('[data-testid="word"].selected').count();
  if (selectedAfter !== 0) {
    throw new Error(`Expected selection cleared by margin tap, got ${selectedAfter} selected words`);
  }
  if ((await page.getByTestId("pin-start").getAttribute("hidden")) === null) {
    throw new Error("Start pin should be hidden after margin tap");
  }
  if ((await page.getByTestId("pin-end").getAttribute("hidden")) === null) {
    throw new Error("End pin should be hidden after margin tap");
  }
  if (await page.getByTestId("selection-toolbar").isVisible()) {
    throw new Error("Selection toolbar should be hidden after margin tap");
  }
  if ((await page.getByTestId("action-bar").count()) !== 0) {
    throw new Error("action-bar should be removed");
  }
  const after = await snapshot(page, path.join(evidenceRoot, "deselect-outside"), "deselected", {
    step: "deselected-via-margin",
    selected: selectedAfter,
  });
  await clickWordId(page, 0);
  await clickWordId(page, 6);
  await page.getByTestId("action-deeper").click();
  await waitForExactSegment(page);
  if ((await page.getByTestId("section-header").count()) !== 0) {
    throw new Error("Deeper must not show a header before Summary");
  }
  await saveSummary(page, "Shepherd");
  await page.getByTestId("section-header").first().waitFor();
  const headersAfterDeeper = await page.getByTestId("section-header").count();
  if (headersAfterDeeper < 1) {
    throw new Error("Summary did not create a header");
  }
  await clickWordId(page, 0);
  await page.getByTestId("pin-start").waitFor({ state: "visible" });
  await tapWrapPadding(page);
  const headersAfterDeselect = await page.getByTestId("section-header").count();
  const selectedAfterKeep = await page.locator('[data-testid="word"].selected').count();
  if (headersAfterDeselect !== headersAfterDeeper) {
    throw new Error(
      `Margin tap deleted segments (headers ${headersAfterDeeper} → ${headersAfterDeselect})`,
    );
  }
  if (selectedAfterKeep !== 0) {
    throw new Error(`Expected no selection after second margin tap, got ${selectedAfterKeep}`);
  }
  await clickWordId(page, 20);
  const reselected = await page.locator('[data-testid="word"].selected').count();
  if (reselected !== 1) {
    throw new Error(`Word tap after deselect should select again, got ${reselected}`);
  }
  const pinHidden = await page.getByTestId("pin-start").getAttribute("hidden");
  if (pinHidden !== null) {
    throw new Error("Pins should return after a word tap following deselect");
  }
  return {
    selectedBefore,
    selectedAfter,
    headersAfterDeeper,
    headersAfterDeselect,
    reselected,
    before,
    after,
  };
}

async function driveWordSelection(page) {
  await driveImportSample(page);
  const first = page.getByTestId("word").first();
  await first.click();
  await page.getByTestId("pin-start").waitFor({ state: "visible" });
  const selectedCount = await page.locator('[data-testid="word"].selected').count();
  if (selectedCount !== 1) {
    throw new Error(`Expected 1 selected word, got ${selectedCount}`);
  }
  await assertIconToolbar(page);
  const startHidden = await page.getByTestId("pin-start").getAttribute("hidden");
  if (startHidden !== null) {
    throw new Error("Start pin should be visible after a word tap");
  }
  await page.getByTestId("word").nth(4).click();
  const rangeCount = await page.locator('[data-testid="word"].selected').count();
  if (rangeCount < 2) {
    throw new Error(`Expected an extended range, got ${rangeCount} selected words`);
  }
  await assertNoHierarchyTints(page);
  const selectionPaint = await assertSelectionFill(page, 0, 4);
  const outside = await wordPaint(page, [10]);
  if (outside[0].selected || !isTransparentColor(outside[0].backgroundColor)) {
    throw new Error(`Unselected word should stay passage color, got ${JSON.stringify(outside)}`);
  }
  const after = await snapshot(page, path.join(evidenceRoot, "word-selection"), "range", {
    selected: rangeCount,
    selectionPaint,
    outside,
  });
  return { selected: rangeCount, selectionPaint, outside, after };
}

async function waitForExactSegment(page) {
  await page.waitForFunction(() => {
    const del = document.querySelector('[data-testid="action-delete"]');
    return del instanceof HTMLButtonElement && !del.disabled;
  });
}

async function driveSectionDeeperSummary(page) {
  await driveImportSample(page);
  await page.getByTestId("word").nth(1).click();
  await page.getByTestId("word").nth(6).click();
  await page.getByTestId("action-deeper").click();
  await waitForExactSegment(page);
  const afterDeeperCount = await page.getByTestId("section-header").count();
  if (afterDeeperCount !== 0) {
    throw new Error(`Deeper must not show a header, got ${afterDeeperCount}`);
  }
  const afterDeeper = await snapshot(
    page,
    path.join(evidenceRoot, "section-deeper-summary"),
    "after-deeper",
    { step: "deeper-no-header", headers: afterDeeperCount },
  );
  await page.getByTestId("word").nth(3).click();
  await page.getByTestId("word").nth(5).click();
  await page.getByTestId("action-deeper").click();
  await waitForExactSegment(page);
  const afterNestedCount = await page.getByTestId("section-header").count();
  if (afterNestedCount !== 0) {
    throw new Error(`Nested Deeper must not show a header, got ${afterNestedCount}`);
  }
  if (await page.getByTestId("action-shallower").isDisabled()) {
    throw new Error("Shallower should be enabled on a nested segment");
  }
  await saveSummary(page, "Shepherd care");
  await page.getByTestId("section-header").first().waitFor();
  const depths = await headerDepths(page);
  if (depths.length !== 1 || depths[0] !== "1") {
    throw new Error(`Expected only the depth-1 summary header, got ${JSON.stringify(depths)}`);
  }
  const summaries = await page.getByTestId("section-header").evaluateAll((headers) =>
    headers.map((header) => header.textContent ?? ""),
  );
  if (!summaries.some((value) => value.includes("Shepherd care"))) {
    throw new Error(`Summary did not persist in header, got ${JSON.stringify(summaries)}`);
  }
  const placeholder = await page
    .locator('[data-testid="section-header"][data-placeholder="true"]')
    .count();
  if (placeholder !== 0) {
    throw new Error("Summary header must not be a placeholder");
  }
  await deselectByMargin(page);
  const afterSummary = await snapshot(
    page,
    path.join(evidenceRoot, "section-deeper-summary"),
    "after-summary",
    { depths, summaries },
  );
  await page.getByTestId("section-header").first().click();
  await waitForExactSegment(page);
  await page.getByTestId("action-shallower").click();
  const shallowerDepth = await page
    .getByTestId("section-header")
    .first()
    .getAttribute("data-depth");
  if (shallowerDepth !== "0") {
    throw new Error(`Shallower should outdent to depth 0, got ${JSON.stringify(shallowerDepth)}`);
  }
  return { depths, summaries, afterDeeper, afterSummary, shallowerDepth };
}

async function driveInlineOutline(page) {
  await driveImportSample(page);
  const before = await snapshot(page, path.join(evidenceRoot, "inline-outline"), "before", {
    step: "sample-loaded",
  });
  await clickWordId(page, 0);
  await clickWordId(page, 24);
  await page.getByTestId("action-deeper").click();
  await waitForExactSegment(page);
  if ((await page.getByTestId("section-header").count()) !== 0) {
    throw new Error("Deeper must not show a header before Summary");
  }
  await saveSummary(page, "The LORD is shepherd");
  await page.locator('[data-testid="section-header"][data-depth="0"]').waitFor();
  await clickWordId(page, 9);
  await clickWordId(page, 24);
  await page.getByTestId("action-deeper").click();
  await waitForExactSegment(page);
  if ((await page.getByTestId("section-header").count()) !== 1) {
    throw new Error("Deeper must not add a header before Summary");
  }
  await saveSummary(page, "Green pastures");
  await page.locator('[data-testid="section-header"][data-depth="1"]').waitFor();
  await clickWordId(page, 18);
  await clickWordId(page, 24);
  await page.getByTestId("action-deeper").click();
  await waitForExactSegment(page);
  if ((await page.getByTestId("section-header").count()) !== 2) {
    throw new Error("Second Deeper must not add a header before Summary");
  }
  await saveSummary(page, "Still waters");
  await page.locator('[data-testid="section-header"][data-depth="2"]').waitFor();
  await deselectByMargin(page);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    const pane = document.querySelector('[data-testid="pane-text"]');
    if (pane instanceof HTMLElement) {
      pane.scrollTop = 0;
    }
  });
  const depths = await headerDepths(page);
  if (!depths.includes("0") || !depths.includes("1") || !depths.includes("2")) {
    throw new Error(`Expected nested depths 0–2, got ${JSON.stringify(depths)}`);
  }
  const texts = await page.getByTestId("section-header").evaluateAll((headers) =>
    headers.map((header) => ({
      depth: header.getAttribute("data-depth"),
      text: header.textContent ?? "",
      placeholder: header.getAttribute("data-placeholder"),
      paddingLeft: Number.parseFloat(getComputedStyle(header).paddingLeft),
    })),
  );
  const d0 = texts.find((entry) => entry.depth === "0");
  const d1 = texts.find((entry) => entry.depth === "1");
  const d2 = texts.find((entry) => entry.depth === "2");
  if (!d0 || !d1 || !d2) {
    throw new Error(`Missing nested headers: ${JSON.stringify(texts)}`);
  }
  if (d1.paddingLeft <= d0.paddingLeft || d2.paddingLeft <= d1.paddingLeft) {
    throw new Error(`Headers are not indented by depth: ${JSON.stringify(texts)}`);
  }
  if (
    !d0.text.includes("The LORD is shepherd") ||
    !d1.text.includes("Green pastures") ||
    !d2.text.includes("Still waters")
  ) {
    throw new Error(`Unexpected header labels: ${JSON.stringify(texts)}`);
  }
  const bodyPaint = await assertUniformBodyPaint(page, [0, 9, 18]);
  const after = await snapshot(page, path.join(evidenceRoot, "inline-outline"), "nested", {
    depths,
    texts,
    bodyPaint,
  });
  const innerHeader = page.locator('[data-testid="section-header"][data-depth="2"]');
  await innerHeader.click();
  const selectedIds = await selectedWordIds(page);
  if (selectedIds[0] !== 18 || selectedIds[selectedIds.length - 1] !== 24) {
    throw new Error(`Expected inner range 18–24 selected, got ${JSON.stringify(selectedIds)}`);
  }
  const selectionPaint = await assertSelectionFill(page, 18, 24);
  const unselected = await wordPaint(page, [0, 9]);
  if (unselected.some((entry) => entry.selected || !isTransparentColor(entry.backgroundColor))) {
    throw new Error(`Unselected nested body should stay passage color, got ${JSON.stringify(unselected)}`);
  }
  if (unselected[0].backgroundColor !== unselected[1].backgroundColor) {
    throw new Error(`Unselected depths still differ: ${JSON.stringify(unselected)}`);
  }
  const selectedShot = await snapshot(
    page,
    path.join(evidenceRoot, "inline-outline"),
    "nested-selected",
    { selected: selectedIds, selectionPaint, unselected },
  );
  return { depths, texts, bodyPaint, selectionPaint, before, after, selectedShot };
}

async function selectedWordIds(page) {
  return page.locator('[data-testid="word"].selected').evaluateAll((words) =>
    words.map((word) => Number(word.getAttribute("data-word-id"))),
  );
}

async function storedFirstSegment(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("scripture-outliner.document.v1");
    if (!raw) {
      throw new Error("localStorage key scripture-outliner.document.v1 was empty");
    }
    const parsed = JSON.parse(raw);
    const segment = parsed.segments?.[0];
    if (!segment || typeof segment.start !== "number" || typeof segment.end !== "number") {
      throw new Error("Stored document had no first segment range");
    }
    return { start: segment.start, end: segment.end, summary: segment.summary ?? "" };
  });
}

async function driveHeaderSelect(page) {
  await driveImportSample(page);
  await clickWordId(page, 0);
  await clickWordId(page, 8);
  await page.getByTestId("action-deeper").click();
  await waitForExactSegment(page);
  if ((await page.getByTestId("section-header").count()) !== 0) {
    throw new Error("Deeper must not show a header before Summary");
  }
  await saveSummary(page, "The LORD is shepherd");
  await page.getByTestId("section-header").first().waitFor();
  const segment = await storedFirstSegment(page);
  if (segment.start !== 0 || segment.end !== 8 || !segment.summary.includes("The LORD is shepherd")) {
    throw new Error(`Unexpected stored segment: ${JSON.stringify(segment)}`);
  }
  await deselectByMargin(page);
  const clearedIds = await selectedWordIds(page);
  if (clearedIds.length !== 0) {
    throw new Error(`Expected no selected words after margin deselect, got ${JSON.stringify(clearedIds)}`);
  }
  const header = page.getByTestId("section-header").first();
  const headerText = (await header.textContent()) ?? "";
  if (!headerText.includes("The LORD is shepherd")) {
    throw new Error(`Expected summary header, got ${JSON.stringify(headerText)}`);
  }
  const before = await snapshot(page, path.join(evidenceRoot, "header-select"), "cleared", {
    step: "cleared",
    segment,
    selected: clearedIds,
  });
  await header.scrollIntoViewIfNeeded();
  await header.click();
  const selectedIds = await selectedWordIds(page);
  const expectedCount = segment.end - segment.start + 1;
  if (selectedIds.length !== expectedCount) {
    throw new Error(`Expected ${expectedCount} selected words, got ${JSON.stringify(selectedIds)}`);
  }
  const first = selectedIds[0];
  const last = selectedIds[selectedIds.length - 1];
  if (first !== segment.start || last !== segment.end) {
    throw new Error(
      `Selection ${first}–${last} did not match segment ${segment.start}–${segment.end}`,
    );
  }
  const missing = [];
  for (let id = segment.start; id <= segment.end; id += 1) {
    if (!selectedIds.includes(id)) {
      missing.push(id);
    }
  }
  if (missing.length) {
    throw new Error(`Selection skipped word ids ${JSON.stringify(missing)}`);
  }
  const ariaCurrent = await header.getAttribute("aria-current");
  if (ariaCurrent === null) {
    throw new Error("Header should have aria-current after its range is selected");
  }
  if (!(await page.getByTestId("selection-toolbar").isVisible())) {
    throw new Error("Selection toolbar should be visible after a header tap");
  }
  const startHidden = await page.getByTestId("pin-start").getAttribute("hidden");
  const endHidden = await page.getByTestId("pin-end").getAttribute("hidden");
  if (startHidden !== null || endHidden !== null) {
    throw new Error("Pins should be visible after a header tap");
  }
  const after = await snapshot(page, path.join(evidenceRoot, "header-select"), "selected", {
    step: "header-selected",
    segment,
    selected: selectedIds,
    ariaCurrent,
  });
  return { segment, selected: selectedIds, ariaCurrent, before, after };
}

async function drivePersistence(page) {
  await driveImportSample(page);
  await page.getByTestId("word").nth(1).click();
  await page.getByTestId("action-deeper").click();
  await waitForExactSegment(page);
  if ((await page.getByTestId("section-header").count()) !== 0) {
    throw new Error("Deeper must not show a header before Summary");
  }
  const stored = await page.evaluate(() => localStorage.getItem("scripture-outliner.document.v1"));
  if (!stored) {
    throw new Error("localStorage key scripture-outliner.document.v1 was empty after Deeper");
  }
  const parsed = JSON.parse(stored);
  if (!Array.isArray(parsed.segments) || parsed.segments.length < 1) {
    throw new Error("Stored document had no segments");
  }
  if (typeof parsed.segments[0].depth !== "number") {
    throw new Error("Stored segment depth was not a number");
  }
  await saveSummary(page, "Shepherd care");
  await page.getByTestId("section-header").first().waitFor();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByTestId("passage").waitFor({ state: "visible" });
  const title = await page.getByTestId("title-input").inputValue();
  const headers = await page.getByTestId("section-header").count();
  const headerText = (await page.getByTestId("section-header").first().textContent()) ?? "";
  if (!title.includes("Sample") || headers < 1 || !headerText.includes("Shepherd care")) {
    throw new Error(`Reload lost document (title=${title} headers=${headers} text=${headerText})`);
  }
  await deselectByMargin(page);
  const after = await snapshot(page, path.join(evidenceRoot, "persistence"), "reload", {
    title,
    headers,
  });
  return { title, headers, after };
}

async function driveIconToolbar(page) {
  await driveImportSample(page);
  await clickWordId(page, 0);
  await page.getByTestId("selection-toolbar").waitFor({ state: "visible" });
  await assertIconToolbar(page);
  const deleteDisabled = await page.getByTestId("action-delete").isDisabled();
  if (!deleteDisabled) {
    throw new Error("Delete should be disabled when the selection is not an exact segment");
  }
  const after = await snapshot(page, path.join(evidenceRoot, "icon-toolbar"), "toolbar", {
    step: "icon-toolbar",
    actions: TOOLBAR_ACTIONS.map((action) => action.id),
  });
  await deselectByMargin(page);
  const selectedAfter = await page.locator('[data-testid="word"].selected').count();
  if (selectedAfter !== 0) {
    throw new Error(`Margin tap should deselect, still ${selectedAfter} selected`);
  }
  return { after, deleteDisabled };
}

const drivers = {
  "import-sample": driveImportSample,
  "word-selection": driveWordSelection,
  "deselect-outside": driveDeselectOutside,
  "section-deeper-summary": driveSectionDeeperSummary,
  "inline-outline": driveInlineOutline,
  persistence: drivePersistence,
  "header-select": driveHeaderSelect,
  "icon-toolbar": driveIconToolbar,
};

ensurePlaywright();
const state = readState();
const driver = drivers[feature];
if (!driver) {
  console.error(`Unknown feature ${feature}. Known: ${Object.keys(drivers).join(", ")}`);
  process.exit(2);
}

const { browser, page, errors } = await openPage(state.url);
try {
  const result = await driver(page);
  if (errors.length) {
    throw new Error(`Page errors: ${errors.join("; ")}`);
  }
  const summaryPath = path.join(evidenceRoot, feature, "result.json");
  writeJson(summaryPath, {
    feature,
    url: state.url,
    viewport,
    result,
    at: new Date().toISOString(),
  });
  console.log(`OK ${feature}`);
  console.log(summaryPath);
} finally {
  await browser.close();
}
