#!/usr/bin/env node
/**
 * Dashboard of all article briefs in the pipeline.
 *
 * Usage:
 *   node scripts/queue.mjs
 *
 * Scans output/pipeline/{concept}/briefs/{cluster}.md and prints a status table.
 * Status is read from YAML frontmatter (status: READY/SELECTED/WRITTEN/SKIPPED).
 */

import { readdirSync, readFileSync, statSync } from 'fs'
import { resolve, join, basename } from 'path'

const rootDir = resolve(process.cwd())
const pipelineDir = resolve(rootDir, 'output/pipeline')

// ── Scan pipeline ────────────────────────────────────────────────────────────

let concepts
try {
  concepts = readdirSync(pipelineDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort()
} catch {
  console.log('No pipeline data found. Run mine-concept.mjs first.')
  process.exit(0)
}

if (concepts.length === 0) {
  console.log('No pipeline data found.')
  process.exit(0)
}

// ── Collect briefs ───────────────────────────────────────────────────────────

const rows = []

for (const concept of concepts) {
  const conceptDir = join(pipelineDir, concept)
  const briefsDir = join(conceptDir, 'briefs')

  // Check pipeline stage
  const hasMine = safeExists(join(conceptDir, '01-mine.json'))
  const hasClusters = safeExists(join(conceptDir, '02-clusters.json'))

  let briefs = []
  try {
    briefs = readdirSync(briefsDir)
      .filter(f => f.endsWith('.md'))
      .sort()
  } catch {}

  if (briefs.length === 0) {
    // Show concept status even without briefs
    const stage = hasClusters ? 'CLUSTERED' : hasMine ? 'MINED' : '?'
    rows.push({ concept, cluster: '-', title: '-', status: stage })
    continue
  }

  for (const brief of briefs) {
    const content = readFileSync(join(briefsDir, brief), 'utf-8')
    const fm = parseFrontmatter(content)
    rows.push({
      concept,
      cluster: basename(brief, '.md'),
      title: fm.title || '(untitled)',
      status: fm.status || 'READY',
    })
  }
}

// ── Print table ──────────────────────────────────────────────────────────────

if (rows.length === 0) {
  console.log('No briefs yet. Run the pipeline: mine → cluster → brief')
  process.exit(0)
}

// Column widths
const cols = {
  concept: Math.max(8, ...rows.map(r => r.concept.length)),
  cluster: Math.max(8, ...rows.map(r => r.cluster.length)),
  title: Math.min(50, Math.max(6, ...rows.map(r => r.title.length))),
  status: Math.max(8, ...rows.map(r => r.status.length)),
}

const header = [
  'CONCEPT'.padEnd(cols.concept),
  'CLUSTER'.padEnd(cols.cluster),
  'TITLE'.padEnd(cols.title),
  'STATUS'.padEnd(cols.status),
].join('  ')

console.log(header)
console.log('-'.repeat(header.length))

for (const r of rows) {
  const title = r.title.length > cols.title ? r.title.slice(0, cols.title - 1) + '\u2026' : r.title
  console.log([
    r.concept.padEnd(cols.concept),
    r.cluster.padEnd(cols.cluster),
    title.padEnd(cols.title),
    statusColor(r.status),
  ].join('  '))
}

// Summary
const byStatus = {}
for (const r of rows) {
  byStatus[r.status] = (byStatus[r.status] || 0) + 1
}
console.log(`\n${rows.length} total: ${Object.entries(byStatus).map(([k, v]) => `${v} ${k}`).join(', ')}`)

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeExists(p) {
  try { statSync(p); return true } catch { return false }
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  const fm = {}
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':')
    if (key && rest.length) fm[key.trim()] = rest.join(':').trim()
  }
  return fm
}

function statusColor(status) {
  const colors = {
    READY: '\x1b[33m',    // yellow
    SELECTED: '\x1b[36m', // cyan
    WRITTEN: '\x1b[32m',  // green
    SKIPPED: '\x1b[90m',  // gray
    MINED: '\x1b[35m',    // magenta
    CLUSTERED: '\x1b[34m', // blue
  }
  const c = colors[status] || ''
  return c ? `${c}${status}\x1b[0m` : status
}
