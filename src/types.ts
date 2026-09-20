/** Index into `Passage.words`. */
export type WordId = number;

export type Word = {
  id: WordId;
  text: string;
};

export type Passage = {
  id: string;
  title: string;
  rawText: string;
  words: Word[];
};

export type Selection = {
  start: WordId;
  end: WordId;
} | null;

/**
 * Inclusive word range in the passage.
 * `depth` is 0 for a section, 1 for a subsection, 2 for a subsubsection, and so on.
 */
export type Segment = {
  id: string;
  start: WordId;
  end: WordId;
  depth: number;
  summary: string;
};

export type Document = {
  passage: Passage;
  segments: Segment[];
  selection: Selection;
};

export type PinEdge = "start" | "end";

export function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}
