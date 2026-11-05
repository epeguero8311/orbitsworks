// Phase 10 fix round 1 (W1) - temp clock-in link list calls
// (functions/src/tempClockLinks.ts) through the REAL compiled functions (lib/)
// on the Firestore emulator: the active list only reads unexpired links, the
// history comes 10 at a time with "load older", generate + revoke still work.
//
// Run: firebase emulators:exec --only firestore "node --test test/tempClockLinks.test.js"
process.env.GCLOUD_PROJECT = "orbitworks-templinks-test";
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8090";
process.env.REKOGNITION_ACCESS_KEY_ID = "test-access-key";
process.env.REKOGNITION_SECRET_ACCESS_KEY = "test-secret-key";
process.env.MAPBOX_TOKEN = "";
process.env.ALERTS_FEED_ENABLED = "false";
process.env.DEVICE_TRACKING_ENABLED = "false";
process.env.PUSH_NOTIFICATIONS_ENABLED = "false";

const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");

const { db } = require("../lib/shared.js");
const funcs = require("../lib/index.js");

const MIN = 60 * 1000;
const adminAuth = (c, role = "admin") => ({ uid: "admin-" + c, token: { role, companyId: c } });
const call = (fn, c, data = {}, auth = adminAuth(c)) => funcs[fn].run({ data, auth, rawRequest: {} });

// 32-char base64url token, unique per company + n.
function tokenFor(c, n) {
  return (c + "-" + String(n).padStart(4, "0") + "_".repeat(32)).replace(/[^A-Za-z0-9_-]/g, "x").slice(0, 32);
}

async function seedCompany(c) {
  await db.doc(`companies/${c}`).set({ name: "Co " + c, planTier: "pro_tier1" });
  await db.doc(`companies/${c}/jobSites/site1`).set({ name: "Site 1", active: true });
  await db.doc(`users/admin-${c}`).set({ name: "Ada", companyId: c, role: "admin" });
}

async function seedLink(c, n, { createdAgoMs = n * MIN, expiresInMs = 10 * MIN, revoked = false } = {}) {
  const now = Date.now();
  const token = tokenFor(c, n);
  await db.doc(`tempClockLinks/${token}`).set({
    companyId: c,
    siteId: "site1",
    siteName: "Site 1",
    createdByUid: "admin-" + c,
    createdByName: "Ada",
    createdAt: admin.firestore.Timestamp.fromMillis(now - createdAgoMs),
    expiresAt: admin.firestore.Timestamp.fromMillis(now + expiresInMs),
    durationMinutes: 10,
    revoked,
    wrongAttemptCount: 0,
  });
  return token;
}

test("active list: only unrevoked links that haven't expired, newest expiry first", async () => {
  const c = "tl-active";
  await seedCompany(c);
  const live1 = await seedLink(c, 1, { expiresInMs: 5 * MIN });
  const live2 = await seedLink(c, 2, { expiresInMs: 50 * MIN });
  await seedLink(c, 3, { expiresInMs: -1 * MIN });
  await seedLink(c, 4, { expiresInMs: -60 * 24 * MIN });
  await seedLink(c, 5, { expiresInMs: 5 * MIN, revoked: true });
  const { links } = await call("listActiveTempClockLinks", c);
  assert.deepEqual(links.map((l) => l.token), [live2, live1]);
  assert.equal(links[0].siteName, "Site 1");
  assert.equal(typeof links[0].expiresAt, "number");
});

test("history: 10 newest first, then the next page after the last token, then no more", async () => {
  const c = "tl-history";
  await seedCompany(c);
  const tokens = [];
  for (let n = 1; n <= 12; n++) tokens.push(await seedLink(c, n, { expiresInMs: -MIN, revoked: n % 3 === 0 }));
  const first = await call("listTempClockLinkHistory", c);
  assert.equal(first.links.length, 10);
  assert.deepEqual(first.links.map((l) => l.token), tokens.slice(0, 10), "newest (smallest age) first");
  assert.equal(first.nextAfterToken, tokens[9]);
  assert.equal(first.links[2].revoked, true);
  const second = await call("listTempClockLinkHistory", c, { afterToken: first.nextAfterToken });
  assert.deepEqual(second.links.map((l) => l.token), tokens.slice(10));
  assert.equal(second.nextAfterToken, null);
});

test("history: exactly 10 links = one page, no 'load older'", async () => {
  const c = "tl-ten";
  await seedCompany(c);
  for (let n = 1; n <= 10; n++) await seedLink(c, n);
  const page = await call("listTempClockLinkHistory", c);
  assert.equal(page.links.length, 10);
  assert.equal(page.nextAfterToken, null);
  const empty = await call("listTempClockLinkHistory", "tl-none-" + Date.now(), {}, adminAuth("tl-none"));
  assert.deepEqual(empty, { links: [], nextAfterToken: null });
});

test("history + active never show another company's links; another company's token is refused", async () => {
  const a = "tl-co-a";
  const b = "tl-co-b";
  await seedCompany(a);
  await seedCompany(b);
  await seedLink(a, 1);
  const bToken = await seedLink(b, 1);
  assert.deepEqual((await call("listTempClockLinkHistory", a)).links.map((l) => l.token), [tokenFor(a, 1)]);
  assert.deepEqual((await call("listActiveTempClockLinks", a)).links.map((l) => l.token), [tokenFor(a, 1)]);
  await assert.rejects(call("listTempClockLinkHistory", a, { afterToken: bToken }), (e) => e.code === "not-found");
  await assert.rejects(call("listTempClockLinkHistory", a, { afterToken: tokenFor(a, 99) }), (e) => e.code === "not-found");
});

test("list calls: admin/owner only, bad input refused", async () => {
  const c = "tl-auth";
  await seedCompany(c);
  assert.ok(await call("listTempClockLinkHistory", c, {}, adminAuth(c, "owner")));
  for (const fn of ["listTempClockLinkHistory", "listActiveTempClockLinks"]) {
    await assert.rejects(call(fn, c, {}, adminAuth(c, "supervisor")), (e) => e.code === "permission-denied");
    await assert.rejects(call(fn, c, {}, adminAuth(c, "employee")), (e) => e.code === "permission-denied");
    await assert.rejects(call(fn, c, {}, null), (e) => e.code === "unauthenticated");
    await assert.rejects(call(fn, c, { companyId: "other" }), (e) => e.code === "invalid-argument");
  }
  await assert.rejects(call("listTempClockLinkHistory", c, { afterToken: "short" }), (e) => e.code === "invalid-argument");
});

test("generate then revoke: shows in active + history, then leaves active only", async () => {
  const c = "tl-generate";
  await seedCompany(c);
  const made = await call("generateTempClockLink", c, { siteId: "site1", durationMinutes: 30 });
  assert.equal(made.token.length, 32);
  assert.deepEqual((await call("listActiveTempClockLinks", c)).links.map((l) => l.token), [made.token]);
  const history = await call("listTempClockLinkHistory", c);
  assert.equal(history.links[0].token, made.token);
  assert.equal(history.links[0].durationMinutes, 30);
  await call("revokeTempClockLink", c, { token: made.token });
  assert.deepEqual((await call("listActiveTempClockLinks", c)).links, []);
  assert.equal((await call("listTempClockLinkHistory", c)).links[0].revoked, true);
});
