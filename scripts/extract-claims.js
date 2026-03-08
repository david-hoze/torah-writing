#!/usr/bin/env node
// Extract spiritual claims from books in books/ using an agent CLI.
// Auto-detects each book's deepest heading level and splits sections there.
// Likutei Halachot gets special handling (5-level heading structure, dedicated prompt).
//
// Usage:
//   node scripts/extract-claims.js [options]
//   node scripts/extract-claims.js --book "ליקוטי מוהרן"   # single book
//   node scripts/extract-claims.js --book "ליקוטי הלכות"   # LH with custom parser
//   node scripts/extract-claims.js --list                   # list all books
//
// Options:
//   --concurrency N      Parallel agent calls (default: 5)
//   --resume             Skip sections that already have output
//   --dry-run            Preview sections without running agent
//   --model NAME         Model to use
//   --book PATTERN       Only process books matching this substring
//   --list               List all discovered books and exit
//   --min-chars N        Skip sections shorter than N chars (default: 100)
//   --max-batch-chars N  Max total chars per batch (default: 12000)
//   --start N            Start at section N (LH only)
//   --end N              End at section N (LH only)

const fs = require("fs");
const path = require("path");
const { createPool, runAgent, extractJSON, extractJSONArray, isRateLimitError, QuotaExhaustedError } = require("./lib/agent-pool");
const { getSlug } = require("./book-slugs");

// ── Config ──────────────────────────────────────────────────────────────────
const BOOKS_DIR = path.resolve(__dirname, "../books");
const OUTPUT_BASE = path.resolve(__dirname, "../output/claims");
const AGENT_BIN = process.env.AGENT_PATH || "gemini";

const PROMPT_LH = path.resolve(__dirname, "prompts/lh-extract.txt");
const PROMPT_GENERIC = path.resolve(__dirname, "prompts/generic-extract.txt");

const LH_FILENAME = "likutei-halachot.md";
const LH_OUTPUT_DIR = path.resolve(__dirname, "../output/claims/likutei-halachot");

// ── CLI flags ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf("--" + name);
  if (i === -1) return fallback;
  if (typeof fallback === "boolean") return true;
  return args[i + 1];
}
const CONCURRENCY = Number(flag("concurrency", "5"));
const RESUME = flag("resume", false);
const DRY_RUN = flag("dry-run", false);
const MODEL = flag("model", "");
const BOOK_FILTER = flag("book", "");
const LIST_ONLY = flag("list", false);
const MIN_CHARS = Number(flag("min-chars", "100"));
const MAX_BATCH_CHARS = Number(flag("max-batch-chars", "12000"));
const START = Number(flag("start", "0"));
const END = Number(flag("end", "Infinity"));

// ── Discover all .md books ──────────────────────────────────────────────────
function findBooks(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findBooks(full));
    } else if (entry.name.endsWith(".md")) {
      results.push(full);
    }
  }
  return results;
}

