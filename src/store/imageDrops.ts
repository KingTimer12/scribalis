import { getCurrentWebview } from "@tauri-apps/api/webview";
import { dropChapterImages } from "./actions/images";

/**
 * Tauri intercepts OS file drops before the page sees them and hands over
 * only paths, so the image bytes never pass through the webview.
 */
export function listenImageDrops(): Promise<() => void> {
  return getCurrentWebview().onDragDropEvent((event) => {
    if (event.payload.type !== "drop" || event.payload.paths.length === 0) return;
    // The position is physical pixels; the editor works in CSS pixels.
    const { x, y } = event.payload.position.toLogical(window.devicePixelRatio);
    void dropChapterImages(event.payload.paths, { x, y });
  });
}
