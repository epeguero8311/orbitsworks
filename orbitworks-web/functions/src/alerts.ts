import { z } from "zod";
import * as admin from "firebase-admin";
import type { Timestamp } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { db, localDateKey, localMinutesOfDay } from "./shared";
import { ALERTS_FEED_ENABLED, isCompanyInTestScope } from "./flags";
import { sendPushForAlert } from "./pushSend";
import { formatGeofenceDistance, type GeofenceStatus } from "./geofencing";
import {
  deriveStatus,
  accumulateWorkedMs,
  getAccumulatedWorkedMs,
  effectiveDate,
  type MinimalClockEvent,
} from "./clockStatus";

// lowStaffing was removed (not a concept this product tracks).
// clockedInOutsideGeofence/siteMismatch both landed here under the exact
// names lib/types.ts's MobileAlertType and dashboardOverviewUtils.ts's
// AlertItem already used for them client-side, rather than inventing new
// ones - no changes needed on either of those union types.
export const ALERT_TYPES = [
  "lateClockIn",
  "earlyClockOut",
  "breakTooLong",
  "maxHours",
  "overtime",
  "missedClockOut",
  "clockedInOutsideGeofence",
  "siteMismatch",
  // Face Verification (Pro) - see functions/src/rekognition.ts.
  "faceMismatch",
  "faceNoFace",
  "faceBadReference",
] as const;

export type AlertType = (typeof ALERT_TYPES)[number];

export const ALERT_SEVERITY: Record<AlertType, "urgent" | "warning" | "info"> = {
  maxHours: "urgent",
  missedClockOut: "urgent",
  overtime: "warning",
  breakTooLong: "warning",
  lateClockIn: "warning",
  earlyClockOut: "warning",
  clockedInOutsideGeofence: "warning",
  // Info-only, same as clockedInOutsideGeofence's own severity choice but
  // one notch down - a mismatch never blocks or implies anything was
  // done wrong, just "someone should take a look."
  siteMismatch: "info",
  // Face Verification (Pro) - never block a clock event, same reasoning
  // as clockedInOutsideGeofence.
  faceMismatch: "warning",
  faceNoFace: "warning",
  faceBadReference: "warning",
};

// The untrusted-input boundary for alert generation: validates every id
// pulled off a clock event/employee/site doc before it's used to build a
// Firestore path or written into an alert. Server-stamped fields
// (createdAt, occurredAt) aren't part of this - they're always set by us,
// never client-supplied. On a failed parse, callers skip silently rather
// than throw (fail-safe requirement: malformed input never blocks the
// clock event this ran after).
export const alertInputSchema = z.object({
  companyId: z.string().min(1),
  alertType: z.enum(ALERT_TYPES),
  employeeId: z.string().min(1).nullable(),
  employeeName: z.string().nullable(),
  siteId: z.string().min(1).nullable(),
  siteName: z.string().nullable(),
  message: z.string().min(1),
  eventId: z.string().min(1).nullable(),
  dateKey: z.string().min(1),
});

export type AlertInput = z.infer<typeof alertInputSchema>;

// companies/{companyId}/alerts/{alertId} - one per underlying condition,
// written once by the alert-generation Cloud Function (Phase 4) using a
// deterministic id (see the `late-`/`early-`/`break-`/`max-`/`ot-`/
// `missed-` prefixes below, matching what dashboardOverviewUtils.ts's old
// buildAlertItems used for the ones it already covered) so retries/
// replays can't duplicate it. readByDeviceIds is the only field a client
// may ever update (firestore.rules), and only by appending its own device
// id - read state is per-device, not per-user, so a shared login on
// multiple phones tracks "seen" independently per device.
export interface AlertDoc extends AlertInput {
  id: string;
  severity: "urgent" | "warning" | "info";
  createdAt: Timestamp;
  occurredAt: Timestamp;
  readByDeviceIds: string[];
}

