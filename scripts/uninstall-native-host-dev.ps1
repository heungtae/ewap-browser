param([string]$TargetDirectory = (Join-Path $env:LOCALAPPDATA 'CompanyWebAgentDev'))
$ErrorActionPreference = 'Stop'
if ($TargetDirectory -match 'HKLM|Program Files') { throw 'development uninstall target must not be production owned' }
Write-Output 'Development-only native host uninstall placeholder completed.'
