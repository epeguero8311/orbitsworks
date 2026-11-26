import * as admin from "firebase-admin";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { z } from "zod";
import { db } from "./shared";
import { normalizeName } from "./joinCompanyValidators";
import { loadKioskCaller } from "./kiosk";
import { pinVerifierHash } from "./lib/pinVerifier";
import { readEmployeePin } from "./lib/employeePin";
import { resolveAdminAccess } from "./adminAccessModel";
import { isProPlan } from "./lib/signupShared";
import { requirePermissionIfAdmin } from "./adminAccess";

// ---- Task 5 v2 (E, F, G): Create account / Create + Update Employee ----
//
// Shared by createEmployee (supervisor app + kiosk "Create account"),
// updateEmployeeProfile and reserveEmployeePin:
// - birthday (YYYY-MM-DD) + the name + birthday duplicate check, which
//   BLOCKS here (sign-up only flags; Emilio asked for a block on create).
// - a 10-minute PIN hold so the PIN modal shows the real PIN before the
//   account exists ("created only after OK").
// - the kiosk caller: Pro + appSettings.kioskCreateAccount, and with
//   kioskRequireAdminPin an admin proof (the same salted hash the kiosk
//   keeps for Kiosk Settings unlock - never a plain PIN in the queue).

export const PIN_HOLD_MS = 10 * 60 * 1000;

export const birthdaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the birthday as MM/DD/YYYY.")
  .refine((v) => {
    const [y, m, d] = v.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    const ok = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
    return ok && y >= 1900 && date.getTime() <= Date.now();
  }, "Enter a real birthday.");

export const adminProofSchema = z
  .object({
    employeeId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    salt: z.string().min(8).max(64),
    hash: z.string().min(8).max(128),
  })
  .strict();

export type AdminProof = z.infer<typeof adminProofSchema>;

export const DUPLICATE_MESSAGE = "Someone with this name and birthday already exists. Check the employee list or ask your admin.";

// Another non-kiosk employee with the same normalized name + birthday.
export async function findDuplicateEmployee(
  companyId: string,
  name: string,
  dob: string,
  exceptEmployeeId: string | null
): Promise<string | null> {
  const snap = await db.collection("companies").doc(companyId).collection("employees").where("dob", "==", dob).get();
  const key = normalizeName(name);
  const hit = snap.docs.find(
    (d) => d.id !== exceptEmployeeId && d.get("kiosk") !== true && normalizeName(String(d.get("name") ?? "")) === key
  );
  return hit ? hit.id : null;
}

export function duplicateError(): HttpsError {
  return new HttpsError("failed-precondition", DUPLICATE_MESSAGE, { reason: "duplicate" });
}

// Is pins/{pin} free for this caller: no doc, OR this caller's own live
// hold, OR anyone's expired unassigned hold.
export function pinFreeFor(data: FirebaseFirestore.DocumentData | undefined, uid: string, nowMs: number): boolean {
  if (!data) return true;
  if (data.employeeId != null) return false;
  const until = data.heldUntil?.toMillis?.() as number | undefined;
  if (typeof until !== "number") return false;
  if (data.heldByUid === uid) return true;
  return until <= nowMs;
}

export type CreatorCaller = {
  companyId: string;
  uid: string;
  kind: "staff" | "kiosk";
};

type KioskCreateSettings = { kioskCreateAccount?: boolean; kioskRequireAdminPin?: boolean };

// Admin proof: the hash the kiosk got from getKioskPinTable's unlockers,
// with that table's salt. Checked against the admin's CURRENT PIN.
async function checkAdminProof(companyId: string, proof: AdminProof | undefined): Promise<void> {
  if (!proof) throw new HttpsError("permission-denied", "An admin PIN is needed to create an account.", { reason: "adminPin" });
  const companyRef = db.collection("companies").doc(companyId);
  const emp = (await companyRef.collection("employees").doc(proof.employeeId).get()).data();
  if (!emp || emp.active !== true || emp.isAdmin !== true || typeof emp.linkedUserId !== "string") {
    throw new HttpsError("permission-denied", "That admin PIN can't approve this.", { reason: "adminPin" });
  }
  const user = (await db.collection("users").doc(emp.linkedUserId).get()).data();
  const access = resolveAdminAccess(user?.role as string | undefined, user?.adminAccess);
  if (user?.companyId !== companyId || user?.role !== "admin" || !(access.level === "full" || access.permissions.settings === true)) {
    throw new HttpsError("permission-denied", "That admin PIN can't approve this.", { reason: "adminPin" });
  }
  const pin = await readEmployeePin(companyId, proof.employeeId, emp);
  if (!pin || pinVerifierHash(proof.salt, pin) !== proof.hash) {
    throw new HttpsError("permission-denied", "That admin PIN changed. Enter it again.", { reason: "adminPin" });
  }
}

