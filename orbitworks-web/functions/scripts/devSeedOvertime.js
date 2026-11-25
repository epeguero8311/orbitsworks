#!/usr/bin/env node
// DEV ONLY - seeds a test company for Task 1 (Overtime) on orbitworks-dev-ew.
// Refuses every other project (there is no prod flag).
//
//   cd functions
//   node scripts/devSeedOvertime.js --project orbitworks-dev-ew \
//     --admin-email you+ot@example.com --admin-password <8+ chars>          (dry run: prints the plan)
//   node scripts/devSeedOvertime.js --project orbitworks-dev-ew \
//     --admin-email you+ot@example.com --admin-password <8+ chars> --apply  (writes)
//
// Credentials: Application Default Credentials for the dev project
// (gcloud auth application-default login) or GOOGLE_APPLICATION_CREDENTIALS
// for an orbitworks-dev-ew service account.
//
// Creates (once - refuses if the company already exists):
//  - companies/ot-test-company: Pro plan, Overtime ON, weekly 40, daily 8,
//    multiplier 1.5, week starts Monday, no rounding, no Automatic Break.
//  - jobs Laborer $15, Foreman $23 (OT rate $40), Foreman B $23 (no OT rate,
//    for examples D and E which use the 1.5x multiplier).
//  - one employee per plan example (A, B, C, D, E) with clock events in the
//    week Mon Nov 16 - Sun Nov 22 2026 (America/Chicago), every session
//    approved on Approve Hours with its job.
//  - an owner login for the admin email (new Auth user, or an existing one
//    that is not in any company yet).
// Expected export numbers: docs/plans/overtime-dev-seed-expected.md.

const fs = require("node:fs");

const DEV = "orbitworks-dev-ew";
const COMPANY_ID = "ot-test-company";
const TERMS_VERSION = "2026-11-17-r7"; // components/legal/TermsContent.tsx

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

// ---- args ----
const args = { project: null, apply: false, adminEmail: null, adminPassword: null };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--project") args.project = argv[++i];
  else if (a === "--apply") args.apply = true;
  else if (a === "--admin-email") args.adminEmail = (argv[++i] || "").trim().toLowerCase();
  else if (a === "--admin-password") args.adminPassword = argv[++i] || "";
  else fail(`Unknown argument "${a}".`);
}
if (args.project !== DEV) fail(`This script only runs with --project ${DEV} (got "${args.project}").`);
if (!args.adminEmail || !args.adminEmail.includes("@")) fail("--admin-email is required.");
if (!args.adminPassword || args.adminPassword.length < 8) fail("--admin-password is required (8+ characters).");

// ---- project lock (before firebase-admin loads) ----
for (const name of ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT"]) {
  if (process.env[name] && process.env[name] !== DEV) fail(`${name} is "${process.env[name]}" - only ${DEV} is allowed.`);
}
if (process.env.FIREBASE_CONFIG) fail("FIREBASE_CONFIG is set - unset it.");
if (process.env.FIRESTORE_EMULATOR_HOST) fail("FIRESTORE_EMULATOR_HOST is set - unset it.");
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  let keyProject;
  try {
    keyProject = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8")).project_id;
  } catch (err) {
    fail(`Couldn't read GOOGLE_APPLICATION_CREDENTIALS: ${err.message}`);
  }
  if (keyProject && keyProject !== DEV) fail(`Service account key belongs to "${keyProject}", not ${DEV}.`);
}
process.env.GCLOUD_PROJECT = DEV;
process.env.GOOGLE_CLOUD_PROJECT = DEV;

const admin = require("firebase-admin");
admin.initializeApp({ projectId: DEV });
if (admin.app().options.projectId !== DEV) fail("Admin SDK did not resolve to the dev project.");
const db = admin.firestore();
const { Timestamp, FieldValue } = admin.firestore;

// ---- data ----
// Chicago, Nov 16-22 2026 is CST (UTC-6). Mon Nov 16.
const ct = (day, hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return Date.UTC(2026, 10, day, h + 6, m);
};

