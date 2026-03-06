#!/usr/bin/env node
// Generate a report showing .txt → .md conversion examples for EVERY book.
// For each book, finds all HTML tag types present and shows before/after examples.
//
// Usage: node scripts/conversion-report.js > report.md

const fs = require("fs");
const path = require("path");

// Import the actual converter so report examples match real output
const { convertLine } = require("./convert-books.js");

const BOOKS_DIR = path.resolve(__dirname, "../books");

// Tag patterns to detect and their descriptions
const TAG_PATTERNS = [
  { name: "h1", regex: /<h1\b/i, desc: "Title heading → `# ...`" },
  { name: "h2", regex: /<h2\b/i, desc: "Section heading → `## ...`" },
  { name: "h3", regex: /<h3\b/i, desc: "Subsection heading → `### ...`" },
  { name: "h4", regex: /<h4\b/i, desc: "Sub-subsection heading → `#### ...`" },
  { name: "h5", regex: /<h5\b/i, desc: "Part heading → `##### ...`" },
  { name: "b", regex: /<b>/i, desc: "Bold → `**...**`" },
  { name: "strong", regex: /<strong>/i, desc: "Strong → `**...**`" },
  { name: "small", regex: /<small>/i, desc: "Small → `*...*` (italics)" },
  { name: "i", regex: /<i\b/i, desc: "Overlay page refs → stripped (content removed; these are positional overlays in Zohar etc., not semantic italics)" },
  { name: "span", regex: /<span\b/i, desc: "Span → stripped (text kept)" },
  { name: "big", regex: /<big>/i, desc: "Big → stripped (text kept)" },
  { name: "sup", regex: /<sup\b/i, desc: "Superscript → `<sup>` kept" },
  { name: "br", regex: /<br\b/i, desc: "Line break → newline" },
  { name: "UL", regex: /<UL>/i, desc: "Blockquote → `> ...`" },
  { name: "a", regex: /<a\b/i, desc: "Link → `[text](url)`" },
  { name: "p", regex: /<p\b/i, desc: "Paragraph → text only" },
  { name: "img", regex: /<img\b/i, desc: "Image → `![](url)` for URL images; base64 data URIs kept as raw HTML (no external file extraction)" },
];

function findTxtFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findTxtFiles(full));
    else if (entry.name.endsWith(".txt")) results.push(full);
  }
  return results.sort();
}

function escapeForMarkdown(str) {
  // Wrap in backticks for code display, escape backticks inside
  return str.replace(/\|/g, "\\|");
}

const txtFiles = findTxtFiles(BOOKS_DIR);

const out = [];
out.push("# Conversion Report: .txt → .md");
out.push("");
out.push(`Generated: ${new Date().toISOString().slice(0, 10)}`);
out.push(`Total books: ${txtFiles.length}`);
out.push("");

// Conversion Rules Summary (#5 from review)
out.push("## Conversion Rules Summary");
out.push("");
out.push("| HTML Tag | Markdown Output | Notes |");
out.push("|----------|----------------|-------|");
out.push("| `<h1>`–`<h5>` | `#`–`#####` | Heading level preserved; inner tags stripped |");
out.push("| `<b>`, `<strong>` | `**...**` | Bold |");
out.push("| `<small>` | `*...*` | Italics — marks editorial/secondary text |");
out.push("| `<i>` | *(tag and content removed)* | Positional overlays (Zohar page refs), not semantic italics |");
out.push("| `<span>` | *(stripped, text kept)* | Color styling removed |");
out.push("| `<big>` | *(stripped, text kept)* | Visual sizing removed |");
out.push("| `<sup>` | `<sup>` | Kept as raw HTML for footnote markers; style attrs stripped |");
out.push("| `<br>` | newline | Line break |");
out.push("| `<UL>` | `> ...` | Non-standard usage for indented/quoted passages |");
out.push("| `<a href>` | `[text](url)` | Cross-reference links preserved |");
out.push("| `<p>` | text only | Wrapper stripped |");
out.push("| `<img src=\"http...\">` | `![](url)` | URL images converted to markdown |");
out.push("| `<img src=\"data:...\">` | kept as raw HTML | Base64 data URIs — no external file extraction |");
out.push("");

