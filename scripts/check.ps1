$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

python -B -m unittest discover -s tests -v
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

node --check static\app.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Output "Paperfield checks passed."
