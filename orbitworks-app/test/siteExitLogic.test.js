// Phase 8 - lib/siteExitLogic.js: the 2-minute rule, D9, E4, F2 a, gaps,
// stop, and the queue gate.
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../lib/siteExitLogic");

const MIN = 60 * 1000;
const FENCE = { lat: 30, lng: -97, radiusM: 100 };
const at = (m, accuracyM = 10) => ({ lat: 30 + m / 111195, lng: -97, accuracyM, fixAtMs: 1 });
const IN = at(0);
const OUT = at(300);
const ROUGH = at(300, 500);
let n = 0;
const newId = () => `id${++n}`;
const base = (o = {}) =>
  L.startState({ clockInEventId: "shift1", companyId: "c", employeeId: "e", siteName: "Riverside", fence: FENCE, fenceSource: "server", clockInFix: IN, clockInMs: 0, canTrack: true, newId, ...o }).state;
const types = (actions) => actions.map((a) => a.type);
const rowsOf = (actions) => actions.filter((a) => a.row).map((a) => `${a.row.kind}:${a.row.phase}`);

test("start: inside at clock-in counts as been inside; not able to track = a permission gap from clock-in (E2)", () => {
  assert.equal(base().seenInside, true);
  assert.equal(base({ clockInFix: OUT }).seenInside, false);
  const r = L.startState({ clockInEventId: "s", companyId: "c", employeeId: "e", fence: FENCE, clockInFix: IN, clockInMs: 5, canTrack: false, newId });
  assert.equal(r.state.openOff.reason, "permission");
  assert.deepEqual(types(r.actions), ["queue"]);
  assert.equal(r.actions[0].row.kind, "trackingOff");
  assert.equal(r.actions[0].row.atMs, 5);
  assert.equal(r.actions[0].row.offReason, "permission");
});

test("exit + good fix outside: start queued for exit + 2 min, notification at the same time", () => {
  const r = L.regionEvent(base(), { kind: "exit", fix: OUT, nowMs: 10 * MIN, newId });
  assert.deepEqual(types(r.actions), ["queue", "notify"]);
  const row = r.actions[0].row;
  assert.equal(row.kind, "left");
  assert.equal(row.phase, "start");
  assert.equal(row.atMs, 10 * MIN);
  assert.equal(row.notBeforeMs, 12 * MIN);
  assert.equal(row.lat, OUT.lat);
  assert.equal(r.actions[1].atMs, 12 * MIN);
  assert.equal(r.state.openExit.atMs, 10 * MIN);
});

test("D9: never inside yet - an exit records nothing, until they have been inside once", () => {
  assert.deepEqual(L.regionEvent(base({ clockInFix: OUT }), { kind: "exit", fix: OUT, nowMs: MIN, newId }).actions, []);
  const inside = L.regionEvent(base({ clockInFix: OUT }), { kind: "enter", fix: IN, nowMs: 2 * MIN, newId }).state;
  assert.equal(inside.seenInside, true);
  assert.deepEqual(types(L.regionEvent(inside, { kind: "exit", fix: OUT, nowMs: 3 * MIN, newId }).actions), ["queue", "notify"]);
});

test("F2 a: an enter within 2 min cancels the exit and the notification, even with a rough fix", () => {
  const left = L.regionEvent(base(), { kind: "exit", fix: OUT, nowMs: 10 * MIN, newId });
  const id = left.state.openExit.id;
  const back = L.regionEvent(left.state, { kind: "enter", fix: ROUGH, nowMs: 11 * MIN, newId });
  assert.deepEqual(back.actions, [{ type: "unqueue", exitId: id }, { type: "cancelNotify", exitId: id }]);
  assert.equal(back.state.openExit, null);
});

test("an enter after 2 min with a good fix inside queues the return; a rough one waits", () => {
  const left = L.regionEvent(base(), { kind: "exit", fix: OUT, nowMs: 10 * MIN, newId }).state;
  assert.deepEqual(L.regionEvent(left, { kind: "enter", fix: ROUGH, nowMs: 15 * MIN, newId }).actions, []);
  const back = L.regionEvent(left, { kind: "enter", fix: IN, nowMs: 15 * MIN, newId });
  assert.equal(back.actions.length, 1);
  assert.equal(back.actions[0].row.phase, "end");
  assert.equal(back.actions[0].row.exitId, left.openExit.id);
  assert.equal(back.actions[0].row.atMs, 15 * MIN);
  assert.equal(back.state.openExit, null);
});

test("a second exit while one is open adds nothing", () => {
  const left = L.regionEvent(base(), { kind: "exit", fix: OUT, nowMs: 10 * MIN, newId }).state;
  assert.deepEqual(L.regionEvent(left, { kind: "exit", fix: OUT, nowMs: 20 * MIN, newId }).actions, []);
});

test("E4: exit with no good fix = a noFix gap; the next good fix ends it (and starts the exit if outside)", () => {
  const gap = L.regionEvent(base(), { kind: "exit", fix: ROUGH, nowMs: 10 * MIN, newId });
  assert.equal(gap.state.openOff.reason, "noFix");
  assert.equal(gap.actions[0].row.offReason, "noFix");
  const seen = L.foregroundFix(gap.state, { fix: OUT, nowMs: 30 * MIN, newId });
  assert.deepEqual(rowsOf(seen.actions), ["trackingOff:end", "left:start"]);
  assert.equal(seen.state.openOff, null);
  const inside = L.foregroundFix(gap.state, { fix: IN, nowMs: 30 * MIN, newId });
  assert.deepEqual(rowsOf(inside.actions), ["trackingOff:end"]);
  // No gap before they have been inside once.
  assert.deepEqual(L.regionEvent(base({ clockInFix: OUT }), { kind: "exit", fix: null, nowMs: MIN, newId }).actions, []);
});

