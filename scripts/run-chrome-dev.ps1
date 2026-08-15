param([string]$ChromePath = "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe")
$ErrorActionPreference = 'Stop'
$profile = Join-Path $env:TEMP 'company-web-agent-dev-profile'
if (-not (Test-Path $ChromePath)) { throw 'Chrome executable was not found' }
& $ChromePath "--user-data-dir=$profile" "--disable-extensions-except=$PSScriptRoot\..\extension" "--load-extension=$PSScriptRoot\..\extension" 'https://fixture.company.test/'