// ── Detect deepest heading level ────────────────────────────────────────────
function detectDeepestHeading(md) {
  let deepest = 0;
  const counts = {};
  for (const line of md.split("\n")) {
    const m = line.match(/^(#{2,6})\s/);
    if (m) {
      const level = m[1].length;
      counts[level] = (counts[level] || 0) + 1;
      if (level > deepest) deepest = level;
    }
  }
  if (deepest > 2 && (counts[deepest] || 0) < 3 && counts[deepest - 1]) {
    deepest = deepest - 1;
  }
  return deepest;
}

// ── Max chars per section before chunking ───────────────────────────────────
const MAX_SECTION_CHARS = 15000;

function chunkBody(body, maxChars) {
  if (body.length <= maxChars) return [body];
  const paragraphs = body.split(/\n{2,}/);
  const chunks = [];
  let current = "";
  for (const para of paragraphs) {
    if (current.length + para.length + 2 > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = "";
    }
    current += (current ? "\n\n" : "") + para;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// ── LH-specific parser (5-level headings) ───────────────────────────────────
function parseLHSections(md) {
  const lines = md.split("\n");
  const sections = [];
  let currentH2 = "", currentH3 = "", currentH4 = "", currentH5 = "";
  let bodyLines = [];
  let lineNum = 0;

  function flush() {
    if (!currentH5) return;
    const body = bodyLines.join("\n").trim();
    if (body.length > 0) {
      sections.push({
        h2: currentH2, h3: currentH3, h4: currentH4, h5: currentH5,
        body, line: lineNum,
      });
    }
    bodyLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## ") && !line.startsWith("### ")) {
      flush();
      currentH2 = line.replace(/^## /, "").trim();
      currentH3 = ""; currentH4 = ""; currentH5 = "";
    } else if (line.startsWith("### ") && !line.startsWith("#### ")) {
      flush();
      currentH3 = line.replace(/^### /, "").trim();
      currentH4 = ""; currentH5 = "";
    } else if (line.startsWith("#### ") && !line.startsWith("##### ")) {
      flush();
      currentH4 = line.replace(/^#### /, "").trim();
      currentH5 = "";
    } else if (line.startsWith("##### ")) {
      flush();
      currentH5 = line.replace(/^##### /, "").trim();
      lineNum = i + 1;
    } else {
      bodyLines.push(line);
    }
  }
  flush();
  return sections;
}

// ── Generic parser ──────────────────────────────────────────────────────────
function parseGenericSections(md, splitLevel, bookName) {
  const lines = md.split("\n");

  if (splitLevel === 0) {
    const bodyStart = lines.findIndex((l, i) => i > 0 && l.trim().length > 0 && !l.startsWith("# "));
    const body = lines.slice(bodyStart >= 0 ? bodyStart : 1).join("\n").trim();
    if (body.length < MIN_CHARS) return [];
    const chunks = chunkBody(body, MAX_SECTION_CHARS);
    return chunks.map((chunk, i) => ({
      book: bookName, context: {},
      heading: chunks.length === 1 ? bookName : `${bookName} - חלק ${i + 1}`,
      body: chunk, line: 0,
    }));
  }

  const sections = [];
  const context = {};
  let currentHeading = "";
  let bodyLines = [];
  let lineNum = 0;

  function flush() {
    if (!currentHeading) return;
    const body = bodyLines.join("\n").trim();
    if (body.length >= MIN_CHARS) {
      const chunks = chunkBody(body, MAX_SECTION_CHARS);
      for (let c = 0; c < chunks.length; c++) {
        sections.push({
          book: bookName, context: { ...context },
          heading: chunks.length === 1 ? currentHeading : `${currentHeading} [${c + 1}/${chunks.length}]`,
          body: chunks[c], line: lineNum,
        });
      }
    }
    bodyLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^(#{2,6})\s+(.*)/);
    if (m) {
      const level = m[1].length;
      const text = m[2].trim();
      if (level === splitLevel) {
        flush();
        currentHeading = text;
        lineNum = i + 1;
      } else if (level < splitLevel) {
        flush();
        context[level] = text;
        for (let l = level + 1; l <= 6; l++) delete context[l];
        currentHeading = "";
      } else {
        bodyLines.push(line);
      }
    } else {
      bodyLines.push(line);
    }
  }
  flush();
  return sections;
}

// ── Source strings ───────────────────────────────────────────────────────────
function lhSource(section) {
  return `ליקוטי הלכות, ${section.h3}, ${section.h4}, ${section.h5}`;
}

function genericSource(section) {
  const parts = [section.book];
  for (let l = 2; l <= 6; l++) {
    if (section.context[l]) parts.push(section.context[l]);
  }
  parts.push(section.heading);
  return parts.join(", ");
}

// ── Prompt builders ─────────────────────────────────────────────────────────
function buildPrompt(systemPrompt, section, sourceFn) {
  return systemPrompt + "\n\n---\n\n" + `## מקור: ${sourceFn(section)}\n\n` + section.body;
}

function buildBatchPrompt(systemPrompt, sections, sourceFn) {
  let prompt = systemPrompt + "\n\n---\n\n";
  for (let i = 0; i < sections.length; i++) {
    prompt += `## קטע ${i + 1} — מקור: ${sourceFn(sections[i])}\n\n`;
    prompt += sections[i].body + "\n\n---\n\n";
  }
  return prompt;
}

// ── Batching ────────────────────────────────────────────────────────────────
function groupIntoBatches(items, maxChars) {
  const batches = [];
  let current = [];
  let currentChars = 0;
  for (const item of items) {
    const size = item.section.body.length;
    if (current.length > 0 && currentChars + size > maxChars) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(item);
    currentChars += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

// ── Slugify ─────────────────────────────────────────────────────────────────
function slugify(str) {
  return str.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, "-").slice(0, 80);
}

function genericSectionSlug(idx, section) {
  const pad = String(idx).padStart(5, "0");
  return `${pad}_${slugify(section.heading)}.json`;
}

function lhSectionSlug(idx, section) {
  const pad = String(idx).padStart(5, "0");
  const name = [section.h3, section.h4, section.h5]
    .filter(Boolean).join("_").replace(/\s+/g, "-").replace(/[<>:"/\\|?*]/g, "");
  return `${pad}_${name}.json`;
}

function bookSlug(bookPath) {
  const rel = path.relative(BOOKS_DIR, bookPath).replace(/\\/g, "/").replace(/\.md$/, "");
  const slug = getSlug(rel);
  if (slug) return slug;
  return rel.replace(/[<>:"|?*]/g, "").replace(/[\\/]/g, "--").replace(/\s+/g, "-");
}

// ── Process a book (generic or LH) ─────────────────────────────────────────
async function processBook(bookPath, bookNum, totalBooks) {
  const rel = path.relative(BOOKS_DIR, bookPath);
  const bookName = path.basename(bookPath, ".md");
  const isLH = path.basename(bookPath) === LH_FILENAME;

  // Parse sections
  const md = fs.readFileSync(bookPath, "utf-8");
  let allSections;
  if (isLH) {
    allSections = parseLHSections(md);
  } else {
    const splitLevel = detectDeepestHeading(md);
    allSections = parseGenericSections(md, splitLevel, bookName);
    if (allSections.length === 0) {
      console.log(`  [${bookNum}/${totalBooks}] ${rel}: no sections found, skipping`);
      return { book: rel, sections: 0, completed: 0, failed: 0 };
    }
    console.log(
      `  [${bookNum}/${totalBooks}] ${rel}: ${allSections.length} sections (split at ${"#".repeat(splitLevel) || "chunks"})`
    );
  }

  // Apply --start/--end range (mainly for LH)
  const sections = allSections.slice(START, END === Infinity ? undefined : END);
  if (isLH) {
    console.log(`  [${bookNum}/${totalBooks}] ${rel}: ${allSections.length} sections, processing ${START}–${START + sections.length - 1}`);
  }

  // Output config
  const outDir = isLH ? LH_OUTPUT_DIR : path.join(OUTPUT_BASE, bookSlug(bookPath));
  const systemPrompt = fs.readFileSync(isLH ? PROMPT_LH : PROMPT_GENERIC, "utf-8");
  const sourceFn = isLH ? lhSource : genericSource;
  const slugFn = isLH ? lhSectionSlug : genericSectionSlug;

  if (DRY_RUN) return { book: rel, sections: sections.length, completed: 0, failed: 0 };

  fs.mkdirSync(outDir, { recursive: true });

  // Resume check — skip successful files, delete and retry error files
  const done = new Set();
  if (RESUME) {
    for (const f of fs.readdirSync(outDir)) {
      if (f.endsWith(".json")) {
        const num = parseInt(f.split("_")[0], 10);
        if (isNaN(num)) continue;
        const filePath = path.join(outDir, f);
        try {
          const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
          if (data.error) {
            fs.unlinkSync(filePath);
            continue; // will be retried
          }
        } catch (e) {
          fs.unlinkSync(filePath);
          continue;
        }
        done.add(num);
      }
    }
  }

  // Build todo list
  const todo = [];
  let completed = 0;
  let failed = 0;
  for (let i = 0; i < sections.length; i++) {
    const globalIdx = START + i;
    if (RESUME && done.has(globalIdx)) {
      completed++;
      continue;
    }
    todo.push({ section: sections[i], idx: globalIdx });
  }

  if (todo.length === 0) {
    console.log(`  [${bookNum}/${totalBooks}] ${rel}: all sections already done`);
    return { book: rel, sections: sections.length, completed, failed };
  }

  const batches = groupIntoBatches(todo, MAX_BATCH_CHARS);
  console.log(`    ${todo.length} sections in ${batches.length} batches (max ${MAX_BATCH_CHARS} chars/batch)`);

  const pool = createPool({ maxConcurrency: CONCURRENCY });
  await pool.run(batches, async (batch, batchIdx) => {
    const batchSections = batch.map((b) => b.section);
    const prompt = batch.length === 1
      ? buildPrompt(systemPrompt, batch[0].section, sourceFn)
      : buildBatchPrompt(systemPrompt, batchSections, sourceFn);

    try {
      const raw = await runAgent(prompt, `${bookNum}-b${batchIdx}`, { model: MODEL, agentBin: AGENT_BIN });

      let results;
      if (batch.length === 1) {
        const json = extractJSON(raw);
        results = json ? [json] : null;
      } else {
        results = extractJSONArray(raw);
      }

      if (results && results.length !== batch.length) {
        console.log(`    [WARN] batch ${batchIdx}: expected ${batch.length} results, got ${results.length}`);
      }

      for (let i = 0; i < batch.length; i++) {
        const { section, idx } = batch[i];
        const slug = slugFn(idx, section);
        const outPath = path.join(outDir, slug);
        const json = results && results[i] ? results[i] : null;

        let result;
        if (isLH) {
          result = {
            index: idx, source: sourceFn(section), model: MODEL,
            h2: section.h2, h3: section.h3, h4: section.h4, h5: section.h5,
            claims: json ? json.claims || [] : [],
            raw: json ? undefined : raw.slice(0, 2000),
            error: json ? undefined : "JSON parse failed",
          };
        } else {
          result = {
            index: idx, source: genericSource(section), book: bookName, model: MODEL,
            heading: section.heading, context: section.context,
            claims: json ? json.claims || [] : [],
            raw: json ? undefined : raw.slice(0, 2000),
            error: json ? undefined : "JSON parse failed",
          };
        }

        fs.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf-8");
        if (json) {
          completed++;
          console.log(`    [${bookNum}/${totalBooks}] ✓ ${slug}  (${result.claims.length} claims)`);
        } else {
          failed++;
          console.log(`    [${bookNum}/${totalBooks}] ✗ ${slug}  (no JSON)`);
        }
      }
    } catch (err) {
      if (err instanceof QuotaExhaustedError) throw err;
      if (isRateLimitError(err)) throw err;
      for (const { section, idx } of batch) {
        const slug = slugFn(idx, section);
        const outPath = path.join(outDir, slug);
        failed++;
        console.error(`    [${bookNum}/${totalBooks}] FAIL ${slug}: ${err.message.slice(0, 200)}`);
        const errResult = isLH
          ? { index: idx, source: sourceFn(section), model: MODEL, error: err.message, claims: [] }
          : { index: idx, source: genericSource(section), book: bookName, model: MODEL, error: err.message, claims: [] };
        fs.writeFileSync(outPath, JSON.stringify(errResult, null, 2), "utf-8");
      }
    }
  });

  console.log(`  [${bookNum}/${totalBooks}] ${rel}: done (${completed} ok, ${failed} failed)`);
  return { book: rel, sections: sections.length, completed, failed };
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  let books = findBooks(BOOKS_DIR).sort();

  if (BOOK_FILTER) {
    books = books.filter((b) => b.includes(BOOK_FILTER));
  }

  console.log(`Found ${books.length} books in ${BOOKS_DIR}\n`);

  if (LIST_ONLY) {
    for (const b of books) {
      const md = fs.readFileSync(b, "utf-8");
      const level = detectDeepestHeading(md);
      const size = (fs.statSync(b).size / 1024).toFixed(0);
      const rel = path.relative(BOOKS_DIR, b);
      console.log(`  ${rel}  (${size} KB, ${level ? "split at " + "#".repeat(level) : "no headings, chunked"})`);
    }
    return;
  }

  const summary = [];
  for (let i = 0; i < books.length; i++) {
    const result = await processBook(books[i], i + 1, books.length);
    summary.push(result);
  }

  console.log("\n═══ Summary ═══");
  let totalSections = 0, totalCompleted = 0, totalFailed = 0;
  for (const s of summary) {
    totalSections += s.sections;
    totalCompleted += s.completed;
    totalFailed += s.failed;
  }
  console.log(`Books: ${summary.length}`);
  console.log(`Total sections: ${totalSections}`);
  console.log(`Completed: ${totalCompleted}`);
  console.log(`Failed: ${totalFailed}`);
}

main().catch((err) => {
  if (err instanceof QuotaExhaustedError) {
    console.log("\nStopped: daily quota exhausted. Re-run with --resume tomorrow.");
    process.exit(0);
  }
  console.error("Fatal:", err);
  process.exit(1);
});
