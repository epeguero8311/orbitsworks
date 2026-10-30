// Employee App Phase 4 - offline punch queue rules (lib/punchQueueLogic.js):
// error sorting, sync order, pausing, the 24 h PIN cleanup and how queued
// punches show on Home. Run: node --test test/punchQueueLogic.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const q = require("../lib/punchQueueLogic");
const h = require("../lib/employeeHome");

const C = "co1";
const E = "emp1";
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const NOW = Date.parse("2026-11-01T15:00:00Z");

let seq = 0;
function item(fields) {
  seq += 1;
  return {
    requestId: `r${seq}`,
    companyId: C,
    employeeId: E,
    action: "in",
    queuedAtMs: NOW - HOUR,
    createdAt: NOW - HOUR,
    status: "waiting",
    hasPin: false,
    syncedAt: null,
    failKind: null,
    siteName: "",
    ...fields,
  };
}
const err = (reason, code = "functions/failed-precondition", message = "x") => ({ code, message, details: reason ? { reason } : undefined });

// ---- error sorting ----

test("error sorting: wrong PIN at sync -> Redo", () => {
  assert.equal(q.failKind(err("wrongPin")), "redo");
});

test("error sorting: photo, older than 24 h, later punch already in -> Not recorded", () => {
  for (const r of ["photo", "tooOld", "superseded"]) assert.equal(q.failKind(err(r)), "notRecorded", r);
});

test("error sorting: other permanent errors -> Couldn't sync", () => {
  for (const r of ["inactive", "wrongAccount", "invalid", "wrongState", "badTime", "syncBlocked", "locked"]) {
    assert.equal(q.failKind(err(r)), "couldntSync", r);
  }
  assert.equal(q.failKind({ code: "functions/permission-denied", message: "denied" }), "couldntSync");
});

test("error sorting: signal, timeout and server hiccups stay Waiting", () => {
  assert.equal(q.failKind({ code: "timeout", message: "timed out" }), "retry");
  assert.equal(q.failKind({ code: "functions/unavailable", message: "unavailable" }), "retry");
  assert.equal(q.failKind({ code: "functions/internal", message: "internal" }), "retry");
  assert.equal(q.failKind(err("generic", "functions/internal")), "retry");
  assert.equal(q.failKind(new Error("Network request failed")), "retry");
  assert.equal(q.failKind(null), "retry");
});

test("signal errors save the online punch; real errors don't", () => {
  assert.equal(q.isSignalError({ code: "timeout", message: "timed out" }), true);
  assert.equal(q.isSignalError({ code: "functions/internal", message: "internal" }), true);
  assert.equal(q.isSignalError(new Error("Network request failed")), true);
  assert.equal(q.isSignalError(err("generic", "functions/internal")), true);
  assert.equal(q.isSignalError(err("wrongPin")), false);
  assert.equal(q.isSignalError(err("wrongState")), false);
  assert.equal(q.isSignalError(err("notSignedIn", "functions/unauthenticated")), false);
});

test("messages and the one action per Failed row", () => {
  assert.equal(q.failMessage("notRecorded"), "Not recorded, tell your admin.");
  assert.equal(q.failMessage("couldntSync"), "Couldn't sync, please speak to your supervisor.");
  assert.match(q.failMessage("redo"), /Wrong PIN/);
  assert.equal(q.rowAction(item({ status: "failed", failKind: "redo" })), "redo");
  assert.equal(q.rowAction(item({ status: "failed", failKind: "notRecorded" })), "remove");
  assert.equal(q.rowAction(item({ status: "failed", failKind: "couldntSync" })), "remove");
  assert.equal(q.rowAction(item({ status: "waiting" })), null);
  assert.equal(q.rowAction(item({ status: "synced" })), null);
});

test("Home error text knows the new server reasons", () => {
  const e = { code: "functions/failed-precondition", message: "Not recorded, tell your admin.", details: { reason: "tooOld" } };
  assert.equal(h.clockErrorMessage(e, true), "Not recorded, tell your admin.");
});

// ---- sync order ----

test("sync order: oldest punch first, by punch time not save time", () => {
  const out = item({ action: "out", queuedAtMs: NOW - 10 * MIN, createdAt: NOW - 10 * MIN });
  const brk = item({ action: "breakStart", queuedAtMs: NOW - 30 * MIN, createdAt: NOW - 5 * MIN });
  const inn = item({ action: "in", queuedAtMs: NOW - 2 * HOUR, createdAt: NOW - 2 * HOUR });
  assert.equal(q.nextToSend([out, brk, inn], C, E).requestId, inn.requestId);
  inn.status = "synced";
  assert.equal(q.nextToSend([out, brk, inn], C, E).requestId, brk.requestId);
  brk.status = "synced";
  assert.equal(q.nextToSend([out, brk, inn], C, E).requestId, out.requestId);
  out.status = "synced";
  assert.equal(q.nextToSend([out, brk, inn], C, E), null);
});

