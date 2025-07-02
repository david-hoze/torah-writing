# make-taaluma.ps1

param (
    [Parameter(Mandatory = $false)]
    [string]$md
)

if (-not $md) {
    $md = Read-Host "Enter the markdown filename (e.g. taaluma-1.md)"
}

if (!(Test-Path $md)) {
    Write-Host "Markdown file '$md' not found!" -ForegroundColor Red
    exit 1
}

$out = [System.IO.Path]::ChangeExtension($md, ".pdf")

$tpl = "template.tex"

pandoc $md `
       --template $tpl `
       --pdf-engine=xelatex `
       -o $out

Write-Host "Created $out"
Invoke-Item $out
