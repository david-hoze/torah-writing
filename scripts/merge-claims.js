#!/usr/bin/env node
// Merge extracted claim files per book into one JSON per book.
// Each book directory in output/claims/ gets a merged <book-slug>.json in output/merged/
//
// Usage: node scripts/merge-claims.js [--book SLUG]

const fs = require("fs");
const path = require("path");

const CLAIMS_DIR = path.resolve(__dirname, "../output/claims");
const OUTPUT_DIR = path.resolve(__dirname, "../output/merged");

const args = process.argv.slice(2);
const bookIdx = args.indexOf("--book");
const BOOK_FILTER = bookIdx !== -1 ? args[bookIdx + 1] : "";

function mergeBook(bookDir, slug) {
  const files = fs.readdirSync(bookDir)
    .filter(f => f.endsWith(".json"))
    .sort();

  const claims = [];
  let errors = 0;

  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(bookDir, f), "utf-8"));
    if (data.error && data.claims.length === 0) {
      errors++;
      continue;
    }
    for (const claim of data.claims) {
      claims.push({
        source: data.source,
        ...claim,
      });
    }
  }

  const outPath = path.join(OUTPUT_DIR, slug + ".json");
  fs.writeFileSync(outPath, JSON.stringify(claims, null, 2), "utf-8");
  return { slug, files: files.length, claims: claims.length, errors };
}

// Main
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const books = fs.readdirSync(CLAIMS_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .filter(d => !BOOK_FILTER || d.includes(BOOK_FILTER))
  .sort();

let totalFiles = 0;
let totalClaims = 0;
let totalErrors = 0;

for (const slug of books) {
  const result = mergeBook(path.join(CLAIMS_DIR, slug), slug);
  totalFiles += result.files;
  totalClaims += result.claims;
  totalErrors += result.errors;
  console.log(`  ${result.slug}: ${result.files} files → ${result.claims} claims${result.errors ? ` (${result.errors} errors)` : ""}`);
}

console.log(`\n=== Summary ===`);
console.log(`Books: ${books.length}`);
console.log(`Files: ${totalFiles}`);
console.log(`Claims: ${totalClaims}`);
console.log(`Errors skipped: ${totalErrors}`);
console.log(`Output: ${OUTPUT_DIR}/`);
