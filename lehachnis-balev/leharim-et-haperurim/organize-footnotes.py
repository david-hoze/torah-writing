#!/usr/bin/env python
# organize-footnotes.py – Make unsorted Markdown footnotes ordered
import sys
from pathlib import Path

def main():
    if len(sys.argv) < 2:
        sys.exit("usage: make_taaluma.py <markdown.md> [template.tex]")
    md_path = Path(sys.argv[1])
    if not md_path.exists(): sys.exit(f"Markdown '{md_path}' not found")

    # --- read markdown and extract first heading ---------------------------
    with md_path.open(encoding="utf-8") as f:
        lines = f.readlines()

    footnote_num = 1
    footnote_translation = {}
    for ln in lines:
        i = 0
        new_line = ""
        while i < len(ln):
            if (ln[i] == '[' and ln[i+1] == '^'):
                # We have a footnote
                j = i + 2
                orig_footnote_num = ""
                while j < len(ln) and ln[j] != ']':
                    orig_footnote_num += ln[j]
                    j += 1
                if (ln[j + 1] == ":"):
                    new_line += "[^" + str(footnote_translation[orig_footnote_num]) + "]:"
                    i = j + 2
                else:
                    new_footnote_num = str(footnote_num)
                    new_line += "[^" + new_footnote_num + "]"
                    footnote_translation[orig_footnote_num] = new_footnote_num
                    footnote_num+=1
                    i = j + 1
            else:
                new_line += ln[i]
                i += 1
        print(new_line)

if __name__ == "__main__":
    main()
