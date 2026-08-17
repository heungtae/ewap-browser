param(
  [string]$ChromePath = "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
  [string]$PageUrl = 'https://example.com/'
)
$ErrorActionPreference = 'Stop'
$profile = Join-Path $env:TEMP 'company-web-agent-dev-profile'
$extension = Join-Path $PSScriptRoot '..\dist-extension'
if (-not (Test-Path $ChromePath)) { throw 'Chrome executable was not found' }
if (-not (Test-Path (Join-Path $extension 'manifest.json'))) { throw 'dist-extension is missing; run build first' }
& $ChromePath "--user-data-dir=$profile" "--disable-extensions-except=$extension" "--load-extension=$extension" $PageUrl
