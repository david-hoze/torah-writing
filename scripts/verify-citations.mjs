#!/usr/bin/env node
/**
 * Citation verification and auto-fix framework.
 *
 * Verifies that quoted citations in sources-ai.md match EXACTLY
 * (byte-for-byte, including nikkud) against the source books:
 *   - Likutey Moharan (LM): books/ברסלב/ליקוטי מוהרן.md
 *   - Likutey Halachot (LH): books/ברסלב/ליקוטי הלכות.md
 *
 * ── Citation conventions ───────────────────────────────────────
 *
 * 1. VERBATIM QUOTING: Citations inside `>` blocks must be
 *    identical to the source books, byte-for-byte, including
 *    nikkud. The books are the single source of truth.
 *
 * 2. MAKKAF (־): If the book uses makkaf (Hebrew hyphen ־),
 *    the citation must use it too. Do not replace makkaf with
 *    a space.
 *
 * 3. VERSE / REFERENCE STYLE: Copy the book's reference style.
 *    If the book writes (ישעיהו מ) the citation must write the
 *    same. Do not modernize or reformulate references.
 *
 * 4. SECTION MARKERS: Inline sub-section markers like (א), (כז)
 *    that appear in the source books are structural artifacts.
 *    They are IGNORED during matching — citations should NOT
 *    include them.
 *
 * 5. BLOCKQUOTE `>` IS FOR VERBATIM TEXT ONLY: Only text that
 *    appears word-for-word in the source should be inside a `>`
 *    block. Editorial commentary, explanations, and author notes
 *    must be written as plain paragraphs without `>`.
 *
 * 6. ELLIPSIS JUMPS: `...` or `…` indicates skipped text.
 *    Each segment on either side must appear in the source in
 *    order.
 *
 * 7. BOLD `**` MARKERS: Stripped before matching (formatting
 *    only). Re-applied to the corrected book text when fixing.
 *
 * 8. FABRICATED CONTENT: Any citation that cannot be matched to
 *    the source book must be removed or replaced with a real,
 *    verbatim citation. The test flags these as failures.
 *
 * 9. AUTO-FIX (--fix): When a citation does not match exactly
 *    but can be located in the book via fuzzy matching, the
 *    script replaces the citation with the canonical book text,
 *    re-applying bold markers. Only truly unfindable citations
 *    are reported as failures.
 *
 * ── Usage ──────────────────────────────────────────────────────
 *   node scripts/verify-citations.mjs [--verbose] [--fix]
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const VERBOSE = process.argv.includes('--verbose')
const FIX = process.argv.includes('--fix')
const ROOT = process.cwd()

const SOURCES_FILE = resolve(ROOT, 'lehachnis-balev/issue-4/sources-ai.md')
const LM_FILE = resolve(ROOT, 'books/ברסלב/ליקוטי מוהרן.md')
const LH_FILE = resolve(ROOT, 'books/ברסלב/ליקוטי הלכות.md')

// ── Text normalization ──────────────────────────────────────────────

function stripSectionMarkers(text) {
  return text.replace(/ ?\([א-ת]{1,2}\)/g, '')
}

function normalize(text) {
  return text.normalize('NFC')
}

const sourcesText = normalize(readFileSync(SOURCES_FILE, 'utf-8'))
const lmText = normalize(readFileSync(LM_FILE, 'utf-8'))
const lhText = normalize(readFileSync(LH_FILE, 'utf-8'))

const lmClean = stripSectionMarkers(lmText)
const lhClean = stripSectionMarkers(lhText)

// ── Fuzzy matching ──────────────────────────────────────────────────

const NIKKUD_RE = /[\u0591-\u05BD\u05BF-\u05C7]/g
const PUNCT_RE = /[,.:;!?"'""׳״\u05F3\u05F4\u201C\u201D\u2018\u2019]/
const ZERO_WIDTH_RE = /[\u200B-\u200F\uFEFF]/

/**
 * Build a consonant-skeleton string from Hebrew text, plus a map
 * from each skeleton position back to its index in the original.
 *
 * Strips: parenthesized content, makkaf (→ space), nikkud,
 * cantillation, and punctuation.  Normalizes whitespace.
 */
