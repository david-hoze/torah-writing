#!/usr/bin/env node
/**
 * Generic converter: HTML-tagged .txt book files → Markdown .md
 *
 * Walks books/ recursively, converts every .txt that has no .md sibling.
 *
 * HTML tags handled:
 *   <h1>…</h1>  → # …       (h2–h5 likewise)
 *   <b>…</b>    → **…**
 *   <strong>…</strong> → **…**
 *   <small>…</small>  → *…* (italics — marks editorial/secondary text)
 *   <i …/>  or  <i …>…</i>  → stripped (overlay page refs in Zohar etc.)
 *   <span …>…</span> → stripped (color styling, text kept)
 *   <big>…</big> → stripped (text kept)
 *   <sup …>…</sup> → <sup>…</sup> (kept as raw HTML for footnote markers)
 *   <br> / <br/> / <br /> → newline
 *   <UL>…</UL> → > blockquote (non-standard usage for indented passages)
 *   <a href="…">text</a> → [text](href) (cross-reference links preserved)
 *   <p style="…">text</p> → text
 *   <img src="…"> → ![](src) for URL images, kept as-is for base64
 *
 * Usage:
 *   node scripts/convert-books.js              # convert all under books/
 *   node scripts/convert-books.js --dry-run    # preview without writing
 *   node scripts/convert-books.js --reconvert  # re-convert even if .md exists
 *   node scripts/convert-books.js path/to/file.txt   # convert one file
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const MIN_FREE_MB = 200;

function getFreeSpaceMB() {
  try {
    const { execSync } = require('child_process');
    if (os.platform() === 'win32') {
      const out = execSync('wmic logicaldisk where "caption=\'C:\'" get freespace', { encoding: 'utf-8' });
      const num = out.match(/\d+/);
      return num ? parseInt(num[0]) / 1024 / 1024 : Infinity;
    }
    const { availableParallelism, ...rest } = os;
    const stat = fs.statfsSync('/');
    return (stat.bavail * stat.bsize) / 1024 / 1024;
  } catch {
    return Infinity;
  }
}

// Strip all HTML tags from a string (for cleaning heading text)
function stripAllTags(str) {
  return str.replace(/<[^>]+>/g, '');
}

function convertLine(line) {
  line = line.replace(/\r$/, '');

  // --- Phase 1: strip purely visual tags (no semantic meaning) ---
  line = line.replace(/<big>/gi, '');
  line = line.replace(/<\/big>/gi, '');

  // Strip <i> tags with content (Zohar page overlays, footnotes etc.)
  line = line.replace(/<i\b[^>]*\/>/g, '');
  line = line.replace(/<i\b[^>]*>.*?<\/i>/g, '');
  line = line.replace(/<\/?i\b[^>]*>/g, '');

  // --- Phase 2: heading detection ---
  // For headings, strip all remaining tags from the text content
  const hMatch = line.match(/^<h(\d)>(.*)<\/h\1>\s*$/);
  if (hMatch) {
    const level = parseInt(hMatch[1]);
    return '#'.repeat(level) + ' ' + stripAllTags(hMatch[2]).trim();
  }
  const hOpen = line.match(/^<h(\d)>(.+)$/);
  if (hOpen) {
    const level = parseInt(hOpen[1]);
    return '#'.repeat(level) + ' ' + stripAllTags(hOpen[2]).trim();
  }
  // Inline heading mid-line
  line = line.replace(/<h(\d)>(.*?)<\/h\1>/g, (_, lvl, txt) =>
    '\n' + '#'.repeat(parseInt(lvl)) + ' ' + stripAllTags(txt).trim() + '\n');

  // --- Phase 3: strip wrapper tags that don't map to markdown ---
  line = line.replace(/<span\b[^>]*>/g, '');
  line = line.replace(/<\/span>/g, '');

  // --- Phase 4: <sup> — strip style attrs but keep tag for footnote markers ---
  line = line.replace(/<sup\b[^>]*>/g, '<sup>');

  // --- Phase 5: <small> → italic ---
  // Collapse nested <small> tags to a single level
  while (line.includes('<small><small>')) line = line.replace(/<small><small>/gi, '<small>');
  while (line.includes('</small></small>')) line = line.replace(/<\/small><\/small>/gi, '</small>');
  // Merge adjacent italic regions: </small><small> or </small> <small>
  line = line.replace(/<\/small>\s*<small>/gi, ' ');
  // Convert to italic — trim invisible/whitespace chars at boundaries so * is adjacent to content
  line = line.replace(/<small>([\s\S]*?)<\/small>/gi, (_, content) => {
    const trimmed = content.replace(/^[\s\u200E\u200F\u200B\uFEFF]+/, '').replace(/[\s\u200E\u200F\u200B\uFEFF]+$/, '');
    return trimmed ? '*' + trimmed + '*' : '';
  });
  // Handle any remaining orphan tags (cross-line spans)
  line = line.replace(/<small>/gi, '*');
  line = line.replace(/<\/small>/gi, '*');

  // --- Phase 6: inline formatting ---
  line = line.replace(/<b>(.*?)<\/b>/g, '**$1**');
  line = line.replace(/<strong>(.*?)<\/strong>/g, '**$1**');
  // Strip orphan/malformed <b>, </b>, <b/> left from cross-line bold spans
  line = line.replace(/<\/?b\/?>/g, '');

  // <a href="...">text</a> → [text](href)
  line = line.replace(/<a\b[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g, '[$2]($1)');
  // Strip any remaining <a> tags without href
  line = line.replace(/<a\b[^>]*>(.*?)<\/a>/g, '$1');

  // <p style="...">text</p> → text
  line = line.replace(/<p\b[^>]*>(.*?)<\/p>/g, '$1');

  // <img src="url"> → ![](url) for URL images; keep base64 as-is
  line = line.replace(/<img\s+src="(https?:\/\/[^"]+)"[^>]*>/g, '![]($1)');

  // --- Phase 7: structural tags ---
  line = line.replace(/<br\s*\/?>/gi, '\n');
  line = line.replace(/<UL>/gi, '> ');
  line = line.replace(/<\/UL>/gi, '');

  // --- Phase 8: post-processing ---
  // Strip bidi marks (LRM/RLM) adjacent to italic/bold markers — they break rendering
  line = line.replace(/[\u200E\u200F\u200B]+\*/g, '*');
  line = line.replace(/\*[\u200E\u200F\u200B]+/g, '*');

  // Fix missing space after bold closing when followed by non-space, non-punctuation
  // \w doesn't match Hebrew, so use [^\s*.,;:!?)\]}>] instead
  line = line.replace(/(\S)\*\*([^\s*.,;:!?)\]}>])/g, '$1** $2');

  return line;
}

