import { readFileSync } from 'fs';
const start = parseInt(process.argv[2]);
const end = parseInt(process.argv[3]);
const lines = readFileSync('books/\u05D1\u05E8\u05E1\u05DC\u05D1/\u05DC\u05D9\u05E7\u05D5\u05D8\u05D9 \u05D4\u05DC\u05DB\u05D5\u05EA.md', 'utf8').split('\n');
for (let i = start - 1; i < end && i < lines.length; i++) {
  console.log(`${i + 1}|${lines[i]}`);
}
