#!/usr/bin/env node
/**
 * Produce an article brief from a cluster of findings.
 *
 * Usage:
 *   node scripts/brief-cluster.mjs <slug> --cluster <cluster-id> [--model NAME] [--dry-run]
 *   node scripts/brief-cluster.mjs <slug> --all [--model NAME]
 *
 * Examples:
 *   node scripts/brief-cluster.mjs medameh --cluster medameh-corruption
 *   node scripts/brief-cluster.mjs medameh --all
 *
 * Input:  output/pipeline/{slug}/02-clusters.json + 01-mine.json
 * Output: output/pipeline/{slug}/briefs/{cluster-id}.md
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, join } from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { createPool, runAgent } = require('./lib/agent-pool')

// ── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
if (args.length === 0 || args.includes('--help')) {
  console.log(`Usage: node scripts/brief-cluster.mjs <slug> --cluster <id> [options]`)
  console.log(`       node scripts/brief-cluster.mjs <slug> --all`)
  console.log(`  --cluster <id>   Cluster ID to brief`)
  console.log(`  --all            Brief all clusters`)
  console.log(`  --model NAME     Model name for agent`)
  console.log(`  --dry-run        Show prompt, don't call LLM`)
  console.log(`  --resume         Skip clusters that already have briefs`)
  process.exit(0)
}

function flag(name, fallback) {
  const i = args.indexOf('--' + name)
  if (i === -1) return fallback
  if (typeof fallback === 'boolean') return true
  return args[i + 1]
}

const slug = args.find(a => !a.startsWith('--'))
const clusterId = flag('cluster', null)
const briefAll = flag('all', false)
const model = flag('model', '')
const dryRun = flag('dry-run', false)
const resume = flag('resume', false)

if (!clusterId && !briefAll) {
  console.error('Error: specify --cluster <id> or --all')
  process.exit(1)
}

const rootDir = resolve(process.cwd())
const pipeDir = resolve(rootDir, 'output/pipeline', slug)
const briefsDir = join(pipeDir, 'briefs')
const promptPath = resolve(rootDir, 'scripts/prompts/brief-cluster.txt')

// ── Load data ────────────────────────────────────────────────────────────────

let mineData, clusterData
try {
  mineData = JSON.parse(readFileSync(join(pipeDir, '01-mine.json'), 'utf-8'))
  clusterData = JSON.parse(readFileSync(join(pipeDir, '02-clusters.json'), 'utf-8'))
} catch (e) {
  console.error(`Error: Cannot read pipeline files from ${pipeDir}`)
  console.error(`Run mine-concept.mjs and cluster-findings.mjs first.`)
  process.exit(1)
}

const promptTemplate = readFileSync(promptPath, 'utf-8')
const findings = mineData.findings
const concept = mineData.concept

// Load movies list (used movies)
let usedMovies = ''
try {
  const moviesPath = resolve(rootDir, '..', 'movies.md')
  usedMovies = readFileSync(moviesPath, 'utf-8')
    .split('\n')
    .filter(l => l.startsWith('**'))
    .map(l => l.match(/^\*\*(.+?)\*\*/)?.[1] || '')
    .filter(Boolean)
    .join(', ')
} catch {}

// Load articles index
let existingArticles = ''
try {
  const articlesPath = resolve(rootDir, '..', 'ARTICLES.md')
  existingArticles = readFileSync(articlesPath, 'utf-8')
} catch {}

// ── Format findings for a cluster ────────────────────────────────────────────

function formatFinding(f, idx) {
  if (f.type === 'book') {
    return `[${idx}] BOOK ${f.file}:${f.line}\nMatched: ${f.matched}\n${f.context}`
  } else {
    return `[${idx}] CLAIM (${f.source})\nConcepts: ${f.concepts.join(', ')}\n${f.claim}`
  }
}

// ── Brief one cluster ────────────────────────────────────────────────────────

async function briefCluster(cluster) {
  const clusterFindings = (cluster.findingIds || [])
    .filter(i => i >= 0 && i < findings.length)
    .map(i => formatFinding(findings[i], i))
    .join('\n\n')

  const prompt = promptTemplate
    .replace(/\{concept\}/g, concept)
    .replace('{title}', cluster.title || '')
    .replace('{thesis}', cluster.thesis || '')
    .replace('{tension}', cluster.tension || '')
    .replace('{domain}', cluster.domain || '')
    .replace('{findings}', clusterFindings)
    .replace('{usedMovies}', usedMovies)
    .replace('{existingArticles}', existingArticles)

  if (dryRun) {
    console.log(`\n--- Cluster: ${cluster.id} ---`)
    console.log(`Prompt length: ${prompt.length} chars`)
    console.log(`Findings: ${(cluster.findingIds || []).length}`)
    console.log(prompt.slice(0, 800) + '...')
    return null
  }

  console.log(`  Briefing "${cluster.title}" (${(cluster.findingIds || []).length} findings)...`)
  const raw = await runAgent(prompt, `brief-${slug}-${cluster.id}`, { model })

  // Write brief
  mkdirSync(briefsDir, { recursive: true })
  const outPath = join(briefsDir, `${cluster.id}.md`)

  let md = `---\nconcept: ${concept}\ncluster: ${cluster.id}\ntitle: ${cluster.title}\nstatus: READY\n---\n\n`
  md += `# ${cluster.title}\n\n`
  md += `**Thesis:** ${cluster.thesis}\n`
  md += `**Tension:** ${cluster.tension}\n`
  md += `**Domain:** ${cluster.domain}\n`
  md += `**Findings:** ${(cluster.findingIds || []).length} sources\n\n---\n\n`
  md += raw

  writeFileSync(outPath, md, 'utf-8')
  console.log(`  → ${outPath}`)
  return outPath
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const clusters = clusterData.clusters || []

  let targets
  if (briefAll) {
    targets = clusters
    if (resume) {
      targets = targets.filter(c => {
        const briefPath = join(briefsDir, `${c.id}.md`)
        return !existsSync(briefPath)
      })
    }
    console.log(`Briefing ${targets.length} of ${clusters.length} clusters for "${concept}"`)
  } else {
    const target = clusters.find(c => c.id === clusterId)
    if (!target) {
      console.error(`Error: cluster "${clusterId}" not found`)
      console.error(`Available: ${clusters.map(c => c.id).join(', ')}`)
      process.exit(1)
    }
    targets = [target]
  }

  if (dryRun) {
    for (const c of targets) await briefCluster(c)
    console.log('\nDry run complete.')
    return
  }

  if (targets.length === 1) {
    await briefCluster(targets[0])
  } else {
    // Multiple clusters: use pool
    const pool = createPool({ maxConcurrency: 2 })
    await pool.run(targets, async (cluster) => briefCluster(cluster))
  }

  console.log(`\nDone. Briefs in ${briefsDir}/`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
