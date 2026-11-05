// Supervisor app Phase 10 (A3, D6 a) - the site filter pill on the Active
// card, the Breaks list and the clock-out side of the Override list: who is
// clocked in AT a site right now = the site of their open shift's clock-in,
// not the sites they are assigned to. The clock-in side of the Override
// list (people clocked out) still uses assigned sites (assignedToSite).
// "No Site" = clocked in with no site on the shift. No React Native or
// Firebase imports, so test/activeSiteFilter.test.js runs it under
// `node --test`.

const { toMs } = require("./employeeHome");

const NO_SITE_ID = "none";

function isOpen(employee) {
  return !!employee && (employee.status === "in" || employee.status === "break");
}

function siteIdOrNull(value) {
  return typeof value === "string" && value !== "" ? value : null;
}

// The open shift's site for one employee. windowEvents = the clock events
// since the start of yesterday (useTodayShift). The newest clock-in in the
// window counts when no clock-out came after it; otherwise (the shift began
// before the window, or nothing loaded) the employee doc's lastEventSiteId,
// which the server sets from clock-ins and clock-outs only, never breaks.
// Not clocked in = null.
function openShiftSiteId(employee, windowEvents) {
  if (!isOpen(employee)) return null;
  let lastIn = null;
  let lastOut = null;
  for (const evt of windowEvents || []) {
    if (!evt || evt.employeeId !== employee.id) continue;
    const ms = toMs(evt.timestamp);
    if (ms == null) continue;
    if (evt.type === "in" && (!lastIn || ms > lastIn.ms)) lastIn = { ms, siteId: siteIdOrNull(evt.siteId) };
    if (evt.type === "out" && (!lastOut || ms > lastOut.ms)) lastOut = { ms };
  }
  if (lastIn && (!lastOut || lastIn.ms > lastOut.ms)) return lastIn.siteId;
  return siteIdOrNull(employee.lastEventSiteId);
}

// A clock-in saved on this phone and not synced yet wins over the server's
// answer (useLocalStatusOverlay): queued = { status, siteId } or undefined.
function withQueuedShift(employee, queued) {
  if (!queued) return employee;
  const status = queued.status;
  const open = status === "in" || status === "break";
  const shiftSiteId = open ? (queued.inSiteId !== undefined ? siteIdOrNull(queued.inSiteId) : employee.shiftSiteId ?? null) : null;
  return { ...employee, status, shiftSiteId };
}

// Clocked in (or on break) at the picked site. No pick = everyone clocked in.
function activeAtSite(employees, selectedSite) {
  const open = (employees || []).filter(isOpen);
  if (!selectedSite) return open;
  if (selectedSite.id === NO_SITE_ID) return open.filter((e) => !siteIdOrNull(e.shiftSiteId));
  return open.filter((e) => e.shiftSiteId === selectedSite.id);
}

// Assigned to the picked site ("No Site" = no assigned sites). Used where the
// person is not clocked in yet (the Override clock-in list).
function assignedToSite(employees, selectedSite) {
  const list = employees || [];
  if (!selectedSite) return list;
  if (selectedSite.id === NO_SITE_ID) return list.filter((e) => !Array.isArray(e.assignedSiteIds) || e.assignedSiteIds.length === 0);
  return list.filter((e) => Array.isArray(e.assignedSiteIds) && e.assignedSiteIds.includes(selectedSite.id));
}

module.exports = { NO_SITE_ID, openShiftSiteId, withQueuedShift, activeAtSite, assignedToSite };
