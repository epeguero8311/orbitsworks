import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { timingSafeEqual, randomUUID } from "crypto";
import { db } from "./shared";
import { employeeClockPunchSchema, getMyPinSchema, getMyPinVerifierSchema, EmployeeClockAction, PunchLocation } from "./employeeClockValidators";
import { locationForPunch } from "./lib/punchLocation";
import { isAccurateEnoughToDetect, isSiteMismatch, loadDetectableSites, pickDetectedClockInSite, pickEmployeeClockInSite, pickEmployeeClockOutSite, type ClockInSitePick, type ShiftFence } from "./geofencing";
import { PIN_REVEAL_MAX, PIN_REVEAL_WINDOW_MS, type MyPinResult } from "./employeePinTypes";
import { fenceForClockIn, fenceForNewClockIn } from "./employeeSiteExits";
import { makePinVerifier, PinVerifierResult } from "./lib/pinVerifier";
import { queuedPinCheck, readPinHistory } from "./lib/pinHistory";
import { pinHistoryRef } from "./pins";
import {
  COULDNT_SYNC_MESSAGE,
  NOT_RECORDED_MESSAGE,
  QUEUED_WRONG_PIN_MESSAGE,
  isFastSync,
  isPhoneClockOff,
  isSuperseded,
  isSyncedLate,
  isSyncBlocked,
  queuedEventMs,
  queuedTimeProblem,
  recordSyncWrongPin,
} from "./employeeClockQueued";

// ---- Employee App: clock in / out / breaks (employeeClockPunch) ----
//
// The ONLY way an employeeApp clock event gets written (firestore.rules
// denies every direct employee write to clockEvents). Order:
//   1. who: role "employee" + companyId/employeeId claims; anything the
//      phone sends for those must match the claims
//   2. zod-validate the input
//   3. a requestId that was already used returns the first result (double
//      tap) - nothing new is written
//   4. the employee doc must still be linked to this login and be active
//   5. in/out only: PIN checked here, never sent back. 3 wrong in a row =
//      1 minute lock, kept in employeePinLocks so reopening the app can't
//      reset it
//   6. in/out only: the live clock photo must be this punch's own file
//      (companies/{c}/clockEvents/{employeeId}/{requestId}.jpg), an image,
//      uploaded in the last 10 minutes
//   7. site, clock-in only (Phase 10 F1/F2, geofencing.ts
//      pickDetectedClockInSite - the same rule as the supervisor app):
//      Pro + a usable fix inside a job site = that site, assigned or not
//      (an unassigned site needs a fix of 100 m or better, an assigned one
//      500 m). Pro + a fix of 100 m or better inside no site = none ("Not
//      specified"). Otherwise (Core, no usable fix, no located site, a
//      100-500 m fix inside none of the assigned sites) the F2 site: crew
//      code site if that site is still active, else the one assigned site
//      if exactly one is assigned, else none.
//      Clock out (fix round 2): its own detection, same rule - detected =
//      that site (Auto-detected); a fix of 100 m or better inside no site
//      = none; otherwise (Core, no usable fix, ...) the shift's clock-in
//      site. Never a site-mismatch flag on a clock-out.
//      Breaks copy the site of that shift's clock-in event (read in the
//      transaction). The shift's hours always count under the clock-in
//      site (Reports, Excel, site costs, Approvals), and the leave
//      tracking fence stays the clock-in site's.
//   8. ONE transaction: re-check active/linked, read the latest clock event,
//      reject a wrong-state punch, write the event with server time. The
//      employee doc is written in the same transaction (lastPunchRequestId)
//      so two punches for the same employee can never both pass the state
//      check.
// A rejected in/out punch deletes its photo, so no face photo is left over.
//
// Leave tracking (Phase 8, Pro): a clock-in at a geofenced site gets
// geofenceRadiusM (the radius locked for the shift) and its result carries
// that fence, so the phone can watch it. Reading it can never reject a
// punch - a failed read just means no tracking for that shift.
//
// Location (Phase 6, every plan): the phone's fix is saved on the event as
// location {lat,lng} + locationAccuracyM + locationFixAtMs when the phone
// got it within 5 min before to 1 min after the punch (phone clock, see
// lib/punchLocation.ts); otherwise location: null. An older app sends no
// location field and the event gets none. A location never rejects or
// changes a punch's time - it is only for display and site detection.
//
// PIN check before the camera (checkPinOnly: true, in/out only): steps 1, 2,
// 4 and 5 only - the same account check and the same PIN lock transaction
// (wrong tries count, 3 = lock) - then returns { pinOk: true } and writes
// nothing else. It is only so a wrong PIN or the lock shows before any photo
// is taken; the real punch still checks the PIN itself, so skipping this
// call can't skip the check.
// onClockEventCreated then runs as for any punch (face check, last status,
// timesheet approval, alerts, auto clock-out).
//
// Queued punch (queuedAtMs set - Phase 4, see employeeClockQueued.ts): same
// steps, except the time window check, the PIN checked without the 3-strike
// lock (and the PIN that was right at the punch's time still passes after
// an admin changed it - Phase 5, oldPinAccepted: true), a later punch
// already recorded rejects it, and the event keeps the phone's time with
// queued: true (plus syncedLate: true if it arrived 5+ minutes late).
// Online punches (no queuedAtMs) are unchanged: current PIN only.
//
// Never log the PIN, photo URL or names - log() prints a step and a code.