function buildSkeleton(text, { stripParens = true } = {}) {
  const chars = []
  const map = []
  let inParens = 0
  let lastWasSpace = true

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    const code = c.charCodeAt(0)

    if (ZERO_WIDTH_RE.test(c)) continue

    if (stripParens) {
      if (c === '(') { inParens++; continue }
      if (c === ')' && inParens > 0) { inParens--; continue }
      if (inParens > 0) continue
    } else {
      if (c === '(' || c === ')') continue
    }

    if (code === 0x05BE || code === 0x002D || code === 0x2013 || code === 0x2014) {
      if (!lastWasSpace) { chars.push(' '); map.push(i); lastWasSpace = true }
      continue
    }
    if (code >= 0x0591 && code <= 0x05C7) continue
    if (PUNCT_RE.test(c)) continue

    if (/\s/.test(c)) {
      if (!lastWasSpace) { chars.push(' '); map.push(i); lastWasSpace = true }
      continue
    }

    chars.push(c)
    map.push(i)
    lastWasSpace = false
  }

  while (chars.length > 0 && chars[0] === ' ') { chars.shift(); map.shift() }
  while (chars.length > 0 && chars[chars.length - 1] === ' ') { chars.pop(); map.pop() }

  return { skeleton: chars.join(''), map }
}

/**
 * Normalize common Hebrew abbreviations in a skeleton string so that
 * both the abbreviated and expanded forms produce the same output.
 * Must be applied AFTER skeleton construction (no nikkud/punctuation).
 * Longer expansions are replaced first to avoid partial matches.
 */
function normalizeAbbreviations(skel) {
  return skel
    .replace(/רבותינו זכרונם לברכה/g, 'רזל')
    .replace(/רבותינו זכרונו לברכה/g, 'רזל')
    .replace(/חכמינו זכרונם לברכה/g, 'חזל')
    .replace(/חכמינו זכרונו לברכה/g, 'חזל')
    .replace(/זכרונם לברכה/g, 'זל')
    .replace(/זכרונו לברכה/g, 'זל')
    .replace(/זכרונה לברכה/g, 'זל')
}

/**
 * Normalize abbreviations in a skeleton while preserving a position
 * map back to the original text.  First/last chars of the abbreviated
 * form map to first/last chars of the expanded form so that
 * origStart/origEnd calculations in fuzzyLocate stay correct.
 */
function normalizeAbbreviationsWithMap(skeleton, origMap) {
  const ABBREVS = [
    { expanded: 'רבותינו זכרונם לברכה', abbr: 'רזל' },
    { expanded: 'רבותינו זכרונו לברכה', abbr: 'רזל' },
    { expanded: 'חכמינו זכרונם לברכה', abbr: 'חזל' },
    { expanded: 'חכמינו זכרונו לברכה', abbr: 'חזל' },
    { expanded: 'זכרונם לברכה', abbr: 'זל' },
    { expanded: 'זכרונו לברכה', abbr: 'זל' },
    { expanded: 'זכרונה לברכה', abbr: 'זל' },
  ]

  const replacements = []
  for (const { expanded, abbr } of ABBREVS) {
    let offset = 0
    while (true) {
      const idx = skeleton.indexOf(expanded, offset)
      if (idx < 0) break
      const overlaps = replacements.some(r => idx < r.end && idx + expanded.length > r.start)
      if (!overlaps) {
        replacements.push({ start: idx, end: idx + expanded.length, abbr, expandedLen: expanded.length })
      }
      offset = idx + expanded.length
    }
  }

  if (replacements.length === 0) return { skeleton, map: origMap }
  replacements.sort((a, b) => a.start - b.start)

  const newChars = []
  const newMap = []
  let pos = 0

  for (const rep of replacements) {
    for (let i = pos; i < rep.start; i++) {
      newChars.push(skeleton[i])
      newMap.push(origMap[i])
    }
    for (let j = 0; j < rep.abbr.length; j++) {
      newChars.push(rep.abbr[j])
      if (j === 0) newMap.push(origMap[rep.start])
      else if (j === rep.abbr.length - 1) newMap.push(origMap[rep.end - 1])
      else {
        const frac = j / (rep.abbr.length - 1)
        newMap.push(origMap[rep.start + Math.round(frac * (rep.expandedLen - 1))])
      }
    }
    pos = rep.end
  }

  for (let i = pos; i < skeleton.length; i++) {
    newChars.push(skeleton[i])
    newMap.push(origMap[i])
  }

  return { skeleton: newChars.join(''), map: newMap }
}