test("sync order: a punch left Syncing (app killed) is sent again first", () => {
  const a = item({ status: "syncing", queuedAtMs: NOW - 2 * HOUR });
  const b = item({ queuedAtMs: NOW - HOUR });
  assert.equal(q.nextToSend([b, a], C, E).requestId, a.requestId);
});

test("sync order: a punch that failed for good pauses everything behind it", () => {
  const a = item({ status: "failed", failKind: "redo", queuedAtMs: NOW - 2 * HOUR });
  const b = item({ queuedAtMs: NOW - HOUR });
  assert.equal(q.nextToSend([a, b], C, E), null);
  assert.equal(q.isPaused([a, b], C, E), true);
  // Removed (row deleted) -> the queue carries on.
  assert.equal(q.nextToSend([b], C, E).requestId, b.requestId);
  assert.equal(q.isPaused([b], C, E), false);
});

test("sync order: only the signed-in employee's punches are sent", () => {
  const other = item({ employeeId: "emp2", queuedAtMs: NOW - 3 * HOUR });
  const otherCo = item({ companyId: "co2", queuedAtMs: NOW - 3 * HOUR });
  const mineItem = item({ queuedAtMs: NOW - HOUR });
  assert.equal(q.nextToSend([other, otherCo, mineItem], C, E).requestId, mineItem.requestId);
  assert.equal(q.nextToSend([other, otherCo], C, E), null);
  // Another employee's failed punch never pauses this one.
  other.status = "failed";
  assert.equal(q.isPaused([other, mineItem], C, E), false);
});

test("badge counts Waiting + Syncing + Failed; new punches queue behind them", () => {
  const items = [
    item({ status: "waiting" }),
    item({ status: "syncing" }),
    item({ status: "failed", failKind: "notRecorded" }),
    item({ status: "synced", syncedAt: NOW - MIN }),
    item({ employeeId: "emp2" }),
  ];
  assert.equal(q.badgeCount(items, C, E), 3);
  assert.equal(q.hasQueueAhead(items, C, E), true);
  assert.equal(q.hasQueueAhead([item({ status: "synced", syncedAt: NOW })], C, E), false);
});

test("Sync tab: newest first, synced rows stay 24 h", () => {
  const old = item({ status: "synced", queuedAtMs: NOW - 30 * HOUR, syncedAt: NOW - 25 * HOUR });
  const recent = item({ status: "synced", queuedAtMs: NOW - 3 * HOUR, syncedAt: NOW - 2 * HOUR });
  const waiting = item({ queuedAtMs: NOW - MIN });
  const rows = q.visibleItems([old, recent, waiting], C, E, NOW);
  assert.deepEqual(rows.map((r) => r.requestId), [waiting.requestId, recent.requestId]);
  assert.deepEqual(q.syncedToDrop([old, recent, waiting], NOW), [old.requestId]);
});

// ---- 24 h PIN cleanup ----

test("saved PIN: deleted once synced or failed", () => {
  const synced = item({ hasPin: true, status: "synced", createdAt: NOW - MIN });
  const failed = item({ hasPin: true, status: "failed", createdAt: NOW - MIN });
  const waiting = item({ hasPin: true, status: "waiting", createdAt: NOW - MIN });
  assert.deepEqual(q.pinsToDelete([synced, failed, waiting], NOW), [synced.requestId, failed.requestId]);
});

test("saved PIN: deleted after 24 h even if never sent, for any employee", () => {
  const day = item({ hasPin: true, createdAt: NOW - 24 * HOUR });
  const almost = item({ hasPin: true, createdAt: NOW - 24 * HOUR + MIN });
  const otherEmp = item({ hasPin: true, employeeId: "emp2", createdAt: NOW - 25 * HOUR });
  const noPin = item({ hasPin: false, createdAt: NOW - 30 * HOUR });
  assert.deepEqual(q.pinsToDelete([day, almost, otherEmp, noPin], NOW), [day.requestId, otherEmp.requestId]);
});

test("older than 24 h can't be recorded", () => {
  assert.equal(q.isTooOld(item({ queuedAtMs: NOW - 24 * HOUR - 1 }), NOW), true);
  assert.equal(q.isTooOld(item({ queuedAtMs: NOW - 23 * HOUR }), NOW), false);
});

// ---- time ----

test("queued time: phone time, but always after the last punch", () => {
  assert.equal(q.queuedTimeFor(NOW, NOW - MIN), NOW);
  assert.equal(q.queuedTimeFor(NOW, null), NOW);
  assert.equal(q.queuedTimeFor(NOW, NOW), NOW + 1000);
  assert.equal(q.queuedTimeFor(NOW, NOW + 30 * 1000), NOW + 31 * 1000);
});

test("withTimeout: rejects with code timeout, passes a fast result through", async () => {
  await assert.rejects(q.withTimeout(new Promise((r) => setTimeout(r, 200)), 20), (e) => e.code === "timeout");
  assert.equal(await q.withTimeout(Promise.resolve(7), 50), 7);
  await assert.rejects(q.withTimeout(Promise.reject(new Error("boom")), 50), /boom/);
});

