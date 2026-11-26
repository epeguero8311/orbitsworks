import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { randomBytes, randomInt } from "crypto";
import { db } from "./shared";
import { KIOSK_ENABLED } from "./flags";
import { clockError, runClockPunch, type EmployeeDoc } from "./employeeClock";
import { pinVerifierHash } from "./lib/pinVerifier";
import { isProPlan } from "./lib/signupShared";
import { JUNK_PINS } from "./createEmployee";
import { readCompanyPins } from "./lib/employeePin";
import { resolveAdminAccess } from "./adminAccessModel";
import { loadAdminCaller, requirePermission } from "./adminAccess";
import {
  checkKioskUnlockSchema,
  createKioskExitKeySchema,
  getKioskPinTableSchema,
  kioskPunchSchema,
  renameKioskDeviceSchema,
} from "./kioskValidators";
import {
  KIOSK_EXIT_KEY_HOLDER,
  KIOSK_EXIT_KEY_TTL_MS,
  KIOSK_MESSAGES,
  KIOSK_PIN_TABLE_VERSION,
  KIOSK_SERVER_MAX_WRONG,
  KIOSK_SERVER_WINDOW_MS,
  kioskPlanAllows,
  limiterAfterWrong,
  limiterLockedFor,
  type KioskPinTable,
} from "./kioskTypes";

// ---- Task 5: Kiosk mode (shared wall tablet, Pro) ----
//
// A kiosk is an employee record with server-only kiosk: true and a linked
// login whose role claim is "kiosk" (setEmployeeRole / acceptInvite).
// firestore.rules + storage.rules give that login NOTHING company-wide
// (K9: isStaff() allowlist) - only employeeAppConfig, its own users doc and
// "create clock photo" in Storage. Everything else is here:
//
//   getKioskPinTable   who can punch on this tablet: per employee the id,
//                      name, assigned sites, last event and a SALTED hash of
//                      the PIN (new salt every call, K12). Plus the admins
//                      whose own PIN opens Kiosk Settings (K17) and the
//                      sites for Pro auto-detect. Never pay, DOB, phone,
//                      email, photos or a plain PIN.
//   kioskPunch         clock in/out + breaks for the employee the tablet
//                      matched. Same pipeline as employeeClockPunch
//                      (runClockPunch); the server checks the real PIN on
//                      EVERY action (breaks too), plus a per-kiosk limit of
//                      5 wrong PINs a minute (K14).
//   checkKioskUnlock   the 10-minute exit key typed on the tablet (K16).
//   renameKioskDevice  Kiosk Settings -> Device name (K18).
//   createKioskExitKey website: owner / Full access / Settings permission.
//
// KIOSK_ENABLED off = every one of these refuses (K3). Never logs a PIN or
// a key.

type KioskCaller = {
  uid: string;
  companyId: string;
  kioskEmployeeId: string;
  kiosk: FirebaseFirestore.DocumentData;
  companyRef: FirebaseFirestore.DocumentReference;
};

function kioskError(code: "failed-precondition" | "permission-denied" | "resource-exhausted" | "invalid-argument" | "unauthenticated", reason: string, message: string, extra: Record<string, unknown> = {}) {
  return new HttpsError(code, message, { reason, ...extra });
}

// The kiosk login: role claim "kiosk", its record still kiosk: true, linked
// to THIS login and active. Deactivating the record = the kiosk is removed.
export async function loadKioskCaller(request: Pick<CallableRequest, "auth">): Promise<KioskCaller> {
  if (!request.auth) throw kioskError("unauthenticated", "notSignedIn", "You're signed out. Sign in again.");
  if (!KIOSK_ENABLED.value()) throw kioskError("failed-precondition", "kioskOff", KIOSK_MESSAGES.kioskOff);
  const token = request.auth.token;
  const companyId = token.companyId as string | undefined;
  const kioskEmployeeId = token.employeeId as string | undefined;
  if (token.role !== "kiosk" || !companyId || !kioskEmployeeId) {
    throw kioskError("permission-denied", "notKiosk", KIOSK_MESSAGES.notKiosk);
  }
  const companyRef = db.collection("companies").doc(companyId);
  const snap = await companyRef.collection("employees").doc(kioskEmployeeId).get();
  const kiosk = snap.data();
  if (!kiosk || kiosk.kiosk !== true || kiosk.linkedUserId !== request.auth.uid) {
    throw kioskError("permission-denied", "notKiosk", KIOSK_MESSAGES.notKiosk);
  }
  if (kiosk.active !== true) throw kioskError("failed-precondition", "inactive", KIOSK_MESSAGES.inactive);
  return { uid: request.auth.uid, companyId, kioskEmployeeId, kiosk, companyRef };
}

