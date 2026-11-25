#!/usr/bin/env node
// DEV ONLY - Tips (Task 3) on the ALREADY-SEEDED OT Test Co
// (scripts/devSeedOvertime.js). Refuses every other project.
//
//   cd functions
//   node scripts/devSeedTips.js --project orbitworks-dev-ew            (dry run)
//   node scripts/devSeedTips.js --project orbitworks-dev-ew --apply    (writes)
//
// Turns Tips ON for companies/ot-test-company and puts a $45.00 tip on
// OT E's Foreman B shift (Tue Nov 17 2026 12:30-17:30 Chicago) - the plan's
// Juan Nov 12 example (example E). Expected after: Laborer row $75,
// Foreman B row $183, Day total $258 (Reports, Payroll CSV/Excel).
//
// Safe to re-run: writes nothing when Tips is already ON and the tip is
// already $45.00. Writes the same shape setShiftTip does (tip fields on the
// approval doc + one tipEdits entry, in one transaction) and never touches
// status / job / frozen OT / auto-break.
//
// Credentials: Application Default Credentials for the dev project.

const DEV = "orbitworks-dev-ew";
const COMPANY_ID = "ot-test-company";
const EMPLOYEE_ID = "ot-e";
const TIP_CENTS = 4500;
// Tue Nov 17 2026 12:30 America/Chicago (CST, UTC-6).
const CLOCK_IN_MS = Date.UTC(2026, 10, 17, 18, 30);

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

const args = { project: null, apply: false };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--project") args.project = argv[++i];
  else if (a === "--apply") args.apply = true;
  else fail(`Unknown argument "${a}".`);
}
if (args.project !== DEV) fail(`This script only runs with --project ${DEV} (got "${args.project}").`);
for (const name of ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT"]) {
  if (process.env[name] && process.env[name] !== DEV) fail(`${name} is "${process.env[name]}" - only ${DEV} is allowed.`);
}
process.env.GCLOUD_PROJECT = DEV;
process.env.GOOGLE_CLOUD_PROJECT = DEV;

const admin = require("firebase-admin");
admin.initializeApp({ projectId: DEV });
if (admin.app().options.projectId !== DEV) fail("Admin SDK did not resolve to the dev project.");
const db = admin.firestore();
const { Timestamp, FieldValue } = admin.firestore;

async function main() {
  console.log(`[devSeedTips] project=${DEV} apply=${args.apply}`);
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  const company = await companyRef.get();
  if (!company.exists) fail(`companies/${COMPANY_ID} not found - run scripts/devSeedOvertime.js first.`);
  if (company.data().devSeed !== "overtime-task1") fail(`companies/${COMPANY_ID} is not the overtime dev seed company.`);

  const ins = await companyRef
    .collection("clockEvents")
    .where("employeeId", "==", EMPLOYEE_ID)
    .where("timestamp", "==", Timestamp.fromMillis(CLOCK_IN_MS))
    .get();
  const clockIn = ins.docs.find((d) => d.data().type === "in");
  if (!clockIn) fail(`OT E's Nov 17 12:30 clock-in not found in ${COMPANY_ID}.`);
  const approvalRef = companyRef.collection("timesheetApprovals").doc(clockIn.id);
  const approval = await approvalRef.get();
  if (!approval.exists) fail(`timesheetApprovals/${clockIn.id} not found.`);
  const a = approval.data();

  const tipsOn = company.data().tipsEnabled === true;
  const currentTip = typeof a.tipCents === "number" ? a.tipCents : 0;
  console.log(
    `  ${company.data().name}: Tips ${tipsOn ? "ON" : "OFF"}; shift ${clockIn.id} (${a.employeeName}, ${a.date}, ` +
      `job ${a.jobName ?? a.jobId ?? "default"}, ${a.status}) tip now $${(currentTip / 100).toFixed(2)}`
  );
  const plan = [];
  if (!tipsOn) plan.push("turn Tips ON");
  if (currentTip !== TIP_CENTS) plan.push(`set the tip to $${(TIP_CENTS / 100).toFixed(2)} (+ 1 history entry)`);
  if (plan.length === 0) {
    console.log("  Nothing to do - already seeded.");
    return;
  }
  console.log(`  Will: ${plan.join("; ")}.`);
  if (!args.apply) {
    console.log("Dry run - nothing written. Add --apply to write.");
    return;
  }

  if (!tipsOn) await companyRef.update({ tipsEnabled: true });
  if (currentTip !== TIP_CENTS) {
    await db.runTransaction(async (tx) => {
      tx.update(approvalRef, {
        tipCents: TIP_CENTS,
        tipUpdatedByUid: "dev-seed",
        tipUpdatedByName: "OT seed script",
        tipUpdatedAt: FieldValue.serverTimestamp(),
      });
      tx.create(approvalRef.collection("tipEdits").doc(), {
        companyId: COMPANY_ID,
        clockInEventId: clockIn.id,
        amountCents: TIP_CENTS,
        previousAmountCents: currentTip,
        editedByUid: "dev-seed",
        editedByName: "OT seed script",
        editedAt: FieldValue.serverTimestamp(),
      });
    });
  }
  console.log("Done. Reports 2026-11-16 to 2026-11-22: OT E Nov 17 = Laborer $75, Foreman B $183, Day total $258.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