// Mirrors orbitworks-web/lib/hooks/useCompanySettings.ts's Alerts type -
// functions/ is a separate npm package from the root web app and can't
// import across that boundary, so these are kept in sync manually, same
// as OVERRIDE_REASON_MIN_LENGTH/MAX_LENGTH in shared.ts. Missing settings
// (fail-safe requirement) fall back to these, never throw.
export const ALERT_SETTINGS_DEFAULTS = {
  maxHoursWarning: true,
  maxHoursThreshold: 8,
  overtimeWarning: true,
  missedClockOutAlert: true,
  missedClockOutMinutes: 30,
  maxBreakWarning: true,
  maxBreakMinutes: 15,
  lateClockInAlert: true,
  earlyClockOutAlert: true,
  clockedInOutsideGeofence: true,
  siteMismatchWarning: true,
  // Face Verification (Pro) - default true per spec.
  // Dead weight in practice - no UI ever writes these, so they always
  // resolve to the true default here. The real on/off switch for
  // faceMismatch/faceNoFace is company.faceVerification.alertsEnabled,
  // read separately below (getCompanyAlertContext's faceAlertsEnabled) -
  // faceBadReference never checks either one, it always fires.
  faceMismatchAlert: true,
  faceNoFaceAlert: true,
  faceBadReferenceAlert: true,
} as const;

type AlertSettings = typeof ALERT_SETTINGS_DEFAULTS;

interface CompanyAlertContext {
  alerts: AlertSettings;
  businessHoursOpen: string;
  businessHoursClose: string;
  gracePeriodMinutes: number;
  weeklyOvertimeThreshold: number;
  // Face Verification (Pro) - company.faceVerification.alertsEnabled,
  // default true when missing (see FACE_VERIFICATION_SPEC.md). Checks
  // themselves always run on Pro companies now (functions/src/
  // rekognition.ts); this only gates whether faceMismatch/faceNoFace
  // alerts (and their push) get created. faceBadReference ignores this
  // entirely - it always fires, since it means checks are paused.
  faceAlertsEnabled: boolean;
}

// Missing settings (fail-safe requirement) always resolve to
// ALERT_SETTINGS_DEFAULTS - never throw, never block on a company doc
// that's missing fields or, in a malformed-input edge case, missing
// entirely (returns null, callers skip that company/event silently).
async function getCompanyAlertContext(companyId: string): Promise<CompanyAlertContext | null> {
  if (!companyId) return null;
  const snap = await db.collection("companies").doc(companyId).get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  return {
    alerts: { ...ALERT_SETTINGS_DEFAULTS, ...(data.alerts ?? {}) },
    businessHoursOpen: data.businessHours?.open ?? "08:00",
    businessHoursClose: data.businessHours?.close ?? "17:00",
    gracePeriodMinutes: data.attendanceRules?.gracePeriodMinutes ?? 0,
    weeklyOvertimeThreshold: data.weeklyOvertimeThreshold ?? 40,
    faceAlertsEnabled: data.faceVerification?.alertsEnabled !== false,
  };
}

const ALERT_ID_PREFIX: Record<AlertType, string> = {
  lateClockIn: "late",
  earlyClockOut: "early",
  breakTooLong: "break",
  maxHours: "max",
  overtime: "ot",
  missedClockOut: "missed",
  clockedInOutsideGeofence: "geo",
  siteMismatch: "mismatch",
  faceMismatch: "facemismatch",
  faceNoFace: "facenoface",
  // Only used directly by buildFaceBadReferenceAlertId below, never by
  // buildAlertId - this is the one type with no dateKey in its id.
  faceBadReference: "badref",
};

function buildAlertId(alertType: AlertType, subjectId: string, dateKey: string): string {
  return `${ALERT_ID_PREFIX[alertType]}-${subjectId}-${dateKey}`;
}

