/** Letter shown on a cover without an image. */
export function coverLetter(title: string | undefined) {
  const m = (title || "").trim().match(/[\p{L}\p{N}]/u);
  return m ? m[0].toLocaleUpperCase("pt-BR") : "+";
}

/** Cover tone (0–5) derived from the book id. */
export function coverTone(seed: string | undefined) {
  let h = 0;
  const s = seed || "";
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 6;
}
