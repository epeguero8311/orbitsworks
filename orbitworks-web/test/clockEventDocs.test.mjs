// Bug 11/26 (Time Tracking empty after offline punches): offline-synced
// punches from the supervisor app (PIN, localId + clientTimestamp), the
// Employee App (requestId) and a kiosk (source kiosk) show on the Time
// Tracking day view, and one bad doc never blanks the page.
// Run via: node --test test/clockEventDocs.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { toClockEvents, eventsInDay } from "../lib/clockEventDocs.ts";

const ts = (iso) => ({ toMillis: () => Date.parse(iso), toDate: () => new Date(iso) });
const doc = (id, data) => ({ id, data: () => data });
const DAY_START = Date.parse("2026-11-26T00:00:00-06:00");
const DAY_END = Date.parse("2026-11-26T23:59:59-06:00");

// Same shapes as the real dev docs (punched in airplane mode, synced later:
// createdAt after timestamp).
const offline = [
  doc("sup-in", { type: "in", source: "pin", employeeId: "a", siteId: "s1", localId: "L1", clientTimestamp: 1, timestamp: ts("2026-11-26T09:48:00-06:00"), createdAt: ts("2026-11-26T09:52:00-06:00") }),
  doc("emp-in", { type: "in", source: "employeeApp", employeeId: "b", siteId: "s1", requestId: "R1", timestamp: ts("2026-11-26T09:48:30-06:00"), createdAt: ts("2026-11-26T09:52:01-06:00") }),
  doc("kiosk-in", { type: "in", source: "kiosk", employeeId: "c", kioskEmployeeId: "k", siteId: "s1", requestId: "R2", timestamp: ts("2026-11-26T09:49:00-06:00"), createdAt: ts("2026-11-26T09:52:02-06:00") }),
];

test("offline-synced punches from supervisor, Employee App and kiosk all show on the day", () => {
  const all = toClockEvents(offline);
  const day = eventsInDay(all, DAY_START, DAY_END);
  assert.deepEqual(day.map((e) => e.id), ["kiosk-in", "emp-in", "sup-in"], "all three, newest first");
});

test("one bad doc is skipped with a warning, the rest still show", () => {
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => warns.push(a.join(" "));
  try {
    const all = toClockEvents([
      ...offline,
      doc("bad-number", { type: "out", timestamp: Date.parse("2026-11-26T10:00:00-06:00") }),
      doc("bad-missing", { type: "out" }),
      doc("bad-adjusted", { type: "out", timestamp: ts("2026-11-26T11:00:00-06:00"), adjustedTimestamp: "11:05" }),
    ]);
    const day = eventsInDay(all, DAY_START, DAY_END);
    assert.deepEqual(day.map((e) => e.id), ["bad-adjusted", "kiosk-in", "emp-in", "sup-in"]);
    assert.equal(day[0].adjustedTimestamp, undefined, "bad adjustedTimestamp dropped, event kept");
    assert.equal(warns.length, 3);
  } finally {
    console.warn = orig;
  }
});

test("events outside the picked day stay out (pairing-only)", () => {
  const all = toClockEvents([...offline, doc("yesterday", { type: "out", timestamp: ts("2026-11-25T22:00:00-06:00") })]);
  assert.equal(eventsInDay(all, DAY_START, DAY_END).length, 3);
  assert.equal(all.length, 4);
});
