import { assertNever, type Document, type Word, type WordId } from "./types.ts";
import { passageParts } from "./segments.ts";
import { breaksForPassage, type BreakKind } from "./tokenize.ts";

export type ExportFormat = "md" | "docx";

export type ExportBlock =
  | { kind: "title"; text: string }
  | { kind: "heading"; depth: number; text: string }
  | { kind: "body"; text: string };

function rangeText(
  words: readonly Word[],
  breaks: readonly BreakKind[],
  start: WordId,
  end: WordId,
): string {
  let out = "";
  for (let id = start; id <= end; id += 1) {
    const word = words[id];
    if (!word) {
      continue;
    }
    if (id !== start) {
      const kind = breaks[id] ?? "space";
      switch (kind) {
        case "none":
          break;
        case "space":
          out += " ";
          break;
        case "newline":
          out += "\n";
          break;
        case "par":
          out += "\n\n";
          break;
        default: {
          const _exhaustive: never = kind;
          assertNever(_exhaustive);
        }
      }
    }
    out += word.text;
  }
  return out;
}

export function exportBlocks(doc: Document, includeBody: boolean): ExportBlock[] {
  const title = doc.passage.title.trim() || "Untitled";
  const blocks: ExportBlock[] = [{ kind: "title", text: title }];
  const breaks = breaksForPassage(doc.passage);
  const parts = passageParts(doc.passage.words.length, doc.segments);
  for (const part of parts) {
    switch (part.kind) {
      case "header": {
        const text = part.segment.summary.trim();
        if (text.length === 0) {
          break;
        }
        blocks.push({ kind: "heading", depth: part.segment.depth, text });
        break;
      }
      case "words": {
        if (!includeBody) {
          break;
        }
        const text = rangeText(doc.passage.words, breaks, part.start, part.end);
        if (text.length > 0) {
          blocks.push({ kind: "body", text });
        }
        break;
      }
      default: {
        const _exhaustive: never = part;
        assertNever(_exhaustive);
      }
    }
  }
  return blocks;
}

function headingPrefix(depth: number): string {
  return "#".repeat(Math.min(6, Math.max(2, depth + 2)));
}

export function renderMarkdown(blocks: readonly ExportBlock[]): string {
  const lines: string[] = [];
  for (const block of blocks) {
    switch (block.kind) {
      case "title":
        lines.push(`# ${block.text}`, "");
        break;
      case "heading":
        lines.push(`${headingPrefix(block.depth)} ${block.text}`, "");
        break;
      case "body":
        lines.push(block.text, "");
        break;
      default: {
        const _exhaustive: never = block;
        assertNever(_exhaustive);
      }
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function outlineFilename(title: string, ext: ExportFormat): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "outline";
  switch (ext) {
    case "md":
      return `${slug}.md`;
    case "docx":
      return `${slug}.docx`;
    default: {
      const _exhaustive: never = ext;
      return assertNever(_exhaustive);
    }
  }
}

function xmlEscape(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function headingStyle(depth: number): string {
  return `Heading${Math.min(5, Math.max(1, depth + 1))}`;
}

function wText(text: string): string {
  const parts = text.split("\n");
  return parts
    .map((line, index) => {
      const t = `<w:t xml:space="preserve">${xmlEscape(line)}</w:t>`;
      if (index === 0) {
        return t;
      }
      return `<w:br/>${t}`;
    })
    .join("");
}

function wPara(text: string, style: string | null): string {
  const pStyle = style ? `<w:pStyle w:val="${style}"/>` : "";
  return `<w:p><w:pPr>${pStyle}</w:pPr><w:r>${wText(text)}</w:r></w:p>`;
}

function documentXml(blocks: readonly ExportBlock[]): string {
  const paras: string[] = [];
  for (const block of blocks) {
    switch (block.kind) {
      case "title":
        paras.push(wPara(block.text, "Title"));
        break;
      case "heading":
        paras.push(wPara(block.text, headingStyle(block.depth)));
        break;
      case "body": {
        const chunks = block.text.split(/\n\n+/);
        for (const chunk of chunks) {
          if (chunk.length > 0) {
            paras.push(wPara(chunk, null));
          }
        }
        break;
      }
      default: {
        const _exhaustive: never = block;
        assertNever(_exhaustive);
      }
    }
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paras.join("")}
  </w:body>
</w:document>
`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>
`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>
`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal" w:default="1">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:b/><w:sz w:val="52"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:b/><w:sz w:val="32"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:b/><w:sz w:val="28"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:b/><w:sz w:val="26"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading4">
    <w:name w:val="heading 4"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:b/><w:sz w:val="24"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading5">
    <w:name w:val="heading 5"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:b/><w:sz w:val="22"/></w:rPr>
  </w:style>
</w:styles>
`;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    const byte = data[i] ?? 0;
    const row = CRC_TABLE[(crc ^ byte) & 0xff] ?? 0;
    crc = (row ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(n: number): Uint8Array {
  const out = new Uint8Array(2);
  out[0] = n & 0xff;
  out[1] = (n >>> 8) & 0xff;
  return out;
}

function u32(n: number): Uint8Array {
  const out = new Uint8Array(4);
  out[0] = n & 0xff;
  out[1] = (n >>> 8) & 0xff;
  out[2] = (n >>> 16) & 0xff;
  out[3] = (n >>> 24) & 0xff;
  return out;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  let len = 0;
  for (const part of parts) {
    len += part.length;
  }
  const out = new Uint8Array(len);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

type ZipFile = { name: string; data: Uint8Array };

function dosDateTime(date: Date): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, date.getFullYear());
  const dosTime =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function zipStore(files: readonly ZipFile[]): Uint8Array {
  const { dosTime, dosDate } = dosDateTime(new Date());
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = utf8(file.name);
    const data = file.data;
    const crc = crc32(data);
    const local = concatBytes([
      utf8("PK\u0003\u0004"),
      u16(20),
      u16(0),
      u16(0),
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      data,
    ]);
    const central = concatBytes([
      utf8("PK\u0001\u0002"),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralDir = concatBytes(centrals);
  const eocd = concatBytes([
    utf8("PK\u0005\u0006"),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);
  return concatBytes([...locals, centralDir, eocd]);
}

export function renderDocx(blocks: readonly ExportBlock[]): Uint8Array {
  return zipStore([
    { name: "[Content_Types].xml", data: utf8(CONTENT_TYPES) },
    { name: "_rels/.rels", data: utf8(ROOT_RELS) },
    { name: "word/document.xml", data: utf8(documentXml(blocks)) },
    { name: "word/_rels/document.xml.rels", data: utf8(DOC_RELS) },
    { name: "word/styles.xml", data: utf8(STYLES_XML) },
  ]);
}

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
