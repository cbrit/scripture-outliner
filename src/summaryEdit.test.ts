import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applySummaryDraft,
  overlaySummaryEdit,
  type SummaryEdit,
} from "./summaryEdit.ts";
import {
  createDocument,
  createSegment,
  insertSegment,
  passageParts,
  suggestedDepth,
} from "./segments.ts";
import { passageFromText } from "./tokenize.ts";
import type { Document, Segment } from "./types.ts";

const RANGE = { start: 0, end: 2 } as const;

function sampleDoc(segments: readonly Segment[] = []): Document {
  const passage = passageFromText("Sample", "Alpha beta gamma delta epsilon.");
  return { ...createDocument(passage), segments: [...segments] };
}

function editing(draft = ""): SummaryEdit {
  return { kind: "editing", start: RANGE.start, end: RANGE.end, draft };
}

test("empty new range leaves segments unchanged", () => {
  const doc = sampleDoc();
  const next = applySummaryDraft(doc, editing(), "");
  assert.equal(next, doc);
  assert.deepEqual(next.segments, []);
});

test("empty existing clears summary and keeps the segment", () => {
  const existing = createSegment(RANGE, 0, "Hello");
  const doc = sampleDoc(insertSegment([], existing));
  const next = applySummaryDraft(doc, editing("Hello"), "");
  assert.notEqual(next, doc);
  assert.equal(next.segments.length, 1);
  const kept = next.segments[0];
  assert.ok(kept);
  assert.equal(kept.id, existing.id);
  assert.equal(kept.start, 0);
  assert.equal(kept.end, 2);
  assert.equal(kept.depth, 0);
  assert.equal(kept.summary, "");
});

test("nonempty new inserts one segment at suggestedDepth", () => {
  const doc = sampleDoc();
  const next = applySummaryDraft(doc, editing(), "Shepherd");
  assert.notEqual(next, doc);
  assert.equal(next.segments.length, 1);
  const created = next.segments[0];
  assert.ok(created);
  assert.equal(created.start, 0);
  assert.equal(created.end, 2);
  assert.equal(created.summary, "Shepherd");
  assert.equal(created.depth, suggestedDepth([], RANGE));
});

test("overlay replaces a header part", () => {
  const segment = createSegment(RANGE, 0, "Hello");
  const segments = insertSegment([], segment);
  const doc = sampleDoc(segments);
  const parts = passageParts(doc.passage.words.length, segments);
  assert.equal(parts[0]?.kind, "header");
  const view = overlaySummaryEdit(parts, segments, editing("Hello"));
  assert.equal(view[0]?.kind, "summary-editor");
  if (view[0]?.kind !== "summary-editor") {
    return;
  }
  assert.equal(view[0].start, 0);
  assert.equal(view[0].end, 2);
  assert.equal(view[0].depth, 0);
  assert.equal(
    view.filter((part) => part.kind === "header").length,
    0,
  );
});

test("overlay injects editor before words when Deeper-only", () => {
  const segment = createSegment(RANGE, 0, "");
  const segments = insertSegment([], segment);
  const doc = sampleDoc(segments);
  const parts = passageParts(doc.passage.words.length, segments);
  assert.equal(
    parts.filter((part) => part.kind === "header").length,
    0,
  );
  assert.equal(parts[0]?.kind, "words");
  const view = overlaySummaryEdit(parts, segments, editing());
  assert.equal(view[0]?.kind, "summary-editor");
  if (view[0]?.kind !== "summary-editor") {
    return;
  }
  assert.equal(view[0].start, 0);
  assert.equal(view[0].end, 2);
  assert.equal(view[0].depth, 0);
  assert.equal(view[1]?.kind, "words");
  if (view[1]?.kind !== "words") {
    return;
  }
  assert.equal(view[1].start, 0);
});

test("overlay is idle-passthrough", () => {
  const segment = createSegment(RANGE, 0, "Hello");
  const segments = insertSegment([], segment);
  const doc = sampleDoc(segments);
  const parts = passageParts(doc.passage.words.length, segments);
  const view = overlaySummaryEdit(parts, segments, { kind: "idle" });
  assert.deepEqual(view, parts);
  assert.equal(
    view.filter((part) => part.kind === "summary-editor").length,
    0,
  );
});