// Global tag frequency summary
out.push("## Tag Frequency Summary");
out.push("");
out.push("| Tag | Books using it | Total occurrences |");
out.push("|-----|---------------|-------------------|");

const globalTagStats = {};
for (const tp of TAG_PATTERNS) {
  globalTagStats[tp.name] = { books: 0, total: 0 };
}

// First pass: count tags per book
const bookData = [];
for (const txtPath of txtFiles) {
  const rel = path.relative(BOOKS_DIR, txtPath).replace(/\\/g, "/");
  const content = fs.readFileSync(txtPath, "utf-8");
  const lines = content.split("\n");

  const tagExamples = {}; // tagName → [{ lineNum, original, converted }]
  const tagCounts = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const tp of TAG_PATTERNS) {
      if (tp.regex.test(line)) {
        if (!tagCounts[tp.name]) tagCounts[tp.name] = 0;
        tagCounts[tp.name]++;

        // Store first example of each tag
        if (!tagExamples[tp.name]) {
          const converted = convertLine(line);
          // Only store if meaningful (non-empty, not just whitespace)
          if (line.trim().length > 0) {
            tagExamples[tp.name] = {
              lineNum: i + 1,
              original: line.trimEnd(),
              converted: converted.trimEnd(),
            };
          }
        }
      }
    }
  }

  for (const tp of TAG_PATTERNS) {
    if (tagCounts[tp.name]) {
      globalTagStats[tp.name].books++;
      globalTagStats[tp.name].total += tagCounts[tp.name];
    }
  }

  bookData.push({ rel, tagExamples, tagCounts });
}

for (const tp of TAG_PATTERNS) {
  const s = globalTagStats[tp.name];
  if (s.total > 0) {
    out.push(`| \`<${tp.name}>\` | ${s.books} | ${s.total.toLocaleString()} |`);
  }
}
out.push("");

// Per-book sections
out.push("---");
out.push("");
out.push("## Per-Book Conversion Details");
out.push("");

for (const book of bookData) {
  const tagsUsed = Object.keys(book.tagCounts);
  if (tagsUsed.length === 0) {
    out.push(`### ${book.rel}`);
    out.push("");
    out.push("No HTML tags found — plain text file.");
    out.push("");
    continue;
  }

  out.push(`### ${book.rel}`);
  out.push("");
  out.push(`Tags found: ${tagsUsed.map(t => "\`<" + t + ">\`").join(", ")}`);
  out.push("");

  // Group tags that share the same example line to avoid duplicate examples (#4)
  const lineGroups = {}; // lineNum → [tagName, ...]
  for (const tagName of tagsUsed) {
    const ex = book.tagExamples[tagName];
    if (!ex) continue;
    const key = ex.lineNum;
    if (!lineGroups[key]) lineGroups[key] = [];
    lineGroups[key].push(tagName);
  }

  const shown = new Set();
  for (const tagName of tagsUsed) {
    const ex = book.tagExamples[tagName];
    if (!ex) continue;
    if (shown.has(tagName)) continue;

    const group = lineGroups[ex.lineNum];
    // Mark all tags in this group as shown
    for (const t of group) shown.add(t);

    // Header: list all co-occurring tags
    const tagHeaders = group.map(t => {
      const tp = TAG_PATTERNS.find(p => p.name === t);
      return `**\`<${t}>\`** (${book.tagCounts[t]}x) — ${tp.desc}`;
    });
    out.push(tagHeaders.join("  \n"));
    out.push("");

    // Truncate very long lines for readability
    const maxLen = 200;
    const origDisplay = ex.original.length > maxLen ? ex.original.slice(0, maxLen) + "..." : ex.original;
    const convDisplay = ex.converted.length > maxLen ? ex.converted.slice(0, maxLen) + "..." : ex.converted;

    out.push("Original (line " + ex.lineNum + "):");
    out.push("```html");
    out.push(origDisplay);
    out.push("```");
    out.push("");
    out.push("Converted:");
    out.push("```markdown");
    out.push(convDisplay);
    out.push("```");
    out.push("");
  }

  out.push("---");
  out.push("");
}

const report = out.join("\n");
process.stdout.write(report);
