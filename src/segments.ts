import type { Document, Segment, Selection, WordId } from "./types";

/** Deepest outline level the UI and storage accept (0 = section). */
export const MAX_DEPTH = 6;

export type PassagePart =
  | { kind: "header"; segment: Segment }
  | { kind: "words"; start: WordId; end: WordId; depth: number };

export type OutlineNode = {
  segment: Segment;
  children: OutlineNode[];
};

export function clampDepth(depth: number): number {
  if (!Number.isInteger(depth) || depth < 0) {
    return 0;
  }
  return Math.min(MAX_DEPTH, depth);
}

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

export function rangesEqual(
  left: { start: WordId; end: WordId },
  right: { start: WordId; end: WordId },
): boolean {
  return left.start === right.start && left.end === right.end;
}

export function rangesDisjoint(
  left: { start: WordId; end: WordId },
  right: { start: WordId; end: WordId },
): boolean {
  return left.end < right.start || right.end < left.start;
}

/** True when `inner` sits strictly inside `outer` (equal ranges are not nested). */
export function strictlyContains(
  outer: { start: WordId; end: WordId },
  inner: { start: WordId; end: WordId },
): boolean {
  return (
    outer.start <= inner.start &&
    inner.end <= outer.end &&
    (outer.start < inner.start || inner.end < outer.end)
  );
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

/** Prefer the innermost (deepest) covering segment. */
export function innermostCoveringSegment(
  segments: readonly Segment[],
  wordId: WordId,
): Segment | undefined {
  const covering = segmentsCoveringWord(segments, wordId);
  if (covering.length === 0) {
    return undefined;
  }
  covering.sort(
    (a, b) => b.depth - a.depth || b.start - a.start || a.end - b.end,
  );
  return covering[0];
}

export function containsSelection(
  segment: Segment,
  selection: NonNullable<Selection>,
): boolean {
  return segment.start <= selection.start && selection.end <= segment.end;
}

function remnant(
  existing: Segment,
  start: WordId,
  end: WordId,
): Segment | null {
  if (end < start) {
    return null;
  }
  return {
    ...existing,
    id: crypto.randomUUID(),
    start,
    end,
  };
}

/**
 * Insert `incoming` so the forest stays nested: ranges are disjoint siblings
 * or a deeper range sits strictly inside a shallower parent. Partial overlaps
 * clip the older range. Same-depth containers around the new range are split.
 */
export function insertSegment(
  segments: readonly Segment[],
  incoming: Segment,
): Segment[] {
  const clamped: Segment = {
    ...incoming,
    depth: clampDepth(incoming.depth),
  };
  const next: Segment[] = [];
  for (const existing of segments) {
    if (existing.id === clamped.id || rangesEqual(existing, clamped)) {
      continue;
    }
    if (rangesDisjoint(existing, clamped)) {
      next.push(existing);
      continue;
    }
    if (strictlyContains(clamped, existing)) {
      next.push(existing);
      continue;
    }
    if (strictlyContains(existing, clamped)) {
      if (existing.depth < clamped.depth) {
        next.push(existing);
        continue;
      }
      const left = remnant(existing, existing.start, clamped.start - 1);
      const right = remnant(existing, clamped.end + 1, existing.end);
      if (left) {
        next.push(left);
      }
      if (right) {
        next.push(right);
      }
      continue;
    }
    if (existing.start < clamped.start) {
      const left = remnant(existing, existing.start, clamped.start - 1);
      if (left) {
        next.push(left);
      }
    }
    if (existing.end > clamped.end) {
      const right = remnant(existing, clamped.end + 1, existing.end);
      if (right) {
        next.push(right);
      }
    }
  }
  next.push(clamped);
  return normalizeChildDepths(sortSegments(next));
}

function normalizeChildDepths(segments: readonly Segment[]): Segment[] {
  const ordered = sortSegments(segments);
  const depths = new Map(ordered.map((segment) => [segment.id, segment.depth]));
  for (let i = 0; i < ordered.length; i += 1) {
    const parent = ordered[i];
    if (!parent) {
      continue;
    }
    const parentDepth = depths.get(parent.id);
    if (parentDepth === undefined) {
      continue;
    }
    for (let j = i + 1; j < ordered.length; j += 1) {
      const child = ordered[j];
      if (!child) {
        continue;
      }
      if (child.start > parent.end) {
        break;
      }
      if (!strictlyContains(parent, child)) {
        continue;
      }
      const childDepth = depths.get(child.id);
      if (childDepth === undefined) {
        continue;
      }
      if (childDepth <= parentDepth) {
        depths.set(child.id, clampDepth(parentDepth + 1));
      }
    }
  }
  return ordered.map((segment) => {
    const depth = depths.get(segment.id);
    if (depth === undefined || depth === segment.depth) {
      return segment;
    }
    return { ...segment, depth };
  });
}

/** Re-insert every segment so stored documents satisfy nesting. */
export function normalizeForest(segments: readonly Segment[]): Segment[] {
  let next: Segment[] = [];
  for (const segment of sortSegments(segments)) {
    next = insertSegment(next, segment);
  }
  return next;
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
  patch: Partial<Pick<Segment, "summary">>,
): Segment[] {
  return segments.map((segment) =>
    segment.id === id ? { ...segment, ...patch } : segment,
  );
}

export function setSegmentDepth(
  segments: readonly Segment[],
  id: string,
  depth: number,
): Segment[] {
  const found = segments.find((segment) => segment.id === id);
  if (!found) {
    return [...segments];
  }
  return insertSegment(removeSegment(segments, id), {
    ...found,
    depth: clampDepth(depth),
  });
}

/** Parents before children when they share a start index. */
export function sortSegments(segments: readonly Segment[]): Segment[] {
  return [...segments].sort(
    (a, b) =>
      a.start - b.start || b.end - a.end || a.depth - b.depth || a.id.localeCompare(b.id),
  );
}

export function outlineForest(segments: readonly Segment[]): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const stack: OutlineNode[] = [];
  for (const segment of sortSegments(segments)) {
    const node: OutlineNode = { segment, children: [] };
    while (stack.length > 0) {
      const ancestor = stack[stack.length - 1];
      if (!ancestor || strictlyContains(ancestor.segment, segment)) {
        break;
      }
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (!parent) {
      roots.push(node);
    } else {
      parent.children.push(node);
    }
    stack.push(node);
  }
  return roots;
}

/**
 * Flatten the passage into headers and word runs. Word-run `depth` is the
 * containing segment's depth, or -1 when the words are not inside a section.
 */
export function passageParts(
  wordCount: number,
  segments: readonly Segment[],
): PassagePart[] {
  const parts: PassagePart[] = [];
  if (wordCount <= 0) {
    return parts;
  }

  function walk(
    nodes: readonly OutlineNode[],
    rangeStart: WordId,
    rangeEnd: WordId,
    depth: number,
  ): void {
    let cursor = rangeStart;
    for (const node of nodes) {
      if (cursor < node.segment.start) {
        parts.push({
          kind: "words",
          start: cursor,
          end: node.segment.start - 1,
          depth,
        });
      }
      parts.push({ kind: "header", segment: node.segment });
      walk(node.children, node.segment.start, node.segment.end, node.segment.depth);
      cursor = node.segment.end + 1;
    }
    if (cursor <= rangeEnd) {
      parts.push({ kind: "words", start: cursor, end: rangeEnd, depth });
    }
  }

  walk(outlineForest(segments), 0, wordCount - 1, -1);
  return parts;
}

export function highlightDepthForWord(
  segments: readonly Segment[],
  wordId: WordId,
): number | null {
  let deepest: number | null = null;
  for (const segment of segments) {
    if (wordId < segment.start || wordId > segment.end) {
      continue;
    }
    if (deepest === null || segment.depth > deepest) {
      deepest = segment.depth;
    }
  }
  return deepest;
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

export function headerLabel(
  words: readonly { text: string }[],
  segment: Segment,
): { text: string; placeholder: boolean } {
  const text = segment.summary.trim();
  if (text.length > 0) {
    return { text, placeholder: false };
  }
  return {
    text: snippet(words, segment.start, segment.end),
    placeholder: true,
  };
}

/** Depth for a new range: one step inside the innermost containing segment. */
export function suggestedDepth(
  segments: readonly Segment[],
  selection: NonNullable<Selection>,
): number {
  let parentDepth = -1;
  for (const segment of segments) {
    if (rangesEqual(segment, selection)) {
      continue;
    }
    if (!containsSelection(segment, selection)) {
      continue;
    }
    if (segment.depth > parentDepth) {
      parentDepth = segment.depth;
    }
  }
  return clampDepth(parentDepth + 1);
}

export function canDeepen(
  segments: readonly Segment[],
  segment: Segment,
): boolean {
  if (segment.depth >= MAX_DEPTH) {
    return false;
  }
  return segments.every(
    (other) =>
      !strictlyContains(segment, other) || other.depth < MAX_DEPTH,
  );
}

export function createSegment(
  selection: NonNullable<Selection>,
  depth: number,
  summary = "",
): Segment {
  return {
    id: crypto.randomUUID(),
    start: selection.start,
    end: selection.end,
    depth: clampDepth(depth),
    summary,
  };
}

export function createDocument(passage: Document["passage"]): Document {
  return {
    passage,
    segments: [],
    selection: null,
  };
}
