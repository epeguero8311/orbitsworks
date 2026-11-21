// Logout fix (2026-11-21): who may send a supervisor-app queue row, and
// the "N punches haven't sent yet" text on both apps' Log out.
//
// Supervisor queues (event_queue, employee_queue, employee_update_queue in
// orbitworks.db) keep the login (createdByUid) and company (companyId)
// that saved each row. A drain only sends the signed-in login's own rows
// for its own company; anything else stays on the phone untouched until
// that login signs in here again - never sent under a different login or
// company, never counted as a failed try, never deleted.
//
// Rows saved by an older build have no companyId: they are the creator's
// (one login belongs to one company). employee_update_queue rows from an
// older build have no createdByUid either: the first login to drain after
// the update claims them (claimLegacyUpdateRows) - before this fix any
// login sent them.
//
// Pure: no SQLite, no Firebase, so test/queueOwnerLogic.test.js runs it
// in node.

// The signed-in login's owner key, or null (signed out / no company).
function ownerOf(uid, companyId) {
  if (typeof uid !== "string" || !uid || typeof companyId !== "string" || !companyId) return null;
  return { uid, companyId };
}

function isOwnRow(row, owner) {
  if (!row || !owner) return false;
  if (row.createdByUid !== owner.uid) return false;
  return row.companyId == null || row.companyId === owner.companyId;
}

// SQL for the same rule, with ownParams(owner) as its two values.
const OWN_ROW_SQL = "createdByUid = ? AND (companyId IS NULL OR companyId = ?)";

function ownParams(owner) {
  return [owner.uid, owner.companyId];
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

// counts: { punches, comments, siteExits, employees } (missing = 0).
// "2 punches and 1 comment haven't sent yet", or null when nothing waits.
function unsentTitle(counts) {
  const c = counts || {};
  const n = (v) => (typeof v === "number" && v > 0 ? v : 0);
  const parts = [];
  if (n(c.punches)) parts.push(plural(n(c.punches), "punch", "punches"));
  if (n(c.comments)) parts.push(plural(n(c.comments), "comment", "comments"));
  if (n(c.siteExits)) parts.push(plural(n(c.siteExits), "job site record", "job site records"));
  if (n(c.employees)) parts.push(plural(n(c.employees), "employee change", "employee changes"));
  if (!parts.length) return null;
  const total = n(c.punches) + n(c.comments) + n(c.siteExits) + n(c.employees);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return `${list} ${total === 1 ? "hasn't" : "haven't"} sent yet`;
}

// The line under the title. Employee App punches older than 24 h can't
// be recorded (the server's queued-punch window, QUEUED_MAX_AGE_MS).
function unsentMessage(app) {
  if (app === "employee") {
    return "Nothing is deleted: they stay on this phone and send when you sign back in on it. A punch can only be recorded within 24 hours, so sign back in before then.";
  }
  return "Nothing is deleted: they stay on this phone and send only when you sign back in on it with this login.";
}

// After "Send now" when some are still left.
function stillUnsentNote(left) {
  if (!(left > 0)) return null;
  return `${left === 1 ? "1 still hasn't" : `${left} still haven't`} sent. Check your signal and try again, or log out anyway.`;
}

module.exports = {
  ownerOf,
  isOwnRow,
  OWN_ROW_SQL,
  ownParams,
  unsentTitle,
  unsentMessage,
  stillUnsentNote,
};
