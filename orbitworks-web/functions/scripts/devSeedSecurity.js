#!/usr/bin/env node
// DEV ONLY - fixtures for the live security checks of Tasks 4-6 (restricted
// admin, existing-style admin, supervisor + employee logins) in a SEPARATE
// test company, so OT Test Co (overtime/tips/kiosk testing) is never touched.
// Refuses every other project.
//
//   cd functions && npm run build
//   node scripts/devSeedSecurity.js --project orbitworks-dev-ew            (dry run)
//   node scripts/devSeedSecurity.js --project orbitworks-dev-ew --apply    (writes)
//
// Creates companies/sec-test-company "Security Test Co" (Pro, Tips ON,
// Overtime OFF) with:
//   - job sites site-a "Site A" and site-c "Site C"; job Laborer $15
//   - Worker A (site A, $18) and Worker C (site C, $22) with PINs, each with
//     two shifts Mon Nov 23 + Tue Nov 24 2026 (7:00-15:00 CT) at their site,
//     left PENDING (the clock-event trigger writes the approval docs)
//   - logins (emails below, random passwords appended to
//     scripts/.dev-seed-logins.local, gitignored):
//       owner
//       restricted admin "Ada Restricted": Site A only, every permission but
//         Billing (so a site C refusal is the SITE check, not a permission)
//       existing-style admin "Lee Legacy": users doc with NO adminAccess and
//         claims {role, companyId} only - exactly what a pre-Task 4 admin has
//       supervisor "Sam Supervisor" (sites A + C, linked employee doc)
//       employee "Eve Employee" (Employee App login via linkEmployeeLogin,
//         the same helper joinCompany / acceptEmployeeInvite use)
// Claims through the compiled writeRoleClaims (except the existing-style
// admin, on purpose). Re-running refuses if the company exists.
//
// Credentials: Application Default Credentials for the dev project.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const guard = require("./lib/projectGuard");

const DEV = "orbitworks-dev-ew";
const args = guard.parseArgs(process.argv.slice(2), "devSeedSecurity.js");
if (args.project !== DEV) guard.fail(`This script only runs with --project ${DEV}.`);
guard.lockProject(args.project);

const COMPANY_ID = "sec-test-company";
const COMPANY_NAME = "Security Test Co";
const TERMS_VERSION = "2026-11-17-r7"; // components/legal/TermsContent.tsx
const LOGINS_FILE = path.join(__dirname, ".dev-seed-logins.local");
const SITES = [
  { id: "site-a", name: "Site A" },
  { id: "site-c", name: "Site C" },
];
const WORKERS = [
  { id: "worker-a", name: "Worker A", site: "site-a", rate: 18, pin: "5111" },
  { id: "worker-c", name: "Worker C", site: "site-c", rate: 22, pin: "5333" },
];
const LOGINS = {
  owner: { email: "sec-owner@dev.orbitsworks.test", name: "Security Test Co Owner" },
  restricted: { email: "sec-admin-a@dev.orbitsworks.test", name: "Ada Restricted", employeeId: "sec-admin-a", pin: "5666" },
  legacy: { email: "sec-legacy-admin@dev.orbitsworks.test", name: "Lee Legacy" },
  supervisor: { email: "sec-supervisor@dev.orbitsworks.test", name: "Sam Supervisor", employeeId: "sec-supervisor", pin: "5444" },
  employee: { email: "sec-employee@dev.orbitsworks.test", name: "Eve Employee", employeeId: "sec-employee", pin: "5555" },
};
// Chicago, Nov 23-24 2026 is CST (UTC-6).
const ct = (day, h) => Date.UTC(2026, 10, day, h + 6, 0);

const libDir = path.join(__dirname, "..", "lib");
if (!fs.existsSync(path.join(libDir, "adminAccess.js"))) guard.fail("lib/ not built - run `npm run build` in functions/ first.");

