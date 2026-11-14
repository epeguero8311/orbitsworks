// prod-readiness item 8 A: rate limits on the public sign-up callables
// (functions/src/lib/publicRateLimit.ts). Part 1: pure window maths and IP
// parsing. Part 2: the counters and the REAL compiled callables on the
// Firestore emulator. Limits are reached by seeding the counter doc, so no
// test makes dozens of calls.
//
// Run: firebase emulators:exec --only firestore,auth,storage "node --test test/publicRateLimit.test.js"
process.env.GCLOUD_PROJECT = "orbitworks-ratelimit-test";
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8090";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9199";
process.env.REKOGNITION_ACCESS_KEY_ID = "test-access-key";
process.env.REKOGNITION_SECRET_ACCESS_KEY = "test-secret-key";
process.env.MAPBOX_TOKEN = "";
process.env.ALERTS_FEED_ENABLED = "false";
process.env.DEVICE_TRACKING_ENABLED = "false";
process.env.PUSH_NOTIFICATIONS_ENABLED = "false";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");

const { db } = require("../lib/shared.js");
const funcs = require("../lib/index.js");
const rl = require("../lib/lib/publicRateLimit.js");

const limitDoc = (kind, value) =>
  db.collection("publicRateLimits").doc(createHash("sha256").update(`${kind}:${value}`, "utf8").digest("hex"));
async function fill(kind, value, count = rl.PUBLIC_LIMITS[kind].max) {
  await limitDoc(kind, value).set({ kind, count, windowStartMs: Date.now() });
}
const reasonIs = (reason) => (err) => err?.details?.reason === reason && err.code === "resource-exhausted";

// ---------- Part 1: pure ----------

test("limits: sized for a crew on one jobsite Wi-Fi", () => {
  assert.deepEqual(rl.PUBLIC_LIMITS, {
    ipInfo: { max: 60, windowMs: 600000 },
    ipSignup: { max: 30, windowMs: 600000 },
    codeSignup: { max: 30, windowMs: 3600000 },
    inviteAttempt: { max: 10, windowMs: 3600000 },
  });
});

test("nextWindow: keeps the count inside the window, starts over after it", () => {
  assert.deepEqual(rl.nextWindow(undefined, 1000, 600), { count: 0, windowStartMs: 1000 });
  assert.deepEqual(rl.nextWindow({ count: 5, windowStartMs: 1000 }, 1500, 600), { count: 5, windowStartMs: 1000 });
  assert.deepEqual(rl.nextWindow({ count: 5, windowStartMs: 1000 }, 1600, 600), { count: 0, windowStartMs: 1600 });
  assert.deepEqual(rl.nextWindow({ count: 5, windowStartMs: 9999 }, 1600, 600), { count: 0, windowStartMs: 1600 }, "future start = reset");
  assert.deepEqual(rl.nextWindow({ count: "x", windowStartMs: "y" }, 1600, 600), { count: 0, windowStartMs: 1600 });
});

test("clientIp: rawRequest.ip, else the first X-Forwarded-For hop, else null", () => {
  assert.equal(rl.clientIp({ ip: "203.0.113.5" }), "203.0.113.5");
  assert.equal(rl.clientIp({ headers: { "x-forwarded-for": "198.51.100.7, 10.0.0.1" } }), "198.51.100.7");
  assert.equal(rl.clientIp({}), null);
  assert.equal(rl.clientIp(undefined), null);
  assert.equal(rl.clientIp({ ip: "x".repeat(101) }), null);
});

// ---------- Part 2: emulator ----------

test("hitRateLimit: allows up to max, then refuses; other values unaffected; window resets", async () => {
  await fill("inviteAttempt", "tok-a", 9);
  const t0 = Date.now();
  assert.equal(await rl.hitRateLimit("inviteAttempt", "tok-a", t0), true, "10th attempt allowed");
  assert.equal(await rl.hitRateLimit("inviteAttempt", "tok-a", t0), false, "11th refused");
  assert.equal(await rl.hitRateLimit("inviteAttempt", "tok-b", t0), true, "another invite is separate");
  assert.equal(await rl.hitRateLimit("inviteAttempt", "tok-a", t0 + 3600000), true, "next hour");
});

test("underRateLimit checks without counting; countRateLimit counts without checking", async () => {
  await fill("codeSignup", "code-x", 29);
  assert.equal(await rl.underRateLimit("codeSignup", "code-x"), true);
  assert.equal(await rl.underRateLimit("codeSignup", "code-x"), true, "a check alone never uses it up");
  await rl.countRateLimit("codeSignup", "code-x");
  assert.equal(await rl.underRateLimit("codeSignup", "code-x"), false);
});

test("no readable IP or token is stored - only a hash id", async () => {
  await rl.hitRateLimit("ipInfo", "203.0.113.99");
  const docs = (await db.collection("publicRateLimits").get()).docs;
  for (const d of docs) {
    assert.ok(!JSON.stringify(d.data()).includes("203.0.113.99"));
    assert.match(d.id, /^[0-9a-f]{64}$/);
  }
});

test("getJoinInfo / getInviteInfo: refused per network at the limit; unknown IP never limited", async () => {
  const ip = "198.51.100.20";
  await fill("ipInfo", ip);
  for (const fn of ["getJoinInfo", "getInviteInfo"]) {
    await assert.rejects(funcs[fn].run({ data: { token: "whatever" }, rawRequest: { ip } }), reasonIs("tooMany"), fn);
    // No IP: goes on to the normal lookup (any answer but tooMany).
    await funcs[fn].run({ data: { token: "whatever" }, rawRequest: {} }).then(
      () => {},
      (err) => assert.notEqual(err?.details?.reason, "tooMany", fn)
    );
  }
});

test("joinCompany: refused per network, and per crew code once it has 30 sign-ups this hour", async () => {
  await fill("ipSignup", "198.51.100.30");
  await assert.rejects(funcs.joinCompany.run({ data: { token: "code-1" }, rawRequest: { ip: "198.51.100.30" } }), reasonIs("tooMany"));
  await fill("codeSignup", "code-full");
  await assert.rejects(funcs.joinCompany.run({ data: { token: "code-full" }, rawRequest: { ip: "198.51.100.31" } }), reasonIs("tooMany"));
  // Under the limits: the normal validation answers (bad input here).
  await assert.rejects(
    funcs.joinCompany.run({ data: { token: "code-ok" }, rawRequest: { ip: "198.51.100.32" } }),
    (err) => err?.details?.reason !== "tooMany"
  );
});

test("acceptEmployeeInvite: refused per network, and after 10 attempts on one invite link", async () => {
  await fill("ipSignup", "198.51.100.40");
  await assert.rejects(funcs.acceptEmployeeInvite.run({ data: { token: "inv-1" }, rawRequest: { ip: "198.51.100.40" } }), reasonIs("tooMany"));
  await fill("inviteAttempt", "inv-full");
  await assert.rejects(funcs.acceptEmployeeInvite.run({ data: { token: "inv-full" }, rawRequest: { ip: "198.51.100.41" } }), reasonIs("tooMany"));
});
