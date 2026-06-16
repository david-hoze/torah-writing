#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Builds a static site for the "taaluma" book from its Markdown chapters.

Usage:
    python3 build.py [SOURCE_DIR] [OUTPUT_DIR]

SOURCE_DIR  folder containing taaluma-1.md ... taaluma-12.md
            (default: ./content)
OUTPUT_DIR  where the site is written (default: ./site)

Your Markdown files are read, never modified. To update the site after
editing a chapter, just run this script again.
"""
import os, re, sys, shutil, unicodedata
import markdown

# ---- edit these two lines to rename the book ----
SITE_TITLE    = "תעלומה"
SITE_SUBTITLE = "סיפור בי״ב חלקים"
# -------------------------------------------------

# ---- sister sites (cross-links shown in the footer) ----
SITE_KEY = "taaluma"
SITES = [
    ("taaluma",       "תעלומה",        "https://taaluma.pages.dev"),
    ("hagut",         "הגות",          "https://hagut.pages.dev"),
    ("short-stories", "סיפורים קצרים", "https://short-stories.pages.dev"),
]
def site_links():
    items = "".join(f'<a href="{url}">{name}</a>'
                    for key, name, url in SITES if key != SITE_KEY)
    return f'<nav class="sites" aria-label="אתרים נוספים">{items}</nav>'
# --------------------------------------------------------

HERE = os.path.dirname(os.path.abspath(__file__))
SRC  = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(HERE, "content")
OUT  = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(HERE, "site")

BIDI = "".join(chr(c) for c in [0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069])
def strip_bidi(s): return s.translate({ord(c): None for c in BIDI}).strip()

def collect_chapters(src):
    out = []
    for name in os.listdir(src):
        clean = strip_bidi(name)
        m = re.match(r"^taaluma-(\d+)\.md$", clean)
        if m:
            out.append((int(m.group(1)), os.path.join(src, name)))
    out.sort(key=lambda t: t[0])
    return out

def parse_file(path):
    raw = open(path, encoding="utf-8").read().replace("\ufeff", "")
    lines = raw.splitlines()
    title_line, idx = "", None
    for i, ln in enumerate(lines):
        if ln.lstrip().startswith("# "):
            title_line = ln.lstrip()[2:].strip()
            idx = i
            break
    if idx is not None:
        body = "\n".join(lines[:idx] + lines[idx + 1:]).strip()
    else:
        body = raw.strip()
    # split "חלק א' - שם הפרק" into label + title
    parts = re.split(r"\s+[-–]\s+", strip_bidi(title_line), maxsplit=1)
    if len(parts) == 2:
        label, title = parts[0].strip(), parts[1].strip()
    else:
        label, title = "", strip_bidi(title_line)
    html = markdown.markdown(body, extensions=["extra", "sane_lists"], output_format="html5")
    return label, title, html

# ---------- HTML templates ----------
def page(title, body, css="style.css"):
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
<link rel="stylesheet" href="/{css}">
</head>
<body>
{body}
<footer class="foot">
  <p class="foot-brand">{SITE_TITLE}</p>
  {site_links()}
</footer>
</body>
</html>"""

def render_index(chs):
    rows = []
    for num, label, title, _ in chs:
        rows.append(
            f'<li><a href="/chapter-{num:02d}/">'
            f'<span class="toc-num">{label or num}</span>'
            f'<span class="toc-title">{title}</span></a></li>')
    body = f"""<header class="hero">
  <h1 class="hero-title">{SITE_TITLE}</h1>
  <p class="hero-sub">{SITE_SUBTITLE}</p>
</header>
<nav class="toc" aria-label="תוכן העניינים">
  <ol class="toc-list">
    {"".join(rows)}
  </ol>
</nav>"""
    return page(SITE_TITLE, body)

def render_chapter(num, label, title, html, prev_, next_):
    nav = ['<nav class="chap-nav" aria-label="ניווט בין פרקים">']
    if prev_:
        nav.append(f'<a class="np np-prev" href="/chapter-{prev_[0]:02d}/">'
                   f'<span class="np-k">הפרק הקודם</span>'
                   f'<span class="np-t">{prev_[1]}</span></a>')
    else:
        nav.append('<span class="np np-empty"></span>')
    if next_:
        nav.append(f'<a class="np np-next" href="/chapter-{next_[0]:02d}/">'
                   f'<span class="np-k">הפרק הבא</span>'
                   f'<span class="np-t">{next_[1]}</span></a>')
    else:
        nav.append('<span class="np np-empty"></span>')
    nav.append('</nav>')
    eyebrow = f'<p class="eyebrow">{label}</p>' if label else ""
    body = f"""<header class="topbar">
  <a class="brand" href="/">{SITE_TITLE}</a>
  <a class="back" href="/">תוכן העניינים</a>
</header>
<article class="chapter">
  {eyebrow}
  <h1 class="chap-title">{title}</h1>
  <div class="prose">
{html}
  </div>
</article>
{''.join(nav)}"""
    return page(f"{title} · {SITE_TITLE}", body)

def main():
    if not os.path.isdir(SRC):
        sys.exit(f"Source folder not found: {SRC}\n"
                 f"Pass it as the first argument, e.g.\n"
                 f"  python3 build.py /path/to/uman-rosh-hashana/taaluma")
    raw = collect_chapters(SRC)
    if not raw:
        sys.exit(f"No taaluma-N.md files found in {SRC}")
    chs = []
    for num, path in raw:
        label, title, html = parse_file(path)
        chs.append((num, label, title, html))

    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT, exist_ok=True)

    with open(os.path.join(OUT, "index.html"), "w", encoding="utf-8") as f:
        f.write(render_index(chs))

    for i, (num, label, title, html) in enumerate(chs):
        prev_ = (chs[i - 1][0], chs[i - 1][2]) if i > 0 else None
        next_ = (chs[i + 1][0], chs[i + 1][2]) if i < len(chs) - 1 else None
        d = os.path.join(OUT, f"chapter-{num:02d}")
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f:
            f.write(render_chapter(num, label, title, html, prev_, next_))

    css_src = os.path.join(HERE, "style.css")
    if os.path.exists(css_src):
        shutil.copy(css_src, os.path.join(OUT, "style.css"))

    # Copy static assets (images, etc.) referenced as /assets/... in the Markdown.
    assets_src = os.path.join(HERE, "assets")
    if os.path.isdir(assets_src):
        shutil.copytree(assets_src, os.path.join(OUT, "assets"))

    print(f"Built {len(chs)} chapters + index -> {OUT}")
    print("Chapters:", ", ".join(str(c[0]) for c in chs))

if __name__ == "__main__":
    main()
