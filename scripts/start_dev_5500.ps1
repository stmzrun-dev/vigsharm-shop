# Free port 5500, then start exactly one VigSharm dev server.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Get-PortPids([int]$Port) {
    $pids = @()
    try {
        $pids = @(
            Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
                Select-Object -ExpandProperty OwningProcess -Unique
        )
    } catch {
        $pids = @()
    }
    if (-not $pids -or $pids.Count -eq 0) {
        $lines = netstat -ano | Select-String ":$Port\s+.*LISTENING"
        foreach ($line in $lines) {
            $parts = ($line.ToString() -split "\s+") | Where-Object { $_ -ne "" }
            if ($parts.Count -ge 5) {
                $owningPid = [int]$parts[-1]
                if ($owningPid -gt 0) { $pids += $owningPid }
            }
        }
        $pids = $pids | Select-Object -Unique
    }
    return @($pids)
}

$existing = Get-PortPids 5500
foreach ($procId in $existing) {
    Write-Host "KILL  PID $procId on :5500"
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Milliseconds 400

$left = Get-PortPids 5500
if ($left.Count -gt 0) {
    Write-Host "FAIL  still listening:" ($left -join ", ")
    exit 1
}

Write-Host "START scripts/_dev_server_5500.py"
python scripts/_dev_server_5500.py
