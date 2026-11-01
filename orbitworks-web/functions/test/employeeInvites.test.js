// Employee App Phase 3B - email invites, end to end on the emulators:
// createEmployeeInvite / resend / revoke / remove, getInviteInfo,
// acceptEmployeeInvite (new person + existing row, every refusal, rollback),
// deleteEmployee revoking a row's invite, and a QR joinCompany regression
// check for the shared sign-up steps it now uses.
//
// Runs the REAL compiled functions (lib/) against the Firestore and Auth
// emulators. Storage is an in-memory fake. The project id has no website in
// lib/appUrls.ts, so no email is ever sent (Resend is never called) - the
// send path records "failed" instead, which the resend test checks.
//
// Run (from functions/, after npm run build):
//   firebase emulators:exec --only firestore,auth "node --test test/employeeInvites.test.js"
process.env.GCLOUD_PROJECT = "orbitworks-invites-test";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8090";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.REKOGNITION_ACCESS_KEY_ID = "test-access-key";
process.env.REKOGNITION_SECRET_ACCESS_KEY = "test-secret-key";
process.env.MAPBOX_TOKEN = "";
process.env.ALERTS_FEED_ENABLED = "false";
process.env.DEVICE_TRACKING_ENABLED = "false";
process.env.PUSH_NOTIFICATIONS_ENABLED = "false";

const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");
const admin = require("firebase-admin");
const { db } = require("../lib/shared.js");
const invites = require("../lib/employeeInvites.js");
const { runGetInviteInfo } = require("../lib/getInviteInfo.js");
const { runAcceptEmployeeInvite } = require("../lib/acceptEmployeeInvite.js");
const { runJoinCompany } = require("../lib/joinCompany.js");
const funcs = require("../lib/index.js");
const { PRIVACY_POLICY_VERSION, BIOMETRIC_CONSENT_VERSION } = require("../lib/consentVersions.js");

// ---- in-memory Storage fake ----
const files = new Map();
function notFound() {
  const e = new Error("No such object");
  e.code = 404;
  return e;
}
admin.storage().bucket = () => ({
  name: "test-bucket",
  file: (p) => ({
    save: async (bytes, opts) => {
      files.set(p, { bytes, contentType: opts && opts.contentType, metadata: {} });
    },
    copy: async (dest) => {
      if (!files.has(p)) throw notFound();
      files.set(dest.__path, { ...files.get(p), metadata: {} });
    },
    setMetadata: async (m) => {
      const f = files.get(p);
      if (!f) throw notFound();
      f.metadata = { ...(f.metadata || {}), ...(m.metadata || {}) };
      return [f];
    },
    getMetadata: async () => {
      if (!files.has(p)) throw notFound();
      return [files.get(p)];
    },
    delete: async () => {
      if (!files.has(p)) throw notFound();
      files.delete(p);
    },
    __path: p,
  }),
  deleteFiles: async ({ prefix }) => {
    for (const k of [...files.keys()]) if (k.startsWith(prefix)) files.delete(k);
  },
});

// A real (tiny) JPEG-looking payload: FF D8 FF + padding, over 5 KB.
const SELFIE = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(6000, 1)]).toString("base64");

const adminReq = (c, data, extra = {}) => ({ auth: { uid: "uidAdmin-" + c, token: { role: "admin", companyId: c, ...extra } }, data });

async function seed(c, { plan = "core2_tier1", status = "active", cap = 15, totalCap = 20 } = {}) {
  const co = db.collection("companies").doc(c);
  await co.set({ name: "Co " + c, planTier: plan, subscriptionStatus: status, employeeCap: cap, totalEmployeeCap: totalCap });
  await co.collection("jobSites").doc("site1").set({ name: "Site One", active: true });
  await co.collection("jobSites").doc("siteOff").set({ name: "Closed", active: false });
  await co.collection("subcontractors").doc("subA").set({ name: "Acme", active: true });
  await co.collection("subcontractors").doc("subOff").set({ name: "Gone", active: false });
  await co.collection("employees").doc("row1").set({
    name: "Pat Row",
    active: true,
    pin: "4821",
    hourlyRate: 22,
    assignedSiteIds: ["site1"],
    subcontractorId: null,
    subcontractorName: null,
    photoUrl: "https://firebasestorage.googleapis.com/v0/b/test-bucket/o/old.jpg?alt=media&token=old",
  });
  await co.collection("pins").doc("4821").set({ employeeId: "row1" });
  return co;
}

