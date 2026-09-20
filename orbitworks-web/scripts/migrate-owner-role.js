// One-time backfill for the owner/admin role split.
//
// Every company today has exactly one users/{uid}.role == "admin" account
// (the original signup account created by createCompany). This script
// promotes that account to role "owner" in both Firestore (users/{uid})
// and its Auth custom claims, for every company. It also backfills the
// new `employeeId` custom claim for every already-linked supervisor
// (employees.linkedUserId set), since firestore.rules' isActiveEmployee()
// check moves from get(employees/{uid}) to
// get(employees/{token.employeeId}) - without this, existing supervisors'
// clock-in writes would start failing the moment the new rules deploy,
// before they ever re-accept an invite. Today, every linked employee's
// doc id IS already their uid (acceptInvite's old behavior), so
// employeeId == linkedUserId == doc id for all of them; this just makes
// that explicit as a claim instead of an assumption.
//
// Also backfills `email` onto every already-linked employee doc from
// users/{linkedUserId}.email, since acceptInvite only started
// denormalizing it there going forward - without this, the Edit Employee
// modal shows no email for anyone linked before that change shipped.
//
// Must run (and be verified via the summary output) BEFORE firestore.rules
// or any Cloud Function that expects "owner" or the employeeId claim to
// exist gets deployed.
//
// Usage:
//   node scripts/migrate-owner-role.js            (dry run - no writes)
//   node scripts/migrate-owner-role.js --apply     (commits the changes)

