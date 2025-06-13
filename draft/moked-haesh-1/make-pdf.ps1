pandoc moked-haesh-1.md `
  --pdf-engine=xelatex `
  --number-sections=false `
  --template=template.tex `
  -o moked-haesh-1.pdf

  # pandoc moked-haesh-1.md `
  # --pdf-engine=xelatex `
  # --lua-filter=quote-font.lua `
  # --number-sections=false `
  # --template=template.tex `
  # -o moked-haesh-1.pdf

Start-Process moked-haesh-1.pdf
