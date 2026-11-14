#!/usr/bin/env node
// Release data step: seed companies/{id}/employeeAppConfig/current (the
// company settings copy the Employee App reads - isPro, name, timezone,
// hours, alerts, auto clock-out) for every company. syncEmployeeAppConfig
// only writes it on the NEXT company save, so without this every existing
// company's employees get Core behaviour and defaults in the app.
//
// Built with the SAME buildEmployeeAppConfig the trigger uses (compiled
// lib/), so the result is identical to what the next Settings save would
// write. Safe to re-run: a company whose copy already matches is skipped.
//
//   cd functions && npm run build
//   node scripts/backfillEmployeeAppConfig.js --project orbitworks-dev-ew            (dry run)
//   node scripts/backfillEmployeeAppConfig.js --project orbitworks-dev-ew --apply
//   node scripts/backfillEmployeeAppConfig.js --project orbitworks-7ef59 --apply --confirm-prod
//
// Prints company ids and counts only.

const fs = require("node:fs");
const path = require("node:path");
const guard = require("./lib/projectGuard");

const args = guard.parseArgs(process.argv.slice(2), "backfillEmployeeAppConfig.js");
guard.lockProject(args.project);

const libDir = path.join(__dirname, "..", "lib");
if (!fs.existsSync(path.join(libDir, "employeeAppConfig.js"))) {
  guard.fail("lib/employeeAppConfig.js not found - run `npm run build` in functions/ first.");
}

// Compare everything the app reads; updatedAt is bookkeeping.
function sameConfig(existing, wanted) {
  if (!existing) return false;
  const { updatedAt, ...rest } = existing;
  void updatedAt;
  return JSON.stringify(rest) === JSON.stringify(wanted);
}

async function main() {
  const { db } = require(path.join(libDir, "shared.js"));
  const { buildEmployeeAppConfig } = require(path.join(libDir, "employeeAppConfig.js"));
  const admin = require("firebase-admin");
  guard.assertResolvedProject(admin, args.project);

  const mode = args.apply ? "APPLY" : "DRY RUN (no writes)";
  console.log(`[backfillEmployeeAppConfig] project=${args.project} mode=${mode}`);

  const companies = await db.collection("companies").get();
  const counts = { companies: companies.size, missing: 0, outdated: 0, alreadyCurrent: 0, written: 0, pro: 0 };
  for (const company of companies.docs) {
    const wanted = buildEmployeeAppConfig(company.data());
    if (wanted.isPro) counts.pro++;
    const ref = company.ref.collection("employeeAppConfig").doc("current");
    const snap = await ref.get();
    if (snap.exists && sameConfig(snap.data(), wanted)) {
      counts.alreadyCurrent++;
      continue;
    }
    const state = snap.exists ? "outdated" : "missing";
    counts[state]++;
    console.log(`  ${company.id}: ${state}${wanted.isPro ? " (Pro)" : ""}${args.apply ? " -> written" : " -> would write"}`);
    if (args.apply) {
      await ref.set({ ...wanted, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      counts.written++;
    }
  }
  console.log(`Done. ${JSON.stringify(counts)}`);
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
