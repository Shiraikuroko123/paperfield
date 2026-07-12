param(
    [switch]$Stop
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$profile = Join-Path $root "data\profiles\beta"
$urlPath = Join-Path $profile "share-url.txt"
$launcherPidPath = Join-Path $profile "share-launcher.pid"
$launcherOut = Join-Path $profile "share-launcher.out.log"
$launcherErr = Join-Path $profile "share-launcher.err.log"
$popup = New-Object -ComObject WScript.Shell

function Test-ListeningPort([int]$Port) {
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

if ($Stop) {
    & (Join-Path $PSScriptRoot "stop-beta-share.ps1") | Out-Null
    Remove-Item -LiteralPath $urlPath -ErrorAction SilentlyContinue
    $popup.Popup("Paperfield sharing has stopped.", 8, "Paperfield", 64) | Out-Null
    exit 0
}

New-Item -ItemType Directory -Force -Path $profile | Out-Null
$shareUrl = ""
if ((Test-ListeningPort 8876) -and (Test-ListeningPort 4040) -and (Test-Path -LiteralPath $urlPath)) {
    $shareUrl = (Get-Content -LiteralPath $urlPath -Raw).Trim()
} else {
    & (Join-Path $PSScriptRoot "stop-beta-share.ps1") | Out-Null
    Remove-Item -LiteralPath $urlPath,$launcherOut,$launcherErr -ErrorAction SilentlyContinue

    $launcher = Start-Process -FilePath "powershell.exe" `
        -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot "run-beta-task.ps1") `
        -WorkingDirectory $root -WindowStyle Hidden -PassThru
    Set-Content -LiteralPath $launcherPidPath -Value $launcher.Id

    for ($attempt = 0; $attempt -lt 45; $attempt++) {
        Start-Sleep -Seconds 1
        if (Test-Path -LiteralPath $urlPath) {
            $shareUrl = (Get-Content -LiteralPath $urlPath -Raw).Trim()
            if ($shareUrl) { break }
        }
        if ($launcher.HasExited) { break }
    }
}

if (-not $shareUrl) {
    $detail = ((Get-Content -LiteralPath $launcherErr -Tail 4 -ErrorAction SilentlyContinue) -join " ").Trim()
    if (-not $detail) { $detail = "Check data\profiles\beta\share-launcher.err.log" }
    $popup.Popup("Paperfield sharing could not start.`n`n$detail", 18, "Paperfield", 16) | Out-Null
    exit 1
}

try {
    Set-Clipboard -Value $shareUrl
} catch {
    $shareUrl | clip.exe
}
Start-Process $shareUrl
$popup.Popup("Sharing is active and the link was copied.`n`n$shareUrl`n`nUse the Stop shortcut when finished.", 15, "Paperfield", 64) | Out-Null
