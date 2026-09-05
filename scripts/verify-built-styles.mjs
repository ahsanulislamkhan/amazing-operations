import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

// Check the emitted CSS, not just source files: a successful compilation can
// still ship stale PostCSS output with the latest component styles missing.
async function cssFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? cssFiles(path) : entry.name.endsWith(".css") ? [path] : [];
  }));
  return files.flat();
}

const files = await cssFiles(".next/static");
assert.ok(files.length, "Production build must emit CSS assets.");
const css = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
const checks = {
  "custom dropdown layout": /\.task-filter-select__trigger[^{}]*\{[^}]*display:\s*flex/,
  "custom dropdown menu": /\.task-filter-select__menu[^{}]*\{[^}]*position:\s*absolute/,
  "invoice attachment layout": /\.order-attachment__file[^{}]*\{[^}]*display:\s*grid/,
  "invoice preview": /\.order-attachment__preview\s+iframe[^{}]*\{/,
  "task type choices": /\.task-type-picker--two[^{}]*\{/,
  "shared priority control": /\.priority-picker[^{}]*\{[^}]*display:\s*grid/,
};
for (const [name, pattern] of Object.entries(checks)) {
  assert.match(css, pattern, `Production CSS is missing ${name}.`);
}
console.log(`Verified ${Object.keys(checks).length} production stylesheet checks across ${files.length} assets.`);
