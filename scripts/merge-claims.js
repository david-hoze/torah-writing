#!/usr/bin/env node
// Merge all extracted claims into a single JSON file.
// Walks both output/likutei-halachot/ and output/claims/ directories.
//
// Usage: node scripts/merge-claims.js [--output path]

const fs = require("fs");
const path = require("path");

const INPUT_DIRS = [
  path.resolve(__dirname, "../output/likutei-halachot"),
  path.resolve(__dirname, "../output/claims"),
];

const args = process.argv.slice(2);
const outIdx = args.indexOf("--output");
const OUTPUT = outIdx !== -1
  ? path.resolve(args[outIdx + 1])
  : path.resolve(__dirname, "../output/all-claims.json");

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.name.endsWith(".json")) files.push(full);
  }
  return files;
}

const allClaims = [];
let totalFiles = 0;
let errors = 0;

for (const dir of INPUT_DIRS) {
  const files = walk(dir).sort();
  totalFiles += files.length;
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(f, "utf-8"));
    if (data.error && data.claims.length === 0) {
      errors++;
      continue;
    }
    for (const claim of data.claims) {
      allClaims.push({
        source: data.source,
        book: data.book || "ליקוטי הלכות",
        ...claim,
      });
    }
  }
}

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(allClaims, null, 2), "utf-8");

console.log(`Merged ${totalFiles} files → ${allClaims.length} claims (${errors} errors)`);
console.log(`Output: ${OUTPUT}`);