const JOBS = [
  { id: "laborer", name: "Laborer", hourlyRate: 15 },
  { id: "foreman", name: "Foreman", hourlyRate: 23, overtimeRate: 40 },
  { id: "foreman-b", name: "Foreman B", hourlyRate: 23 },
];

// [day, in, out, jobId]
const EMPLOYEES = [
  {
    id: "ot-a",
    name: "OT A Split Shift",
    jobId: "laborer",
    shifts: [
      [16, "08:00", "13:00", "laborer"],
      [16, "14:00", "23:00", "laborer"],
    ],
  },
  {
    id: "ot-b",
    name: "OT B Daily And Weekly",
    jobId: "laborer",
    shifts: [
      [16, "06:00", "20:00", "laborer"],
      [17, "08:00", "16:00", "laborer"],
      [18, "08:00", "16:00", "laborer"],
      [19, "08:00", "16:00", "laborer"],
      [20, "08:00", "16:00", "laborer"],
      [21, "08:00", "16:00", "laborer"],
    ],
  },
  {
    id: "ot-c",
    name: "OT C Two Jobs Fixed OT",
    jobId: "laborer",
    shifts: [
      [16, "07:00", "15:00", "laborer"],
      [17, "07:00", "15:00", "laborer"],
      [18, "07:00", "15:00", "laborer"],
      [19, "07:00", "08:00", "laborer"],
      [19, "08:30", "15:30", "foreman"],
      [20, "07:00", "15:00", "foreman"],
      [21, "07:00", "12:00", "foreman"],
    ],
  },
  {
    id: "ot-d",
    name: "OT D Two Jobs Multiplier",
    jobId: "laborer",
    shifts: [
      [16, "07:00", "15:00", "laborer"],
      [17, "07:00", "15:00", "laborer"],
      [18, "07:00", "15:00", "laborer"],
      [19, "07:00", "08:00", "laborer"],
      [19, "08:30", "15:30", "foreman-b"],
      [20, "07:00", "15:00", "foreman-b"],
      [21, "07:00", "12:00", "foreman-b"],
    ],
  },
  {
    id: "ot-e",
    name: "OT E Two Jobs Same Day",
    jobId: "laborer",
    shifts: [
      [17, "07:00", "12:00", "laborer"],
      [17, "12:30", "17:30", "foreman-b"],
    ],
  },
];

function dateKeyOf(day) {
  return `2026-11-${String(day).padStart(2, "0")}`;
}

