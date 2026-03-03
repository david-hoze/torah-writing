# verify-citations.mjs — Specification

## Purpose

Verifies that verbatim quotations in `sources-ai.md` match **exactly** (byte-for-byte, including nikkud) against the canonical source books:

| Alias | File |
|-------|------|
| **LM** | `books/ברסלב/ליקוטי מוהרן.md` |
| **LH** | `books/ברסלב/ליקוטי הלכות.md` |

When a citation does not match exactly but *can* be located in the book via fuzzy matching, the script can auto-fix it — replacing the citation with the canonical book text while preserving bold (`**`) formatting.

## Usage

```
node scripts/verify-citations.mjs [--verbose] [--fix]
```

| Flag | Effect |
|------|--------|
| `--verbose` | Print a line for every paragraph tested (pass, auto-fix, or fail) |
| `--fix` | Write auto-fixed citations back to `sources-ai.md` |

Exit code: **0** if no failures, **1** if any citation could not be matched.

---

## Citation Conventions (enforced by the script)

1. **Verbatim quoting** — Text inside `>` blockquotes must be identical to the source book, byte-for-byte, including nikkud. The digital books are the single source of truth.

2. **Makkaf (־)** — If the book uses makkaf (Hebrew hyphen, U+05BE), the citation must too. Do not replace it with a regular space.

3. **Verse / reference style** — Copy the book's reference format exactly. If the book writes `(ישעיהו מ)`, the citation must write the same. Do not modernize or reformulate.

4. **Section markers** — Inline sub-section markers like `(א)`, `(כז)` in the source books are structural artifacts. They are **stripped** from the book text before matching. Citations should **not** include them.

5. **Blockquote `>` = verbatim only** — Only text that appears word-for-word in the source belongs inside a `>` block. Editorial commentary, explanations, and author notes must be plain paragraphs (no `>`).

6. **Ellipsis jumps** — `...` or `…` in a citation indicates skipped text. Each segment on either side must appear in the source, in order.

7. **Bold `**` markers** — Stripped before matching (formatting only). Re-applied to the corrected book text during auto-fix.

8. **Fabricated content** — Any citation that cannot be matched to the source book is flagged as a failure and must be removed or replaced with a real, verbatim citation.

9. **Auto-fix (`--fix`)** — When a citation fails exact matching but is located via fuzzy matching, the script replaces it with the canonical book text, re-applying bold markers. Only truly unfindable citations are reported as failures.

---

## How It Works

### 1. Loading & Normalization

1. Read `sources-ai.md`, `ליקוטי מוהרן.md`, and `ליקוטי הלכות.md`.
2. Apply Unicode NFC normalization to all texts (resolves combining-character ordering differences).
3. Strip inline section markers (regex `/ ?\([א-ת]{1,2}\)/g`) from both book texts.

### 2. Skeleton Construction (for fuzzy matching)

For each book, a **consonant skeleton** is pre-built. The skeleton is a stripped-down version of the text with a position map back to the original. The following are removed or normalized:

| Element | Treatment |
|---------|-----------|
| Zero-width characters (U+200B–U+200F, U+FEFF) | Removed |
| Parenthesized content `(...)` | Removed |
| Dashes: makkaf (U+05BE), hyphen (U+002D), en-dash (U+2013), em-dash (U+2014) | Replaced with a single space |
| Nikkud & cantillation (U+0591–U+05BD, U+05BF–U+05C7) | Removed |
| Punctuation (`,.:;!?"'""׳״`, geresh/gershayim, curly quotes) | Removed |
| Whitespace | Collapsed to single spaces |

The skeleton is a pair: `{ skeleton: string, map: number[] }` where `map[i]` gives the index of skeleton character `i` in the original (cleaned) book text.

#### Abbreviation Normalization

After building the raw skeleton, common Hebrew honorific abbreviations are normalized so that both abbreviated and expanded forms produce identical skeletons:

| Abbreviated | Expanded | Skeleton |
|-------------|----------|----------|
| רז"ל | רבותינו זכרונם/זכרונו לברכה | רזל |
| חז"ל | חכמינו זכרונם/זכרונו לברכה | חזל |
| ז"ל | זכרונם/זכרונו/זכרונה לברכה | זל |

Longer forms are matched first to avoid partial replacements. The position map is updated so that the first character of the abbreviation maps to the start of the expanded form and the last character maps to the end, preserving correct original-text range extraction.

This normalization is applied to both the book skeletons and the citation skeletons.

### 3. Parsing `sources-ai.md`

The parser extracts:

- **Footnotes** — Headed by `## הערה N`
- **Sources** — Headed by `### <attribution>`
- **Paragraphs** — Consecutive lines starting with `>`, grouped into paragraph objects

Each paragraph tracks:
- `startLine` — 1-based line number of the first `>` line
- `rawText` — the concatenated text (with `>` prefix stripped)
- `lineIndices` — 0-based indices of all `>` lines in the source file (used for file modification)

### 4. Source Identification

