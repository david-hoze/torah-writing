# make-taaluma.ps1
$md   = "taaluma-1.md"
$out  = "taaluma-1.pdf"
$tpl  = "template-a5.tex"

pandoc $md `
       --template $tpl `
       --pdf-engine=xelatex `
       -o $out
Write-Host "Created $out"