export const EMPLOYEE_CLOCK_ERRORS = {
  invalid: "Something went wrong with that punch. Try again.",
  notSignedIn: "You're signed out. Sign in again to clock in.",
  wrongAccount: "This punch doesn't match your account. Sign out and sign in again.",
  inactive: "Your account is inactive, speak to your admin",
  photo: "Your photo didn't upload. Retake it and try again.",
  generic: "Something went wrong. Try again.",
} as const;

export type EmployeeClockErrorReason =
  | keyof typeof EMPLOYEE_CLOCK_ERRORS
  | "wrongPin"
  | "locked"
  | "wrongState"
  // Queued punches only, all permanent (the phone never retries them).
  | "tooOld"
  | "superseded"
  | "badTime"
  | "syncBlocked";

const ERROR_CODES: Record<
  EmployeeClockErrorReason,
  "invalid-argument" | "unauthenticated" | "permission-denied" | "failed-precondition" | "resource-exhausted" | "internal"
> = {
  invalid: "invalid-argument",
  notSignedIn: "unauthenticated",
  wrongAccount: "permission-denied",
  inactive: "failed-precondition",
  wrongPin: "permission-denied",
  locked: "resource-exhausted",
  photo: "invalid-argument",
  wrongState: "failed-precondition",
  generic: "internal",
  tooOld: "failed-precondition",
  superseded: "failed-precondition",
  badTime: "invalid-argument",
  syncBlocked: "permission-denied",
};

function clockError(reason: EmployeeClockErrorReason, message?: string, extra: Record<string, unknown> = {}): HttpsError {
  const text = message ?? EMPLOYEE_CLOCK_ERRORS[reason as keyof typeof EMPLOYEE_CLOCK_ERRORS];
  return new HttpsError(ERROR_CODES[reason], text, { reason, ...extra });
}

function log(step: string, code: string): void {
  console.warn("[employeeClockPunch]", { step, code });
}

export const PIN_MAX_WRONG = 3;
export const PIN_LOCK_MS = 60 * 1000;
export const PHOTO_MAX_AGE_MS = 10 * 60 * 1000;
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const NO_SITE_NAME = "Not specified";

type Status = "in" | "break" | "out";

function statusAfter(type: string | undefined): Status {
  if (type === "in" || type === "breakEnd") return "in";
  if (type === "breakStart") return "break";
  return "out";
}

// Plain message for a punch that doesn't fit the current status.
function wrongStateMessage(action: EmployeeClockAction, status: Status): string | null {
  if (action === "in") {
    if (status === "in") return "You're already clocked in.";
    if (status === "break") return "You're on a break. End your break instead.";
    return null;
  }
  if (action === "out") {
    if (status === "out") return "You're not clocked in.";
    if (status === "break") return "End your break before clocking out.";
    return null;
  }
  if (action === "breakStart") {
    if (status === "out") return "Clock in before starting a break.";
    if (status === "break") return "You're already on a break.";
    return null;
  }
  if (status === "out") return "You're not clocked in.";
  if (status === "in") return "You're not on a break.";
  return null;
}

