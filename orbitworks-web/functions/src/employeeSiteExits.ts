import * as admin from "firebase-admin";
import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { db } from "./shared";
import { haversineMeters } from "./geocoding";
import { fenceForSite, fenceSide, type ShiftFence } from "./geofencing";
import { employeeClaims, sendEmployeeAlert } from "./employeeAlerts";
import { createLeftJobSiteAlert } from "./alerts";
import { leftSiteText } from "./employeeShiftAlerts";
import { acceptLocationConsentSchema, getShiftFenceSchema, recordSiteExitSchema, type RecordSiteExitInput } from "./siteExitValidators";
import { MAX_SITE_EXITS_PER_SHIFT, SITE_EXIT_LOCATION_RETENTION_DAYS, type SiteExitEndReason } from "./siteExitTypes";
import { LOCATION_CONSENT_TEXT, LOCATION_CONSENT_VERSION, PRIVACY_POLICY_VERSION } from "./consentVersions";

// ---- Employee App Phase 8: leaving the job site (Pro) ----
//
// FLAG ONLY. Nothing in this file ever blocks a punch, blocks a clock-out,
// writes or changes a clock event, or clocks anyone out.
//
// The phone watches the clock-in site (an OS geofence region + one fix per
// event) while the employee is clocked in from their own phone, and queues
// each stretch outside it ("left") and each stretch it could not track
// ("trackingOff") in its own SQLite queue. They sync here:
//   recordSiteExit   - one start or end of one stretch. The server
//                      re-checks everything against the REAL shift: the
//                      clock-in must be this employee's own employeeApp
//                      clock-in with a locked radius (geofenceRadiusM), the
//                      company must still be Pro and the site still
//                      geofenced, and a "left" start fix must really be
//                      outside the fence (fenceSide). Anything that doesn't
//                      hold up is dropped (ok: true, recorded: false) - an
//                      offline clock-in guessed its fence from the home
//                      site, this is where a wrong guess is thrown away.
//                      tracking: false tells the phone to stop.
//   getShiftFence    - is this shift still tracked, and with which fence
//                      (the phone asks when the app opens mid-shift).
//   closeOpenSiteExits - any clock-out (any source, incl. auto clock-out)
//                      ends every open stretch at the clock-out time.
//   cleanupSiteExitLocations - clears the two locations after 90 days;
//                      the times stay forever.
//   getLocationConsent / acceptLocationConsent - the Phase 8 consent the
//                      phone shows before asking for Always location.
// A "left" that did not start on a break makes one website/supervisor feed
// alert (leftJobSite, no push) and one employeeAlerts entry (leftSite, no
// push - the phone already showed its own notification).

const DAY_MS = 24 * 60 * 60 * 1000;
// Same margins as queued punches (employeeClockQueued.ts).
const MAX_FUTURE_MS = 2 * 60 * 1000;
const SYNCED_LATE_MS = 5 * 60 * 1000;
// A phone clock slightly behind the clock-in's own time still counts.
const BEFORE_CLOCK_IN_SLACK_MS = 60 * 1000;
// Events read after the clock-in to find breaks and the clock-out.
const SHIFT_EVENTS_LIMIT = 100;
const CLEANUP_BATCH = 400;

function companyRef(companyId: string) {
  return db.collection("companies").doc(companyId);
}

function exitsCol(companyId: string) {
  return companyRef(companyId).collection("siteExits");
}

function isProPlan(planTier: unknown): boolean {
  return typeof planTier === "string" && planTier.startsWith("pro_");
}

function toMs(value: unknown): number | null {
  const ts = value as admin.firestore.Timestamp | undefined;
  return ts && typeof ts.toMillis === "function" ? ts.toMillis() : null;
}

// adjustedTimestamp wins, same as the website and the sweep.
function effectiveMs(data: FirebaseFirestore.DocumentData): number | null {
  return toMs(data.adjustedTimestamp) ?? toMs(data.timestamp);
}

