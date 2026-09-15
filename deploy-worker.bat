@echo off
echo ================================================
echo Deploying VigSharm Worker with Job ID Fix
echo ================================================
cd /d c:\vigsharm-shop\worker
echo.
echo Running wrangler deploy...
call npx wrangler deploy
echo.
echo Deploy completed!
pause