function pinMatches(given: string, stored: unknown): boolean {
  if (typeof stored !== "string" || stored.length !== given.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(stored));
}

type EmployeeDoc = {
  name?: string;
  active?: boolean;
  pin?: string;
  linkedUserId?: string;
  assignedSiteIds?: unknown;
  joinCodeId?: string | null;
  subcontractorId?: string | null;
  subcontractorName?: string | null;
};

type Site = { siteId: string | null; siteName: string };

async function activeSiteName(companyId: string, siteId: string): Promise<string | null> {
  const snap = await db.collection("companies").doc(companyId).collection("jobSites").doc(siteId).get();
  const site = snap.data() as { name?: string; active?: boolean } | undefined;
  if (!site || site.active === false) return null;
  return typeof site.name === "string" && site.name ? site.name : NO_SITE_NAME;
}

// Crew code site (the newest token doc of the employee's codeId - regenerate
// keeps codeId), if that site is still active; else the employee's one
// assigned site if exactly one is assigned and active; else none.
export async function resolveEmployeeSite(companyId: string, employee: EmployeeDoc): Promise<Site> {
  if (employee.joinCodeId) {
    const codes = await db.collection("joinCodes").where("codeId", "==", employee.joinCodeId).get();
    const newest = codes.docs
      .map((d) => d.data() as { companyId?: string; siteId?: string; createdAt?: admin.firestore.Timestamp })
      .filter((c) => c.companyId === companyId && typeof c.siteId === "string")
      .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))[0];
    if (newest?.siteId) {
      const name = await activeSiteName(companyId, newest.siteId);
      if (name) return { siteId: newest.siteId, siteName: name };
    }
  }
  const assigned = Array.isArray(employee.assignedSiteIds)
    ? employee.assignedSiteIds.filter((id): id is string => typeof id === "string" && id !== "")
    : [];
  if (assigned.length === 1) {
    const name = await activeSiteName(companyId, assigned[0]);
    if (name) return { siteId: assigned[0], siteName: name };
  }
  return { siteId: null, siteName: NO_SITE_NAME };
}

// Duplicated from lib/stripe/tiers.ts's isProPlan (can't import across
// the web boundary - same as clockEvents.ts).
function isProPlan(planTier: unknown): boolean {
  return typeof planTier === "string" && planTier.startsWith("pro_");
}

// Clock-in site (Phase 10 F1/F2, see step 7 in the header). The company
// and sites are only read when there is a usable fix. "Ask for job site
// each time" does not change the Employee App (it has no site picker).
async function resolveClockInSite(
  companyId: string,
  employee: EmployeeDoc,
  location: PunchLocation | null | undefined
): Promise<Site & { autoDetected: boolean }> {
  const [phase3, pick] = await Promise.all([
    resolveEmployeeSite(companyId, employee),
    location ? detectForPro(companyId, employee, location) : Promise.resolve(null),
  ]);
  const picked = pickEmployeeClockInSite(pick, phase3);
  return { ...picked, siteName: picked.siteName || NO_SITE_NAME };
}

async function detectForPro(companyId: string, employee: EmployeeDoc, location: PunchLocation): Promise<ClockInSitePick | null> {
  // No usable fix (D15 b): nothing to read, the F2 site is used.
  if (!isAccurateEnoughToDetect(location.accuracyM)) return null;
  const fix = { lat: location.lat, lng: location.lng };
  const companyRef = db.collection("companies").doc(companyId);
  const company = await companyRef.get();
  if (!isProPlan(company.data()?.planTier)) return null;
  const sites = await loadDetectableSites(companyRef.collection("jobSites"));
  return pickDetectedClockInSite(fix, location.accuracyM, sites, employee.assignedSiteIds);
}

function expectedPhotoPath(companyId: string, employeeId: string, requestId: string): string {
  return `companies/${companyId}/clockEvents/${employeeId}/${requestId}.jpg`;
}

// Best effort - a rejected punch's own photo only (never anyone else's).
async function deletePhoto(path: string): Promise<void> {
  try {
    await admin.storage().bucket().file(path).delete();
  } catch (err) {
    const code = (err as { code?: number } | undefined)?.code;
    if (code !== 404) log("deletePhoto", String(code ?? "unknown"));
  }
}