// Who may create an employee from the app: supervisor/admin/owner (admins
// also need "Create / edit employees"), or a kiosk with Create account on.
export async function requireCreateCaller(request: CallableRequest, adminProof?: AdminProof): Promise<CreatorCaller> {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
  const role = request.auth.token.role as string | undefined;
  if (role === "kiosk") {
    const kiosk = await loadKioskCaller(request);
    const company = (await kiosk.companyRef.get()).data() ?? {};
    const settings = (company.appSettings ?? {}) as KioskCreateSettings;
    if (!isProPlan(company.planTier as string | undefined)) {
      throw new HttpsError("failed-precondition", "Kiosk needs Pro - ask your admin", { reason: "notPro" });
    }
    if (settings.kioskCreateAccount !== true) {
      throw new HttpsError("failed-precondition", "Creating accounts on the kiosk is turned off.", { reason: "createOff" });
    }
    if (settings.kioskRequireAdminPin === true) await checkAdminProof(kiosk.companyId, adminProof);
    return { companyId: kiosk.companyId, uid: kiosk.uid, kind: "kiosk" };
  }
  const companyId = request.auth.token.companyId as string | undefined;
  if (!companyId || (role !== "admin" && role !== "owner" && role !== "supervisor")) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }
  await requirePermissionIfAdmin(request, "employees");
  return { companyId, uid: request.auth.uid, kind: "staff" };
}

const JUNK = new Set(["0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999", "1234", "4321", "0123", "1212", "2580"]);

const reserveEmployeePinSchema = z
  .object({
    adminProof: adminProofSchema.optional(),
    // Checked here too, so nobody is shown a PIN for an account that would
    // then be refused as a duplicate (createEmployee checks again).
    name: z.string().trim().min(1).max(100).optional(),
    dob: birthdaySchema.optional(),
  })
  .strict();

// ---- reserveEmployeePin (E a) ----
// Holds a fresh unique PIN for 10 minutes for THIS caller; the PIN modal
// shows it and OK sends createEmployee with it as clientPin. An abandoned
// hold simply expires (pinFreeFor), and the caller's older holds are
// released here.
export const reserveEmployeePin = onCall(async (request) => {
  const parsed = reserveEmployeePinSchema.safeParse(request.data ?? {});
  if (!parsed.success) throw new HttpsError("invalid-argument", "Invalid request.");
  const caller = await requireCreateCaller(request, parsed.data.adminProof);
  if (parsed.data.name && parsed.data.dob && (await findDuplicateEmployee(caller.companyId, parsed.data.name, parsed.data.dob, null))) {
    throw duplicateError();
  }
  const pinsRef = db.collection("companies").doc(caller.companyId).collection("pins");
  const nowMs = Date.now();

  const mine = await pinsRef.where("heldByUid", "==", caller.uid).get();
  await Promise.all(
    mine.docs.filter((d) => d.get("employeeId") == null).map((d) => d.ref.delete().catch(() => undefined))
  );

  for (let attempt = 0; attempt < 25; attempt++) {
    let candidate: string;
    do {
      candidate = Math.floor(1000 + Math.random() * 9000).toString();
    } while (JUNK.has(candidate));
    const ref = pinsRef.doc(candidate);
    const won = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists && !pinFreeFor(snap.data(), "", nowMs)) return false;
      tx.set(ref, {
        employeeId: null,
        heldByUid: caller.uid,
        heldUntil: admin.firestore.Timestamp.fromMillis(nowMs + PIN_HOLD_MS),
        updatedAt: admin.firestore.Timestamp.now(),
      });
      return true;
    });
    if (won) return { pin: candidate, heldUntilMs: nowMs + PIN_HOLD_MS };
  }
  throw new HttpsError("resource-exhausted", "Could not find a free PIN. Try again.");
});