// The single write path for every alert type. Uses Firestore's
// create() (not set()) so a second attempt at the same deterministic id -
// a retried trigger, a replayed offline write, two sweep runs overlapping -
// fails with already-exists instead of overwriting, which is exactly the
// idempotency this needs: at most one alert doc, and (since callers only
// push after a non-null return) at most one push, per underlying
// condition. Never throws - malformed input or a write failure both
// resolve to null, so a bad alert can never affect the clock event or
// sweep it ran alongside.
async function createAlertIfNew(input: AlertInput, occurredAt: Timestamp): Promise<AlertDoc | null> {
  const parsed = alertInputSchema.safeParse(input);
  if (!parsed.success) {
    console.warn("Skipping malformed alert input", { input, issues: parsed.error.issues });
    return null;
  }
  const data = parsed.data;
  // clockedInOutsideGeofence/siteMismatch are both keyed per clock-in
  // EVENT, not per employee/day like every other type - an employee can
  // clock in outside the geofence, or at the wrong site, more than once
  // in the same day, and each one is its own underlying condition
  // (mirrors the old client-computed buildGeofenceAlertItems, which
  // keyed its items by event id too).
  const subjectId =
    data.alertType === "clockedInOutsideGeofence" || data.alertType === "siteMismatch"
      ? data.eventId ?? data.employeeId ?? "company"
      : data.employeeId ?? data.siteId ?? "company";
  const alertId = buildAlertId(data.alertType, subjectId, data.dateKey);
  const ref = db.collection("companies").doc(data.companyId).collection("alerts").doc(alertId);

  const docData = {
    ...data,
    severity: ALERT_SEVERITY[data.alertType],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    occurredAt,
    readByDeviceIds: [] as string[],
  };

  try {
    await ref.create(docData);
  } catch (err) {
    const code = (err as { code?: number | string })?.code;
    if (code !== 6 && code !== "already-exists") {
      console.warn("Alert write failed", { companyId: data.companyId, alertId, error: String(err) });
    }
    return null;
  }

  return { id: alertId, ...data, severity: ALERT_SEVERITY[data.alertType], createdAt: occurredAt, occurredAt, readByDeviceIds: [] };
}

async function maybeCreateAndPush(input: AlertInput, occurredAt: Timestamp): Promise<void> {
  let alert: AlertDoc | null = null;
  try {
    alert = await createAlertIfNew(input, occurredAt);
  } catch (err) {
    console.warn("Alert generation failed", { companyId: input.companyId, alertType: input.alertType, error: String(err) });
  }
  if (!alert) return;

  try {
    await sendPushForAlert(alert);
  } catch (err) {
    console.warn("Push send failed", { companyId: alert.companyId, alertId: alert.id, error: String(err) });
  }
}

// Event-triggered: the only two launch alert types knowable at the moment
// of the clock event itself (every other type depends on elapsed time or
// headcount, so it's checked by the periodic sweep below instead). Called
// from onClockEventCreated, AFTER and fully isolated from the existing
// clock-event logic there - never touches the event it ran on.
export async function checkLateClockIn(
  companyId: string,
  eventId: string,
  data: FirebaseFirestore.DocumentData
): Promise<void> {
  if (!ALERTS_FEED_ENABLED.value()) return;
  if (data?.type !== "in") return;
  if (typeof companyId !== "string" || !companyId) return;
  if (!isCompanyInTestScope(companyId)) return;
  if (typeof data.employeeId !== "string" || !data.employeeId) return;

  const ctx = await getCompanyAlertContext(companyId);
  if (!ctx || !ctx.alerts.lateClockInAlert) return;

  const ts: Date = data.timestamp ? data.timestamp.toDate() : new Date();
  const [openH, openM] = ctx.businessHoursOpen.split(":").map(Number);
  const lateThreshold = openH * 60 + openM + ctx.gracePeriodMinutes;
  const eventMinutes = localMinutesOfDay(ts);
  if (eventMinutes <= lateThreshold) return;

  const employeeName = typeof data.employeeName === "string" && data.employeeName ? data.employeeName : "An employee";

  await maybeCreateAndPush(
    {
      companyId,
      alertType: "lateClockIn",
      employeeId: data.employeeId,
      employeeName,
      siteId: typeof data.siteId === "string" ? data.siteId : null,
      siteName: typeof data.siteName === "string" ? data.siteName : null,
      message: "Clocked in late",
      eventId,
      dateKey: localDateKey(ts),
    },
    data.timestamp ?? admin.firestore.Timestamp.now()
  );
}