const newCompany = () => "c" + randomUUID().slice(0, 8);
const email = (tag) => `${tag}-${randomUUID().slice(0, 6)}@example.com`;

async function expectHttpsError(promise, code, reason) {
  try {
    await promise;
  } catch (err) {
    assert.equal(err.code, code, `code: ${err.code} ${err.message}`);
    if (reason) assert.equal(err.details && err.details.reason, reason, `reason: ${JSON.stringify(err.details)}`);
    return err;
  }
  assert.fail(`expected ${code}${reason ? "/" + reason : ""}`);
}

async function noAuthUser(mail) {
  try {
    await admin.auth().getUserByEmail(mail);
    return false;
  } catch (err) {
    return err.code === "auth/user-not-found";
  }
}

function acceptInput(token, mail, over = {}) {
  return {
    token,
    fullName: "Nina Newhire",
    email: mail,
    password: "longenough1",
    privacyAccepted: true,
    privacyVersion: PRIVACY_POLICY_VERSION,
    biometricConsentAccepted: true,
    biometricConsentVersion: BIOMETRIC_CONSENT_VERSION,
    birthday: "1995-03-04",
    subcontractorId: null,
    selfieBase64: SELFIE,
    ...over,
  };
}

const createNew = (c, mail, siteId = "site1") => invites.runCreateEmployeeInvite(adminReq(c, { kind: "newPerson", email: mail, siteId }));
const createRow = (c, mail, employeeId = "row1") => invites.runCreateEmployeeInvite(adminReq(c, { kind: "existingEmployee", employeeId, email: mail }));
const inviteDoc = async (token) => (await db.collection("employeeInvites").doc(token).get()).data();

// ================= create =================

test("create newPerson: doc shape, 43-char token, 7-day expiry, nothing secret elsewhere", async () => {
  const c = newCompany();
  await seed(c);
  const mail = email("new");
  const { token, inviteId } = await createNew(c, mail.toUpperCase());
  assert.equal(token.length, 43);
  const d = await inviteDoc(token);
  assert.equal(d.email, mail);
  assert.equal(d.kind, "newPerson");
  assert.equal(d.siteId, "site1");
  assert.equal(d.employeeId, null);
  assert.equal(d.status, "pending");
  assert.equal(d.inviteId, inviteId);
  assert.equal(d.emailStatus, "pending");
  const days = (d.expiresAt.toMillis() - Date.now()) / 86400000;
  assert.ok(days > 6.99 && days <= 7, String(days));
});

test("create: blank site = null; closed or unknown site refused", async () => {
  const c = newCompany();
  await seed(c);
  const { token } = await createNew(c, email("nosite"), null);
  assert.equal((await inviteDoc(token)).siteId, null);
  await expectHttpsError(createNew(c, email("x"), "siteOff"), "invalid-argument");
  await expectHttpsError(createNew(c, email("x"), "nope"), "invalid-argument");
});

test("create: only admin/owner of a Core/Pro, not past-due company", async () => {
  const c = newCompany();
  await seed(c);
  await expectHttpsError(invites.runCreateEmployeeInvite({ data: { kind: "newPerson", email: "a@b.co", siteId: null } }), "unauthenticated");
  for (const role of ["supervisor", "employee"]) {
    await expectHttpsError(
      invites.runCreateEmployeeInvite({ auth: { uid: "u", token: { role, companyId: c } }, data: { kind: "newPerson", email: "a@b.co", siteId: null } }),
      "permission-denied"
    );
  }
  assert.ok((await invites.runCreateEmployeeInvite({ auth: { uid: "o", token: { role: "owner", companyId: c } }, data: { kind: "newPerson", email: email("own"), siteId: null } })).token);
  const free = newCompany();
  await seed(free, { plan: "free" });
  await expectHttpsError(createNew(free, email("f"), null), "failed-precondition");
  const pastDue = newCompany();
  await seed(pastDue, { plan: "pro_tier1", status: "past_due" });
  await expectHttpsError(createNew(pastDue, email("p"), null), "failed-precondition");
});

test("create: bad input refused before Firebase is touched", async () => {
  const c = newCompany();
  await seed(c);
  await expectHttpsError(invites.runCreateEmployeeInvite(adminReq(c, { kind: "newPerson", email: "nope", siteId: null })), "invalid-argument");
  await expectHttpsError(invites.runCreateEmployeeInvite(adminReq(c, { kind: "supervisor", email: "a@b.co" })), "invalid-argument");
  await expectHttpsError(invites.runCreateEmployeeInvite(adminReq(c, null)), "invalid-argument");
});

