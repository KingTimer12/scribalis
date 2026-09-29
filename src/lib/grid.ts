/** Keys that move a selection inside a grid of cards laid out in reading order. */
export type GridKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End";

export const isGridKey = (key: string): key is GridKey =>
  key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown" || key === "Home" || key === "End";

/**
 * Index the selection moves to among `count` cards laid out `cols` per row. With nothing
 * selected (`index` -1) any key picks the first card; with no cards the answer is -1.
 * Down into a shorter last row lands on its last card.
 */
export function gridStep(index: number, count: number, cols: number, key: GridKey): number {
  if (count === 0) return -1;
  if (index < 0) return 0;
  const c = Math.max(1, cols);
  const last = count - 1;
  switch (key) {
    case "ArrowLeft":
      return Math.max(0, index - 1);
    case "ArrowRight":
      return Math.min(last, index + 1);
    case "ArrowUp":
      return index - c >= 0 ? index - c : index;
    case "ArrowDown":
      if (index + c <= last) return index + c;
      return Math.floor(index / c) < Math.floor(last / c) ? last : index;
    case "Home":
      return 0;
    case "End":
      return last;
  }
}
