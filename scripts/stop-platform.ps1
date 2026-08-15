$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $root "local\platform"
. (Join-Path $PSScriptRoot "platform-process.ps1")
$paperfieldScript = [System.IO.Path]::GetFullPath((Join-Path $root "src\paperfield\app.py"))
$atlasScript = [System.IO.Path]::GetFullPath((Join-Path $root "src\research_atlas\app.py"))
$workerScript = [System.IO.Path]::GetFullPath((Join-Path $root "src\research_atlas\worker.py"))
$lifecycleLock = Enter-PlatformLifecycleLock -RuntimeDir $runtimeDir

try {
    foreach ($service in @(
        @{
            Name = "atlas-worker"
            Port = 0
            Script = $workerScript
            Pattern = "research_atlas[\\/]worker\.py"
            Health = ""
            Version = ""
        },
        @{
            Name = "paperfield"
            Port = 8765
            Script = $paperfieldScript
            Pattern = "paperfield[\\/]app\.py"
            Health = "http://127.0.0.1:8765/api/health"
            Version = Get-PlatformPythonAppVersion -ScriptPath $paperfieldScript
        },
        @{
            Name = "atlas"
            Port = 8795
            Script = $atlasScript
            Pattern = "research_atlas[\\/]app\.py"
            Health = "http://127.0.0.1:8795/api/health"
            Version = Get-PlatformPythonAppVersion -ScriptPath $atlasScript
        }
    )) {
        Stop-PlatformService -RuntimeDir $runtimeDir -Name $service.Name -Port $service.Port -ExpectedScriptPath $service.Script -CommandPattern $service.Pattern -HealthUrl $service.Health -HealthVersion $service.Version
    }
} finally {
    if ($lifecycleLock) { $lifecycleLock.Dispose() }
}