// Claims + the employee doc still linked to this login (same check as
// registerEmployeePushToken).
async function linkedEmployee(request: CallableRequest) {
  const { companyId, employeeId } = employeeClaims(request);
  const employee = (await companyRef(companyId).collection("employees").doc(employeeId).get()).data();
  if (!employee || employee.linkedUserId !== request.auth?.uid) {
    throw new HttpsError("permission-denied", "This login is no longer linked to an employee.");
  }
  return { companyId, employeeId, employeeName: typeof employee.name === "string" ? employee.name : "" };
}

// ---- the shift ----

export type ShiftContext =
  | { tracked: false; reason: "noShift" | "notPro" | "notTracked" | "fenceOff" }
  | {
      tracked: true;
      fence: ShiftFence;
      siteId: string | null;
      siteName: string;
      clockInMs: number;
      // The shift's clock-out (effective time), or null while still open.
      endMs: number | null;
      endReason: "clockOut" | "autoClockOut" | null;
      // Events after the clock-in, oldest first (for breaks).
      events: { type: string; ms: number }[];
    };

// The fence of a clock-in event: the site's place today with the radius
// locked at clock-in. Null = not tracked (not Pro, toggle off now, no
// locked radius - the site wasn't geofenced at clock-in). Shared with
// employeeClockPunch's result for a replayed clock-in.
export async function fenceForClockIn(companyId: string, clockIn: FirebaseFirestore.DocumentData): Promise<ShiftFence | null> {
  const radiusM = clockIn.geofenceRadiusM;
  if (clockIn.type !== "in" || typeof radiusM !== "number" || !(radiusM > 0)) return null;
  if (typeof clockIn.siteId !== "string" || !clockIn.siteId) return null;
  const [company, site] = await Promise.all([
    companyRef(companyId).get(),
    companyRef(companyId).collection("jobSites").doc(clockIn.siteId).get(),
  ]);
  if (!isProPlan(company.data()?.planTier)) return null;
  return fenceForSite(site.data(), radiusM);
}

// The radius to lock onto a new clock-in (employeeClockPunch): the site's
// fence when the company is Pro and the site is geofenced, else null.
export async function fenceForNewClockIn(companyId: string, siteId: string | null): Promise<ShiftFence | null> {
  if (!siteId) return null;
  const [company, site] = await Promise.all([
    companyRef(companyId).get(),
    companyRef(companyId).collection("jobSites").doc(siteId).get(),
  ]);
  if (!isProPlan(company.data()?.planTier)) return null;
  return fenceForSite(site.data());
}

export async function loadShiftContext(companyId: string, employeeId: string, clockInEventId: string): Promise<ShiftContext> {
  const clockInSnap = await companyRef(companyId).collection("clockEvents").doc(clockInEventId).get();
  const clockIn = clockInSnap.data();
  // D11: only a shift started from the employee's own phone is tracked.
  if (!clockIn || clockIn.employeeId !== employeeId || clockIn.type !== "in" || clockIn.source !== "employeeApp") {
    return { tracked: false, reason: "noShift" };
  }
  if (typeof clockIn.geofenceRadiusM !== "number") return { tracked: false, reason: "notTracked" };
  const company = await companyRef(companyId).get();
  if (!isProPlan(company.data()?.planTier)) return { tracked: false, reason: "notPro" };
  const fence = await fenceForClockIn(companyId, clockIn);
  if (!fence) return { tracked: false, reason: "fenceOff" };

  const clockInMs = effectiveMs(clockIn) ?? 0;
  const after = await companyRef(companyId)
    .collection("clockEvents")
    .where("employeeId", "==", employeeId)
    .where("timestamp", ">=", clockIn.timestamp)
    .orderBy("timestamp", "asc")
    .limit(SHIFT_EVENTS_LIMIT)
    .get();
  const events = after.docs
    .filter((d) => d.id !== clockInSnap.id)
    .map((d) => ({ type: String(d.data().type ?? ""), ms: effectiveMs(d.data()) ?? 0, source: d.data().source }))
    .sort((a, b) => a.ms - b.ms);
  // The shift ends at the first clock-out, or at the next clock-in (a
  // missed clock-out followed by a new shift).
  const endIndex = events.findIndex((e) => e.type === "out" || e.type === "in");
  const end = endIndex >= 0 ? events[endIndex] : null;
  return {
    tracked: true,
    fence,
    siteId: typeof clockIn.siteId === "string" ? clockIn.siteId : null,
    siteName: typeof clockIn.siteName === "string" ? clockIn.siteName : "",
    clockInMs,
    endMs: end ? end.ms : null,
    endReason: end ? (end.source === "autoClockOut" ? "autoClockOut" : "clockOut") : null,
    events: (endIndex >= 0 ? events.slice(0, endIndex) : events).map(({ type, ms }) => ({ type, ms })),
  };
}

