// Employee App Home - all the logic behind the Home screen and the clock
// flow, with no React Native or Firebase imports so test/employeeHome.test.js
// can run it under `node --test` (same pattern as joinSignIn.js).
//
// Every state here is worked out from the employee's own clock events (live
// from Firestore), never from memory, so killing and reopening the app
// mid-shift or mid-break shows the same thing.

const NO_SITE_NAME = "Not specified";
const NO_SIGNAL = "No signal. Check your connection and try again.";
const GENERIC_ERROR = "Something went wrong. Try again.";
const INACTIVE_MESSAGE = "Your account is inactive, speak to your admin";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// ---- time ----

// Firestore Timestamp, {seconds, nanoseconds}, Date or millis -> millis.
function toMs(value) {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
  return null;
}

// An admin correction (adjustedTimestamp) wins, same as the website.
function effectiveMs(event) {
  return toMs(event.adjustedTimestamp) ?? toMs(event.timestamp);
}

function sortEvents(events) {
  return events
    .filter((e) => e && effectiveMs(e) != null)
    .slice()
    .sort((a, b) => effectiveMs(a) - effectiveMs(b));
}

// Calendar parts of an instant in a timezone.
function zonedParts(ms, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(new Date(ms));
  const get = (type) => parts.find((p) => p.type === type).value;
  return { y: Number(get("year")), m: Number(get("month")), d: Number(get("day")), weekday: get("weekday") };
}

function pad(n) {
  return String(n).padStart(2, "0");
}

// "YYYY-MM-DD" for the day this instant falls on in timeZone.
function dayKey(ms, timeZone) {
  const { y, m, d } = zonedParts(ms, timeZone);
  return `${y}-${pad(m)}-${pad(d)}`;
}

const WEEKDAY_INDEX = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

// "YYYY-MM-DD" of the Monday starting this instant's week in timeZone
// (website: startOfWeek in lib/reportUtils.ts - weeks start Monday).
function weekKey(ms, timeZone) {
  const { y, m, d, weekday } = zonedParts(ms, timeZone);
  const monday = new Date(Date.UTC(y, m - 1, d) - WEEKDAY_INDEX[weekday] * DAY_MS);
  return `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
}

// A safe lower bound for "this week's events" queries: 1 day before the
// Monday key at UTC midnight, so every timezone's Monday 00:00 is covered.
function weekQueryStartMs(nowMs, timeZone) {
  const [y, m, d] = weekKey(nowMs, timeZone).split("-").map(Number);
  return Date.UTC(y, m - 1, d) - DAY_MS;
}

// ---- worked time (website: accumulateWorkedMs in lib/clockStatus.ts) ----

// Worked ms across sorted events: in/breakEnd start a segment,
// breakStart/out close it, an open segment runs to nowMs. Breaks pause it.
function accumulateWorkedMs(sortedEvents, nowMs) {
  let total = 0;
  let start = null;
  for (const event of sortedEvents) {
    const ts = effectiveMs(event);
    if (event.type === "in" || event.type === "breakEnd") {
      start = ts;
    } else if ((event.type === "breakStart" || event.type === "out") && start != null) {
      total += ts - start;
      start = null;
    }
  }
  if (start != null) total += Math.max(0, nowMs - start);
  return total;
}

// ---- home state ----

function siteLabel(siteName) {
  if (!siteName || siteName === NO_SITE_NAME) return "";
  return siteName;
}

// status: "out" (Clock In), "in" (Start Break + Clock Out), "break" (End
// Break), "done" (clocked out after a shift today: Clock Back In).
function deriveHomeState(events, nowMs, timeZone) {
  const sorted = sortEvents(events);
  const latest = sorted[sorted.length - 1];
  const empty = { status: "out", shiftInMs: null, breakStartMs: null, workedMs: 0, shiftSiteName: "" };
  if (!latest) return empty;

  if (latest.type === "out") {
    const outToday = dayKey(effectiveMs(latest), timeZone) === dayKey(nowMs, timeZone);
    return { ...empty, status: outToday ? "done" : "out" };
  }

  // The open shift starts at the last "in" after the last "out".
  let startIndex = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].type === "out") {
      startIndex = i + 1;
      break;
    }
  }
  const shift = sorted.slice(startIndex);
  const shiftIn = shift.find((e) => e.type === "in") || null;
  const onBreak = latest.type === "breakStart";
  return {
    status: onBreak ? "break" : "in",
    shiftInMs: shiftIn ? effectiveMs(shiftIn) : null,
    breakStartMs: onBreak ? effectiveMs(latest) : null,
    workedMs: accumulateWorkedMs(shift, nowMs),
    shiftSiteName: shiftIn ? siteLabel(shiftIn.siteName) : "",
  };
}

const BUTTONS = {
  out: ["clockIn"],
  in: ["startBreak", "clockOut"],
  break: ["endBreak"],
  done: ["clockBackIn"],
};

// Inactive: no clock or break buttons at all.
function buttonsFor(status, active) {
  if (active !== true) return [];
  return BUTTONS[status] || [];
}

// Callable action for each button.
const BUTTON_ACTION = {
  clockIn: "in",
  clockBackIn: "in",
  clockOut: "out",
  startBreak: "breakStart",
  endBreak: "breakEnd",
};

// ---- hours (website: useEmployeeTimesheet.ts + lib/autoBreak.ts) ----

// Copied from the website's lib/autoBreak.ts - keep in sync by hand.
function applyAutoBreak(grossMs, realBreakMs, hasClockOut, automaticBreakMinutes, minimumShiftHours) {
  if (!hasClockOut || automaticBreakMinutes <= 0) {
    return { breakMs: realBreakMs, netMs: Math.max(0, grossMs - realBreakMs) };
  }
  if (grossMs / HOUR_MS < minimumShiftHours) {
    return { breakMs: realBreakMs, netMs: Math.max(0, grossMs - realBreakMs) };
  }
  const breakMs = Math.min(realBreakMs + automaticBreakMinutes * 60 * 1000, grossMs);
  return { breakMs, netMs: grossMs - breakMs };
}

// Today's and this week's hours from CLOSED shifts only, each counted on its
// clock-in day: shift length minus real breaks minus the auto break.
function computeHours(events, nowMs, timeZone, breaks) {
  const autoMin = Number(breaks && breaks.automaticBreakMinutes) || 0;
  const minShift = Number(breaks && breaks.minimumShiftHours) || 0;
  const today = dayKey(nowMs, timeZone);
  const week = weekKey(nowMs, timeZone);
  let todayMs = 0;
  let weekMs = 0;

  let pendingIn = null;
  let openBreakStart = null;
  let breakMs = 0;
  for (const event of sortEvents(events)) {
    const ts = effectiveMs(event);
    if (event.type === "in") {
      pendingIn = ts;
      openBreakStart = null;
      breakMs = 0;
    } else if (event.type === "breakStart") {
      if (pendingIn != null && openBreakStart == null) openBreakStart = ts;
    } else if (event.type === "breakEnd") {
      if (openBreakStart != null) {
        if (ts - openBreakStart > 0) breakMs += ts - openBreakStart;
        openBreakStart = null;
      }
    } else if (event.type === "out" && pendingIn != null) {
      const duration = ts - pendingIn;
      if (duration > 0) {
        const { netMs } = applyAutoBreak(duration, breakMs, true, autoMin, minShift);
        if (weekKey(pendingIn, timeZone) === week) weekMs += netMs;
        if (dayKey(pendingIn, timeZone) === today) todayMs += netMs;
      }
      pendingIn = null;
      openBreakStart = null;
      breakMs = 0;
    }
  }
  return { todayMs, weekMs };
}

// ---- formatting ----

// Running timer: "H:MM:SS".
function formatTimer(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${pad(m)}:${pad(s)}`;
}

