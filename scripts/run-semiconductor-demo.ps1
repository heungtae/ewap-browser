param(
  [string]$ChromePath = "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
  [int]$Port = 8443
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $ChromePath)) { throw 'Chrome executable was not found.' }
$root = Split-Path -Parent $PSScriptRoot
$env:CONTEXTPILOT_DEMO_PORT = "$Port"
Start-Process node -ArgumentList (Join-Path $root 'scripts\serve-semiconductor-demo.mjs') -WorkingDirectory $root
$profile = Join-Path $env:TEMP 'contextpilot-semiconductor-demo-chrome'
$extension = Join-Path $root 'dist-extension'
if (-not (Test-Path (Join-Path $extension 'manifest.json'))) { throw 'dist-extension is missing; run the extension build first.' }
& $ChromePath "--user-data-dir=$profile" "--disable-extensions-except=$extension" "--load-extension=$extension" "http://127.0.0.1:$Port/"
