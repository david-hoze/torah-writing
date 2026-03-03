#!/usr/bin/env node
/**
 * Hebrew fuzzy search for verifying citations.
 * Based on obsidian-omnisearch proximity-search patterns.
 *
 * Usage:
 *   node scripts/hebrew-search.mjs <pattern> [file] [--context N] [--proximity N] [--line]
 *
 * Pattern syntax (from omnisearch):
 *   * = any Hebrew letter(s)
 *   + = zero or more from prefix/suffix set (א,ב,ה,ו,י,כ,ך,ל,מ,ם,ש,ת)
 *   Final letters are interchangeable (מ/ם, נ/ן, צ/ץ, פ/ף, כ/ך)
 *   Nikkud is stripped automatically
 *
 * Multi-word proximity: separate patterns with spaces, use --proximity N
 *   node scripts/hebrew-search.mjs "לבנה מלכות +גרמ+" books/ברסלב/ליקוטי\ הלכות.md --proximity 15
 *
 * Examples:
 *   node scripts/hebrew-search.mjs "+תקן+"             # finds תיקון, התיקון, לתקן, etc.
 *   node scripts/hebrew-search.mjs "גשר צר מאד"        # multi-word proximity search
 *   node scripts/hebrew-search.mjs "לבנה +גרמ+" --proximity 10
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'

// ── Hebrew constants (from omnisearch) ──────────────────────────────────────

const HEBREW_LETTERS = '\u05D0-\u05EA'
const NIKUD_REGEX = /[\u0591-\u05C7\u05F0-\u05F4]/g

const PLUS_CHARS = 'אבהויךכלםמשת'
const PLUS_CLASS = `[${PLUS_CHARS}]`

const FINAL_FORMS = {
  מ: 'מם', ם: 'מם',
  נ: 'נן', ן: 'נן',
  צ: 'צץ', ץ: 'צץ',
  פ: 'פף', ף: 'פף',
  כ: 'כך', ך: 'כך',
}

// ── Core functions (adapted from omnisearch proximity-search.ts) ────────────

function stripNikud(text) {
  return text.replace(NIKUD_REGEX, '')
}

function letterClass(char) {
  const pair = FINAL_FORMS[char]
  if (pair) return `[${pair}]`
  return char
}

function patternToRegex(pattern) {
  const chars = [...pattern]
  let firstHeb = -1, lastHeb = -1
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] >= '\u05D0' && chars[i] <= '\u05EA') {
      if (firstHeb === -1) firstHeb = i
      lastHeb = i
    }
  }
  if (firstHeb === -1) return /(?!)/u

  let hasMiddleStar = false, hasMiddlePlus = false
  for (let i = firstHeb + 1; i < lastHeb; i++) {
    if (chars[i] === '*') hasMiddleStar = true
    else if (chars[i] === '+') hasMiddlePlus = true
  }
  const middleWild = hasMiddleStar
    ? `[${HEBREW_LETTERS}]*`
    : hasMiddlePlus
      ? `${PLUS_CLASS}*`
      : ''

  let re = ''
  for (let i = 0; i < firstHeb; i++) {
    if (chars[i] === '*') re += `[${HEBREW_LETTERS}]*`
    else if (chars[i] === '+') re += `${PLUS_CLASS}*`
  }

  const hebrewLetters = []
  for (let i = firstHeb; i <= lastHeb; i++) {
    if (chars[i] >= '\u05D0' && chars[i] <= '\u05EA') {
      hebrewLetters.push(chars[i])
    }
  }

  for (let i = 0; i < hebrewLetters.length; i++) {
    re += letterClass(hebrewLetters[i])
    if (i < hebrewLetters.length - 1 && middleWild) {
      re += middleWild
    }
  }

  for (let i = lastHeb + 1; i < chars.length; i++) {
    if (chars[i] === '*') re += `[${HEBREW_LETTERS}]*`
    else if (chars[i] === '+') re += `${PLUS_CLASS}*`
  }

  return new RegExp(`^${re}$`, 'u')
}

const HEBREW_TOKEN_REGEX = /[\u05D0-\u05EA\u0591-\u05C7\u05F0-\u05F4]+/gu

function tokenizeHebrew(text) {
  const tokens = []
  let match
  const re = new RegExp(HEBREW_TOKEN_REGEX.source, 'gu')
  let wordIndex = 0
  while ((match = re.exec(text)) !== null) {
    const raw = match[0]
    const normalized = stripNikud(raw)
    if (normalized.length > 0) {
      tokens.push({ wordIndex, word: raw, normalized, charStart: match.index, charEnd: match.index + raw.length })
      wordIndex++
    }
  }
  return tokens
}

// ── Proximity search ────────────────────────────────────────────────────────

function findProximityMatches(tokens, regexes, maxDist) {
  const positionsByPattern = regexes.map(() => [])
  for (let pi = 0; pi < regexes.length; pi++) {
    for (const tok of tokens) {
      if (regexes[pi].test(tok.normalized)) {
        positionsByPattern[pi].push(tok.wordIndex)
      }
    }
  }

  if (regexes.length === 1) {
    return positionsByPattern[0].map(idx => [idx])
  }

  const sorted = positionsByPattern.map(p => [...p].sort((a, b) => a - b))
  const results = []

  function backtrack(patIdx, combo, curMin, curMax) {
    if (patIdx === regexes.length) { results.push([...combo]); return }
    for (const pos of sorted[patIdx]) {
      const newMin = Math.min(curMin, pos)
      const newMax = Math.max(curMax, pos)
      if (newMax - newMin > maxDist) { if (pos > curMax) break; continue }
      combo.push(pos)
      backtrack(patIdx + 1, combo, newMin, newMax)
      combo.pop()
    }
  }

  for (const pos of sorted[0]) {
    backtrack(1, [pos], pos, pos)
  }
  return results
}

// ── File walking ────────────────────────────────────────────────────────────

function walkFiles(dir, ext = '.md') {
  const results = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) results.push(...walkFiles(full, ext))
    else if (entry.name.endsWith(ext)) results.push(full)
  }
  return results
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2)
  if (args.length === 0 || args.includes('--help')) {
    console.log(`Usage: node scripts/hebrew-search.mjs <pattern> [file|dir] [--context N] [--proximity N] [--line]`)
    console.log(`  pattern:     Hebrew text (nikkud stripped). Use * for any letters, + for prefix/suffix set.`)
    console.log(`  --context N: lines of context around match (default: 0)`)
    console.log(`  --proximity N: max word distance for multi-word search (default: 10)`)
    console.log(`  --line:      show line numbers`)
    console.log(`\nExamples:`)
    console.log(`  node scripts/hebrew-search.mjs "+תקן+"`)
    console.log(`  node scripts/hebrew-search.mjs "גשר צר מאד" books/ברסלב/ליקוטי\\ מוהרן.md`)
    console.log(`  node scripts/hebrew-search.mjs "לבנה +גרמ+" books/ --proximity 15`)
    process.exit(0)
  }

  let contextLines = 0
  let proximityDist = 10
  let showLineNumbers = false
  const positional = []

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--context' && args[i + 1]) { contextLines = parseInt(args[++i], 10) }
    else if (args[i] === '--proximity' && args[i + 1]) { proximityDist = parseInt(args[++i], 10) }
    else if (args[i] === '--line') { showLineNumbers = true }
    else positional.push(args[i])
  }

  const patternInput = stripNikud(positional[0] || '')
  const target = positional[1] || 'books'

  const patterns = patternInput.split(/\s+/).filter(Boolean)
  const regexes = patterns.map(patternToRegex)

  const rootDir = resolve(process.cwd())
  const targetPath = resolve(rootDir, target)

  let files
  try {
    const stat = statSync(targetPath)
    files = stat.isDirectory() ? walkFiles(targetPath) : [targetPath]
  } catch {
    console.error(`Error: "${target}" not found`)
    process.exit(1)
  }

  let totalMatches = 0

  for (const file of files) {
    const content = readFileSync(file, 'utf-8')
    const lines = content.split('\n')
    const tokens = tokenizeHebrew(content)

    const groups = findProximityMatches(tokens, regexes, proximityDist)
    if (groups.length === 0) continue

    const relPath = file.replace(rootDir + '\\', '').replace(rootDir + '/', '')
    console.log(`\n${'═'.repeat(60)}`)
    console.log(`📄 ${relPath}  (${groups.length} match${groups.length > 1 ? 'es' : ''})`)
    console.log('═'.repeat(60))

    for (const combo of groups) {
      totalMatches++
      const wordIndices = [...new Set(combo)].sort((a, b) => a - b)
      const firstTok = tokens[wordIndices[0]]
      const lastTok = tokens[wordIndices[wordIndices.length - 1]]

      // Find line number
      let charPos = firstTok.charStart
      let lineNum = 0
      let cum = 0
      for (let li = 0; li < lines.length; li++) {
        if (cum + lines[li].length >= charPos) { lineNum = li; break }
        cum += lines[li].length + 1
      }

      const fromLine = Math.max(0, lineNum - contextLines)
      const toLine = Math.min(lines.length - 1, lineNum + contextLines)

      console.log(`\n--- match at line ${lineNum + 1} ---`)
      const matchedWords = wordIndices.map(i => tokens[i].word).join(' … ')
      console.log(`  matched: ${matchedWords}`)

      for (let li = fromLine; li <= toLine; li++) {
        const prefix = showLineNumbers ? `${String(li + 1).padStart(6)}| ` : ''
        const line = lines[li]
        const trimmed = line.length > 200 ? line.substring(0, 200) + '…' : line
        const marker = li === lineNum ? '>>>' : '   '
        console.log(`${marker} ${prefix}${trimmed}`)
      }
    }
  }

  console.log(`\n${'─'.repeat(60)}`)
  console.log(`Total: ${totalMatches} match${totalMatches !== 1 ? 'es' : ''} in ${files.length} file${files.length !== 1 ? 's' : ''}`)
}

main()
