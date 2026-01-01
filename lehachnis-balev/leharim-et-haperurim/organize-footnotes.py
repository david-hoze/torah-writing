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
    footnotes = {}
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
                if ln[j + 1] == ":" and i == 0:
                    new_footnote_num = footnote_translation[orig_footnote_num]
                    footnotes[new_footnote_num] = "[^" + str(new_footnote_num) + "]:" + ln[j + 2:]
                    break
                else:
                    new_line += "[^" + str(footnote_num) + "]"
                    footnote_translation[orig_footnote_num] = footnote_num
                    footnote_num+=1
                    i = j + 1
            else:
                new_line += ln[i]
                i += 1
        if new_line != "": # We're not in a footnote
            print(new_line)

    sorted_footnotes = sorted(footnotes)
    for footnote_num in sorted_footnotes:
        print(footnotes[footnote_num])
        
if __name__ == "__main__":
    main()
