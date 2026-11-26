const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const k = require("../lib/kioskLogic");

const sha = (s) => createHash("sha256").update(s).digest("hex");
const SALT = "abcdefghijklmnopqrstuv";

function table(extra = {}) {
  return k.parsePinTable({
    v: 1,
    salt: SALT,
    isPro: true,
    kioskName: "Front iPad",
    employees: [
      { id: "emp1", name: "Ana", hash: sha(`${SALT}:1234`), assignedSiteIds: ["s1"], lastEventType: "out", lastEventTimestamp: 1000 },
      { id: "emp2", name: "Bo", hash: sha(`${SALT}:5678`), assignedSiteIds: [], lastEventType: "in", lastEventTimestamp: 2000 },
    ],
    unlockers: [{ id: "adm", name: "Ada", hash: sha(`${SALT}:9999`) }],
    sites: [{ id: "s1", name: "Yard" }],
    hasLocatedSites: false,
    serverNowMs: 5000,
    ...extra,
  });
}

test("hash input matches the server's pinVerifierHash string", () => {
  assert.equal(k.hashInput("s", "1234"), "s:1234");
});

test("parsePinTable: keeps only well-formed rows, refuses a bad answer", () => {
  const t = table();
  assert.equal(t.employees.length, 2);
  assert.equal(t.isPro, true);
  assert.equal(t.syncedAtMs, 5000);
  assert.equal(k.parsePinTable(null), null);
  assert.equal(k.parsePinTable({ v: 2 }), null);
  assert.equal(k.parsePinTable({ v: 1, salt: "short", employees: [], unlockers: [], sites: [] }), null);
  const odd = table({ employees: [{ id: "x", hash: "not-hex" }, { id: "bad id!", hash: sha("a") }] });
  assert.equal(odd.employees.length, 0);
});

test("PIN lookup by salted hash; a duplicate hash picks nobody", () => {
  const t = table();
  assert.equal(k.findEmployeeByHash(t, sha(`${SALT}:1234`)).id, "emp1");
  assert.equal(k.findEmployeeByHash(t, sha(`${SALT}:0000`)), null);
  assert.equal(k.findEmployeeByHash(t, sha("1234")), null); // unsalted never matches
  const dup = table({ employees: [
    { id: "a", hash: sha(`${SALT}:1111`) },
    { id: "b", hash: sha(`${SALT}:1111`) },
  ] });
  assert.equal(k.findEmployeeByHash(dup, sha(`${SALT}:1111`)), null);
  assert.equal(k.findUnlockerByHash(t, sha(`${SALT}:9999`)).id, "adm");
  assert.equal(k.findUnlockerByHash(t, sha(`${SALT}:1234`)), null); // an employee PIN never unlocks
});

test("K14: 3 wrong in a row = 45 s, survives as saved state, then a fresh count", () => {
  let s;
  s = k.lockAfterWrong(s, 0);
  s = k.lockAfterWrong(s, 1);
  assert.equal(k.lockSecondsLeft(s, 2), 0);
  s = k.lockAfterWrong(s, 2);
  assert.equal(k.lockSecondsLeft(s, 2), 45);
  assert.equal(k.lockSecondsLeft(s, 2 + 44 * 1000), 1);
  // wrong while locked doesn't extend it
  assert.deepEqual(k.lockAfterWrong(s, 10), s);
  assert.equal(k.lockSecondsLeft(s, 2 + 45 * 1000), 0);
  // a right PIN clears the count
  let t = k.lockAfterWrong(undefined, 0);
  t = k.lockAfterRight(t, 1);
  t = k.lockAfterWrong(t, 2);
  t = k.lockAfterWrong(t, 3);
  assert.equal(k.lockSecondsLeft(t, 4), 0);
});

test("status: newest of the server's last event and this tablet's own punches; failed ones ignored", () => {
  const t = table();
  const ana = t.employees[0];
  assert.deepEqual(k.currentStatus(ana, []), { status: "out", sinceMs: 1000 });
  const q = [
    { employeeId: "emp1", action: "in", queuedAtMs: 3000, status: "waiting" },
    { employeeId: "emp1", action: "breakStart", queuedAtMs: 4000, status: "synced" },
    { employeeId: "emp1", action: "breakEnd", queuedAtMs: 4500, status: "failed" },
    { employeeId: "emp2", action: "out", queuedAtMs: 9000, status: "waiting" },
  ];
  assert.deepEqual(k.currentStatus(ana, q), { status: "break", sinceMs: 4000 });
  // an older queued punch never beats a newer server event
  const bo = t.employees[1];
  assert.equal(k.currentStatus(bo, [{ employeeId: "emp2", action: "out", queuedAtMs: 1500, status: "waiting" }]).status, "in");
});

test("buttons: break blocked while out ('Please clock in first'), clock out blocked on a break", () => {
  assert.deepEqual(k.kioskActions("out"), { clock: "in", clockBlocked: null, breakAction: "breakStart", breakBlocked: "Please clock in first." });
  assert.deepEqual(k.kioskActions("in"), { clock: "out", clockBlocked: null, breakAction: "breakStart", breakBlocked: null });
  assert.equal(k.kioskActions("break").breakAction, "breakEnd");
  assert.ok(k.kioskActions("break").clockBlocked);
});

