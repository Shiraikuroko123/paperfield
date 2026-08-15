# Shared process ownership helpers for the unified Paperfield platform.
# Process metadata written by the launcher is the ownership record. CIM and
# listener inspection are optional compatibility evidence because restricted
# Windows sessions may deny both while Get-Process remains available.

function Normalize-PlatformProcessEnvironment {
    <#
    Windows PowerShell 5.1 can inherit PATH twice with different casing (PATH
    and Path).  Start-Process builds a case-insensitive environment dictionary
    when output is redirected and rejects that otherwise harmless duplicate.
    Keep the first resolved value and expose one canonical Path entry to child
    processes.  Other environment variables, including proxy credentials, are
    intentionally left untouched.
    #>
    $pathValue = [Environment]::GetEnvironmentVariable("PATH", "Process")
    if ($null -eq $pathValue) { return }

    $pathKeys = @(
        [Environment]::GetEnvironmentVariables("Process").GetEnumerator() |
            Where-Object { [string]$_.Key -ieq "PATH" } |
            ForEach-Object { [string]$_.Key }
    )
    if ($pathKeys.Count -le 1) { return }

    # Env: is case-insensitive, so removing Path removes the duplicate key
    # selected by the provider.  Re-add the preserved value once.
    Remove-Item Env:Path -ErrorAction SilentlyContinue
    $env:Path = $pathValue
}