test("create: K1 duplicates - pending employee invite, pending supervisor invite, existing login", async () => {
  const c = newCompany();
  await seed(c);
  const mail = email("dup");
  await createNew(c, mail);
  await expectHttpsError(createNew(c, mail), "already-exists");
  const mail2 = email("sup");
  await db.collection("invites").add({ companyId: c, email: mail2, status: "pending", role: "supervisor" });
  await expectHttpsError(createNew(c, mail2), "already-exists");
  const mail3 = email("login");
  await admin.auth().createUser({ email: mail3, password: "longenough1" });
  await expectHttpsError(createNew(c, mail3), "already-exists");
});

test("create: an expired invite doesn't block a new one for the same email", async () => {
  const c = newCompany();
  await seed(c);
  const mail = email("exp");
  const { token } = await createNew(c, mail);
  await db.collection("employeeInvites").doc(token).update({ expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() - 1000) });
  assert.ok((await createNew(c, mail)).token);
});

test("create existingEmployee: J1 rows only, one pending per row", async () => {
  const c = newCompany();
  const co = await seed(c);
  const { token } = await createRow(c, email("row"));
  const d = await inviteDoc(token);
  assert.equal(d.employeeId, "row1");
  assert.equal(d.employeeName, "Pat Row");
  assert.equal(d.siteId, null);
  await expectHttpsError(createRow(c, email("row2")), "already-exists");
  await co.collection("employees").doc("off").set({ name: "Off", active: false });
  await co.collection("employees").doc("linked").set({ name: "L", active: true, linkedUserId: "u" });
  await co.collection("employees").doc("sup").set({ name: "S", active: true, isSupervisor: true });
  for (const id of ["off", "linked", "sup"]) await expectHttpsError(createRow(c, email(id), id), "failed-precondition");
  await expectHttpsError(createRow(c, email("missing"), "missing"), "not-found");
});

// ================= getInviteInfo =================

test("getInviteInfo: active shows company + active subcontractors, never the email", async () => {
  const c = newCompany();
  await seed(c);
  const mail = email("info");
  const { token } = await createNew(c, mail);
  const info = await runGetInviteInfo({ token });
  assert.equal(info.status, "active");
  assert.equal(info.companyName, "Co " + c);
  assert.deepEqual(info.subcontractors, [{ id: "subA", name: "Acme" }]);
  assert.equal(JSON.stringify(info).includes(mail), false);
  assert.deepEqual(Object.keys(info).sort(), ["biometricConsentText", "biometricConsentVersion", "companyName", "minSignupAge", "privacyPolicyVersion", "status", "subcontractors"]);
});

test("getInviteInfo: inactive for bad token, missing, expired, revoked, plan, row unusable, seats full", async () => {
  const c = newCompany();
  const co = await seed(c);
  assert.deepEqual(await runGetInviteInfo({ token: "short" }), { status: "inactive" });
  assert.deepEqual(await runGetInviteInfo({ token: randomBytes(32).toString("base64url") }), { status: "inactive" });
  const a = (await createNew(c, email("a"))).token;
  await db.collection("employeeInvites").doc(a).update({ expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() - 1) });
  assert.equal((await runGetInviteInfo({ token: a })).status, "inactive");
  const b = (await createNew(c, email("b"))).token;
  await invites.runRevokeEmployeeInvite(adminReq(c, { token: b }));
  assert.equal((await runGetInviteInfo({ token: b })).status, "inactive");
  const r = (await createRow(c, email("r"))).token;
  await co.collection("employees").doc("row1").update({ active: false });
  assert.equal((await runGetInviteInfo({ token: r })).status, "inactive");
  const n = (await createNew(c, email("n"))).token;
  await co.update({ employeeCap: 0 });
  assert.equal((await runGetInviteInfo({ token: n })).status, "inactive");
  await co.update({ employeeCap: 15, planTier: "free" });
  assert.equal((await runGetInviteInfo({ token: n })).status, "inactive");
});

// ================= accept: new person =================