async function main() {
  console.log(`[devSeedOvertime] project=${DEV} company=${COMPANY_ID} apply=${args.apply}`);
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  if ((await companyRef.get()).exists) {
    fail(`companies/${COMPANY_ID} already exists - nothing written. Delete it in the console to reseed.`);
  }

  let user = null;
  try {
    user = await admin.auth().getUserByEmail(args.adminEmail);
  } catch (err) {
    if (err.code !== "auth/user-not-found") throw err;
  }
  if (user) {
    const existing = await db.collection("users").doc(user.uid).get();
    if (existing.exists || user.customClaims?.companyId) {
      fail(`${args.adminEmail} already belongs to a company - use a new email for the test company.`);
    }
  }

  const totalShifts = EMPLOYEES.reduce((n, e) => n + e.shifts.length, 0);
  console.log(`Plan: 1 company, ${JOBS.length} jobs, ${EMPLOYEES.length} employees, ${totalShifts} approved sessions, owner ${args.adminEmail} (${user ? "existing Auth user" : "new Auth user"}).`);
  if (!args.apply) {
    console.log("Dry run - nothing written. Add --apply to write.");
    return;
  }

  // 1. Company + owner.
  if (!user) user = await admin.auth().createUser({ email: args.adminEmail, password: args.adminPassword });
  await companyRef.set({
    name: "OT Test Co",
    authMode: "individual",
    businessHours: { open: "07:00", close: "23:59" },
    weeklyOvertimeThreshold: 40,
    overtimeMultiplier: 1.5,
    overtimeEnabled: true,
    dailyOvertimeThreshold: 8,
    overtimeWeekStartsOn: 1,
    overtimeRoundMinutes: 0,
    exportSettings: { roundDailyMinutes: 0, roundTotalMinutes: 0, automaticBreakMinutes: 0, minimumShiftHours: 0 },
    alerts: { maxHoursWarning: true, maxHoursThreshold: 12, overtimeWarning: true, missedClockOutAlert: false, lateClockInAlert: false, earlyClockOutAlert: false },
    appSettings: { askJobSiteEachTime: true },
    ownerUid: user.uid,
    createdAt: FieldValue.serverTimestamp(),
    planTier: "pro_tier1",
    employeeCap: 50,
    activeEmployeeCount: 0,
    totalEmployeeCap: null,
    totalEmployeeCount: 0,
    subscriptionStatus: "active",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    agreedToTermsAt: FieldValue.serverTimestamp(),
    termsVersion: TERMS_VERSION,
    devSeed: "overtime-task1",
  });
  await db.collection("users").doc(user.uid).set({
    role: "owner",
    companyId: COMPANY_ID,
    email: args.adminEmail,
    name: "OT Test Admin",
    createdAt: FieldValue.serverTimestamp(),
    agreedToTermsAt: FieldValue.serverTimestamp(),
    termsVersion: TERMS_VERSION,
  });
  await admin.auth().setCustomUserClaims(user.uid, { role: "owner", companyId: COMPANY_ID });
  console.log(`Company + owner ${user.uid} written.`);

  // 2. Jobs.
  for (const j of JOBS) {
    await companyRef.collection("jobs").doc(j.id).set({
      name: j.name,
      hourlyRate: j.hourlyRate,
      ...(j.overtimeRate ? { overtimeRate: j.overtimeRate } : {}),
      active: true,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  // 3. Employees + clock events.
  const sessions = [];
  for (const e of EMPLOYEES) {
    await companyRef.collection("employees").doc(e.id).set({
      name: e.name,
      active: true,
      jobId: e.jobId,
      jobTitle: JOBS.find((j) => j.id === e.jobId).name,
      hourlyRate: null,
      assignedSiteIds: [],
      subcontractorId: null,
      subcontractorName: null,
      createdAt: FieldValue.serverTimestamp(),
    });
    for (const [day, inAt, outAt, jobId] of e.shifts) {
      const base = { employeeId: e.id, employeeName: e.name, siteId: null, siteName: "Not specified", source: "admin", createdByUid: user.uid };
      const inRef = await companyRef.collection("clockEvents").add({ ...base, type: "in", timestamp: Timestamp.fromMillis(ct(day, inAt)) });
      await companyRef.collection("clockEvents").add({ ...base, type: "out", timestamp: Timestamp.fromMillis(ct(day, outAt)) });
      sessions.push({ id: inRef.id, employee: e, day, jobId });
    }
  }
  console.log(`${sessions.length} sessions written. Waiting for the clock-event trigger to create their approval docs...`);

  // 4. Approve each session with its job, AFTER the trigger wrote its
  //    pending doc (it uses set(), so approving first would be overwritten).
  for (const s of sessions) {
    const ref = companyRef.collection("timesheetApprovals").doc(s.id);
    let snap = await ref.get();
    for (let tries = 0; !snap.exists && tries < 60; tries++) {
      await new Promise((r) => setTimeout(r, 1000));
      snap = await ref.get();
    }
    const job = JOBS.find((j) => j.id === s.jobId);
    await ref.set(
      {
        employeeId: s.employee.id,
        employeeName: s.employee.name,
        date: dateKeyOf(s.day),
        siteId: null,
        siteName: "Not specified",
        status: "approved",
        approvedByUid: user.uid,
        approvedByName: "OT seed script",
        approvedAt: FieldValue.serverTimestamp(),
        jobId: job.id,
        jobName: job.name,
        autoBreakMinutesApplied: 0,
        autoBreakMinShiftHoursApplied: 0,
      },
      { merge: true }
    );
    if (!snap.exists) console.warn(`  trigger never created ${s.id}; approval written directly`);
  }
  console.log("All sessions approved. Done.");
  console.log(`Sign in on the dev site with ${args.adminEmail}, then Reports for 2026-11-16 to 2026-11-22.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