function toMs(v: unknown): number | null {
  return v && typeof (v as admin.firestore.Timestamp).toMillis === "function" ? (v as admin.firestore.Timestamp).toMillis() : null;
}

// ---- getKioskPinTable ----
export const getKioskPinTable = onCall(async (request): Promise<KioskPinTable> => {
  const caller = await loadKioskCaller(request);
  const parsed = getKioskPinTableSchema.safeParse(request.data ?? {});
  if (!parsed.success) throw kioskError("invalid-argument", "invalid", "Invalid request.");

  const { companyRef, companyId } = caller;
  const [companySnap, employeesSnap, sitesSnap, adminsSnap] = await Promise.all([
    companyRef.get(),
    companyRef.collection("employees").get(),
    companyRef.collection("jobSites").get(),
    db.collection("users").where("companyId", "==", companyId).where("role", "==", "admin").get(),
  ]);
  const company = companySnap.data() ?? {};
  const isPro = isProPlan(company.planTier as string | undefined);
  const pinsById = await readCompanyPins(companyId, employeesSnap.docs);
  // K12: a new salt on every call, so every copy on every tablet differs.
  const salt = randomBytes(16).toString("base64url");

  // K15: every active employee of the company (no site filter). Kiosk
  // records never punch (K8).
  const employees: KioskPinTable["employees"] = [];
  for (const doc of employeesSnap.docs) {
    const d = doc.data();
    const pin = pinsById.get(doc.id);
    if (d.active !== true || d.kiosk === true || !pin) continue;
    employees.push({
      id: doc.id,
      name: typeof d.name === "string" ? d.name : "",
      hash: pinVerifierHash(salt, pin),
      assignedSiteIds: Array.isArray(d.assignedSiteIds) ? d.assignedSiteIds.filter((s: unknown) => typeof s === "string") : [],
      lastEventType: typeof d.lastEventType === "string" ? d.lastEventType : null,
      lastEventTimestamp: toMs(d.lastEventTimestamp),
      lastEventSiteId: typeof d.lastEventSiteId === "string" ? d.lastEventSiteId : null,
      lastEventSiteName: typeof d.lastEventSiteName === "string" ? d.lastEventSiteName : null,
    });
  }

  // K17: linked, active admins with Full access or the Settings permission
  // open Kiosk Settings with their own PIN (offline too). The owner has no
  // employee record (no PIN) and uses an exit key. Supervisors never.
  const unlockUids = new Set(
    adminsSnap.docs
      .filter((u) => {
        const access = resolveAdminAccess("admin", u.get("adminAccess"));
        return access.level === "full" || access.permissions.settings === true;
      })
      .map((u) => u.id)
  );
  const unlockers: KioskPinTable["unlockers"] = [];
  for (const doc of employeesSnap.docs) {
    const d = doc.data();
    const pin = pinsById.get(doc.id);
    if (!pin || d.active !== true || d.kiosk === true || d.isAdmin !== true) continue;
    if (typeof d.linkedUserId !== "string" || !unlockUids.has(d.linkedUserId)) continue;
    unlockers.push({ id: doc.id, name: typeof d.name === "string" ? d.name : "", hash: pinVerifierHash(salt, pin) });
  }

  const sites: KioskPinTable["sites"] = sitesSnap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      name: typeof d.name === "string" ? d.name : "",
      active: d.active === true,
      requireGeofence: isPro && d.requireGeofence === true,
      lat: typeof d.lat === "number" ? d.lat : null,
      lng: typeof d.lng === "number" ? d.lng : null,
      radiusMeters: typeof d.radiusMeters === "number" ? d.radiusMeters : null,
    };
  });
  const hasLocatedSites = isPro && sites.some((s) => s.active && s.lat !== null && s.lng !== null);

  return {
    v: KIOSK_PIN_TABLE_VERSION,
    salt,
    isPro,
    kioskName: typeof caller.kiosk.name === "string" ? caller.kiosk.name : "",
    employees,
    unlockers,
    sites,
    hasLocatedSites,
    serverNowMs: Date.now(),
  };
});