test("Break screen: Start break when clocked in, timer when on a break, never starts one by itself", () => {
  assert.deepEqual(k.kioskBreakView("in", 1000, undefined), { mode: "start", sinceMs: null });
  assert.deepEqual(k.kioskBreakView("break", 5000, undefined), { mode: "onBreak", sinceMs: 5000 });
  assert.deepEqual(k.kioskBreakView("break", undefined, undefined), { mode: "onBreak", sinceMs: null });
  assert.deepEqual(k.kioskBreakView("out", null, undefined), { mode: "notIn", sinceMs: null });
  // just started here: the timer shows at once, even before the status catches up
  assert.deepEqual(k.kioskBreakView("in", 1000, 9000), { mode: "onBreak", sinceMs: 9000 });
});

test("final audit A: a queued punch keeps { salt, hash }, never the PIN; old 4-digit entries still send", () => {
  const proof = { salt: "c2FsdA", hash: "a".repeat(64) };
  const raw = k.serializePinProof(proof);
  assert.equal(raw.includes("1234"), false);
  assert.deepEqual(k.storedPinPayload(raw), { pinProof: proof });
  assert.deepEqual(k.storedPinPayload("1234"), { pin: "1234" }); // queued by dev build 34/35
  assert.equal(k.storedPinPayload(""), null);
  assert.equal(k.storedPinPayload(null), null);
  assert.equal(k.storedPinPayload("{\"salt\":\"x\",\"hash\":\"short\"}"), null);
  assert.equal(k.storedPinPayload("not json"), null);
});

test("chunks stay under the SecureStore size and join back", () => {
  const text = "x".repeat(4000);
  const chunks = k.toChunks(text);
  assert.equal(chunks.length, 3);
  assert.ok(chunks.every((c) => c.length <= k.SECURE_CHUNK_CHARS));
  assert.equal(chunks.join(""), text);
  assert.deepEqual(k.toChunks(""), [""]);
});

test("sync outcomes: lock = wait, refusals = failed, anything else = retry; 403 upload = already there", () => {
  assert.equal(k.kioskFailKind({ details: { reason: "locked" } }), "wait");
  assert.equal(k.kioskFailKind({ details: { reason: "wrongPin" } }), "failed");
  assert.equal(k.kioskFailKind({ details: { reason: "notPro" } }), "failed");
  assert.equal(k.kioskFailKind({ code: "functions/unavailable" }), "retry");
  assert.equal(k.kioskFailKind(new Error("Network request failed")), "retry");
  assert.equal(k.isAlreadyUploaded(new Error("Photo upload failed with status 403")), true);
  assert.equal(k.isAlreadyUploaded(new Error("Photo upload failed with status 500")), false);
});

// ---- iPad round 1 ----

test("break line: start time + whole minutes, hours after 60 min", () => {
  const t0 = 1_000_000;
  const fmt = () => "12:05 PM";
  assert.equal(k.breakStartedLine(t0, t0 + 18 * 60000 + 59000, fmt), "Break started 12:05 PM - 18 min");
  assert.equal(k.breakElapsedText(t0, t0 + 30000), "0 min");
  assert.equal(k.breakElapsedText(t0, t0 + 65 * 60000), "1 h 05 min");
  assert.equal(k.breakElapsedText(t0, t0 - 5000), "0 min"); // clock skew never goes negative
  assert.equal(k.breakStartedLine(null, t0, fmt), "");
});

test("kiosk comment: in/out only, trimmed, blank = none, capped at 500", () => {
  assert.equal(k.kioskCommentFor("in", "  late, traffic "), "late, traffic");
  assert.equal(k.kioskCommentFor("out", "   "), null);
  assert.equal(k.kioskCommentFor("breakStart", "x"), null);
  assert.equal(k.kioskCommentFor("in", null), null);
  assert.equal(k.kioskCommentFor("in", "y".repeat(600)).length, 500);
});

test("sync list: waiting/sending + recent failed with reason, oldest first; synced and old failed hidden", () => {
  const now = 10 * 24 * 3600 * 1000;
  const rows = k.kioskSyncRows(
    [
      { requestId: "c", employeeName: "Cal", action: "out", queuedAtMs: now - 1000, status: "waiting" },
      { requestId: "a", employeeName: "Ava", action: "in", queuedAtMs: now - 5000, status: "syncing" },
      { requestId: "s", employeeName: "Sy", action: "in", queuedAtMs: now - 3000, status: "synced" },
      { requestId: "f", employeeName: "Ben", action: "breakStart", queuedAtMs: now - 4000, status: "failed", failMessage: "This employee is inactive." },
      { requestId: "old", employeeName: "Old", action: "in", queuedAtMs: now - k.FAILED_SHOWN_MS - 1, status: "failed", failMessage: "x" },
    ],
    now
  );
  assert.deepEqual(rows.map((r) => r.requestId), ["a", "f", "c"]);
  assert.deepEqual(rows.map((r) => r.statusText), ["Sending", "Failed", "Waiting"]);
  assert.equal(rows[0].actionText, "Clock in");
  assert.equal(rows[1].actionText, "Break start");
  assert.equal(rows[1].reason, "This employee is inactive.");
  assert.equal(rows[2].reason, "");
  assert.deepEqual(k.kioskSyncRows([], now), []);
});

test("agoText", () => {
  const now = 100 * 3600 * 1000;
  assert.equal(k.agoText(null, now), "never");
  assert.equal(k.agoText(now - 20000, now), "just now");
  assert.equal(k.agoText(now - 5 * 60000, now), "5 min ago");
  assert.equal(k.agoText(now - 2 * 3600000, now), "2 h ago");
  assert.equal(k.agoText(now - 49 * 3600000, now), "2 days ago");
});
