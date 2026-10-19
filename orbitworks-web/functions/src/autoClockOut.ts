import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { db, localDateKey } from "./shared";
import { AUTO_CLOCK_OUT_ENABLED } from "./flags";
import { createAlertIfNew, type AlertInput } from "./alerts";

// Settings > Automations > Auto clock-out. Available on every plan, off by
// default per company - this sweep is the only writer of source
// "autoClockOut" clock events going forward (see firestore.rules, which
// denies clients that source and any "auto-"-prefixed clockEvents doc id).
// Minimal per-event shape this file needs, carrying the denormalized
// employee/site/subcontractor fields so the written "out" event (and its
// alert) never needs an extra read to fill them in.
type MinimalEvent = {
  id: string;
  employeeId: string;
  employeeName: string;
  siteId: string | null;
  siteName: string;
  subcontractorId: string | null;
  subcontractorName: string | null;
  type: "in" | "out" | "breakStart" | "breakEnd";
  timestamp?: admin.firestore.Timestamp;
  adjustedTimestamp?: admin.firestore.Timestamp;
};

function effectiveMs(event: MinimalEvent): number | null {
  const ts = event.adjustedTimestamp ?? event.timestamp;
  return ts ? ts.toDate().getTime() : null;
}

function toMinimalEvent(doc: FirebaseFirestore.QueryDocumentSnapshot): MinimalEvent | null {
  const data = doc.data();
  if (!data || typeof data.employeeId !== "string" || typeof data.type !== "string") return null;
  const validTypes = ["in", "out", "breakStart", "breakEnd"] as const;
  if (!(validTypes as readonly string[]).includes(data.type)) return null;
  return {
    id: doc.id,
    employeeId: data.employeeId,
    employeeName: typeof data.employeeName === "string" ? data.employeeName : "",
    siteId: typeof data.siteId === "string" ? data.siteId : null,
    siteName: typeof data.siteName === "string" ? data.siteName : "",
    subcontractorId: typeof data.subcontractorId === "string" ? data.subcontractorId : null,
    subcontractorName: typeof data.subcontractorName === "string" ? data.subcontractorName : null,
    type: data.type as MinimalEvent["type"],
    timestamp: data.timestamp,
    adjustedTimestamp: data.adjustedTimestamp,
  };
}

type CapCrossing = {
  crossedAtMs: number;
  // Only ever true in the degenerate case where the cap is reached at the
  // exact instant a break begins and that break is never closed anywhere
  // else in this shift's own history - see the comment inline below.
  openBreakAtCrossing: boolean;
  openBreakEventId: string | null;
};

// Finds the exact moment accumulated worked time (breaks excluded) first
// reaches capMs within one employee's single open shift, mirroring
// accumulateWorkedMs's segment walk (lib/clockStatus.ts) but returning the
// crossing instant instead of a running total. shiftEvents must already be
// sorted ascending and start with the shift's "in" event.
function findCapCrossing(shiftEvents: MinimalEvent[], capMs: number, nowMs: number): CapCrossing | null {
  let cumulative = 0;
  let segStart: number | null = null;

  for (let i = 0; i < shiftEvents.length; i++) {
    const event = shiftEvents[i];
    const ts = effectiveMs(event);
    if (ts == null) continue;

    switch (event.type) {
      case "in":
      case "breakEnd":
        segStart = ts;
        break;
      case "breakStart":
      case "out": {
        if (segStart != null) {
          const segMs = ts - segStart;
          if (cumulative + segMs >= capMs) {
            const crossedAtMs = segStart + (capMs - cumulative);
            // Worked time freezes the instant a break starts, so
            // crossedAtMs can only ever land AT or BEFORE this breakStart's
            // own timestamp, never strictly after it - there is no way for
            // the cap to be crossed "during" an already-open break. The one
            // case worth flagging is an exact-millisecond tie where the cap
            // was reached right as this break began AND that break was
            // never closed anywhere later in this shift.
            const stillOpen =
              event.type === "breakStart" &&
              crossedAtMs === ts &&
              !shiftEvents.slice(i + 1).some((e) => e.type === "breakEnd");
            return {
              crossedAtMs,
              openBreakAtCrossing: stillOpen,
              openBreakEventId: stillOpen ? event.id : null,
            };
          }
          cumulative += segMs;
          segStart = null;
        }
        break;
      }
    }
  }

  // Trailing open segment - still clocked in (or back from a break) with
  // no closing event yet, projected forward to now.
  if (segStart != null) {
    const segMs = nowMs - segStart;
    if (cumulative + segMs >= capMs) {
      return { crossedAtMs: segStart + (capMs - cumulative), openBreakAtCrossing: false, openBreakEventId: null };
    }
  }

  return null;
}