Each attribution heading is classified as `LM`, `LH`, or `OTHER` using:
- Regex matches for `ליקו"מ`, `ליקוטי מוהרן` → **LM**
- Regex match for `^תורה\s` → **LM**
- Regex match for `ליקוטי הלכות` → **LH**
- Known LH section prefixes (מילה, תפילין, קריאת שמע, מנחה, etc.) → **LH**
- Everything else → **OTHER** (skipped)

### 5. Verification Loop (per paragraph)

Each paragraph goes through three phases:

#### Phase 1: Exact Match
1. Strip bold markers (`**`) from the citation.
2. Split by ellipsis (`...` / `…`) into segments.
3. Search for each segment in the book text (section-marker-stripped, NFC-normalized) using `indexOf`, in order.
4. If all segments found in sequence → **PASS**.

#### Phase 2: Fuzzy Match → Auto-Fix
1. For each segment, build a consonant skeleton and search for it in the book's pre-built skeleton.
2. If found, map the skeleton match back to the original book text, extracting the full verbatim text (including nikkud, makkaf, punctuation).
3. If all segments match fuzzily:
   - Join segments with ` ... `.
   - Re-apply bold markers from the original citation to the canonical text (via skeleton-position mapping).
   - Record the fix (footnote, attribution, line indices, new text).
   - Count as **auto-fixed** (passes).

#### Phase 2b: Editorial Text Detection
1. If fuzzy matching fails, check the **nikkud ratio** of the paragraph: the count of nikkud marks (U+05B0–U+05BD, U+05BF–U+05C7) divided by Hebrew consonant letters (U+05D0–U+05EA).
2. Fully nikkudized book text typically scores ≥ 0.5. Editorial/commentary text has no nikkud and scores near 0.
3. If the ratio is below **0.10**, the paragraph is classified as **editorial text** — it was incorrectly placed inside a blockquote.
4. In `--fix` mode, the `>` prefix is removed from these lines (a "soft AI change").
5. These paragraphs are **not** counted as failures.

#### Phase 3: Failure
1. For each unfound segment, attempt a partial match: try progressively shorter prefixes (up to 500 chars) against the book text.
2. Report the divergence point with expected vs. actual text.
3. Count as **FAILED**.

### 6. Applying Fixes (`--fix`)

When `--fix` is active and there are collected changes (citation fixes or editorial removals):

1. Merge citation fixes and editorial removals into a single list.
2. Sort in **reverse line order** (to avoid invalidating line indices when splicing).
3. For each citation fix, replace the original `>` lines with a single `>` line containing the corrected text.
4. For each editorial removal, strip the `>` prefix from the affected lines (converting them to plain paragraphs).
5. Write the modified content back to `sources-ai.md`.

### 7. Output

#### Summary Table
```
════════════════════════════════════════════════════════════
CITATION VERIFICATION SUMMARY
════════════════════════════════════════════════════════════
  Total LM/LH paragraphs tested: N
  ✅ Passed (exact match):        N
  🔧 Auto-fixed/fixable:          N
  📝 Editorial (blockquote removed/to remove): N
  ❌ Failed:                       N
  ⏭  Skipped (non-LM/LH):         N
════════════════════════════════════════════════════════════
```

#### Detailed Failures
For each failure, the script prints:
- The footnote number, attribution, source type, and line number
- For each unfound segment: the text, partial match location, and expected vs. actual divergence

---

## Key Functions

| Function | Description |
|----------|-------------|
| `normalize(text)` | Apply Unicode NFC normalization |
| `stripSectionMarkers(text)` | Remove inline section markers like `(א)` |
| `buildSkeleton(text)` | Build consonant skeleton + position map from Hebrew text |
| `normalizeAbbreviations(skel)` | Normalize expanded honorifics to abbreviated forms in a skeleton string |
| `normalizeAbbreviationsWithMap(skel, map)` | Same as above, but also updates the position map (single-pass, O(n)) |
| `toSkeleton(text)` | Convenience: build skeleton + normalize abbreviations, return string only |
| `nikkudRatio(text)` | Ratio of nikkud marks to Hebrew consonants (for editorial detection) |
| `fuzzyLocate(segment, bookClean, bookSkel, fromOrigPos)` | Find a citation segment in a book via skeleton matching; return `{ start, end, text }` with verbatim book text |
| `reapplyBold(rawCite, newText)` | Map bold ranges from original citation to corrected text via skeleton alignment |
| `identifySource(attribution)` | Classify an attribution as `LM`, `LH`, or `OTHER` |
| `parseSources(text)` | Parse `sources-ai.md` into footnotes → sources → paragraphs |
| `cleanQuote(text)` | Strip bold `**` markers |
| `splitByEllipsis(text)` | Split citation text by `...` / `…` |
| `findPartialMatch(sourceText, segment)` | Find the longest prefix match for diagnostic reporting |

---

## File Dependencies

```
scripts/verify-citations.mjs
├── reads:  lehachnis-balev/issue-4/sources-ai.md
├── reads:  books/ברסלב/ליקוטי מוהרן.md
├── reads:  books/ברסלב/ליקוטי הלכות.md
└── writes: lehachnis-balev/issue-4/sources-ai.md  (only with --fix)
```
