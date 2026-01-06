#!/usr/bin/env python
# make_taaluma.py  –  build A4/A5 PDF from Markdown + template.tex
import sys, os, tempfile, subprocess, shutil, re, helper_functions
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
    md_path = Path("article.md")
    tpl_path = Path(helper_functions.get_git_root() + "/lehachnis-balev/templates/template.tex")
    if not md_path.exists(): sys.exit(f"Markdown '{md_path}' not found")
    if not tpl_path.exists(): sys.exit(f"Template '{tpl_path}' not found")

    # --- read markdown and extract first heading ---------------------------
    with md_path.open(encoding="utf-8") as f:
        lines = f.readlines()

    h1_line = next((ln for ln in lines if ln.lstrip().startswith("#")), "")
    if not h1_line:
        sys.exit("No H1 heading found in markdown")
    h1_text = h1_line.lstrip("#").strip()
    part, subtitle = split_title(h1_text)

    # remove the H1 from markdown body
    body_lines = [ln for ln in lines if ln is not h1_line]

    # --- create temp files --------------------------------------------------
    tmp_dir = tempfile.mkdtemp(prefix="taaluma_")
    md_tmp  = Path(tmp_dir) / "body.md"
    tpl_tmp = Path(tmp_dir) / "template.tex"

    md_tmp.write_text("".join(body_lines), encoding="utf-8")

    # inject title block after \begin{document}
    title_block = rf"""
\begin{{center}}
  {{\headingfont\fontsize{{47}}{{19}}\selectfont {part}\par}}
  {{\headingfont\fontsize{{20}}{{19}}\selectfont {subtitle}\par}}
\end{{center}}\vspace{{1cm}}
"""
    with tpl_path.open(encoding="utf-8") as f_in, tpl_tmp.open("w", encoding="utf-8") as f_out:
        for line in f_in:
            f_out.write(line)
            if line.strip() == r"% <subtitle>":
                f_out.write(title_block)

    # --- run pandoc ---------------------------------------------------------
    pdf_out = md_path.with_suffix(".pdf")
    cmd = [
        "pandoc", str(md_tmp),
        "--template", str(tpl_tmp),
        "--pdf-engine", "xelatex",
        "-o", str(pdf_out)
    ]
    subprocess.check_call(cmd)

    # --- open the PDF -------------------------------------------------------
    print(f"Created {pdf_out}")
    if sys.platform.startswith("win"):
        os.startfile(pdf_out)
    elif sys.platform == "darwin":
        subprocess.Popen(["open", pdf_out])
    else:
        subprocess.Popen(["xdg-open", pdf_out])

if __name__ == "__main__":
    main()
