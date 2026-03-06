#!/usr/bin/env node
// Generate a report showing .txt → .md conversion examples for EVERY book.
// For each book, finds all HTML tag types present and shows before/after examples.
//
// Usage: node scripts/conversion-report.js > report.md

const fs = require("fs");
const path = require("path");

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
  { name: "small", regex: /<small>/i, desc: "Small → stripped" },
  { name: "i", regex: /<i\b/i, desc: "Italic/overlay → stripped" },
  { name: "span", regex: /<span\b/i, desc: "Span → stripped" },
  { name: "big", regex: /<big>/i, desc: "Big → stripped" },
  { name: "sup", regex: /<sup\b/i, desc: "Superscript → stripped" },
  { name: "br", regex: /<br\b/i, desc: "Line break → newline" },
  { name: "UL", regex: /<UL>/i, desc: "Blockquote → `> ...`" },
  { name: "a", regex: /<a\b/i, desc: "Link → text only" },
  { name: "p", regex: /<p\b/i, desc: "Paragraph → text only" },
  { name: "img", regex: /<img\b/i, desc: "Image → kept as-is" },
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

// Simple line-level converter (mirrors convert-books.js logic)
function convertLine(line) {
  line = line.replace(/\r$/, "");
  line = line.replace(/<span\b[^>]*>/g, "");
  line = line.replace(/<\/span>/g, "");
  line = line.replace(/<big>/gi, "");
  line = line.replace(/<\/big>/gi, "");
  line = line.replace(/<sup\b[^>]*>/g, "");
  line = line.replace(/<\/sup>/g, "");
  line = line.replace(/<small>/gi, "");
  line = line.replace(/<\/small>/gi, "");
  line = line.replace(/<i\b[^>]*\/>/g, "");
  line = line.replace(/<i\b[^>]*>.*?<\/i>/g, "");
  line = line.replace(/<\/?i\b[^>]*>/g, "");
  const hMatch = line.match(/^<h(\d)>(.*)<\/h\1>\s*$/);
  if (hMatch) return "#".repeat(parseInt(hMatch[1])) + " " + hMatch[2].trim();
  const hOpen = line.match(/^<h(\d)>(.+)$/);
  if (hOpen) return "#".repeat(parseInt(hOpen[1])) + " " + hOpen[2].trim();
  line = line.replace(/<h(\d)>(.*?)<\/h\1>/g, (_, lvl, txt) =>
    "\n" + "#".repeat(parseInt(lvl)) + " " + txt.trim() + "\n");
  line = line.replace(/<b>(.*?)<\/b>/g, "**$1**");
  line = line.replace(/<strong>(.*?)<\/strong>/g, "**$1**");
  line = line.replace(/<\/?b\/?>/g, "");
  line = line.replace(/<a\b[^>]*>(.*?)<\/a>/g, "$1");
  line = line.replace(/<p\b[^>]*>(.*?)<\/p>/g, "$1");
  line = line.replace(/<br\s*\/?>/gi, "\n");
  line = line.replace(/<UL>/gi, "> ");
  line = line.replace(/<\/UL>/gi, "");
  return line;
}

const txtFiles = findTxtFiles(BOOKS_DIR);

const out = [];
out.push("# Conversion Report: .txt → .md");
out.push("");
out.push(`Generated: ${new Date().toISOString().slice(0, 10)}`);
out.push(`Total books: ${txtFiles.length}`);
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

  for (const tagName of tagsUsed) {
    const ex = book.tagExamples[tagName];
    if (!ex) continue;

    const tp = TAG_PATTERNS.find(t => t.name === tagName);
    out.push(`**\`<${tagName}>\`** (${book.tagCounts[tagName]}x) — ${tp.desc}`);
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
