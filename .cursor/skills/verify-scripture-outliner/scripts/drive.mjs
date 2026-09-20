#!/usr/bin/env node
/**
 * Drive Scripture Outliner in Chrome via Playwright against the launched preview.
 *
 * Usage: node drive.mjs <feature-id>
 * Features: import-sample | word-selection | bullet-sub-summary | view-modes | persistence
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

async function driveWordSelection(page) {
  await driveImportSample(page);
  const first = page.getByTestId("word").first();
  await first.click();
  await page.getByTestId("pin-start").waitFor({ state: "visible" });
  const selectedCount = await page.locator('[data-testid="word"].selected').count();
  if (selectedCount !== 1) {
    throw new Error(`Expected 1 selected word, got ${selectedCount}`);
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
  const after = await snapshot(page, path.join(evidenceRoot, "word-selection"), "range", {
    selected: rangeCount,
  });
  return { selected: rangeCount, after };
}

async function driveBulletSubSummary(page) {
  await driveImportSample(page);
  await page.getByTestId("word").nth(1).click();
  await page.getByTestId("word").nth(6).click();
  await page.getByTestId("action-bullet").click();
  await page.getByTestId("outline-row").first().waitFor();
  const bulletRows = await page.getByTestId("outline-row").count();
  if (bulletRows < 1) {
    throw new Error("Bullet did not create an outline row");
  }
  await page.getByTestId("word").nth(8).click();
  await page.getByTestId("word").nth(12).click();
  await page.getByTestId("action-sub").click();
  const depths = await page.getByTestId("outline-row").evaluateAll((rows) =>
    rows.map((row) => row.getAttribute("data-depth")),
  );
  if (!depths.includes("0") || !depths.includes("1")) {
    throw new Error(`Expected depth 0 and 1 rows, got ${JSON.stringify(depths)}`);
  }
  await page.getByTestId("action-summary").click();
  await page.getByTestId("summary-field").fill("Shepherd care");
  await page.getByTestId("summary-save").click();
  const summaries = await page.locator(".summary-input").allInputValues();
  if (!summaries.some((value) => value.includes("Shepherd care"))) {
    throw new Error(`Summary did not persist in outline, got ${JSON.stringify(summaries)}`);
  }
  const after = await snapshot(page, path.join(evidenceRoot, "bullet-sub-summary"), "outline", {
    depths,
    summaries,
  });
  return { depths, summaries, after };
}

async function driveViewModes(page) {
  await driveImportSample(page);
  const editor = page.getByTestId("editor");
  await page.getByTestId("view-text").click();
  if ((await editor.getAttribute("data-view")) !== "text") {
    throw new Error("Text view did not apply");
  }
  const textShot = await snapshot(page, path.join(evidenceRoot, "view-modes"), "text", {
    view: "text",
  });
  await page.getByTestId("view-outline").click();
  if ((await editor.getAttribute("data-view")) !== "outline") {
    throw new Error("Outline view did not apply");
  }
  const outlineShot = await snapshot(page, path.join(evidenceRoot, "view-modes"), "outline", {
    view: "outline",
  });
  await page.getByTestId("view-split").click();
  if ((await editor.getAttribute("data-view")) !== "split") {
    throw new Error("Split view did not apply");
  }
  const splitShot = await snapshot(page, path.join(evidenceRoot, "view-modes"), "split", {
    view: "split",
  });
  return { textShot, outlineShot, splitShot };
}

async function drivePersistence(page) {
  await driveImportSample(page);
  await page.getByTestId("word").nth(1).click();
  await page.getByTestId("action-bullet").click();
  await page.getByTestId("outline-row").first().waitFor();
  const stored = await page.evaluate(() => localStorage.getItem("scripture-outliner.document.v1"));
  if (!stored) {
    throw new Error("localStorage key scripture-outliner.document.v1 was empty after Bullet");
  }
  await page.reload({ waitUntil: "networkidle" });
  await page.getByTestId("passage").waitFor({ state: "visible" });
  const title = await page.getByTestId("title-input").inputValue();
  const rows = await page.getByTestId("outline-row").count();
  if (!title.includes("Sample") || rows < 1) {
    throw new Error(`Reload lost document (title=${title} rows=${rows})`);
  }
  const after = await snapshot(page, path.join(evidenceRoot, "persistence"), "reload", {
    title,
    rows,
  });
  return { title, rows, after };
}

const drivers = {
  "import-sample": driveImportSample,
  "word-selection": driveWordSelection,
  "bullet-sub-summary": driveBulletSubSummary,
  "view-modes": driveViewModes,
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