// Mirrors checkLateClockIn for the other end of the shift: fires when a
// clock-out lands before businessHours.close (minus the same grace
// period, applied symmetrically).
export async function checkEarlyClockOut(
  companyId: string,
  eventId: string,
  data: FirebaseFirestore.DocumentData
): Promise<void> {
  if (!ALERTS_FEED_ENABLED.value()) return;
  if (data?.type !== "out") return;
  if (typeof companyId !== "string" || !companyId) return;
  if (!isCompanyInTestScope(companyId)) return;
  if (typeof data.employeeId !== "string" || !data.employeeId) return;

  const ctx = await getCompanyAlertContext(companyId);
  if (!ctx || !ctx.alerts.earlyClockOutAlert) return;

  const ts: Date = data.timestamp ? data.timestamp.toDate() : new Date();
  const [closeH, closeM] = ctx.businessHoursClose.split(":").map(Number);
  const earlyThreshold = closeH * 60 + closeM - ctx.gracePeriodMinutes;
  const eventMinutes = localMinutesOfDay(ts);
  if (eventMinutes >= earlyThreshold) return;

  const employeeName = typeof data.employeeName === "string" && data.employeeName ? data.employeeName : "An employee";

  await maybeCreateAndPush(
    {
      companyId,
      alertType: "earlyClockOut",
      employeeId: data.employeeId,
      employeeName,
      siteId: typeof data.siteId === "string" ? data.siteId : null,
      siteName: typeof data.siteName === "string" ? data.siteName : null,
      message: "Clocked out early",
      eventId,
      dateKey: localDateKey(ts),
    },
    data.timestamp ?? admin.firestore.Timestamp.now()
  );
}

// Geofencing (Pro) Part 4 - the server-generated replacement for what
// dashboardOverviewUtils.ts's buildGeofenceAlertItems used to compute
// client-side on every dashboard load. Fires for every enforcement mode
// (flag/requireReason) and for overrides alike - only geofenceStatus and
// type matter, not source or mode (a "block" clock-in never reaches here
// at all, since it's never written as an event). Clock-outs are excluded
// (type === "in" only), same as the old client version - they're never
// more than the badge in the log, per spec. geofence/site are passed in
// by the caller rather than read off `data`, since the geofence
// resolution that produces them happens earlier in onClockEventCreated
// and is only ever written back to Firestore, never mutated onto the
// local `data` object this function receives.
export async function checkOutsideGeofence(
  companyId: string,
  eventId: string,
  data: FirebaseFirestore.DocumentData,
  geofence: { applicable: boolean; status: GeofenceStatus | null; distanceM: number | null },
  site: { siteId: string | null; siteName: string | null }
): Promise<void> {
  if (!ALERTS_FEED_ENABLED.value()) return;
  if (data?.type !== "in") return;
  if (!geofence.applicable || geofence.status !== "outside") return;
  if (typeof companyId !== "string" || !companyId) return;
  if (!isCompanyInTestScope(companyId)) return;
  if (typeof data.employeeId !== "string" || !data.employeeId) return;

  const ctx = await getCompanyAlertContext(companyId);
  if (!ctx || !ctx.alerts.clockedInOutsideGeofence) return;

  const ts: Date = data.timestamp ? data.timestamp.toDate() : new Date();
  const employeeName = typeof data.employeeName === "string" && data.employeeName ? data.employeeName : "An employee";
  const reason = typeof data.reason === "string" && data.reason ? data.reason : null;
  const siteName = site.siteName || "the job site";
  const distancePhrase = geofence.distanceM != null ? formatGeofenceDistance(geofence.distanceM) : null;
  const message = distancePhrase
    ? `Clocked in ${distancePhrase} from ${siteName}${reason ? ` - Reason: ${reason}` : ""}`
    : `Clocked in outside the geofence at ${siteName}${reason ? ` - Reason: ${reason}` : ""}`;

  await maybeCreateAndPush(
    {
      companyId,
      alertType: "clockedInOutsideGeofence",
      employeeId: data.employeeId,
      employeeName,
      siteId: site.siteId,
      siteName: site.siteName,
      message,
      eventId,
      dateKey: localDateKey(ts),
    },
    data.timestamp ?? admin.firestore.Timestamp.now()
  );
}

