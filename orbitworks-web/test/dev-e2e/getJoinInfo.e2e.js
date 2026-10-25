// DEV ONLY (orbitworks-dev-ew). Employee App Phase 2 Part C - getJoinInfo tests.
//
// Same setup as joinCompany.e2e.js: the dev test companies from devSetup.js
// (jc-test-pro-dev, jc-test-core-dev). Two ways in:
//   - runLocal(): functions/lib/getJoinInfo.js in this process, pointed at dev
//   - callFn():   the DEPLOYED getJoinInfo callable over HTTPS, no auth
// --local runs only the local half (before the function is deployed).
// Everything it creates is tagged with this run's id and removed at the end.
//
// Usage (PowerShell, from orbitworks-web):
//   npm --prefix functions run build
//   node test/dev-e2e/getJoinInfo.e2e.js --local     (before deploy)
//   node test/dev-e2e/getJoinInfo.e2e.js             (after deploy)
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const LOCAL_ONLY = process.argv.includes("--local");
const WEB = path.resolve(__dirname, "..", "..");
const FN = path.join(WEB, "functions");
const webRequire = require("module").createRequire(path.join(WEB, "package.json"));
const fnRequire = require("module").createRequire(path.join(FN, "package.json"));
const env = webRequire("dotenv").parse(fs.readFileSync(path.join(WEB, ".env.local")));
const webEnv = webRequire("dotenv").parse(fs.readFileSync(path.join(WEB, ".env.development.local")));
const PROJECT = "orbitworks-dev-ew";
if (env.FIREBASE_ADMIN_PROJECT_ID !== PROJECT || webEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== PROJECT) throw new Error("not dev - refusing to run");

