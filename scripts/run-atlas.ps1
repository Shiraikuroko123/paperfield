param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$AtlasArguments
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
. (Join-Path $PSScriptRoot "platform-process.ps1")

# Keep standalone Atlas launches compatible with the unified Paperfield proxy.
# The token is persisted under local/platform so a later Paperfield launch can
# reuse it without putting a secret in the repository or command line.
$runtimeDir = Join-Path $root "local\platform"
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$proxyToken = Get-PlatformProxyToken -RuntimeDir $runtimeDir
$env:PAPERFIELD_ATLAS_PROXY_TOKEN = $proxyToken
$env:RESEARCH_ATLAS_PAPERFIELD_PROXY_TOKEN = $proxyToken

$python = (Get-Command python -ErrorAction Stop).Source
& $python (Join-Path $root "src\research_atlas\app.py") @AtlasArguments
exit $LASTEXITCODE