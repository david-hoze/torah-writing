#!/usr/bin/env python
# organize-footnotes.py – Make unsorted Markdown footnotes ordered
import sys
from pathlib import Path

# For testing
# footnote_source_prefix = "## footnote "
# For hebrew
footnote_source_prefix = "## הערה "

def main():
    if len(sys.argv) < 2:
        sys.exit("usage: make_taaluma.py <article.md> <sources.md>")
    article = Path(sys.argv[1])
    if not article.exists(): sys.exit(f"Markdown '{article}' not found")
    sources = Path(sys.argv[2])
    if not sources.exists(): sys.exit(f"Markdown '{sources}' not found")

    # --- read markdown and extract first heading ---------------------------
    with article.open(encoding="utf-8") as f:
        lines = f.readlines()

    article_output = open("article_output.md", "w", encoding="utf-8")

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
            article_output.write(new_line)

    sorted_footnotes = sorted(footnotes)
    for footnote_num in sorted_footnotes:
        article_output.write(footnotes[footnote_num])

    with sources.open(encoding="utf-8") as f:
        lines = f.readlines()

    sources_output = open("sources_output.md", "w", encoding="utf-8")
    footnote_sources = {}
    footnote_new_num = None
    for ln in lines:
        if ln.startswith(footnote_source_prefix):
            footnote_orig_num = ln[len(footnote_source_prefix):][:1]
            footnote_new_num = footnote_translation[footnote_orig_num]
            footnote_sources[footnote_new_num] = footnote_source_prefix + str(footnote_new_num) + "\n"
        elif footnote_new_num:
            footnote_sources[footnote_new_num] += ln + "\n"

    sorted_footnote_sources = sorted(footnote_sources)

    for footnote_num in sorted_footnote_sources:
        sources_output.write(footnote_sources[footnote_num])

if __name__ == "__main__":
    main()
