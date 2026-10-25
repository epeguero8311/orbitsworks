# Publish an EAS Update to the OrbitsWorks Dev app (com.orbitworks.app.dev,
# channel employee-dev, Firebase orbitworks-dev-ew). The ONLY way to ship JS
# to the dev app. Never touches the real app or prod.
#
# Every check prints OK or FAILED. Any FAILED stops the script before
# anything is published. Then it asks y/n.
#
# Usage (from orbitworks-app):
#   powershell -ExecutionPolicy Bypass -File scripts\employee-dev-update.ps1 -Message "Phase 2 Part C"
#   ... -CheckOnly        run the checks, never publish
#   ... -Answer y         answer the y/n question up front (non-interactive shells)

param(
  [string]$Message = "",
  [switch]$CheckOnly,
  [string]$Answer = ""
)

$ErrorActionPreference = "Stop"
$AppDir = Split-Path -Parent $PSScriptRoot
Set-Location $AppDir

# ---- What this script is allowed to publish ----
$BRANCH = "employee-app"
$CHANNEL = "employee-dev"
$EAS_ENVIRONMENT = "preview"
$BUILD_PROFILE = "employeeDev"
$BUNDLE_ID = "com.orbitworks.app.dev"
$FIREBASE_PROJECT = "orbitworks-dev-ew"
$RUNTIME = "1.1.2"
$TESTFLIGHT_BUILD = "10"
$PROD_ASC_APP_ID = "6801155800"

# app.config.js reads these. eas update does NOT read eas.json's env block,
# so they must be set here or the bundle is built as the real app.
$env:APP_VARIANT = "dev"
$env:EXPO_PUBLIC_FIREBASE_ENV = "dev"
$env:ORBITS_STRICT_ENV = "1"

$script:failed = $false
function Check([string]$Name, [bool]$Ok, [string]$Detail = "") {
  if ($Ok) {
    Write-Host ("OK     " + $Name)
  } else {
    Write-Host ("FAILED " + $Name + $(if ($Detail) { "  -> " + $Detail } else { "" })) -ForegroundColor Red
    $script:failed = $true
  }
}

# Runs a native command, returns its stdout lines ($null on a non-zero exit).
# stderr is dropped (eas prints update notices there); only the exit code
# decides pass/fail, so "Stop" must not turn stderr text into a crash.
function RunLines([string]$Exe, [string[]]$CmdArgs) {
  $ErrorActionPreference = "Continue"
  $out = & $Exe @CmdArgs 2>$null
  if ($LASTEXITCODE -ne 0) { return $null }
  # Leading comma: keep an empty result as an empty array, not $null.
  return ,@($out | ForEach-Object { "$_" })
}

# Same, as one string.
function Run([string]$Exe, [string[]]$CmdArgs) {
  $lines = RunLines $Exe $CmdArgs
  if ($null -eq $lines) { return $null }
  return ($lines -join "`n")
}

Write-Host ""
Write-Host "OrbitsWorks Dev - EAS Update pre-flight"
Write-Host "---------------------------------------"

# 1. Branch
$branch = Run "git" @("rev-parse", "--abbrev-ref", "HEAD")
Check "Branch is $BRANCH" ($branch -eq $BRANCH) "on '$branch'"

# 1b. Clean tree: the update must match a commit exactly. Any uncommitted
# or untracked file under orbitworks-app refuses the publish.
$dirtyOut = RunLines "git" @("status", "--porcelain", "--untracked-files=all", "--", ".")
$dirtyOk = ($null -ne $dirtyOut) -and ($dirtyOut.Count -eq 0)
Check "orbitworks-app has no uncommitted changes" $dirtyOk $(if ($null -eq $dirtyOut) { "git status failed" } else { "commit or remove these first" })
if (-not $dirtyOk -and $dirtyOut) { @($dirtyOut) | ForEach-Object { Write-Host ("         " + $_) -ForegroundColor Red } }
$commit = Run "git" @("rev-parse", "--short", "HEAD")

# 2. Env guard (config/envRules.js), same rules as eas build
$guardJs = @"
const r = require('./config/envRules');
const eas = require('./eas.json');
const errs = [
  ...r.checkBuildConfig({ appVariant: process.env.APP_VARIANT, firebaseEnvRaw: process.env.EXPO_PUBLIC_FIREBASE_ENV, strict: true }),
  ...r.checkEasJson(eas, { requireDevSubmit: true }),
];
const p = eas.build['$BUILD_PROFILE'] || {};
const out = {
  errors: errs,
  devProject: r.FIREBASE_PROJECTS.dev,
  resolvedProject: r.FIREBASE_PROJECTS[r.resolveFirebaseEnv(process.env.EXPO_PUBLIC_FIREBASE_ENV)],
  devBundle: r.VARIANTS.dev.bundleId,
  devChannel: r.VARIANTS.dev.updatesChannel,
  profileChannel: p.channel,
  profileEnvironment: p.environment,
  submitAsc: ((eas.submit || {})['$BUILD_PROFILE'] || {}).ios ? eas.submit['$BUILD_PROFILE'].ios.ascAppId : null,
};
console.log(JSON.stringify(out));
"@
$guardRaw = Run "node" @("-e", $guardJs)
$guard = $null
if ($guardRaw) { $guard = $guardRaw | ConvertFrom-Json }
Check "Env guard (envRules checkBuildConfig + checkEasJson, strict)" ($guard -ne $null -and @($guard.errors).Count -eq 0) $(if ($guard) { (@($guard.errors) -join "; ") } else { "guard script failed" })
Check "Firebase project is $FIREBASE_PROJECT" ($guard -ne $null -and $guard.resolvedProject -eq $FIREBASE_PROJECT -and $guard.devProject -eq $FIREBASE_PROJECT) $(if ($guard) { $guard.resolvedProject } else { "" })
Check "eas.json $BUILD_PROFILE channel is $CHANNEL" ($guard -ne $null -and $guard.profileChannel -eq $CHANNEL -and $guard.devChannel -eq $CHANNEL) $(if ($guard) { $guard.profileChannel } else { "" })
Check "eas.json $BUILD_PROFILE environment is $EAS_ENVIRONMENT" ($guard -ne $null -and $guard.profileEnvironment -eq $EAS_ENVIRONMENT) $(if ($guard) { $guard.profileEnvironment } else { "" })
Check "Dev submit target is not the real app ($PROD_ASC_APP_ID)" ($guard -ne $null -and $guard.submitAsc -and $guard.submitAsc -ne $PROD_ASC_APP_ID) $(if ($guard) { $guard.submitAsc } else { "" })