test("accept newPerson (Core): row, PIN, login, consent, photo, invite used", async () => {
  const c = newCompany();
  const co = await seed(c);
  const mail = email("happy");
  const { token, inviteId } = await createNew(c, mail);
  const res = await runAcceptEmployeeInvite(acceptInput(token, mail.toUpperCase(), { subcontractorId: "subA" }));
  assert.match(res.pin, /^\d{4}$/);
  const row = (await co.collection("employees").doc(res.employeeId).get()).data();
  assert.equal(row.name, "Nina Newhire");
  assert.equal(row.dob, "1995-03-04");
  assert.deepEqual(row.assignedSiteIds, ["site1"]);
  assert.equal(row.subcontractorId, "subA");
  assert.equal(row.subcontractorName, "Acme");
  assert.equal(row.joinedVia, "invite");
  assert.equal(row.employeeInviteId, inviteId);
  assert.equal(row.appAccess, true);
  assert.equal(row.email, mail);
  assert.equal(row.pin, res.pin);
  assert.equal(JSON.stringify(row).includes(token), false, "token never on the row");
  assert.ok(row.photoUrl.includes(encodeURIComponent(`companies/${c}/employees/${res.employeeId}/reference.jpg`)));
  assert.ok(files.has(`companies/${c}/employees/${res.employeeId}/selfie/invite-${inviteId}.jpg`));
  assert.equal((await co.collection("pins").doc(res.pin).get()).get("employeeId"), res.employeeId);
  const user = await admin.auth().getUserByEmail(mail);
  assert.deepEqual(user.customClaims, { role: "employee", companyId: c, employeeId: res.employeeId });
  assert.equal((await db.collection("users").doc(user.uid).get()).get("role"), "employee");
  const consent = (await co.collection("employeeConsents").doc(res.employeeId).get()).data();
  assert.equal(consent.source, "emailInvite");
  assert.equal(consent.joinCodeId, null);
  assert.equal(consent.employeeInviteId, inviteId);
  const inv = await inviteDoc(token);
  assert.equal(inv.status, "accepted");
  assert.equal(inv.employeeId, res.employeeId);
  assert.equal(inv.acceptedByUid, user.uid);
});

test("accept newPerson with no site, or a site closed since the invite -> no site", async () => {
  const c = newCompany();
  const co = await seed(c);
  const m1 = email("ns");
  const t1 = (await createNew(c, m1, null)).token;
  const r1 = await runAcceptEmployeeInvite(acceptInput(t1, m1));
  assert.deepEqual((await co.collection("employees").doc(r1.employeeId).get()).get("assignedSiteIds"), []);
  const m2 = email("closed");
  const t2 = (await createNew(c, m2, "site1")).token;
  await co.collection("jobSites").doc("site1").update({ active: false });
  const r2 = await runAcceptEmployeeInvite(acceptInput(t2, m2, { birthday: "1990-01-01" }));
  assert.deepEqual((await co.collection("employees").doc(r2.employeeId).get()).get("assignedSiteIds"), []);
});

test("accept: wrong email -> emailMismatch, nothing created, invite still pending", async () => {
  const c = newCompany();
  await seed(c);
  const mail = email("right");
  const { token } = await createNew(c, mail);
  const wrong = email("wrong");
  await expectHttpsError(runAcceptEmployeeInvite(acceptInput(token, wrong)), "invalid-argument", "emailMismatch");
  assert.ok(await noAuthUser(wrong));
  assert.equal((await inviteDoc(token)).status, "pending");
});

test("accept: one-time use - second sign-up on the same link is refused", async () => {
  const c = newCompany();
  await seed(c);
  const mail = email("once");
  const { token } = await createNew(c, mail);
  await runAcceptEmployeeInvite(acceptInput(token, mail));
  await expectHttpsError(runAcceptEmployeeInvite(acceptInput(token, mail)), "failed-precondition", "inviteInactive");
});

test("accept: expired, revoked, unknown or malformed link -> inviteInactive, no login", async () => {
  const c = newCompany();
  await seed(c);
  const m1 = email("exp");
  const t1 = (await createNew(c, m1)).token;
  await db.collection("employeeInvites").doc(t1).update({ expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() - 1) });
  await expectHttpsError(runAcceptEmployeeInvite(acceptInput(t1, m1)), "failed-precondition", "inviteInactive");
  const m2 = email("rev");
  const t2 = (await createNew(c, m2)).token;
  await invites.runRevokeEmployeeInvite(adminReq(c, { token: t2 }));
  await expectHttpsError(runAcceptEmployeeInvite(acceptInput(t2, m2)), "failed-precondition", "inviteInactive");
  await expectHttpsError(runAcceptEmployeeInvite(acceptInput(randomBytes(32).toString("base64url"), m2)), "failed-precondition", "inviteInactive");
  await expectHttpsError(runAcceptEmployeeInvite(acceptInput("bad", m2)), "failed-precondition", "inviteInactive");
  assert.ok((await noAuthUser(m1)) && (await noAuthUser(m2)));
});

