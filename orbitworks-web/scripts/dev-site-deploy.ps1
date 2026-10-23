# Deploys the DEV website (orbitworks-dev-ew App Hosting) from the last
# COMMIT, never from the working folder: the code is exported with
# `git archive`, so local .env files and uncommitted changes can't be
# uploaded. Refuses to run unless every guard passes.
# Never touches orbitworks-7ef59 (prod): the project is fixed below.
#
# Run from orbitworks-web:  powershell -File scripts\dev-site-deploy.ps1

$ErrorActionPreference = "Stop"
$Project = "orbitworks-dev-ew"
$Backend = "orbitsworks-backend"
$Region = "us-central1"
$EnvName = "orbitworks_dev"
$Web = Split-Path -Parent $PSScriptRoot
$Repo = Split-Path -Parent $Web
# firebase-tools: local install if present, else the global one.
$Firebase = Join-Path $Web "node_modules\.bin\firebase.cmd"
if (-not (Test-Path $Firebase)) { $Firebase = (Get-Command firebase.cmd -ErrorAction Stop).Source }

function Step($label, [scriptblock]$body) {
  try { & $body; Write-Output "$label : OK" }
  catch { Write-Output "$label : FAILED - $($_.Exception.Message)"; exit 1 }
}

Step "1. Not on main" {
  $branch = (git -C $Repo branch --show-current).Trim()
  if ($branch -eq "main") { throw "on main" }
}

Step "2. No uncommitted changes in orbitworks-web" {
  $dirty = git -C $Repo status --porcelain -- orbitworks-web
  if ($dirty) { throw "commit first - only committed code is deployed" }
}

Step "3. Dev App Hosting config check" {
  node (Join-Path $Web "scripts\check-apphosting-dev.mjs")
  if ($LASTEXITCODE -ne 0) { throw "check-apphosting-dev failed" }
}

Step "4. Backend environment is '$EnvName' (else prod values would be used)" {
  $token = (gcloud auth print-access-token).Trim()
  $b = Invoke-RestMethod -Method Get -Uri "https://firebaseapphosting.googleapis.com/v1beta/projects/$Project/locations/$Region/backends/$Backend" -Headers @{ Authorization = "Bearer $token"; "x-goog-user-project" = $Project }
  if ($b.environment -ne $EnvName) { throw "environment is '$($b.environment)'" }
}

$Stage = Join-Path ([IO.Path]::GetTempPath()) ("orbitworks-dev-site-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $Stage | Out-Null
try {
  Step "5. Export committed orbitworks-web (git archive HEAD)" {
    $tar = Join-Path $Stage "src.tar"
    git -C $Repo archive --format=tar -o $tar HEAD orbitworks-web
    if ($LASTEXITCODE -ne 0) { throw "git archive exit $LASTEXITCODE" }
    tar -xf $tar -C $Stage
    Remove-Item $tar
  }

  $Src = Join-Path $Stage "orbitworks-web"
  Step "6. No .env files in the upload" {
    $envFiles = Get-ChildItem $Src -Recurse -Force -File -Filter ".env*" | Where-Object { $_.Name -ne ".env.example" }
    if ($envFiles) { throw ($envFiles.FullName -join ", ") }
  }

  Step "7. Deploy to $Project" {
    Push-Location $Src
    try {
      & $Firebase deploy --only "apphosting:$Backend" --project $Project --non-interactive
      if ($LASTEXITCODE -ne 0) { throw "deploy exit $LASTEXITCODE" }
    }
    finally { Pop-Location }
  }
}
finally {
  Remove-Item $Stage -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Output "DEV SITE DEPLOY: OK - https://$Backend--$Project.$Region.hosted.app"
