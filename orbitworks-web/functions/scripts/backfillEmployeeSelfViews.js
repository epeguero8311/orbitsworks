#!/usr/bin/env node
// DEV ONLY - one-time (idempotent, safe to re-run) seed of
// companies/{companyId}/employeeSelfViews/{employeeId} for every employee
// that existed before syncEmployeeSelfView (src/employeeSelfView.ts) was
// deployed. The trigger only writes a view on the employee's next write.
// Refuses to run against any project but orbitworks-dev-ew.
//
//   cd functions
//   npm run build
//   node scripts/backfillEmployeeSelfViews.js
//
// Credentials: Application Default Credentials for the dev project, or
// GOOGLE_APPLICATION_CREDENTIALS pointing at an orbitworks-dev-ew key.
// Prints counts only - never names, PINs or other employee data.

const fs = require("node:fs");
const path = require("node:path");

const DEV_PROJECT_ID = "orbitworks-dev-ew";

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

// ---- Project guard (same as devCreateEmployeeLogin.js): everything that
// could point the Admin SDK at another project must agree on the dev
// project before firebase-admin is loaded.
for (const name of ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT"]) {
  if (process.env[name] && process.env[name] !== DEV_PROJECT_ID) {
    fail(`${name} is "${process.env[name]}" - this script only runs against ${DEV_PROJECT_ID}.`);
  }
}
if (process.env.FIREBASE_CONFIG) {
  fail("FIREBASE_CONFIG is set - unset it; this script picks the project itself.");
}
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  let keyProject;
  try {
    keyProject = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8")).project_id;
  } catch (err) {
    fail(`Couldn't read GOOGLE_APPLICATION_CREDENTIALS: ${err.message}`);
  }
  if (keyProject && keyProject !== DEV_PROJECT_ID) {
    fail(`Service account key belongs to "${keyProject}" - this script only runs against ${DEV_PROJECT_ID}.`);
  }
}
process.env.GCLOUD_PROJECT = DEV_PROJECT_ID;
process.env.GOOGLE_CLOUD_PROJECT = DEV_PROJECT_ID;

const compiledHelper = path.join(__dirname, "..", "lib", "employeeSelfView.js");
if (!fs.existsSync(compiledHelper)) {
  fail("lib/employeeSelfView.js not found - run `npm run build` in functions/ first.");
}

async function main() {
  // Loading the compiled helper initializes the default Admin app (shared.ts).
  const { writeEmployeeSelfView } = require(compiledHelper);
  const { db } = require(path.join(__dirname, "..", "lib", "shared.js"));
  const admin = require("firebase-admin");

  const actualProject = admin.app().options.projectId || process.env.GCLOUD_PROJECT;
  if (actualProject !== DEV_PROJECT_ID) {
    fail(`Admin SDK resolved project "${actualProject}" - refusing.`);
  }
  console.log(`[backfillEmployeeSelfViews] project=${actualProject}`);

  const companies = await db.collection("companies").get();
  let written = 0;
  for (const company of companies.docs) {
    const employees = await company.ref.collection("employees").get();
    for (const employee of employees.docs) {
      await writeEmployeeSelfView(company.id, employee.id, employee.data());
      written++;
    }
  }
  console.log(`Done. companies=${companies.size} selfViewsWritten=${written}`);
}

main().catch((err) => {
  console.error("FAILED:", err && err.message ? err.message : err);
  process.exit(1);
});
