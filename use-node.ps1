$ErrorActionPreference = "Stop"
$nodeDir = Join-Path $PSScriptRoot "tools\node-v22.14.0-win-x64"

if (!(Test-Path (Join-Path $nodeDir "node.exe"))) {
  throw "Node not found at $nodeDir"
}

$env:PATH = "$nodeDir;$env:PATH"

Write-Host "Node path activated for this shell session:"
Write-Host "  $nodeDir"
& (Join-Path $nodeDir "node.exe") -v

Write-Host ""
Write-Host "You can now run:"
Write-Host "  node server.js"