// Checks the uploaded file and returns its download URL (the same URL shape
// the phone's getDownloadURL makes, which rekognition.ts parses).
async function photoUrlFor(path: string, nowMs: number): Promise<string | null> {
  const bucket = admin.storage().bucket();
  const file = bucket.file(path);
  let meta: {
    contentType?: string;
    size?: string | number;
    timeCreated?: string;
    metadata?: Record<string, string | number | boolean | null>;
  };
  try {
    [meta] = await file.getMetadata();
  } catch {
    return null;
  }
  if (!meta.contentType || !meta.contentType.startsWith("image/")) return null;
  const size = Number(meta.size ?? 0);
  if (!(size > 0) || size > PHOTO_MAX_BYTES) return null;
  const created = meta.timeCreated ? Date.parse(meta.timeCreated) : NaN;
  if (!Number.isFinite(created) || nowMs - created > PHOTO_MAX_AGE_MS || created - nowMs > PHOTO_MAX_AGE_MS) return null;

  const tokens = meta.metadata?.firebaseStorageDownloadTokens;
  let token = typeof tokens === "string" ? tokens.split(",")[0] : "";
  if (!token) {
    token = randomUUID();
    await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
  }
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

type PinOutcome = { ok: true } | { ok: false; reason: "wrongPin"; attemptsLeft: number } | { ok: false; reason: "locked"; secondsLeft: number };

// One transaction on the lock doc so two fast wrong PINs both count.
async function checkPin(companyId: string, employeeId: string, given: string, storedPin: unknown, nowMs: number): Promise<PinOutcome> {
  const lockRef = db.collection("companies").doc(companyId).collection("employeePinLocks").doc(employeeId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(lockRef);
    const lock = snap.data() as { failedCount?: number; lockedUntil?: admin.firestore.Timestamp | null } | undefined;
    const lockedUntilMs = lock?.lockedUntil ? lock.lockedUntil.toMillis() : 0;
    if (lockedUntilMs > nowMs) {
      return { ok: false, reason: "locked", secondsLeft: Math.ceil((lockedUntilMs - nowMs) / 1000) } as PinOutcome;
    }
    if (pinMatches(given, storedPin)) {
      if (snap.exists) tx.delete(lockRef);
      return { ok: true } as PinOutcome;
    }
    // A finished lock starts a fresh count.
    const failed = (lockedUntilMs > 0 ? 0 : lock?.failedCount ?? 0) + 1;
    const now = admin.firestore.Timestamp.fromMillis(nowMs);
    if (failed >= PIN_MAX_WRONG) {
      tx.set(lockRef, { failedCount: 0, lockedUntil: admin.firestore.Timestamp.fromMillis(nowMs + PIN_LOCK_MS), updatedAt: now });
      return { ok: false, reason: "locked", secondsLeft: Math.ceil(PIN_LOCK_MS / 1000) } as PinOutcome;
    }
    tx.set(lockRef, { failedCount: failed, lockedUntil: null, updatedAt: now });
    return { ok: false, reason: "wrongPin", attemptsLeft: PIN_MAX_WRONG - failed } as PinOutcome;
  });
}

function lockedMessage(secondsLeft: number): string {
  return `Too many wrong PINs. Try again in ${secondsLeft} second${secondsLeft === 1 ? "" : "s"}.`;
}

type EventData = {
  employeeId?: string;
  source?: string;
  type?: string;
  timestamp?: admin.firestore.Timestamp;
  siteId?: string | null;
  siteName?: string;
  photoUrl?: string;
};

function resultFrom(eventId: string, data: EventData, replayed: boolean, fence: ShiftFence | null = null) {
  const siteId = data.siteId ?? null;
  return {
    eventId,
    type: data.type as EmployeeClockAction,
    timestampMs: data.timestamp ? data.timestamp.toMillis() : 0,
    siteId,
    siteName: siteId ? data.siteName ?? null : null,
    photoUrl: data.photoUrl ?? null,
    status: statusAfter(data.type),
    replayed,
    // The phone saves (server time, its uptime) after every call, to work
    // out phoneClockOff later (see employeeClockQueued.ts).
    serverNowMs: Date.now(),
    // Phase 8: the shift's fence on a tracked clock-in, else null.
    fence,
  };
}

