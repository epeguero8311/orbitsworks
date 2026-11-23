// Shared guard for the release data scripts in functions/scripts/.
//
//   --project <id>    required: orbitworks-dev-ew or orbitworks-7ef59
//   --apply           write; without it the script is a dry run (reads only)
//   --confirm-prod    also required to WRITE to orbitworks-7ef59
//
// Everything that could point the Admin SDK at another project must agree
// with --project before firebase-admin is loaded (same checks as
// backfillEmployeeSelfViews.js). Credentials: Application Default
// Credentials (gcloud auth application-default login) or
// GOOGLE_APPLICATION_CREDENTIALS for the SAME project.

const fs = require("node:fs");

const DEV = "orbitworks-dev-ew";
const PROD = "orbitworks-7ef59";
const ALLOWED = [DEV, PROD];
// Default Storage bucket per project (apphosting*.yaml NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET).
const BUCKETS = { [DEV]: "orbitworks-dev-ew.firebasestorage.app", [PROD]: "orbitworks-7ef59.firebasestorage.app" };

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

// extraFlags: script-specific boolean flags, e.g. ["--strip"] -> args.strip.
function parseArgs(argv, scriptName, extraFlags = []) {
  const args = { project: null, apply: false, confirmProd: false };
  for (const f of extraFlags) args[f.slice(2)] = false;
  const extraUsage = extraFlags.map((f) => ` [${f}]`).join("");
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project") args.project = argv[++i];
    else if (a.startsWith("--project=")) args.project = a.slice("--project=".length);
    else if (a === "--apply") args.apply = true;
    else if (a === "--confirm-prod") args.confirmProd = true;
    else if (extraFlags.includes(a)) args[a.slice(2)] = true;
    else fail(`Unknown argument "${a}". Usage: node scripts/${scriptName} --project <${ALLOWED.join("|")}> [--apply] [--confirm-prod]${extraUsage}`);
  }
  if (!args.project) fail(`--project is required (${ALLOWED.join(" or ")}).`);
  if (!ALLOWED.includes(args.project)) fail(`--project must be one of ${ALLOWED.join(", ")}.`);
  if (args.project === PROD && args.apply && !args.confirmProd) {
    fail(`Writing to ${PROD} also needs --confirm-prod. Run without --apply first for a dry run.`);
  }
  return args;
}

// Call before requiring firebase-admin or anything in ../lib.
function lockProject(project) {
  for (const name of ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT"]) {
    if (process.env[name] && process.env[name] !== project) {
      fail(`${name} is "${process.env[name]}" but --project is ${project}. Unset it or make them match.`);
    }
  }
  if (process.env.FIREBASE_CONFIG) fail("FIREBASE_CONFIG is set - unset it; the script picks the project itself.");
  if (process.env.FIRESTORE_EMULATOR_HOST) fail("FIRESTORE_EMULATOR_HOST is set - unset it to run against a real project.");
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    let keyProject;
    try {
      keyProject = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8")).project_id;
    } catch (err) {
      fail(`Couldn't read GOOGLE_APPLICATION_CREDENTIALS: ${err.message}`);
    }
    if (keyProject && keyProject !== project) {
      fail(`Service account key belongs to "${keyProject}", not ${project}.`);
    }
  }
  process.env.GCLOUD_PROJECT = project;
  process.env.GOOGLE_CLOUD_PROJECT = project;
  // admin.initializeApp() (shared.ts) reads the project and default bucket
  // from here, the same way it does inside Cloud Functions.
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: project, storageBucket: BUCKETS[project] });
}

// Call after the Admin app exists (requiring ../lib/shared.js creates it).
function assertResolvedProject(admin, project) {
  const actual = admin.app().options.projectId || process.env.GCLOUD_PROJECT;
  if (actual !== project) fail(`Admin SDK resolved project "${actual}", expected ${project} - refusing.`);
}

module.exports = { DEV, PROD, fail, parseArgs, lockProject, assertResolvedProject };
