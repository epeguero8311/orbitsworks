import { deriveStatus } from "./clockStatus";
import { openShiftSiteId } from "./activeSiteFilter";

// Pure status rules for useTodayShift (no Firestore, no React) so they can
// be checked against real data off the phone.
//
// The home screen used to load every clock event the company ever had and
// take each employee's newest one. It now loads only events since the start
// of yesterday (the "window") plus, for each employee with nothing in the
// window, their single newest event. Same answer: any event newer than an
// employee's newest window event is also in the window, so the window's
// newest IS their all-time newest; with nothing in the window, the
// one-event query is their all-time newest.

export const OPEN_EVENT_TYPES = new Set(["in", "breakStart", "breakEnd"]);

// Device local time, same as "today" always was here. Built from the date
// parts (not "now minus 24 h"), so it is local midnight on both sides of a
// daylight-saving change. Only a lower bound for the window - the status is
// right for any window start, because anyone with nothing in the window
// gets their own newest-event query.
export function startOfToday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function startOfYesterday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
}

export function eventTime(evt) {
  return evt?.timestamp?.toDate ? evt.timestamp.toDate() : null;
}

// Newest event per employee, optionally only from `from` on. Events are in
// query (document id) order and a tie keeps the first one, exactly as before.
export function latestByEmployee(events, from = null) {
  const latest = {};
  for (const evt of events) {
    const ts = eventTime(evt);
    if (!ts) continue;
    if (from && ts < from) continue;
    const existing = latest[evt.employeeId];
    if (!existing || ts > existing.ts) latest[evt.employeeId] = { type: evt.type, ts };
  }
  return latest;
}

// An inactive employee is only shown while their session is still open
// (so they can be clocked OUT). Candidates: the server's last event for them
// left them open, or they have an event in the window.
function isInactiveCandidate(emp, windowLatest) {
  return OPEN_EVENT_TYPES.has(emp.lastEventType) || !!windowLatest[emp.id];
}

// Employee ids that need their own newest-event query: anyone shown (or
// possibly shown) who has no event in the window.
export function employeesNeedingLatest(activeEmployees, inactiveEmployees, windowEvents) {
  const windowLatest = latestByEmployee(windowEvents);
  const ids = [];
  for (const emp of activeEmployees) if (!windowLatest[emp.id]) ids.push(emp.id);
  for (const emp of inactiveEmployees) {
    if (isInactiveCandidate(emp, windowLatest) && !windowLatest[emp.id]) ids.push(emp.id);
  }
  return ids;
}

// latestById: employeeId -> { type, ts } from the newest-event query, or
// null when that employee has no events at all.
export function buildShiftStatus({ activeEmployees, inactiveEmployees, windowEvents, latestById, now = new Date() }) {
  const today = startOfToday(now);
  const todayLatest = latestByEmployee(windowEvents, today);
  const windowLatest = latestByEmployee(windowEvents);
  const latestFor = (id) => todayLatest[id] || windowLatest[id] || latestById[id] || null;

  // Phase 10 (A3): shiftSiteId = the open shift's site, for the site
  // filter (lib/activeSiteFilter.js). null when not clocked in.
  const withShift = (emp, status) => {
    const row = { ...emp, status };
    return { ...row, shiftSiteId: openShiftSiteId(row, windowEvents) };
  };
  const employees = activeEmployees.map((emp) => withShift(emp, deriveStatus(latestFor(emp.id)?.type)));
  for (const emp of inactiveEmployees) {
    if (!isInactiveCandidate(emp, windowLatest)) continue;
    const latest = latestFor(emp.id);
    if (latest && latest.type !== "out") employees.push(withShift(emp, deriveStatus(latest.type)));
  }

  const todayIns = [];
  for (const evt of windowEvents) {
    const ts = eventTime(evt);
    if (ts && ts >= today && evt.type === "in") todayIns.push({ employeeId: evt.employeeId, timestamp: ts });
  }
  return { employees, todayIns };
}
