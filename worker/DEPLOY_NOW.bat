@echo off
echo.
echo ========================================
echo    DEPLOYING VIGSHARM WORKER
echo ========================================
echo.
cd /d "%~dp0"
npx wrangler deploy
echo.
echo ========================================
echo    DEPLOYMENT COMPLETE
echo ========================================
echo.
pause
