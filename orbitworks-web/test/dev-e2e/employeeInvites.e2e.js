// DEV ONLY (orbitworks-dev-ew). Phase 3B email invites against the
// DEPLOYED functions and dev site, on the jc-test-* fixture companies
// (devSetup.js). Two ways in, same as joinCompany.e2e.js:
//   - callFn(): the deployed callable over HTTPS (what the website/app hit)
//   - runLocal(): the compiled runAcceptEmployeeInvite with a failAt hook,
//     pointed at dev, for a rollback that can't be forced through HTTPS.
// Invite emails go ONLY to Resend's test inbox (delivered+...@resend.dev),
// which accepts mail without delivering it anywhere - no bounces.
// Everything it creates is tagged with this run's id and removed at the end.
// Never prints a token, password, PIN or selfie.
//
// Usage (PowerShell, from orbitworks-web):
//   npm --prefix functions run build
//   node test/dev-e2e/employeeInvites.e2e.js
const fs = require("fs");
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
// lib/appUrls.ts picks the dev site from this.
process.env.GCLOUD_PROJECT = PROJECT;

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
const acc = require(path.join(FN, "lib", "acceptEmployeeInvite.js"));
const { CONSENT_VERSIONS } = require(path.join(FN, "lib", "consentVersions.js"));
const appUrls = require(path.join(FN, "lib", "lib", "appUrls.js"));
const sharp = webRequire("sharp");
const creds = JSON.parse(fs.readFileSync(path.join(__dirname, "creds.json"), "utf8"));

const db = admin.firestore();
const auth = admin.auth();
const bucket = admin.storage().bucket();
const { Timestamp } = admin.firestore;

const PRO = "jc-test-pro-dev";
const CORE = "jc-test-core-dev";
const RUN = Date.now().toString(36);
const PASSWORD = "Jc-" + crypto.randomBytes(9).toString("base64url");
const SITE = appUrls.siteFor(PROJECT).baseUrl;
const co = (id) => db.collection("companies").doc(id);
const emp = (c, id) => co(c).collection("employees").doc(id);
const inviteRef = (t) => db.collection("employeeInvites").doc(t);
const mail = (tag) => `delivered+jcinv-${RUN}-${tag}@resend.dev`;

const results = [];
function check(name, cond, detail = "") {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? "OK    " : "FAILED"} ${name}${!cond && detail ? "  -> " + detail : ""}`);
}

// What this run made, for cleanup.
const made = { tokens: [], rows: [], emails: [] };
let selfieB64;

async function makeSelfie() {
  const w = 320, h = 320;
  const buf = await sharp(crypto.randomBytes(w * h * 3), { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 85 }).toBuffer();
  return buf.toString("base64");
}

const tokenCache = {};
async function idToken(key) {
  if (tokenCache[key]) return tokenCache[key];
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${webEnv.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: creds[key].email, password: creds[key].password, returnSecureToken: true }),
  });
  const j = await r.json();
  if (!j.idToken) throw new Error("sign-in failed for " + key);
  return (tokenCache[key] = j.idToken);
}

async function signInAs(email, password) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${webEnv.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  return r.json();
}

async function callFn(name, data, who) {
  const headers = { "Content-Type": "application/json" };
  if (who) headers.Authorization = "Bearer " + (await idToken(who));
  const r = await fetch(`https://us-central1-${PROJECT}.cloudfunctions.net/${name}`, { method: "POST", headers, body: JSON.stringify({ data }) });
  let j = null;
  try { j = await r.json(); } catch {}
  if (j && j.result !== undefined) return { ok: true, result: j.result };
  return { ok: false, status: r.status, code: j && j.error && j.error.status, message: j && j.error && j.error.message, reason: j && j.error && j.error.details && j.error.details.reason };
}

async function create(who, data) {
  if (data.email) made.emails.push(data.email);
  const r = await callFn("createEmployeeInvite", data, who);
  if (r.ok) made.tokens.push(r.result.token);
  return r;
}

