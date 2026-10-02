/** Daily goal bounds, the same Rust clamps to. */
export const GOAL_MIN = 10;
export const GOAL_MAX = 100_000;

/**
 * Reads a typed daily goal: "1600", "1.600" (pt-BR thousands), "1.5k", "1,5k", "2 mil".
 * Returns null when the text is not a number or falls outside GOAL_MIN..GOAL_MAX.
 */
export function parseGoal(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, "");
  const m = s.match(/^(\d+(?:[.,]\d+)*)(k|mil)?$/);
  if (!m) return null;
  const [, num, unit] = m;
  let value: number;
  if (unit) {
    // With a unit the separator is a decimal point: "1.5k", "1,5k".
    const parts = num.split(/[.,]/);
    if (parts.length > 2) return null;
    value = Number(parts.join(".")) * 1000;
  } else if (/^\d{1,3}([.,]\d{3})+$/.test(num)) {
    // Groups of three after the separator: thousands, "1.600" or "1,600".
    value = Number(num.replace(/[.,]/g, ""));
  } else if (/^\d+$/.test(num)) {
    value = Number(num);
  } else {
    return null;
  }
  value = Math.round(value);
  return value >= GOAL_MIN && value <= GOAL_MAX ? value : null;
}
