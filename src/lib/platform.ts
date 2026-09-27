/** macOS keeps native window buttons (traffic lights) drawn over the top bar. */
export const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);
