#!/usr/bin/env node
// DEV ONLY - Task 6 (update banner): writes appConfig/versions on the dev
// project so the banner can be seen. Refuses every other project.
//
//   cd functions && npm run build
//   node scripts/devSeedAppVersions.js --project orbitworks-dev-ew            (dry run)
//   node scripts/devSeedAppVersions.js --project orbitworks-dev-ew --apply    (writes)
//
// Writes { ios: { latest: "1.1.7", min: null }, android: { latest: "1.1.7",
// min: null } } - above the dev build's 1.1.6, so every signed-in 1.1.6 app
// shows "A new version is available (1.1.7)". min stays unset (nothing is
// forced). On PROD this doc is set by hand (Firebase console) after a store
// approval - never by this script.
//
// Credentials: Application Default Credentials for the dev project.

const fs = require("node:fs");
const path = require("node:path");
const guard = require("./lib/projectGuard");

const DEV = "orbitworks-dev-ew";
const args = guard.parseArgs(process.argv.slice(2), "devSeedAppVersions.js");
if (args.project !== DEV) guard.fail(`This script only runs with --project ${DEV}.`);
guard.lockProject(args.project);

const VERSIONS = { ios: { latest: "1.1.7", min: null }, android: { latest: "1.1.7", min: null } };

const libDir = path.join(__dirname, "..", "lib");
if (!fs.existsSync(path.join(libDir, "shared.js"))) guard.fail("lib/ not built - run `npm run build` in functions/ first.");

async function main() {
  const admin = require("firebase-admin");
  const { db } = require(path.join(libDir, "shared.js"));
  guard.assertResolvedProject(admin, args.project);
  console.log(`[devSeedAppVersions] project=${args.project} ${args.apply ? "APPLY" : "DRY RUN (no writes)"}`);
  const ref = db.collection("appConfig").doc("versions");
  const before = await ref.get();
  console.log("  before:", before.exists ? JSON.stringify(before.data()) : "(no doc)");
  console.log("  write: ", JSON.stringify(VERSIONS));
  if (!args.apply) return;
  await ref.set({ ...VERSIONS, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  console.log("  done:  ", JSON.stringify((await ref.get()).data()));
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