async function maybeAutoClockOutEmployee(
  companyId: string,
  eventsRef: FirebaseFirestore.CollectionReference,
  empEvents: MinimalEvent[],
  capHours: number,
  capMs: number,
  nowMs: number
): Promise<void> {
  const sorted = [...empEvents].sort((a, b) => (effectiveMs(a) ?? 0) - (effectiveMs(b) ?? 0));

  // Same shift-boundary convention as lib/clockStatus.ts's
  // getAccumulatedWorkedMs - everything after the last "out" is the
  // current open shift. A chain that doesn't start with "in" (e.g. the
  // lookback window cut off mid-shift, or a missed-clock-out anomaly left
  // a dangling "in" buried earlier) is skipped rather than guessed at.
  let shiftStartIndex = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].type === "out") {
      shiftStartIndex = i + 1;
      break;
    }
  }
  const shiftEvents = sorted.slice(shiftStartIndex);
  if (shiftEvents.length === 0 || shiftEvents[0].type !== "in") return;

  const clockInEvent = shiftEvents[0];
  const crossing = findCapCrossing(shiftEvents, capMs, nowMs);
  if (!crossing) return;

  const autoOutRef = eventsRef.doc(`auto-${clockInEvent.id}`);
  const breakEndRef = eventsRef.doc(`auto-break-${clockInEvent.id}`);
  const autoOutTimestamp = admin.firestore.Timestamp.fromMillis(crossing.crossedAtMs);

  const base = {
    employeeId: clockInEvent.employeeId,
    employeeName: clockInEvent.employeeName,
    siteId: clockInEvent.siteId,
    siteName: clockInEvent.siteName,
    subcontractorId: clockInEvent.subcontractorId,
    subcontractorName: clockInEvent.subcontractorName,
  };

  // Deterministic ids + batch.create() (fails the whole batch if either
  // doc already exists) is the idempotency guard against a retried or
  // overlapping sweep run double-writing this shift's auto clock-out.
  const batch = db.batch();
  if (crossing.openBreakAtCrossing) {
    batch.create(breakEndRef, {
      ...base,
      type: "breakEnd",
      source: "autoClockOut",
      note: "Automatically ended - the auto clock-out cap was reached",
      timestamp: autoOutTimestamp,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  batch.create(autoOutRef, {
    ...base,
    type: "out",
    source: "autoClockOut",
    note: `Automatically clocked out after reaching the ${capHours}h cap`,
    timestamp: autoOutTimestamp,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    // Snapshot of the cap in effect right now, so a later Settings change
    // can never retroactively change what this already-written event
    // "used" - also what tells lib/sessionWarnings.ts this is a NEW auto
    // clock-out, not a legacy source:"autoClockOut" event from the old,
    // removed nightly sweep.
    autoClockOutCapHours: capHours,
  });

  try {
    await batch.commit();
  } catch (err) {
    const code = (err as { code?: number | string })?.code;
    if (code !== 6 && code !== "already-exists") {
      console.warn("Auto clock-out write failed", { companyId, clockInEventId: clockInEvent.id, error: String(err) });
    }
    return;
  }

  const clockInTimestamp = clockInEvent.adjustedTimestamp ?? clockInEvent.timestamp ?? autoOutTimestamp;
  const dateKey = localDateKey(clockInTimestamp.toDate());

  const alertInput: AlertInput = {
    companyId,
    alertType: "autoClockOut",
    employeeId: clockInEvent.employeeId,
    employeeName: clockInEvent.employeeName || "An employee",
    siteId: clockInEvent.siteId,
    siteName: clockInEvent.siteName,
    message: `Auto clocked out after reaching the ${capHours}h cap`,
    eventId: clockInEvent.id,
    employeeUpdateId: null,
    dateKey,
  };
  // createAlertIfNew directly, not maybeCreateAndPush - this alert never
  // pushes, per spec (admin/owner web Overview only).
  await createAlertIfNew(alertInput, autoOutTimestamp);

  // Replaces the Missed Clock-Out alert for this shift if one already
  // exists (same deterministic id functions/src/alerts.ts's periodic sweep
  // writes) - the two must never both show for the same shift.
  await db
    .collection("companies")
    .doc(companyId)
    .collection("alerts")
    .doc(`missed-${clockInEvent.employeeId}-${dateKey}`)
    .delete()
    .catch((err) => {
      console.warn("Failed to clear missedClockOut alert after auto clock-out", {
        companyId,
        employeeId: clockInEvent.employeeId,
        error: String(err),
      });
    });
}

async function sweepCompanyAutoClockOut(companyDoc: FirebaseFirestore.QueryDocumentSnapshot): Promise<void> {
  const companyId = companyDoc.id;
  const data = companyDoc.data();
  // Belt-and-suspenders - the query below already filters on
  // autoClockOut.enabled == true, but a malformed/missing maxWorkedHours
  // must never be treated as "no cap" and silently clock everyone out
  // immediately.
  const capHours = data.autoClockOut?.enabled === true ? data.autoClockOut?.maxWorkedHours : undefined;
  if (typeof capHours !== "number" || !Number.isFinite(capHours) || capHours <= 0) return;
  const capMs = capHours * 60 * 60 * 1000;

  const nowMs = Date.now();
  // Cap is bounded to 24h by the Settings UI, but this reads the company
  // doc's raw value defensively - look back far enough to always see the
  // full shift even at that ceiling, plus slack for a day of breaks.
  const lookbackStart = admin.firestore.Timestamp.fromMillis(nowMs - 3 * 24 * 60 * 60 * 1000);
  const eventsRef = companyDoc.ref.collection("clockEvents");
  const recentSnap = await eventsRef.where("timestamp", ">=", lookbackStart).orderBy("timestamp", "desc").get();
  const events = recentSnap.docs.map(toMinimalEvent).filter((e): e is MinimalEvent => e !== null);

  const byEmployee = new Map<string, MinimalEvent[]>();
  for (const event of events) {
    const list = byEmployee.get(event.employeeId) ?? [];
    list.push(event);
    byEmployee.set(event.employeeId, list);
  }

  for (const [employeeId, empEvents] of byEmployee) {
    try {
      await maybeAutoClockOutEmployee(companyId, eventsRef, empEvents, capHours, capMs, nowMs);
    } catch (err) {
      console.warn("Auto clock-out failed for employee", { companyId, employeeId, error: String(err) });
    }
  }
}

// Runs every 5 minutes, scoped server-side to only the companies that have
// opted in (autoClockOut.enabled == true) - never reads every company just
// to check a flag. Global kill switch checked once, before the query, for
// a safe default-off rollout independent of each company's own toggle.
export const runAutoClockOut = onSchedule("every 5 minutes", async () => {
  if (!AUTO_CLOCK_OUT_ENABLED.value()) return;

  const companiesSnap = await db.collection("companies").where("autoClockOut.enabled", "==", true).get();
  for (const companyDoc of companiesSnap.docs) {
    try {
      await sweepCompanyAutoClockOut(companyDoc);
    } catch (err) {
      console.warn("Auto clock-out sweep failed for company", { companyId: companyDoc.id, error: String(err) });
    }
  }
});
