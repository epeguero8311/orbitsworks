// RC1 - lib/roleSync.js: routing by the token, when to refresh it, and
// what must be sent before the screens switch, for every direction.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  claimsFields,
  leftoverNotice,
  mergeUserData,
  needsRoleRefresh,
  roleFamily,
  toMillis,
  transitionPlan,
} = require("../lib/roleSync");

const T0 = 1795218000000; // token issued
const claims = (role, iatMs = T0) => claimsFields({ role, companyId: "co", employeeId: "emp1", iat: iatMs / 1000 });
const ts = (ms) => ({ toMillis: () => ms });
const doc = (role, changedMs) => ({ role, companyId: "co", name: "Drops", ...(changedMs ? { roleChangedAt: ts(changedMs) } : {}) });

test("roleFamily: employee vs staff; unknown is null", () => {
  assert.equal(roleFamily("employee"), "employee");
  for (const r of ["owner", "admin", "supervisor"]) assert.equal(roleFamily(r), "staff");
  assert.equal(roleFamily(undefined), null);
  assert.equal(roleFamily("guest"), null);
});

test("claimsFields: needs role + companyId; keeps employeeId and iat", () => {
  assert.equal(claimsFields(null), null);
  assert.equal(claimsFields({ role: "employee" }), null);
  assert.deepEqual(claims("employee"), { role: "employee", companyId: "co", employeeId: "emp1", issuedAtMs: T0 });
  assert.equal(claimsFields({ role: "owner", companyId: "co" }).employeeId, null);
});

test("mergeUserData: the TOKEN's role wins over the users doc (the RC1 bug), name comes from the doc", () => {
  const merged = mergeUserData(doc("supervisor"), claims("employee"));
  assert.equal(merged.role, "employee");
  assert.equal(merged.name, "Drops");
  assert.equal(merged.employeeId, "emp1");
  assert.equal(merged.fromCachedClaims, undefined);
});

test("mergeUserData: claims only (doc not loaded yet) and doc only (no claims yet)", () => {
  const onlyClaims = mergeUserData(null, claims("supervisor"));
  assert.equal(onlyClaims.role, "supervisor");
  assert.equal(onlyClaims.fromCachedClaims, true);
  assert.deepEqual(mergeUserData(doc("employee"), null), doc("employee"));
  assert.equal(mergeUserData(null, null), null);
});

test("needsRoleRefresh: role differs -> yes, in every direction", () => {
  const pairs = [
    ["employee", "supervisor"],
    ["supervisor", "employee"],
    ["supervisor", "admin"],
    ["admin", "supervisor"],
    ["employee", "admin"],
    ["admin", "employee"],
  ];
  for (const [from, to] of pairs) {
    assert.equal(needsRoleRefresh({ claims: claims(from), usersDoc: doc(to) }), true, `${from} -> ${to}`);
  }
});

test("needsRoleRefresh: same role, roleChangedAt newer than the token -> yes; older -> no", () => {
  assert.equal(needsRoleRefresh({ claims: claims("supervisor"), usersDoc: doc("supervisor", T0 + 5000) }), true);
  assert.equal(needsRoleRefresh({ claims: claims("supervisor"), usersDoc: doc("supervisor", T0 - 5000) }), false);
  assert.equal(needsRoleRefresh({ claims: claims("supervisor"), usersDoc: doc("supervisor") }), false);
});

test("needsRoleRefresh: a change already handled never loops (token iat has 1 s precision)", () => {
  // Refreshed for a change stamped 400 ms into the same second the new
  // token was issued: iat*1000 < changedMs, but it's handled.
  const changed = T0 + 400;
  assert.equal(needsRoleRefresh({ claims: claims("admin", T0), usersDoc: doc("admin", changed), handledChangeMs: changed }), false);
  // Handled but the claims still lag (server not done): try again.
  assert.equal(needsRoleRefresh({ claims: claims("supervisor", T0), usersDoc: doc("admin", changed), handledChangeMs: changed }), true);
  // A NEWER change after the handled one: refresh again.
  assert.equal(
    needsRoleRefresh({ claims: claims("admin", T0), usersDoc: doc("admin", changed + 60000), handledChangeMs: changed }),
    true
  );
});

