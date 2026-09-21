import type { Document, Segment, Selection, WordId } from "./types.ts";
import type { PassagePart } from "./segments.ts";
import {
  createSegment,
  exactSegment,
  insertSegment,
  segmentHasHeader,
  suggestedDepth,
  updateSegment,
} from "./segments.ts";

/**
 * Idle has no draft. Editing names the word range that owns the header slot.
 * Whether that range already has a Segment is derived with exactSegment at
 * overlay and commit time. Do not store new versus existing on the session
 * value. Deeper can insert a segment while the field is open.
 */
export type SummaryEdit =
  | { kind: "idle" }
  | {
      kind: "editing";
      start: WordId;
      end: WordId;
      draft: string;
    };

/**
 * passageParts output plus the transient editor node. Never persisted.
 * summary-editor does not carry draft. The textarea reads SummaryEdit.draft.
 */
export type PassageViewPart =
  | PassagePart
  | {
      kind: "summary-editor";
      start: WordId;
      end: WordId;
      depth: number;
    };

export function abortSummaryEdit(): SummaryEdit {
  return { kind: "idle" };
}

export function beginSummaryEdit(
  selection: NonNullable<Selection>,
  existing: Segment | undefined,
): SummaryEdit {
  return {
    kind: "editing",
    start: selection.start,
    end: selection.end,
    draft: existing?.summary ?? "",
  };
}

export function summaryEditChromeKey(edit: SummaryEdit): string {
  switch (edit.kind) {
    case "idle":
      return "idle";
    case "editing":
      return `editing:${edit.start}:${edit.end}`;
    default: {
      const _exhaustive: never = edit;
      return _exhaustive;
    }
  }
}

export function snapshotSummaryDraft(edit: SummaryEdit, raw: string): SummaryEdit {
  switch (edit.kind) {
    case "idle":
      return edit;
    case "editing":
      if (edit.draft === raw) {
        return edit;
      }
      return { ...edit, draft: raw };
    default: {
      const _exhaustive: never = edit;
      return _exhaustive;
    }
  }
}

export function applySummaryDraft(
  doc: Document,
  edit: SummaryEdit,
  raw: string,
): Document {
  switch (edit.kind) {
    case "idle":
      return doc;
    case "editing": {
      const range = { start: edit.start, end: edit.end };
      const existing = exactSegment(doc.segments, range);
      if (existing) {
        if (existing.summary === raw) {
          return doc;
        }
        return {
          ...doc,
          segments: updateSegment(doc.segments, existing.id, { summary: raw }),
        };
      }
      if (raw.trim() === "") {
        return doc;
      }
      const depth = suggestedDepth(doc.segments, range);
      return {
        ...doc,
        segments: insertSegment(doc.segments, createSegment(range, depth, raw)),
      };
    }
    default: {
      const _exhaustive: never = edit;
      return _exhaustive;
    }
  }
}

export function overlaySummaryEdit(
  parts: readonly PassagePart[],
  segments: readonly Segment[],
  edit: SummaryEdit,
): PassageViewPart[] {
  switch (edit.kind) {
    case "idle":
      return [...parts];
    case "editing": {
      const range = { start: edit.start, end: edit.end };
      const existing = exactSegment(segments, range);
      const depth = existing
        ? existing.depth
        : suggestedDepth(segments, range);
      const editor: PassageViewPart = {
        kind: "summary-editor",
        start: edit.start,
        end: edit.end,
        depth,
      };
      const replaceId =
        existing && segmentHasHeader(existing) ? existing.id : null;
      const out: PassageViewPart[] = [];
      let placed = false;
      for (const part of parts) {
        if (placed) {
          out.push(part);
          continue;
        }
        if (
          replaceId !== null &&
          part.kind === "header" &&
          part.segment.id === replaceId
        ) {
          out.push(editor);
          placed = true;
          continue;
        }
        if (
          replaceId === null &&
          part.kind === "words" &&
          part.start <= edit.start &&
          edit.start <= part.end
        ) {
          if (part.start < edit.start) {
            out.push({
              kind: "words",
              start: part.start,
              end: edit.start - 1,
              depth: part.depth,
            });
          }
          out.push(editor);
          placed = true;
          out.push({
            kind: "words",
            start: edit.start,
            end: part.end,
            depth: part.depth,
          });
          continue;
        }
        out.push(part);
      }
      if (!placed) {
        const insertAt = out.findIndex((part) => partStart(part) >= edit.start);
        if (insertAt === -1) {
          out.push(editor);
        } else {
          out.splice(insertAt, 0, editor);
        }
      }
      return out;
    }
    default: {
      const _exhaustive: never = edit;
      return _exhaustive;
    }
  }
}

function partStart(part: PassageViewPart): WordId {
  switch (part.kind) {
    case "header":
      return part.segment.start;
    case "words":
      return part.start;
    case "summary-editor":
      return part.start;
    default: {
      const _exhaustive: never = part;
      return _exhaustive;
    }
  }
}
