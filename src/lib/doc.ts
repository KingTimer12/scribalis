import type { DocJSON, InlineJSON } from "../api/types";

export const EMPTY_DOC: DocJSON = { type: "doc", content: [] };

/** One inline run as plain text, like Rust's `Inline::plain`: links read as their label. */
function inlineText(i: InlineJSON): string {
  if (i.type === "text") return i.text;
  if (i.type === "hardBreak") return "\n";
  return i.attrs.label;
}

/** Plain text of a document: paragraphs joined by blank lines. */
export function docText(doc: DocJSON): string {
  return doc.content
    .map((b) => (b.type === "paragraph" ? (b.content ?? []).map(inlineText).join("") : null))
    .filter((s): s is string => s !== null)
    .join("\n\n");
}

export function docWords(doc: DocJSON): number {
  const m = docText(doc).match(/\S+/g);
  return m ? m.length : 0;
}
