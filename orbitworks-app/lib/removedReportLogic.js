// RC1 follow-up - removing an unsent punch or shift comment from the Sync
// tab. No React Native imports, so test/removedReportLogic.test.js runs it
// in plain Node.
//
// A Failed punch / Not synced comment never reached the server. Removing it
// loses it for good, so:
//   1. the confirm says so plainly (removeWarning), and
//   2. a report is saved in the SAME write that deletes the row
//      (removed_report_queue) and sent to reportRemovedItem, which gives the
//      admin a punchRemoved alert. Offline -> sent on the next sync run.
//
// buildRemovedReport mirrors the server's reportRemovedItemSchema
// (functions/src/removedItemValidators.ts) - keep both in sync by hand.

const PUNCH_ACTIONS = ["in", "out", "breakStart", "breakEnd"];
const WHAT = { in: "clock-in", out: "clock-out", breakStart: "break start", breakEnd: "break end" };

function clip(text, max) {
  if (typeof text !== "string") return undefined;
  const t = text.trim();
  if (!t) return undefined;
  return t.length > max ? t.slice(0, max) : t;
}

// The report row for a removed queue item. kind: "punch" | "comment".
function buildRemovedReport(kind, item, removedAtMs) {
  const base = {
    requestId: item.requestId,
    companyId: item.companyId,
    employeeId: item.employeeId,
    kind,
    madeAtMs: Math.round(kind === "punch" ? item.queuedAtMs : item.madeAtMs),
    removedAtMs: Math.round(removedAtMs),
    failMessage: clip(item.failMessage, 300) ?? null,
  };
  if (kind === "punch") {
    return { ...base, action: PUNCH_ACTIONS.includes(item.action) ? item.action : null, clockEventId: null, note: null };
  }
  return { ...base, action: null, clockEventId: item.clockEventId || null, note: clip(item.note, 1000) ?? null };
}

// The callable's input: the row without the phone-only fields and nulls.
function toReportPayload(row) {
  const out = { requestId: row.requestId, kind: row.kind, madeAtMs: row.madeAtMs, removedAtMs: row.removedAtMs };
  for (const key of ["action", "failMessage", "clockEventId", "note"]) {
    if (row[key] !== null && row[key] !== undefined) out[key] = row[key];
  }
  return out;
}

// What a send error means for the report. Only a refused input is final
// (it would be refused forever); everything else - signal, timeout, a
// login mid role change - keeps it waiting. A report is never dropped
// because of the network: losing it would hide a lost punch from the admin.
const FINAL = ["functions/invalid-argument", "invalid-argument"];
function reportSendOutcome(err) {
  const code = err && typeof err.code === "string" ? err.code : "";
  return FINAL.includes(code) ? "refused" : "retry";
}

// Reports of this employee still to send, oldest first.
function reportsToSend(rows, companyId, employeeId) {
  return rows
    .filter((r) => r.companyId === companyId && r.employeeId === employeeId && (r.status === "waiting" || r.status === "syncing"))
    .sort((a, b) => a.createdAt - b.createdAt);
}

// The Remove confirm. whenLabel: "Today, 9:05 AM" (formatWhen).
function removeWarning(kind, action, whenLabel) {
  const when = whenLabel ? ` from ${whenLabel}` : "";
  if (kind === "comment") {
    return {
      title: "Delete this comment for good?",
      message:
        `This comment${when} was never saved. If you remove it, it is gone for good - it can't be sent or brought back.\n\n` +
        "Your admin will be told you removed it.",
      confirmLabel: "Remove for good",
      cancelLabel: "Keep it",
    };
  }
  const what = WHAT[action] || "punch";
  return {
    title: `Lose this ${what}?`,
    message:
      `This ${what}${when} was never recorded. If you remove it, it is lost for good - it can't be sent or brought back, and your hours will be missing it.\n\n` +
      "Your admin will be told you removed it, so they can fix your time.",
    confirmLabel: "Remove for good",
    cancelLabel: "Keep it",
  };
}

module.exports = { buildRemovedReport, toReportPayload, reportSendOutcome, reportsToSend, removeWarning };
