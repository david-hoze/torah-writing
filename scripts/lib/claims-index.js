// Claims index: loads all extracted claims and builds a concept → claims reverse index.
//
// Data sources (tried in order):
//   1. claims/breslov/*.json - merged flat arrays (if they're real JSON, not stubs)
//   2. output/claims/{book}/*.json - individual section files with { claims: [...] }
//
// Usage:
//   const { loadAllClaims, buildConceptIndex, searchConcept } = require('./claims-index');
//   const claims = loadAllClaims();
//   const index = buildConceptIndex(claims);
//   const matches = searchConcept(index, 'מדמה');

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const CLAIMS_BRESLOV = path.join(ROOT, 'claims/breslov')
const OUTPUT_CLAIMS = path.join(ROOT, 'output/claims')

// ── Nikkud stripping ─────────────────────────────────────────────────────────

const NIKUD_REGEX = /[\u0591-\u05C7\u05F0-\u05F4]/g

// Final-letter interchangeability for matching
const FINAL_MAP = {
  '\u05DD': '\u05DE', // ם → מ
  '\u05DF': '\u05E0', // ן → נ
  '\u05E5': '\u05E6', // ץ → צ
  '\u05E3': '\u05E4', // ף → פ
  '\u05DA': '\u05DB', // ך → כ
}

function normalize(text) {
  let s = text.replace(NIKUD_REGEX, '')
  for (const [final, normal] of Object.entries(FINAL_MAP)) {
    s = s.replaceAll(final, normal)
  }
  return s
}

// ── Load claims from a single JSON file ──────────────────────────────────────

function tryLoadJSON(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    // Skip content-addressed stubs (hash: md5:... / size: ...)
    if (raw.startsWith('hash:') || raw.startsWith('size:')) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function extractClaims(data, sourceFile) {
  // Flat array of claims: [{ claim, type, concepts, source }, ...]
  if (Array.isArray(data)) {
    return data.map(c => ({
      claim: c.claim || '',
      type: c.type || '',
      concepts: c.concepts || [],
      source: c.source || sourceFile,
    }))
  }

  // Wrapped object with .claims array: { index, source, claims: [...] }
  if (data && Array.isArray(data.claims)) {
    return data.claims.map(c => ({
      claim: c.claim || '',
      type: c.type || '',
      concepts: c.concepts || [],
      source: data.source || sourceFile,
    }))
  }

  return []
}

// ── Walk directory for JSON files ────────────────────────────────────────────

function walkJSON(dir) {
  const results = []
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) results.push(...walkJSON(full))
      else if (entry.name.endsWith('.json')) results.push(full)
    }
  } catch {}
  return results
}

// ── Load all claims ──────────────────────────────────────────────────────────

function loadAllClaims() {
  const allClaims = []
  const loaded = new Set()

  // Source 1: claims/breslov/*.json (merged flat arrays)
  for (const file of walkJSON(CLAIMS_BRESLOV)) {
    const data = tryLoadJSON(file)
    if (!data) continue
    const claims = extractClaims(data, path.basename(file, '.json'))
    if (claims.length > 0) {
      loaded.add(path.basename(file, '.json'))
      allClaims.push(...claims)
    }
  }

  // Source 2: output/claims/{book}/*.json (individual section files)
  try {
    for (const bookDir of fs.readdirSync(OUTPUT_CLAIMS, { withFileTypes: true })) {
      if (!bookDir.isDirectory()) continue
      if (loaded.has(bookDir.name)) continue // already loaded from merged
      const bookPath = path.join(OUTPUT_CLAIMS, bookDir.name)
      for (const file of walkJSON(bookPath)) {
        const data = tryLoadJSON(file)
        if (!data) continue
        const claims = extractClaims(data, bookDir.name)
        allClaims.push(...claims)
      }
    }
  } catch {}

  return allClaims
}

// ── Build concept → claims reverse index ─────────────────────────────────────

function buildConceptIndex(claims) {
  const index = new Map()
  for (let i = 0; i < claims.length; i++) {
    const claim = claims[i]
    for (const concept of claim.concepts) {
      const key = normalize(concept)
      if (!index.has(key)) index.set(key, [])
      index.get(key).push(i)
    }
  }
  return index
}

// ── Search for a concept (substring + nikkud-stripped) ────────────────────────

function searchConcept(index, claims, term) {
  const normTerm = normalize(term)
  const matchedIndices = new Set()

  for (const [key, indices] of index.entries()) {
    if (key.includes(normTerm) || normTerm.includes(key)) {
      for (const i of indices) matchedIndices.add(i)
    }
  }

  return [...matchedIndices].map(i => ({
    ...claims[i],
    _index: i,
    _matchType: 'concept',
  }))
}

// ── Search claim text itself ─────────────────────────────────────────────────

function searchClaimText(claims, term) {
  const normTerm = normalize(term)
  const results = []
  for (let i = 0; i < claims.length; i++) {
    if (normalize(claims[i].claim).includes(normTerm)) {
      results.push({ ...claims[i], _index: i, _matchType: 'text' })
    }
  }
  return results
}

module.exports = { loadAllClaims, buildConceptIndex, searchConcept, searchClaimText, normalize }