function body(token, email, o = {}) {
  return {
    token,
    fullName: `JC Invite ${RUN}`,
    email,
    password: PASSWORD,
    privacyAccepted: true,
    privacyVersion: CONSENT_VERSIONS.privacyPolicyVersion,
    biometricConsentAccepted: true,
    biometricConsentVersion: CONSENT_VERSIONS.biometricConsentVersion,
    birthday: "1994-02-03",
    subcontractorId: null,
    selfieBase64: selfieB64,
    ...o,
  };
}

async function waitFor(fn, ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise((res) => setTimeout(res, 1500));
  }
  return null;
}

async function noLogin(email) {
  try { await auth.getUserByEmail(email); return false; } catch (e) { return e.code === "auth/user-not-found"; }
}

async function makeRow(companyId, tag, extra = {}) {
  const id = `jc-inv-${RUN}-${tag}`;
  const pin = String(1000 + crypto.randomInt(9000));
  await co(companyId).collection("pins").doc(pin).create({ employeeId: id, updatedAt: Timestamp.now() });
  await emp(companyId, id).set({ name: `JC Inv Row ${RUN} ${tag}`, active: true, pin, hourlyRate: 21, assignedSiteIds: [companyId === PRO ? "site-north" : "site-core"], subcontractorId: null, subcontractorName: null, jcInviteTestRun: RUN, ...extra });
  made.rows.push({ companyId, id });
  return { id, pin };
}

async function pageState(token) {
  const r = await fetch(`${SITE}/i/${token}`);
  const html = await r.text();
  if (html.includes("Tap the invite link again.")) return "live";
  if (html.includes("This invite is no longer active")) return "inactive";
  return "unknown(" + r.status + ")";
}

