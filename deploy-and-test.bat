@echo off
cd c:\vigsharm-shop\worker
echo Deploying worker...
call npm run deploy
cd ..
echo.
echo Running tests...
node test-api.js
pause
