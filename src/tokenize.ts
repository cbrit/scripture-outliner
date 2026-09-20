import type { Passage, Word } from "./types";

export type BreakKind = "none" | "space" | "newline" | "par";

export type TokenizeResult = {
  words: Word[];
  breakBefore: BreakKind[];
};

/**
 * Split text on whitespace. Punctuation stays attached to words.
 * Tokens are plain words; numbers and labels are not special.
 */
export function tokenize(rawText: string): TokenizeResult {
  const words: Word[] = [];
  const breakBefore: BreakKind[] = [];
  const text = rawText.replace(/\r\n/g, "\n").trim();
  if (text.length === 0) {
    return { words, breakBefore };
  }

  let pending: BreakKind = "none";
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];
    if (ch === "\n") {
      if (text[i + 1] === "\n") {
        pending = mergeBreak(pending, "par");
        i += 2;
        while (i < n && (text[i] === "\n" || text[i] === " " || text[i] === "\t")) {
          i += 1;
        }
        continue;
      }
      pending = mergeBreak(pending, "newline");
      i += 1;
      continue;
    }
    if (ch === " " || ch === "\t") {
      pending = mergeBreak(pending, "space");
      i += 1;
      continue;
    }

    let j = i;
    while (j < n) {
      const next = text[j];
      if (next === " " || next === "\t" || next === "\n") {
        break;
      }
      j += 1;
    }
    const token = text.slice(i, j);
    words.push({ id: words.length, text: token });
    breakBefore.push(
      words.length === 1 ? "none" : pending === "none" ? "space" : pending,
    );
    pending = "none";
    i = j;
  }

  return { words, breakBefore };
}

function mergeBreak(current: BreakKind, incoming: BreakKind): BreakKind {
  if (current === "par") {
    return "par";
  }
  switch (incoming) {
    case "par":
      return "par";
    case "newline":
      return "newline";
    case "space":
      return current === "none" ? "space" : current;
    case "none":
      return current;
    default: {
      const _exhaustive: never = incoming;
      return _exhaustive;
    }
  }
}

export function passageFromText(title: string, rawText: string): Passage {
  const { words } = tokenize(rawText);
  return {
    id: crypto.randomUUID(),
    title,
    rawText,
    words,
  };
}

export function breaksForPassage(passage: Passage): BreakKind[] {
  const result = tokenize(passage.rawText);
  if (result.words.length === passage.words.length) {
    return result.breakBefore;
  }
  return passage.words.map((_, index) => (index === 0 ? "none" : "space"));
}
