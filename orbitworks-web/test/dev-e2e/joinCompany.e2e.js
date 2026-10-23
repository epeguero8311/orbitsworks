// DEV ONLY (orbitworks-dev-ew). Employee App Phase 2 - joinCompany API tests.
//
// Runs against the real dev project and the dev test companies
// (jc-test-pro-dev, jc-test-core-dev - see devSetup.js). Two ways in:
//   - callFn(): the DEPLOYED joinCompany callable over HTTPS (what the app hits)
//   - runLocal(): functions/lib/joinCompany.js in this process, pointed at dev,
//     only for the forced-failure and barrier race tests (test hooks are never
//     reachable through the deployed callable).
// Everything it creates is tagged with this run's id and removed at the end.
//
// Usage (PowerShell, from orbitworks-web):
//   npm --prefix functions run build
//   node test/dev-e2e/joinCompany.e2e.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const WEB = path.resolve(__dirname, "..", "..");
const FN = path.join(WEB, "functions");
const webRequire = require("module").createRequire(path.join(WEB, "package.json"));
const fnRequire = require("module").createRequire(path.join(FN, "package.json"));
const env = webRequire("dotenv").parse(fs.readFileSync(path.join(WEB, ".env.local")));
const webEnv = webRequire("dotenv").parse(fs.readFileSync(path.join(WEB, ".env.development.local")));
const PROJECT = "orbitworks-dev-ew";
if (env.FIREBASE_ADMIN_PROJECT_ID !== PROJECT || webEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== PROJECT) throw new Error("not dev - refusing to run");

// Point the functions package's default Admin app at dev before it loads.
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
const jc = require(path.join(FN, "lib", "joinCompany.js"));
const { CONSENT_VERSIONS } = require(path.join(FN, "lib", "consentVersions.js"));
const { MIN_SIGNUP_AGE } = require(path.join(FN, "lib", "joinCompanyValidators.js"));
const sharp = webRequire("sharp");
const creds = JSON.parse(fs.readFileSync(path.join(__dirname, "creds.json"), "utf8"));

const db = admin.firestore();
const auth = admin.auth();
const bucket = admin.storage().bucket();
const { FieldValue, Timestamp } = admin.firestore;
const E = jc.JOIN_ERRORS;

const PRO = "jc-test-pro-dev";
const CORE = "jc-test-core-dev";
const RUN = Date.now().toString(36);
const PASSWORD = "Jc-" + crypto.randomBytes(9).toString("base64url");
const co = (id) => db.collection("companies").doc(id);
const emp = (c, id) => co(c).collection("employees").doc(id);
const email = (tag) => `jc-join-${RUN}-${tag}@orbitworks-dev-test.invalid`;
const nameFor = (tag) => `JC Join ${RUN} ${tag}`;

