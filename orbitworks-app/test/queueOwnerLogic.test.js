// Logout fix - lib/queueOwnerLogic.js (supervisor queue rows tied to the
// login + company that saved them; the logout "haven't sent yet" text).
// Run: node --test test/queueOwnerLogic.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const q = require("../lib/queueOwnerLogic");

const A = q.ownerOf("uidA", "co1");

test("ownerOf: needs both a uid and a company", () => {
  assert.deepEqual(A, { uid: "uidA", companyId: "co1" });
  assert.equal(q.ownerOf(null, "co1"), null);
  assert.equal(q.ownerOf("uidA", null), null);
  assert.equal(q.ownerOf("", ""), null);
});

test("isOwnRow: only the saving login, only its company", () => {
  assert.equal(q.isOwnRow({ createdByUid: "uidA", companyId: "co1" }, A), true);
  assert.equal(q.isOwnRow({ createdByUid: "uidB", companyId: "co1" }, A), false, "another login, same company");
  assert.equal(q.isOwnRow({ createdByUid: "uidA", companyId: "co2" }, A), false, "same login, another company");
  assert.equal(q.isOwnRow({ createdByUid: "uidA" }, A), true, "older build: no companyId = the creator's");
  assert.equal(q.isOwnRow({ createdByUid: "uidA", companyId: null }, A), true);
  assert.equal(q.isOwnRow({ createdByUid: null, companyId: "co1" }, A), false, "no owner is never sent");
  assert.equal(q.isOwnRow({ createdByUid: "uidA", companyId: "co1" }, null), false, "signed out sends nothing");
});

test("SQL rule matches: two values, uid then company", () => {
  assert.equal(q.OWN_ROW_SQL.split("?").length - 1, 2);
  assert.deepEqual(q.ownParams(A), ["uidA", "co1"]);
});

test("unsentTitle: counts, plurals, null when nothing waits", () => {
  assert.equal(q.unsentTitle({ punches: 1 }), "1 punch hasn't sent yet");
  assert.equal(q.unsentTitle({ punches: 3 }), "3 punches haven't sent yet");
  assert.equal(q.unsentTitle({ punches: 2, comments: 1 }), "2 punches and 1 comment haven't sent yet");
  assert.equal(
    q.unsentTitle({ punches: 1, comments: 2, siteExits: 1 }),
    "1 punch, 2 comments and 1 job site record haven't sent yet"
  );
  assert.equal(q.unsentTitle({ punches: 2, employees: 1 }), "2 punches and 1 employee change haven't sent yet");
  assert.equal(q.unsentTitle({ comments: 1 }), "1 comment hasn't sent yet");
  assert.equal(q.unsentTitle({}), null);
  assert.equal(q.unsentTitle({ punches: 0, comments: -1 }), null);
  assert.equal(q.unsentTitle(null), null);
});

test("unsentMessage: says nothing is deleted; the Employee App names the 24 h window", () => {
  assert.match(q.unsentMessage("employee"), /Nothing is deleted/);
  assert.match(q.unsentMessage("employee"), /24 hours/);
  assert.match(q.unsentMessage("supervisor"), /Nothing is deleted/);
  assert.match(q.unsentMessage("supervisor"), /this login/);
});

test("stillUnsentNote: only when some are left", () => {
  assert.equal(q.stillUnsentNote(0), null);
  assert.match(q.stillUnsentNote(1), /^1 still hasn't sent/);
  assert.match(q.stillUnsentNote(4), /^4 still haven't sent/);
});
