@echo off
echo Installing Wrangler CLI...
cd /d c:\vigsharm-shop\worker
call npm install wrangler@3.78.0 --save-dev
if errorlevel 1 (
    echo Installation failed
    exit /b 1
)
echo Installation successful
echo Checking wrangler...
if exist node_modules\.bin\wrangler.cmd (
    echo Wrangler found!
    node_modules\.bin\wrangler.cmd --version
) else (
    echo Wrangler not found
)
pause