test("needsRoleRefresh: nothing to compare -> no", () => {
  assert.equal(needsRoleRefresh({ claims: null, usersDoc: doc("admin") }), false);
  assert.equal(needsRoleRefresh({ claims: claims("admin"), usersDoc: null }), false);
});

test("transitionPlan: employee -> supervisor/admin is a promotion that first sends the employee's own punches", () => {
  for (const to of ["supervisor", "admin"]) {
    const p = transitionPlan("employee", to);
    assert.equal(p.kind, "promotion");
    assert.equal(p.drain, "employeePunches");
    assert.ok(p.drainMaxMs > 0);
  }
});

test("transitionPlan: supervisor/admin -> employee is a demotion that first sends the supervisor queue", () => {
  for (const from of ["supervisor", "admin"]) {
    const p = transitionPlan(from, "employee");
    assert.equal(p.kind, "demotion");
    assert.equal(p.drain, "staffQueues");
    assert.ok(p.drainMaxMs >= transitionPlan("employee", "admin").drainMaxMs);
  }
});

test("transitionPlan: supervisor <-> admin keeps the same screens, nothing to send first", () => {
  assert.deepEqual(transitionPlan("supervisor", "admin"), { kind: "sameScreens", drain: null, drainMaxMs: 0 });
  assert.deepEqual(transitionPlan("admin", "supervisor"), { kind: "sameScreens", drain: null, drainMaxMs: 0 });
});

test("leftoverNotice: nothing left -> null; promotion and demotion say what happens to it", () => {
  assert.equal(leftoverNotice("promotion", 0), null);
  assert.equal(leftoverNotice("sameScreens", 3), null);
  assert.match(leftoverNotice("promotion", 1), /1 item .* still sending/);
  assert.match(leftoverNotice("demotion", 2), /2 items .* next time a supervisor or admin signs in here/);
});

test("openOwnPunches: only this person's unsynced punches in this company, oldest first", () => {
  const { openOwnPunches } = require("../lib/roleSync");
  const items = [
    { requestId: "b", companyId: "co", employeeId: "emp1", status: "waiting", queuedAtMs: 20 },
    { requestId: "a", companyId: "co", employeeId: "emp1", status: "failed", queuedAtMs: 10 },
    { requestId: "s", companyId: "co", employeeId: "emp1", status: "synced", queuedAtMs: 5 },
    { requestId: "x", companyId: "co", employeeId: "emp2", status: "waiting", queuedAtMs: 1 },
    { requestId: "y", companyId: "other", employeeId: "emp1", status: "waiting", queuedAtMs: 1 },
    { requestId: "c", companyId: "co", employeeId: "emp1", status: "syncing", queuedAtMs: 30 },
  ];
  assert.deepEqual(openOwnPunches(items, "co", "emp1").map((i) => i.requestId), ["a", "b", "c"]);
  assert.deepEqual(openOwnPunches(null, "co", "emp1"), []);
});

test("toMillis: Firestore Timestamp, plain {seconds}, admin {_seconds}, number", () => {
  assert.equal(toMillis(ts(5)), 5);
  assert.equal(toMillis({ seconds: 2, nanoseconds: 5e6 }), 2005);
  assert.equal(toMillis({ _seconds: 3, _nanoseconds: 0 }), 3000);
  assert.equal(toMillis(7), 7);
  assert.equal(toMillis(null), null);
});

test("Task 5: kiosk is its own family; leaving it drains the kiosk queue; going to it drains the old role's", () => {
  assert.equal(roleFamily("kiosk"), "kiosk");
  assert.deepEqual(transitionPlan("kiosk", "supervisor"), { kind: "kioskExit", drain: "kioskPunches", drainMaxMs: 60000 });
  assert.equal(transitionPlan("supervisor", "kiosk").drain, "staffQueues");
  assert.equal(transitionPlan("employee", "kiosk").drain, "employeePunches");
  assert.equal(transitionPlan("kiosk", "kiosk").kind, "sameScreens");
  assert.match(leftoverNotice("kioskExit", 2), /2 items saved in Kiosk mode/);
});
