#!/usr/bin/env node
// Release data step: recheck selfies wrongly flagged "no usable face"
// (docs/dev-functions-pending.md, "Release to-do", found 2026-10-27).
//
// Before the fix, a clock photo with no face made checkFaceMatch mark the
// employee's SELFIE faceReference: bad, raise the faceBadReference alert,
// and pause every later face check for them until the selfie changed. This
// finds every employee whose CURRENT selfie is flagged bad (faceReference.
// status == "bad" and faceReference.photoUrl == photoUrl), in Pro companies
// only, and runs DetectFaces on the selfie - the same check
// onEmployeePhotoWrite runs on a new selfie:
//   exactly 1 face -> the flag was wrong: delete faceReference and resolve
//                     the badref-{employeeId} alert (same as a passing selfie)
//   0 or 2+ faces  -> the flag is right: left alone
//   download/AWS failure -> left alone, counted as "couldn't check"
//
// Safe to re-run: a cleared employee no longer matches. The dry run still
// calls DetectFaces (nothing is stored at AWS, ~$0.001 per selfie) so it
// can say exactly what --apply would change, but writes nothing.
//
//   cd functions && npm run build
//   node scripts/recheckBadFaceReferences.js --project orbitworks-dev-ew            (dry run)
//   node scripts/recheckBadFaceReferences.js --project orbitworks-dev-ew --apply
//   node scripts/recheckBadFaceReferences.js --project orbitworks-7ef59 --apply --confirm-prod
//
// Needs gcloud signed in with access to the project's Secret Manager (the
// REKOGNITION_* secrets are read into memory, never printed). Prints ids
// and counts only - no names or photos.

const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const guard = require("./lib/projectGuard");

const args = guard.parseArgs(process.argv.slice(2), "recheckBadFaceReferences.js");
guard.lockProject(args.project);

const libDir = path.join(__dirname, "..", "lib");
if (!fs.existsSync(path.join(libDir, "rekognition.js"))) {
  guard.fail("lib/rekognition.js not found - run `npm run build` in functions/ first.");
}

function readSecret(name) {
  try {
    // name is a constant and args.project is one of the two allowed ids
    // (projectGuard), so this fixed command string can't be injected into.
    const out = execSync(`gcloud secrets versions access latest --secret ${name} --project ${args.project}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const value = out.trim();
    if (!value) throw new Error("empty");
    return value;
  } catch (err) {
    guard.fail(`Couldn't read secret ${name} from ${args.project} (${String(err.message).split("\n")[0]}). Is gcloud signed in?`);
  }
}

async function main() {
  // defineSecret(...).value() reads process.env outside the Functions runtime.
  process.env.REKOGNITION_ACCESS_KEY_ID = readSecret("REKOGNITION_ACCESS_KEY_ID");
  process.env.REKOGNITION_SECRET_ACCESS_KEY = readSecret("REKOGNITION_SECRET_ACCESS_KEY");

  const { db } = require(path.join(libDir, "shared.js"));
  const rek = require(path.join(libDir, "rekognition.js"));
  const { resolveFaceBadReferenceAlert } = require(path.join(libDir, "alerts.js"));
  const { isProPlan } = require(path.join(libDir, "lib", "signupShared.js"));
  const { DetectFacesCommand } = require("@aws-sdk/client-rekognition");
  const admin = require("firebase-admin");
  guard.assertResolvedProject(admin, args.project);

  const mode = args.apply ? "APPLY" : "DRY RUN (no writes)";
  console.log(`[recheckBadFaceReferences] project=${args.project} mode=${mode}`);

  const client = rek.getRekognitionClient();
  const counts = { proCompanies: 0, flaggedCurrentSelfie: 0, wronglyFlagged: 0, cleared: 0, correctlyFlagged: 0, couldNotCheck: 0, flaggedOldSelfieSkipped: 0 };

  const companies = await db.collection("companies").get();
  for (const company of companies.docs) {
    if (!isProPlan(company.data().planTier)) continue;
    counts.proCompanies++;
    const flagged = await company.ref.collection("employees").where("faceReference.status", "==", "bad").get();
    for (const emp of flagged.docs) {
      const data = emp.data();
      if (!data.photoUrl || data.faceReference?.photoUrl !== data.photoUrl) {
        // Flag is for an older selfie; the next selfie write re-decides it.
        counts.flaggedOldSelfieSkipped++;
        continue;
      }
      counts.flaggedCurrentSelfie++;
      const storagePath = rek.storagePathFromDownloadUrl(data.photoUrl);
      const bytes = storagePath ? await rek.downloadImage(storagePath, { companyId: company.id, employeeId: emp.id }) : null;
      let faces = null;
      if (bytes) {
        try {
          const result = await client.send(new DetectFacesCommand({ Image: { Bytes: bytes } }));
          faces = result.FaceDetails?.length ?? 0;
        } catch (err) {
          console.warn(`  ${company.id}/${emp.id}: DetectFaces failed (${String(err.name || err.message)})`);
        }
      }
      if (faces === null) {
        counts.couldNotCheck++;
        console.log(`  ${company.id}/${emp.id}: couldn't check - left alone`);
        continue;
      }
      if (faces !== 1) {
        counts.correctlyFlagged++;
        console.log(`  ${company.id}/${emp.id}: ${faces} faces - flag is right, left alone`);
        continue;
      }
      counts.wronglyFlagged++;
      if (!args.apply) {
        console.log(`  ${company.id}/${emp.id}: 1 face - flag is wrong -> would clear`);
        continue;
      }
      // Only if the selfie hasn't changed since we read it.
      const cleared = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(emp.ref);
        const f = fresh.data();
        if (!f || f.photoUrl !== data.photoUrl || f.faceReference?.status !== "bad") return false;
        tx.update(emp.ref, { faceReference: admin.firestore.FieldValue.delete() });
        return true;
      });
      if (cleared) {
        await resolveFaceBadReferenceAlert(company.id, emp.id);
        counts.cleared++;
        console.log(`  ${company.id}/${emp.id}: 1 face - flag was wrong -> cleared, alert resolved`);
      } else {
        console.log(`  ${company.id}/${emp.id}: changed while checking - left alone`);
      }
    }
  }
  console.log(`Done. ${JSON.stringify(counts)}`);
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
