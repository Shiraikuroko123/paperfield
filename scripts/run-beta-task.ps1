$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$localProfile = Join-Path $root "local\data\profiles\beta"
$legacyProfile = Join-Path $root "data\profiles\beta"
$profile = if ((Test-Path -LiteralPath $legacyProfile) -and -not (Test-Path -LiteralPath $localProfile)) { $legacyProfile } else { $localProfile }
$stdout = Join-Path $profile "share-launcher.out.log"
$stderr = Join-Path $profile "share-launcher.err.log"

New-Item -ItemType Directory -Force -Path $profile | Out-Null
& (Join-Path $PSScriptRoot "start-beta-ngrok.ps1") 1> $stdout 2> $stderr