// On a break at atMs, by the shift's own break events (D10).
export function onBreakAt(events: { type: string; ms: number }[], atMs: number): boolean {
  let onBreak = false;
  for (const e of events) {
    if (e.ms > atMs) break;
    if (e.type === "breakStart") onBreak = true;
    else if (e.type === "breakEnd") onBreak = false;
  }
  return onBreak;
}

// ---- recordSiteExit ----

type RecordResult = { ok: true; recorded: boolean; tracking: boolean; dropped?: string };

function locationOf(input: RecordSiteExitInput) {
  return input.location ? { lat: input.location.lat, lng: input.location.lng } : null;
}

async function hasLocationConsent(companyId: string, employeeId: string): Promise<boolean> {
  const consent = (await companyRef(companyId).collection("employeeConsents").doc(employeeId).get()).data();
  return consent?.locationConsentVersion === LOCATION_CONSENT_VERSION && consent?.locationPrivacyVersion === PRIVACY_POLICY_VERSION;
}

async function recordStart(
  ids: { companyId: string; employeeId: string; employeeName: string },
  input: RecordSiteExitInput,
  shift: Extract<ShiftContext, { tracked: true }>,
  nowMs: number
): Promise<RecordResult> {
  const tracking = shift.endMs === null;
  const drop = (dropped: string): RecordResult => ({ ok: true, recorded: false, tracking, dropped });

  if (input.atMs < shift.clockInMs - BEFORE_CLOCK_IN_SLACK_MS || input.atMs > nowMs + MAX_FUTURE_MS) return drop("time");
  if (shift.endMs !== null && input.atMs >= shift.endMs) return drop("afterShift");

  let distanceM: number | null = null;
  if (input.kind === "left") {
    // A place is only ever saved with the location consent in place.
    if (!(await hasLocationConsent(ids.companyId, ids.employeeId))) return drop("noConsent");
    // D8: the exit must hold up against the real clock-in site.
    if (fenceSide(input.location, shift.fence) !== "outside") return drop("notOutside");
    const loc = input.location as { lat: number; lng: number };
    distanceM = Math.round(haversineMeters(loc.lat, loc.lng, shift.fence.lat, shift.fence.lng));
  }

  const count = await exitsCol(ids.companyId).where("clockInEventId", "==", input.clockInEventId).count().get();
  if (count.data().count >= MAX_SITE_EXITS_PER_SHIFT) return drop("cap");

  const onBreak = input.kind === "left" && onBreakAt(shift.events, input.atMs);
  const location = input.kind === "left" ? locationOf(input) : null;
  const now = admin.firestore.FieldValue.serverTimestamp();
  const closed = shift.endMs !== null;
  try {
    await exitsCol(ids.companyId)
      .doc(input.exitId)
      .create({
        employeeId: ids.employeeId,
        employeeName: ids.employeeName,
        clockInEventId: input.clockInEventId,
        siteId: shift.siteId,
        siteName: shift.siteName,
        kind: input.kind,
        startMs: input.atMs,
        endMs: closed ? shift.endMs : null,
        endReason: closed ? shift.endReason : null,
        onBreak,
        offReason: input.kind === "trackingOff" ? input.offReason ?? "appStopped" : null,
        distanceM,
        startLocation: location,
        startAccuracyM: location ? input.location?.accuracyM ?? null : null,
        endLocation: null,
        endAccuracyM: null,
        hasLocation: location !== null,
        queued: nowMs - input.atMs >= SYNCED_LATE_MS,
        createdAt: now,
        updatedAt: now,
      });
  } catch (err) {
    const code = (err as { code?: number | string })?.code;
    if (code === 6 || code === "already-exists") return { ok: true, recorded: false, tracking };
    throw err;
  }

  if (input.kind === "left" && !onBreak) {
    await Promise.all([
      createLeftJobSiteAlert({
        companyId: ids.companyId,
        employeeId: ids.employeeId,
        employeeName: ids.employeeName,
        siteId: shift.siteId,
        siteName: shift.siteName,
        clockInEventId: input.clockInEventId,
        siteExitId: input.exitId,
        startMs: input.atMs,
        distanceM,
      }),
      sendEmployeeAlert({
        companyId: ids.companyId,
        employeeId: ids.employeeId,
        key: input.exitId,
        shiftId: input.clockInEventId,
        push: false,
        ...leftSiteText(shift.siteName, input.atMs),
      }),
    ]);
  }
  return { ok: true, recorded: true, tracking };
}