async function main() {
  selfieB64 = await makeSelfie();

  // ---- dev site ----
  const aasa = await (await fetch(`${SITE}/.well-known/apple-app-site-association`)).text();
  check("Dev site AASA lists /i/* and /j/*", aasa.includes('"/i/*"') && aasa.includes('"/j/*"'), aasa.slice(0, 200));

  // ---- permissions ----
  const asEmployee = await create("jc-pro-employee", { kind: "newPerson", email: mail("perm"), siteId: null });
  check("Employee login can't create an invite (permission-denied)", !asEmployee.ok && asEmployee.code === "PERMISSION_DENIED", JSON.stringify(asEmployee));
  const asSup = await create("jc-pro-supervisor", { kind: "newPerson", email: mail("perm2"), siteId: null });
  check("Supervisor login can't create an invite", !asSup.ok && asSup.code === "PERMISSION_DENIED");
  const signedOut = await callFn("createEmployeeInvite", { kind: "newPerson", email: mail("perm3"), siteId: null });
  check("Signed out can't create an invite", !signedOut.ok && signedOut.code === "UNAUTHENTICATED");
  const badInput = await create("jc-core-admin", { kind: "newPerson", email: "not-an-email", siteId: null });
  check("Bad input refused (invalid-argument)", !badInput.ok && badInput.code === "INVALID_ARGUMENT");

  // ---- Core: new person, real email through Resend, full sign-up ----
  const coreNewEmail = mail("core-new");
  const c1 = await create("jc-core-admin", { kind: "newPerson", email: coreNewEmail, siteId: "site-core" });
  check("Core admin creates a new-person invite", c1.ok && c1.result.token.length === 43, JSON.stringify(c1));
  if (!c1.ok) return;
  const t1 = c1.result.token;
  const sent = await waitFor(async () => {
    const d = (await inviteRef(t1).get()).data();
    return d && d.emailStatus !== "pending" ? d : null;
  });
  check("Invite email sent through Resend (emailStatus sent)", sent && sent.emailStatus === "sent", sent && sent.emailError);
  check("Invite doc: pending, 7 days, Core Site, no row yet", sent && sent.status === "pending" && sent.siteId === "site-core" && sent.employeeId === null && Math.abs(sent.expiresAt.toMillis() - Date.now() - 7 * 86400000) < 120000);
  check("Landing page /i/{token} on the dev site is live", (await pageState(t1)) === "live");
  check("Landing page for a junk token says no longer active", (await pageState(crypto.randomBytes(32).toString("base64url"))) === "inactive");

  const info = await callFn("getInviteInfo", { token: t1 });
  check("getInviteInfo: active, Core company, Core subcontractor listed", info.ok && info.result.status === "active" && info.result.companyName === "JC-Test Core (dev)" && info.result.subcontractors.some((s) => s.id === "sub-core-acme"), JSON.stringify(info));
  check("getInviteInfo never returns the invited email", info.ok && !JSON.stringify(info.result).includes("resend.dev"));

  const wrong = await callFn("acceptEmployeeInvite", body(t1, mail("core-wrong")));
  check("Wrong email -> emailMismatch", !wrong.ok && wrong.reason === "emailMismatch", JSON.stringify(wrong));
  check("Wrong email created no login", await noLogin(mail("core-wrong")));

  const a1 = await callFn("acceptEmployeeInvite", body(t1, coreNewEmail, { subcontractorId: "sub-core-acme" }));
  check("Core new person signs up (deployed acceptEmployeeInvite)", a1.ok && /^\d{4}$/.test(a1.result.pin), JSON.stringify({ ok: a1.ok, reason: a1.reason, message: a1.message }));
  if (a1.ok) {
    const eid = a1.result.employeeId;
    made.rows.push({ companyId: CORE, id: eid });
    const row = (await emp(CORE, eid).get()).data();
    check("New row: Core Site, Core Acme, joinedVia invite, app login, photo", row.assignedSiteIds[0] === "site-core" && row.subcontractorId === "sub-core-acme" && row.joinedVia === "invite" && row.appAccess === true && typeof row.photoUrl === "string");
    check("Token never on the employee row", !JSON.stringify(row).includes(t1));
    const inv = (await inviteRef(t1).get()).data();
    check("Invite marked accepted with the new row", inv.status === "accepted" && inv.employeeId === eid);
    const s = await signInAs(coreNewEmail, PASSWORD);
    const user = await auth.getUserByEmail(coreNewEmail);
    check("New login signs in, claims role employee on Core", !!s.idToken && user.customClaims.role === "employee" && user.customClaims.companyId === CORE && user.customClaims.employeeId === eid);
    const again = await callFn("acceptEmployeeInvite", body(t1, coreNewEmail));
    check("Same link again -> inviteInactive (one-time use)", !again.ok && again.reason === "inviteInactive");
    check("Accepted invite page says no longer active", (await pageState(t1)) === "inactive");
  }

  // ---- Core: Invite to app on an existing row ----
  const row1 = await makeRow(CORE, "core-row");
  const rowEmail = mail("core-row");
  const c2 = await create("jc-core-admin", { kind: "existingEmployee", employeeId: row1.id, email: rowEmail });
  check("Core admin invites an existing row", c2.ok, JSON.stringify(c2));
  const dupRow = await create("jc-core-admin", { kind: "existingEmployee", employeeId: row1.id, email: mail("core-row-2") });
  check("Second pending invite for the same row refused", !dupRow.ok && dupRow.code === "ALREADY_EXISTS");
  const dupEmail = await create("jc-core-admin", { kind: "newPerson", email: rowEmail, siteId: null });
  check("Second pending invite for the same email refused", !dupEmail.ok && dupEmail.code === "ALREADY_EXISTS");
  if (c2.ok) {
    const a2 = await callFn("acceptEmployeeInvite", body(c2.result.token, rowEmail, { fullName: "Some Typed Name" }));
    check("Existing row signs up", a2.ok && a2.result.employeeId === row1.id && a2.result.pin === row1.pin, JSON.stringify({ ok: a2.ok, reason: a2.reason }));
    const row = (await emp(CORE, row1.id).get()).data();
    check("Same row linked: name, PIN, site, rate kept; dob saved", row.name === `JC Inv Row ${RUN} core-row` && row.pin === row1.pin && row.assignedSiteIds[0] === "site-core" && row.hourlyRate === 21 && row.dob === "1994-02-03" && row.appAccess === true);
  }

  // ---- extra rule 1: row deactivated after the invite ----
  const row2 = await makeRow(CORE, "core-off");
  const offEmail = mail("core-off");
  const c3 = await create("jc-core-admin", { kind: "existingEmployee", employeeId: row2.id, email: offEmail });
  if (c3.ok) {
    await emp(CORE, row2.id).update({ active: false });
    const a3 = await callFn("acceptEmployeeInvite", body(c3.result.token, offEmail));
    check("Row deactivated after invite -> inviteUnusable, no login", !a3.ok && a3.reason === "inviteUnusable" && (await noLogin(offEmail)), JSON.stringify(a3));
  } else check("Invite for row-off created", false, JSON.stringify(c3));

  // ---- revoke / remove / resend ----
  const revEmail = mail("core-rev");
  const c4 = await create("jc-core-admin", { kind: "newPerson", email: revEmail, siteId: null });
  if (c4.ok) {
    const t4 = c4.result.token;
    const otherCo = await callFn("revokeEmployeeInvite", { token: t4 }, "jc-pro-admin");
    check("Another company's admin can't revoke it (not-found)", !otherCo.ok && otherCo.code === "NOT_FOUND");
    const early = await callFn("resendEmployeeInvite", { token: t4 }, "jc-core-admin");
    check("Resend right after create -> cooldown", !early.ok && early.code === "RESOURCE_EXHAUSTED", JSON.stringify(early));
    await waitFor(async () => (await inviteRef(t4).get()).get("emailStatus") !== "pending");
    await inviteRef(t4).update({ lastEmailAttemptAt: Timestamp.fromMillis(Date.now() - 120000), expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    check("Expired invite page says no longer active", (await pageState(t4)) === "inactive");
    const rs = await callFn("resendEmployeeInvite", { token: t4 }, "jc-core-admin");
    const d4 = (await inviteRef(t4).get()).data();
    check("Resend an expired invite: sent, fresh 7 days, count 1", rs.ok && d4.emailStatus === "sent" && d4.resendCount === 1 && d4.expiresAt.toMillis() > Date.now() + 6.9 * 86400000, JSON.stringify(rs));
    const rmLive = await callFn("removeEmployeeInvite", { token: t4 }, "jc-core-admin");
    check("Remove refused while live", !rmLive.ok && rmLive.code === "FAILED_PRECONDITION");
    const rv = await callFn("revokeEmployeeInvite", { token: t4 }, "jc-core-owner");
    check("Owner revokes it", rv.ok && (await inviteRef(t4).get()).get("status") === "revoked");
    const a4 = await callFn("acceptEmployeeInvite", body(t4, revEmail));
    check("Revoked link -> inviteInactive, no login", !a4.ok && a4.reason === "inviteInactive" && (await noLogin(revEmail)));
    const rm = await callFn("removeEmployeeInvite", { token: t4 }, "jc-core-admin");
    check("Remove after revoke deletes it", rm.ok && !(await inviteRef(t4).get()).exists);
  } else check("Invite for revoke test created", false, JSON.stringify(c4));

  // ---- Pro existing row: old face reference deleted after success ----
  const row3 = await makeRow(PRO, "pro-row");
  const oldPath = `companies/${PRO}/employees/${row3.id}/reference.jpg`;
  await bucket.file(oldPath).save(Buffer.from(selfieB64, "base64"), { contentType: "image/jpeg", resumable: false });
  const oldTok = crypto.randomUUID();
  await bucket.file(oldPath).setMetadata({ metadata: { firebaseStorageDownloadTokens: oldTok } });
  await emp(PRO, row3.id).update({ photoUrl: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(oldPath)}?alt=media&token=${oldTok}` });
  const proEmail = mail("pro-row");
  const c5 = await create("jc-pro-admin", { kind: "existingEmployee", employeeId: row3.id, email: proEmail });
  if (c5.ok) {
    const a5 = await callFn("acceptEmployeeInvite", body(c5.result.token, proEmail, { subcontractorId: "sub-acme" }));
    check("Pro existing row signs up", a5.ok, JSON.stringify({ ok: a5.ok, reason: a5.reason }));
    const [exists] = await bucket.file(oldPath).exists();
    const row = (await emp(PRO, row3.id).get()).data();
    check("Pro: old face reference file deleted", !exists);
    check("Pro: photoUrl (face reference) is the new selfie copy", row.photoUrl.includes(encodeURIComponent("-photo.jpg")));
    check("Pro: subcontractor change logged in history", row.subcontractorId === "sub-acme" && Array.isArray(row.subcontractorHistory) && row.subcontractorHistory.length === 1);
  } else check("Pro invite created", false, JSON.stringify(c5));

  // ---- rollback through the real dev Storage/Auth (local run, failAt) ----
  const rbEmail = mail("core-rb");
  const c6 = await create("jc-core-admin", { kind: "newPerson", email: rbEmail, siteId: null });
  if (c6.ok) {
    let reason = null;
    try { await acc.runAcceptEmployeeInvite(body(c6.result.token, rbEmail), { failAt: "photoUrl" }); } catch (e) { reason = e.details && e.details.reason; }
    const d6 = (await inviteRef(c6.result.token).get()).data();
    check("Rollback after photoUrl: generic error, no login, invite back to pending", reason === "generic" && (await noLogin(rbEmail)) && d6.status === "pending" && d6.employeeId === null);
    const [rbFiles] = await bucket.getFiles({ prefix: `companies/${CORE}/employees/` });
    const leftovers = rbFiles.filter((f) => f.name.includes(`invite-${d6.inviteId}`));
    check("Rollback left no photo files", leftovers.length === 0, leftovers.map((f) => f.name).join(","));
  } else check("Invite for rollback created", false, JSON.stringify(c6));
}

async function cleanup() {
  // inviteIds first: a rolled-back sign-up's consent record (kept as proof
  // of destruction) has a uid that no longer exists, so match on these.
  const inviteIds = new Set();
  for (const t of made.tokens) {
    const s = await inviteRef(t).get();
    if (s.exists) inviteIds.add(s.get("inviteId"));
  }
  const uids = [];
  for (const e of made.emails) {
    try { const u = await auth.getUserByEmail(e); uids.push(u.uid); await auth.deleteUser(u.uid); } catch {}
  }
  for (const uid of uids) await db.collection("users").doc(uid).delete();
  const rowIds = new Set(made.rows.map((r) => r.id));
  for (const { companyId, id } of made.rows) {
    const snap = await emp(companyId, id).get();
    const pin = snap.exists ? snap.get("pin") : null;
    if (pin) {
      const p = await co(companyId).collection("pins").doc(pin).get();
      if (p.exists && p.get("employeeId") === id) await p.ref.delete();
    }
    await emp(companyId, id).delete();
    await co(companyId).collection("employeeConsents").doc(id).delete();
    await co(companyId).collection("employeeSelfViews").doc(id).delete();
    await bucket.deleteFiles({ prefix: `companies/${companyId}/employees/${id}/` });
  }
  for (const c of [PRO, CORE]) {
    const alerts = await co(c).collection("alerts").get();
    for (const d of alerts.docs) if (rowIds.has(d.get("employeeId"))) await d.ref.delete();
    const consents = await co(c).collection("employeeConsents").get();
    for (const d of consents.docs) if (uids.includes(d.get("uid")) || inviteIds.has(d.get("employeeInviteId"))) await d.ref.delete();
  }
  for (const t of made.tokens) await inviteRef(t).delete();
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
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\nAPI employee invites: ${results.length - failed}/${results.length} passed${crashed ? " (stopped early)" : ""}`);
  process.exit(failed || crashed ? 1 : 0);
})();