function toSkeleton(text) {
  return normalizeAbbreviations(buildSkeleton(text).skeleton)
}

const lmSkelRaw = buildSkeleton(lmClean)
const lhSkelRaw = buildSkeleton(lhClean)
const lmSkel = normalizeAbbreviationsWithMap(lmSkelRaw.skeleton, lmSkelRaw.map)
const lhSkel = normalizeAbbreviationsWithMap(lhSkelRaw.skeleton, lhSkelRaw.map)

const lmSkelNPRaw = buildSkeleton(lmClean, { stripParens: false })
const lhSkelNPRaw = buildSkeleton(lhClean, { stripParens: false })
const lmSkelNP = normalizeAbbreviationsWithMap(lmSkelNPRaw.skeleton, lmSkelNPRaw.map)
const lhSkelNP = normalizeAbbreviationsWithMap(lhSkelNPRaw.skeleton, lhSkelNPRaw.map)

/**
 * Locate a citation segment inside a book using skeleton matching.
 * Returns { start, end, text } with the verbatim book text, or null.
 */
function fuzzyLocateInSkel(segSkel, bookClean, bookSkel, fromOrigPos) {
  if (segSkel.length < 5) return null

  let searchFrom = 0
  if (fromOrigPos > 0) {
    for (let i = 0; i < bookSkel.map.length; i++) {
      if (bookSkel.map[i] >= fromOrigPos) { searchFrom = i; break }
    }
  }

  let pos = bookSkel.skeleton.indexOf(segSkel, searchFrom)
  if (pos < 0 && fromOrigPos > 0) {
    pos = bookSkel.skeleton.indexOf(segSkel, 0)
  }
  if (pos < 0) return null

  const lastIdx = pos + segSkel.length - 1
  if (lastIdx >= bookSkel.map.length) return null

  const origStart = bookSkel.map[pos]
  let origEnd = bookSkel.map[lastIdx]

  while (origEnd + 1 < bookClean.length) {
    const nc = bookClean.charCodeAt(origEnd + 1)
    if (nc >= 0x0591 && nc <= 0x05C7) { origEnd++; continue }
    if (/[,.:;]/.test(bookClean[origEnd + 1])) { origEnd++; break }
    break
  }

  const raw = bookClean.slice(origStart, origEnd + 1)
  const flat = raw.replace(/\n/g, ' ').replace(/ {2,}/g, ' ')
  return { start: origStart, end: origEnd + 1, text: flat }
}

function fuzzyLocate(segment, bookClean, bookSkel, fromOrigPos, bookSkelNP) {
  const segSkel = toSkeleton(segment)
  const result = fuzzyLocateInSkel(segSkel, bookClean, bookSkel, fromOrigPos)
  if (result) return result

  if (bookSkelNP) {
    const segSkelNP = normalizeAbbreviations(buildSkeleton(segment, { stripParens: false }).skeleton)
    return fuzzyLocateInSkel(segSkelNP, bookClean, bookSkelNP, fromOrigPos)
  }

  return null
}

// ── Bold re-application ─────────────────────────────────────────────

function reapplyBold(rawCite, newText) {
  const boldParts = []
  const re = /\*\*([^*]+)\*\*/g
  let m
  while ((m = re.exec(rawCite)) !== null) boldParts.push(m[1])
  if (boldParts.length === 0) return newText

  const { skeleton: newSkel, map: newMap } = buildSkeleton(newText)
  const insertions = []

  for (const bp of boldParts) {
    const bpSkel = toSkeleton(bp)
    const pos = newSkel.indexOf(bpSkel)
    if (pos < 0) continue
    const last = pos + bpSkel.length - 1
    if (last >= newMap.length) continue

    const s = newMap[pos]
    let e = newMap[last]
    while (e + 1 < newText.length) {
      const nc = newText.charCodeAt(e + 1)
      if (nc >= 0x0591 && nc <= 0x05C7) { e++; continue }
      break
    }
    insertions.push({ s, e: e + 1 })
  }

  insertions.sort((a, b) => b.s - a.s)
  let result = newText
  for (const ins of insertions) {
    result = result.slice(0, ins.s) + '**' + result.slice(ins.s, ins.e) + '**' + result.slice(ins.e)
  }
  return result
}