test("accept: seats full / plan downgraded since the invite -> accountProblem, no login", async () => {
  const c = newCompany();
  const co = await seed(c, { cap: 2 });
  const mail = email("full");
  const { token } = await createNew(c, mail);
  await co.collection("employees").doc("other").set({ name: "Other", active: true });
  await expectHttpsError(runAcceptEmployeeInvite(acceptInput(token, mail)), "failed-precondition", "accountProblem");
  assert.ok(await noAuthUser(mail));
  await co.update({ employeeCap: 15, planTier: "free" });
  await expectHttpsError(runAcceptEmployeeInvite(acceptInput(token, mail)), "failed-precondition", "accountProblem");
});

test("accept: seat taken between pre-check and transaction -> refused and rolled back", async () => {
  const c = newCompany();
  const co = await seed(c, { cap: 2 });
  const mail = email("race");
  const { token } = await createNew(c, mail);
  let once = false;
  await expectHttpsError(
    runAcceptEmployeeInvite(acceptInput(token, mail), {
      inTransaction: async () => {
        if (once) return;
        once = true;
        await co.collection("employees").doc("sneaky").set({ name: "Sneaky", active: true });
      },
    }),
    "failed-precondition",
    "accountProblem"
  );
  assert.ok(await noAuthUser(mail));
  assert.equal((await inviteDoc(token)).status, "pending");
});

test("accept: inactive / unknown subcontractor refused before any login", async () => {
  const c = newCompany();
  await seed(c);
  const mail = email("sub");
  const { token } = await createNew(c, mail);
  await expectHttpsError(runAcceptEmployeeInvite(acceptInput(token, mail, { subcontractorId: "subOff" })), "invalid-argument", "subcontractor");
  await expectHttpsError(runAcceptEmployeeInvite(acceptInput(token, mail, { subcontractorId: "nope" })), "invalid-argument", "subcontractor");
  assert.ok(await noAuthUser(mail));
});

test("accept: email already a login -> emailInUse, invite still pending", async () => {
  const c = newCompany();
  await seed(c);
  const mail = email("inuse");
  const { token } = await createNew(c, mail);
  await admin.auth().createUser({ email: mail, password: "longenough1" });
  await expectHttpsError(runAcceptEmployeeInvite(acceptInput(token, mail)), "already-exists", "emailInUse");
  assert.equal((await inviteDoc(token)).status, "pending");
});

test("accept: old consent version / bad photo refused", async () => {
  const c = newCompany();
  await seed(c);
  const mail = email("cv");
  const { token } = await createNew(c, mail);
  await expectHttpsError(runAcceptEmployeeInvite(acceptInput(token, mail, { privacyVersion: "old" })), "invalid-argument", "consentVersion");
  await expectHttpsError(runAcceptEmployeeInvite(acceptInput(token, mail, { selfieBase64: Buffer.alloc(6000, 1).toString("base64") })), "invalid-argument", "photo");
  assert.ok(await noAuthUser(mail));
});

for (const step of ["authUser", "pin", "transaction", "link", "selfie", "reference", "photoUrl"]) {
  test(`accept newPerson rollback after ${step}: no row, PIN freed, no files, invite pending, no login`, async () => {
    const c = newCompany();
    const co = await seed(c);
    const mail = email("rb-" + step.toLowerCase());
    const { token } = await createNew(c, mail);
    await expectHttpsError(runAcceptEmployeeInvite(acceptInput(token, mail), { failAt: step }), "internal", "generic");
    const rows = await co.collection("employees").get();
    assert.deepEqual(rows.docs.map((d) => d.id).sort(), ["row1"]);
    const pins = await co.collection("pins").get();
    assert.deepEqual(pins.docs.map((d) => d.id), ["4821"]);
    assert.equal([...files.keys()].some((k) => k.startsWith(`companies/${c}/`)), false);
    const inv = await inviteDoc(token);
    assert.equal(inv.status, "pending");
    assert.equal(inv.employeeId, null);
    assert.ok(await noAuthUser(mail));
    // ...and it can still be used afterwards.
    await runAcceptEmployeeInvite(acceptInput(token, mail));
  });
}

// ================= accept: existing row =================

