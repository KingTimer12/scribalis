import { getCurrentWebview } from "@tauri-apps/api/webview";
import { isTauri } from "../api/invoke";

function cssZoom(factor: number) {
  document.documentElement.style.zoom = factor === 1 ? "" : String(factor);
}

/**
 * Scales the whole interface: the webview's own zoom in the app (pointer
 * coordinates stay consistent), CSS `zoom` on the root in the browser build.
 */
export function applyUiZoom(factor: number) {
  if (!isTauri) return cssZoom(factor);
  getCurrentWebview()
    .setZoom(factor)
    .catch(() => cssZoom(factor));
}