// A replayed clock-in returns its fence again (read fresh; null on error).
async function withReplayFence(companyId: string, result: ReturnType<typeof resultFrom>, data: EventData | undefined) {
  if (result.type !== "in" || !data) return result;
  const fence = await fenceForClockIn(companyId, data).catch(() => null);
  return { ...result, fence };
}

// A requestId already used by THIS employee for THIS action is a replay.
// Anything else on that id is a bad request.
function replayOf(eventId: string, data: EventData | undefined, employeeId: string, action: EmployeeClockAction) {
  if (!data) return null;
  if (data.employeeId !== employeeId || data.source !== "employeeApp" || data.type !== action) {
    throw clockError("invalid");
  }
  return resultFrom(eventId, data, true);
}

export const employeeClockPunch = onCall(async (request) => {
  // 1. who
  if (!request.auth) throw clockError("notSignedIn");
  const uid = request.auth.uid;
  const role = request.auth.token.role as string | undefined;
  const companyId = request.auth.token.companyId as string | undefined;
  const employeeId = request.auth.token.employeeId as string | undefined;
  if (role !== "employee" || !companyId || !employeeId) throw clockError("wrongAccount");

  // 2. input
  const parsed = employeeClockPunchSchema.safeParse(request.data ?? {});
  if (!parsed.success) throw clockError("invalid", parsed.error.issues[0]?.message);
  const input = parsed.data;
  if ((input.companyId && input.companyId !== companyId) || (input.employeeId && input.employeeId !== employeeId)) {
    throw clockError("wrongAccount");
  }

  const isInOut = input.action === "in" || input.action === "out";
  const queued = input.queuedAtMs !== undefined;
  // Queued but sent within FAST_SYNC_MAX_MS: server time minus the wait,
  // written like an online punch (see employeeClockQueued.ts).
  const fast = queued && isFastSync(input.waitMs);
  const companyRef = db.collection("companies").doc(companyId);
  const eventRef = companyRef.collection("clockEvents").doc(input.requestId);
  const employeeRef = companyRef.collection("employees").doc(employeeId);
  const ownPhotoPath = expectedPhotoPath(companyId, employeeId, input.requestId);
  const photoIsOwn = input.photoPath === ownPhotoPath;

  // Rejects the punch and removes its own photo (never on a replay).
  const reject = async (err: HttpsError): Promise<never> => {
    if (isInOut && photoIsOwn) await deletePhoto(ownPhotoPath);
    throw err;
  };

  // 3. double tap (not for a PIN check, which never writes an event)
  const existing = input.checkPinOnly ? null : await eventRef.get();
  const replay = existing ? replayOf(eventRef.id, existing.data() as EventData | undefined, employeeId, input.action) : null;
  if (replay) return withReplayFence(companyId, replay, existing?.data() as EventData | undefined);

  // 4. account
  const employeeSnap = await employeeRef.get();
  const employee = employeeSnap.data() as EmployeeDoc | undefined;
  if (!employee || employee.linkedUserId !== uid) return reject(clockError("wrongAccount"));
  if (employee.active !== true) return reject(clockError("inactive"));

  const nowMs = Date.now();

  // 4b. queued punch: its time must be within the window (a fast sync
  // gets server time, so the phone's time is never used for it)
  if (queued && !fast) {
    const problem = queuedTimeProblem(input.queuedAtMs as number, nowMs);
    if (problem === "tooOld") return reject(clockError("tooOld", NOT_RECORDED_MESSAGE));
    if (problem === "badTime") return reject(clockError("badTime", COULDNT_SYNC_MESSAGE));
  }

  let photoUrl: string | null = null;
  let oldPinAccepted = false;
  if (isInOut && queued) {
    // 5q. PIN for a queued punch: no 3-strike lock, own 24 h count + cap.
    // The current PIN, or the one that was right at the punch's own time
    // (the same time the event gets, below; a fast sync = server time).
    if (await isSyncBlocked(companyId, employeeId, nowMs)) return reject(clockError("syncBlocked", COULDNT_SYNC_MESSAGE));
    const currentMatches = pinMatches(input.pin as string, employee.pin);
    if (!currentMatches) {
      const eventMs = fast ? nowMs - (input.waitMs as number) : queuedEventMs(input.queuedAtMs as number, nowMs);
      const result = queuedPinCheck({
        pin: input.pin as string,
        currentMatches,
        history: readPinHistory((await pinHistoryRef(companyId, employeeId).get()).data()),
        eventMs,
        nowMs,
        phoneClockOff: isPhoneClockOff({ queuedAtMs: input.queuedAtMs as number, eventMs, fast, expectedAtMs: input.expectedAtMs }),
      });
      if (result !== "old") {
        await recordSyncWrongPin(companyId, employeeId, employee.name ?? "", nowMs);
        return reject(clockError("wrongPin", QUEUED_WRONG_PIN_MESSAGE, { queued: true }));
      }
      oldPinAccepted = true;
    }
  }
  if (isInOut && !queued) {
    // 5. PIN
    const pin = await checkPin(companyId, employeeId, input.pin as string, employee.pin, nowMs);
    if (!pin.ok && pin.reason === "locked") {
      return reject(clockError("locked", lockedMessage(pin.secondsLeft), { secondsLeft: pin.secondsLeft }));
    }
    if (!pin.ok && pin.reason === "wrongPin") {
      const left = pin.attemptsLeft;
      const message = `Wrong PIN. ${left} ${left === 1 ? "try" : "tries"} left before a 1-minute lock.`;
      return reject(clockError("wrongPin", message, { attemptsLeft: left }));
    }
    if (input.checkPinOnly) return { pinOk: true, serverNowMs: Date.now() };
  }
  if (isInOut) {
    // 6. photo
    if (!photoIsOwn) return reject(clockError("photo"));
    photoUrl = await photoUrlFor(ownPhotoPath, nowMs);
    if (!photoUrl) return reject(clockError("photo"));
  }

  // 6b. location (Phase 6): kept only when the fix is from around the punch,
  // by the phone's clock (queuedAtMs; every current app punch sends it).
  const location = locationForPunch(input.location, input.queuedAtMs ?? nowMs);

  // 7. site (see the header). Clock-in: its site now. Clock-out: what its
  // own fix says (null = no usable fix / Core: copy the clock-in site).
  const clockInSite = input.action === "in" ? await resolveClockInSite(companyId, employee, location) : null;
  const clockOutPick = input.action === "out" && location ? await detectForPro(companyId, employee, location) : null;
  // 7b. Phase 8 leave tracking fence (clock-in only, never rejects).
  const clockInFence = clockInSite ? await fenceForNewClockIn(companyId, clockInSite.siteId).catch(() => null) : null;

  // 8. state + write, atomically
  const latestQuery = companyRef
    .collection("clockEvents")
    .where("employeeId", "==", employeeId)
    .orderBy("timestamp", "desc")
    .limit(1);
  // The open shift's clock-in, for out/breaks to copy its site.
  const shiftInQuery = companyRef
    .collection("clockEvents")
    .where("employeeId", "==", employeeId)
    .where("type", "==", "in")
    .orderBy("timestamp", "desc")
    .limit(1);

  type TxResult = { kind: "written"; data: EventData } | { kind: "replay"; data: EventData } | { kind: "rejected"; err: HttpsError };
  let outcome: TxResult;
  try {
    outcome = await db.runTransaction<TxResult>(async (tx) => {
      const [again, empSnap, latestSnap] = await Promise.all([tx.get(eventRef), tx.get(employeeRef), tx.get(latestQuery)]);
      if (again.exists) return { kind: "replay", data: again.data() as EventData };
      const emp = empSnap.data() as EmployeeDoc | undefined;
      if (!emp || emp.linkedUserId !== uid) return { kind: "rejected", err: clockError("wrongAccount") };
      if (emp.active !== true) return { kind: "rejected", err: clockError("inactive") };

      const latest = latestSnap.empty ? undefined : (latestSnap.docs[0].data() as EventData);
      const latestType = latest?.type;
      const txNowMs = Date.now();
      const eventMs = fast
        ? txNowMs - (input.waitMs as number)
        : queued
          ? queuedEventMs(input.queuedAtMs as number, txNowMs)
          : txNowMs;
      if (queued && isSuperseded(eventMs, latest?.timestamp ? latest.timestamp.toMillis() : null)) {
        return { kind: "rejected", err: clockError("superseded", NOT_RECORDED_MESSAGE) };
      }
      const message = wrongStateMessage(input.action, statusAfter(latestType));
      if (message) return { kind: "rejected", err: clockError("wrongState", message, { status: statusAfter(latestType) }) };

      let site: Site = clockInSite ?? { siteId: null, siteName: NO_SITE_NAME };
      let clockOutDetected = false;
      if (!clockInSite) {
        const inSnap = await tx.get(shiftInQuery);
        const shiftIn = inSnap.empty ? undefined : (inSnap.docs[0].data() as EventData);
        if (shiftIn?.siteId) site = { siteId: shiftIn.siteId, siteName: shiftIn.siteName || NO_SITE_NAME };
        if (input.action === "out") {
          const out = pickEmployeeClockOutSite(clockOutPick, site);
          site = { siteId: out.siteId, siteName: out.siteName || NO_SITE_NAME };
          clockOutDetected = out.autoDetected;
        }
      }

      const timestamp = admin.firestore.Timestamp.fromMillis(eventMs);
      const data: Record<string, unknown> = {
        employeeId,
        employeeName: emp.name ?? "",
        siteId: site.siteId,
        siteName: site.siteName,
        subcontractorId: emp.subcontractorId ?? null,
        subcontractorName: emp.subcontractorName ?? null,
        type: input.action,
        source: "employeeApp",
        timestamp,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdByUid: uid,
        requestId: input.requestId,
      };
      if (photoUrl) data.photoUrl = photoUrl;
      // Phase 6. No location field from an older app = none written.
      if (location !== undefined) {
        data.location = location ? { lat: location.lat, lng: location.lng } : null;
        data.locationAccuracyM = location ? location.accuracyM : null;
        data.locationFixAtMs = location ? location.fixAtMs : null;
      }
      if (clockInSite && clockInFence) data.geofenceRadiusM = clockInFence.radiusM;
      if (clockOutDetected) data.siteAutoDetected = true;
      if (clockInSite?.autoDetected) {
        data.siteAutoDetected = true;
        // Same rule as the supervisor app's pin clock-in (geofencing.ts).
        if (isSiteMismatch(clockInSite.siteId, emp.assignedSiteIds)) data.siteMismatch = true;
      }
      if (queued && !fast) {
        data.queued = true;
        if (isSyncedLate(eventMs, txNowMs)) data.syncedLate = true;
      }
      if (queued && isPhoneClockOff({ queuedAtMs: input.queuedAtMs as number, eventMs, fast, expectedAtMs: input.expectedAtMs })) {
        data.phoneClockOff = true;
      }
      if (oldPinAccepted) data.oldPinAccepted = true;
      tx.create(eventRef, data);
      tx.update(employeeRef, { lastPunchRequestId: input.requestId, lastPunchAt: timestamp });
      return { kind: "written", data: data as EventData };
    });
  } catch (err) {
    log("transaction", String((err as { code?: unknown } | undefined)?.code ?? "unknown"));
    return reject(clockError("generic"));
  }

  if (outcome.kind === "rejected") return reject(outcome.err);
  if (outcome.kind === "replay") {
    const again = replayOf(eventRef.id, outcome.data, employeeId, input.action);
    if (again) return withReplayFence(companyId, again, outcome.data);
  }
  return resultFrom(eventRef.id, outcome.data, false, clockInFence);
});

