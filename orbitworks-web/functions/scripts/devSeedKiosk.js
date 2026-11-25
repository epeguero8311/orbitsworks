#!/usr/bin/env node
// DEV ONLY - Task 5 Kiosk mode test setup on the ALREADY-SEEDED OT Test Co
// (scripts/devSeedOvertime.js, Pro). Refuses every other project.
//
//   cd functions && npm run build
//   node scripts/devSeedKiosk.js --project orbitworks-dev-ew            (dry run)
//   node scripts/devSeedKiosk.js --project orbitworks-dev-ew --apply    (writes)
//
// Adds (never touches the OT A/C/D/E overtime records):
//   - kiosk-front-ipad  "Front iPad" - the KIOSK record + its login (role
//     claim "kiosk"), same shape acceptInvite's kiosk branch writes
//   - kiosk-ava / kiosk-ben / kiosk-cal - employees with PINs
//   - kiosk-admin "Kiosk Admin" - a linked admin with ONLY the Settings
//     permission: their own PIN opens Kiosk Settings (K17)
// PINs go where every server path writes them: employeePins/{id}, the pins/
// {pin} reservation, and (EMPLOYEE_DOC_PIN_REMOVED=false on dev) the
// employee doc's pin field. Claims through the compiled writeRoleClaims, so
// they are exactly what the real callables set.
// The two logins' email + password are appended to
// scripts/.dev-seed-logins.local (gitignored). Re-running keeps the same
// passwords (an existing Auth user is never reset) and writes nothing new.
//
// Credentials: Application Default Credentials for the dev project.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const guard = require("./lib/projectGuard");

const DEV = "orbitworks-dev-ew";
const args = guard.parseArgs(process.argv.slice(2), "devSeedKiosk.js");
if (args.project !== DEV) guard.fail(`This script only runs with --project ${DEV}.`);
guard.lockProject(args.project);

const COMPANY_ID = "ot-test-company";
const KIOSK = { id: "kiosk-front-ipad", name: "Front iPad", pin: "6135", email: "ot-kiosk@dev.orbitsworks.test" };
const ADMIN = { id: "kiosk-admin", name: "Kiosk Admin", pin: "8024", email: "ot-kiosk-admin@dev.orbitsworks.test" };
const EMPLOYEES = [
  { id: "kiosk-ava", name: "Kiosk Ava", pin: "2581" },
  { id: "kiosk-ben", name: "Kiosk Ben", pin: "3692" },
  { id: "kiosk-cal", name: "Kiosk Cal", pin: "4703" },
];
const LOGINS_FILE = path.join(__dirname, ".dev-seed-logins.local");

const libDir = path.join(__dirname, "..", "lib");
if (!fs.existsSync(path.join(libDir, "adminAccess.js"))) guard.fail("lib/ not built - run `npm run build` in functions/ first.");

function newPassword() {
  return crypto.randomBytes(12).toString("base64url");
}

