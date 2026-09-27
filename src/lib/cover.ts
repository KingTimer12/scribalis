/** Letra exibida na capa sem imagem. */
export function coverLetter(title: string | undefined) {
  const m = (title || "").trim().match(/[\p{L}\p{N}]/u);
  return m ? m[0].toLocaleUpperCase("pt-BR") : "+";
}

/** Tom da capa (0–5) derivado do id da obra. */
export function coverTone(seed: string | undefined) {
  let h = 0;
  const s = seed || "";
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 6;
}

const COVER_W = 400;
const COVER_H = 600;

/** Recorta a imagem para 400×600 (cover) e devolve um data URL JPEG. */
export function shrinkImage(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      const src = reader.result as string;
      const img = new Image();
      img.onerror = () => resolve(null);
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = COVER_W;
        c.height = COVER_H;
        const ctx = c.getContext("2d");
        if (!ctx) return resolve(src);
        const scale = Math.max(COVER_W / img.width, COVER_H / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (COVER_W - w) / 2, (COVER_H - h) / 2, w, h);
        try {
          resolve(c.toDataURL("image/jpeg", 0.85));
        } catch {
          resolve(src);
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}