const results = [];
function check(name, cond, detail = "") {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? "OK    " : "FAILED"} ${name}${!cond && detail ? "  -> " + detail : ""}`);
}

// Secrets this run used - written to a temp file only so the log scan can
// look for them, never printed.
const secrets = { run: RUN, password: PASSWORD, tokens: [], pins: [], emails: [] };
const codes = [];
let selfieB64;

async function makeSelfie() {
  const w = 320, h = 320;
  const raw = crypto.randomBytes(w * h * 3);
  const buf = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 85 }).toBuffer();
  return buf.toString("base64");
}

async function makeCode(companyId, o = {}) {
  const token = crypto.randomBytes(24).toString("base64url");
  const now = FieldValue.serverTimestamp();
  await db.collection("joinCodes").doc(token).create({
    codeId: crypto.randomUUID(),
    name: `JC join test ${RUN}`,
    companyId,
    siteId: companyId === PRO ? "site-north" : "site-core",
    subcontractorIds: companyId === PRO ? ["sub-acme"] : [],
    locationRequired: false,
    userLimit: 10,
    expiresAt: null,
    joinedCount: 0,
    status: "active",
    createdByUid: "jc-join-test",
    createdAt: now,
    updatedAt: now,
    revokedAt: null,
    replacedByToken: null,
    jcJoinTestRun: RUN,
    ...o,
  });
  codes.push(token);
  secrets.tokens.push(token);
  return token;
}

function body(token, tag, o = {}) {
  secrets.emails.push(email(tag));
  return {
    token,
    fullName: nameFor(tag),
    email: email(tag),
    password: PASSWORD,
    privacyAccepted: true,
    privacyVersion: CONSENT_VERSIONS.privacyPolicyVersion,
    biometricConsentAccepted: true,
    biometricConsentVersion: CONSENT_VERSIONS.biometricConsentVersion,
    birthday: "1995-06-15",
    subcontractorId: null,
    selfieBase64: selfieB64,
    ...o,
  };
}

async function callFn(name, data, idToken) {
  const headers = { "Content-Type": "application/json" };
  if (idToken) headers.Authorization = "Bearer " + idToken;
  const r = await fetch(`https://us-central1-${PROJECT}.cloudfunctions.net/${name}`, { method: "POST", headers, body: JSON.stringify({ data }) });
  let j = null;
  try { j = await r.json(); } catch {}
  if (j && j.result !== undefined) {
    if (j.result && j.result.pin) secrets.pins.push(j.result.pin);
    return { ok: true, result: j.result };
  }
  return { ok: false, status: r.status, message: j && j.error && j.error.message, reason: j && j.error && j.error.details && j.error.details.reason };
}

async function runLocal(data, hooks) {
  try {
    const result = await jc.runJoinCompany(data, hooks);
    secrets.pins.push(result.pin);
    return { ok: true, result };
  } catch (e) {
    return { ok: false, message: e.message, reason: e.details && e.details.reason };
  }
}

async function signIn(mail, password) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${webEnv.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: mail, password, returnSecureToken: true }),
  });
  const j = await r.json();
  return j.idToken || null;
}
const claimsOf = (idToken) => JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString());

async function userExists(mail) {
  try { await auth.getUserByEmail(mail); return true; } catch { return false; }
}
const countOf = async (q) => (await q.count().get()).data().count;
const liveActive = (c) => countOf(co(c).collection("employees").where("active", "==", true));
const liveTotal = (c) => countOf(co(c).collection("employees"));

// Everything a sign-up could leave behind, for before/after compares.
async function snapshot(token) {
  const [employees, pins, consents, users, files, code] = await Promise.all([
    liveTotal(PRO),
    countOf(co(PRO).collection("pins")),
    countOf(co(PRO).collection("employeeConsents")),
    countOf(db.collection("users").where("companyId", "==", PRO)),
    bucket.getFiles({ prefix: `companies/${PRO}/employees/` }).then(([f]) => f.length),
    token ? db.collection("joinCodes").doc(token).get() : null,
  ]);
  return { employees, pins, consents, users, files, joined: code && code.exists ? code.get("joinedCount") : null };
}
const same = (a, b, keys) => keys.every((k) => a[k] === b[k]);
const LEFTOVER_KEYS = ["employees", "pins", "consents", "users", "files", "joined"];

async function expectError(label, token, tag, overrides, reason, message) {
  const before = await snapshot(token);
  const r = await callFn("joinCompany", body(token, tag, overrides));
  const after = await snapshot(token);
  const msgOk = message === undefined || r.message === message || (message instanceof RegExp && message.test(r.message || ""));
  check(`${label} -> ${reason} error`, !r.ok && r.reason === reason && msgOk, JSON.stringify(r));
  check(`${label} -> nothing created`, !(await userExists(email(tag))) && same(before, after, LEFTOVER_KEYS), JSON.stringify({ before, after }));
}

const isoYearsAgo = (years, dayShift = 0) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() + dayShift);
  return d.toISOString().slice(0, 10);
};

