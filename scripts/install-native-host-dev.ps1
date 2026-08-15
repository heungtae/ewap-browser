param([string]$TargetDirectory = (Join-Path $env:LOCALAPPDATA 'CompanyWebAgentDev'))
$ErrorActionPreference = 'Stop'
if ($TargetDirectory -match 'HKLM|Program Files') { throw 'development install target must not be production owned' }
New-Item -ItemType Directory -Force -Path $TargetDirectory | Out-Null
Write-Output 'Development-only native host install placeholder completed.'
