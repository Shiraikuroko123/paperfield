param(
    [switch]$Disable,
    [switch]$NoStart
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runner = Join-Path $PSScriptRoot "run-beta-task.ps1"
$taskName = "Paperfield Share Auto Start"
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$popup = New-Object -ComObject WScript.Shell

if ($Disable) {
    & (Join-Path $PSScriptRoot "stop-beta-share.ps1") | Out-Null
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    $popup.Popup("Paperfield sharing will no longer start when you sign in.", 10, "Paperfield", 64) | Out-Null
    exit 0
}

$powershell = (Get-Command powershell.exe).Source
$arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runner`""
$action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 20 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null

if (-not $NoStart) {
    & (Join-Path $PSScriptRoot "stop-beta-share.ps1") | Out-Null
    Start-ScheduledTask -TaskName $taskName
    $urlPath = Join-Path $root "local\data\profiles\beta\share-url.txt"
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        Start-Sleep -Seconds 1
        if (Test-Path -LiteralPath $urlPath) {
            $shareUrl = (Get-Content -LiteralPath $urlPath -Raw).Trim()
            if ($shareUrl) { break }
        }
    }
}

$message = "Paperfield will start sharing automatically after Windows sign-in."
if ($shareUrl) { $message += "`n`n$shareUrl" }
$popup.Popup($message, 15, "Paperfield", 64) | Out-Null
