param(
    [switch]$TestFlowloom
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$flowloom = Join-Path $root "apps\flowloom"
$flowloomBuild = $flowloom
$temporaryBuild = $null
$temporaryBuildRoot = [System.IO.Path]::GetFullPath((Join-Path $root "tmp"))
$npmCache = Join-Path $temporaryBuildRoot "npm-cache"
$flowloomStagedDist = $null

Set-Location $root

function Enter-PlatformBuildLock {
    param([Parameter(Mandatory = $true)][string]$BuildRoot, [int]$TimeoutSeconds = 1200)

    New-Item -ItemType Directory -Path $BuildRoot -Force | Out-Null
    $lockPath = Join-Path $BuildRoot "platform-build.lock"
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
                throw "Another Paperfield platform build is still in progress."
            }
            Start-Sleep -Milliseconds 250
        }
    } while ($true)
}

function Invoke-PlatformNative {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$ArgumentList,
        [string]$FailureMessage = "Native command failed."
    )

    # Windows PowerShell 5 surfaces native stderr as ErrorRecord objects. npm
    # writes ordinary audit and deprecation notices there, so judge native
    # commands by their exit code while keeping the diagnostic text visible.
    $previousErrorPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & $FilePath @ArgumentList 2>&1 | ForEach-Object { Write-Output $_ }
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorPreference
    }
    if ($exitCode -ne 0) {
        throw "$FailureMessage Exit code: $exitCode"
    }
}

function Publish-PlatformDirectory {
    param(
        [Parameter(Mandatory = $true)][string]$StagedDirectory,
        [Parameter(Mandatory = $true)][string]$TargetDirectory,
        [Parameter(Mandatory = $true)][string]$BackupPrefix
    )

    if (-not (Test-Path -LiteralPath (Join-Path $StagedDirectory "index.html"))) {
        throw "Staged platform directory does not contain index.html: $StagedDirectory"
    }

    $backup = Join-Path $temporaryBuildRoot (
        $BackupPrefix + "-" + (Get-Date -Format "yyyyMMdd-HHmmss") + "-" + [guid]::NewGuid().ToString("N")
    )
    $targetMoved = $false
    try {
        if (Test-Path -LiteralPath $TargetDirectory) {
            Move-Item -LiteralPath $TargetDirectory -Destination $backup
            $targetMoved = $true
        }
        Move-Item -LiteralPath $StagedDirectory -Destination $TargetDirectory
    } catch {
        if ($targetMoved -and
            -not (Test-Path -LiteralPath $TargetDirectory) -and
            (Test-Path -LiteralPath $backup)) {
            Move-Item -LiteralPath $backup -Destination $TargetDirectory
        }
        throw
    }

    if ($targetMoved -and (Test-Path -LiteralPath $backup)) {
        Remove-Item -LiteralPath $backup -Recurse -Force
    }
}

$buildLock = Enter-PlatformBuildLock -BuildRoot $temporaryBuildRoot
try {
    if (-not (Test-Path -LiteralPath (Join-Path $flowloom "node_modules\.bin\tsc.cmd"))) {
        New-Item -ItemType Directory -Path $temporaryBuildRoot -Force | Out-Null
        $temporaryBuild = Join-Path $temporaryBuildRoot ("flowloom-build-$PID-" + [guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Path $temporaryBuild -Force | Out-Null
        foreach ($name in @("docs", "public", "scripts", "src")) {
            Copy-Item -LiteralPath (Join-Path $flowloom $name) -Destination $temporaryBuild -Recurse -Force
        }
        foreach ($name in @(
            ".env.example", "index.html", "package-lock.json", "package.json",
            "tsconfig.app.json", "tsconfig.json", "tsconfig.node.json",
            "vite.config.ts", "vitest.config.ts"
        )) {
            Copy-Item -LiteralPath (Join-Path $flowloom $name) -Destination $temporaryBuild -Force
        }
        $flowloomBuild = $temporaryBuild
        Write-Output "Installing Flowloom dependencies in temporary build workspace..."
        Invoke-PlatformNative -FilePath "npm.cmd" -ArgumentList @(
            "--prefix", $flowloomBuild,
            "ci",
            "--cache", $npmCache,
            "--prefer-offline",
            "--no-audit",
            "--no-fund",
            "--progress=false"
        ) -FailureMessage "Flowloom dependency installation failed."
    }

    if ($TestFlowloom) {
        Write-Output "Testing Flowloom..."
        Invoke-PlatformNative -FilePath "npm.cmd" -ArgumentList @("--prefix", $flowloomBuild, "run", "test") -FailureMessage "Flowloom tests failed."
    }

    Write-Output "Building Flowloom..."
    $flowloomStagedDist = Join-Path $temporaryBuildRoot (
        "flowloom-dist-stage-$PID-" + [guid]::NewGuid().ToString("N")
    )
    Invoke-PlatformNative -FilePath "npm.cmd" -ArgumentList @(
        "--prefix", $flowloomBuild,
        "run", "build", "--",
        "--outDir", $flowloomStagedDist
    ) -FailureMessage "Flowloom production build failed."
    Publish-PlatformDirectory `
        -StagedDirectory $flowloomStagedDist `
        -TargetDirectory (Join-Path $flowloom "dist") `
        -BackupPrefix "flowloom-dist-backup"
    $flowloomStagedDist = $null

    Write-Output "Platform web assets are ready."
} finally {
    if ($temporaryBuild -and (Test-Path -LiteralPath $temporaryBuild)) {
        $resolvedTemp = [System.IO.Path]::GetFullPath($temporaryBuild)
        $resolvedParent = [System.IO.Directory]::GetParent($resolvedTemp)
        $isDirectBuildChild = $resolvedParent -and
            $resolvedParent.FullName.Equals($temporaryBuildRoot, [System.StringComparison]::OrdinalIgnoreCase) -and
            [System.IO.Path]::GetFileName($resolvedTemp).StartsWith("flowloom-build-", [System.StringComparison]::Ordinal)
        if ($isDirectBuildChild) {
            Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
        }
    }
    foreach ($stagedDirectory in @($flowloomStagedDist)) {
        if (-not $stagedDirectory -or -not (Test-Path -LiteralPath $stagedDirectory)) {
            continue
        }
        $resolvedStage = [System.IO.Path]::GetFullPath($stagedDirectory)
        $resolvedParent = [System.IO.Directory]::GetParent($resolvedStage)
        $stageName = [System.IO.Path]::GetFileName($resolvedStage)
        $isDirectStageChild = $resolvedParent -and
            $resolvedParent.FullName.Equals($temporaryBuildRoot, [System.StringComparison]::OrdinalIgnoreCase) -and
            $stageName.StartsWith("flowloom-dist-stage-", [System.StringComparison]::Ordinal)
        if ($isDirectStageChild) {
            Remove-Item -LiteralPath $resolvedStage -Recurse -Force
        }
    }
    if ($buildLock) { $buildLock.Dispose() }
}
