# ONE-TIME setup of the DEV website on Firebase App Hosting (orbitworks-dev-ew).
# Creates the backend, names its environment "orbitworks-dev" (so
# apphosting.orbitworks-dev.yaml is used), and copies the dev/test secrets
# from your local .env files into the DEV project's Secret Manager.
# Never touches orbitworks-7ef59 (prod): the project is fixed below.
#
# Run from orbitworks-web:  powershell -File scripts\dev-site-setup.ps1

$ErrorActionPreference = "Stop"
$Project = "orbitworks-dev-ew"
$Backend = "orbitsworks-backend"
$Region = "us-central1"
$EnvName = "orbitworks-dev"
$WebAppId = "1:797101077485:web:319119d9bf71be32336de4"
$Web = Split-Path -Parent $PSScriptRoot
$Firebase = Join-Path $Web "node_modules\.bin\firebase.cmd"
$ProdMarkers = @("orbitworks-7ef59", "248478616055", "sk_live", "pk_live", "rk_live")

function Step($label, [scriptblock]$body) {
  try { & $body; Write-Output "$label : OK" }
  catch { Write-Output "$label : FAILED - $($_.Exception.Message)"; exit 1 }
}

function Read-DotEnv($path) {
  $map = @{}
  if (Test-Path $path) {
    foreach ($line in Get-Content $path) {
      if ($line -match '^([A-Z0-9_]+)=(.*)$') { $map[$Matches[1]] = $Matches[2].Trim('"') }
    }
  }
  return $map
}

# Every firebase command below runs from an empty folder, so the CLI has no
# firebase.json / apphosting.yaml (both used by prod) it could edit.
$Empty = Join-Path ([IO.Path]::GetTempPath()) ("orbitworks-setup-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $Empty | Out-Null
Push-Location $Empty

# 1. Backend (no GitHub connection - deployed from local source only)
Step "1. Create backend $Backend in $Project" {
  & $Firebase apphosting:backends:create --backend $Backend --primary-region $Region --root-dir "/" --app $WebAppId --project $Project --non-interactive
  if ($LASTEXITCODE -ne 0) { throw "backends:create exit $LASTEXITCODE" }
}

# 2. Environment name -> apphosting.orbitworks-dev.yaml is merged over apphosting.yaml
$BackendUrl = "https://firebaseapphosting.googleapis.com/v1beta/projects/$Project/locations/$Region/backends/$Backend"
Step "2. Set environment name '$EnvName'" {
  $token = (gcloud auth print-access-token).Trim()
  $headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
  Invoke-RestMethod -Method Patch -Uri "$($BackendUrl)?updateMask=environment" -Headers $headers -Body '{"environment":"orbitworks-dev"}' | Out-Null
  Start-Sleep -Seconds 5
  $b = Invoke-RestMethod -Method Get -Uri $BackendUrl -Headers $headers
  if ($b.environment -ne $EnvName) { throw "environment is '$($b.environment)'" }
}

# 3. Secrets: local values, dev/test only. Values never printed.
$envVals = Read-DotEnv (Join-Path $Web ".env.local")
$devVals = Read-DotEnv (Join-Path $Web ".env.development.local")
foreach ($k in $devVals.Keys) { $envVals[$k] = $devVals[$k] }
$Secrets = @("FIREBASE_ADMIN_PROJECT_ID", "FIREBASE_ADMIN_CLIENT_EMAIL", "FIREBASE_ADMIN_PRIVATE_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "ANTHROPIC_API_KEY", "GOOGLE_PLACES_API_KEY")

Step "3a. Local secret values are dev/test only" {
  foreach ($name in $Secrets) {
    $v = $envVals[$name]
    if (-not $v) { throw "$name missing locally" }
    foreach ($m in $ProdMarkers) { if ($v.Contains($m)) { throw "$name looks like a PROD value" } }
  }
  if ($envVals["FIREBASE_ADMIN_PROJECT_ID"] -ne $Project) { throw "FIREBASE_ADMIN_PROJECT_ID is not $Project" }
}

# secrets:set can offer to add the secret to apphosting.yaml (the PROD
# file) - we're still in the empty folder, so there is no yaml to edit.
try {
  foreach ($name in $Secrets) {
    Step "3b. Secret $name -> $Project" {
      $tmp = New-TemporaryFile
      try {
        [IO.File]::WriteAllText($tmp.FullName, $envVals[$name])
        & $Firebase apphosting:secrets:set $name --data-file $tmp.FullName --project $Project --non-interactive | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "secrets:set exit $LASTEXITCODE" }
        & $Firebase apphosting:secrets:grantaccess $name --backend $Backend --location $Region --project $Project --non-interactive | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "grantaccess exit $LASTEXITCODE" }
      }
      finally { Remove-Item $tmp.FullName -Force }
    }
  }
}
finally {
  Pop-Location
  Remove-Item $Empty -Recurse -Force -ErrorAction SilentlyContinue
}

Step "4. apphosting.yaml and firebase.json (used by prod) unchanged" {
  git -C $Web diff --quiet -- apphosting.yaml firebase.json
  if ($LASTEXITCODE -ne 0) { throw "a prod config file was modified - revert it before anything else" }
}

Write-Output "DEV SITE SETUP: OK - next: scripts\dev-site-deploy.ps1"
