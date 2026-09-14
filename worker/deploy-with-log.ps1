Write-Host "`n🚀 Deploying VigSharm Worker to Cloudflare..." -ForegroundColor Cyan
Write-Host "Saving output to deploy-output.txt`n" -ForegroundColor Yellow

Set-Location "c:\vigsharm-shop\worker"

$output = npx wrangler deploy 2>&1 | Tee-Object -FilePath "deploy-output.txt"

Write-Host "`n📄 Deployment output saved to deploy-output.txt" -ForegroundColor Green
Write-Host "`nChecking deployment status..." -ForegroundColor Cyan

Get-Content "deploy-output.txt" -Tail 20
