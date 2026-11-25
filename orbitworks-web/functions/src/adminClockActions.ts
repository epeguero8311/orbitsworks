import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { z } from "zod";
import { db } from "./shared";
import { loadAdminCaller, requirePermission, requireShiftSite, requireSite } from "./adminAccess";

// Admin Permissions (Task 4, D18): the website's admin clock actions - the
// Time page's manual Clock in / out / break, and the Overview alert buttons
// (Clock out, End break, Set clock-out time) - go through this ONE server
// call for every admin, so "Approve hours" + the shift's site are checked
// on the server. The events written are the same shape the browser used to
// write directly (source adminManual / autoBreakEnd), so onClockEventCreated
// and everything downstream treat them exactly as before.

const FUTURE_SLACK_MS = 2 * 60 * 1000;

export const adminClockActionSchema = z.object({
  employeeId: z.string().trim().min(1).max(200),
  // in / out / breakStart / breakEnd = now; outAt = clock-out at atMs.
  action: z.enum(["in", "out", "breakStart", "breakEnd", "outAt"]),
  siteId: z.string().trim().min(1).max(200).nullable().optional(),
  note: z.string().trim().max(500).optional(),
  atMs: z.number().int().positive().optional(),
  // "in" over a stale open session from a prior day: close it first at this
  // time (the website computes the day's business close, as before).
  closeStaleAtMs: z.number().int().positive().optional(),
});

type EventDoc = {
  type?: string;
  siteId?: string | null;
  siteName?: string;
  timestamp?: admin.firestore.Timestamp;
  adjustedTimestamp?: admin.firestore.Timestamp;
};

export const adminClockAction = onCall(async (request) => {
  const caller = await loadAdminCaller(request);
  requirePermission(caller, "approveHours");
  const parsed = adminClockActionSchema.safeParse(request.data ?? {});
  if (!parsed.success) throw new HttpsError("invalid-argument", "Invalid clock action.");
  const { employeeId, action, siteId, note, atMs, closeStaleAtMs } = parsed.data;

  const companyRef = db.collection("companies").doc(caller.companyId);
  const empSnap = await companyRef.collection("employees").doc(employeeId).get();
  if (!empSnap.exists) throw new HttpsError("not-found", "Employee not found.");
  const emp = empSnap.data() as { name?: string; subcontractorId?: string | null; subcontractorName?: string | null };

  const events = companyRef.collection("clockEvents");
  const latestSnap = await events.where("employeeId", "==", employeeId).orderBy("timestamp", "desc").limit(1).get();
  const latest = latestSnap.empty ? null : (latestSnap.docs[0].data() as EventDoc);
  const status = !latest ? "out" : latest.type === "out" ? "out" : latest.type === "breakStart" ? "break" : "in";
  // The open session's clock-in (rule 1: actions on a shift go by its site).
  const openInSnap =
    status === "out"
      ? null
      : await events
          .where("employeeId", "==", employeeId)
          .where("type", "==", "in")
          .orderBy("timestamp", "desc")
          .limit(1)
          .get();
  const openIn = openInSnap && !openInSnap.empty ? openInSnap.docs[0] : null;

  const base = {
    employeeId,
    employeeName: emp.name ?? "",
    subcontractorId: emp.subcontractorId ?? null,
    subcontractorName: emp.subcontractorName ?? null,
    createdByUid: caller.uid,
    authorizedById: caller.uid,
    authorizedByName: caller.name,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const now = admin.firestore.FieldValue.serverTimestamp();
  const writes: Record<string, unknown>[] = [];

  if (action === "in") {
    let site: { id: string | null; name: string } = { id: null, name: "Not specified" };
    if (siteId) {
      const s = await companyRef.collection("jobSites").doc(siteId).get();
      if (!s.exists) throw new HttpsError("not-found", "Job site not found.");
      site = { id: siteId, name: (s.data()?.name as string | undefined) ?? "Not specified" };
    }
    requireSite(caller, site.id);
    if (status !== "out") {
      if (!closeStaleAtMs || !openIn) {
        throw new HttpsError("failed-precondition", "This employee is already clocked in.");
      }
      await requireShiftSite(caller, openIn.id);
      const inMs = ((openIn.data() as EventDoc).adjustedTimestamp ?? (openIn.data() as EventDoc).timestamp)?.toMillis() ?? 0;
      if (closeStaleAtMs <= inMs || closeStaleAtMs > Date.now()) {
        throw new HttpsError("invalid-argument", "Invalid time to close the old session.");
      }
      const staleSite = openIn.data() as EventDoc;
      const staleDay = new Date(inMs).toISOString().slice(0, 10);
      writes.push({
        ...base,
        siteId: staleSite.siteId ?? null,
        siteName: staleSite.siteName ?? "Not specified",
        type: "out",
        source: "adminManual",
        note: `Auto-closed stale session from ${staleDay} before clocking in today`,
        timestamp: admin.firestore.Timestamp.fromMillis(closeStaleAtMs),
      });
    }
    writes.push({ ...base, siteId: site.id, siteName: site.name, type: "in", source: "adminManual", note: note ?? "", timestamp: now });
  } else {
    if (!openIn || status === "out") throw new HttpsError("failed-precondition", "This employee isn't clocked in.");
    await requireShiftSite(caller, openIn.id);
    const sessionSite = openIn.data() as EventDoc;
    const site = { siteId: sessionSite.siteId ?? null, siteName: sessionSite.siteName ?? "Not specified" };
    if (action === "breakStart") {
      if (status !== "in") throw new HttpsError("failed-precondition", "This employee is already on break.");
      writes.push({ ...base, ...site, type: "breakStart", source: "adminManual", note: note ?? "", timestamp: now });
    } else if (action === "breakEnd") {
      if (status !== "break") throw new HttpsError("failed-precondition", "This employee isn't on break.");
      writes.push({ ...base, ...site, type: "breakEnd", source: "adminManual", note: note ?? "", timestamp: now });
    } else {
      let at: admin.firestore.Timestamp | admin.firestore.FieldValue = now;
      if (action === "outAt") {
        const inMs = (sessionSite.adjustedTimestamp ?? sessionSite.timestamp)?.toMillis() ?? 0;
        if (!atMs || atMs <= inMs || atMs > Date.now() + FUTURE_SLACK_MS) {
          throw new HttpsError("invalid-argument", "Pick a clock-out time after the clock-in and not in the future.");
        }
        at = admin.firestore.Timestamp.fromMillis(atMs);
      }
      if (action === "out" && status === "break") {
        writes.push({ ...base, ...site, type: "breakEnd", source: "autoBreakEnd", timestamp: now });
      }
      writes.push({ ...base, ...site, type: "out", source: "adminManual", note: note ?? "", timestamp: at });
    }
  }

  // Sequential (not a batch) so each event gets its own onClockEventCreated
  // run in order, same as the browser's addDoc calls before.
  for (const w of writes) await events.add(w);
  return { success: true };
});