// ---- Per-kiosk wrong-PIN / wrong-key limit (K14, server side) ----
// 5 wrong in a 60 s window = refused until the window ends. Right answers
// never count, so a busy morning line never trips it.
function attemptsRef(caller: KioskCaller) {
  return caller.companyRef.collection("kioskPinAttempts").doc(caller.kioskEmployeeId);
}

async function limiterSecondsLeft(caller: KioskCaller, nowMs: number): Promise<number> {
  const snap = await attemptsRef(caller).get();
  return limiterLockedFor(snap.data(), nowMs);
}

async function recordWrongTry(caller: KioskCaller, nowMs: number): Promise<number> {
  const ref = attemptsRef(caller);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const next = limiterAfterWrong(snap.data(), nowMs);
    tx.set(ref, { ...next, updatedAt: admin.firestore.Timestamp.fromMillis(nowMs) });
    return next.count >= KIOSK_SERVER_MAX_WRONG ? Math.ceil((next.windowStartMs + KIOSK_SERVER_WINDOW_MS - nowMs) / 1000) : 0;
  });
}

function lockedError(secondsLeft: number) {
  return clockError("locked", `Too many wrong PINs. Try again in ${secondsLeft} second${secondsLeft === 1 ? "" : "s"}.`, { secondsLeft });
}

