$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$helper = Join-Path $PSScriptRoot "start-beta-background.ps1"
$desktop = [Environment]::GetFolderPath("Desktop")
$powershell = (Get-Command powershell.exe).Source
$shell = New-Object -ComObject WScript.Shell

function New-PaperfieldShortcut([string]$Name, [string]$ExtraArguments, [int]$IconIndex) {
    $shortcut = $shell.CreateShortcut((Join-Path $desktop "$Name.lnk"))
    $shortcut.TargetPath = $powershell
    $shortcut.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$helper`" $ExtraArguments".Trim()
    $shortcut.WorkingDirectory = $root
    $shortcut.Description = $Name
    $shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,$IconIndex"
    $shortcut.Save()
}

New-PaperfieldShortcut "Paperfield Share" "" 220
New-PaperfieldShortcut "Stop Paperfield Share" "-Stop" 131

$shell.Popup("Desktop shortcuts installed:`n`nPaperfield Share`nStop Paperfield Share", 12, "Paperfield", 64) | Out-Null
