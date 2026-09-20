import { headerLabel, outlineForest, type OutlineNode } from "./segments";
import type { Document } from "./types";

function headingPrefix(depth: number): string {
  const hashes = Math.min(6, Math.max(2, depth + 2));
  return "#".repeat(hashes);
}

function emitNode(doc: Document, node: OutlineNode, lines: string[]): void {
  const label = headerLabel(doc.passage.words, node.segment);
  lines.push(`${headingPrefix(node.segment.depth)} ${label.text}`);
  for (const child of node.children) {
    emitNode(doc, child, lines);
  }
}

export function exportOutlineMarkdown(doc: Document): string {
  const title = doc.passage.title.trim() || "Untitled";
  const lines = [`# ${title}`, ""];
  if (doc.segments.length === 0) {
    lines.push("_No outline yet._", "");
    return lines.join("\n");
  }
  for (const node of outlineForest(doc.segments)) {
    emitNode(doc, node, lines);
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