function Get-PlatformProxyToken {
    param(
        [Parameter(Mandatory = $true)][string]$RuntimeDir
    )

    $paperfieldValue = [Environment]::GetEnvironmentVariable("PAPERFIELD_ATLAS_PROXY_TOKEN", "Process")
    $atlasValue = [Environment]::GetEnvironmentVariable("RESEARCH_ATLAS_PAPERFIELD_PROXY_TOKEN", "Process")
    if ($null -eq $paperfieldValue) { $paperfieldValue = "" }
    if ($null -eq $atlasValue) { $atlasValue = "" }
    $paperfieldValue = $paperfieldValue.Trim()
    $atlasValue = $atlasValue.Trim()
    if ($paperfieldValue -and $atlasValue -and $paperfieldValue -cne $atlasValue) {
        throw "Paperfield and Atlas proxy tokens are configured with different values."
    }

    $tokenPath = Join-Path $RuntimeDir "atlas-proxy-token"
    $token = if ($paperfieldValue) { $paperfieldValue } elseif ($atlasValue) { $atlasValue } else { "" }
    if (-not $token -and (Test-Path -LiteralPath $tokenPath -PathType Leaf)) {
        $token = (Get-Content -LiteralPath $tokenPath -Raw -Encoding ASCII).Trim()
    }
    if ($token -and $token.Length -lt 32) {
        throw "The unified platform proxy token must contain at least 32 characters."
    }
    if (-not $token) {
        $bytes = New-Object byte[] 48
        $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        try {
            $generator.GetBytes($bytes)
        } finally {
            $generator.Dispose()
        }
        $token = [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
    }

    New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
    $temporaryPath = "$tokenPath.tmp"
    Set-Content -LiteralPath $temporaryPath -Value $token -Encoding ASCII -NoNewline
    Move-Item -LiteralPath $temporaryPath -Destination $tokenPath -Force
    return $token
}

function Test-PlatformPathEqual {
    param([string]$Left, [string]$Right)

    if ([string]::IsNullOrWhiteSpace($Left) -or [string]::IsNullOrWhiteSpace($Right)) {
        return $false
    }
    try {
        $leftPath = [System.IO.Path]::GetFullPath($Left).TrimEnd('\', '/')
        $rightPath = [System.IO.Path]::GetFullPath($Right).TrimEnd('\', '/')
        return $leftPath.Equals($rightPath, [System.StringComparison]::OrdinalIgnoreCase)
    } catch {
        return $false
    }
}

function Get-PlatformPythonAppVersion {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $match = Select-String -LiteralPath $ScriptPath -Pattern '^APP_VERSION\s*=\s*"([^"]+)"' |
        Select-Object -First 1
    if (-not $match -or $match.Matches.Count -ne 1) {
        throw "APP_VERSION was not found in $ScriptPath"
    }
    return $match.Matches[0].Groups[1].Value
}

function Enter-PlatformLifecycleLock {
    param(
        [Parameter(Mandatory = $true)][string]$RuntimeDir,
        [int]$TimeoutSeconds = 60
    )

    New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
    $lockPath = Join-Path $RuntimeDir "lifecycle.lock"
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try {
            return [System.IO.File]::Open(
                $lockPath,
                [System.IO.FileMode]::OpenOrCreate,
                [System.IO.FileAccess]::ReadWrite,
                [System.IO.FileShare]::None
            )
        } catch [System.IO.IOException] {
            if ((Get-Date) -ge $deadline) {
                throw "Another Paperfield platform lifecycle operation is still in progress."
            }
            Start-Sleep -Milliseconds 200
        }
    } while ($true)
}

function Get-PlatformListeners {
    param([Parameter(Mandatory = $true)][int]$Port)

    try {
        if (-not (Get-Command -Name Get-NetTCPConnection -ErrorAction SilentlyContinue)) {
            return @()
        }
        return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop)
    } catch {
        return @()
    }
}

function Get-PlatformDotNetProcess {
    param([Parameter(Mandatory = $true)][int]$ProcessId)

    if ($ProcessId -le 0) { return $null }
    try {
        return Get-Process -Id $ProcessId -ErrorAction Stop
    } catch {
        return $null
    }
}

function Get-PlatformCimProcess {
    param([Parameter(Mandatory = $true)][int]$ProcessId)

    try {
        return Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction Stop
    } catch {
        return $null
    }
}

function Get-PlatformProcessExecutable {
    param([Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process)

    try {
        $path = [string]$Process.Path
        if ($path) { return [System.IO.Path]::GetFullPath($path) }
    } catch {}
    try {
        $path = [string]$Process.MainModule.FileName
        if ($path) { return [System.IO.Path]::GetFullPath($path) }
    } catch {}
    return ""
}

function Get-PlatformProcessStart {
    param([Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process)

    try {
        $start = $Process.StartTime
        return [pscustomobject]@{
            Ticks = [Int64]$start.Ticks
            Iso = $start.ToUniversalTime().ToString("o")
        }
    } catch {
        return $null
    }
}

function Read-PlatformProcessState {
    param(
        [Parameter(Mandatory = $true)][string]$RuntimeDir,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $metadataPath = Join-Path $RuntimeDir "$Name.process.json"
    if (Test-Path -LiteralPath $metadataPath) {
        try {
            $metadata = Get-Content -LiteralPath $metadataPath -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($metadata -and [int]$metadata.pid -gt 0) { return $metadata }
        } catch {
            throw "The $Name process metadata is malformed: $metadataPath"
        }
    }

    $pidPath = Join-Path $RuntimeDir "$Name.pid"
    if (Test-Path -LiteralPath $pidPath) {
        try {
            $processId = [int](Get-Content -LiteralPath $pidPath -Raw -Encoding UTF8).Trim()
            if ($processId -gt 0) {
                return [pscustomobject]@{
                    schema_version = 0
                    name = $Name
                    pid = $processId
                    port = 0
                    script_path = ""
                    executable_path = ""
                    started_ticks = [Int64]0
                    started_at_utc = ""
                }
            }
        } catch {
            throw "The legacy $Name PID file is malformed: $pidPath"
        }
    }
    return $null
}

function Write-PlatformProcessState {
    param(
        [Parameter(Mandatory = $true)][string]$RuntimeDir,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process,
        [Parameter(Mandatory = $true)][string]$ExecutablePath,
        [Parameter(Mandatory = $true)][string]$ScriptPath,
        [Parameter(Mandatory = $true)][string]$CommandPattern,
        [Parameter(Mandatory = $true)][int]$Port
    )

    $start = Get-PlatformProcessStart $Process
    if (-not $start) { throw "Could not read the start time for $Name process $($Process.Id)." }
    if (-not (Test-Path -LiteralPath $ExecutablePath -PathType Leaf)) {
        throw "Could not record the $Name executable path: $ExecutablePath"
    }
    if (-not (Test-Path -LiteralPath $ScriptPath -PathType Leaf)) {
        throw "Could not record the $Name script path: $ScriptPath"
    }

    $resolvedExecutable = [System.IO.Path]::GetFullPath($ExecutablePath)
    $resolvedScript = [System.IO.Path]::GetFullPath($ScriptPath)
    $actualExecutable = Get-PlatformProcessExecutable $Process
    if (-not $actualExecutable -or -not (Test-PlatformPathEqual $actualExecutable $resolvedExecutable)) {
        throw "The $Name process executable does not match the launcher executable."
    }
    $state = [ordered]@{
        schema_version = 2
        name = $Name
        pid = [int]$Process.Id
        port = $Port
        executable_path = $resolvedExecutable
        script_path = $resolvedScript
        command_pattern = $CommandPattern
        started_ticks = [Int64]$start.Ticks
        started_at_utc = $start.Iso
        recorded_at_utc = (Get-Date).ToUniversalTime().ToString("o")
    }

    New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
    $metadataPath = Join-Path $RuntimeDir "$Name.process.json"
    $temporaryPath = Join-Path $RuntimeDir "$Name.process.json.tmp"
    $state | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $temporaryPath -Encoding UTF8
    Move-Item -LiteralPath $temporaryPath -Destination $metadataPath -Force
    Set-Content -LiteralPath (Join-Path $RuntimeDir "$Name.pid") -Value ([int]$Process.Id) -Encoding UTF8
    return [pscustomobject]$state
}

function Remove-PlatformProcessState {
    param(
        [Parameter(Mandatory = $true)][string]$RuntimeDir,
        [Parameter(Mandatory = $true)][string]$Name
    )

    foreach ($path in @(
        (Join-Path $RuntimeDir "$Name.pid"),
        (Join-Path $RuntimeDir "$Name.process.json"),
        (Join-Path $RuntimeDir "$Name.process.json.tmp")
    )) {
        Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
    }
}

function Test-PlatformProcessState {
    param(
        [Parameter(Mandatory = $true)][object]$State,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][int]$Port,
        [Parameter(Mandatory = $true)][string]$ExpectedScriptPath,
        [Parameter(Mandatory = $true)][string]$CommandPattern
    )

    $result = [ordered]@{ Valid = $false; Missing = $false; Reason = ""; Process = $null }
    $schemaVersion = 0
    try { $schemaVersion = [int]$State.schema_version } catch {}
    if ($schemaVersion -ne 2) {
        $result.Reason = "process metadata schema $schemaVersion does not contain verified start, executable, and script paths"
        return [pscustomobject]$result
    }
    if ([string]$State.name -ne $Name -or [int]$State.port -ne $Port) {
        $result.Reason = "service name or port does not match"
        return [pscustomobject]$result
    }
    if (-not (Test-PlatformPathEqual ([string]$State.script_path) $ExpectedScriptPath)) {
        $result.Reason = "recorded script path does not match $ExpectedScriptPath"
        return [pscustomobject]$result
    }

    $processId = 0
    $expectedTicks = [Int64]0
    try {
        $processId = [int]$State.pid
        $expectedTicks = [Int64]$State.started_ticks
    } catch {}
    if ($processId -le 0 -or $expectedTicks -le 0) {
        $result.Reason = "PID or start time is invalid"
        return [pscustomobject]$result
    }

    $process = Get-PlatformDotNetProcess $processId
    if (-not $process) {
        $result.Missing = $true
        $result.Reason = "recorded PID no longer exists"
        return [pscustomobject]$result
    }
    $result.Process = $process

    $actualStart = Get-PlatformProcessStart $process
    if (-not $actualStart -or $actualStart.Ticks -ne $expectedTicks) {
        $result.Reason = "process start time does not match the ownership record"
        return [pscustomobject]$result
    }

    $actualExecutable = Get-PlatformProcessExecutable $process
    if (-not $actualExecutable) {
        $result.Reason = "process executable path is not inspectable"
        return [pscustomobject]$result
    }
    if (-not (Test-PlatformPathEqual $actualExecutable ([string]$State.executable_path))) {
        $result.Reason = "process executable path does not match the ownership record"
        return [pscustomobject]$result
    }

    # When CIM is available, a mismatched command line is additional evidence
    # that this PID is no longer the process launched by Paperfield.
    $cim = Get-PlatformCimProcess $processId
    if ($cim -and -not [string]::IsNullOrWhiteSpace([string]$cim.CommandLine) -and
        [string]$cim.CommandLine -notmatch $CommandPattern) {
        $result.Reason = "inspectable process command line does not match the expected service script"
        return [pscustomobject]$result
    }

    $result.Valid = $true
    return [pscustomobject]$result
}

function Get-PlatformOwnedProcess {
    param(
        [Parameter(Mandatory = $true)][string]$RuntimeDir,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][int]$Port,
        [Parameter(Mandatory = $true)][string]$ExpectedScriptPath,
        [Parameter(Mandatory = $true)][string]$CommandPattern
    )

    $state = Read-PlatformProcessState -RuntimeDir $RuntimeDir -Name $Name
    if (-not $state) { return $null }
    $check = Test-PlatformProcessState -State $state -Name $Name -Port $Port -ExpectedScriptPath $ExpectedScriptPath -CommandPattern $CommandPattern
    if ($check.Missing) {
        Remove-PlatformProcessState -RuntimeDir $RuntimeDir -Name $Name
        return $null
    }
    if ($check.Valid) { return $check.Process }
    Write-Warning "Ignored unverified $Name process metadata: $($check.Reason)."
    return $null
}

function Test-PlatformHealth {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [string]$Version = "",
        [string]$ProxyToken = ""
    )

    try {
        $headers = @{}
        if ($ProxyToken) { $headers["X-Atlas-Proxy-Token"] = $ProxyToken }
        if ($headers.Count) {
            $health = Invoke-RestMethod -Uri $Url -Headers $headers -TimeoutSec 2
        } else {
            $health = Invoke-RestMethod -Uri $Url -TimeoutSec 2
        }
        if ($health.status -ne "ok" -or ($Version -and $health.version -ne $Version)) {
            return $false
        }
        if ($ProxyToken -and $health.proxy_token_match -ne $true) {
            return $false
        }
        return $true
    } catch {
        return $false
    }
}

function Stop-PlatformProcessAndConfirm {
    param(
        [Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $processId = [int]$Process.Id
    try {
        Stop-Process -Id $processId -Force -ErrorAction Stop
    } catch {
        throw "Could not stop $Name process $processId`: $($_.Exception.Message)"
    }

    $deadline = (Get-Date).AddSeconds(10)
    do {
        if (-not (Get-PlatformDotNetProcess $processId)) { return }
        Start-Sleep -Milliseconds 100
    } while ((Get-Date) -lt $deadline)

    if (Get-PlatformDotNetProcess $processId) {
        throw "$Name process $processId did not exit."
    }
}

function Stop-PlatformService {
    param(
        [Parameter(Mandatory = $true)][string]$RuntimeDir,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][int]$Port,
        [Parameter(Mandatory = $true)][string]$ExpectedScriptPath,
        [Parameter(Mandatory = $true)][string]$CommandPattern,
        [string]$HealthUrl = "",
        [string]$HealthVersion = ""
    )

    $state = Read-PlatformProcessState -RuntimeDir $RuntimeDir -Name $Name
    if ($state) {
        $check = Test-PlatformProcessState -State $state -Name $Name -Port $Port -ExpectedScriptPath $ExpectedScriptPath -CommandPattern $CommandPattern
        if ($check.Missing) {
            Remove-PlatformProcessState -RuntimeDir $RuntimeDir -Name $Name
        } elseif (-not $check.Valid) {
            throw "Refused to stop ${Name}: $($check.Reason). Ownership metadata was retained."
        } else {
            Stop-PlatformProcessAndConfirm -Process $check.Process -Name $Name
            Remove-PlatformProcessState -RuntimeDir $RuntimeDir -Name $Name
            Write-Output "Stopped $Name ($($check.Process.Id)) using verified launcher metadata."
            return
        }
    }

    # Legacy recovery requires both a listener owner and an inspectable matching
    # command line. Without that evidence, leave the process untouched.
    foreach ($listener in (Get-PlatformListeners -Port $Port)) {
        $processId = [int]$listener.OwningProcess
        $process = Get-PlatformDotNetProcess $processId
        $cim = Get-PlatformCimProcess $processId
        if ($process -and $cim -and [string]$cim.CommandLine -match $CommandPattern) {
            Stop-PlatformProcessAndConfirm -Process $process -Name $Name
            Remove-PlatformProcessState -RuntimeDir $RuntimeDir -Name $Name
            Write-Output "Stopped $Name ($processId) using verified listener recovery."
            return
        }
        if ($process) {
            throw "Refused to stop ${Name}: port $Port belongs to an unverified process $processId."
        }
    }

    if ($HealthUrl -and (Test-PlatformHealth -Url $HealthUrl -Version $HealthVersion)) {
        throw "Refused to stop ${Name}: the service is healthy but no verified ownership record is available."
    }
}