async function main() {
  selfieB64 = await makeSelfie();
  await co(PRO).update({ planTier: "pro_tier1", employeeCap: 15, totalEmployeeCap: 20, subscriptionStatus: "active" });
  await co(CORE).update({ planTier: "core2_tier1" });
  await co(PRO).collection("subcontractors").doc("sub-jc-inactive").set({ name: "Inactive Sub", active: false, createdAt: FieldValue.serverTimestamp() });

  // ---------------- Happy path (deployed callable) ----------------
  const t1 = await makeCode(PRO);
  const before1 = await snapshot(t1);
  const codeId1 = (await db.collection("joinCodes").doc(t1).get()).get("codeId");
  const r1 = await callFn("joinCompany", body(t1, "happy", { subcontractorId: "sub-acme" }));
  check("Happy path -> success", r1.ok, JSON.stringify(r1));
  if (!r1.ok) throw new Error("happy path failed - stopping");
  const { employeeId, pin, companyName } = r1.result;
  check("Response has employeeId, 4-digit PIN, company name", !!employeeId && /^\d{4}$/.test(pin) && companyName === "JC-Test Pro (dev)");
  const user = await auth.getUserByEmail(email("happy"));
  check("Auth user created", !!user && user.email === email("happy"));
  check("Custom claims: role employee, companyId, employeeId", user.customClaims && user.customClaims.role === "employee" && user.customClaims.companyId === PRO && user.customClaims.employeeId === employeeId, JSON.stringify(user.customClaims));
  const e1 = (await emp(PRO, employeeId).get()).data();
  check("Employee doc: name, dob, active, not_enrolled", e1.name === nameFor("happy") && e1.dob === "1995-06-15" && e1.active === true && e1.faceStatus === "not_enrolled");
  check("Employee doc: appAccess, joinedVia qr, joinCodeId = codeId", e1.appAccess === true && e1.joinedVia === "qr" && e1.joinCodeId === codeId1);
  check("Employee doc: site from the code, subcontractor + name", e1.assignedSiteIds.length === 1 && e1.assignedSiteIds[0] === "site-north" && e1.subcontractorId === "sub-acme" && e1.subcontractorName === "Acme Labor");
  check("Employee doc linked to the login", e1.linkedUserId === user.uid && e1.email === email("happy"));
  check("Employee doc: no duplicate flag", e1.possibleDuplicateOf === undefined);
  check("Token not stored on the employee doc", !JSON.stringify(e1).includes(t1));
  const pinDoc = await co(PRO).collection("pins").doc(pin).get();
  check("PIN matches the doc and is reserved for this employee", e1.pin === pin && pinDoc.get("employeeId") === employeeId);
  const u1 = (await db.collection("users").doc(user.uid).get()).data();
  check("users doc: role employee, company, sites", u1 && u1.role === "employee" && u1.companyId === PRO && u1.assignedSiteIds[0] === "site-north");
  const c1 = (await co(PRO).collection("employeeConsents").doc(employeeId).get()).data();
  check("Consent record: uid, employeeId, joinCodeId, both versions, timestamps", c1 && c1.uid === user.uid && c1.employeeId === employeeId && c1.joinCodeId === codeId1 && c1.privacyPolicyVersion === CONSENT_VERSIONS.privacyPolicyVersion && c1.biometricConsentVersion === CONSENT_VERSIONS.biometricConsentVersion && !!c1.privacyAcceptedAt && !!c1.biometricConsentAt && c1.faceDataDeletedAt === null);
  const c1json = JSON.stringify(c1);
  check("Consent record holds no face data, token, email or name", !c1json.includes(t1) && !c1json.includes("@") && !c1json.includes(RUN) && !("photoUrl" in c1));
  const refPath = `companies/${PRO}/employees/${employeeId}/reference.jpg`;
  const selfiePath = `companies/${PRO}/employees/${employeeId}/selfie/signup.jpg`;
  const [refExists] = await bucket.file(refPath).exists();
  const [selfieExists] = await bucket.file(selfiePath).exists();
  check("reference.jpg and selfie/signup.jpg exist", refExists && selfieExists);
  const [refMeta] = await bucket.file(refPath).getMetadata();
  check("Consent record written BEFORE reference.jpg", c1.biometricConsentAt.toMillis() <= Date.parse(refMeta.timeCreated), `${c1.biometricConsentAt.toDate().toISOString()} vs ${refMeta.timeCreated}`);
  check("photoUrl points at reference.jpg with a download token", typeof e1.photoUrl === "string" && e1.photoUrl.includes(encodeURIComponent(refPath)) && /token=[0-9a-f-]{36}/.test(e1.photoUrl));
  const [refBytes] = await bucket.file(refPath).download();
  check("reference.jpg is the signup selfie (server copy)", refBytes.equals(Buffer.from(selfieB64, "base64")));
  const after1 = await snapshot(t1);
  check("joinedCount bumped by 1", after1.joined === before1.joined + 1);
  const idTok = await signIn(email("happy"), PASSWORD);
  check("New employee signs in with email + password; token has role employee", !!idTok && claimsOf(idTok).role === "employee" && claimsOf(idTok).employeeId === employeeId);

  // ---------------- Code / plan / seat errors (deployed) ----------------
  const past = Timestamp.fromMillis(Date.now() - 3600e3);
  await expectError("Revoked code", await makeCode(PRO, { status: "revoked", revokedAt: past }), "revoked", {}, "inactive", E.inactive);
  await expectError("Regenerated-away code", await makeCode(PRO, { replacedByToken: "x".repeat(32) }), "replaced", {}, "inactive", E.inactive);
  await expectError("Expired code", await makeCode(PRO, { expiresAt: past }), "expired", {}, "inactive", E.inactive);
  await expectError("Unknown token", crypto.randomBytes(24).toString("base64url"), "unknown", {}, "inactive", E.inactive);
  await expectError("Malformed token", "abc", "malformed", {}, "inactive", E.inactive);
  await expectError("Full code (joined = user limit)", await makeCode(PRO, { userLimit: 2, joinedCount: 2 }), "full", {}, "accountProblem", E.accountProblem);

  const tSeats = await makeCode(PRO);
  await co(PRO).update({ employeeCap: await liveActive(PRO) });
  await expectError("No seats left", tSeats, "noseats", {}, "accountProblem", E.accountProblem);
  await co(PRO).update({ employeeCap: 15 });

  const tTotal = await makeCode(PRO);
  await co(PRO).update({ totalEmployeeCap: await liveTotal(PRO) });
  await expectError("Total employee record cap reached", tTotal, "totalcap", {}, "accountProblem", E.accountProblem);
  await co(PRO).update({ totalEmployeeCap: 20 });

  await expectError("Core company", await makeCode(CORE), "core", {}, "accountProblem", E.accountProblem);
  await expectError("Subcontractor not on the code", await makeCode(PRO), "badsub", { subcontractorId: "sub-bolt" }, "subcontractor", E.subcontractor);
  await expectError("In-house-only code + a subcontractor", await makeCode(PRO, { subcontractorIds: [] }), "inhouse", { subcontractorId: "sub-acme" }, "subcontractor", E.subcontractor);
  await expectError("Inactive subcontractor on the code", await makeCode(PRO, { subcontractorIds: ["sub-jc-inactive"] }), "inactivesub", { subcontractorId: "sub-jc-inactive" }, "subcontractor", E.subcontractor);

  // ---------------- Input validation (deployed) ----------------
  const tv = await makeCode(PRO);
  await expectError("Privacy policy not accepted", tv, "noprivacy", { privacyAccepted: false }, "invalid", "You must accept the Privacy Policy.");
  await expectError("Biometric consent not accepted", tv, "nobio", { biometricConsentAccepted: false }, "invalid", "You must agree to the face check consent.");
  await expectError("Old consent version", tv, "oldver", { biometricConsentVersion: "old-v0" }, "consentVersion", E.consentVersion);
  await expectError(`Under ${MIN_SIGNUP_AGE} (turns ${MIN_SIGNUP_AGE} tomorrow)`, tv, "young", { birthday: isoYearsAgo(MIN_SIGNUP_AGE, 1) }, "invalid", `You must be at least ${MIN_SIGNUP_AGE} to sign up.`);
  await expectError("Future birthday", tv, "future", { birthday: isoYearsAgo(-1) }, "invalid", "Enter a real date of birth.");
  await expectError("Impossible birthday (Feb 30)", tv, "feb30", { birthday: "2001-02-30" }, "invalid", "Enter a real date of birth.");
  await expectError("Not a JPEG selfie", tv, "png", { selfieBase64: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), crypto.randomBytes(8000)]).toString("base64") }, "photo", E.photo);
  await expectError("Short password", tv, "shortpw", { password: "short" }, "invalid", "Password must be at least 8 characters.");
  const r16 = await callFn("joinCompany", body(tv, "exactly16", { birthday: isoYearsAgo(MIN_SIGNUP_AGE) }));
  check(`Exactly ${MIN_SIGNUP_AGE} today -> allowed`, r16.ok, JSON.stringify(r16));

  // ---------------- past_due counts as Pro ----------------
  await co(PRO).update({ subscriptionStatus: "past_due" });
  const rPd = await callFn("joinCompany", body(await makeCode(PRO), "pastdue"));
  check("past_due company counts as Pro -> sign-up allowed", rPd.ok, JSON.stringify(rPd));
  await co(PRO).update({ subscriptionStatus: "active" });

  // ---------------- Duplicate email ----------------
  const tDup = await makeCode(PRO);
  for (const [label, mail] of [["existing admin login", creds["jc-pro-admin"].email], ["earlier QR sign-up", email("happy")]]) {
    const before = await snapshot(tDup);
    const adminBefore = await auth.getUserByEmail(creds["jc-pro-admin"].email);
    const r = await callFn("joinCompany", { ...body(tDup, "dupmail"), email: mail });
    const after = await snapshot(tDup);
    check(`Duplicate email (${label}) -> email-in-use error`, !r.ok && r.reason === "emailInUse" && r.message === E.emailInUse, JSON.stringify(r));
    check(`Duplicate email (${label}) -> nothing left behind`, same(before, after, LEFTOVER_KEYS), JSON.stringify({ before, after }));
    const adminAfter = await auth.getUserByEmail(creds["jc-pro-admin"].email);
    check(`Duplicate email (${label}) -> existing login untouched`, adminAfter.customClaims.role === "admin" && adminAfter.uid === adminBefore.uid);
  }

  // ---------------- Forced failure at every step -> full rollback (in-process) ----------------
  for (const step of ["authUser", "pin", "transaction", "link", "selfie", "reference", "photoUrl"]) {
    const t = await makeCode(PRO);
    const before = await snapshot(t);
    const tag = "fail-" + step.toLowerCase();
    const r = await runLocal(body(t, tag), { failAt: step });
    const after = await snapshot(t);
    check(`Forced failure after ${step} -> generic error`, !r.ok && r.reason === "generic" && r.message === E.generic, JSON.stringify(r));
    check(`Forced failure after ${step} -> Auth user deleted`, !(await userExists(email(tag))));
    const usersDoc = await db.collection("users").where("email", "==", email(tag)).get();
    const empDoc = await co(PRO).collection("employees").where("name", "==", nameFor(tag)).get();
    check(`Forced failure after ${step} -> no employee/users doc, PIN released, no files, joinedCount back`, usersDoc.empty && empDoc.empty && same(before, after, ["employees", "pins", "users", "files", "joined"]), JSON.stringify({ before, after }));
    const faceWritten = ["selfie", "reference", "photoUrl"].includes(step);
    if (faceWritten) {
      const codeId = (await db.collection("joinCodes").doc(t).get()).get("codeId");
      const kept = await co(PRO).collection("employeeConsents").where("joinCodeId", "==", codeId).get();
      const mine = kept.docs[0];
      check(`Forced failure after ${step} -> consent kept with faceDataDeletedAt (face data was written)`, after.consents === before.consents + 1 && kept.size === 1 && mine.get("signupRolledBack") === true && !!mine.get("faceDataDeletedAt"));
    } else {
      check(`Forced failure after ${step} -> no consent record left`, after.consents === before.consents);
    }
  }

  // ---------------- Duplicate name + birthday -> flagged, not blocked ----------------
  const tN = await makeCode(PRO);
  const dupName = `JC Dup ${RUN}`;
  const rA = await callFn("joinCompany", body(tN, "dupa", { fullName: dupName, birthday: "1990-03-03" }));
  const rB = await callFn("joinCompany", body(tN, "dupb", { fullName: `  jc   DUP ${RUN.toUpperCase()} `, birthday: "1990-03-03" }));
  const rC = await callFn("joinCompany", body(tN, "dupc", { fullName: dupName, birthday: "1990-03-04" }));
  check("Same name + birthday -> second sign-up still succeeds", rA.ok && rB.ok, JSON.stringify([rA, rB]));
  if (rA.ok && rB.ok && rC.ok) {
    const [a, b, c] = await Promise.all([rA, rB, rC].map((r) => emp(PRO, r.result.employeeId).get()));
    check("Second one flagged possibleDuplicateOf the first", (b.get("possibleDuplicateOf") || []).includes(rA.result.employeeId) && !!b.get("duplicateFlaggedAt"));
    check("First one not flagged; same name + different birthday not flagged", a.get("possibleDuplicateOf") === undefined && c.get("possibleDuplicateOf") === undefined);
  } else {
    check("Duplicate flag checks ran", false, JSON.stringify(rC));
  }

  // ---------------- Race for the last seat ----------------
  // In-process with a barrier: both transactions finish their reads (both
  // see 1 seat left) before either writes. Only one may commit.
  {
    const t = await makeCode(PRO);
    await co(PRO).update({ employeeCap: (await liveActive(PRO)) + 1 });
    const before = await snapshot(t);
    let arrived = 0;
    let release;
    const gate = new Promise((res) => (release = res));
    const hooks = {
      inTransaction: async () => {
        arrived += 1;
        if (arrived >= 2) release();
        await Promise.race([gate, new Promise((res) => setTimeout(res, 8000))]);
      },
    };
    const [x, y] = await Promise.all([runLocal(body(t, "racea"), hooks), runLocal(body(t, "raceb"), hooks)]);
    const winners = [x, y].filter((r) => r.ok);
    const loser = [x, y].find((r) => !r.ok);
    const after = await snapshot(t);
    const cap = (await co(PRO).get()).get("employeeCap");
    check(`Barrier race: both read before either wrote (arrivals ${arrived})`, arrived >= 2);
    check("Barrier race: exactly one wins", winners.length === 1, JSON.stringify([x.reason || "ok", y.reason || "ok"]));
    check("Barrier race: loser gets the account-problem message", !!loser && loser.reason === "accountProblem" && loser.message === E.accountProblem);
    check("Barrier race: active employees = cap, joinedCount +1, one PIN, one employee", (await liveActive(PRO)) === cap && after.joined === before.joined + 1 && after.pins === before.pins + 1 && after.employees === before.employees + 1);
    const loserTag = x.ok ? "raceb" : "racea";
    check("Barrier race: loser's Auth user removed", !(await userExists(email(loserTag))));
  }
  // Deployed: two real requests at once for the last seat.
  {
    const t = await makeCode(PRO);
    await co(PRO).update({ employeeCap: (await liveActive(PRO)) + 1 });
    const [x, y] = await Promise.all([callFn("joinCompany", body(t, "dracea")), callFn("joinCompany", body(t, "draceb"))]);
    const cap = (await co(PRO).get()).get("employeeCap");
    check("Deployed race: exactly one wins, other gets account problem", [x, y].filter((r) => r.ok).length === 1 && [x, y].some((r) => r.reason === "accountProblem"), JSON.stringify([x.reason || "ok", y.reason || "ok"]));
    check("Deployed race: active employees = cap", (await liveActive(PRO)) === cap);
    await co(PRO).update({ employeeCap: 15 });
  }

  // ---------------- Right-to-delete (deployed deleteEmployee) ----------------
  {
    const adminTok = await signIn(creds["jc-pro-admin"].email, creds["jc-pro-admin"].password);
    const r = await callFn("deleteEmployee", { employeeId }, adminTok);
    check("Right-to-delete: deleteEmployee -> success", r.ok, JSON.stringify(r));
    const [refStill] = await bucket.file(refPath).exists();
    const [selfieStill] = await bucket.file(selfiePath).exists();
    const consent = await co(PRO).collection("employeeConsents").doc(employeeId).get();
    check("Right-to-delete: reference.jpg and selfie folder deleted", !refStill && !selfieStill);
    check("Right-to-delete: consent record KEPT with faceDataDeletedAt", consent.exists && !!consent.get("faceDataDeletedAt") && consent.get("faceDataDeletedReason") === "employeeDeleted");
    check("Right-to-delete: employee doc, Auth user, PIN gone", !(await emp(PRO, employeeId).get()).exists && !(await userExists(email("happy"))) && !(await co(PRO).collection("pins").doc(pin).get()).exists);
  }
}

