param(
  [Parameter(Mandatory = $true)][string]$ManagedPolicyPath,
  [switch]$Apply
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $ManagedPolicyPath)) { throw 'Managed policy file is missing' }
if (-not $Apply) {
  Write-Output 'Dry run only: policy disable was not applied.'
  exit 0
}
throw 'Production policy disable must be performed by the endpoint-management deployment owner.'