const fs = require("fs");
const path = require("path");

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const admin = require("firebase-admin");
const { cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY
  ? process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n")
  : undefined;

if (!projectId || !clientEmail || !privateKey) {
  console.error(
    "Missing FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, or FIREBASE_ADMIN_PRIVATE_KEY (checked process.env and .env.local)."
  );
  process.exit(1);
}

const app = admin.initializeApp({
  credential: cert({ projectId, clientEmail, privateKey }),
});

const db = getFirestore(app);
const auth = getAuth(app);

const APPLY = process.argv.includes("--apply");

async function migrateOwners() {
  const companiesSnap = await db.collection("companies").get();
  console.log(`\n=== Owner promotion: ${companiesSnap.size} companies ===`);

  let promoted = 0;
  let alreadyOwner = 0;
  const problems = [];

  for (const companyDoc of companiesSnap.docs) {
    const companyId = companyDoc.id;
    const companyName = companyDoc.data().name || "(unnamed)";

    const ownerSnap = await db
      .collection("users")
      .where("companyId", "==", companyId)
      .where("role", "==", "owner")
      .get();
    if (!ownerSnap.empty) {
      alreadyOwner++;
      continue;
    }

    const adminSnap = await db
      .collection("users")
      .where("companyId", "==", companyId)
      .where("role", "==", "admin")
      .get();

    if (adminSnap.size === 0) {
      const msg = `Company ${companyId} (${companyName}): 0 users with role "admin" - no owner candidate. NEEDS MANUAL REVIEW.`;
      console.error(msg);
      problems.push(msg);
      continue;
    }

    if (adminSnap.size > 1) {
      const ids = adminSnap.docs.map((d) => d.id).join(", ");
      const msg = `Company ${companyId} (${companyName}): ${adminSnap.size} users with role "admin" (${ids}) - ambiguous, cannot auto-pick. NEEDS MANUAL REVIEW.`;
      console.error(msg);
      problems.push(msg);
      continue;
    }

    const userDoc = adminSnap.docs[0];
    const uid = userDoc.id;
    const email = userDoc.data().email || "(no email)";

    console.log(`Company ${companyId} (${companyName}): promoting ${uid} (${email}) to owner.`);

    if (APPLY) {
      // Check the Auth account exists BEFORE writing anything to
      // Firestore, so a missing account can never leave the Firestore
      // doc saying "owner" while the claim never got set (a crash
      // between the two writes would).
      let authUser;
      try {
        authUser = await auth.getUser(uid);
      } catch (err) {
        const msg = `Company ${companyId} (${companyName}): users/${uid} (${email}) has role "admin" but no matching Auth account (orphaned Firestore doc). SKIPPED - NEEDS MANUAL REVIEW.`;
        console.error(msg);
        problems.push(msg);
        continue;
      }

      await userDoc.ref.update({ role: "owner" });
      await auth.setCustomUserClaims(uid, {
        ...(authUser.customClaims || {}),
        role: "owner",
      });
    }

    promoted++;
  }

  console.log(`\nPromoted: ${promoted}  Already owner: ${alreadyOwner}  Problems: ${problems.length}`);
  return problems;
}

async function backfillEmployeeIdClaims() {
  const companiesSnap = await db.collection("companies").get();
  console.log(`\n=== employeeId claim backfill: ${companiesSnap.size} companies ===`);

  let backfilled = 0;
  let alreadySet = 0;
  const problems = [];

  for (const companyDoc of companiesSnap.docs) {
    const companyId = companyDoc.id;
    const employeesSnap = await db
      .collection("companies")
      .doc(companyId)
      .collection("employees")
      .get();

    for (const employeeDoc of employeesSnap.docs) {
      const linkedUserId = employeeDoc.data().linkedUserId;
      if (!linkedUserId) continue;

      let authUser;
      try {
        authUser = await auth.getUser(linkedUserId);
      } catch (err) {
        const msg = `Company ${companyId}, employee ${employeeDoc.id}: linkedUserId ${linkedUserId} has no Auth user (orphaned link). NEEDS MANUAL REVIEW.`;
        console.error(msg);
        problems.push(msg);
        continue;
      }

      const claims = authUser.customClaims || {};
      if (claims.employeeId === employeeDoc.id) {
        alreadySet++;
        continue;
      }

      console.log(
        `Company ${companyId}: setting employeeId claim for ${linkedUserId} -> ${employeeDoc.id}.`
      );

      if (APPLY) {
        await auth.setCustomUserClaims(linkedUserId, {
          ...claims,
          employeeId: employeeDoc.id,
        });
      }
      backfilled++;
    }
  }

  console.log(`\nBackfilled: ${backfilled}  Already set: ${alreadySet}  Problems: ${problems.length}`);
  return problems;
}

// Every employee doc linked via acceptInvite now gets `email` denormalized
// onto it directly (so the Edit Employee modal can show it without an
// extra read), but that only applies going forward - any employee linked
// before that change shipped has no `email` field on their doc at all.
// Backfills it from users/{linkedUserId}.email, which has always been set.
async function backfillEmployeeEmails() {
  const companiesSnap = await db.collection("companies").get();
  console.log(`\n=== employee email backfill: ${companiesSnap.size} companies ===`);

  let backfilled = 0;
  let alreadySet = 0;
  const problems = [];

  for (const companyDoc of companiesSnap.docs) {
    const companyId = companyDoc.id;
    const employeesSnap = await db
      .collection("companies")
      .doc(companyId)
      .collection("employees")
      .get();

    for (const employeeDoc of employeesSnap.docs) {
      const employee = employeeDoc.data();
      const linkedUserId = employee.linkedUserId;
      if (!linkedUserId) continue;
      if (employee.email) {
        alreadySet++;
        continue;
      }

      const userSnap = await db.collection("users").doc(linkedUserId).get();
      if (!userSnap.exists || !userSnap.data().email) {
        const msg = `Company ${companyId}, employee ${employeeDoc.id}: linkedUserId ${linkedUserId} has no users/{uid}.email to backfill from. NEEDS MANUAL REVIEW.`;
        console.error(msg);
        problems.push(msg);
        continue;
      }

      const email = userSnap.data().email;
      console.log(`Company ${companyId}: setting email for employee ${employeeDoc.id} -> ${email}.`);

      if (APPLY) {
        await employeeDoc.ref.update({ email });
      }
      backfilled++;
    }
  }

  console.log(`\nBackfilled: ${backfilled}  Already set: ${alreadySet}  Problems: ${problems.length}`);
  return problems;
}

async function main() {
  console.log(
    APPLY
      ? "Running in APPLY mode - writes will happen."
      : "Running in DRY-RUN mode - no writes will happen. Pass --apply to commit."
  );

  const ownerProblems = await migrateOwners();
  const claimProblems = await backfillEmployeeIdClaims();
  const emailProblems = await backfillEmployeeEmails();

  const allProblems = [...ownerProblems, ...claimProblems, ...emailProblems];
  if (allProblems.length) {
    console.log(`\n--- ${allProblems.length} problem(s) need manual review before deploying rules ---`);
    allProblems.forEach((p) => console.log(" - " + p));
  } else {
    console.log("\nNo problems found.");
  }

  if (!APPLY) {
    console.log("\nThis was a dry run. Re-run with --apply to commit these changes.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