async function cleanup() {
  const prefix = `jc-join-${RUN}-`;
  let page;
  const uids = [];
  do {
    page = await auth.listUsers(1000, page && page.pageToken);
    for (const u of page.users) if (u.email && u.email.startsWith(prefix)) uids.push(u.uid);
  } while (page.pageToken);
  for (const uid of uids) {
    await auth.deleteUser(uid).catch(() => {});
    await db.collection("users").doc(uid).delete().catch(() => {});
  }
  for (const c of [PRO, CORE]) {
    const emps = await co(c).collection("employees").where("joinedVia", "==", "qr").get();
    const mine = emps.docs.filter((d) => String(d.get("name") || "").toLowerCase().includes(RUN));
    for (const d of mine) {
      const p = d.get("pin");
      if (p) await co(c).collection("pins").doc(p).delete().catch(() => {});
      await bucket.deleteFiles({ prefix: `companies/${c}/employees/${d.id}/` }).catch(() => {});
      const alerts = await co(c).collection("alerts").where("employeeId", "==", d.id).get();
      for (const a of alerts.docs) await a.ref.delete();
      await d.ref.delete();
    }
    const consents = await co(c).collection("employeeConsents").get();
    for (const d of consents.docs) {
      const uidMatch = uids.includes(d.get("uid"));
      if (uidMatch || mine.some((m) => m.id === d.id)) await d.ref.delete();
    }
  }
  // Rolled-back sign-ups: their consent uid's Auth user is already gone, so
  // match by the codes this run created.
  const codeIds = [];
  for (const t of codes) {
    const s = await db.collection("joinCodes").doc(t).get();
    if (s.exists) codeIds.push(s.get("codeId"));
    await db.collection("joinCodes").doc(t).delete();
  }
  for (const c of [PRO, CORE]) {
    const consents = await co(c).collection("employeeConsents").get();
    for (const d of consents.docs) if (codeIds.includes(d.get("joinCodeId"))) await d.ref.delete();
  }
  await co(PRO).collection("subcontractors").doc("sub-jc-inactive").delete();
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
  fs.writeFileSync(path.join(os.tmpdir(), "jc-join-secrets.json"), JSON.stringify(secrets));
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\nAPI joinCompany: ${results.length - failed}/${results.length} passed${crashed ? " (stopped early)" : ""}`);
  process.exit(failed || crashed ? 1 : 0);
})();
