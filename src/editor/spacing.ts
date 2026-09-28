import { Extension } from "@tiptap/core";

export type SpacingAttrs = {
  lineHeight?: number | null;
  spaceBefore?: number | null;
  spaceAfter?: number | null;
  indent?: number | null;
};
export type SpacingKey = keyof SpacingAttrs;
export const SPACING_KEYS = ["lineHeight", "spaceBefore", "spaceAfter", "indent"] as const;

/** CSS property, style-object key and unit per attribute ("" = unitless). */
const CSS: Record<SpacingKey, { prop: string; key: string; unit: string }> = {
  lineHeight: { prop: "line-height", key: "lineHeight", unit: "" },
  spaceBefore: { prop: "margin-top", key: "marginTop", unit: "pt" },
  spaceAfter: { prop: "margin-bottom", key: "marginBottom", unit: "pt" },
  indent: { prop: "text-indent", key: "textIndent", unit: "cm" },
};

export function spacingStyle(key: SpacingKey, value: number | null | undefined): string | null {
  if (value == null) return null;
  const c = CSS[key];
  return `${c.prop}: ${value}${c.unit}`;
}

/** Parses a style value back, accepting only the unit we write. */
export function readSpacing(key: SpacingKey, style: { [k: string]: string } | CSSStyleDeclaration): number | null {
  const c = CSS[key];
  const raw = String((style as Record<string, string>)[c.key] ?? "").trim();
  const m = raw.match(/^(-?\d+(?:\.\d+)?)([a-z]*)$/);
  if (!m || m[2] !== c.unit) return null;
  return Number(m[1]);
}

/**
 * Marks a paragraph as carrying spacing we wrote, so pasted HTML from other apps
 * (e.g. Google Docs' `margin-top`/`line-height` on every `<p>`) is not mistaken for it.
 */
export const SPACING_MARKER_ATTR = "data-spacing";

/** HTML attributes for one spacing key: the style plus the marker, or nothing when unset. */
export function spacingRenderAttrs(key: SpacingKey, value: number | null | undefined): Record<string, string> {
  const style = spacingStyle(key, value);
  return style ? { style, [SPACING_MARKER_ATTR]: "" } : {};
}

/** Reads spacing back from an element only when it carries our own marker. */
export function readMarkedSpacing(
  key: SpacingKey,
  el: { hasAttribute(name: string): boolean; style: { [k: string]: string } | CSSStyleDeclaration },
): number | null {
  return el.hasAttribute(SPACING_MARKER_ATTR) ? readSpacing(key, el.style) : null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    paragraphSpacing: {
      /** Sets spacing on the paragraphs in the selection; null clears a value. */
      setSpacing: (attrs: SpacingAttrs) => ReturnType;
      /** Back to the app defaults: spacing and alignment. */
      clearParagraphFormat: () => ReturnType;
    };
  }
}

/** Line height, space before/after and first-line indent on paragraphs. */
export const ParagraphSpacing = Extension.create({
  name: "paragraphSpacing",

  addGlobalAttributes() {
    const attributes = Object.fromEntries(
      SPACING_KEYS.map((key) => [
        key,
        {
          default: null,
          parseHTML: (el: HTMLElement) => readMarkedSpacing(key, el),
          renderHTML: (attrs: Record<string, unknown>) => spacingRenderAttrs(key, attrs[key] as number | null),
        },
      ]),
    );
    return [{ types: ["paragraph"], attributes }];
  },

  addCommands() {
    return {
      setSpacing:
        (attrs) =>
        ({ commands }) =>
          commands.updateAttributes("paragraph", attrs),
      clearParagraphFormat:
        () =>
        ({ commands }) =>
          commands.resetAttributes("paragraph", [...SPACING_KEYS, "textAlign"]),
    };
  },
});
