$mdFile = "kavana-gdola-venoraa.md"
$pdfOut = "kavana-gdola-venoraa.pdf"

$pandocArgs = @(
  $mdFile
  "--from", "markdown+implicit_figures"
  "--template=template.tex"
  "--lua-filter=title-from-header.lua"
  "--pdf-engine=xelatex"
  "-o", $pdfOut
)
pandoc @pandocArgs

Start-Process $pdfOut
