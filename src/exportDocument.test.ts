import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  exportBlocks,
  outlineFilename,
  renderDocx,
  renderMarkdown,
} from "./exportDocument.ts";
import {
  createDocument,
  createSegment,
  insertSegment,
} from "./segments.ts";
import { passageFromText } from "./tokenize.ts";
import type { Document } from "./types.ts";

function sampleDoc(): Document {
  const passage = passageFromText("Sample", "Alpha beta gamma.\n\nDelta epsilon.");
  const withEmpty = insertSegment([], createSegment({ start: 0, end: 2 }, 0, ""));
  const withHeader = insertSegment(
    withEmpty,
    createSegment({ start: 3, end: 4 }, 0, "Second half"),
  );
  return { ...createDocument(passage), segments: withHeader };
}

function emptySummaryOnlyDoc(): Document {
  const passage = passageFromText("Sample", "Alpha beta gamma.\n\nDelta epsilon.");
  return {
    ...createDocument(passage),
    segments: insertSegment([], createSegment({ start: 0, end: 2 }, 0, "")),
  };
}

function unzipDocumentXml(bytes: Uint8Array): string {
  const dir = mkdtempSync(join(tmpdir(), "so-docx-"));
  const file = join(dir, "out.docx");
  writeFileSync(file, bytes);
  execFileSync("unzip", ["-o", "-q", file, "-d", dir]);
  return readFileSync(join(dir, "word/document.xml"), "utf8");
}

test("full markdown includes title, real heading, and body", () => {
  assert.equal(
    renderMarkdown(exportBlocks(sampleDoc(), true)),
    `# Sample

Alpha beta gamma.

## Second half

Delta epsilon.
`,
  );
});

test("headers-only markdown omits body", () => {
  assert.equal(
    renderMarkdown(exportBlocks(sampleDoc(), false)),
    `# Sample

## Second half
`,
  );
});

test("empty-summary segment does not invent a snippet heading", () => {
  assert.equal(
    renderMarkdown(exportBlocks(emptySummaryOnlyDoc(), false)),
    `# Sample
`,
  );
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
  assert.ok(full.byteLength > 200);
  assert.ok(headers.byteLength > 200);

  const fullXml = unzipDocumentXml(full);
  const headersXml = unzipDocumentXml(headers);
  assert.match(fullXml, /Sample/);
  assert.match(fullXml, /Second half/);
  assert.match(fullXml, /Alpha beta gamma/);
  assert.match(headersXml, /Sample/);
  assert.match(headersXml, /Second half/);
  assert.doesNotMatch(headersXml, /Alpha beta gamma/);
  assert.doesNotMatch(headersXml, /Delta epsilon/);
});
