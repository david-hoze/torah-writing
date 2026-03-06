#!/usr/bin/env node
/**
 * Generic converter: HTML-tagged .txt book files → Markdown .md
 *
 * Walks books/ recursively, converts every .txt that has no .md sibling.
 * Uses the same conventions as convert-lm.js / convert-lh.js but without
 * book-specific heading renames (חלק→אות, פרק→הלכה).
 *
 * HTML tags handled:
 *   <h1>…</h1>  → # …       (h2–h5 likewise)
 *   <b>…</b>    → **…**
 *   <strong>…</strong> → **…**
 *   <small>…</small>  → stripped (text kept)
 *   <i …/>  or  <i …>…</i>  → stripped (overlay page refs in Zohar etc.)
 *   <span …>…</span> → stripped (color styling)
 *   <big>…</big> → stripped
 *   <sup …>…</sup> → stripped
 *   <br> / <br/> / <br /> → newline
 *   <UL>…</UL> → > blockquote
 *   <img …>  → kept as-is (base64 diagrams)
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

function convertLine(line) {
  line = line.replace(/\r$/, '');

  // --- Phase 1: strip wrapper/styling tags so heading detection works on nested markup ---
  line = line.replace(/<span\b[^>]*>/g, '');
  line = line.replace(/<\/span>/g, '');
  line = line.replace(/<big>/gi, '');
  line = line.replace(/<\/big>/gi, '');
  line = line.replace(/<sup\b[^>]*>/g, '');
  line = line.replace(/<\/sup>/g, '');
  line = line.replace(/<small>/gi, '');
  line = line.replace(/<\/small>/gi, '');

  // Strip <i> tags (Zohar page overlays, footnotes etc.)
  line = line.replace(/<i\b[^>]*\/>/g, '');
  line = line.replace(/<i\b[^>]*>.*?<\/i>/g, '');
  line = line.replace(/<\/?i\b[^>]*>/g, '');

  // --- Phase 2: heading detection (line now clean of wrapper tags) ---
  // Closed heading at start of line: <hN>...</hN>
  const hMatch = line.match(/^<h(\d)>(.*)<\/h\1>\s*$/);
  if (hMatch) {
    const level = parseInt(hMatch[1]);
    return '#'.repeat(level) + ' ' + hMatch[2].trim();
  }
  // Unclosed heading at start of line: <hN>...
  const hOpen = line.match(/^<h(\d)>(.+)$/);
  if (hOpen) {
    const level = parseInt(hOpen[1]);
    return '#'.repeat(level) + ' ' + hOpen[2].trim();
  }
  // Inline heading mid-line: text <hN>...</hN> text → text \n### ... \ntext
  line = line.replace(/<h(\d)>(.*?)<\/h\1>/g, (_, lvl, txt) =>
    '\n' + '#'.repeat(parseInt(lvl)) + ' ' + txt.trim() + '\n');

  // --- Phase 3: inline formatting ---
  line = line.replace(/<b>(.*?)<\/b>/g, '**$1**');
  line = line.replace(/<strong>(.*?)<\/strong>/g, '**$1**');
  // Strip orphan/malformed <b>, </b>, <b/> left from cross-line bold spans
  line = line.replace(/<\/?b\/?>/g, '');

  // <a href="...">text</a> → text (cross-reference links)
  line = line.replace(/<a\b[^>]*>(.*?)<\/a>/g, '$1');

  // <p style="...">text</p> → text
  line = line.replace(/<p\b[^>]*>(.*?)<\/p>/g, '$1');

  // --- Phase 4: structural tags ---
  // <br>, <br/>, <br /> → newline
  line = line.replace(/<br\s*\/?>/gi, '\n');

  // <UL>…</UL> → blockquote
  line = line.replace(/<UL>/gi, '> ');
  line = line.replace(/<\/UL>/gi, '');

  return line;
}

function convertFile(inputPath, outputPath, dryRun) {
  const content = fs.readFileSync(inputPath, 'utf-8');
  const lines = content.split('\n');
  // convertLine may return multi-line strings (from <br> → \n), so flatten
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

// --- main ---
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