// ---- Employee App Home: where the next clock-in would land ----
//
// Read-only. The phone can't read crew codes, so Home asks the server for
// the site a clock-in would get right now - the SAME resolveEmployeeSite
// the punch uses (crew code site if active, else the single assigned site,
// else none). Home shows it top right while clocked out; while clocked in
// it shows the shift's clock-in site from the employee's own events.
export const getEmployeeHomeSite = onCall(async (request) => {
  if (!request.auth) throw clockError("notSignedIn");
  const role = request.auth.token.role as string | undefined;
  const companyId = request.auth.token.companyId as string | undefined;
  const employeeId = request.auth.token.employeeId as string | undefined;
  if (role !== "employee" || !companyId || !employeeId) throw clockError("wrongAccount");

  const employeeSnap = await db.collection("companies").doc(companyId).collection("employees").doc(employeeId).get();
  const employee = employeeSnap.data() as EmployeeDoc | undefined;
  if (!employee || employee.linkedUserId !== request.auth.uid) throw clockError("wrongAccount");

  const site = await resolveEmployeeSite(companyId, employee);
  // Phase 8: the fence a clock-in here would be watched with - the phone
  // keeps it for an offline clock-in (the server re-checks every exit).
  const fence = await fenceForNewClockIn(companyId, site.siteId).catch(() => null);
  return { siteId: site.siteId, siteName: site.siteId ? site.siteName : null, fence };
});

