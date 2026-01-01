#!/usr/bin/env python
# organize-footnotes.py – Make unsorted Markdown footnotes ordered
import sys
from pathlib import Path

def split_title(h1: str):
    """return (part, subtitle) split at first dash"""
    if " - " in h1:
        part, sub = h1.split(" - ", 1)
    elif "-" in h1:
        part, sub = h1.split("-", 1)
    else:
        part, sub = h1, ""
    return part.strip(), sub.strip()

def main():
    if len(sys.argv) < 2:
        sys.exit("usage: make_taaluma.py <markdown.md> [template.tex]")
    md_path = Path(sys.argv[1])
    if not md_path.exists(): sys.exit(f"Markdown '{md_path}' not found")

    # --- read markdown and extract first heading ---------------------------
    with md_path.open(encoding="utf-8") as f:
        lines = f.readlines()

    for ln in lines:
        i = 0
        while i < len(ln):
            if (ln[i] == '[' and ln[i+1] == '^'):
                j = i + 2
                footnote_num = ""
                while j < len(ln) and ln[j] != ']':
                    footnote_num += ln[j]
                    j+=1
                print(footnote_num)
            i+=1

if __name__ == "__main__":
    main()
