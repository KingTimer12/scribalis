/**
 * Where dropping card `dragId` before/after `targetId` lands it, as the index after taking
 * `dragId` out (what `board_move` expects). Null when either id is unknown or nothing moves.
 */
export function cardDropIndex(ids: string[], dragId: string, targetId: string, pos: "before" | "after"): number | null {
  const from = ids.indexOf(dragId);
  if (from < 0 || !ids.includes(targetId) || dragId === targetId) return null;
  const rest = ids.filter((id) => id !== dragId);
  const to = rest.indexOf(targetId) + (pos === "after" ? 1 : 0);
  return to === from ? null : to;
}