// ---- Employee App: the PIN check value for the phone (getMyPinVerifier) ----
//
// The signed-in employee's OWN PIN as a salted hash (lib/pinVerifier.ts),
// so the phone can check a typed PIN at once, online or offline. Same
// account check as the punch (role employee, claims, still linked to this
// login). Never returns the PIN itself, never logs anything about it. The
// phone asks on sign-in, app open, reconnect and after a wrong PIN at sync
// (an admin changed it).
export const getMyPinVerifier = onCall(async (request): Promise<PinVerifierResult> => {
  if (!request.auth) throw clockError("notSignedIn");
  const role = request.auth.token.role as string | undefined;
  const companyId = request.auth.token.companyId as string | undefined;
  const employeeId = request.auth.token.employeeId as string | undefined;
  if (role !== "employee" || !companyId || !employeeId) throw clockError("wrongAccount");
  const parsed = getMyPinVerifierSchema.safeParse(request.data ?? {});
  if (!parsed.success) throw clockError("invalid");

  const employeeSnap = await db.collection("companies").doc(companyId).collection("employees").doc(employeeId).get();
  const employee = employeeSnap.data() as EmployeeDoc | undefined;
  if (!employee || employee.linkedUserId !== request.auth.uid) throw clockError("wrongAccount");
  if (employee.active !== true) return { status: "inactive" };
  return makePinVerifier(employee.pin);
});