const admin = fnRequire("firebase-admin");
const origInit = admin.initializeApp.bind(admin);
admin.initializeApp = (opts, name) =>
  origInit(
    {
      credential: admin.credential.cert({
        projectId: PROJECT,
        clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
      projectId: PROJECT,
      storageBucket: webEnv.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      ...(opts || {}),
    },
    name
  );
const gji = require(path.join(FN, "lib", "getJoinInfo.js"));
const { CONSENT_VERSIONS } = require(path.join(FN, "lib", "consentVersions.js"));
const { MIN_SIGNUP_AGE } = require(path.join(FN, "lib", "joinCompanyValidators.js"));
const { HttpsError } = fnRequire("firebase-functions/v2/https");

const db = admin.firestore();
const { FieldValue, Timestamp } = admin.firestore;

const PRO = "jc-test-pro-dev";
const CORE = "jc-test-core-dev";
const RUN = Date.now().toString(36);
const OFF_SUB = `sub-gji-off-${RUN}`;
const co = (id) => db.collection("companies").doc(id);

const results = [];
function check(name, cond, detail = "") {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? "OK    " : "FAILED"} ${name}${!cond && detail ? "  -> " + detail : ""}`);
}

const codes = [];
async function makeCode(companyId, o = {}) {
  const token = crypto.randomBytes(24).toString("base64url");
  const now = FieldValue.serverTimestamp();
  await db.collection("joinCodes").doc(token).create({
    codeId: crypto.randomUUID(),
    name: `GJI test ${RUN}`,
    companyId,
    siteId: companyId === PRO ? "site-north" : "site-core",
    subcontractorIds: [],
    locationRequired: false,
    userLimit: 10,
    expiresAt: null,
    joinedCount: 0,
    status: "active",
    createdByUid: "gji-test",
    createdAt: now,
    updatedAt: now,
    revokedAt: null,
    replacedByToken: null,
    gjiTestRun: RUN,
    ...o,
  });
  codes.push(token);
  return token;
}

async function runLocal(data, hooks) {
  try {
    return { ok: true, result: await gji.runGetJoinInfo(data, hooks) };
  } catch (e) {
    return { ok: false, error: e };
  }
}

async function callFn(data) {
  const r = await fetch(`https://us-central1-${PROJECT}.cloudfunctions.net/getJoinInfo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  });
  let j = null;
  try { j = await r.json(); } catch {}
  if (j && j.result !== undefined) return { ok: true, result: j.result, status: r.status };
  return { ok: false, status: r.status, error: j && j.error };
}

const ACTIVE_KEYS = ["biometricConsentText", "biometricConsentVersion", "companyName", "minSignupAge", "privacyPolicyVersion", "status", "subcontractors"].join();
const keysOf = (o) => Object.keys(o || {}).sort().join();
const isInactive = (r) => r.ok && JSON.stringify(r.result) === JSON.stringify({ status: "inactive" });

// Nothing in a response may name the company, the site, or carry a number
// other than minSignupAge.
function leaks(result) {
  const text = JSON.stringify(result);
  if (text.includes(PRO) || text.includes(CORE) || text.includes("site-north") || text.includes("site-core")) return "id in response";
  const numbers = [];
  JSON.stringify(result, (k, v) => {
    if (typeof v === "number" && k !== "minSignupAge") numbers.push(k);
    return v;
  });
  return numbers.length ? "numbers: " + numbers.join() : null;
}

async function both(label, data, expect) {
  const local = await runLocal(data);
  expect(`${label} (local)`, local);
  if (!LOCAL_ONLY) {
    const remote = await callFn(data);
    expect(`${label} (deployed)`, remote);
  }
}

const expectInactive = (label, r) => check(`${label} -> exactly { status: "inactive" }`, isInactive(r), JSON.stringify(r.ok ? r.result : r.error));

async function main() {
  await co(PRO).update({ planTier: "pro_tier1", employeeCap: 15, totalEmployeeCap: 20, subscriptionStatus: "active" });
  await co(CORE).update({ planTier: "core2_tier1" });
  await co(PRO).collection("subcontractors").doc(OFF_SUB).set({ name: "GJI Off Sub", active: false, createdAt: FieldValue.serverTimestamp() });

  // ---- Active code with subcontractors ----
  const live = await makeCode(PRO, { subcontractorIds: ["sub-bolt", "sub-acme", OFF_SUB, "sub-does-not-exist", "sub-acme"] });
  const joinedBefore = (await db.collection("joinCodes").doc(live).get()).get("joinedCount");
  await both("Active code", { token: live }, (label, r) => {
    const x = r.ok ? r.result : {};
    check(`${label} -> status active`, r.ok && x.status === "active", JSON.stringify(r.ok ? r.result : r.error));
    check(`${label} -> only the expected keys`, keysOf(x) === ACTIVE_KEYS, keysOf(x));
    check(`${label} -> company name`, x.companyName === "JC-Test Pro (dev)", x.companyName);
    check(
      `${label} -> subs: active listed ones only, { id, name }, sorted, no dupes`,
      JSON.stringify(x.subcontractors) === JSON.stringify([{ id: "sub-acme", name: "Acme Labor" }, { id: "sub-bolt", name: "Bolt Staffing" }]),
      JSON.stringify(x.subcontractors)
    );
    check(
      `${label} -> consent versions + text from consentVersions.ts`,
      x.privacyPolicyVersion === CONSENT_VERSIONS.privacyPolicyVersion &&
        x.biometricConsentVersion === CONSENT_VERSIONS.biometricConsentVersion &&
        x.biometricConsentText === CONSENT_VERSIONS.biometricConsentText
    );
    check(`${label} -> minSignupAge ${MIN_SIGNUP_AGE}`, x.minSignupAge === MIN_SIGNUP_AGE, String(x.minSignupAge));
    check(`${label} -> no ids, counts or caps leaked`, !leaks(x), leaks(x));
  });
  const joinedAfter = (await db.collection("joinCodes").doc(live).get()).get("joinedCount");
  check("getJoinInfo writes nothing (joinedCount unchanged)", joinedBefore === joinedAfter);

  // ---- In-house only code ----
  const inHouse = await makeCode(PRO, { subcontractorIds: [] });
  await both("In-house code", { token: inHouse }, (label, r) => {
    check(`${label} -> active, subcontractors []`, r.ok && r.result.status === "active" && Array.isArray(r.result.subcontractors) && r.result.subcontractors.length === 0, JSON.stringify(r.result));
  });

  // ---- Bad input -> inactive ----
  const badInputs = [
    ["Missing token", {}],
    ["Null body", null],
    ["Short token", { token: "abc" }],
    ["Token with bad chars", { token: "x".repeat(31) + "!" }],
    ["Token too long", { token: "a".repeat(129) }],
    ["Token not a string", { token: 12345 }],
  ];
  for (const [label, data] of badInputs) await both(label, data, expectInactive);

  // ---- Every dead code state -> the same inactive ----
  const unknown = crypto.randomBytes(24).toString("base64url");
  await both("Not found", { token: unknown }, expectInactive);
  await both("Revoked", { token: await makeCode(PRO, { status: "revoked", revokedAt: Timestamp.now() }) }, expectInactive);
  await both("Replaced", { token: await makeCode(PRO, { replacedByToken: "someOtherToken" }) }, expectInactive);
  await both("Expired", { token: await makeCode(PRO, { expiresAt: Timestamp.fromMillis(Date.now() - 60e3) }) }, expectInactive);
  await both("Code full (userLimit reached)", { token: await makeCode(PRO, { userLimit: 3, joinedCount: 3 }) }, expectInactive);
  await both("Company not Pro", { token: await makeCode(CORE) }, expectInactive);
  await both("Company missing", { token: await makeCode(`gji-missing-${RUN}`) }, expectInactive);

  const capCode = await makeCode(PRO);
  const countOf = async (q) => (await q.count().get()).data().count;
  await co(PRO).update({ employeeCap: await countOf(co(PRO).collection("employees").where("active", "==", true)) });
  await both("Active seat cap reached", { token: capCode }, expectInactive);
  await co(PRO).update({ employeeCap: 15, totalEmployeeCap: await countOf(co(PRO).collection("employees")) });
  await both("Total employee cap reached", { token: capCode }, expectInactive);
  await co(PRO).update({ totalEmployeeCap: 20, planTier: null });
  await both("Company plan cleared", { token: capCode }, expectInactive);
  await co(PRO).update({ planTier: "pro_tier1" });
  await both("Same code back to active after restore", { token: capCode }, (label, r) => check(`${label} -> active`, r.ok && r.result.status === "active"));

  // ---- Unexpected failure -> plain internal error, not inactive ----
  const failed = await runLocal({ token: live }, { beforeLookup: async () => { throw Object.assign(new Error("simulated firestore outage"), { code: 14 }); } });
  check("Lookup failure (local) -> throws, not inactive", !failed.ok);
  check("Lookup failure (local) -> HttpsError code internal", failed.error instanceof HttpsError && failed.error.code === "internal", failed.error && failed.error.code);
  check("Lookup failure (local) -> no reason in details", failed.error && failed.error.details === undefined, JSON.stringify(failed.error && failed.error.details));
  check("Lookup failure (local) -> message has no internals", failed.error && !/firestore|outage|14/i.test(failed.error.message), failed.error && failed.error.message);

  if (!LOCAL_ONLY) {
    const r = await callFn({ token: live });
    check("Deployed: works with no auth header", r.ok && r.status === 200 && r.result.status === "active", JSON.stringify(r));
  }
}

async function cleanup() {
  for (const t of codes) await db.collection("joinCodes").doc(t).delete();
  await co(PRO).collection("subcontractors").doc(OFF_SUB).delete();
  await co(PRO).update({ planTier: "pro_tier1", employeeCap: 15, totalEmployeeCap: 20, subscriptionStatus: "active" });
  await co(CORE).update({ planTier: "core2_tier1" });
}

(async () => {
  let crashed = null;
  try {
    await main();
  } catch (e) {
    crashed = e;
    console.error("ERR", e.message);
  }
  try {
    await cleanup();
    console.log("cleanup OK");
  } catch (e) {
    console.error("cleanup FAILED", e.message);
  }
  const failedCount = results.filter((x) => !x.ok).length;
  console.log(`\nAPI getJoinInfo${LOCAL_ONLY ? " (local only)" : ""}: ${results.length - failedCount}/${results.length} passed${crashed ? " (stopped early)" : ""}`);
  process.exit(failedCount || crashed ? 1 : 0);
})();