async function main() {
  const admin = require("firebase-admin");
  const { db } = require(path.join(libDir, "shared.js"));
  const { writeRoleClaims } = require(path.join(libDir, "adminAccess.js"));
  const { linkEmployeeLogin } = require(path.join(libDir, "employeeAccess.js"));
  guard.assertResolvedProject(admin, args.project);
  const { FieldValue, Timestamp } = admin.firestore;
  console.log(`[devSeedSecurity] project=${args.project} ${args.apply ? "APPLY" : "DRY RUN (no writes)"}`);

  const companyRef = db.collection("companies").doc(COMPANY_ID);
  if ((await companyRef.get()).exists) guard.fail(`companies/${COMPANY_ID} already exists - nothing written.`);
  for (const l of Object.values(LOGINS)) {
    const u = await admin.auth().getUserByEmail(l.email).catch(() => null);
    if (u) guard.fail(`${l.email} already exists - nothing written.`);
  }
  console.log(`  ${COMPANY_NAME} (companies/${COMPANY_ID}): Pro, Tips ON, Overtime OFF; sites ${SITES.map((s) => s.name).join(", ")}`);
  console.log(`  workers: ${WORKERS.map((w) => `${w.name} (${w.site}, $${w.rate}, PIN ${w.pin})`).join("; ")} - 2 pending shifts each`);
  console.log(`  logins: ${Object.entries(LOGINS).map(([k, l]) => `${k} ${l.email}`).join("; ")}`);
  if (!args.apply) {
    console.log("Dry run - nothing written.");
    return;
  }

  const passwords = {};
  const users = {};
  for (const [k, l] of Object.entries(LOGINS)) {
    passwords[k] = crypto.randomBytes(12).toString("base64url");
    users[k] = await admin.auth().createUser({ email: l.email, password: passwords[k], emailVerified: true, displayName: l.name });
  }
  const now = FieldValue.serverTimestamp();

  await companyRef.set({
    name: COMPANY_NAME,
    authMode: "individual",
    businessHours: { open: "07:00", close: "17:00" },
    weeklyOvertimeThreshold: 40,
    overtimeMultiplier: 1.5,
    tipsEnabled: true,
    exportSettings: { roundDailyMinutes: 0, roundTotalMinutes: 0, automaticBreakMinutes: 0, minimumShiftHours: 0 },
    alerts: { maxHoursWarning: true, maxHoursThreshold: 12, overtimeWarning: true, missedClockOutAlert: false, lateClockInAlert: false, earlyClockOutAlert: false },
    appSettings: { askJobSiteEachTime: true },
    ownerUid: users.owner.uid,
    createdAt: now,
    planTier: "pro_tier1",
    employeeCap: 50,
    activeEmployeeCount: 0,
    totalEmployeeCap: null,
    totalEmployeeCount: 0,
    subscriptionStatus: "active",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    agreedToTermsAt: now,
    termsVersion: TERMS_VERSION,
    devSeed: "security-checks",
  });
  await db.collection("users").doc(users.owner.uid).set({
    role: "owner", companyId: COMPANY_ID, email: LOGINS.owner.email, name: LOGINS.owner.name, createdAt: now, agreedToTermsAt: now, termsVersion: TERMS_VERSION,
  });
  await admin.auth().setCustomUserClaims(users.owner.uid, { role: "owner", companyId: COMPANY_ID });

  for (const s of SITES) {
    await companyRef.collection("jobSites").doc(s.id).set({
      name: s.name, address: "", active: true, requireGeofence: false, lat: null, lng: null, geocodedAddress: null, placeId: null,
      createdAt: now, createdByUid: users.owner.uid,
    });
  }
  await companyRef.collection("jobs").doc("laborer").set({ name: "Laborer", hourlyRate: 15, active: true, createdAt: now });

  async function putEmployee(id, fields, pin) {
    const batch = db.batch();
    batch.set(companyRef.collection("employees").doc(id), {
      active: true, jobId: "laborer", jobTitle: "Laborer", subcontractorId: null, subcontractorName: null,
      isAdmin: false, isSupervisor: false, pin, createdAt: now, devSeed: "security-checks", ...fields,
    });
    batch.set(companyRef.collection("employeePins").doc(id), { pin, updatedAt: Timestamp.now() });
    batch.set(companyRef.collection("pins").doc(pin), { employeeId: id, updatedAt: Timestamp.now() });
    await batch.commit();
  }
  for (const w of WORKERS) await putEmployee(w.id, { name: w.name, hourlyRate: w.rate, assignedSiteIds: [w.site] }, w.pin);

  // Restricted admin (linked employee doc, like a Make admin'd employee).
  const R = LOGINS.restricted;
  await putEmployee(R.employeeId, { name: R.name, hourlyRate: 20, assignedSiteIds: ["site-a"], isAdmin: true, linkedUserId: users.restricted.uid, email: R.email }, R.pin);
  const allButBilling = { approveHours: true, employees: true, editPay: true, exportPayroll: true, analytics: true, billing: false, settings: true, invites: true };
  await db.collection("users").doc(users.restricted.uid).set({
    role: "admin", companyId: COMPANY_ID, name: R.name, email: R.email, assignedSiteIds: ["site-a"],
    adminAccess: { level: "admin", sites: ["site-a"], permissions: allButBilling }, createdAt: now,
  });
  await writeRoleClaims(users.restricted.uid, { role: "admin", companyId: COMPANY_ID, employeeId: R.employeeId });

  // Existing-style admin: no adminAccess, old claims shape.
  await db.collection("users").doc(users.legacy.uid).set({ role: "admin", companyId: COMPANY_ID, name: LOGINS.legacy.name, email: LOGINS.legacy.email, assignedSiteIds: [], createdAt: now });
  await admin.auth().setCustomUserClaims(users.legacy.uid, { role: "admin", companyId: COMPANY_ID });

  // Supervisor (linked employee doc).
  const S = LOGINS.supervisor;
  await putEmployee(S.employeeId, { name: S.name, hourlyRate: 20, assignedSiteIds: ["site-a", "site-c"], isSupervisor: true, linkedUserId: users.supervisor.uid, email: S.email }, S.pin);
  await db.collection("users").doc(users.supervisor.uid).set({ role: "supervisor", companyId: COMPANY_ID, name: S.name, email: S.email, assignedSiteIds: ["site-a", "site-c"], createdAt: now });
  await writeRoleClaims(users.supervisor.uid, { role: "supervisor", companyId: COMPANY_ID, employeeId: S.employeeId });

  // Employee App login.
  const E = LOGINS.employee;
  await putEmployee(E.employeeId, { name: E.name, hourlyRate: 16, assignedSiteIds: ["site-a"] }, E.pin);
  await linkEmployeeLogin({ uid: users.employee.uid, companyId: COMPANY_ID, employeeId: E.employeeId, email: E.email, joinedVia: "admin" });

  // Pending shifts at each worker's site.
  for (const w of WORKERS) {
    const site = SITES.find((s) => s.id === w.site);
    for (const day of [23, 24]) {
      const base = { employeeId: w.id, employeeName: w.name, siteId: site.id, siteName: site.name, subcontractorId: null, subcontractorName: null, source: "adminManual", createdByUid: users.owner.uid };
      await companyRef.collection("clockEvents").add({ ...base, type: "in", timestamp: Timestamp.fromMillis(ct(day, 7)), createdAt: now });
      await companyRef.collection("clockEvents").add({ ...base, type: "out", timestamp: Timestamp.fromMillis(ct(day, 15)), createdAt: now });
    }
  }

  const lines = [
    "",
    `# DEV ONLY - Security checks seed (scripts/devSeedSecurity.js), ${new Date().toISOString().slice(0, 10)}. ${COMPANY_NAME} (${COMPANY_ID}).`,
    ...Object.entries(LOGINS).map(([k, l]) => `${k} (${l.name}): email=${l.email} password=${passwords[k]}`),
    `Sites: site-a "Site A", site-c "Site C". Restricted admin = Site A only, every permission but Billing. PINs: Worker A ${WORKERS[0].pin}, Worker C ${WORKERS[1].pin}, Sam ${S.pin}, Eve ${E.pin}, Ada ${R.pin}`,
  ];
  fs.appendFileSync(LOGINS_FILE, lines.join("\n") + "\n");
  console.log(`Done. Logins written to ${path.basename(LOGINS_FILE)} (gitignored).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