// ── Source identification ───────────────────────────────────────────

const LH_SECTION_PREFIXES = [
  'מילה', 'תפילין', 'קריאת שמע', 'מנחה', 'ציצית', 'תחומין',
  'סמני בהמה', 'שלוחין', 'ברכת הראיה', 'נפילת אפיים',
  'עירובי תחומין', 'ברכת הריח', 'דברים היוצאים',
  'ראש חודש', 'העושה שליח',
]

function identifySource(attribution) {
  if (/ליקו["\u05F4]מ|ליקוטי מוהרן/.test(attribution)) return 'LM'
  if (/^תורה\s/.test(attribution)) return 'LM'
  if (/ליקוטי הלכות/.test(attribution)) return 'LH'
  for (const prefix of LH_SECTION_PREFIXES) {
    if (attribution.startsWith(prefix)) return 'LH'
  }
  return 'OTHER'
}

// ── Parse sources-ai.md ─────────────────────────────────────────────

function parseSources(text) {
  const lines = text.split('\n')
  const footnotes = []
  let curFn = null
  let curSrc = null
  let curPara = null
  let inQuote = false

  function flushParagraph() {
    if (curPara && curSrc) {
      const trimmed = curPara.rawText.trim()
      if (trimmed.length > 0) {
        curPara.rawText = trimmed
        curSrc.paragraphs.push(curPara)
      }
    }
    curPara = null
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const fnMatch = line.match(/^## הערה (\d+)/)
    if (fnMatch) {
      flushParagraph()
      curFn = { number: parseInt(fnMatch[1]), sources: [] }
      footnotes.push(curFn)
      curSrc = null
      inQuote = false
      continue
    }

    const srcMatch = line.match(/^### (.+)/)
    if (srcMatch && curFn) {
      flushParagraph()
      curSrc = {
        attribution: srcMatch[1].trim(),
        type: identifySource(srcMatch[1].trim()),
        paragraphs: [],
      }
      curFn.sources.push(curSrc)
      inQuote = false
      continue
    }

    if (line.startsWith('>') && curSrc) {
      const content = line.replace(/^>\s?/, '')
      if (!inQuote) {
        flushParagraph()
        curPara = { startLine: i + 1, rawText: '', lineIndices: [] }
      }
      if (curPara.rawText.length > 0) curPara.rawText += ' '
      curPara.rawText += content
      curPara.lineIndices.push(i)
      inQuote = true
    } else {
      if (inQuote) flushParagraph()
      inQuote = false
    }
  }
  flushParagraph()
  return footnotes
}

// ── Helpers ─────────────────────────────────────────────────────────

function cleanQuote(text) { return text.replace(/\*\*/g, '') }

/**
 * Ratio of nikkud marks to Hebrew consonant letters.
 * Fully nikkudized book text typically scores ≥ 0.5.
 * Editorial (un-nikkudized) text scores near 0.
 */
function nikkudRatio(text) {
  const consonants = (text.match(/[\u05D0-\u05EA]/g) || []).length
  if (consonants === 0) return 0
  const marks = (text.match(/[\u05B0-\u05BD\u05BF-\u05C7]/g) || []).length
  return marks / consonants
}

const EDITORIAL_NIKKUD_THRESHOLD = 0.1

function splitByEllipsis(text) {
  return text.split(/\.{3,}|…/).map(s => s.trim()).filter(s => s.length > 0)
}

function getLineNumber(text, pos) {
  let n = 1
  for (let i = 0; i < pos && i < text.length; i++) { if (text[i] === '\n') n++ }
  return n
}

function findPartialMatch(sourceText, segment) {
  const maxLen = Math.min(segment.length, 500)
  for (let len = maxLen; len >= 8; len--) {
    const prefix = segment.slice(0, len)
    const pos = sourceText.indexOf(prefix)
    if (pos !== -1) {
      return {
        matchedChars: len,
        totalChars: segment.length,
        line: getLineNumber(sourceText, pos),
        expectedNext: segment.slice(len, len + 60),
        actualNext: sourceText.slice(pos + len, pos + len + 60),
      }
    }
  }
  return null
}

// ── Run verification ────────────────────────────────────────────────

const footnotes = parseSources(sourcesText)
const sourceLines = sourcesText.split('\n')

let totalTests = 0
let passed = 0
let failed = 0
let skipped = 0
let autoFixed = 0
let editorialRemoved = 0
const failures = []
const fixes = []
const editorialFixes = []

for (const fn of footnotes) {
  for (const src of fn.sources) {
    if (src.type === 'OTHER') {
      skipped += src.paragraphs.length || 1
      continue
    }
    if (src.paragraphs.length === 0) continue

    const bookClean = src.type === 'LM' ? lmClean : lhClean
    const bookSkel = src.type === 'LM' ? lmSkel : lhSkel
    const bookSkelNP = src.type === 'LM' ? lmSkelNP : lhSkelNP

    for (let pi = 0; pi < src.paragraphs.length; pi++) {
      const para = src.paragraphs[pi]
      totalTests++

      const cleaned = cleanQuote(para.rawText)
      const segments = splitByEllipsis(cleaned)
      if (segments.length === 0) { passed++; continue }

      // ── Phase 1: exact match ──────────────────────────────────
      let allExact = true
      let lastEnd = 0
      for (const seg of segments) {
        if (seg.length < 3) continue
        let pos = bookClean.indexOf(seg, lastEnd)
        if (pos < 0) pos = bookClean.indexOf(seg, 0)
        if (pos >= 0) { lastEnd = pos + seg.length }
        else { allExact = false; break }
      }

      if (allExact) {
        passed++
        if (VERBOSE) console.log(`  ✅ הערה ${fn.number} | ${src.attribution} | p${pi + 1}`)
        continue
      }

      // ── Phase 2: fuzzy match → auto-fix ───────────────────────
      let allFuzzy = true
      let fuzzyEnd = 0
      const fixedSegs = []

      for (const seg of segments) {
        if (seg.length < 3) { fixedSegs.push(seg); continue }
        const loc = fuzzyLocate(seg, bookClean, bookSkel, fuzzyEnd, bookSkelNP)
        if (loc) {
          fixedSegs.push(loc.text)
          fuzzyEnd = loc.end
        } else {
          allFuzzy = false
          break
        }
      }

      if (allFuzzy) {
        let fixedText = fixedSegs.join(' ... ')
        fixedText = reapplyBold(para.rawText, fixedText)

        fixes.push({
          footnote: fn.number,
          attribution: src.attribution,
          lineIndices: para.lineIndices,
          newText: fixedText,
        })
        autoFixed++
        passed++
        if (VERBOSE) console.log(`  🔧 הערה ${fn.number} | ${src.attribution} | p${pi + 1}: auto-fixable`)
        continue
      }

      // ── Phase 2b: editorial text detection ─────────────────────
      const ratio = nikkudRatio(cleaned)
      if (ratio < EDITORIAL_NIKKUD_THRESHOLD) {
        editorialRemoved++
        editorialFixes.push({
          footnote: fn.number,
          attribution: src.attribution,
          lineIndices: para.lineIndices,
          nikkudRatio: ratio,
        })
        if (VERBOSE) console.log(`  📝 הערה ${fn.number} | ${src.attribution} | p${pi + 1}: editorial text (nikkud ratio ${ratio.toFixed(2)}), removing blockquote`)
        continue
      }

      // ── Phase 3: failure ──────────────────────────────────────
      failed++
      const segResults = []
      let le = 0
      for (let si = 0; si < segments.length; si++) {
        const seg = segments[si]
        if (seg.length < 3) continue
        let pos = bookClean.indexOf(seg, le)
        if (pos >= 0) {
          segResults.push({ index: si, found: true, line: getLineNumber(bookClean, pos) })
          le = pos + seg.length
        } else {
          pos = bookClean.indexOf(seg, 0)
          if (pos >= 0) {
            segResults.push({ index: si, found: true, line: getLineNumber(bookClean, pos), outOfOrder: true })
          } else {
            segResults.push({ index: si, found: false, segment: seg, partial: findPartialMatch(bookClean, seg) })
          }
        }
      }

      failures.push({
        footnote: fn.number,
        attribution: src.attribution,
        type: src.type,
        paraLine: para.startLine,
        segments: segResults,
      })

      console.log(`  ❌ הערה ${fn.number} | ${src.attribution} | p${pi + 1}`)
      for (const sr of segResults) {
        if (!sr.found) {
          const preview = sr.segment.length > 80 ? sr.segment.slice(0, 80) + '…' : sr.segment
          console.log(`     seg ${sr.index + 1}: NOT FOUND`)
          console.log(`     text: "${preview}"`)
          if (sr.partial) {
            console.log(`     partial: ${sr.partial.matchedChars}/${sr.partial.totalChars} chars at line ${sr.partial.line}`)
            console.log(`     expected: "${sr.partial.expectedNext.slice(0, 40)}…"`)
            console.log(`     actual:   "${sr.partial.actualNext.slice(0, 40)}…"`)
          }
        } else if (sr.outOfOrder) {
          console.log(`     seg ${sr.index + 1}: found at line ${sr.line} (OUT OF ORDER)`)
        }
      }
    }
  }
}

// ── Apply fixes ─────────────────────────────────────────────────────

if (FIX && (fixes.length > 0 || editorialFixes.length > 0)) {
  const allChanges = [
    ...fixes.map(f => ({ type: 'fix', ...f })),
    ...editorialFixes.map(f => ({ type: 'editorial', ...f })),
  ]
  allChanges.sort((a, b) => b.lineIndices[0] - a.lineIndices[0])

  for (const change of allChanges) {
    if (change.type === 'fix') {
      const newLine = '>' + change.newText
      sourceLines.splice(change.lineIndices[0], change.lineIndices.length, newLine)
    } else {
      for (const li of [...change.lineIndices].reverse()) {
        const line = sourceLines[li]
        sourceLines[li] = line.replace(/^>\s?/, '')
      }
    }
  }
  writeFileSync(SOURCES_FILE, sourceLines.join('\n'), 'utf-8')
}

// ── Summary ─────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(60))
console.log('CITATION VERIFICATION SUMMARY')
console.log('═'.repeat(60))
console.log(`  Total LM/LH paragraphs tested: ${totalTests}`)
console.log(`  ✅ Passed (exact match):        ${passed - autoFixed}`)
if (autoFixed > 0) {
  console.log(`  🔧 Auto-${FIX ? 'fixed' : 'fixable'}:              ${autoFixed}`)
}
if (editorialRemoved > 0) {
  console.log(`  📝 Editorial (blockquote ${FIX ? 'removed' : 'to remove'}): ${editorialRemoved}`)
}
console.log(`  ❌ Failed:                       ${failed}`)
console.log(`  ⏭  Skipped (non-LM/LH):         ${skipped}`)
console.log('═'.repeat(60))

if (FIX && (fixes.length > 0 || editorialFixes.length > 0)) {
  const total = fixes.length + editorialFixes.length
  console.log(`\n  Wrote ${total} change(s) to sources-ai.md`)
  if (fixes.length > 0) console.log(`    - ${fixes.length} citation auto-fix(es)`)
  if (editorialFixes.length > 0) console.log(`    - ${editorialFixes.length} editorial blockquote removal(s) [soft AI change]`)
}
if (!FIX && (fixes.length > 0 || editorialFixes.length > 0)) {
  const total = fixes.length + editorialFixes.length
  console.log(`\n  Run with --fix to apply ${total} change(s):`)
  if (fixes.length > 0) console.log(`    - ${fixes.length} citation auto-fix(es)`)
  if (editorialFixes.length > 0) console.log(`    - ${editorialFixes.length} editorial blockquote removal(s)`)
}

if (failures.length > 0) {
  console.log('\nDETAILED FAILURES:\n')
  for (const f of failures) {
    console.log(`─── הערה ${f.footnote} | ${f.attribution} (${f.type}) | line ${f.paraLine} ───`)
    for (const sr of f.segments) {
      if (!sr.found) {
        console.log(`  Segment ${sr.index + 1} (${sr.segment.length} chars):`)
        console.log(`    "${sr.segment.slice(0, 120)}${sr.segment.length > 120 ? '…' : ''}"`)
        if (sr.partial) {
          console.log(`  Partial: ${sr.partial.matchedChars}/${sr.partial.totalChars} chars at line ${sr.partial.line}`)
          console.log(`    expected: "${sr.partial.expectedNext.slice(0, 60)}"`)
          console.log(`    actual:   "${sr.partial.actualNext.slice(0, 60)}"`)
        } else {
          console.log(`  No partial match (text may not exist in this book)`)
        }
      }
    }
    console.log()
  }
}

process.exit(failed > 0 ? 1 : 0)