# 3. Resolved app config (app.config.js throws if its guard fails)
$cfgRaw = Run "npx" @("expo", "config", "--json", "--type", "public")
$cfg = $null
if ($cfgRaw) { try { $cfg = $cfgRaw | ConvertFrom-Json } catch { $cfg = $null } }
Check "app.config.js loads (its env guard passed)" ($cfg -ne $null) "expo config failed"
Check "Bundle id is $BUNDLE_ID" ($cfg -ne $null -and $cfg.ios.bundleIdentifier -eq $BUNDLE_ID -and $guard.devBundle -eq $BUNDLE_ID) $(if ($cfg) { $cfg.ios.bundleIdentifier } else { "" })
Check "App variant is dev with crew code links" ($cfg -ne $null -and $cfg.extra.appVariant -eq "dev" -and $cfg.extra.joinLinks -and ([string]$cfg.extra.joinLinks.appUrl).Contains($FIREBASE_PROJECT)) ""

# 4. EAS environment the update will pull its EXPO_PUBLIC_* vars from
$envList = Run "eas" @("env:list", "--environment", $EAS_ENVIRONMENT)
Check "EAS '$EAS_ENVIRONMENT' env has EXPO_PUBLIC_FIREBASE_ENV=dev" ($envList -ne $null -and $envList -match "(?m)^EXPO_PUBLIC_FIREBASE_ENV=dev\s*$") "not found"

# 5. Runtime version of this bundle
$rtRaw = Run "npx" @("expo-updates", "runtimeversion:resolve", "--platform", "ios")
$rt = $null
if ($rtRaw) { try { $rt = ($rtRaw | ConvertFrom-Json).runtimeVersion } catch { $rt = $null } }
Check "Runtime version is $RUNTIME" ($rt -eq $RUNTIME) "got '$rt'"

# 6. The TestFlight build this update must reach
$buildsRaw = Run "eas" @("build:list", "--platform", "ios", "--build-profile", $BUILD_PROFILE, "--status", "finished", "--limit", "20", "--json", "--non-interactive")
$build = $null
# PS 5.1 ConvertFrom-Json returns a JSON array as ONE object; ForEach unrolls it.
if ($buildsRaw) { try { $build = ($buildsRaw | ConvertFrom-Json) | ForEach-Object { $_ } | Where-Object { "$($_.appBuildVersion)" -eq $TESTFLIGHT_BUILD } | Select-Object -First 1 } catch { $build = $null } }
Check "TestFlight build $TESTFLIGHT_BUILD found ($BUILD_PROFILE, finished)" ($null -ne $build) "not found"
Check "Build $TESTFLIGHT_BUILD runtime $RUNTIME matches this update" ($null -ne $build -and $build.runtimeVersion -eq $RUNTIME -and $build.runtimeVersion -eq $rt) $(if ($build) { $build.runtimeVersion } else { "" })
Check "Build $TESTFLIGHT_BUILD channel is $CHANNEL" ($null -ne $build -and $build.channel -eq $CHANNEL) $(if ($build) { $build.channel } else { "" })

# 7. App unit tests
$testOut = Run "npm" @("test", "--silent")
Check "App tests pass (npm test)" ($null -ne $testOut) "see npm test"

Write-Host ""
if ($script:failed) {
  Write-Host "FAILED - nothing published." -ForegroundColor Red
  exit 1
}

if (-not $Message) {
  $Message = Run "git" @("log", "-1", "--format=%s")
}

Write-Host "All checks OK."
Write-Host ("  branch            " + $branch + "  @ " + $commit + " (clean)")
Write-Host ("  bundle id         " + $BUNDLE_ID)
Write-Host ("  Firebase project  " + $FIREBASE_PROJECT)
Write-Host ("  channel           " + $CHANNEL + "  (EAS environment " + $EAS_ENVIRONMENT + ")")
Write-Host ("  runtime           " + $rt + "  = TestFlight build " + $TESTFLIGHT_BUILD + " (" + $build.appVersion + ")")
Write-Host ("  message           " + $Message)
Write-Host ""

if ($CheckOnly) {
  Write-Host "Check only - nothing published."
  exit 0
}

$question = "Publish this update to channel $CHANNEL? (y/n)"
if ($Answer) {
  Write-Host ($question + " " + $Answer)
  $reply = $Answer
} else {
  $reply = Read-Host $question
}
if ($reply -ne "y") {
  Write-Host "Not published."
  exit 0
}

& eas update --channel $CHANNEL --environment $EAS_ENVIRONMENT --platform ios --message $Message --non-interactive
if ($LASTEXITCODE -ne 0) {
  Write-Host "FAILED eas update" -ForegroundColor Red
  exit 1
}
Write-Host "OK     Published to $CHANNEL"