async function recordEnd(
  ids: { companyId: string; employeeId: string },
  input: RecordSiteExitInput,
  shift: Extract<ShiftContext, { tracked: true }>
): Promise<RecordResult> {
  const tracking = shift.endMs === null;
  const ref = exitsCol(ids.companyId).doc(input.exitId);
  const endReason: SiteExitEndReason = input.kind === "left" ? "returned" : "trackingOn";
  const recorded = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const exit = snap.data();
    if (!exit || exit.employeeId !== ids.employeeId || exit.clockInEventId !== input.clockInEventId || exit.kind !== input.kind) return false;
    if (input.atMs < exit.startMs) return false;
    if (exit.endMs === null) {
      // Ended after the clock-out: the clock-out already ends it.
      if (shift.endMs !== null && input.atMs > shift.endMs) return false;
    } else if (!((exit.endReason === "clockOut" || exit.endReason === "autoClockOut") && input.atMs < exit.endMs)) {
      // Already ended by the phone, or ended by a clock-out before this.
      return false;
    }
    const location = input.kind === "left" ? locationOf(input) : null;
    tx.update(ref, {
      endMs: input.atMs,
      endReason,
      endLocation: location,
      endAccuracyM: location ? input.location?.accuracyM ?? null : null,
      hasLocation: exit.hasLocation === true || location !== null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  });
  return { ok: true, recorded, tracking };
}

export const recordSiteExit = onCall(async (request): Promise<RecordResult> => {
  const ids = await linkedEmployee(request);
  const parsed = recordSiteExitSchema.safeParse(request.data ?? {});
  if (!parsed.success) throw new HttpsError("invalid-argument", "Invalid site exit.");
  const input = parsed.data;

  const shift = await loadShiftContext(ids.companyId, ids.employeeId, input.clockInEventId);
  if (!shift.tracked) return { ok: true, recorded: false, tracking: false, dropped: shift.reason };
  return input.phase === "start" ? recordStart(ids, input, shift, Date.now()) : recordEnd(ids, input, shift);
});

export const getShiftFence = onCall(async (request) => {
  const ids = await linkedEmployee(request);
  const parsed = getShiftFenceSchema.safeParse(request.data ?? {});
  if (!parsed.success) throw new HttpsError("invalid-argument", "Invalid shift.");
  const shift = await loadShiftContext(ids.companyId, ids.employeeId, parsed.data.clockInEventId);
  if (!shift.tracked || shift.endMs !== null) return { tracking: false, fence: null, siteName: null };
  return { tracking: true, fence: shift.fence, siteName: shift.siteName };
});

