@echo off
cd /d c:\vigsharm-shop\worker
echo Starting Wrangler deployment...
echo.

npx wrangler deploy --no-bundle > deploy-result.txt 2>&1

echo.
echo Deployment output saved to deploy-result.txt
echo.
type deploy-result.txt
