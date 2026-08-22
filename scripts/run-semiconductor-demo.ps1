param(
  [string]$ChromePath = "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
  [int]$Port = 8443
)
$ErrorActionPreference = 'Stop'
if (-not (Get-Command openssl -ErrorAction SilentlyContinue)) { throw 'OpenSSL is required to create the temporary demo certificate.' }
if (-not (Test-Path $ChromePath)) { throw 'Chrome executable was not found.' }
$root = Split-Path -Parent $PSScriptRoot
$temp = Join-Path $env:TEMP 'contextpilot-semiconductor-demo'
New-Item -ItemType Directory -Force -Path $temp | Out-Null
$cert = Join-Path $temp 'cert.pem'
$key = Join-Path $temp 'key.pem'
if (-not ((Test-Path $cert) -and (Test-Path $key))) { & openssl req -x509 -newkey rsa:2048 -nodes -keyout $key -out $cert -days 2 -subj '/CN=semiconductor-demo.company.test' }
$env:CONTEXTPILOT_DEMO_CERT = $cert; $env:CONTEXTPILOT_DEMO_KEY = $key; $env:CONTEXTPILOT_DEMO_PORT = "$Port"
Start-Process node -ArgumentList (Join-Path $root 'scripts\serve-semiconductor-demo.mjs') -WorkingDirectory $root
$profile = Join-Path $env:TEMP 'contextpilot-semiconductor-demo-chrome'
$extension = Join-Path $root 'dist-extension'
if (-not (Test-Path (Join-Path $extension 'manifest.json'))) { throw 'dist-extension is missing; run the extension build first.' }
& $ChromePath "--user-data-dir=$profile" "--disable-extensions-except=$extension" "--load-extension=$extension" "--host-resolver-rules=MAP semiconductor-demo.company.test 127.0.0.1" '--ignore-certificate-errors' "https://semiconductor-demo.company.test:$Port/"
