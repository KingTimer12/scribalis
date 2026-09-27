import { Node } from "@tiptap/core";

export interface BookImageOptions {
  /** Turns a book-relative `src` into a displayable URL. */
  resolve: (src: string) => string | null;
}

/** Image stored in the book's `imagens/` folder. */
export const BookImageNode = Node.create<BookImageOptions>({
  name: "image",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { resolve: () => null };
  },

  addAttributes() {
    return { src: { default: "" } };
  },

  parseHTML() {
    return [{ tag: "img[data-book-src]", getAttrs: (el) => ({ src: (el as HTMLElement).dataset.bookSrc }) }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", { "data-book-src": HTMLAttributes.src }];
  },

  addNodeView() {
    const resolve = this.options.resolve;
    return ({ node }) => {
      const dom = document.createElement("figure");
      dom.className = "ed-img";
      dom.contentEditable = "false";
      const img = document.createElement("img");
      img.alt = "";
      img.src = resolve(node.attrs.src) ?? "";
      dom.append(img);
      return { dom, ignoreMutation: () => true };
    };
  },
});
