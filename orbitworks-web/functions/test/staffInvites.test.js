// acceptInvite (supervisor/admin invites, website /join) uses the invite the
// person came from (?invite=<id>), not just any pending invite for their
// email. Part 1: pickStaffInvite (pure). Part 2: the REAL compiled callable
// on the Firestore + Auth emulators.
//
// Run: firebase emulators:exec --only firestore,auth "node --test test/staffInvites.test.js"
process.env.GCLOUD_PROJECT = "orbitworks-staffinvite-test";
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8090";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.REKOGNITION_ACCESS_KEY_ID = "test-access-key";
process.env.REKOGNITION_SECRET_ACCESS_KEY = "test-secret-key";
process.env.MAPBOX_TOKEN = "";
process.env.ALERTS_FEED_ENABLED = "false";
process.env.DEVICE_TRACKING_ENABLED = "false";
process.env.PUSH_NOTIFICATIONS_ENABLED = "false";

const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");

const v = require("../lib/staffInviteValidators");
const { db } = require("../lib/shared.js");
const funcs = require("../lib/index.js");

// ---------- Part 1: pure ----------

const inv = (id, email, status = "pending") => ({ id, email, status });

test("pick: with an inviteId, exactly that invite - pending and for this email", () => {
  assert.deepEqual(v.pickStaffInvite("v@x.co", "b", inv("b", "V@x.co"), []), { ok: true, id: "b" });
  assert.deepEqual(v.pickStaffInvite("v@x.co", "b", null, []), { ok: false, reason: "notFound" });
  assert.deepEqual(v.pickStaffInvite("v@x.co", "b", inv("b", "other@x.co"), []), { ok: false, reason: "notForThisEmail" });
  assert.deepEqual(v.pickStaffInvite("v@x.co", "b", inv("b", "v@x.co", "accepted"), []), { ok: false, reason: "notPending" });
});

test("pick: without an inviteId (older link) - one pending invite only", () => {
  assert.deepEqual(v.pickStaffInvite("v@x.co", undefined, null, [inv("a", "v@x.co")]), { ok: true, id: "a" });
  assert.deepEqual(v.pickStaffInvite("v@x.co", undefined, null, []), { ok: false, reason: "notFound" });
  assert.deepEqual(v.pickStaffInvite("v@x.co", undefined, null, [inv("a", "v@x.co"), inv("b", "v@x.co")]), { ok: false, reason: "ambiguous" });
});

test("schema: name only (live website), with inviteId, empty inviteId; junk ids refused", () => {
  assert.equal(v.acceptInviteSchema.safeParse({ name: "Sam" }).data.inviteId, undefined);
  assert.equal(v.acceptInviteSchema.safeParse({ name: "Sam", inviteId: "AbC123" }).data.inviteId, "AbC123");
  assert.equal(v.acceptInviteSchema.safeParse({ name: "Sam", inviteId: "" }).data.inviteId, undefined);
  for (const bad of ["../x", "a/b", "x".repeat(129), "has space"]) {
    assert.equal(v.acceptInviteSchema.safeParse({ inviteId: bad }).success, false, bad);
  }
});

// ---------- Part 2: the callable ----------

async function clearAll() {
  const p = process.env.GCLOUD_PROJECT;
  await fetch(`http://localhost:8090/emulator/v1/projects/${p}/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${p}/accounts`, { method: "DELETE" });
}

async function seedCompany(c) {
  await db.doc(`companies/${c}`).set({ name: "Co " + c, planTier: "pro_tier1", subscriptionStatus: "active" });
}

async function seedInvite(id, companyId, email, extra = {}) {
  await db.doc(`invites/${id}`).set({
    email, companyId, role: "admin", assignedSiteIds: [], status: "pending", invitedByUid: "owner-" + companyId, ...extra,
  });
}

async function newLogin(email) {
  const u = await admin.auth().createUser({ email, password: "secret123" });
  return { uid: u.uid, token: { email } };
}

const call = (data, auth) => funcs.acceptInvite.run({ data, auth, rawRequest: {} });
const loginExists = async (uid) => admin.auth().getUser(uid).then(() => true, () => false);

test("callable: two companies invite the same email - the link's invite wins", async () => {
  await clearAll();
  await seedCompany("coA");
  await seedCompany("coB");
  await seedInvite("invA", "coA", "v1@x.co");
  await seedInvite("invB", "coB", "v1@x.co");
  const auth = await newLogin("v1@x.co");
  const r = await call({ name: "Val", inviteId: "invB" }, auth);
  assert.equal(r.companyId, "coB");
  assert.equal((await db.doc(`users/${auth.uid}`).get()).data().companyId, "coB");
  assert.equal((await admin.auth().getUser(auth.uid)).customClaims.companyId, "coB");
  assert.equal((await db.doc("invites/invB").get()).data().status, "accepted");
  assert.equal((await db.doc("invites/invA").get()).data().status, "pending", "the other invite is untouched");
});

test("callable: older link (no inviteId) with two pending invites is refused, login removed", async () => {
  await clearAll();
  await seedCompany("coA");
  await seedCompany("coB");
  await seedInvite("invA", "coA", "v2@x.co");
  await seedInvite("invB", "coB", "v2@x.co");
  const auth = await newLogin("v2@x.co");
  await assert.rejects(call({ name: "Val" }, auth), (e) => e.code === "failed-precondition" && /more than one invite/.test(e.message));
  assert.equal(await loginExists(auth.uid), false);
  assert.equal((await db.doc(`users/${auth.uid}`).get()).exists, false);
});

test("callable: older link with one pending invite still works (live website payload)", async () => {
  await clearAll();
  await seedCompany("coA");
  await seedInvite("invA", "coA", "v3@x.co", { role: "supervisor" });
  const auth = await newLogin("v3@x.co");
  const r = await call({ name: "Val" }, auth);
  assert.deepEqual(r, { companyId: "coA", role: "supervisor" });
});

test("callable: a link for someone else's invite, or a used one, is refused", async () => {
  await clearAll();
  await seedCompany("coA");
  await seedInvite("invOther", "coA", "other4@x.co");
  await seedInvite("invUsed", "coA", "v4@x.co", { status: "accepted" });
  const a1 = await newLogin("v4@x.co");
  await assert.rejects(call({ name: "Val", inviteId: "invOther" }, a1), (e) => e.code === "not-found");
  assert.equal(await loginExists(a1.uid), false);
  const a2 = await newLogin("v4@x.co");
  await assert.rejects(call({ name: "Val", inviteId: "invUsed" }, a2), (e) => e.code === "failed-precondition" && /already been used/.test(e.message));
  const a3 = await newLogin("v4@x.co");
  await assert.rejects(call({ name: "Val", inviteId: "nope" }, a3), (e) => e.code === "not-found");
  assert.equal((await db.doc("invites/invOther").get()).data().status, "pending");
});

// prod-readiness item 6 A: a new company saves "Ask for job site each time"
// on, so the server's never-saved legacy rule (re-detect) can't apply to it.
test("createCompany saves appSettings.askJobSiteEachTime: true", async () => {
  const uid = "owner-" + Date.now();
  await admin.auth().createUser({ uid, email: uid + "@x.co", password: "secret123" });
  const { companyId } = await funcs.createCompany.run({
    data: { companyName: "New Co", name: "Owner", agreedToTerms: true, termsVersion: "v1" },
    auth: { uid, token: { email: uid + "@x.co" } },
    rawRequest: {},
  });
  const company = (await db.collection("companies").doc(companyId).get()).data();
  assert.deepEqual(company.appSettings, { askJobSiteEachTime: true });
});
