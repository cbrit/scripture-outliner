import type { Document, Segment, Selection, WordId } from "./types";

export function orderedSelection(a: WordId, b: WordId): NonNullable<Selection> {
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

export function selectionEquals(
  left: Selection,
  start: WordId,
  end: WordId,
): boolean {
  return left !== null && left.start === start && left.end === end;
}

export function exactSegment(
  segments: readonly Segment[],
  selection: NonNullable<Selection>,
): Segment | undefined {
  return segments.find(
    (segment) =>
      segment.start === selection.start && segment.end === selection.end,
  );
}

export function segmentsCoveringWord(
  segments: readonly Segment[],
  wordId: WordId,
): Segment[] {
  return segments.filter(
    (segment) => segment.start <= wordId && wordId <= segment.end,
  );
}

/** Prefer the newest covering segment (later in the list). */
export function newestCoveringSegment(
  segments: readonly Segment[],
  wordId: WordId,
): Segment | undefined {
  const covering = segmentsCoveringWord(segments, wordId);
  return covering[covering.length - 1];
}

export function containsSelection(
  segment: Segment,
  selection: NonNullable<Selection>,
): boolean {
  return segment.start <= selection.start && selection.end <= segment.end;
}

/**
 * Insert `incoming`, clipping or splitting older overlapping ranges
 * so the newest segment wins.
 */
export function insertSegment(
  segments: readonly Segment[],
  incoming: Segment,
): Segment[] {
  const next: Segment[] = [];
  for (const existing of segments) {
    if (existing.end < incoming.start || existing.start > incoming.end) {
      next.push(existing);
      continue;
    }
    if (existing.start < incoming.start) {
      next.push({
        ...existing,
        id: crypto.randomUUID(),
        end: incoming.start - 1,
      });
    }
    if (existing.end > incoming.end) {
      next.push({
        ...existing,
        id: crypto.randomUUID(),
        start: incoming.end + 1,
      });
    }
  }
  next.push(incoming);
  return sortSegments(next);
}

export function removeSegment(
  segments: readonly Segment[],
  id: string,
): Segment[] {
  return segments.filter((segment) => segment.id !== id);
}

export function updateSegment(
  segments: readonly Segment[],
  id: string,
  patch: Partial<Pick<Segment, "depth" | "summary">>,
): Segment[] {
  return segments.map((segment) =>
    segment.id === id ? { ...segment, ...patch } : segment,
  );
}

export function sortSegments(segments: readonly Segment[]): Segment[] {
  return [...segments].sort(
    (a, b) => a.start - b.start || a.end - b.end || a.depth - b.depth,
  );
}

export function highlightDepthForWord(
  segments: readonly Segment[],
  wordId: WordId,
): 0 | 1 | null {
  let depth0 = false;
  let depth1 = false;
  for (const segment of segments) {
    if (wordId < segment.start || wordId > segment.end) {
      continue;
    }
    if (segment.depth === 1) {
      depth1 = true;
    } else {
      depth0 = true;
    }
  }
  if (depth1) {
    return 1;
  }
  if (depth0) {
    return 0;
  }
  return null;
}

export function snippet(
  words: readonly { text: string }[],
  start: WordId,
  end: WordId,
  maxWords = 10,
): string {
  const slice = words.slice(start, end + 1).map((word) => word.text);
  if (slice.length <= maxWords) {
    return slice.join(" ");
  }
  return `${slice.slice(0, maxWords).join(" ")}…`;
}

export function suggestedSummaryDepth(
  segments: readonly Segment[],
  selection: NonNullable<Selection>,
): 0 | 1 {
  const parent = segments.find(
    (segment) => segment.depth === 0 && containsSelection(segment, selection),
  );
  return parent ? 1 : 0;
}

export function createSegment(
  selection: NonNullable<Selection>,
  depth: 0 | 1,
  summary = "",
): Segment {
  return {
    id: crypto.randomUUID(),
    start: selection.start,
    end: selection.end,
    depth,
    summary,
  };
}

export function createDocument(
  passage: Document["passage"],
  viewMode: Document["viewMode"] = "split",
): Document {
  return {
    passage,
    segments: [],
    selection: null,
    viewMode,
  };
}
