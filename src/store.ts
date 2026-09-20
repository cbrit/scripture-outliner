import type { Document, Passage, Segment, Selection, ViewMode, Word } from "./types";

const STORAGE_KEY = "scripture-outliner.document.v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseViewMode(value: unknown): ViewMode | null {
  if (value === "text" || value === "outline" || value === "split") {
    return value;
  }
  return null;
}

function parseDepth(value: unknown): 0 | 1 | null {
  if (value === 0 || value === 1) {
    return value;
  }
  return null;
}

function parseWord(value: unknown, index: number): Word | null {
  if (!isRecord(value) || typeof value.text !== "string" || value.text.length === 0) {
    return null;
  }
  const word: Word = { id: index, text: value.text };
  return word;
}

function parsePassage(value: unknown): Passage | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string") {
    return null;
  }
  if (typeof value.rawText !== "string" || !Array.isArray(value.words)) {
    return null;
  }
  const words: Word[] = [];
  for (const [index, entry] of value.words.entries()) {
    const word = parseWord(entry, index);
    if (!word) {
      return null;
    }
    words.push(word);
  }
  if (words.length === 0) {
    return null;
  }
  return {
    id: value.id,
    title: value.title,
    rawText: value.rawText,
    words,
  };
}

function parseSelection(value: unknown, wordCount: number): Selection {
  if (value === null) {
    return null;
  }
  if (!isRecord(value)) {
    return null;
  }
  if (typeof value.start !== "number" || typeof value.end !== "number") {
    return null;
  }
  if (
    !Number.isInteger(value.start) ||
    !Number.isInteger(value.end) ||
    value.start < 0 ||
    value.end < value.start ||
    value.end >= wordCount
  ) {
    return null;
  }
  return { start: value.start, end: value.end };
}

function parseSegment(value: unknown, wordCount: number): Segment | null {
  if (!isRecord(value) || typeof value.id !== "string") {
    return null;
  }
  const depth = parseDepth(value.depth);
  if (depth === null || typeof value.summary !== "string") {
    return null;
  }
  if (typeof value.start !== "number" || typeof value.end !== "number") {
    return null;
  }
  if (
    !Number.isInteger(value.start) ||
    !Number.isInteger(value.end) ||
    value.start < 0 ||
    value.end < value.start ||
    value.end >= wordCount
  ) {
    return null;
  }
  return {
    id: value.id,
    start: value.start,
    end: value.end,
    depth,
    summary: value.summary,
  };
}

export function parseDocument(raw: unknown): Document | null {
  if (!isRecord(raw)) {
    return null;
  }
  const passage = parsePassage(raw.passage);
  if (!passage) {
    return null;
  }
  if (!Array.isArray(raw.segments)) {
    return null;
  }
  const segments: Segment[] = [];
  for (const entry of raw.segments) {
    const segment = parseSegment(entry, passage.words.length);
    if (!segment) {
      return null;
    }
    segments.push(segment);
  }
  const viewMode = parseViewMode(raw.viewMode) ?? "split";
  return {
    passage,
    segments,
    selection: parseSelection(raw.selection, passage.words.length),
    viewMode,
  };
}

export function loadDocument(): Document | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return null;
    }
    return parseDocument(JSON.parse(stored) as unknown);
  } catch {
    return null;
  }
}

export function saveDocument(doc: Document): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
}

export function clearDocument(): void {
  localStorage.removeItem(STORAGE_KEY);
}
