#!/usr/bin/env node
/**
 * Drive Scripture Outliner in Chrome via Playwright against the launched preview.
 *
 * Usage: node drive.mjs <feature-id>
 * Features: import-sample | word-selection | deselect-outside | section-deeper-summary | inline-outline | persistence
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
  if (await page.getByTestId("action-bar").isVisible()) {
    throw new Error("Action bar should be hidden after margin tap");
  }
  const after = await snapshot(page, path.join(evidenceRoot, "deselect-outside"), "deselected", {
    step: "deselected-via-margin",
    selected: selectedAfter,
  });
  await clickWordId(page, 0);
  await clickWordId(page, 6);
  await page.getByTestId("action-section").click();
  await page.getByTestId("section-header").first().waitFor();
  const headersAfterSection = await page.getByTestId("section-header").count();
  if (headersAfterSection < 1) {
    throw new Error("Section did not create a header");
  }
  await clickWordId(page, 0);
  await page.getByTestId("pin-start").waitFor({ state: "visible" });
  await tapWrapPadding(page);
  const headersAfterDeselect = await page.getByTestId("section-header").count();
  const selectedAfterKeep = await page.locator('[data-testid="word"].selected').count();
  if (headersAfterDeselect !== headersAfterSection) {
    throw new Error(
      `Margin tap deleted segments (headers ${headersAfterSection} → ${headersAfterDeselect})`,
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
    headersAfterSection,
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
  const toolbar = page.getByTestId("selection-toolbar");
  if (!(await toolbar.isVisible())) {
    throw new Error("Selection toolbar should be visible after a word tap");
  }
  for (const action of ["action-section", "action-deeper", "action-shallower", "action-summary"]) {
    if (!(await page.getByTestId(action).isVisible())) {
      throw new Error(`Missing toolbar action ${action}`);
    }
  }
  const startHidden = await page.getByTestId("pin-start").getAttribute("hidden");
  if (startHidden !== null) {
    throw new Error("Start pin should be visible after a word tap");
  }
  await page.getByTestId("word").nth(4).click();
  const rangeCount = await page.locator('[data-testid="word"].selected').count();
  if (rangeCount < 2) {
    throw new Error(`Expected an extended range, got ${rangeCount} selected words`);
  }
  const filledGaps = await page.locator(".gap.selected").count();
  if (filledGaps < 1) {
    throw new Error("Expected highlighted spaces between selected words");
  }
  const after = await snapshot(page, path.join(evidenceRoot, "word-selection"), "range", {
    selected: rangeCount,
    filledGaps,
  });
  return { selected: rangeCount, filledGaps, after };
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
  await page.getByTestId("action-section").click();
  await waitForExactSegment(page);
  const afterSectionCount = await page.getByTestId("section-header").count();
  if (afterSectionCount !== 0) {
    throw new Error(`Section must not show a header, got ${afterSectionCount}`);
  }
  const afterSection = await snapshot(
    page,
    path.join(evidenceRoot, "section-deeper-summary"),
    "after-section",
    { step: "section-no-header", headers: afterSectionCount },
  );
  await page.getByTestId("word").nth(3).click();
  await page.getByTestId("word").nth(5).click();
  await page.getByTestId("action-deeper").click();
  await waitForExactSegment(page);
  const afterDeeperCount = await page.getByTestId("section-header").count();
  if (afterDeeperCount !== 0) {
    throw new Error(`Deeper must not show a header, got ${afterDeeperCount}`);
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
  await page.getByTestId("action-clear").click();
  const afterSummary = await snapshot(
    page,
    path.join(evidenceRoot, "section-deeper-summary"),
    "after-summary",
    { depths, summaries },
  );
  return { depths, summaries, afterSection, afterSummary };
}

async function driveInlineOutline(page) {
  await driveImportSample(page);
  const before = await snapshot(page, path.join(evidenceRoot, "inline-outline"), "before", {
    step: "sample-loaded",
  });
  await clickWordId(page, 0);
  await clickWordId(page, 24);
  await page.getByTestId("action-section").click();
  await waitForExactSegment(page);
  if ((await page.getByTestId("section-header").count()) !== 0) {
    throw new Error("Section must not show a header before Summary");
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
  await page.getByTestId("action-clear").click();
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
  const after = await snapshot(page, path.join(evidenceRoot, "inline-outline"), "nested", {
    depths,
    texts,
  });
  return { depths, texts, before, after };
}

async function drivePersistence(page) {
  await driveImportSample(page);
  await page.getByTestId("word").nth(1).click();
  await page.getByTestId("action-section").click();
  await waitForExactSegment(page);
  if ((await page.getByTestId("section-header").count()) !== 0) {
    throw new Error("Section must not show a header before Summary");
  }
  const stored = await page.evaluate(() => localStorage.getItem("scripture-outliner.document.v1"));
  if (!stored) {
    throw new Error("localStorage key scripture-outliner.document.v1 was empty after Section");
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
  await page.getByTestId("action-clear").click();
  const after = await snapshot(page, path.join(evidenceRoot, "persistence"), "reload", {
    title,
    headers,
  });
  return { title, headers, after };
}

const drivers = {
  "import-sample": driveImportSample,
  "word-selection": driveWordSelection,
  "deselect-outside": driveDeselectOutside,
  "section-deeper-summary": driveSectionDeeperSummary,
  "inline-outline": driveInlineOutline,
  persistence: drivePersistence,
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