// ---- Home ----

const serverEv = (id, type, ms) => ({ id, type, timestamp: { toMillis: () => ms } });

test("Home: an offline clock-in shows Clocked in right away", () => {
  const TZ = "America/Chicago";
  const server = [serverEv("e1", "out", NOW - 20 * HOUR)];
  const inn = item({ action: "in", queuedAtMs: NOW - 30 * MIN, siteName: "Main St" });
  const events = q.foldQueuedEvents(server, [inn], C, E, NOW);
  const home = h.deriveHomeState(events, NOW, TZ);
  assert.equal(home.status, "in");
  assert.equal(home.shiftInMs, NOW - 30 * MIN);
  assert.equal(home.shiftSiteName, "Main St");
  assert.equal(home.workedMs, 30 * MIN);
});

test("Home: offline in, break, out all count, and buttons follow", () => {
  const TZ = "America/Chicago";
  const items = [
    item({ action: "in", queuedAtMs: NOW - 3 * HOUR }),
    item({ action: "breakStart", queuedAtMs: NOW - 2 * HOUR }),
  ];
  let home = h.deriveHomeState(q.foldQueuedEvents([], items, C, E, NOW), NOW, TZ);
  assert.equal(home.status, "break");
  assert.deepEqual(h.buttonsFor(home.status, true), ["endBreak"]);
  items.push(item({ action: "breakEnd", queuedAtMs: NOW - HOUR }));
  items.push(item({ action: "out", queuedAtMs: NOW - 10 * MIN }));
  home = h.deriveHomeState(q.foldQueuedEvents([], items, C, E, NOW), NOW, TZ);
  assert.equal(home.status, "done");
});

test("Home: a punch the server already has is not counted twice", () => {
  const a = item({ action: "in", queuedAtMs: NOW - HOUR, status: "synced", syncedAt: NOW });
  const server = [serverEv(a.requestId, "in", NOW - HOUR)];
  assert.equal(q.foldQueuedEvents(server, [a], C, E, NOW).length, 1);
  // Synced but not in the live list yet: shown for 10 min, then the server wins.
  const b = item({ action: "in", status: "synced", syncedAt: NOW - 5 * MIN });
  assert.equal(q.foldQueuedEvents([], [b], C, E, NOW).length, 1);
  b.syncedAt = NOW - 11 * MIN;
  assert.equal(q.foldQueuedEvents([], [b], C, E, NOW).length, 0);
});

test("Home: a Failed clock-in still counts until removed; other employees never", () => {
  const failed = item({ action: "in", status: "failed", failKind: "redo" });
  const other = item({ action: "in", employeeId: "emp2" });
  const events = q.foldQueuedEvents([], [failed, other], C, E, NOW);
  assert.deepEqual(events.map((e) => e.id), [failed.requestId]);
  assert.equal(events[0].localStatus, "failed");
});

test("Sync tab / Last synced time text", () => {
  const TZ = "America/Chicago";
  // NOW = Nov 1 2026 9:00 AM in Chicago (CST, UTC-6 - clocks went back at
  // 2 AM that day); a day earlier was still CDT, UTC-5.
  assert.equal(q.formatWhen(NOW - 55 * MIN, NOW, TZ), "Today, 8:05 AM");
  assert.equal(q.formatWhen(NOW - 24 * HOUR, NOW, TZ), "Oct 31, 10:00 AM");
  assert.equal(q.STATUS_LABELS.waiting, "Waiting");
  assert.equal(q.STATUS_TONES.failed, "red");
});

test("offline Home copy: timestamps saved as millis, Home reads them the same", () => {
  const TZ = "America/Chicago";
  const live = [
    { id: "e2", type: "breakStart", siteName: "A", timestamp: { toMillis: () => NOW - HOUR } },
    { id: "e1", type: "in", siteName: "A", timestamp: { seconds: (NOW - 3 * HOUR) / 1000, nanoseconds: 0 }, adjustedTimestamp: null },
  ];
  const saved = JSON.parse(JSON.stringify(q.eventsForCache(live)));
  assert.equal(saved[0].timestamp, NOW - HOUR);
  assert.equal(saved[1].timestamp, NOW - 3 * HOUR);
  assert.equal(saved[1].adjustedTimestamp, null);
  assert.deepEqual(h.deriveHomeState(saved, NOW, TZ), h.deriveHomeState(live, NOW, TZ));
});

test("Home: last punch time includes queued punches", () => {
  const server = [serverEv("e1", "in", NOW - 2 * HOUR)];
  const brk = item({ action: "breakStart", queuedAtMs: NOW - HOUR });
  const events = q.foldQueuedEvents(server, [brk], C, E, NOW);
  assert.equal(q.lastEventMs(events), NOW - HOUR);
  assert.equal(q.newestFirst(events)[0].id, brk.requestId);
  assert.equal(q.lastEventMs([]), null);
});
