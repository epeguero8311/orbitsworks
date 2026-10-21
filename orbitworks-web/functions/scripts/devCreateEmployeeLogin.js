#!/usr/bin/env node
// DEV ONLY - gives an existing employee doc an Employee App login on the
// orbitworks-dev-ew Firebase project, so Phase 0 rules and guards can be
// tested by hand before the real QR sign-up (Phase 2) exists. Refuses to
// run against any other project.
//
// Uses the same server helper Phase 2 will use (linkEmployeeLogin in
// src/employeeAccess.ts), so build first:
//
//   cd functions
//   npm run build
//   node scripts/devCreateEmployeeLogin.js --company <companyId> \
//     --employee <employeeId> --email someone@example.com --password secret123
//
// Credentials: Application Default Credentials for the dev project, e.g.
// `gcloud auth application-default login`, or GOOGLE_APPLICATION_CREDENTIALS
// pointing at an orbitworks-dev-ew service account key.
//
// Creates the Auth user if the email is new (reuses it if it already
// exists), then links it: users/{uid} role "employee", employee doc
// linkedUserId/email/appAccess/joinedVia "admin", and the role/companyId/
// employeeId custom claims.

const fs = require("node:fs");
const path = require("node:path");

const DEV_PROJECT_ID = "orbitworks-dev-ew";

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) fail(`Unexpected argument: ${key}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) fail(`Missing value for ${key}`);
    out[key.slice(2)] = value;
    i++;
  }
  return out;
}

// ---- Project guard: everything that could point the Admin SDK at another
// project must agree on orbitworks-dev-ew before firebase-admin is loaded.
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

const compiledHelper = path.join(__dirname, "..", "lib", "employeeAccess.js");
if (!fs.existsSync(compiledHelper)) {
  fail("lib/employeeAccess.js not found - run `npm run build` in functions/ first.");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const companyId = (args.company || "").trim();
  const employeeId = (args.employee || "").trim();
  const email = (args.email || "").trim().toLowerCase();
  const password = args.password || "";
  if (!companyId || !employeeId || !email || !password) {
    fail("Usage: --company <companyId> --employee <employeeId> --email <email> --password <password>");
  }
  if (password.length < 6) fail("Password must be at least 6 characters.");

  // Loading the compiled helper initializes the default Admin app (shared.ts)
  // with the project forced above.
  const { linkEmployeeLogin } = require(compiledHelper);
  const admin = require("firebase-admin");

  const actualProject = admin.app().options.projectId || process.env.GCLOUD_PROJECT;
  if (actualProject !== DEV_PROJECT_ID) {
    fail(`Admin SDK resolved project "${actualProject}" - refusing.`);
  }
  console.log(`[devCreateEmployeeLogin] project=${actualProject}`);

  let user;
  try {
    user = await admin.auth().getUserByEmail(email);
    console.log(`Reusing existing Auth user ${user.uid} for ${email}`);
  } catch (err) {
    if (err.code !== "auth/user-not-found") throw err;
    user = await admin.auth().createUser({ email, password, emailVerified: false });
    console.log(`Created Auth user ${user.uid} for ${email}`);
  }

  await linkEmployeeLogin({ uid: user.uid, companyId, employeeId, email, joinedVia: "admin" });

  const claims = (await admin.auth().getUser(user.uid)).customClaims;
  console.log("Linked. Custom claims now:", JSON.stringify(claims));
  console.log("Sign in on the mobile app (dev build) or the website with this email/password.");
}

main().catch((err) => {
  console.error("FAILED:", err && err.message ? err.message : err);
  process.exit(1);
});
