import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { db } from "./shared";
import { canManageAdmin, resolveAdminAccess, type StoredAdminAccess } from "./adminAccessModel";
import { loadAdminCaller, loadUserAccess, writeRoleClaims } from "./adminAccess";
import { setAdminAccessSchema, setSiteAdminsSchema } from "./adminAccessValidators";

// Admin Permissions (Task 4). setAdminAccess is the ONLY way to change an
// admin's level / sites / permissions (D5, D16). Hierarchy: nobody touches
// the owner; only the owner grants/edits/removes Full access; Full access
// sets regular Admins; nobody edits their own access.

async function employeeIdOf(uid: string): Promise<string | null> {
  const user = await admin.auth().getUser(uid).catch(() => null);
  const claimed = user?.customClaims?.employeeId;
  return typeof claimed === "string" && claimed ? claimed : null;
}

// Writes the access, then the claims mirror, then bumps roleChangedAt so the
// admin's open browser refreshes its token (RC1).
export async function saveAdminAccess(uid: string, companyId: string, access: StoredAdminAccess): Promise<void> {
  const userRef = db.collection("users").doc(uid);
  await userRef.update({ adminAccess: access });
  await writeRoleClaims(uid, { role: "admin", companyId, employeeId: await employeeIdOf(uid) });
  await userRef.update({ roleChangedAt: admin.firestore.FieldValue.serverTimestamp() });
}

export const setAdminAccess = onCall(async (request) => {
  const caller = await loadAdminCaller(request);
  const parsed = setAdminAccessSchema.safeParse(request.data ?? {});
  if (!parsed.success) throw new HttpsError("invalid-argument", "Check the permissions and try again.");
  const { targetUid, level, sites, permissions } = parsed.data;

  const target = await loadUserAccess(caller.companyId, targetUid);
  if (!target.exists) throw new HttpsError("not-found", "Admin not found.");
  if (target.role === "owner") throw new HttpsError("permission-denied", "Nobody can change the owner.");
  if (target.role !== "admin") throw new HttpsError("failed-precondition", "Only admins have permissions.");

  const check = canManageAdmin({ callerUid: caller.uid, caller: caller.access, targetUid, target: target.access, nextLevel: level });
  if (!check.ok) throw new HttpsError("permission-denied", check.reason);

  // Only real job sites (plus "unassigned") of this company.
  if (sites !== "all") {
    const real = sites.filter((s) => s !== "unassigned");
    const snaps = await Promise.all(real.map((s) => db.collection("companies").doc(caller.companyId).collection("jobSites").doc(s).get()));
    if (snaps.some((s) => !s.exists)) throw new HttpsError("invalid-argument", "One of those job sites doesn't exist.");
  }

  const stored: StoredAdminAccess =
    level === "full"
      ? { level: "full", sites: "all", permissions: resolveAdminAccess("owner", null).permissions }
      : { level: "admin", sites, permissions };
  await saveAdminAccess(targetUid, caller.companyId, stored);
  return { success: true };
});

// New job site picker (D6/D17, owner / Full access only): add the site to
// each chosen admin's list. All-sites / Full access admins already see it.
export const setSiteAdmins = onCall(async (request) => {
  const caller = await loadAdminCaller(request);
  if (caller.access.level !== "owner" && caller.access.level !== "full") {
    throw new HttpsError("permission-denied", "Only the owner or a Full access admin can pick who sees a job site.");
  }
  const parsed = setSiteAdminsSchema.safeParse(request.data ?? {});
  if (!parsed.success) throw new HttpsError("invalid-argument", "Check the admins and try again.");
  const { siteId, adminUids } = parsed.data;
  const site = await db.collection("companies").doc(caller.companyId).collection("jobSites").doc(siteId).get();
  if (!site.exists) throw new HttpsError("not-found", "Job site not found.");

  let updated = 0;
  for (const uid of new Set(adminUids)) {
    const target = await loadUserAccess(caller.companyId, uid);
    if (!target.exists || target.role !== "admin") continue;
    const a = target.access;
    if (a.level !== "admin" || a.sites === "all" || a.sites.includes(siteId)) continue;
    // Owner (only) may change a Full access admin; Full can't be here anyway.
    await saveAdminAccess(uid, caller.companyId, { level: "admin", sites: [...a.sites, siteId], permissions: a.permissions });
    updated++;
  }
  return { success: true, updated };
});

// D17: a restricted admin (with Settings) who creates a job site gets it
// added to their own sites automatically - otherwise they'd create a site
// they can't see. createdByUid is forced = the creator by firestore.rules.
export const onJobSiteCreated = onDocumentCreated("companies/{companyId}/jobSites/{siteId}", async (event) => {
  const data = event.data?.data();
  const creator = typeof data?.createdByUid === "string" ? data.createdByUid : null;
  if (!creator) return;
  const { companyId, siteId } = event.params;
  const target = await loadUserAccess(companyId, creator);
  if (!target.exists || target.role !== "admin") return;
  const a = target.access;
  if (a.level !== "admin" || a.sites === "all" || a.sites.includes(siteId)) return;
  await saveAdminAccess(creator, companyId, { level: "admin", sites: [...a.sites, siteId], permissions: a.permissions });
});