async function main() {
  const admin = require("firebase-admin");
  const { db } = require(path.join(libDir, "shared.js"));
  const { writeRoleClaims } = require(path.join(libDir, "adminAccess.js"));
  guard.assertResolvedProject(admin, args.project);
  const { FieldValue } = admin.firestore;
  console.log(`[devSeedKiosk] project=${args.project} ${args.apply ? "APPLY" : "DRY RUN (no writes)"}`);

  const companyRef = db.collection("companies").doc(COMPANY_ID);
  const company = await companyRef.get();
  if (!company.exists || company.get("devSeed") !== "overtime-task1") guard.fail(`${COMPANY_ID} is not the overtime dev seed company.`);
  if (!String(company.get("planTier") || "").startsWith("pro_")) guard.fail(`${COMPANY_ID} is not on Pro.`);

  // PINs must be free (or already this record's).
  for (const r of [KIOSK, ADMIN, ...EMPLOYEES]) {
    const held = await companyRef.collection("pins").doc(r.pin).get();
    if (held.exists && held.get("employeeId") !== r.id) guard.fail(`PIN ${r.pin} is held by ${held.get("employeeId")} - pick another.`);
  }

  const logins = [];
  async function authUser(email) {
    const existing = await admin.auth().getUserByEmail(email).catch(() => null);
    if (existing) return { user: existing, password: null };
    if (!args.apply) return { user: null, password: "(new)" };
    const password = newPassword();
    const user = await admin.auth().createUser({ email, password, emailVerified: true });
    return { user, password };
  }

  async function putEmployee(r, extra) {
    console.log(`  employee ${r.id} "${r.name}" PIN ${r.pin}${extra.kiosk ? " [kiosk]" : ""}${extra.isAdmin ? " [admin]" : ""}`);
    if (!args.apply) return;
    const ref = companyRef.collection("employees").doc(r.id);
    const now = FieldValue.serverTimestamp();
    const snap = await ref.get();
    const batch = db.batch();
    batch.set(
      ref,
      {
        name: r.name,
        active: true,
        pin: r.pin,
        assignedSiteIds: [],
        jobTitle: extra.kiosk ? "Kiosk" : extra.isAdmin ? "Admin" : "Laborer",
        hourlyRate: extra.kiosk ? null : 15,
        isSupervisor: false,
        isAdmin: extra.isAdmin === true,
        ...(extra.kiosk ? { kiosk: true } : {}),
        ...(extra.linkedUserId ? { linkedUserId: extra.linkedUserId, email: extra.email } : {}),
        ...(snap.exists ? {} : { createdAt: now }),
        devSeed: "kiosk-task5",
      },
      { merge: true }
    );
    batch.set(companyRef.collection("employeePins").doc(r.id), { pin: r.pin, updatedAt: admin.firestore.Timestamp.now() });
    batch.set(companyRef.collection("pins").doc(r.pin), { employeeId: r.id, updatedAt: admin.firestore.Timestamp.now() });
    await batch.commit();
  }

  for (const e of EMPLOYEES) await putEmployee(e, {});

  // Kiosk login (acceptInvite kiosk branch shape).
  const k = await authUser(KIOSK.email);
  await putEmployee(KIOSK, { kiosk: true, linkedUserId: k.user?.uid, email: KIOSK.email });
  if (args.apply) {
    await db.collection("users").doc(k.user.uid).set({ role: "kiosk", companyId: COMPANY_ID, name: KIOSK.name, email: KIOSK.email }, { merge: true });
    await writeRoleClaims(k.user.uid, { role: "kiosk", companyId: COMPANY_ID, employeeId: KIOSK.id });
  }
  logins.push({ label: "Kiosk login (Front iPad)", email: KIOSK.email, password: k.password });

  // Linked admin with only the Settings permission.
  const a = await authUser(ADMIN.email);
  await putEmployee(ADMIN, { isAdmin: true, linkedUserId: a.user?.uid, email: ADMIN.email });
  if (args.apply) {
    const permissions = { approveHours: false, employees: false, editPay: false, exportPayroll: false, analytics: false, billing: false, settings: true, invites: false };
    await db.collection("users").doc(a.user.uid).set(
      { role: "admin", companyId: COMPANY_ID, name: ADMIN.name, email: ADMIN.email, assignedSiteIds: [], adminAccess: { level: "admin", sites: "all", permissions } },
      { merge: true }
    );
    await writeRoleClaims(a.user.uid, { role: "admin", companyId: COMPANY_ID, employeeId: ADMIN.id });
  }
  logins.push({ label: "Kiosk Admin (Settings permission only)", email: ADMIN.email, password: a.password });

  const fresh = logins.filter((l) => l.password && l.password !== "(new)");
  if (args.apply && fresh.length > 0) {
    const lines = [
      "",
      `# DEV ONLY - Task 5 Kiosk seed (scripts/devSeedKiosk.js), ${new Date().toISOString().slice(0, 10)}. OT Test Co (${COMPANY_ID}).`,
      ...fresh.map((l) => `${l.label}: email=${l.email} password=${l.password}`),
      `PINs: Kiosk Ava ${EMPLOYEES[0].pin}, Kiosk Ben ${EMPLOYEES[1].pin}, Kiosk Cal ${EMPLOYEES[2].pin}, Kiosk Admin (unlocks Kiosk Settings) ${ADMIN.pin}`,
    ];
    fs.appendFileSync(LOGINS_FILE, lines.join("\n") + "\n");
    console.log(`Logins written to ${path.basename(LOGINS_FILE)} (gitignored).`);
  } else {
    console.log(args.apply ? "Logins already existed - passwords unchanged (see .dev-seed-logins.local)." : "Dry run - nothing written.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
