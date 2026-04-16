# Article Production Pipeline

Turn Hebrew concept searches into article briefs for The Verge of Redemption.

```
mine-concept.mjs → cluster-findings.mjs → brief-cluster.mjs → queue.mjs
                          ↑ David reviews clusters
```

## Quick start

```bash
cd torah-writing

# 1. Mine a concept (no LLM, pure search)
node scripts/mine-concept.mjs "מדמה" --pattern "*מ*ד*מ*" --slug medameh

# 2. Cluster findings into article themes (LLM)
node scripts/cluster-findings.mjs medameh

# 3. Brief a cluster (LLM)
node scripts/brief-cluster.mjs medameh --cluster medameh-corruption

# 4. See all briefs
node scripts/queue.mjs
```

## Scripts

### mine-concept.mjs

Search books and extracted claims for a Hebrew concept. No LLM.

```
node scripts/mine-concept.mjs <term> [options]

Options:
  --pattern <pat>   Hebrew search pattern (wildcards: * = skip, + = adjacent)
  --slug <name>     Output directory name (auto-generated if omitted)
  --books-dir <dir> Book directory to search (default: books/breslov)
  --context <n>     Lines of context around book hits (default: 3)
```

Output: `output/pipeline/{slug}/01-mine.json`

The JSON contains a `findings` array. Each finding is either:
- `type: "book"` - raw text hit from a source book, with file, line, matched text, and surrounding context
- `type: "claim"` - structured claim from the claims index, with source, concepts, and claim text

### cluster-findings.mjs

Group findings into article-worthy themes. Each cluster = one potential article.

```
node scripts/cluster-findings.mjs <slug> [options]

Options:
  --batch-size <n>  Findings per LLM batch (default: 40)
  --model <name>    Model for agent-pool
  --dry-run         Show prompt without calling LLM
```

Input: `output/pipeline/{slug}/01-mine.json`
Output: `output/pipeline/{slug}/02-clusters.json` + `02-clusters.md`

Each cluster has: `id`, `title`, `thesis`, `tension`, `domain`, `findingIds[]`.

If the concept has many findings, they're sent in batches and then merged to deduplicate overlapping themes.

### brief-cluster.mjs

Produce an article brief from a cluster.

```
node scripts/brief-cluster.mjs <slug> --cluster <id> [options]
node scripts/brief-cluster.mjs <slug> --all [options]

Options:
  --cluster <id>    Single cluster to brief
  --all             Brief all clusters
  --resume          Skip clusters that already have briefs
  --model <name>    Model for agent-pool
  --dry-run         Show prompt without calling LLM
```

Input: `02-clusters.json` + `01-mine.json`
Output: `output/pipeline/{slug}/briefs/{cluster-id}.md`

Each brief contains:
1. **The Problem** - psychological phenomenon in accessible terms
2. **Torah Framework** - Hebrew quotes with source attribution
3. **Research Directions** - Google Scholar terms, relevant researchers, phenomena
4. **Movie Suggestions** - 3 unused movies that could open the article
5. **Overlap Assessment** - what existing articles cover similar ground

Briefs are written with YAML frontmatter (`status: READY`). Movies are checked against `movies.md`, articles against `ARTICLES.md`.

### queue.mjs

Dashboard of all briefs in the pipeline. No LLM.

```
node scripts/queue.mjs
```

Shows a color-coded table: concept, cluster, title, status. Statuses:
- **MINED** - concept searched, no clusters yet
- **CLUSTERED** - clusters exist, no briefs yet
- **READY** - brief written, awaiting selection
- **SELECTED** - David picked this one to write
- **WRITTEN** - article produced
- **SKIPPED** - not worth pursuing

## Shared modules

### lib/claims-index.js

Loads extracted claims from `output/claims/` directories. Builds a concept-to-claims reverse index with nikkud stripping and final letter normalization. Skips content-addressed stubs (files starting with `hash:`).

### lib/agent-pool.js

Adaptive-concurrency LLM pool. Wraps the `gemini` CLI. Exports `createPool` and `runAgent`.

## Prompt templates

- `prompts/cluster-concept.txt` - clustering prompt (placeholders: `{concept}`, `{findings}`)
- `prompts/brief-cluster.txt` - briefing prompt (placeholders: `{concept}`, `{title}`, `{thesis}`, `{tension}`, `{domain}`, `{findings}`, `{usedMovies}`, `{existingArticles}`)

## Data flow

```
books/breslov/*.md ──→ hebrew-search ──→ book findings ──┐
                                                          ├──→ 01-mine.json
output/claims/**/*.json ──→ claims-index ──→ claim hits ──┘
                                                              ↓
                                                     02-clusters.json
                                                              ↓
                                                     briefs/{id}.md
```

## Current state

| Concept  | Findings | Clusters | Briefs |
|----------|----------|----------|--------|
| medameh  | 3,220    | -        | -      |

## Notes

- Book data lives on Google Drive. Pull with: `rclone copy gdrive:torah-writing/books/breslov/ books/breslov/`
- Most claims files in `claims/breslov/` are content-addressed stubs. Real claim data is in `output/claims/likutei-halachot/` (33 claims across 8 files).
- The pipeline is designed to be run step-by-step with David reviewing between stages. Don't skip the review step after clustering.
