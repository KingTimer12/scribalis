import { convertFileSrc } from "@tauri-apps/api/core";
import { isTauri } from "../api/invoke";

/** URL for an absolute file path; `version` busts the cache when the file is replaced. */
export function fileAsset(abs: string | null, version: number): string | null {
  if (!abs || !isTauri) return null;
  return convertFileSrc(abs) + "?v=" + version;
}

/** URL for a path relative to the book folder. */
export function bookAsset(dir: string, rel: string | null, version: number): string | null {
  if (!rel) return null;
  const sep = dir.includes("\\") ? "\\" : "/";
  return fileAsset(dir + sep + rel.split("/").join(sep), version);
}