test("accept existing row (Pro): links the SAME row, keeps name/PIN/sites/rate, saves dob + subcontractor", async () => {
  const c = newCompany();
  const co = await seed(c, { plan: "pro_tier1" });
  const mail = email("rowok");
  const { token, inviteId } = await createRow(c, mail);
  const res = await runAcceptEmployeeInvite(acceptInput(token, mail, { fullName: "Typed Other Name", subcontractorId: "subA" }));
  assert.equal(res.employeeId, "row1");
  assert.equal(res.pin, "4821");
  const row = (await co.collection("employees").doc("row1").get()).data();
  assert.equal(row.name, "Pat Row");
  assert.equal(row.pin, "4821");
  assert.equal(row.hourlyRate, 22);
  assert.deepEqual(row.assignedSiteIds, ["site1"]);
  assert.equal(row.dob, "1995-03-04");
  assert.equal(row.subcontractorId, "subA");
  assert.equal(row.subcontractorHistory.length, 1);
  assert.equal(row.subcontractorHistory[0].previousSubcontractorId, null);
  assert.equal(row.subcontractorHistory[0].newSubcontractorId, "subA");
  assert.equal(row.joinedVia, "invite");
  assert.equal(row.employeeInviteId, inviteId);
  assert.equal(row.appAccess, true);
  assert.ok(row.photoUrl.includes(encodeURIComponent(`selfie/invite-${inviteId}-photo.jpg`)));
  const rows = await co.collection("employees").get();
  assert.equal(rows.size, 1, "no new row");
  const user = await admin.auth().getUserByEmail(mail);
  assert.deepEqual(user.customClaims, { role: "employee", companyId: c, employeeId: "row1" });
  assert.equal((await db.collection("users").doc(user.uid).get()).get("name"), "Pat Row");
});

test("accept existing row: same subcontractor -> no history entry", async () => {
  const c = newCompany();
  const co = await seed(c);
  const mail = email("samesub");
  const { token } = await createRow(c, mail);
  await runAcceptEmployeeInvite(acceptInput(token, mail, { subcontractorId: null }));
  assert.equal((await co.collection("employees").doc("row1").get()).get("subcontractorHistory"), undefined);
});

test("accept existing row: row deactivated or linked since the invite -> inviteUnusable (extra rule 1)", async () => {
  const c = newCompany();
  const co = await seed(c);
  const mail = email("unusable");
  const { token } = await createRow(c, mail);
  await co.collection("employees").doc("row1").update({ active: false });
  await expectHttpsError(runAcceptEmployeeInvite(acceptInput(token, mail)), "failed-precondition", "inviteUnusable");
  await co.collection("employees").doc("row1").update({ active: true, linkedUserId: "someoneElse" });
  await expectHttpsError(runAcceptEmployeeInvite(acceptInput(token, mail)), "failed-precondition", "inviteUnusable");
  assert.ok(await noAuthUser(mail));
});

test("accept existing row: wrong email still says emailMismatch before inviteUnusable", async () => {
  const c = newCompany();
  const co = await seed(c);
  const { token } = await createRow(c, email("x"));
  await co.collection("employees").doc("row1").update({ active: false });
  await expectHttpsError(runAcceptEmployeeInvite(acceptInput(token, email("y"))), "invalid-argument", "emailMismatch");
});

test("accept existing row: an active row with no free seat still works (no new seat)", async () => {
  const c = newCompany();
  await seed(c, { cap: 1, totalCap: 1 });
  const mail = email("noseat");
  const { token } = await createRow(c, mail);
  const res = await runAcceptEmployeeInvite(acceptInput(token, mail));
  assert.equal(res.employeeId, "row1");
});

// ---- Choice 2: old face reference photo on Pro ----

async function rowWithOldPhoto(c, plan) {
  const co = await seed(c, { plan });
  const oldPath = `companies/${c}/employees/row1/reference.jpg`;
  files.set(oldPath, { bytes: Buffer.from("old"), metadata: {} });
  const oldUrl = `https://firebasestorage.googleapis.com/v0/b/test-bucket/o/${encodeURIComponent(oldPath)}?alt=media&token=old`;
  await co.collection("employees").doc("row1").update({ photoUrl: oldUrl });
  return { co, oldPath };
}

test("Pro existing row: after success the old face reference file is deleted, the selfie is the new reference", async () => {
  const c = newCompany();
  const { co, oldPath } = await rowWithOldPhoto(c, "pro_tier1");
  const mail = email("prophoto");
  const { token, inviteId } = await createRow(c, mail);
  await runAcceptEmployeeInvite(acceptInput(token, mail));
  assert.equal(files.has(oldPath), false, "old reference deleted");
  const newPath = `companies/${c}/employees/row1/selfie/invite-${inviteId}-photo.jpg`;
  assert.ok(files.has(newPath), "new photo saved");
  const photoUrl = (await co.collection("employees").doc("row1").get()).get("photoUrl");
  assert.ok(photoUrl.includes(encodeURIComponent(newPath)), "photoUrl (the face reference) is the selfie copy");
});