async function deviceNameFor(caller: KioskCaller, deviceId: string | undefined): Promise<string | null> {
  if (!deviceId) return null;
  const snap = await caller.companyRef.collection("devices").doc(deviceId).get().catch(() => null);
  const name = snap?.get("name");
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

// ---- kioskPunch ----
export const kioskPunch = onCall(async (request) => {
  const caller = await loadKioskCaller(request);
  const parsed = kioskPunchSchema.safeParse(request.data ?? {});
  if (!parsed.success) throw clockError("invalid", parsed.error.issues[0]?.message);
  const input = parsed.data;
  if (input.employeeId === caller.kioskEmployeeId) throw clockError("wrongAccount", KIOSK_MESSAGES.notAnEmployee);

  // K20: Pro only. After a downgrade, punches made before it (queued on the
  // tablet) still go in; new ones are refused.
  const nowMs = Date.now();
  const punchMs = input.queuedAtMs ?? nowMs;
  const company = (await caller.companyRef.get()).data() ?? {};
  if (!kioskPlanAllows(company.planTier, toMs(company.planTierChangedAt), punchMs)) {
    throw kioskError("failed-precondition", "notPro", KIOSK_MESSAGES.notPro);
  }

  const queued = input.queuedAtMs !== undefined;
  if (!queued) {
    const left = await limiterSecondsLeft(caller, nowMs);
    if (left > 0) throw lockedError(left);
  }

  const { employeeId: _target, deviceId, employeeComment, appVersion, appPlatform, ...rest } = input;
  const deviceNameSnapshot = await deviceNameFor(caller, deviceId);
  const extraEventFields: Record<string, unknown> = { kioskEmployeeId: caller.kioskEmployeeId };
  // Same field the supervisor app writes (Session review shows it).
  if (employeeComment) extraEventFields.employeeComment = employeeComment;
  // Task 6: Devices list app version (copied onto the device doc by onClockEventCreated).
  if (appVersion) extraEventFields.appVersion = appVersion;
  if (appPlatform) extraEventFields.appPlatform = appPlatform;
  if (deviceId) {
    extraEventFields.deviceId = deviceId;
    extraEventFields.deviceNameSnapshot = deviceNameSnapshot;
  }

  const result = await runClockPunch(
    {
      uid: caller.uid,
      companyId: caller.companyId,
      employeeId: input.employeeId,
      source: "kiosk",
      accountError: (emp: EmployeeDoc | undefined) => {
        if (!emp || emp.kiosk === true) return "wrongAccount";
        if (emp.active !== true) return "inactive";
        return null;
      },
      pinOnBreaks: true,
      onlinePinError: async (given, stored, atMs) => {
        if (typeof stored === "string" && stored === given) return null;
        const left = await recordWrongTry(caller, atMs);
        if (left > 0) return lockedError(left);
        return clockError("wrongPin", KIOSK_MESSAGES.wrongPin);
      },
      leaveTracking: false,
      extraEventFields,
    },
    rest
  );
  // A kiosk never gets the photo's download URL or a leave-tracking fence.
  if (result && typeof result === "object" && "eventId" in result) {
    return { ...result, photoUrl: null, fence: null };
  }
  return result;
});

// ---- checkKioskUnlock (exit key typed on the tablet) ----
export const checkKioskUnlock = onCall(async (request) => {
  const caller = await loadKioskCaller(request);
  const parsed = checkKioskUnlockSchema.safeParse(request.data ?? {});
  if (!parsed.success) throw kioskError("invalid-argument", "invalid", "Enter the 4-digit key.");
  const nowMs = Date.now();
  const left = await limiterSecondsLeft(caller, nowMs);
  if (left > 0) throw kioskError("resource-exhausted", "locked", `Too many wrong tries. Try again in ${left} seconds.`, { secondsLeft: left });

  const keysSnap = await caller.companyRef.collection("kioskExitKeys").where("kioskEmployeeId", "==", caller.kioskEmployeeId).get();
  const match = keysSnap.docs.find((d) => {
    const exp = toMs(d.get("expiresAt"));
    return d.get("usedAt") == null && exp !== null && exp > nowMs && d.get("hash") === pinVerifierHash(String(d.get("salt")), parsed.data.code);
  });
  if (!match) {
    const lockLeft = await recordWrongTry(caller, nowMs);
    if (lockLeft > 0) throw kioskError("resource-exhausted", "locked", `Too many wrong tries. Try again in ${lockLeft} seconds.`, { secondsLeft: lockLeft });
    throw kioskError("permission-denied", "wrongKey", KIOSK_MESSAGES.wrongKey);
  }

  // Single use (K16): mark used + free the PIN reservation in one go.
  const pinRef = caller.companyRef.collection("pins").doc(parsed.data.code);
  const used = await db.runTransaction(async (tx) => {
    const [again, pinSnap] = await Promise.all([tx.get(match.ref), tx.get(pinRef)]);
    if (!again.exists || again.get("usedAt") != null) return false;
    tx.update(match.ref, { usedAt: admin.firestore.Timestamp.fromMillis(nowMs), usedByUid: caller.uid });
    if (pinSnap.exists && pinSnap.get("kioskExitKeyId") === match.id) tx.delete(pinRef);
    return true;
  });
  if (!used) throw kioskError("permission-denied", "wrongKey", KIOSK_MESSAGES.wrongKey);
  return { ok: true };
});

// ---- renameKioskDevice (Kiosk Settings -> Device name) ----
export const renameKioskDevice = onCall(async (request) => {
  const caller = await loadKioskCaller(request);
  const parsed = renameKioskDeviceSchema.safeParse(request.data ?? {});
  if (!parsed.success) throw kioskError("invalid-argument", "invalid", parsed.error.issues[0]?.message ?? "Invalid name.");
  const { deviceId, name, platform, model } = parsed.data;
  const ref = caller.companyRef.collection("devices").doc(deviceId);
  const now = admin.firestore.FieldValue.serverTimestamp();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      // Same lock as firestore.rules isValidDeviceRename: a locked name is
      // frozen for everyone until an admin unlocks it.
      if (snap.get("locked") === true) throw kioskError("failed-precondition", "locked", "Your admin locked this device's name.");
      tx.update(ref, { name, updatedAt: now, updatedByUid: caller.uid, kioskEmployeeId: caller.kioskEmployeeId });
    } else {
      tx.set(ref, { name, platform, model: model ?? "", createdByUid: caller.uid, createdAt: now, kioskEmployeeId: caller.kioskEmployeeId });
    }
  });
  return { ok: true, name };
});

