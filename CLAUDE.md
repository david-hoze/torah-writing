# CLAUDE.md

Personal Torah / Hebrew-writing repository, also used as an Obsidian vault
(`.obsidian/`). Most content is Hebrew Markdown, written right-to-left. A few
folders are tooling: static-site generators (`sites/`) and processing scripts
(`scripts/`).

## Folder structure

### Static sites — `sites/`
Each subfolder is a self-contained generator that turns a content folder of
Markdown into a static site, deployed to Cloudflare Pages by a workflow in
`.github/workflows/`. The generated `site/` output is gitignored; CI rebuilds it
on push.

| Site dir | Content source | Pages project / URL | Workflow |
|---|---|---|---|
| `sites/taaluma-site/` | `uman-rosh-hashana/taaluma/` (`taaluma-N.md` chapters) | `taaluma` → https://taaluma.pages.dev | `deploy.yml` |
| `sites/hagut-site/` | `hagut/` (one `.md` per essay) | `hagut` → https://hagut.pages.dev | `deploy-hagut.yml` |
| `sites/short-stories-site/` | `short-stories/` (one `.md` per story) | `short-stories` → https://short-stories.pages.dev | `deploy-short-stories.yml` |

Each generator is a single `build.py` plus a `style.css` (shared visual theme,
same CSS variable palette). Build locally with:

```
python3 sites/<name>-site/build.py [SOURCE_DIR] [OUTPUT_DIR]
```

Requires the `markdown` Python module (`python3-markdown` via apt, or
`pip install markdown`). Conventions shared by all three:
- The first `# ` heading in a file is its title; an optional `title - subtitle`
  form (split on the first ` - `) splits into title + subtitle.
- The filename (sans `.md`) is the URL slug; files starting with `.` or `_` are
  skipped (drafts/hidden).
- Branding (`SITE_TITLE`, `SITE_SUBTITLE`) and the `SITES` cross-link list live
  near the top of each `build.py`. The three sites link to each other via a
  `site_links()` nav in the shared footer — update the `SITES` list in all three
  if a site is added or its URL changes.

### Content folders
Hebrew writing, organized by project/collection. Notable ones:
- `uman-rosh-hashana/` — the "תעלומה" book (`taaluma/` chapters) plus drafts,
  posters, printed editions, and related letters.
- `hagut/` — essays ("מאמרים ומחשבות").
- `short-stories/` — short stories ("סיפורים קצרים").
- `ikar-hatzadik/` — many `גיליון N - ...` issue folders.
- Other collections: `or-zarua-latzadik/`, `sipurei-maasiyot/`,
  `tefila-ahava-veachdut/`, `sod-hamenura/`, `harav-malka/`, `harav-ofer/`,
  `lehachnis-balev/`, `likutey-moharan-notes/`, `chidushim/`,
  `chidushim-behalacha/`, `torah-chadasha/`, `books/`, `claims/`, `drafts/`, and
  more.
- Top-level `chidushim.md`, `musagim.md` — standalone notes.

### Tooling — `scripts/`
Mixed-language processing scripts (Node `.mjs`/`.js`, Ruby `.rb`, Python,
shell). Covers citation verification, footnote organizing, claim
extraction/clustering, book conversion, Hebrew search, and remote sync. See
`scripts/PIPELINE.md` for the processing pipeline; `scripts/data/`,
`scripts/prompts/`, `scripts/lib/`, `scripts/audio/`, `scripts/test/` hold
supporting assets.

### Other
- `.github/workflows/` — the three Cloudflare Pages deploy workflows.
- `.obsidian/` — Obsidian config (gitignored except `app.json`).
