import type { DocJSON } from "../api/types";

export const EMPTY_DOC: DocJSON = { type: "doc", content: [] };

/** Plain text of a document: paragraphs joined by blank lines. */
export function docText(doc: DocJSON): string {
  return doc.content
    .map((b) =>
      b.type === "paragraph" ? (b.content ?? []).map((i) => (i.type === "text" ? i.text : "\n")).join("") : null,
    )
    .filter((s): s is string => s !== null)
    .join("\n\n");
}

export function docWords(doc: DocJSON): number {
  const m = docText(doc).match(/\S+/g);
  return m ? m.length : 0;
}