// Auto site detection - the server-generated replacement for what
// dashboardOverviewUtils.ts's buildGeofenceAlertItems used to compute
// client-side on every dashboard load (same migration as
// checkOutsideGeofence above). siteMismatch is only ever set on a
// clock-in (clockEvents.ts), and only when the employee has their own
// assignedSiteIds and the detected site isn't one of them - info-only,
// never blocks, so this is purely a "someone should take a look" flag.
export async function checkSiteMismatch(
  companyId: string,
  eventId: string,
  data: FirebaseFirestore.DocumentData,
  siteMismatch: boolean,
  site: { siteId: string | null; siteName: string | null }
): Promise<void> {
  if (!ALERTS_FEED_ENABLED.value()) return;
  if (data?.type !== "in") return;
  if (!siteMismatch) return;
  if (typeof companyId !== "string" || !companyId) return;
  if (!isCompanyInTestScope(companyId)) return;
  if (typeof data.employeeId !== "string" || !data.employeeId) return;

  const ctx = await getCompanyAlertContext(companyId);
  if (!ctx || !ctx.alerts.siteMismatchWarning) return;

  const ts: Date = data.timestamp ? data.timestamp.toDate() : new Date();
  const employeeName = typeof data.employeeName === "string" && data.employeeName ? data.employeeName : "An employee";
  const siteName = site.siteName || "an unassigned site";

  await maybeCreateAndPush(
    {
      companyId,
      alertType: "siteMismatch",
      employeeId: data.employeeId,
      employeeName,
      siteId: site.siteId,
      siteName: site.siteName,
      message: `Clocked in at ${siteName} - not one of their assigned job sites.`,
      eventId,
      dateKey: localDateKey(ts),
    },
    data.timestamp ?? admin.firestore.Timestamp.now()
  );
}

// Face Verification (Pro) - called from functions/src/rekognition.ts
// AFTER it writes faceCheck onto the clock event, fully isolated (its own
// try/catch there) from the check itself. Mirrors checkOutsideGeofence/
// checkSiteMismatch above in every other way. Side-by-side clock/
// reference photos aren't stored on the alert doc itself - the UI
// resolves the full ClockEvent by eventId (AlertsPanel.tsx already does
// this for clockedInOutsideGeofence/siteMismatch) and reads photoUrl/
// faceCheck.referencePhotoUrl off that instead.
export async function createFaceMismatchAlert(
  companyId: string,
  eventId: string,
  employeeId: string,
  employeeName: string,
  similarity: number,
  timestamp: admin.firestore.Timestamp | null
): Promise<void> {
  if (!ALERTS_FEED_ENABLED.value()) return;
  if (!isCompanyInTestScope(companyId)) return;

  const ctx = await getCompanyAlertContext(companyId);
  if (!ctx || !ctx.alerts.faceMismatchAlert || !ctx.faceAlertsEnabled) return;

  const ts = timestamp ? timestamp.toDate() : new Date();
  await maybeCreateAndPush(
    {
      companyId,
      alertType: "faceMismatch",
      employeeId,
      employeeName,
      siteId: null,
      siteName: null,
      message: `Face didn't match the clock photo (${similarity}% similarity) - confirm it's really ${employeeName}.`,
      eventId,
      dateKey: localDateKey(ts),
    },
    timestamp ?? admin.firestore.Timestamp.now()
  );
}

export async function createFaceNoFaceAlert(
  companyId: string,
  eventId: string,
  employeeId: string,
  employeeName: string,
  timestamp: admin.firestore.Timestamp | null
): Promise<void> {
  if (!ALERTS_FEED_ENABLED.value()) return;
  if (!isCompanyInTestScope(companyId)) return;

  const ctx = await getCompanyAlertContext(companyId);
  if (!ctx || !ctx.alerts.faceNoFaceAlert || !ctx.faceAlertsEnabled) return;

  const ts = timestamp ? timestamp.toDate() : new Date();
  await maybeCreateAndPush(
    {
      companyId,
      alertType: "faceNoFace",
      employeeId,
      employeeName,
      siteId: null,
      siteName: null,
      message: "No face was detected in the clock photo.",
      eventId,
      dateKey: localDateKey(ts),
    },
    timestamp ?? admin.firestore.Timestamp.now()
  );
}

