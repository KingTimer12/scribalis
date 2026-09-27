// Sets the app version everywhere it is declared: `bun run bump 0.2.0`.
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Uso: bun run bump <major.minor.patch>");
  process.exit(1);
}

function edit(path, pattern, replacement) {
  const text = readFileSync(path, "utf8");
  const next = text.replace(pattern, replacement);
  if (next === text) throw new Error(`version not found in ${path}`);
  writeFileSync(path, next);
}

edit("package.json", /"version": "[^"]+"/, `"version": "${version}"`);
edit("src-tauri/tauri.conf.json", /"version": "[^"]+"/, `"version": "${version}"`);
// Only the [package] entry: the first `version = ` line of the manifest.
edit("src-tauri/Cargo.toml", /^version = "[^"]+"/m, `version = "${version}"`);
console.log(`v${version}: commit, then \`git tag -a v${version} -m v${version} && git push --follow-tags\``);
