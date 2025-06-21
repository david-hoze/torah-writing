pandoc uva-lezion-goel.md `
  --pdf-engine=xelatex `
  --template=template.tex `
  --lua-filter=title-from-header.lua `
  -o uva-lezion-goel.pdf

Start-Process uva-lezion-goel.pdf