// faceBadReference is the one alert type that breaks the "one per
// employee/day, kept forever, resolved via alertActions ignore/resolve"
// convention every other type here follows: one per EMPLOYEE (no dateKey
// in the id - a bad pfp isn't a per-day condition) and resolved by
// deleting the doc outright once the pfp passes DetectFaces again or is
// removed (there's no Ignore action for this one per spec). Bypasses
// buildAlertId/createAlertIfNew's dateKey-based id scheme entirely for
// that reason - everything else about the write (ref.create() for
// idempotency, push only on a genuinely NEW flag, not a repeat) still
// matches maybeCreateAndPush's shape, just inlined here since that
// dateKey-less id doesn't fit alertInputSchema's id-building path.
function buildFaceBadReferenceAlertId(employeeId: string): string {
  return `${ALERT_ID_PREFIX.faceBadReference}-${employeeId}`;
}

export async function createOrKeepFaceBadReferenceAlert(
  companyId: string,
  employeeId: string,
  employeeName: string
): Promise<void> {
  if (!ALERTS_FEED_ENABLED.value()) return;
  if (!isCompanyInTestScope(companyId)) return;

  const ctx = await getCompanyAlertContext(companyId);
  if (!ctx || !ctx.alerts.faceBadReferenceAlert) return;

  const alertId = buildFaceBadReferenceAlertId(employeeId);
  const now = admin.firestore.Timestamp.now();
  const input: AlertInput = {
    companyId,
    alertType: "faceBadReference",
    employeeId,
    employeeName,
    siteId: null,
    siteName: null,
    message: `${employeeName}'s profile photo has no usable face. Face verification is paused for them until it's updated.`,
    eventId: null,
    // Not used for the id (see above) - just satisfies MobileAlert's
    // required field.
    dateKey: localDateKey(now.toDate()),
  };
  const parsed = alertInputSchema.safeParse(input);
  if (!parsed.success) {
    console.warn("Skipping malformed faceBadReference alert input", { input, issues: parsed.error.issues });
    return;
  }

  const ref = db.collection("companies").doc(companyId).collection("alerts").doc(alertId);
  const docData = {
    ...parsed.data,
    severity: ALERT_SEVERITY.faceBadReference,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    occurredAt: now,
    readByDeviceIds: [] as string[],
  };

  let created: AlertDoc;
  try {
    await ref.create(docData);
    created = {
      id: alertId,
      ...parsed.data,
      severity: ALERT_SEVERITY.faceBadReference,
      createdAt: now,
      occurredAt: now,
      readByDeviceIds: [],
    };
  } catch (err) {
    const code = (err as { code?: number | string })?.code;
    if (code !== 6 && code !== "already-exists") {
      console.warn("faceBadReference alert write failed", { companyId, alertId, error: String(err) });
    }
    return; // already flagged for this employee - no new push
  }

  try {
    await sendPushForAlert(created);
  } catch (err) {
    console.warn("Push send failed", { companyId, alertId, error: String(err) });
  }
}

