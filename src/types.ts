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

export type Segment = {
  id: string;
  start: WordId;
  end: WordId;
  depth: 0 | 1;
  summary: string;
};

export type ViewMode = "text" | "outline" | "split";

export type Document = {
  passage: Passage;
  segments: Segment[];
  selection: Selection;
  viewMode: ViewMode;
};

export type PinEdge = "start" | "end";

export function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}