test("an in-between good fix (inside the 25 m buffer) changes nothing", () => {
  assert.deepEqual(L.regionEvent(base(), { kind: "exit", fix: at(115, 5), nowMs: MIN, newId }).actions, []);
});

test("app opens with a good fix outside: the exit starts now", () => {
  const r = L.foregroundFix(base(), { fix: OUT, nowMs: 7 * MIN, newId });
  assert.equal(r.actions[0].row.atMs, 7 * MIN);
});

test("tracking off / on (permission, signed out, app stopped), one gap at a time", () => {
  const off = L.trackingOff(base(), { reason: "permission", atMs: 5 * MIN, newId });
  assert.equal(off.state.openOff.reason, "permission");
  assert.deepEqual(L.trackingOff(off.state, { reason: "permission", atMs: 6 * MIN, newId }).actions, []);
  const on = L.trackingOn(off.state, { atMs: 9 * MIN });
  assert.equal(on.actions[0].row.phase, "end");
  assert.equal(on.actions[0].row.atMs, 9 * MIN);
  // A noFix gap is replaced by a stronger reason.
  const nofix = L.regionEvent(base(), { kind: "exit", fix: null, nowMs: MIN, newId }).state;
  const swapped = L.trackingOff(nofix, { reason: "signedOut", atMs: 2 * MIN, newId });
  assert.deepEqual(swapped.actions.map((a) => `${a.row.phase}:${a.row.offReason}`), ["end:null", "start:signedOut"]);
  // trackingOn never ends a noFix gap (only a good fix does).
  assert.deepEqual(L.trackingOn(nofix, { atMs: 3 * MIN }).actions, []);
});

test("stop: a pending exit is dropped, a confirmed one is left for the server", () => {
  const left = L.regionEvent(base(), { kind: "exit", fix: OUT, nowMs: 10 * MIN, newId }).state;
  assert.deepEqual(types(L.stop(left, { nowMs: 11 * MIN }).actions), ["unqueue", "cancelNotify"]);
  const s = L.stop(left, { nowMs: 20 * MIN });
  assert.deepEqual(s.actions, []);
  assert.equal(s.state.status, "stopped");
  assert.deepEqual(L.regionEvent(s.state, { kind: "exit", fix: OUT, nowMs: 30 * MIN, newId }).actions, []);
});

test("appStoppedGapStart: the later of last alive and boot", () => {
  assert.equal(L.appStoppedGapStart({ lastAliveMs: 100, nowMs: 1000, uptimeMs: 300 }), 700);
  assert.equal(L.appStoppedGapStart({ lastAliveMs: 800, nowMs: 1000, uptimeMs: 300 }), 800);
  assert.equal(L.appStoppedGapStart({ lastAliveMs: 100, nowMs: 1000, uptimeMs: null }), 100);
});

test("queue gate: 2 min wait, start before end, clock-in still on the phone waits, failed clock-in fails", () => {
  const row = (o) => ({ requestId: o.exitId + o.phase, companyId: "c", employeeId: "e", clockInEventId: "shift1", status: "waiting", kind: "left", ...o });
  const rows = [
    row({ exitId: "a", phase: "start", atMs: 10, notBeforeMs: 10 + 2 * MIN }),
    row({ exitId: "b", phase: "start", atMs: 5, notBeforeMs: 5 }),
    row({ exitId: "b", phase: "end", atMs: 7, notBeforeMs: 7 }),
    row({ exitId: "x", phase: "start", atMs: 1, notBeforeMs: 1, employeeId: "other" }),
  ];
  const synced = [{ requestId: "shift1", action: "in", status: "synced" }];
  const ids = (list) => list.map((x) => `${x.row.exitId}:${x.row.phase}`);
  assert.deepEqual(ids(L.siteExitsToSend(rows, synced, "c", "e", 100)), ["b:start"]);
  const startSent = rows.map((r) => (r.exitId === "b" && r.phase === "start" ? { ...r, status: "synced" } : r));
  assert.deepEqual(ids(L.siteExitsToSend(startSent, synced, "c", "e", 3 * MIN)), ["b:end", "a:start"]);
  assert.deepEqual(L.siteExitsToSend(rows, [{ requestId: "shift1", action: "in", status: "waiting" }], "c", "e", 100), []);
  assert.deepEqual(L.siteExitsToSend(rows, [{ requestId: "shift1", action: "in", status: "failed" }], "c", "e", 100).map((x) => x.gate), ["fail"]);
});

test("counts, drop, made on this phone, notification text", () => {
  const rows = [
    { requestId: "1", companyId: "c", employeeId: "e", status: "waiting" },
    { requestId: "2", companyId: "c", employeeId: "e", status: "synced", syncedAt: 0 },
  ];
  assert.equal(L.pendingSiteExitCount(rows, "c", "e"), 1);
  assert.deepEqual(L.siteExitsToDrop(rows, 5 * 24 * 60 * MIN), ["2"]);
  assert.equal(L.madeOnThisPhone("s1", [{ requestId: "s1", action: "in" }]), true);
  assert.equal(L.madeOnThisPhone("s1", [{ requestId: "s1", action: "out" }]), false);
  assert.equal(L.madeOnThisPhone("s2", []), false);
  assert.match(L.exitNotification("Riverside").body, /Riverside/);
  assert.equal(L.exitNotification("").title, "You have left the job site");
});
