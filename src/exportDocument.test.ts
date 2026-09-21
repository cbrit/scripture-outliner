import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { passageFromText } from "./tokenize.ts";
import {
  createDocument,
  createSegment,
  insertSegment,
} from "./segments.ts";
import {
  exportBlocks,
  exportOutlineMarkdown,
  outlineFilename,
  renderDocx,
} from "./exportDocument.ts";
import type { Document } from "./types.ts";

function sampleDoc(): Document {
  const passage = passageFromText("Sample", "Alpha beta gamma.\n\nDelta epsilon.");
  const withEmpty = insertSegment(
    [],
    createSegment({ start: 0, end: 2 }, 0, ""),
  );
  const withHeader = insertSegment(
    withEmpty,
    createSegment({ start: 3, end: 4 }, 0, "Second half"),
  );
  return { ...createDocument(passage), segments: withHeader };
}

test("full markdown includes title, real heading, and body", () => {
  const md = exportOutlineMarkdown(sampleDoc(), true);
  assert.equal(
    md,
    `# Sample

Alpha beta gamma.

## Second half

Delta epsilon.
`,
  );
});

test("headers-only markdown omits body and empty-summary headings", () => {
  const md = exportOutlineMarkdown(sampleDoc(), false);
  assert.equal(
    md,
    `# Sample

## Second half
`,
  );
});

test("empty-summary segments do not invent snippet headings", () => {
  const blocks = exportBlocks(sampleDoc(), false);
  const headings = blocks.filter((block) => block.kind === "heading");
  assert.deepEqual(headings, [{ kind: "heading", depth: 0, text: "Second half" }]);
});

test("outlineFilename slugs the title and extension", () => {
  assert.equal(outlineFilename("Sample Passage", "md"), "sample-passage.md");
  assert.equal(outlineFilename("Sample Passage", "docx"), "sample-passage.docx");
  assert.equal(outlineFilename("   ", "md"), "outline.md");
});

test("docx zip contains title, heading, and body; headers-only drops body", () => {
  const full = renderDocx(exportBlocks(sampleDoc(), true));
  const headers = renderDocx(exportBlocks(sampleDoc(), false));
  assert.equal(full[0], 0x50);
  assert.equal(full[1], 0x4b);
  assert.ok(full.length > 200);
  assert.ok(headers.length > 200);

  const dir = mkdtempSync(join(tmpdir(), "so-docx-"));
  const fullPath = join(dir, "full.docx");
  const headersPath = join(dir, "headers.docx");
  writeFileSync(fullPath, full);
  writeFileSync(headersPath, headers);
  execFileSync("unzip", ["-o", fullPath, "-d", join(dir, "full")]);
  execFileSync("unzip", ["-o", headersPath, "-d", join(dir, "headers")]);
  const fullXml = readFileSync(join(dir, "full/word/document.xml"), "utf8");
  const headersXml = readFileSync(join(dir, "headers/word/document.xml"), "utf8");
  assert.match(fullXml, /Sample/);
  assert.match(fullXml, /Second half/);
  assert.match(fullXml, /Alpha beta gamma/);
  assert.match(headersXml, /Second half/);
  assert.doesNotMatch(headersXml, /Alpha beta gamma/);
  assert.doesNotMatch(headersXml, /Delta epsilon/);
});