// ---- createKioskExitKey (website) ----
//
// K16: 4 digits, 10 minutes, single use, for ONE kiosk. Reserved in the
// pins/{pin} index while valid (employeeId: "kioskExitKey" - every PIN
// path already treats a reservation held by anyone else as taken), so it
// never equals an employee's PIN. Only a salted hash is kept in
// kioskExitKeys; the key itself is shown once, to the admin who made it.
// Not gated on Pro: a company that downgraded still needs to get a tablet
// out of Kiosk mode.
export const createKioskExitKey = onCall(async (request) => {
  const caller = await loadAdminCaller(request);
  if (!KIOSK_ENABLED.value()) throw kioskError("failed-precondition", "kioskOff", KIOSK_MESSAGES.kioskOff);
  // K16: owner / Full access / Settings permission.
  requirePermission(caller, "settings");
  const parsed = createKioskExitKeySchema.safeParse(request.data ?? {});
  if (!parsed.success) throw kioskError("invalid-argument", "invalid", "Pick a kiosk.");
  const companyRef = db.collection("companies").doc(caller.companyId);
  const kioskSnap = await companyRef.collection("employees").doc(parsed.data.kioskEmployeeId).get();
  if (!kioskSnap.exists || kioskSnap.get("kiosk") !== true) {
    throw kioskError("failed-precondition", "notKiosk", "That record isn't a kiosk.");
  }

  const nowMs = Date.now();
  await sweepExpiredExitKeys(companyRef, nowMs);

  const expiresAt = admin.firestore.Timestamp.fromMillis(nowMs + KIOSK_EXIT_KEY_TTL_MS);
  const keyRef = companyRef.collection("kioskExitKeys").doc();
  const salt = randomBytes(16).toString("base64url");
  for (let attempt = 0; attempt < 30; attempt++) {
    const key = String(randomInt(1000, 10000));
    if (JUNK_PINS.has(key)) continue;
    const pinRef = companyRef.collection("pins").doc(key);
    const won = await db.runTransaction(async (tx) => {
      const pinSnap = await tx.get(pinRef);
      if (pinSnap.exists) return false;
      tx.set(pinRef, {
        employeeId: KIOSK_EXIT_KEY_HOLDER,
        kioskExitKeyId: keyRef.id,
        expiresAt,
        updatedAt: admin.firestore.Timestamp.fromMillis(nowMs),
      });
      tx.set(keyRef, {
        kioskEmployeeId: parsed.data.kioskEmployeeId,
        salt,
        hash: pinVerifierHash(salt, key),
        expiresAt,
        createdByUid: caller.uid,
        createdByName: caller.name,
        createdAt: admin.firestore.Timestamp.fromMillis(nowMs),
        usedAt: null,
      });
      return true;
    });
    if (won) return { key, expiresAtMs: expiresAt.toMillis() };
  }
  throw new HttpsError("resource-exhausted", "Couldn't make a key. Try again.");
});

// Frees the PIN reservations of expired exit keys (they stop working at
// expiresAt either way - this only gives the 4 digits back).
async function sweepExpiredExitKeys(companyRef: FirebaseFirestore.DocumentReference, nowMs: number): Promise<void> {
  const held = await companyRef.collection("pins").where("employeeId", "==", KIOSK_EXIT_KEY_HOLDER).get();
  const expired = held.docs.filter((d) => (toMs(d.get("expiresAt")) ?? 0) <= nowMs);
  if (expired.length === 0) return;
  const batch = db.batch();
  for (const d of expired) batch.delete(d.ref);
  await batch.commit();
}