// ---- Employee App: "Show PIN" on the Settings tab (getMyPin, Phase 10 A1) ----
//
// The signed-in employee's OWN current PIN, only when they tap Show (D1 a).
// Same account check as getMyPinVerifier. The phone keeps it in memory for
// 30 s and never saves it. Never logged. At most PIN_REVEAL_MAX reveals per
// login in PIN_REVEAL_WINDOW_MS (kept in pinReveals/{uid}, server-only:
// firestore.rules' catch-all denies every client), so a phone left
// unlocked can't be used to read the PIN over and over.
// When the PIN moves to a server-only doc (Phase 10 must-fix, D2 a), only
// the read below changes.
export const getMyPin = onCall(async (request): Promise<MyPinResult> => {
  if (!request.auth) throw clockError("notSignedIn");
  const role = request.auth.token.role as string | undefined;
  const companyId = request.auth.token.companyId as string | undefined;
  const employeeId = request.auth.token.employeeId as string | undefined;
  if (role !== "employee" || !companyId || !employeeId) throw clockError("wrongAccount");
  const parsed = getMyPinSchema.safeParse(request.data ?? {});
  if (!parsed.success) throw clockError("invalid");

  const employeeSnap = await db.collection("companies").doc(companyId).collection("employees").doc(employeeId).get();
  const employee = employeeSnap.data() as EmployeeDoc | undefined;
  if (!employee || employee.linkedUserId !== request.auth.uid) throw clockError("wrongAccount");
  if (employee.active !== true) return { status: "inactive" };
  if (typeof employee.pin !== "string" || !/^\d{4}$/.test(employee.pin)) return { status: "noPin" };

  const uid = request.auth.uid;
  const allowed = await db.runTransaction(async (tx) => {
    const ref = db.collection("pinReveals").doc(uid);
    const snap = await tx.get(ref);
    const nowMs = Date.now();
    const recent = ((snap.data()?.atMs as number[] | undefined) ?? []).filter((t) => nowMs - t < PIN_REVEAL_WINDOW_MS);
    if (recent.length >= PIN_REVEAL_MAX) return false;
    tx.set(ref, { atMs: [...recent, nowMs] });
    return true;
  });
  if (!allowed) {
    throw new HttpsError("resource-exhausted", "You've checked your PIN a lot. Try again in a few minutes.", { reason: "tooMany" });
  }
  return { status: "ok", pin: employee.pin };
});
