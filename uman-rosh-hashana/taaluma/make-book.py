#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
make-book.py - build ONE PDF of all 12 taaluma chapters, joined.

Reuses template.tex (the same Hebrew xelatex template as make-taaluma.py). The
book gets a single "תעלומה" title page, then every chapter on a fresh page with
its own centered part/subtitle heading, and continuous page numbers.

  python3 make-book.py                 # -> taaluma-book.pdf (all chapters)
  python3 make-book.py taaluma-book.pdf # explicit output name

How it differs from make-taaluma.py: that script builds one chapter and injects
its subtitle into the title page. Here the title page stays the book title only,
and each chapter's heading is emitted into the body (with a \\newpage) so all 12
flow into a single document. Needs pandoc + xelatex on PATH.
"""
import sys, os, re, tempfile, subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEMPLATE = HERE / "template.tex"

BIDI = "".join(chr(c) for c in [0x200e, 0x200f, 0x202a, 0x202b, 0x202c,
                                0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069])
def strip_bidi(s): return s.translate({ord(c): None for c in BIDI}).strip()


def split_title(h1):
    """'חלק א' - שם הפרק' -> ('חלק א'', 'שם הפרק')"""
    if " - " in h1:
        part, sub = h1.split(" - ", 1)
    elif "-" in h1:
        part, sub = h1.split("-", 1)
    else:
        part, sub = h1, ""
    return part.strip(), sub.strip()


def collect_chapters():
    found = []
    for name in os.listdir(HERE):
        m = re.match(r"^taaluma-(\d+)\.md$", strip_bidi(name))
        if m:
            found.append((int(m.group(1)), HERE / name))
    found.sort(key=lambda t: t[0])
    return found


def chapter_block(path, first):
    lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
    h1 = next((ln for ln in lines if ln.lstrip().startswith("#")), "")
    if not h1:
        sys.exit(f"No H1 heading in {path.name}")
    part, subtitle = split_title(strip_bidi(h1.lstrip("#").strip()))
    body = "".join(ln for ln in lines if ln is not h1).strip()

    sub_line = (rf"  {{\headingfont\fontsize{{20}}{{19}}\selectfont {subtitle}\par}}"
                if subtitle else "")
    # raw-LaTeX heading (pandoc passes {=latex} blocks straight through)
    head = "\n".join(filter(None, [
        "```{=latex}",
        r"\newpage",
        r"\begin{center}",
        rf"  {{\headingfont\fontsize{{47}}{{50}}\selectfont {part}\par}}",
        sub_line,
        r"\end{center}",
        r"\vspace{1cm}",
        "```",
    ]))
    return head + "\n\n" + body + "\n"


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "taaluma-book.pdf"
    if not TEMPLATE.exists():
        sys.exit(f"Template not found: {TEMPLATE}")
    chapters = collect_chapters()
    if not chapters:
        sys.exit("No taaluma-N.md chapters found")
    print(f"Joining {len(chapters)} chapters: {', '.join(str(n) for n,_ in chapters)}")

    combined = "\n".join(chapter_block(p, i == 0)
                         for i, (_, p) in enumerate(chapters))

    tmp = Path(tempfile.mkdtemp(prefix="taaluma_book_"))
    body_md = tmp / "book.md"
    body_md.write_text(combined, encoding="utf-8")

    cmd = ["pandoc", str(body_md),
           "--template", str(TEMPLATE),
           "--pdf-engine", "xelatex",
           "-o", str(out)]
    subprocess.check_call(cmd)
    print(f"Created {out}  ({out.stat().st_size//1024} KB)")
    if sys.platform.startswith("win") and os.environ.get("TAALUMA_OPEN", "1") != "0":
        try:
            os.startfile(out)
        except OSError:
            pass


if __name__ == "__main__":
    main()
