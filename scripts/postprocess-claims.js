#!/usr/bin/env node
// postprocess-claims.js
// ניקוי טענות מחולצות — נרמול סוגים, ולידציה, ניקוי
// שימוש: node scripts/postprocess-claims.js [--book SLUG] [--dry-run]

const fs = require("fs");
const path = require("path");

const CLAIMS_DIR = path.resolve(__dirname, "../output/claims");
const LH_DIR = path.resolve(__dirname, "../output/claims/likutei-halachot");

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf("--" + name);
  if (i === -1) return fallback;
  if (typeof fallback === "boolean") return true;
  return args[i + 1];
}
const BOOK_FILTER = flag("book", "");
const DRY_RUN = flag("dry-run", false);

// --- סוגים תקינים ---
const VALID_TYPES = ["סיבתי", "שיוך", "עיקרון", "מבנה", "שורש", "היפך"];

function normalizeType(type) {
  if (!type) return "עיקרון";
  const first = type.split(/[|,\/]/)[0].trim();
  const match = VALID_TYPES.find(t => first.includes(t));
  return match || "עיקרון";
}

// --- ולידציה ---
function isValidClaim(claim) {
  if (!claim.claim || claim.claim.length < 5) return false;
  if (!claim.concepts || claim.concepts.length === 0) return false;
  if (claim.concepts.some(c => c.length > 50)) return false;
  return true;
}

// --- ניקוי ---
function cleanClaim(claim) {
  return {
    claim: claim.claim.trim().replace(/\.+$/, ""),
    type: normalizeType(claim.type),
    concepts: claim.concepts
      .map(c => c.trim())
      .filter(c => c.length > 0 && c.length <= 50),
  };
}

// --- עיבוד קובץ בודד ---
function processFile(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!data.claims || data.claims.length === 0) return null;
  if (data.error) return null;

  const original = data.claims.length;
  const cleaned = data.claims.map(cleanClaim).filter(isValidClaim);
  const removed = original - cleaned.length;
  const typesChanged = data.claims.filter((c, i) => {
    if (i >= cleaned.length) return false;
    return normalizeType(c.type) !== (c.type || "").trim();
  }).length;

  if (removed === 0 && typesChanged === 0) return null; // no changes needed

  if (!DRY_RUN) {
    data.claims = cleaned;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  }

  return { file: filePath, original, cleaned: cleaned.length, removed, typesChanged };
}

// --- סריקת תיקייה ---
function processDir(dir, label) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
  const results = [];
  for (const f of files) {
    const result = processFile(path.join(dir, f));
    if (result) results.push(result);
  }
  return results;
}

// --- ריצה ראשית ---
function main() {
  const allResults = [];
  let totalFiles = 0;
  let totalClaims = 0;
  let totalRemoved = 0;
  let totalTypesChanged = 0;

  // LH
  if (!BOOK_FILTER || BOOK_FILTER === "likutei-halachot") {
    console.log("Processing likutei-halachot...");
    const lhFiles = fs.existsSync(LH_DIR) ? fs.readdirSync(LH_DIR).filter(f => f.endsWith(".json")) : [];
    totalFiles += lhFiles.length;
    for (const f of lhFiles) {
      const data = JSON.parse(fs.readFileSync(path.join(LH_DIR, f), "utf8"));
      totalClaims += (data.claims || []).length;
      const result = processFile(path.join(LH_DIR, f));
      if (result) {
        allResults.push(result);
        totalRemoved += result.removed;
        totalTypesChanged += result.typesChanged;
      }
    }
    console.log(`  ${lhFiles.length} files scanned`);
  }

  // All other books
  if (fs.existsSync(CLAIMS_DIR)) {
    const books = fs.readdirSync(CLAIMS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const book of books) {
      if (BOOK_FILTER && !book.includes(BOOK_FILTER)) continue;
      const dir = path.join(CLAIMS_DIR, book);
      const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
      totalFiles += files.length;
      for (const f of files) {
        const data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        totalClaims += (data.claims || []).length;
        const result = processFile(path.join(dir, f));
        if (result) {
          allResults.push(result);
          totalRemoved += result.removed;
          totalTypesChanged += result.typesChanged;
        }
      }
    }
  }

  // סטטיסטיקות
  console.log(`\n=== Summary ===`);
  console.log(`Files scanned: ${totalFiles}`);
  console.log(`Total claims: ${totalClaims}`);
  console.log(`Files modified: ${allResults.length}`);
  console.log(`Claims removed: ${totalRemoved}`);
  console.log(`Types normalized: ${totalTypesChanged}`);

  if (allResults.length > 0) {
    console.log(`\nModified files:`);
    for (const r of allResults.slice(0, 20)) {
      const rel = path.relative(path.resolve(__dirname, ".."), r.file);
      console.log(`  ${rel}: ${r.original} → ${r.cleaned} (${r.removed} removed, ${r.typesChanged} types fixed)`);
    }
    if (allResults.length > 20) {
      console.log(`  ... and ${allResults.length - 20} more`);
    }
  }

  if (DRY_RUN) {
    console.log(`\nDry run — no files changed. Pass without --dry-run to apply.`);
  }
}

main();
