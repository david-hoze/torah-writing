#!/usr/bin/env python
# organize-footnotes.py – Make unsorted Markdown footnotes ordered
import sys
from pathlib import Path

# For testing
# footnote_source_prefix = "## footnote "
# For hebrew
footnote_source_prefix = "## הערה "

quote_heading_prefix = ">### "

def unite_short_items(items):
    result = []
    i = 0
    while i < len(items):
        current = items[i]
        if len(current) > 5:
            result.append(current)
        else:
            if result:
                result[-1] += ", " + current
            else:
                print("Error: citation too short")
        i += 1
    
    return result

def get_citations(citation_list_str):
    citations = [item.strip() for item in citation_list_str.split(",")]
    citations = [item.replace("וע\"ע","").replace("ע\"ע","").strip() for item in citations]
    return unite_short_items(citations)

def main():
    if len(sys.argv) < 2:
        sys.exit("usage: organize-footnotes.py <article.md> [sources.md]")
    article = Path(sys.argv[1])
    if not article.exists(): sys.exit(f"Markdown '{article}' not found")
    sources = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    if sources and not sources.exists(): sys.exit(f"Markdown '{sources}' not found")

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
        article_output.write(footnotes[footnote_num] + "\n")

    if not sources:
        sys.exit(0)

    with sources.open(encoding="utf-8") as f:
        lines = f.readlines()

    sources_output = open("sources_output.md", "w", encoding="utf-8")
    footnote_sources = {}
    footnote_new_num = None
    for ln in lines:
        if ln.startswith(footnote_source_prefix):
            footnote_orig_num = ln[len(footnote_source_prefix):][:-1]
            footnote_new_num = footnote_translation[footnote_orig_num]
            footnote_sources[footnote_new_num] = footnote_source_prefix + str(footnote_new_num) + "\n"
        elif footnote_new_num:
            footnote_sources[footnote_new_num] += ln

    sorted_footnote_sources = sorted(footnote_sources)

    citation_mismatch = open("citation-mismatch.md", "w", encoding="utf-8")
    for footnote_num in sorted_footnote_sources:
        print(f"Footnote number: {footnote_num}")
        sources_output.write(footnote_sources[footnote_num])
        lines = footnote_sources[footnote_num].split("\n")
        i = 0
        footnote = footnotes[footnote_num]

        citations = []
        while i < len(footnote):
            if footnote[i] == '"' and (i == 0 or footnote[i-1] == ' '):
                print(f"found \" in {i}")
                i += 1
                while not (footnote[i] == '"' and (i + 1 == len(footnote) or footnote[i + 1] in [' ', ',', '.', '?', '!', ':'])):
                    i += 1
                print(f"Got to the end {i}, surroundings {footnote[i - 5:i + 5]}")
                while footnote[i] != '(': i += 1
                print(f"Found ( in {i}, footnote[i - 2] = {footnote[i - 2]}")
                if (footnote[i - 2] == '"'): # Meaning the parantheses belong to the source
                    j = i + 1
                    while footnote[j] != ')': j += 1
                    full_citation = get_citations(footnote[i+1:j])
                    if len(full_citation) > 1:
                        citations += full_citation[1:]

                    print(f"Found closing parantheses in {i}, surroundings {footnote[i - 5:i + 5]}")
                else:
                    i -= 1
            else:
                if footnote[i] == '(':
                    j = i + 1
                    while footnote[j] != ')': j += 1
                    citations += get_citations(footnote[i+1:j])
                    i = j
            i += 1

        citation_num = 0
        for ln in lines:
            if ln.startswith(quote_heading_prefix):
                if citation_num >= len(citations):
                    citation_mismatch.write(f"Not enough citations in footnote number: {footnote_num}\n")
                    break
                source_citation = ln[len(quote_heading_prefix):]
                while True:
                    footnote_citation = citations[citation_num]
                    if source_citation != footnote_citation:
                        if footnote_citation in citations[:citation_num]:
                            citation_mismatch.write(
f"""Note: The source for {footnote_citation} in footnote_number {footnote_num} was brought in the footnote sources,
so we're advancing to the next, better check if it contains what's necessary\n.""")
                            citation_num += 1
                        else:
                            citation_mismatch.write(f"Citation mismatch in footnote number: {footnote_num}\n")
                            citation_mismatch.write(f"Footnote citation:\n{footnote_citation}\n")
                            citation_mismatch.write(f"Source citation:\n{source_citation}\n")
                            break
                    else:
                        break
                citation_num += 1


if __name__ == "__main__":
    main()
