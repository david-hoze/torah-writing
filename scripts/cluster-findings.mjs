#!/usr/bin/env node
/**
 * Cluster mined findings into article themes using LLM.
 *
 * Usage:
 *   node scripts/cluster-findings.mjs <slug> [--batch-size N] [--model NAME] [--dry-run]
 *
 * Examples:
 *   node scripts/cluster-findings.mjs medameh
 *   node scripts/cluster-findings.mjs medameh --batch-size 40 --model gemini-2.5-flash
 *
 * Input:  output/pipeline/{slug}/01-mine.json
 * Output: output/pipeline/{slug}/02-clusters.json + 02-clusters.md
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve, join } from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { createPool, runAgent, extractJSONArray } = require('./lib/agent-pool')

// ── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
if (args.length === 0 || args.includes('--help')) {
  console.log(`Usage: node scripts/cluster-findings.mjs <slug> [options]`)
  console.log(`  --batch-size N   Findings per LLM batch (default: 40)`)
  console.log(`  --model NAME     Model name for agent`)
  console.log(`  --dry-run        Show what would be sent, don't call LLM`)
  process.exit(0)
}

function flag(name, fallback) {
  const i = args.indexOf('--' + name)
  if (i === -1) return fallback
  if (typeof fallback === 'boolean') return true
  return args[i + 1]
}

const slug = args.find(a => !a.startsWith('--'))
const batchSize = Number(flag('batch-size', '40'))
const model = flag('model', '')
const dryRun = flag('dry-run', false)

const rootDir = resolve(process.cwd())
const pipeDir = resolve(rootDir, 'output/pipeline', slug)
const minePath = join(pipeDir, '01-mine.json')
const promptPath = resolve(rootDir, 'scripts/prompts/cluster-concept.txt')

// ── Load data ────────────────────────────────────────────────────────────────

let mineData
try {
  mineData = JSON.parse(readFileSync(minePath, 'utf-8'))
} catch (e) {
  console.error(`Error: Cannot read ${minePath}`)
  console.error(`Run mine-concept.mjs first.`)
  process.exit(1)
}

const promptTemplate = readFileSync(promptPath, 'utf-8')
const findings = mineData.findings
const concept = mineData.concept

console.log(`Clustering ${findings.length} findings for "${concept}" (slug: ${slug})`)

// ── Prepare findings for LLM (compact format) ───────────────────────────────

function formatFinding(f, idx) {
  if (f.type === 'book') {
    return `[${idx}] BOOK ${f.file}:${f.line} matched="${f.matched}"\n${f.context}`
  } else {
    return `[${idx}] CLAIM source="${f.source}" concepts=[${f.concepts.join(', ')}]\n${f.claim}`
  }
}

// ── Batch and send ───────────────────────────────────────────────────────────

async function clusterBatch(batchFindings, batchOffset) {
  const formatted = batchFindings.map((f, i) => formatFinding(f, batchOffset + i)).join('\n\n')
  const prompt = promptTemplate
    .replace(/\{concept\}/g, concept)
    .replace('{findings}', formatted)

  if (dryRun) {
    console.log(`\n--- Batch at offset ${batchOffset} (${batchFindings.length} findings) ---`)
    console.log(`Prompt length: ${prompt.length} chars`)
    console.log(prompt.slice(0, 500) + '...')
    return []
  }

  const raw = await runAgent(prompt, `cluster-${slug}-${batchOffset}`, { model })
  const clusters = extractJSONArray(raw)
  if (!clusters) {
    console.error(`Warning: Failed to parse JSON from batch at offset ${batchOffset}`)
    return []
  }
  return clusters
}

async function main() {
  const batches = []
  for (let i = 0; i < findings.length; i += batchSize) {
    batches.push({ offset: i, findings: findings.slice(i, i + batchSize) })
  }

  console.log(`Splitting into ${batches.length} batch(es) of up to ${batchSize}`)

  if (dryRun) {
    for (const batch of batches) {
      await clusterBatch(batch.findings, batch.offset)
    }
    console.log('\nDry run complete.')
    return
  }

  // Run batches through the pool
  const pool = createPool({ maxConcurrency: 3 })
  const batchResults = await pool.run(batches, async (batch) => {
    return clusterBatch(batch.findings, batch.offset)
  })

  // Merge clusters from all batches
  const allClusters = batchResults.flat()
  console.log(`\nGot ${allClusters.length} clusters from ${batches.length} batch(es)`)

  // If multiple batches, do a merge pass to deduplicate overlapping themes
  let finalClusters = allClusters
  if (batches.length > 1 && allClusters.length > 0) {
    console.log(`Multiple batches detected - merging overlapping themes...`)
    const mergePrompt = `You received ${allClusters.length} article theme clusters from processing Hebrew Torah findings about "${concept}" in batches. Some clusters may overlap or cover the same theme from different batches.

Merge overlapping clusters: combine their findingIds, keep the better title/thesis, and produce a final deduplicated list. If two clusters are truly distinct, keep both.

Input clusters:
${JSON.stringify(allClusters, null, 2)}

Return a JSON array of merged clusters in the same format (id, title, thesis, tension, domain, findingIds, keyPassages).`

    const raw = await runAgent(mergePrompt, `merge-${slug}`, { model })
    const merged = extractJSONArray(raw)
    if (merged && merged.length > 0) {
      finalClusters = merged
      console.log(`Merged to ${finalClusters.length} distinct clusters`)
    }
  }

  // ── Write output ─────────────────────────────────────────────────────────

  const output = {
    concept,
    slug,
    timestamp: new Date().toISOString(),
    totalFindings: findings.length,
    clusters: finalClusters,
  }

  const jsonPath = join(pipeDir, '02-clusters.json')
  writeFileSync(jsonPath, JSON.stringify(output, null, 2), 'utf-8')

  // Readable markdown
  let md = `# Clusters: ${concept}\n\n`
  md += `*${finalClusters.length} themes from ${findings.length} findings*\n\n`

  for (const c of finalClusters) {
    md += `## ${c.title}\n\n`
    md += `**ID:** ${c.id}\n`
    md += `**Thesis:** ${c.thesis}\n`
    md += `**Tension:** ${c.tension}\n`
    md += `**Domain:** ${c.domain}\n`
    md += `**Findings:** ${c.findingIds ? c.findingIds.length : '?'} sources\n\n`
    if (c.keyPassages) {
      for (const p of c.keyPassages) {
        md += `> ${p}\n\n`
      }
    }
    md += '---\n\n'
  }

  const mdPath = join(pipeDir, '02-clusters.md')
  writeFileSync(mdPath, md, 'utf-8')

  console.log(`\nOutput:`)
  console.log(`  ${jsonPath}`)
  console.log(`  ${mdPath}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
