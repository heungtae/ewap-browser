param(
  [Parameter(Mandatory = $true)][string]$ExtensionDirectory,
  [Parameter(Mandatory = $true)][string]$PolicyPath,
  [Parameter(Mandatory = $true)][string]$NativeHostPath
)
$ErrorActionPreference = 'Stop'
foreach ($path in @($ExtensionDirectory, $PolicyPath, $NativeHostPath)) {
  if (-not (Test-Path $path)) { throw "Required release artifact is missing: $path" }
}
$manifest = Get-Content (Join-Path $ExtensionDirectory 'manifest.json') -Raw | ConvertFrom-Json
if ($manifest.manifest_version -ne 3) { throw 'Only MV3 extension artifacts are supported' }
$policy = Get-Content $PolicyPath -Raw | ConvertFrom-Json
if ($policy.schema_version -ne 1) { throw 'Unsupported policy schema version' }
Write-Output 'INSTALLED'
