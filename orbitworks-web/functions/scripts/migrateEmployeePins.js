#!/usr/bin/env node
// Release data step: move every employee's plain PIN to the server-only
// companies/{c}/employeePins/{employeeId} (prod-readiness item 7,
// functions/src/lib/employeePin.ts). Two phases, run at different times:
//
// PHASE i - COPY (after the new functions are deployed):
//   copies employees/{id}.pin to employeePins/{id} where that doc is
//   missing. An existing employeePins doc is never overwritten (the server
//   writes it on every PIN change, so it is the newer value).
//     node scripts/migrateEmployeePins.js --project orbitworks-dev-ew            (dry run)
//     node scripts/migrateEmployeePins.js --project orbitworks-dev-ew --apply
//     node scripts/migrateEmployeePins.js --project orbitworks-7ef59 --apply --confirm-prod
//
// PHASE ii - STRIP (ONLY after the new website, which reads PINs through
// getEmployeePins, is live on prod, AND functions are deployed with
// EMPLOYEE_DOC_PIN_REMOVED=true - otherwise the server writes the field
// back on the next PIN change, and the old website shows "-" for PINs):
//   deletes employees/{id}.pin where employeePins/{id} holds a PIN.
//   Employees with no employeePins doc are left alone (run the copy first).
//     node scripts/migrateEmployeePins.js --project orbitworks-dev-ew --strip            (dry run)
//     node scripts/migrateEmployeePins.js --project orbitworks-dev-ew --strip --apply
//
// Safe to re-run: copied/stripped employees are skipped. Prints company and
// employee ids and counts only - never a PIN.

const fs = require("node:fs");
const path = require("node:path");
const guard = require("./lib/projectGuard");

const args = guard.parseArgs(process.argv.slice(2), "migrateEmployeePins.js", ["--strip"]);
guard.lockProject(args.project);

const libDir = path.join(__dirname, "..", "lib");
if (!fs.existsSync(path.join(libDir, "lib", "employeePin.js"))) {
  guard.fail("lib/lib/employeePin.js not found - run `npm run build` in functions/ first.");
}

async function main() {
  const { db } = require(path.join(libDir, "shared.js"));
  const { isPin } = require(path.join(libDir, "lib", "employeePin.js"));
  const admin = require("firebase-admin");
  guard.assertResolvedProject(admin, args.project);

  const phase = args.strip ? "STRIP old employee.pin" : "COPY to employeePins";
  const mode = args.apply ? "APPLY" : "DRY RUN (no writes)";
  console.log(`[migrateEmployeePins] project=${args.project} phase=${phase} mode=${mode}`);

  const counts = args.strip
    ? { companies: 0, employees: 0, noOldField: 0, stripped: 0, wouldStrip: 0, notCopiedYet: 0 }
    : { companies: 0, employees: 0, noOldField: 0, copied: 0, wouldCopy: 0, alreadyCopied: 0, alreadyCopiedDifferent: 0, invalidOldPin: 0 };

  const companies = await db.collection("companies").get();
  for (const company of companies.docs) {
    counts.companies++;
    const employees = await company.ref.collection("employees").get();
    for (const emp of employees.docs) {
      counts.employees++;
      const oldPin = emp.get("pin");
      if (oldPin === undefined) {
        counts.noOldField++;
        continue;
      }
      const pinRef = company.ref.collection("employeePins").doc(emp.id);

      if (!args.strip) {
        if (!isPin(oldPin)) {
          counts.invalidOldPin++;
          console.log(`  ${company.id}/${emp.id}: old pin is not 4 digits - left alone`);
          continue;
        }
        const existing = await pinRef.get();
        if (existing.exists && isPin(existing.get("pin"))) {
          if (existing.get("pin") === oldPin) counts.alreadyCopied++;
          else counts.alreadyCopiedDifferent++; // employeePins is the newer value
          continue;
        }
        if (!args.apply) {
          counts.wouldCopy++;
          console.log(`  ${company.id}/${emp.id}: would copy`);
          continue;
        }
        // Only if nothing wrote employeePins since we looked.
        const done = await db.runTransaction(async (tx) => {
          const fresh = await tx.get(pinRef);
          const freshEmp = await tx.get(emp.ref);
          if (fresh.exists && isPin(fresh.get("pin"))) return false;
          if (freshEmp.get("pin") !== oldPin) return false;
          tx.set(pinRef, { pin: oldPin, updatedAt: admin.firestore.Timestamp.now() });
          return true;
        });
        if (done) {
          counts.copied++;
          console.log(`  ${company.id}/${emp.id}: copied`);
        } else {
          console.log(`  ${company.id}/${emp.id}: changed while copying - left alone, re-run`);
        }
        continue;
      }

      // STRIP
      const current = await pinRef.get();
      if (!current.exists || !isPin(current.get("pin"))) {
        counts.notCopiedYet++;
        console.log(`  ${company.id}/${emp.id}: no employeePins doc yet - left alone (run the copy first)`);
        continue;
      }
      if (!args.apply) {
        counts.wouldStrip++;
        console.log(`  ${company.id}/${emp.id}: would remove old pin field`);
        continue;
      }
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(pinRef);
        if (!fresh.exists || !isPin(fresh.get("pin"))) return;
        tx.update(emp.ref, { pin: admin.firestore.FieldValue.delete() });
      });
      counts.stripped++;
      console.log(`  ${company.id}/${emp.id}: old pin field removed`);
    }
  }
  console.log(`Done. ${JSON.stringify(counts)}`);
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
