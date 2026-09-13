@echo off
echo ================================================
echo   DEPLOY VIGSHARM WORKER TO CLOUDFLARE
echo ================================================
echo.
echo Deploying from: %CD%
echo.
cd /d "%~dp0"
call npx wrangler deploy
echo.
echo ================================================
echo   DEPLOYMENT COMPLETE
echo ================================================
echo.
echo Now run tests: cd c:\vigsharm-shop ^&^& node test-api.js
echo.
pause