// Deletes the persistent flag outright - called once the reference-photo
// check (functions/src/rekognition.ts) sees a good pfp again, or sees the
// pfp removed entirely. delete() on an id that was never created (no
// flag was ever raised) is a harmless no-op, so callers never need to
// check existence first.
export async function resolveFaceBadReferenceAlert(companyId: string, employeeId: string): Promise<void> {
  const alertId = buildFaceBadReferenceAlertId(employeeId);
  await db
    .collection("companies")
    .doc(companyId)
    .collection("alerts")
    .doc(alertId)
    .delete()
    .catch((err) => {
      console.warn("Failed to resolve faceBadReference alert", { companyId, alertId, error: String(err) });
    });
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toMinimalEvent(doc: FirebaseFirestore.QueryDocumentSnapshot): MinimalClockEvent | null {
  const data = doc.data();
  if (!data || typeof data.employeeId !== "string" || typeof data.type !== "string") return null;
  const validTypes = ["in", "out", "breakStart", "breakEnd"] as const;
  if (!(validTypes as readonly string[]).includes(data.type)) return null;
  return {
    id: doc.id,
    employeeId: data.employeeId,
    type: data.type as (typeof validTypes)[number],
    timestamp: data.timestamp,
    adjustedTimestamp: data.adjustedTimestamp,
  };
}

// One company's slice of the periodic sweep - isolated in its own
// try/catch by the caller so one company's bad data/query failure can
// never take down the sweep for every other company.
async function sweepCompany(companyDoc: FirebaseFirestore.QueryDocumentSnapshot): Promise<void> {
  const companyId = companyDoc.id;
  if (!isCompanyInTestScope(companyId)) return;
  const ctx = await getCompanyAlertContext(companyId);
  if (!ctx) return;
  const { alerts } = ctx;
  if (!alerts.maxHoursWarning && !alerts.overtimeWarning && !alerts.missedClockOutAlert && !alerts.maxBreakWarning) {
    return;
  }

  const now = new Date();
  const eventsRef = companyDoc.ref.collection("clockEvents");

  // 3-day lookback - enough to find every employee's latest event without
  // scanning full history.
  const lookbackStart = admin.firestore.Timestamp.fromMillis(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const recentSnap = await eventsRef.where("timestamp", ">=", lookbackStart).orderBy("timestamp", "desc").get();
  const recentEvents = recentSnap.docs.map(toMinimalEvent).filter((e): e is MinimalClockEvent => e !== null);

  const employeeNames = new Map<string, string>();
  recentSnap.docs.forEach((d) => {
    const data = d.data();
    if (typeof data.employeeId === "string" && typeof data.employeeName === "string") {
      employeeNames.set(data.employeeId, data.employeeName);
    }
  });
  const employeeSites = new Map<string, { siteId: string | null; siteName: string | null }>();
  recentSnap.docs.forEach((d) => {
    const data = d.data();
    if (typeof data.employeeId === "string") {
      employeeSites.set(data.employeeId, {
        siteId: typeof data.siteId === "string" ? data.siteId : null,
        siteName: typeof data.siteName === "string" ? data.siteName : null,
      });
    }
  });

  const latestByEmployee = new Map<string, MinimalClockEvent>();
  for (const event of recentEvents) {
    const existing = latestByEmployee.get(event.employeeId);
    const eventMs = effectiveDate(event)?.getTime() ?? 0;
    const existingMs = existing ? effectiveDate(existing)?.getTime() ?? 0 : -1;
    if (!existing || eventMs > existingMs) {
      latestByEmployee.set(event.employeeId, event);
    }
  }

  const currentlyActive = Array.from(latestByEmployee.values()).filter((e) => deriveStatus(e.type) !== "out");
  const currentlyOnBreak = currentlyActive.filter((e) => deriveStatus(e.type) === "break");

  // Break Over Limit
  if (alerts.maxBreakWarning) {
    for (const event of currentlyOnBreak) {
      const d = effectiveDate(event);
      if (!d) continue;
      const elapsedMinutes = (now.getTime() - d.getTime()) / (1000 * 60);
      if (elapsedMinutes < alerts.maxBreakMinutes) continue;
      const employeeName = employeeNames.get(event.employeeId) ?? "An employee";
      const site = employeeSites.get(event.employeeId);
      await maybeCreateAndPush(
        {
          companyId,
          alertType: "breakTooLong",
          employeeId: event.employeeId,
          employeeName,
          siteId: site?.siteId ?? null,
          siteName: site?.siteName ?? null,
          message: "Break ran too long",
          eventId: event.id,
          dateKey: localDateKey(d),
        },
        admin.firestore.Timestamp.now()
      );
    }
  }

  // Max Hours - same-day shifts only, matching dashboardOverviewUtils.ts
  if (alerts.maxHoursWarning) {
    for (const event of currentlyActive) {
      const d = effectiveDate(event);
      if (!d || localDateKey(d) !== localDateKey(now)) continue;
      const employeeEvents = recentEvents.filter((e) => e.employeeId === event.employeeId);
      const workedHours = getAccumulatedWorkedMs(employeeEvents, now) / (1000 * 60 * 60);
      if (workedHours < alerts.maxHoursThreshold) continue;
      const employeeName = employeeNames.get(event.employeeId) ?? "An employee";
      const site = employeeSites.get(event.employeeId);
      await maybeCreateAndPush(
        {
          companyId,
          alertType: "maxHours",
          employeeId: event.employeeId,
          employeeName,
          siteId: site?.siteId ?? null,
          siteName: site?.siteName ?? null,
          message: "Worked too many hours today",
          eventId: event.id,
          dateKey: localDateKey(d),
        },
        admin.firestore.Timestamp.now()
      );
    }
  }

  // Missed Clock Out
  if (alerts.missedClockOutAlert) {
    for (const event of currentlyActive) {
      const d = effectiveDate(event);
      if (!d || localDateKey(d) === localDateKey(now)) continue;
      const employeeName = employeeNames.get(event.employeeId) ?? "An employee";
      const site = employeeSites.get(event.employeeId);
      await maybeCreateAndPush(
        {
          companyId,
          alertType: "missedClockOut",
          employeeId: event.employeeId,
          employeeName,
          siteId: site?.siteId ?? null,
          siteName: site?.siteName ?? null,
          message: "Missed clock-out",
          eventId: event.id,
          dateKey: localDateKey(d),
        },
        admin.firestore.Timestamp.now()
      );
    }
  }

  // Overtime - separate weekly-scoped query, same accumulation logic as
  // useDashboardStatus.ts's loadWeeklyHours.
  if (alerts.overtimeWarning) {
    const weekStart = getWeekStart(now);
    const weekStartTs = admin.firestore.Timestamp.fromDate(weekStart);
    const weekSnap = await eventsRef.where("timestamp", ">=", weekStartTs).orderBy("timestamp", "asc").get();
    const weekEvents = weekSnap.docs.map(toMinimalEvent).filter((e): e is MinimalClockEvent => e !== null);

    const byEmployee = new Map<string, MinimalClockEvent[]>();
    for (const event of weekEvents) {
      const list = byEmployee.get(event.employeeId) ?? [];
      list.push(event);
      byEmployee.set(event.employeeId, list);
    }

    const weekKey = localDateKey(weekStart);
    for (const [employeeId, empEvents] of byEmployee) {
      const sorted = [...empEvents].sort((a, b) => (effectiveDate(a)?.getTime() ?? 0) - (effectiveDate(b)?.getTime() ?? 0));
      const hours = accumulateWorkedMs(sorted, now.getTime()) / (1000 * 60 * 60);
      if (hours <= ctx.weeklyOvertimeThreshold) continue;
      const employeeName = employeeNames.get(employeeId) ?? "An employee";
      await maybeCreateAndPush(
        {
          companyId,
          alertType: "overtime",
          employeeId,
          employeeName,
          siteId: null,
          siteName: null,
          message: "Over weekly hour limit",
          eventId: null,
          dateKey: weekKey,
        },
        admin.firestore.Timestamp.now()
      );
    }
  }
}

// Runs the launch alert set that can't be determined from a single clock
// event (breakTooLong, maxHours, overtime, missedClockOut all depend on
// elapsed time or headcount) - lateClockIn/earlyClockOut are handled
// inline by the two functions above instead. Kill switch is checked once,
// globally, before touching any company. Each company is fully isolated:
// a bad company doc or a failed query logs and moves on, never aborts the
// rest of the sweep.
export const checkPeriodicAlerts = onSchedule("every 15 minutes", async () => {
  if (!ALERTS_FEED_ENABLED.value()) return;

  const companiesSnap = await db.collection("companies").get();
  for (const companyDoc of companiesSnap.docs) {
    try {
      await sweepCompany(companyDoc);
    } catch (err) {
      console.warn("Alert sweep failed for company", { companyId: companyDoc.id, error: String(err) });
    }
  }
});
