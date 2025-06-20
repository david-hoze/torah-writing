pandoc uva-lezion-goel.md `
  --pdf-engine=xelatex `
  --number-sections=false `
  --template=template.tex `
  --lua-filter=title-from-header.lua `
  -o uva-lezion-goel.pdf

Start-Process uva-lezion-goel.pdf
