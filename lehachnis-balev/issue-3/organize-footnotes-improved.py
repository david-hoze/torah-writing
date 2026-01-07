#!/usr/bin/env python
# -*- coding: utf-8 -*-

import sys
import logging
from pathlib import Path
import re

logging.basicConfig(level=logging.WARNING)
logger =  logging.getLogger(__name__)

FOOTNOTE_REF_RE = re.compile(r"\[\^([^\]]+)\]")
FOOTNOTE_DEF_RE = re.compile(r"^\[\^([^\]]+)\]:(.*)$")

FOOTNOTE_SOURCE_PREFIX = "## הערה "
QUOTE_HEADING_PREFIX = ">### "
FOOTNOTE_REF_PREFIX = "הערה "

# --------------------------------------------------------------------
# Utilities
# --------------------------------------------------------------------

def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")

def write_text(path: Path, text: str):
    path.write_text(text, encoding="utf-8")

# --------------------------------------------------------------------
# Step 1: Parse article & remap footnotes
# --------------------------------------------------------------------

def remap_footnotes(article_text: str):
    """
    Returns:
        new_text: article with reordered footnote references
        footnotes: dict[new_num] -> footnote text
        translation: dict[old_num] -> new_num
    """
    translation = {}
    footnotes = {}
    next_num = 1

    output_lines = []

    for line in article_text.splitlines(keepends=True):
        # Footnote definition line
        m = FOOTNOTE_DEF_RE.match(line)
        if m:
            old = m.group(1)
            if old not in translation:
                logger.warning(f"Footnote definition without reference: {old}")
                continue
            new = translation[old]
            footnotes[new] = f"[^{new}]:{m.group(2)}"
            continue

        # Normal line - replace references in order of appearance
        def repl(match):
            nonlocal next_num
            old = match.group(1)
            if old not in translation:
                translation[old] = next_num
                next_num += 1
            return f"[^{translation[old]}]"

        new_line = FOOTNOTE_REF_RE.sub(repl, line)
        output_lines.append(new_line)

    return "".join(output_lines), footnotes, translation

# --------------------------------------------------------------------
# Step 2: Fix internal footnote references
# --------------------------------------------------------------------

def rewrite_internal_references(text: str, translation: dict) -> str:
    FOOTNOTE_INTERNAL_REF_RE = re.compile(r"הערה (\d+)")
    def repl(match):
        old = match.group(1)
        if old not in translation:
            logger.warning(f"A footnote internal reference that points nowhere")
            return old.group()
        else:
            return f"הערה {translation[old]}"
    
    return FOOTNOTE_INTERNAL_REF_RE.sub(repl, text)

# --------------------------------------------------------------------
# Step 3: Load extended sources
# --------------------------------------------------------------------

def load_sources(sources_text: str, translation: dict):
    sources = {}
    current = None

    for line in sources_text.splitlines(keepends=True):
        if line.startswith(FOOTNOTE_SOURCE_PREFIX):
            old = line[len(FOOTNOTE_SOURCE_PREFIX):].strip()
            if old not in translation:
                logger.warning(f"Source for unknown footnote: {old}")
                current = None
                continue
            new = translation[old]
            sources[new] = FOOTNOTE_SOURCE_PREFIX + new + "\n"
            current = new
        elif current is not None:
            sources[current] += line

    return sources

# --------------------------------------------------------------------
# Step 3: Load extended sources
# --------------------------------------------------------------------

def split_citations(citation_str: str):

    parts = [p.strip().replace('וע"ע"', "").replace('ע"ע', "").strip() for p in citation_str.split(",")]

    merged = []
    for p in parts:
        if len(p) <= 5 and merged:
            merged[-1] += ", " + p
        else:
            merged.append(p)

    return merged

QUOTED_CITATION_RE = re.compile(r'"[^"]+"\s+\([^\)]+\)')

PAREN_RE = re.compile(r'\(([^\)]+)\)')

def extract_citations(footnote_text: str):

    stripped = QUOTED_CITATION_RE.sub("", footnote_text)

    citations = []
    for m in PAREN_RE.finditer(stripped):
        citations.extend(split_citations(m.group(1)))
    
    return citations

def check_citations(footnotes: dict, sources: dict, output_path: Path):
    with output_path.open("w", encoding="utf-8") as out:
        for num, src in sorted(sources.items()):
            if num not in footnotes:
                continue
            
            expected = extract_citations(footnotes[num])
            actual = [
                line[len(QUOTE_HEADING_PREFIX):].strip()
                for line in src.splitlines()
                if line.startswith(QUOTE_HEADING_PREFIX)
            ]

            for (e, a) in zip(expected, actual):
                if e != a:
                    out.write(
                        f"Citation mismatch in footnote {num}\n"
                        f"Expected: {e}\n"
                        f"Found:    {a}\n\n"
                    )

# --------------------------------------------------------------------
# Main
# --------------------------------------------------------------------

def main():
    if len(sys.argv) < 2:
        sys.exit("usage: script.py <article.md> [sources.md]")
    
    article = Path(sys.argv[1])
    sources = Path(sys.argv[2]) if len(sys.argv) > 2 else None

    article_text = read_text(article)

    new_article, footnotes, translation = remap_footnotes(article_text)

    # Rewrite internal references in footnotes
    for k in list(footnotes):
        footnotes[k] = rewrite_internal_references(footnotes[k], translation)

    # Write article output
    out_article = Path("article_output.md")
    with out_article.open("w", encoding="utf-8") as f:
        f.write(new_article)
        for k in sorted(footnotes):
            f.write(footnotes[k] + "\n\n")
    
    if not sources:
        return

    sources_text = read_text(sources)
    footnote_sources = load_sources(sources_text, translation)

    out_sources = Path("sources_output.md")
    with out_sources.open("w", encoding="utf-8") as f:
        for k in sorted(footnote_sources):
            f.write(footnote_sources[k])

    check_citations(footnotes, footnote_sources, Path("citation-mismatch.md"))

if __name__ == "__main__":
    main()
