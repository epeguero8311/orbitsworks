// Employee App Phase 5 - the rules behind the offline shift comment queue,
// with no React Native, Expo or Firebase imports so
// test/commentQueueLogic.test.js can run them under `node --test` (same
// pattern as punchQueueLogic.js).
//
// A comment is saved on the phone first (comment_queue in
// employee_punches.db, lib/commentQueue.js) and sent by the same sync run
// as punches, right after them (lib/commentQueueSync.js). It is a direct
// Firestore create of companies/{companyId}/shiftNotes/{requestId}, checked
// by firestore.rules (isValidEmployeeShiftNoteCreate):
//   - sent only once its clock-in is on the server
//   - a resend first checks if the comment is already there (no duplicates)
//   - a comment whose clock-in failed for good, or that the rules refuse,
//     ends "Not synced" - it never stops punches or other comments
//   - a comment refused because of its time (fast phone clock) is sent
//     once more without the time (runCommentSend)

const { dayKey, toMs } = require("./employeeHome");
const { SYNCED_KEEP_MS, syncWindowStartKey } = require("./punchQueueLogic");
const { TAG_LABELS, TAG_TONES } = require("./historyDays");
const { validateShiftComment } = require("./validators/shiftComment");

const COMMENT_SOURCE = "employeeApp";
const COMMENT_NOT_SYNCED_MESSAGE = "Not synced, tell your admin.";

// status: "waiting" | "syncing" | "synced" | "failed" (failed = Not synced)

function mine(items, companyId, employeeId) {
  return items.filter((i) => i.companyId === companyId && i.employeeId === employeeId);
}

// What the comment's clock-in allows right now:
//   "send" - the clock-in is on the server: its punch synced, or it isn't
//            on the phone at all (made online and already cleaned up)
//   "wait" - the clock-in is still on the phone: waiting or syncing
//   "fail" - the clock-in failed (for good - there is no Redo; it can only
//            be removed), so the comment can never sync
function commentGate(comment, punches) {
  const clockIn = punches.find((p) => p.requestId === comment.clockEventId);
  if (!clockIn || clockIn.status === "synced") return "send";
  if (clockIn.status === "failed") return "fail";
  return "wait";
}

// This employee's waiting comments that can be handled now, oldest first:
// [{ comment, gate: "send" | "fail" }]. Comments still waiting on their
// clock-in are left for a later run.
function commentsToSend(comments, punches, companyId, employeeId) {
  return mine(comments, companyId, employeeId)
    .filter((i) => i.status === "waiting")
    .sort((a, b) => (a.madeAtMs || 0) - (b.madeAtMs || 0) || a.createdAt - b.createdAt)
    .map((comment) => ({ comment, gate: commentGate(comment, punches) }))
    .filter((x) => x.gate !== "wait");
}

// Firestore error codes the rules (or the data) answer with: the comment
// can't be written as it is. Everything else (signal, timeout, server
// hiccups, a sign-in token refresh) is tried again later.
const REFUSED_CODES = ["permission-denied", "invalid-argument", "failed-precondition", "not-found", "already-exists"];

