$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$localRoot = Join-Path $projectRoot "local"
$envPath = Join-Path $localRoot ".env"
New-Item -ItemType Directory -Force -Path $localRoot | Out-Null

Write-Host "Paperfield Cloudflare R2 setup" -ForegroundColor Green
Write-Host "Credentials stay in the local .env file. Secret input is hidden."

$accountId = (Read-Host "Cloudflare Account ID").Trim()
if ($accountId -notmatch '^[a-fA-F0-9]{32}$') {
    throw "Account ID must be a 32-character hexadecimal string."
}

$defaultBucket = "paperfield-private"
$bucket = (Read-Host "R2 bucket name [$defaultBucket]").Trim()
if (-not $bucket) { $bucket = $defaultBucket }
if ($bucket -notmatch '^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$') {
    throw "Invalid R2 bucket name."
}

$accessKey = (Read-Host "Access Key ID").Trim()
if (-not $accessKey -or $accessKey.Contains("`n") -or $accessKey.Contains("`r")) {
    throw "Access Key ID cannot be empty."
}

$secureSecret = Read-Host "Secret Access Key" -AsSecureString
$secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSecret)
try {
    $secretKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
    if (-not $secretKey -or $secretKey.Contains("`n") -or $secretKey.Contains("`r")) {
        throw "Secret Access Key cannot be empty."
    }

    $lines = @(
        "PAPERFIELD_S3_PROVIDER=Cloudflare R2",
        "PAPERFIELD_S3_ENDPOINT=https://$accountId.r2.cloudflarestorage.com",
        "PAPERFIELD_S3_REGION=auto",
        "PAPERFIELD_S3_BUCKET=$bucket",
        "PAPERFIELD_S3_ACCESS_KEY_ID=$accessKey",
        "PAPERFIELD_S3_SECRET_ACCESS_KEY=$secretKey",
        "PAPERFIELD_R2_BILLING_CYCLE_DAY=11"
    )
    [System.IO.File]::WriteAllText($envPath, ($lines -join [Environment]::NewLine) + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
}
finally {
    if ($secretPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
    }
    $secretKey = $null
}

Write-Host "Saved to $envPath" -ForegroundColor Green
Write-Host "Next: restart Paperfield, then click Refresh inventory in Storage usage."