test("Core existing row: the old profile photo file is kept", async () => {
  const c = newCompany();
  const { oldPath } = await rowWithOldPhoto(c, "core2_tier1");
  const mail = email("corephoto");
  const { token } = await createRow(c, mail);
  await runAcceptEmployeeInvite(acceptInput(token, mail));
  assert.ok(files.has(oldPath), "old photo kept on Core");
});

test("Pro existing row: a failed sign-up keeps the old reference (deleted only after full success)", async () => {
  const c = newCompany();
  const { co, oldPath } = await rowWithOldPhoto(c, "pro_tier1");
  const before = (await co.collection("employees").doc("row1").get()).get("photoUrl");
  const mail = email("profail");
  const { token } = await createRow(c, mail);
  await expectHttpsError(runAcceptEmployeeInvite(acceptInput(token, mail), { failAt: "photoUrl" }), "internal", "generic");
  assert.ok(files.has(oldPath), "old reference still there");
  assert.equal((await co.collection("employees").doc("row1").get()).get("photoUrl"), before);
});

test("Pro existing row: an old photo outside this employee's folder is never deleted", async () => {
  const c = newCompany();
  const co = await seed(c, { plan: "pro_tier1" });
  const elsewhere = `companies/${c}/employees/someoneElse/reference.jpg`;
  files.set(elsewhere, { bytes: Buffer.from("x"), metadata: {} });
  await co.collection("employees").doc("row1").update({
    photoUrl: `https://firebasestorage.googleapis.com/v0/b/test-bucket/o/${encodeURIComponent(elsewhere)}?alt=media&token=x`,
  });
  const mail = email("proelse");
  const { token } = await createRow(c, mail);
  await runAcceptEmployeeInvite(acceptInput(token, mail));
  assert.ok(files.has(elsewhere));
});

for (const step of ["transaction", "link", "photoUrl"]) {
  test(`accept existing row rollback after ${step}: row restored exactly, PIN kept, invite pending`, async () => {
    const c = newCompany();
    const co = await seed(c);
    const before = (await co.collection("employees").doc("row1").get()).data();
    const mail = email("rrb-" + step.toLowerCase());
    const { token } = await createRow(c, mail);
    await expectHttpsError(runAcceptEmployeeInvite(acceptInput(token, mail, { subcontractorId: "subA" }), { failAt: step }), "internal", "generic");
    const after = (await co.collection("employees").doc("row1").get()).data();
    assert.deepEqual(after, before);
    assert.equal((await co.collection("pins").doc("4821").get()).get("employeeId"), "row1");
    const inv = await inviteDoc(token);
    assert.equal(inv.status, "pending");
    assert.equal(inv.employeeId, "row1");
    assert.ok(await noAuthUser(mail));
    assert.equal([...files.keys()].some((k) => k.startsWith(`companies/${c}/`)), false);
  });
}

// ================= revoke / remove / resend =================

test("revoke: pending -> revoked once; other company sees not-found", async () => {
  const c = newCompany();
  await seed(c);
  const other = newCompany();
  await seed(other);
  const { token } = await createNew(c, email("rv"));
  await expectHttpsError(invites.runRevokeEmployeeInvite(adminReq(other, { token })), "not-found");
  await invites.runRevokeEmployeeInvite(adminReq(c, { token }));
  const d = await inviteDoc(token);
  assert.equal(d.status, "revoked");
  assert.equal(d.revokedByUid, "uidAdmin-" + c);
  await expectHttpsError(invites.runRevokeEmployeeInvite(adminReq(c, { token })), "failed-precondition");
});

test("remove: refused while live, allowed once revoked / expired / accepted", async () => {
  const c = newCompany();
  await seed(c);
  const a = (await createNew(c, email("rm-a"))).token;
  await expectHttpsError(invites.runRemoveEmployeeInvite(adminReq(c, { token: a })), "failed-precondition");
  await invites.runRevokeEmployeeInvite(adminReq(c, { token: a }));
  await invites.runRemoveEmployeeInvite(adminReq(c, { token: a }));
  assert.equal(await inviteDoc(a), undefined);
  const b = (await createNew(c, email("rm-b"))).token;
  await db.collection("employeeInvites").doc(b).update({ expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() - 1) });
  await invites.runRemoveEmployeeInvite(adminReq(c, { token: b }));
  const m = email("rm-c");
  const t = (await createNew(c, m)).token;
  await runAcceptEmployeeInvite(acceptInput(t, m));
  await invites.runRemoveEmployeeInvite(adminReq(c, { token: t }));
  assert.equal(await inviteDoc(t), undefined);
});