// ---- clock-out ends every open stretch ----

// Called by onClockEventCreated for every "out" (any source). Ends each of
// the employee's open stretches that started before the clock-out, at the
// clock-out time. Never throws (the trigger's punch already happened).
export async function closeOpenSiteExits(
  companyId: string,
  employeeId: string,
  outMs: number,
  reason: "clockOut" | "autoClockOut"
): Promise<number> {
  try {
    const open = await exitsCol(companyId).where("employeeId", "==", employeeId).where("endMs", "==", null).get();
    const toClose = open.docs.filter((d) => typeof d.data().startMs === "number" && d.data().startMs <= outMs);
    if (toClose.length === 0) return 0;
    const batch = db.batch();
    for (const d of toClose) {
      batch.update(d.ref, { endMs: outMs, endReason: reason, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    }
    await batch.commit();
    return toClose.length;
  } catch (err) {
    console.warn("closeOpenSiteExits failed", { companyId, error: String(err) });
    return 0;
  }
}

// ---- 90-day location cleanup (D14) ----

// Clears both locations on stretches older than the retention window; the
// times, site, distance and reasons stay. Exported for tests.
export async function cleanupSiteExitLocationsRun(nowMs: number): Promise<number> {
  const cutoff = admin.firestore.Timestamp.fromMillis(nowMs - SITE_EXIT_LOCATION_RETENTION_DAYS * DAY_MS);
  let cleared = 0;
  const companies = await db.collection("companies").get();
  for (const company of companies.docs) {
    try {
      for (;;) {
        const old = await exitsCol(company.id).where("hasLocation", "==", true).where("createdAt", "<", cutoff).limit(CLEANUP_BATCH).get();
        if (old.empty) break;
        const batch = db.batch();
        old.docs.forEach((d) =>
          batch.update(d.ref, {
            startLocation: null,
            startAccuracyM: null,
            endLocation: null,
            endAccuracyM: null,
            hasLocation: false,
            locationRemovedAt: admin.firestore.FieldValue.serverTimestamp(),
          })
        );
        await batch.commit();
        cleared += old.size;
        if (old.size < CLEANUP_BATCH) break;
      }
    } catch (err) {
      console.warn("Site exit location cleanup failed for company", { companyId: company.id, error: String(err) });
    }
  }
  return cleared;
}

export const cleanupSiteExitLocations = onSchedule("every 24 hours", async () => {
  await cleanupSiteExitLocationsRun(Date.now());
});

// ---- location consent (D17) ----

export const getLocationConsent = onCall(async (request) => {
  const ids = await linkedEmployee(request);
  return {
    locationConsentVersion: LOCATION_CONSENT_VERSION,
    locationConsentText: LOCATION_CONSENT_TEXT,
    privacyVersion: PRIVACY_POLICY_VERSION,
    accepted: await hasLocationConsent(ids.companyId, ids.employeeId),
  };
});

export const acceptLocationConsent = onCall(async (request) => {
  const ids = await linkedEmployee(request);
  const parsed = acceptLocationConsentSchema.safeParse(request.data ?? {});
  if (!parsed.success) throw new HttpsError("invalid-argument", "Invalid consent.");
  if (parsed.data.locationConsentVersion !== LOCATION_CONSENT_VERSION || parsed.data.privacyVersion !== PRIVACY_POLICY_VERSION) {
    throw new HttpsError("failed-precondition", "The consent was updated. Please read it again.", { reason: "consentVersion" });
  }
  await companyRef(ids.companyId)
    .collection("employeeConsents")
    .doc(ids.employeeId)
    .set(
      {
        employeeId: ids.employeeId,
        locationConsentVersion: LOCATION_CONSENT_VERSION,
        locationPrivacyVersion: PRIVACY_POLICY_VERSION,
        locationConsentAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  return { ok: true };
});
