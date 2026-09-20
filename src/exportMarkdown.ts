import { snippet } from "./segments";
import type { Document } from "./types";

export function exportOutlineMarkdown(doc: Document): string {
  const title = doc.passage.title.trim() || "Untitled";
  const lines = [`# ${title}`, ""];
  if (doc.segments.length === 0) {
    lines.push("_No outline yet._", "");
    return lines.join("\n");
  }
  for (const segment of doc.segments) {
    const indent = segment.depth === 0 ? "" : "  ";
    const summary = segment.summary.trim();
    const body =
      summary ||
      `_${snippet(doc.passage.words, segment.start, segment.end)}_`;
    lines.push(`${indent}- ${body}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function outlineFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "outline"}.md`;
}
