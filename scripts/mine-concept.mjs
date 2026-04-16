#!/usr/bin/env node
/**
 * Mine a Hebrew concept: search source books + extracted claims.
 *
 * Usage:
 *   node scripts/mine-concept.mjs <term> [--pattern <pattern>] [--books <dir>] [--context N] [--slug <name>]
 *
 * Examples:
 *   node scripts/mine-concept.mjs "מדמה"
 *   node scripts/mine-concept.mjs "מדמה" --pattern "*מ*ד*מ*"
 *   node scripts/mine-concept.mjs "נקודה טובה" --slug nekudah-tovah
 *   node scripts/mine-concept.mjs "עקמימיות" --pattern "+עקמ+" --books books/breslov
 *
 * Output: output/pipeline/{slug}/01-mine.json
 * Zero LLM dependency - pure search.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, join, basename } from 'path'
import { createRequire } from 'module'
import {
  stripNikud, patternToRegex, tokenizeHebrew,
  findProximityMatches, walkFiles
} from './hebrew-search.mjs'

const require = createRequire(import.meta.url)
const { loadAllClaims, buildConceptIndex, searchConcept, searchClaimText } = require('./lib/claims-index')

// ── CLI parsing ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
if (args.length === 0 || args.includes('--help')) {
  console.log(`Usage: node scripts/mine-concept.mjs <term> [options]`)
  console.log(`  --pattern <p>   Hebrew search pattern (default: derived from term)`)
  console.log(`  --books <dir>   Books directory (default: books/breslov)`)
  console.log(`  --context N     Lines of context around book matches (default: 2)`)
  console.log(`  --slug <name>   Output slug (default: transliterated from term)`)
  console.log(`  --proximity N   Max word distance for multi-word patterns (default: 10)`)
  process.exit(0)
}

function flag(name, fallback) {
  const i = args.indexOf('--' + name)
  if (i === -1) return fallback
  if (typeof fallback === 'boolean') return true
  return args[i + 1]
}

const term = args.find(a => !a.startsWith('--') && args.indexOf(a) === 0) || args[0]
const pattern = flag('pattern', null)
const booksDir = flag('books', 'books/breslov')
const contextLines = Number(flag('context', '2'))
const proximityDist = Number(flag('proximity', '10'))
let slug = flag('slug', null)

// Generate slug from term if not provided
if (!slug) {
  slug = stripNikud(term)
    .replace(/\s+/g, '-')
    .replace(/[^\u05D0-\u05EA\w-]/g, '')
  // Simple transliteration for filesystem compatibility
  const TRANSLIT = {
    'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'v',
    'ז': 'z', 'ח': 'ch', 'ט': 't', 'י': 'y', 'כ': 'k', 'ך': 'k',
    'ל': 'l', 'מ': 'm', 'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's',
    'ע': 'a', 'פ': 'p', 'ף': 'f', 'צ': 'tz', 'ץ': 'tz', 'ק': 'k',
    'ר': 'r', 'ש': 'sh', 'ת': 't',
  }
  slug = [...slug].map(c => TRANSLIT[c] || c).join('')
}

const rootDir = resolve(process.cwd())
const booksPath = resolve(rootDir, booksDir)
const outDir = resolve(rootDir, 'output/pipeline', slug)

console.log(`Mining concept: ${term}`)
console.log(`Slug: ${slug}`)
console.log(`Books dir: ${booksDir}`)
if (pattern) console.log(`Pattern: ${pattern}`)

// ── Search source books ──────────────────────────────────────────────────────

console.log(`\nSearching source books...`)

const bookFiles = walkFiles(booksPath)
console.log(`  Found ${bookFiles.length} book files`)

// Build search patterns
const searchPatterns = []

// Pattern 1: the term itself as space-separated proximity patterns
const termPatterns = stripNikud(term).split(/\s+/).filter(Boolean)
const termRegexes = termPatterns.map(p => patternToRegex(`+${p}+`))
searchPatterns.push({ label: 'term', regexes: termRegexes })

// Pattern 2: user-supplied pattern
if (pattern) {
  const patParts = stripNikud(pattern).split(/\s+/).filter(Boolean)
  const patRegexes = patParts.map(patternToRegex)
  searchPatterns.push({ label: 'pattern', regexes: patRegexes })
}

const bookFindings = []
const seenPositions = new Set() // dedup by file:lineNum

for (const file of bookFiles) {
  const content = readFileSync(file, 'utf-8')
  const lines = content.split('\n')
  const tokens = tokenizeHebrew(content)
  const relPath = file.replace(rootDir + '\\', '').replace(rootDir + '/', '')

  for (const { label, regexes } of searchPatterns) {
    const groups = findProximityMatches(tokens, regexes, proximityDist)
    for (const combo of groups) {
      const wordIndices = [...new Set(combo)].sort((a, b) => a - b)
      const firstTok = tokens[wordIndices[0]]

      // Find line number
      let lineNum = 0
      let cum = 0
      for (let li = 0; li < lines.length; li++) {
        if (cum + lines[li].length >= firstTok.charStart) { lineNum = li; break }
        cum += lines[li].length + 1
      }

      const posKey = `${relPath}:${lineNum}`
      if (seenPositions.has(posKey)) continue
      seenPositions.add(posKey)

      // Extract context
      const fromLine = Math.max(0, lineNum - contextLines)
      const toLine = Math.min(lines.length - 1, lineNum + contextLines)
      const contextText = lines.slice(fromLine, toLine + 1).join('\n')
      const matchedWords = wordIndices.map(i => tokens[i].word).join(' ')

      bookFindings.push({
        type: 'book',
        searchType: label,
        file: relPath,
        line: lineNum + 1,
        matched: matchedWords,
        context: contextText,
      })
    }
  }
}

console.log(`  Book hits: ${bookFindings.length}`)

// ── Search extracted claims ──────────────────────────────────────────────────

console.log(`\nSearching extracted claims...`)

const allClaims = loadAllClaims()
console.log(`  Loaded ${allClaims.length} claims`)

const index = buildConceptIndex(allClaims)

// Search by concept
const conceptMatches = searchConcept(index, allClaims, term)

// Search by claim text
const textMatches = searchClaimText(allClaims, term)

// Merge and deduplicate
const seenClaimIndices = new Set()
const claimFindings = []

for (const m of [...conceptMatches, ...textMatches]) {
  if (seenClaimIndices.has(m._index)) continue
  seenClaimIndices.add(m._index)
  claimFindings.push({
    type: 'claim',
    searchType: m._matchType,
    claim: m.claim,
    claimType: m.type,
    concepts: m.concepts,
    source: m.source,
  })
}

console.log(`  Claim hits: ${claimFindings.length} (${conceptMatches.length} by concept, ${textMatches.length} by text, after dedup)`)

// ── Combine and output ───────────────────────────────────────────────────────

const findings = [...bookFindings, ...claimFindings]

const output = {
  concept: term,
  slug,
  pattern: pattern || null,
  booksDir,
  timestamp: new Date().toISOString(),
  stats: {
    bookFiles: bookFiles.length,
    bookHits: bookFindings.length,
    claimsLoaded: allClaims.length,
    claimHits: claimFindings.length,
    totalFindings: findings.length,
  },
  findings,
}

mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, '01-mine.json')
writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8')

console.log(`\n${'─'.repeat(60)}`)
console.log(`Total findings: ${findings.length}`)
console.log(`Output: ${outPath}`)
