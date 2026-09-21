import {
  MAX_DEPTH,
  normalizeForest,
} from "./segments";
import type { Document, Passage, Segment, Selection, Word } from "./types";

const STORAGE_KEY = "scripture-outliner.document.v1";
const PREFS_KEY = "scripture-outliner.prefs.v1";

export type Prefs = {
  showText: boolean;
};

const DEFAULT_PREFS: Prefs = { showText: true };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDepth(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }
  if (value < 0 || value > MAX_DEPTH) {
    return null;
  }
  return value;
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
  return {
    passage,
    segments: normalizeForest(segments),
    selection: parseSelection(raw.selection, passage.words.length),
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

export function parsePrefs(raw: unknown): Prefs {
  if (!isRecord(raw) || typeof raw.showText !== "boolean") {
    return DEFAULT_PREFS;
  }
  return { showText: raw.showText };
}

export function loadPrefs(): Prefs {
  try {
    const stored = localStorage.getItem(PREFS_KEY);
    if (!stored) {
      return DEFAULT_PREFS;
    }
    return parsePrefs(JSON.parse(stored) as unknown);
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: Prefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}