//   "refused" - check if the comment is already there; if not, Not synced
//   "retry"   - back to Waiting, stop this run
function commentErrorKind(err) {
  const raw = err && typeof err.code === "string" ? err.code : "";
  const code = raw.replace(/^firestore\//, "");
  return REFUSED_CODES.includes(code) ? "refused" : "retry";
}

// The comment time sent with the comment. The rule wants it at or after
// the EARLIEST of the clock-in's timestamp, adjustedTimestamp and
// queuedAtMs. A phone clock that runs behind the server could put it
// before that, so it is raised to the earliest one. Whole millis only.
// undefined = no time (the field is left out).
function clampMadeAtMs(madeAtMs, clockIn) {
  if (!Number.isFinite(madeAtMs)) return undefined;
  const ci = clockIn || {};
  const floors = [toMs(ci.timestamp), toMs(ci.adjustedTimestamp), ci.queuedAtMs].filter((v) => Number.isFinite(v));
  const own = Math.ceil(madeAtMs);
  if (floors.length === 0) return own;
  return Math.max(own, Math.ceil(Math.min(...floors)));
}

// The shiftNotes doc for a saved comment, without timestamp (the sender
// adds serverTimestamp()). clockIn = the clock-in event as the server has
// it; the comment takes its site from there. Throws if the saved note is
// no longer valid.
function commentDoc(comment, { uid, clockIn }) {
  const checked = validateShiftComment({ note: comment.note, clockEventId: comment.clockEventId });
  if (!checked.ok) throw new Error(checked.error);
  const ci = clockIn || {};
  const doc = {
    note: checked.value.note,
    siteId: typeof ci.siteId === "string" && ci.siteId ? ci.siteId : null,
    siteName: typeof ci.siteName === "string" ? ci.siteName : "",
    createdByUid: uid,
    createdByName: typeof comment.createdByName === "string" ? comment.createdByName : "",
    employeeId: comment.employeeId,
    clockEventId: checked.value.clockEventId,
    source: COMMENT_SOURCE,
  };
  const madeAtMs = clampMadeAtMs(comment.madeAtMs, clockIn);
  if (madeAtMs !== undefined) doc.madeAtMs = madeAtMs;
  return doc;
}

// The send steps for one comment, with the server calls passed in (so the
// whole flow runs under `node --test`; lib/commentQueueSync.js passes the
// real Firestore calls). io:
//   uid            - the signed-in login (createdByUid)
//   exists()       - is the comment's doc already on the server?
//   readClockIn()  - the clock-in as the server has it, or null
//   create(fields) - create the comment's doc (always the same doc id)
// Returns { result: "synced", timeDropped } | { result: "failed", reason }
// | { result: "waiting" } (signal problem - try again later).
//
// Fast phone clock: the rule refuses a comment time more than 2 min ahead
// of the server. So when a comment WITH a time is refused (and isn't
// already there), it is sent ONCE more without the time - same doc id. If
// that is refused too, it is Not synced for good (e.g. not the employee's
// shift). "Already there?" is checked before the retry and before Not
// synced, so a lost reply never makes a duplicate or a false Not synced.
async function runCommentSend(comment, io) {
  try {
    // A resend: an earlier try may have landed with its reply lost.
    if (comment.attempts > 0 && (await io.exists())) return { result: "synced", timeDropped: false };
    const clockIn = await io.readClockIn();
    if (!clockIn) return { result: "failed", reason: "clockInMissing" };
    let fields;
    try {
      fields = commentDoc(comment, { uid: io.uid, clockIn });
    } catch {
      // The saved note no longer passes the checks - it never will.
      return { result: "failed", reason: "invalid" };
    }

    try {
      await io.create(fields);
      return { result: "synced", timeDropped: false };
    } catch (err) {
      if (commentErrorKind(err) !== "refused") return { result: "waiting" };
    }
    // Refused. A create on an id that is already there counts as an
    // update, which the rules never allow - so check first.
    if (await io.exists()) return { result: "synced", timeDropped: false };
    if (!("madeAtMs" in fields)) return { result: "failed", reason: "refused" };

    // The one retry, without the comment time.
    const withoutTime = { ...fields };
    delete withoutTime.madeAtMs;
    try {
      await io.create(withoutTime);
      return { result: "synced", timeDropped: true };
    } catch (err) {
      if (commentErrorKind(err) !== "refused") return { result: "waiting" };
    }
    if (await io.exists()) return { result: "synced", timeDropped: true };
    return { result: "failed", reason: "refused" };
  } catch {
    // exists() / readClockIn() couldn't reach the server.
    return { result: "waiting" };
  }
}

// The checked fields of a new comment (the Comments screen's input).
// madeAtMs defaults to now. Throws with the shared validator's message.
function newCommentFields(input, nowMs) {
  const raw = input || {};
  const madeAtMs = raw.madeAtMs === undefined ? Math.round(nowMs) : raw.madeAtMs;
  const checked = validateShiftComment({ note: raw.note, clockEventId: raw.clockEventId, madeAtMs });
  if (!checked.ok) throw new Error(checked.error);
  return checked.value;
}

// Synced comments to drop from the phone (any employee): 4 days after
// syncing, same as punches. Waiting and Not synced comments stay.
function commentsToDrop(comments, nowMs) {
  return comments.filter((i) => i.status === "synced" && nowMs - (i.syncedAt || 0) >= SYNCED_KEEP_MS).map((i) => i.requestId);
}

// ---- Phase 5 Layer 7b: what the comment screens show ----

// A comment's sync pill, same words and colors as History's tags.
function commentTag(status) {
  if (status === "waiting" || status === "syncing") return { label: TAG_LABELS.willSync, tone: TAG_TONES.willSync };
  if (status === "failed") return { label: TAG_LABELS.notSynced, tone: TAG_TONES.notSynced };
  return null;
}

// The Comments screen list for one shift: the comments on the server
// (serverNotes = [{ id, note, madeAtMs?, timestampMs }]) plus this
// employee's comments still on the phone for the same clock-in, each once
// (the phone's id IS the server doc id), newest first by when it was
// typed. A server comment still saving (no time yet) shows on top.
//   -> [{ id, note, ms, tag }]
function shiftCommentRows(serverNotes, queued, clockEventId, companyId, employeeId) {
  if (!clockEventId) return [];
  const rows = new Map();
  for (const n of serverNotes || []) {
    const ms = typeof n.madeAtMs === "number" ? n.madeAtMs : typeof n.timestampMs === "number" ? n.timestampMs : null;
    rows.set(n.id, { id: n.id, note: n.note, ms, tag: null });
  }
  for (const i of mine(queued || [], companyId, employeeId)) {
    if (i.clockEventId !== clockEventId || rows.has(i.requestId)) continue;
    rows.set(i.requestId, { id: i.requestId, note: i.note, ms: i.madeAtMs, tag: commentTag(i.status) });
  }
  const top = (r) => (r.ms === null ? Infinity : r.ms);
  return [...rows.values()].sort((a, b) => top(b) - top(a));
}

// Sync tab: this employee's comments - every unsynced one, plus Synced ones
// typed today or in the 2 days before (company time), newest first. Same
// window as visibleItems for punches.
function visibleComments(items, companyId, employeeId, nowMs, timeZone) {
  const startKey = syncWindowStartKey(nowMs, timeZone);
  return mine(items, companyId, employeeId)
    .filter((i) => i.status !== "synced" || dayKey(i.madeAtMs, timeZone) >= startKey)
    .sort((a, b) => b.madeAtMs - a.madeAtMs || b.createdAt - a.createdAt);
}

const PREVIEW_CHARS = 40;

// '"Gate was locked..."' - the start of a note on one line.
function notePreview(note) {
  const text = String(note || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > PREVIEW_CHARS ? `"${text.slice(0, PREVIEW_CHARS)}..."` : `"${text}"`;
}

// The Sync tab list: punch rows (visibleItems) and comment rows
// (visibleComments) together, newest first. A comment row's item has
// action "comment" (ACTION_LABELS) and its note preview as the detail.
//   -> [{ key, kind: "punch" | "comment", timeMs, detail, item }]
function syncTabRows(punchRows, commentRows) {
  const rows = [
    ...(punchRows || []).map((p) => ({ key: `punch-${p.requestId}`, kind: "punch", timeMs: p.queuedAtMs, detail: null, item: p })),
    ...(commentRows || []).map((k) => ({
      key: `comment-${k.requestId}`,
      kind: "comment",
      timeMs: k.madeAtMs,
      detail: notePreview(k.note),
      item: { ...k, action: "comment" },
    })),
  ];
  return rows.sort((a, b) => b.timeMs - a.timeMs);
}

module.exports = {
  commentTag,
  shiftCommentRows,
  visibleComments,
  notePreview,
  syncTabRows,
  COMMENT_SOURCE,
  COMMENT_NOT_SYNCED_MESSAGE,
  commentGate,
  commentsToSend,
  commentErrorKind,
  clampMadeAtMs,
  commentDoc,
  runCommentSend,
  newCommentFields,
  commentsToDrop,
};
