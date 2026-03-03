#!/usr/bin/env node
/**
 * Convert Likutey Halachot from HTML headings to Markdown,
 * renaming פרק -> הלכה and חלק -> אות.
 *
 * Heading mapping:
 *   <h1>...</h1>  -> # ...
 *   <h2>...</h2>  -> ## ...
 *   <h3>...</h3>  -> ### ...
 *   <h4>פרק X</h4> -> #### הלכה X
 *   <h5>חלק X</h5> -> ##### אות X
 *   <b>...</b>    -> **...**
 *
 * Usage:
 *   node convert-lh.js <input_file> <output_file>
 *   node convert-lh.js  # defaults to ליקוטי הלכות.txt -> ליקוטי הלכות.md
 */

const fs = require('fs');
const path = require('path');

function convertLine(line) {
  // h4: פרק -> הלכה
  let m = line.match(/^<h4>(פרק\s+.+)<\/h4>$/);
  if (m) {
    return '#### ' + m[1].replace('פרק', 'הלכה');
  }

  // h5: חלק -> אות
  m = line.match(/^<h5>(חלק\s+.+)<\/h5>$/);
  if (m) {
    return '##### ' + m[1].replace('חלק', 'אות');
  }

  // Generic h1-h5
  m = line.match(/^<h(\d)>(.+)<\/h\1>$/);
  if (m) {
    const level = parseInt(m[1]);
    return '#'.repeat(level) + ' ' + m[2];
  }

  // Convert <b>...</b> to **...**
  line = line.replace(/<b>(.*?)<\/b>/g, '**$1**');

  return line;
}

function convertFile(inputPath, outputPath) {
  const content = fs.readFileSync(inputPath, 'utf-8');
  const lines = content.split('\n');
  const converted = lines.map(l => convertLine(l.replace(/\r$/, '')));

  // Add blank lines before and after headings
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

  fs.writeFileSync(outputPath, result.join('\n'), 'utf-8');
  console.log(`Converted ${lines.length} lines -> ${outputPath}`);
}

const base = path.join(__dirname, '..', 'ברסלב');
const inputPath = process.argv[2] || path.join(base, 'ליקוטי הלכות.txt');
const outputPath = process.argv[3] || path.join(base, 'ליקוטי הלכות.md');

convertFile(inputPath, outputPath);
