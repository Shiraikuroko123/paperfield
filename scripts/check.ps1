$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

python -B -m unittest discover -s tests -v
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

node --check src\paperfield\static\app.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

node --check src\research_atlas\static\app.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

python -m py_compile src\paperfield\app.py src\research_atlas\app.py src\research_atlas\worker.py src\research_atlas\scanner.py src\research_atlas\schema_validation.py src\research_atlas\curriculum.py
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& (Join-Path $PSScriptRoot "build-platform.ps1") -TestFlowloom
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Output "Paperfield unified platform checks passed."