function convertFile(inputPath, outputPath, dryRun) {
  const content = fs.readFileSync(inputPath, 'utf-8');
  const lines = content.split('\n');
  const converted = lines.flatMap(l => convertLine(l).split('\n'));

  const result = [];
  for (let i = 0; i < converted.length; i++) {
    const isHeading = /^#{1,5} /.test(converted[i]);
    const prevIsBlank = result.length === 0 || result[result.length - 1] === '';
    if (isHeading && !prevIsBlank) {
      result.push('');
    }
    result.push(converted[i]);
    if (isHeading && i + 1 < converted.length) {
      result.push('');
    }
  }

  if (dryRun) {
    const sizeKB = Math.round(Buffer.byteLength(result.join('\n'), 'utf-8') / 1024);
    console.log(`  [dry-run] ${path.relative(process.cwd(), outputPath)} (${sizeKB}KB)`);
    return true;
  }

  fs.writeFileSync(outputPath, result.join('\n'), 'utf-8');
  const sizeKB = Math.round(fs.statSync(outputPath).size / 1024);
  console.log(`  ✓ ${path.relative(process.cwd(), outputPath)} (${sizeKB}KB)`);
  return true;
}

function walk(dir, reconvert) {
  const entries = [];
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      entries.push(...walk(full, reconvert));
    } else if (item.endsWith('.txt')) {
      const mdPath = full.replace(/\.txt$/, '.md');
      if (reconvert || !fs.existsSync(mdPath)) {
        entries.push({ txt: full, md: mdPath, size: stat.size });
      }
    }
  }
  return entries;
}

// Export for use by other scripts (e.g. conversion-report.js)
module.exports = { convertLine };

// --- main (only when run directly) ---
if (require.main === module) {
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const reconvert = args.includes('--reconvert');
const explicitFile = args.find(a => a.endsWith('.txt'));

const booksDir = path.join(__dirname, '..', 'books');

let files;
if (explicitFile) {
  const abs = path.resolve(explicitFile);
  files = [{ txt: abs, md: abs.replace(/\.txt$/, '.md'), size: fs.statSync(abs).size }];
} else {
  files = walk(booksDir, reconvert);
}

if (files.length === 0) {
  console.log('Nothing to convert – all .txt files already have .md siblings.');
  process.exit(0);
}

const totalMB = Math.round(files.reduce((s, f) => s + f.size, 0) / 1024 / 1024);
console.log(`Found ${files.length} files to convert (~${totalMB}MB)${dryRun ? ' [DRY RUN]' : ''}`);

let converted = 0;
let skipped = 0;

for (const f of files) {
  const freeMB = getFreeSpaceMB();
  if (freeMB < MIN_FREE_MB) {
    console.error(`\n⚠ Only ${Math.round(freeMB)}MB free – stopping to preserve disk space.`);
    console.error(`  Converted ${converted} files, ${files.length - converted - skipped} remaining.`);
    process.exit(1);
  }

  try {
    convertFile(f.txt, f.md, dryRun);
    converted++;
  } catch (err) {
    console.error(`  ✗ ${path.relative(process.cwd(), f.txt)}: ${err.message}`);
    skipped++;
  }
}

console.log(`\nDone: ${converted} converted, ${skipped} skipped.`);
}
