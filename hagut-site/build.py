#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Builds a static site for the "hagut" essay collection from Markdown files.

Usage:
    python3 build.py [SOURCE_DIR] [OUTPUT_DIR]

SOURCE_DIR  folder containing one .md file per essay (default: ../hagut)
OUTPUT_DIR  where the site is written (default: ./site)

Each essay's first "# " heading becomes its title. An optional
"title - subtitle" form (split on the first " - ") is shown as
title + subtitle. The file name (without .md) becomes the URL slug.

Your Markdown files are read, never modified. To update the site after
adding or editing an essay, just run this script again.
"""
import os, re, sys, shutil
import markdown

# ---- site branding (edit freely) ----
SITE_TITLE    = "הגות"
SITE_SUBTITLE = "מאמרים ומחשבות"
# -------------------------------------

HERE = os.path.dirname(os.path.abspath(__file__))
SRC  = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(HERE, "..", "hagut")
OUT  = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(HERE, "site")

BIDI = "".join(chr(c) for c in [0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069])
def strip_bidi(s): return s.translate({ord(c): None for c in BIDI}).strip()

def collect_essays(src):
    """Return [(slug, path)] for every essay .md, sorted by slug."""
    out = []
    for name in os.listdir(src):
        clean = strip_bidi(name)
        if not clean.endswith(".md"):
            continue
        if clean.startswith((".", "_")):   # skip drafts/hidden
            continue
        slug = clean[:-3]
        out.append((slug, os.path.join(src, name)))
    out.sort(key=lambda t: t[0])
    return out

def parse_file(path):
    raw = open(path, encoding="utf-8").read().replace("﻿", "")
    lines = raw.splitlines()
    title_line, idx = "", None
    for i, ln in enumerate(lines):
        if ln.lstrip().startswith("# "):
            title_line = ln.lstrip()[2:].strip()
            idx = i
            break
    body = "\n".join(lines[:idx] + lines[idx + 1:]).strip() if idx is not None else raw.strip()
    # split "title - subtitle" into title + subtitle
    parts = re.split(r"\s+[-–]\s+", strip_bidi(title_line), maxsplit=1)
    if len(parts) == 2:
        title, subtitle = parts[0].strip(), parts[1].strip()
    else:
        title, subtitle = strip_bidi(title_line), ""
    # nl2br: treat a single newline as a line break, matching how the
    # essays are written in Obsidian (so e.g. dialogue lines stay separate).
    html = markdown.markdown(body, extensions=["extra", "sane_lists", "nl2br"], output_format="html5")
    # Tag block elements with dir="auto" so each block's direction follows its
    # own content: Hebrew stays RTL, while English blocks (e.g. the closing
    # poem) render LTR/left-aligned instead of being pushed to the right edge.
    html = re.sub(r"<(p|h[1-6]|li|blockquote)(?=[ >])", r'<\1 dir="auto"', html)
    return title, subtitle, html

# ---------- HTML templates ----------
def page(title, body):
    fonts = ("https://fonts.googleapis.com/css2?"
             "family=Frank+Ruhl+Libre:wght@400;500;700;800&"
             "family=Heebo:wght@400;500&family=Suez+One&display=swap")
    return f"""<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{fonts}">
<link rel="stylesheet" href="/style.css">
</head>
<body>
{body}
<footer class="foot"><p>{SITE_TITLE}</p></footer>
</body>
</html>"""

def render_index(essays):
    rows = []
    for slug, title, subtitle, _ in essays:
        sub = f'<span class="toc-sub">{subtitle}</span>' if subtitle else ""
        rows.append(
            f'<li><a href="/{slug}/">'
            f'<span class="toc-title">{title}</span>{sub}</a></li>')
    body = f"""<header class="hero">
  <h1 class="hero-title">{SITE_TITLE}</h1>
  <p class="hero-sub">{SITE_SUBTITLE}</p>
</header>
<nav class="toc" aria-label="רשימת מאמרים">
  <ol class="toc-list">
    {"".join(rows)}
  </ol>
</nav>"""
    return page(SITE_TITLE, body)

def render_essay(title, subtitle, html):
    sub = f'<p class="chap-sub">{subtitle}</p>' if subtitle else ""
    body = f"""<header class="topbar">
  <a class="brand" href="/">{SITE_TITLE}</a>
  <a class="back" href="/">כל המאמרים</a>
</header>
<article class="chapter">
  <h1 class="chap-title">{title}</h1>
  {sub}
  <div class="prose">
{html}
  </div>
</article>
<nav class="chap-nav">
  <a class="np np-prev" href="/"><span class="np-k">חזרה</span><span class="np-t">כל המאמרים</span></a>
  <span class="np np-empty"></span>
</nav>"""
    return page(f"{title} · {SITE_TITLE}", body)

def main():
    if not os.path.isdir(SRC):
        sys.exit(f"Source folder not found: {SRC}\n"
                 f"Pass it as the first argument, e.g.\n"
                 f"  python3 build.py /path/to/hagut")
    raw = collect_essays(SRC)
    if not raw:
        sys.exit(f"No essay .md files found in {SRC}")

    essays = []
    for slug, path in raw:
        title, subtitle, html = parse_file(path)
        essays.append((slug, title, subtitle, html))

    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT, exist_ok=True)

    with open(os.path.join(OUT, "index.html"), "w", encoding="utf-8") as f:
        f.write(render_index(essays))

    for slug, title, subtitle, html in essays:
        d = os.path.join(OUT, slug)
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f:
            f.write(render_essay(title, subtitle, html))

    css_src = os.path.join(HERE, "style.css")
    if os.path.exists(css_src):
        shutil.copy(css_src, os.path.join(OUT, "style.css"))

    print(f"Built {len(essays)} essays + index -> {OUT}")
    print("Essays:", ", ".join(s[0] for s in essays))

if __name__ == "__main__":
    main()
