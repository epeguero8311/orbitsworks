// ROLLBACK for the step 12 PIN strip (docs/prod-release-record.md): copy
// each employee's PIN back from the server-only
// companies/{c}/employeePins/{employeeId} to the old `pin` field on
// companies/{c}/employees/{employeeId} - the reverse of
// migrateEmployeePins.js (copy phase).
//
// Use it only if the strip has to be undone (e.g. the website rolled back
// to a build that reads employees.pin). Set EMPLOYEE_DOC_PIN_REMOVED=false
// and redeploy functions FIRST, otherwise the server deletes the field
// again on the next PIN change.
//
//   employee has no pin field         -> restored from employeePins
//   employee pin == employeePins pin  -> already there, skipped
//   employee pin != employeePins pin  -> reported, left alone
//                                        (--include-different overwrites it
//                                        with the employeePins value, which
//                                        the server treats as the newer one)
//   employeePins doc missing/invalid  -> nothing to restore, skipped
//
//   cd functions && npm run build
//   node scripts/restoreEmployeePins.js --project orbitworks-dev-ew            (dry run)
//   node scripts/restoreEmployeePins.js --project orbitworks-dev-ew --apply
//   node scripts/restoreEmployeePins.js --project orbitworks-7ef59 --apply --confirm-prod
//
// Safe to re-run: restored employees are skipped. Prints company and
// employee ids and counts only - never a PIN.

const fs = require("node:fs");
const path = require("node:path");
const guard = require("./lib/projectGuard");

const args = guard.parseArgs(process.argv.slice(2), "restoreEmployeePins.js", ["--include-different"]);
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

  const mode = args.apply ? "APPLY" : "DRY RUN (no writes)";
  console.log(`[restoreEmployeePins] project=${args.project} mode=${mode}${args["include-different"] ? " +include-different" : ""}`);

  const counts = {
    companies: 0, employees: 0, noPinDoc: 0, alreadyThere: 0,
    wouldRestore: 0, restored: 0, different: 0, wouldOverwriteDifferent: 0, overwrittenDifferent: 0, changedWhileRunning: 0,
  };

  const companies = await db.collection("companies").get();
  for (const company of companies.docs) {
    counts.companies++;
    const employees = await company.ref.collection("employees").get();
    for (const emp of employees.docs) {
      counts.employees++;
      const pinRef = company.ref.collection("employeePins").doc(emp.id);
      const pinDoc = await pinRef.get();
      const newPin = pinDoc.exists ? pinDoc.get("pin") : undefined;
      if (!isPin(newPin)) {
        counts.noPinDoc++;
        continue;
      }
      const oldPin = emp.get("pin");
      if (oldPin === newPin) {
        counts.alreadyThere++;
        continue;
      }
      const isDifferent = oldPin !== undefined;
      if (isDifferent) {
        counts.different++;
        if (!args["include-different"]) {
          console.log(`  ${company.id}/${emp.id}: employee pin differs from employeePins - left alone (--include-different overwrites)`);
          continue;
        }
      }
      if (!args.apply) {
        if (isDifferent) counts.wouldOverwriteDifferent++;
        else counts.wouldRestore++;
        console.log(`  ${company.id}/${emp.id}: would ${isDifferent ? "overwrite different pin" : "restore pin"}`);
        continue;
      }
      // Only if neither doc changed since we looked.
      const done = await db.runTransaction(async (tx) => {
        const freshPin = await tx.get(pinRef);
        const freshEmp = await tx.get(emp.ref);
        if (!freshEmp.exists || !freshPin.exists || freshPin.get("pin") !== newPin) return false;
        if (freshEmp.get("pin") !== oldPin) return false;
        tx.update(emp.ref, { pin: newPin });
        return true;
      });
      if (!done) {
        counts.changedWhileRunning++;
        console.log(`  ${company.id}/${emp.id}: changed while restoring - left alone, re-run`);
      } else if (isDifferent) {
        counts.overwrittenDifferent++;
        console.log(`  ${company.id}/${emp.id}: different pin overwritten`);
      } else {
        counts.restored++;
        console.log(`  ${company.id}/${emp.id}: pin restored`);
      }
    }
  }
  console.log(`Done. ${JSON.stringify(counts)}`);
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
