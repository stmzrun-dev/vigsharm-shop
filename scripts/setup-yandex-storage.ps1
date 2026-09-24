# Setup Yandex Object Storage secrets for VigSharm Worker
# Prerequisites: bucket vigsharm-photos + static access key in Yandex Cloud

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\worker')

Write-Host ''
Write-Host '=== Yandex setup (do this in console first) ==='
Write-Host '1. console.yandex.cloud -> Object Storage -> bucket vigsharm-photos (public read)'
Write-Host '2. Service account + role storage.editor'
Write-Host '3. Create static access key -> copy Key ID and Secret'
Write-Host ''

$access = Read-Host 'Paste YANDEX_ACCESS_KEY_ID (Key ID)'
$secretPlain = Read-Host 'Paste YANDEX_SECRET_ACCESS_KEY (Secret)'
$bucket = Read-Host 'Bucket name [vigsharm-photos]'
if ([string]::IsNullOrWhiteSpace($bucket)) { $bucket = 'vigsharm-photos' }

if ([string]::IsNullOrWhiteSpace($access) -or [string]::IsNullOrWhiteSpace($secretPlain)) {
  throw 'Access Key ID and Secret are required'
}

$tomlPath = Join-Path (Get-Location) 'wrangler.toml'
$toml = Get-Content -Path $tomlPath -Raw -Encoding UTF8
if ($toml -notmatch 'YANDEX_BUCKET\s*=') {
  throw 'YANDEX_BUCKET missing in wrangler.toml'
}
$toml = [regex]::Replace($toml, 'YANDEX_BUCKET\s*=\s*"[^"]*"', ('YANDEX_BUCKET = "' + $bucket + '"'))
[System.IO.File]::WriteAllText($tomlPath, $toml, [System.Text.UTF8Encoding]::new($false))

Write-Host ''
Write-Host 'Writing secrets to Cloudflare Worker...'
$access.Trim() | npx wrangler secret put YANDEX_ACCESS_KEY_ID
if ($LASTEXITCODE -ne 0) { throw 'wrangler secret put YANDEX_ACCESS_KEY_ID failed' }

$secretPlain.Trim() | npx wrangler secret put YANDEX_SECRET_ACCESS_KEY
if ($LASTEXITCODE -ne 0) { throw 'wrangler secret put YANDEX_SECRET_ACCESS_KEY failed' }

Write-Host 'Deploying Worker...'
npx wrangler deploy
if ($LASTEXITCODE -ne 0) { throw 'wrangler deploy failed' }

Write-Host ''
Write-Host 'Done.'
Write-Host ('Test upload in admin. URL should look like: https://storage.yandexcloud.net/' + $bucket + '/products/....jpg')
Write-Host 'After that you can clear ImgBB key in admin settings.'