test("resend: fresh 7 days + count, revives an expired invite, cooldown, not after accept", async () => {
  const c = newCompany();
  await seed(c);
  const mail = email("rs");
  const { token } = await createNew(c, mail);
  await db.collection("employeeInvites").doc(token).update({ expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() - 1) });
  // No website for this test project, so the send itself fails (and is
  // recorded) - the expiry/count update still happens first.
  const err = await expectHttpsError(invites.runResendEmployeeInvite(adminReq(c, { token })), "internal");
  assert.match(err.message, /No website/);
  const d = await inviteDoc(token);
  assert.ok(d.expiresAt.toMillis() > Date.now() + 6.9 * 86400000);
  assert.equal(d.resendCount, 1);
  assert.equal(d.emailStatus, "failed");
  assert.equal((await runGetInviteInfo({ token })).status, "active");
  await expectHttpsError(invites.runResendEmployeeInvite(adminReq(c, { token })), "resource-exhausted");
  await db.collection("employeeInvites").doc(token).update({ lastEmailAttemptAt: admin.firestore.Timestamp.fromMillis(Date.now() - 120000) });
  await runAcceptEmployeeInvite(acceptInput(token, mail));
  await expectHttpsError(invites.runResendEmployeeInvite(adminReq(c, { token })), "failed-precondition");
});

test("resend: refused if the row can't be invited anymore", async () => {
  const c = newCompany();
  const co = await seed(c);
  const { token } = await createRow(c, email("rsrow"));
  await co.collection("employees").doc("row1").update({ active: false });
  await expectHttpsError(invites.runResendEmployeeInvite(adminReq(c, { token })), "failed-precondition");
});

test("deleteEmployee revokes the row's pending invite", async () => {
  const c = newCompany();
  await seed(c);
  const { token } = await createRow(c, email("del"));
  await funcs.deleteEmployee.run({ data: { employeeId: "row1" }, auth: { uid: "uidAdmin-" + c, token: { role: "admin", companyId: c } }, rawRequest: {} });
  const d = await inviteDoc(token);
  assert.equal(d.status, "revoked");
  assert.equal((await runGetInviteInfo({ token })).status, "inactive");
});

// ================= QR regression (shared sign-up steps) =================

async function seedQr(c) {
  await seed(c, { plan: "pro_tier1" });
  const token = randomBytes(24).toString("base64url");
  await db.collection("joinCodes").doc(token).set({ codeId: "code-" + c, companyId: c, siteId: "site1", subcontractorIds: [], userLimit: null, joinedCount: 0, status: "active", replacedByToken: null, expiresAt: null });
  return token;
}

test("QR joinCompany still works on the shared steps (happy path)", async () => {
  const c = newCompany();
  const token = await seedQr(c);
  const mail = email("qr");
  const res = await runJoinCompany(acceptInput(token, mail));
  const row = (await db.collection("companies").doc(c).collection("employees").doc(res.employeeId).get()).data();
  assert.equal(row.joinedVia, "qr");
  assert.equal(row.employeeInviteId, undefined);
  assert.ok(row.photoUrl.includes(encodeURIComponent("reference.jpg")));
  assert.ok(files.has(`companies/${c}/employees/${res.employeeId}/selfie/signup.jpg`));
  assert.equal((await db.collection("joinCodes").doc(token).get()).get("joinedCount"), 1);
});

test("QR joinCompany still rolls back on the shared steps (failAt photoUrl)", async () => {
  const c = newCompany();
  const token = await seedQr(c);
  const mail = email("qrrb");
  await expectHttpsError(runJoinCompany(acceptInput(token, mail), { failAt: "photoUrl" }), "internal");
  assert.ok(await noAuthUser(mail));
  const pins = await db.collection("companies").doc(c).collection("pins").get();
  assert.deepEqual(pins.docs.map((d) => d.id), ["4821"]);
  assert.equal([...files.keys()].some((k) => k.startsWith(`companies/${c}/`)), false);
  assert.equal((await db.collection("joinCodes").doc(token).get()).get("joinedCount"), 0);
});

test("QR joinCompany is still Pro-only (Core company's code is inactive)", async () => {
  const c = newCompany();
  const token = await seedQr(c);
  await db.collection("companies").doc(c).update({ planTier: "core2_tier1" });
  await expectHttpsError(runJoinCompany(acceptInput(token, email("qrcore"))), "failed-precondition");
});