// Home timer card: "HH:MM:SS" (always two-digit hours).
function formatTimerDigits(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

// Break timer: "MM:SS" (minutes keep counting past 59).
function formatBreakDigits(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

// Header greeting by the hour in the company's timezone.
function greetingFor(ms, timeZone) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(new Date(ms))
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// Hours summary: "7h 45m".
function formatHours(ms) {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(totalMin / 60)}h ${pad(totalMin % 60)}m`;
}

function formatClockTime(ms, timeZone) {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(ms));
}

// ---- errors ----

const KNOWN_REASONS = ["invalid", "notSignedIn", "wrongAccount", "inactive", "wrongPin", "locked", "photo", "wrongState"];
const NETWORK_CODES = ["functions/unavailable", "functions/deadline-exceeded", "unavailable", "deadline-exceeded"];

// The callable's own plain message for a known reason; "No signal" for any
// connection failure (or when the phone already knows it's offline).
function clockErrorMessage(err, isConnected) {
  if (isConnected === false) return NO_SIGNAL;
  const reason = err && err.details && err.details.reason;
  if (KNOWN_REASONS.includes(reason) && err.message) return err.message;
  const code = err && typeof err.code === "string" ? err.code : "";
  const message = err && typeof err.message === "string" ? err.message : "";
  if (NETWORK_CODES.includes(code) || /network|timed? ?out|internet|offline/i.test(message)) return NO_SIGNAL;
  return GENERIC_ERROR;
}

// Where the clock flow goes after an error: back to the PIN pad (wrong PIN /
// locked), back to the camera (photo), or stay with the message (keep the
// PIN and photo for a retry - same requestId, so a lost reply can't
// double-punch).
function errorStep(err) {
  const reason = err && err.details && err.details.reason;
  if (reason === "wrongPin" || reason === "locked") return "pin";
  if (reason === "photo") return "camera";
  if (reason === "wrongState" || reason === "inactive" || reason === "wrongAccount" || reason === "invalid") return "close";
  return "retry";
}

// After the server accepts the PIN (checked before the camera opens): open
// the camera, or - when a photo is already kept because the punch itself
// came back "wrong PIN" - send it again straight away.
function stepAfterPinOk(hasPhoto) {
  return hasPhoto ? "sending" : "camera";
}

function lockSecondsLeft(err) {
  const s = err && err.details && err.details.secondsLeft;
  return typeof s === "number" && s > 0 ? s : 0;
}

function photoPathFor(companyId, employeeId, requestId) {
  return `companies/${companyId}/clockEvents/${employeeId}/${requestId}.jpg`;
}

module.exports = {
  NO_SITE_NAME,
  NO_SIGNAL,
  GENERIC_ERROR,
  INACTIVE_MESSAGE,
  BUTTON_ACTION,
  toMs,
  effectiveMs,
  dayKey,
  weekKey,
  weekQueryStartMs,
  accumulateWorkedMs,
  siteLabel,
  deriveHomeState,
  buttonsFor,
  applyAutoBreak,
  computeHours,
  formatTimer,
  formatTimerDigits,
  formatBreakDigits,
  greetingFor,
  formatHours,
  formatClockTime,
  clockErrorMessage,
  errorStep,
  lockSecondsLeft,
  photoPathFor,
  stepAfterPinOk,
};
