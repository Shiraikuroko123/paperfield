param(
    [switch]$Foreground
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $root "local\platform"
$paperfieldScript = [System.IO.Path]::GetFullPath((Join-Path $root "src\paperfield\app.py"))
$atlasScript = [System.IO.Path]::GetFullPath((Join-Path $root "src\research_atlas\app.py"))
$workerScript = [System.IO.Path]::GetFullPath((Join-Path $root "src\research_atlas\worker.py"))
$paperfieldPattern = "paperfield[\\/]app\.py"
$atlasPattern = "research_atlas[\\/]app\.py"
$workerPattern = "research_atlas[\\/]worker\.py"

Set-Location $root
if (-not (Test-Path -LiteralPath "apps\flowloom\dist\index.html")) {
    & (Join-Path $PSScriptRoot "build-platform.ps1")
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
. (Join-Path $PSScriptRoot "platform-process.ps1")
# Normalize duplicated PATH/Path entries before Start-Process creates its
# case-insensitive child-process environment dictionary on Windows PowerShell.
Normalize-PlatformProcessEnvironment
$lifecycleLock = Enter-PlatformLifecycleLock -RuntimeDir $runtimeDir

try {
$atlasVersion = Get-PlatformPythonAppVersion -ScriptPath $atlasScript
$paperfieldVersion = Get-PlatformPythonAppVersion -ScriptPath $paperfieldScript
$proxyToken = Get-PlatformProxyToken -RuntimeDir $runtimeDir
$env:PAPERFIELD_ATLAS_PROXY_TOKEN = $proxyToken
$env:RESEARCH_ATLAS_PAPERFIELD_PROXY_TOKEN = $proxyToken
    function Wait-Health {
        param(
            [string]$Url,
            [string]$Version,
            [string]$ProxyToken = "",
            [System.Diagnostics.Process]$Process,
            [int]$TimeoutSeconds = 90
        )

        $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
        do {
            Start-Sleep -Milliseconds 250
            if (Test-PlatformHealth -Url $Url -Version $Version -ProxyToken $ProxyToken) { return }
        } while ((Get-Date) -lt $deadline -and -not $Process.HasExited)
        throw "Service did not become ready at $Url"
    }

    $pythonExecutable = (Get-Command python -ErrorAction Stop).Source
    if (-not $pythonExecutable) { throw "Python is not available on PATH." }
    $pythonExecutable = [System.IO.Path]::GetFullPath($pythonExecutable)

    $atlasHealthy = Test-PlatformHealth -Url "http://127.0.0.1:8795/api/health" -Version $atlasVersion -ProxyToken $proxyToken
    $atlasProcess = Get-PlatformOwnedProcess -RuntimeDir $runtimeDir -Name "atlas" -Port 8795 -ExpectedScriptPath $atlasScript -CommandPattern $atlasPattern
    if ($atlasProcess -and -not $atlasHealthy) {
        $atlasHealthy = Test-PlatformHealth -Url "http://127.0.0.1:8795/api/health" -Version $atlasVersion -ProxyToken $proxyToken
    }
    if ($atlasHealthy) {
        if (-not $atlasProcess) {
            Write-Warning "Atlas is healthy, but this launcher has no verified ownership record; continuing without replacing it."
        }
    } else {
        if ($atlasProcess) {
            Stop-PlatformProcessAndConfirm -Process $atlasProcess -Name "atlas"
            Remove-PlatformProcessState -RuntimeDir $runtimeDir -Name "atlas"
        } else {
            Stop-PlatformService -RuntimeDir $runtimeDir -Name "atlas" -Port 8795 -ExpectedScriptPath $atlasScript -CommandPattern $atlasPattern
        }
        $atlasProcess = Start-Process -FilePath $pythonExecutable -ArgumentList @(
            $atlasScript,
            "--paperfield-url", "http://127.0.0.1:8765/",
            "--flowloom-url", "http://127.0.0.1:8765/flowloom/"
        ) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir "atlas.log") -RedirectStandardError (Join-Path $runtimeDir "atlas-error.log") -PassThru
        try {
            Write-PlatformProcessState -RuntimeDir $runtimeDir -Name "atlas" -Process $atlasProcess -ExecutablePath $pythonExecutable -ScriptPath $atlasScript -CommandPattern $atlasPattern -Port 8795 | Out-Null
            Wait-Health -Url "http://127.0.0.1:8795/api/health" -Version $atlasVersion -ProxyToken $proxyToken -Process $atlasProcess
        } catch {
            if (-not $atlasProcess.HasExited) { Stop-Process -Id $atlasProcess.Id -Force -ErrorAction SilentlyContinue }
            Remove-PlatformProcessState -RuntimeDir $runtimeDir -Name "atlas"
            throw
        }
    }

    $paperfieldHealthy = Test-PlatformHealth -Url "http://127.0.0.1:8765/api/health" -Version $paperfieldVersion
    $paperfieldProcess = Get-PlatformOwnedProcess -RuntimeDir $runtimeDir -Name "paperfield" -Port 8765 -ExpectedScriptPath $paperfieldScript -CommandPattern $paperfieldPattern
    if ($paperfieldProcess -and -not $paperfieldHealthy) {
        $paperfieldHealthy = Test-PlatformHealth -Url "http://127.0.0.1:8765/api/health" -Version $paperfieldVersion
    }

    Write-Output "Paperfield platform: http://127.0.0.1:8765/"
    Write-Output "Research Atlas:     http://127.0.0.1:8765/atlas/"
    Write-Output "Atlas learning:      http://127.0.0.1:8765/atlas/?view=curriculum"
    Write-Output "Flowloom:            http://127.0.0.1:8765/flowloom/"

    if ($Foreground) {
        if ($paperfieldHealthy) {
            throw "Paperfield is already running at http://127.0.0.1:8765/. Stop it before using -Foreground."
        }
        if ($paperfieldProcess) {
            Stop-PlatformProcessAndConfirm -Process $paperfieldProcess -Name "paperfield"
            Remove-PlatformProcessState -RuntimeDir $runtimeDir -Name "paperfield"
        }
        $env:PAPERFIELD_ATLAS_INTERNAL_URL = "http://127.0.0.1:8795"
        & $pythonExecutable $paperfieldScript
        exit $LASTEXITCODE
    }

    if ($paperfieldHealthy) {
        if (-not $paperfieldProcess) {
            Write-Warning "Paperfield is healthy, but this launcher has no verified ownership record; continuing without replacing it."
        }
        Write-Output "Platform services are already running in the background."
    } else {
        if ($paperfieldProcess) {
            Stop-PlatformProcessAndConfirm -Process $paperfieldProcess -Name "paperfield"
            Remove-PlatformProcessState -RuntimeDir $runtimeDir -Name "paperfield"
        } else {
            Stop-PlatformService -RuntimeDir $runtimeDir -Name "paperfield" -Port 8765 -ExpectedScriptPath $paperfieldScript -CommandPattern $paperfieldPattern
        }

        $previousAtlasUrl = $env:PAPERFIELD_ATLAS_INTERNAL_URL
        $env:PAPERFIELD_ATLAS_INTERNAL_URL = "http://127.0.0.1:8795"
        try {
            $paperfieldProcess = Start-Process -FilePath $pythonExecutable -ArgumentList @($paperfieldScript) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir "paperfield.log") -RedirectStandardError (Join-Path $runtimeDir "paperfield-error.log") -PassThru
        } finally {
            if ($null -eq $previousAtlasUrl) { Remove-Item Env:PAPERFIELD_ATLAS_INTERNAL_URL -ErrorAction SilentlyContinue }
            else { $env:PAPERFIELD_ATLAS_INTERNAL_URL = $previousAtlasUrl }
        }
        try {
            Write-PlatformProcessState -RuntimeDir $runtimeDir -Name "paperfield" -Process $paperfieldProcess -ExecutablePath $pythonExecutable -ScriptPath $paperfieldScript -CommandPattern $paperfieldPattern -Port 8765 | Out-Null
            Wait-Health -Url "http://127.0.0.1:8765/api/health" -Version $paperfieldVersion -Process $paperfieldProcess -TimeoutSeconds 180
        } catch {
            if (-not $paperfieldProcess.HasExited) { Stop-Process -Id $paperfieldProcess.Id -Force -ErrorAction SilentlyContinue }
            Remove-PlatformProcessState -RuntimeDir $runtimeDir -Name "paperfield"
            throw
        }
        Write-Output "Platform services are running in the background."
    }

    $workerDiagnostics = $null
    try {
        $workerDiagnosticsText = & $pythonExecutable $workerScript --diagnostics 2>$null
        if ($LASTEXITCODE -eq 0 -and $workerDiagnosticsText) {
            $workerDiagnostics = ($workerDiagnosticsText -join "`n") | ConvertFrom-Json
        }
    } catch {}
    $workerConfigured = $workerDiagnostics -and $workerDiagnostics.config.ready -eq $true
    $workerProcess = Get-PlatformOwnedProcess -RuntimeDir $runtimeDir -Name "atlas-worker" -Port 0 -ExpectedScriptPath $workerScript -CommandPattern $workerPattern

    if (-not $workerConfigured) {
        if ($workerProcess) {
            Stop-PlatformProcessAndConfirm -Process $workerProcess -Name "atlas-worker"
            Remove-PlatformProcessState -RuntimeDir $runtimeDir -Name "atlas-worker"
        }
        Write-Output "Atlas analysis worker: disabled (dedicated configuration is incomplete)."
    } else {
        $workerConnected = $false
        $workerHealth = $null
        try {
            $workerHealth = Invoke-RestMethod -Uri "http://127.0.0.1:8795/api/health" -TimeoutSec 2
            $workerConnected = $workerHealth.worker_connected -eq $true
        } catch {}

        $externalWorkerActive = $false
        if ($workerConnected -and -not $workerProcess) {
            $workerInspectionAvailable = $false
            try {
                $workerCandidates = @(Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction Stop)
                $workerInspectionAvailable = $true
                $externalWorkerActive = @(
                    $workerCandidates | Where-Object { [string]$_.CommandLine -match $workerPattern }
                ).Count -gt 0
            } catch {}

            # A recent heartbeat is persisted in SQLite and can survive an
            # Atlas restart.  If process inspection is restricted, distinguish
            # a live external worker from stale state by observing advancement.
            if (-not $externalWorkerActive -and -not $workerInspectionAvailable) {
                $initialLastSeen = [string]$workerHealth.worker_last_seen
                $observationDeadline = (Get-Date).AddSeconds(10)
                do {
                    Start-Sleep -Milliseconds 500
                    try {
                        $workerHealth = Invoke-RestMethod -Uri "http://127.0.0.1:8795/api/health" -TimeoutSec 2
                        $externalWorkerActive = (
                            $workerHealth.worker_connected -eq $true -and
                            [string]$workerHealth.worker_last_seen -and
                            [string]$workerHealth.worker_last_seen -ne $initialLastSeen
                        )
                    } catch {}
                } while (-not $externalWorkerActive -and (Get-Date) -lt $observationDeadline)
            }

            if (-not $externalWorkerActive) {
                $workerConnected = $false
            }
        }

        if ($externalWorkerActive) {
            Write-Warning "Atlas reports a connected worker, but this launcher has no verified ownership record; continuing without starting a duplicate."
        } else {
            if (-not $workerProcess) {
                $workerProcess = Start-Process -FilePath $pythonExecutable -ArgumentList @($workerScript) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir "atlas-worker.log") -RedirectStandardError (Join-Path $runtimeDir "atlas-worker-error.log") -PassThru
                try {
                    Write-PlatformProcessState -RuntimeDir $runtimeDir -Name "atlas-worker" -Process $workerProcess -ExecutablePath $pythonExecutable -ScriptPath $workerScript -CommandPattern $workerPattern -Port 0 | Out-Null
                    Start-Sleep -Milliseconds 500
                    if ($workerProcess.HasExited) {
                        throw "Atlas analysis worker exited during startup."
                    }
                } catch {
                    if (-not $workerProcess.HasExited) { Stop-Process -Id $workerProcess.Id -Force -ErrorAction SilentlyContinue }
                    Remove-PlatformProcessState -RuntimeDir $runtimeDir -Name "atlas-worker"
                    throw
                }
            }

            $deadline = (Get-Date).AddSeconds(20)
            do {
                Start-Sleep -Milliseconds 250
                try {
                    $workerConnected = (Invoke-RestMethod -Uri "http://127.0.0.1:8795/api/health" -TimeoutSec 2).worker_connected -eq $true
                } catch {
                    $workerConnected = $false
                }
            } while (-not $workerConnected -and (Get-Date) -lt $deadline -and -not $workerProcess.HasExited)
            if (-not $workerConnected) {
                throw "Atlas analysis worker did not connect within 20 seconds. Check local\platform\atlas-worker-error.log."
            }
            Write-Output "Atlas analysis worker: connected."
        }
    }
} finally {
    if ($lifecycleLock) { $lifecycleLock.Dispose() }
}
