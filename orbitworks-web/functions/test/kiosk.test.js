// Task 5 (Kiosk mode) - the kiosk callables (functions/src/kiosk.ts), the
// kiosk toggle in setEmployeeRole, the kiosk invite in acceptInvite, and the
// pure rules in kioskTypes.ts / lib/kioskCounts.ts. Runs the REAL compiled
// functions (lib/) against the Firestore + Auth emulators. Storage is an
// in-memory fake and Rekognition is stubbed (same as employeeClock.test.js).
//
// Run: firebase emulators:exec --only firestore,auth "node --test test/kiosk.test.js"
process.env.GCLOUD_PROJECT = "orbitworks-kiosk-test";
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "localhost:8090";
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
process.env.REKOGNITION_ACCESS_KEY_ID = "test-access-key";
process.env.REKOGNITION_SECRET_ACCESS_KEY = "test-secret-key";
process.env.MAPBOX_TOKEN = "";
process.env.ALERTS_FEED_ENABLED = "false";
process.env.DEVICE_TRACKING_ENABLED = "false";
process.env.PUSH_NOTIFICATIONS_ENABLED = "false";
process.env.KIOSK_ENABLED = "true";

const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, createHash } = require("node:crypto");
const admin = require("firebase-admin");
const { RekognitionClient } = require("@aws-sdk/client-rekognition");
RekognitionClient.prototype.send = async () => ({ FaceMatches: [{ Similarity: 98 }], UnmatchedFaces: [] });

const { db } = require("../lib/shared.js");
const funcs = require("../lib/index.js");
const kt = require("../lib/kioskTypes.js");
const { withoutKiosks } = require("../lib/lib/kioskCounts.js");
const { loginRoleFor } = require("../lib/employeeAccess.js");

// ---- in-memory Storage fake ----
const files = new Map();
admin.storage().bucket = () => ({
  name: "test-bucket",
  file: (p) => ({
    getMetadata: async () => {
      if (!files.has(p)) throw Object.assign(new Error("nf"), { code: 404 });
      return [files.get(p)];
    },
    setMetadata: async () => [files.get(p)],
    delete: async () => files.delete(p),
    download: async () => [Buffer.from("x")],
  }),
});
const addPhoto = (p) =>
  files.set(p, { contentType: "image/jpeg", size: "2000", timeCreated: new Date().toISOString(), metadata: { firebaseStorageDownloadTokens: "t" } });

const hash = (salt, pin) => createHash("sha256").update(`${salt}:${pin}`).digest("hex");
const KIOSK_UID = (c) => `kiosk-uid-${c}`;
const kioskAuth = (c, extra = {}) => ({ uid: KIOSK_UID(c), token: { role: "kiosk", companyId: c, employeeId: "kiosk1", ...extra } });
const ownerAuth = (c) => ({ uid: `owner-${c}`, token: { role: "owner", companyId: c } });
const run = (fn, data, auth) => funcs[fn].run({ data, auth, rawRequest: {} });

async function rejects(p, reason) {
  await assert.rejects(p, (err) => {
    if (reason && err.details?.reason !== reason) {
      assert.fail(`expected reason ${reason}, got ${err.details?.reason} (${err.code}: ${err.message})`);
    }
    return true;
  });
}

// Company c: Pro, emp1 (PIN 1234, pay + PII on the doc), emp2 inactive,
// admins: fullAdm (Full access, PIN 5555), setAdm (Settings perm, 6666),
// noAdm (no perms, 7777); sup1 supervisor (8888); kiosk1 = the kiosk.
async function seed(c, { plan = "pro_tier1" } = {}) {
  const co = db.collection("companies").doc(c);
  await co.set({ name: "Co " + c, planTier: plan, employeeCap: 50, activeEmployeeCount: 5, totalEmployeeCount: 6 });
  await co.collection("jobSites").doc("site1").set({ name: "Yard", active: true });
  const emp = (id, d, pin) => Promise.all([
    co.collection("employees").doc(id).set({ active: true, assignedSiteIds: ["site1"], ...d }),
    pin ? co.collection("employeePins").doc(id).set({ pin }) : null,
  ]);
  await emp("emp1", { name: "Ana", hourlyRate: 25, dob: "1990-01-01", email: "ana@x.com", phone: "555", photoUrl: "https://p" }, "1234");
  await emp("emp2", { name: "Old", active: false }, "2222");
  await emp("fullEmp", { name: "Fay", isAdmin: true, linkedUserId: "fullAdm" }, "5555");
  await emp("setEmp", { name: "Sid", isAdmin: true, linkedUserId: "setAdm" }, "6666");
  await emp("noEmp", { name: "Ned", isAdmin: true, linkedUserId: "noAdm" }, "7777");
  await emp("supEmp", { name: "Sue", isSupervisor: true, linkedUserId: "supUid" }, "8888");
  await emp("kiosk1", { name: "Front iPad", kiosk: true, linkedUserId: KIOSK_UID(c) }, "9999");
  const perms = (on) => ({ approveHours: false, employees: false, editPay: false, exportPayroll: false, analytics: false, billing: false, settings: on, invites: false });
  await db.doc("users/fullAdm").set({ role: "admin", companyId: c, adminAccess: { level: "full", sites: "all", permissions: perms(false) } });
  await db.doc("users/setAdm").set({ role: "admin", companyId: c, adminAccess: { level: "admin", sites: "all", permissions: perms(true) } });
  await db.doc("users/noAdm").set({ role: "admin", companyId: c, adminAccess: { level: "admin", sites: "all", permissions: perms(false) } });
  await db.doc("users/supUid").set({ role: "supervisor", companyId: c });
  await db.doc(`users/${KIOSK_UID(c)}`).set({ role: "kiosk", companyId: c, name: "Front iPad" });
  return co;
}

// ---------------- getKioskPinTable ----------------

test("pin table: only id/name/salted hash/sites/last event - no pay, PII, photos or plain PINs", async () => {
  await seed("t1");
  const t = await run("getKioskPinTable", {}, kioskAuth("t1"));
  assert.equal(t.v, 1);
  assert.equal(t.isPro, true);
  assert.deepEqual(t.employees.map((e) => e.id).sort(), ["emp1", "fullEmp", "noEmp", "setEmp", "supEmp"]); // no inactive emp2, no kiosk1
  for (const e of t.employees) {
    assert.deepEqual(Object.keys(e).sort(), ["assignedSiteIds", "hash", "id", "lastEventSiteId", "lastEventSiteName", "lastEventTimestamp", "lastEventType", "name"]);
  }
  const ana = t.employees.find((e) => e.id === "emp1");
  assert.equal(ana.hash, hash(t.salt, "1234"));
  const json = JSON.stringify(t);
  for (const secret of ["1234", "5555", "9999", "1990-01-01", "ana@x.com", "555", "https://p", "hourlyRate", "25"]) {
    assert.ok(!json.includes(`"${secret}"`) && !json.includes(`:${secret},`), `leaked ${secret}`);
  }
  // A new salt every call (K12).
  const t2 = await run("getKioskPinTable", {}, kioskAuth("t1"));
  assert.notEqual(t2.salt, t.salt);
  assert.notEqual(t2.employees.find((e) => e.id === "emp1").hash, ana.hash);
});

test("pin table: unlockers = linked admins with Full access or Settings (K17); no supervisors, no-perm admins", async () => {
  await seed("t2");
  const t = await run("getKioskPinTable", {}, kioskAuth("t2"));
  assert.deepEqual(t.unlockers.map((u) => u.id).sort(), ["fullEmp", "setEmp"]);
  assert.equal(t.unlockers.find((u) => u.id === "setEmp").hash, hash(t.salt, "6666"));
});

test("pin table: refused for every non-kiosk role, a stale/foreign kiosk, an inactive kiosk, and the flag off", async () => {
  const co = await seed("t3");
  await rejects(run("getKioskPinTable", {}, { uid: "supUid", token: { role: "supervisor", companyId: "t3", employeeId: "supEmp" } }), "notKiosk");
  await rejects(run("getKioskPinTable", {}, { uid: "e", token: { role: "employee", companyId: "t3", employeeId: "emp1" } }), "notKiosk");
  await rejects(run("getKioskPinTable", {}, ownerAuth("t3")), "notKiosk");
  // claim points at a record linked to someone else / not a kiosk
  await rejects(run("getKioskPinTable", {}, kioskAuth("t3", { employeeId: "emp1" })), "notKiosk");
  await rejects(run("getKioskPinTable", {}, { uid: "intruder", token: { role: "kiosk", companyId: "t3", employeeId: "kiosk1" } }), "notKiosk");
  // another company's kiosk claim on this company
  await seed("t3b");
  await rejects(run("getKioskPinTable", {}, { uid: KIOSK_UID("t3b"), token: { role: "kiosk", companyId: "t3", employeeId: "kiosk1" } }), "notKiosk");
  await co.collection("employees").doc("kiosk1").update({ active: false });
  await rejects(run("getKioskPinTable", {}, kioskAuth("t3")), "inactive");
  await co.collection("employees").doc("kiosk1").update({ active: true });
  process.env.KIOSK_ENABLED = "false";
  try {
    await rejects(run("getKioskPinTable", {}, kioskAuth("t3")), "kioskOff");
  } finally {
    process.env.KIOSK_ENABLED = "true";
  }
});

// ---------------- kioskPunch ----------------

function punch(c, action, extra = {}) {
  const requestId = randomUUID();
  const photoPath = `companies/${c}/clockEvents/emp1/${requestId}.jpg`;
  const inOut = action === "in" || action === "out";
  if (inOut && !extra.noPhoto) addPhoto(photoPath);
  const { noPhoto, ...rest } = extra;
  return run("kioskPunch", { action, requestId, employeeId: "emp1", pin: "1234", ...(inOut ? { photoPath } : {}), ...rest }, kioskAuth(c));
}

test("kioskPunch: in -> break (PIN) -> out; source kiosk, kiosk uid, device name; no photo URL back", async () => {
  const co = await seed("p1");
  const deviceId = randomUUID();
  await co.collection("devices").doc(deviceId).set({ name: "Gate iPad", platform: "ios" });
  const r = await punch("p1", "in", { deviceId });
  assert.equal(r.status, "in");
  assert.equal(r.photoUrl, null);
  assert.equal(r.fence, null);
  const ev = (await co.collection("clockEvents").doc(r.eventId).get()).data();
  assert.equal(ev.source, "kiosk");
  assert.equal(ev.createdByUid, KIOSK_UID("p1"));
  assert.equal(ev.kioskEmployeeId, "kiosk1");
  assert.equal(ev.deviceId, deviceId);
  assert.equal(ev.deviceNameSnapshot, "Gate iPad");
  assert.equal(ev.employeeId, "emp1");
  assert.ok(ev.photoUrl);
  assert.equal(ev.geofenceRadiusM, undefined);

  await rejects(punch("p1", "breakStart", { pin: "0000" }), "wrongPin");
  const b = await punch("p1", "breakStart");
  assert.equal(b.status, "break");
  assert.equal((await punch("p1", "breakEnd")).status, "in");
  assert.equal((await punch("p1", "out")).status, "out");
});

test("kioskPunch: optional comment on clock in/out is saved as employeeComment (trimmed); never on a break", async () => {
  const co = await seed("pc");
  const r = await punch("pc", "in", { employeeComment: "  Traffic, 10 min late  " });
  assert.equal((await co.collection("clockEvents").doc(r.eventId).get()).get("employeeComment"), "Traffic, 10 min late");
  await rejects(punch("pc", "breakStart", { employeeComment: "x" }), "invalid");
  await rejects(punch("pc", "out", { employeeComment: "x".repeat(501) }), "invalid");
  const o = await punch("pc", "out", { employeeComment: "   " }).catch((e) => e);
  assert.equal(o.details?.reason, "invalid"); // blank after trim = refused (the app sends none instead)
  const o2 = await punch("pc", "out");
  assert.equal((await co.collection("clockEvents").doc(o2.eventId).get()).get("employeeComment"), undefined);
});

test("kioskPunch: a break needs a clock-in first; PIN on every action; no photo on a break", async () => {
  await seed("p2");
  await rejects(punch("p2", "breakStart"), "wrongState");
  await rejects(run("kioskPunch", { action: "breakStart", requestId: randomUUID(), employeeId: "emp1" }, kioskAuth("p2")), "invalid");
  await rejects(run("kioskPunch", { action: "breakStart", requestId: randomUUID(), employeeId: "emp1", pin: "1234", photoPath: "companies/p2/clockEvents/emp1/x.jpg" }, kioskAuth("p2")), "invalid");
});

test("kioskPunch: final audit A - a salted PIN proof works like the PIN; never both, never neither", async () => {
  await seed("pp");
  const salt = "c2FsdHNhbHRzYWx0";
  const proof = (pin) => ({ salt, hash: createHash("sha256").update(`${salt}:${pin}`, "utf8").digest("hex") });
  const { pinFromVerifierProof } = require("../lib/lib/pinVerifier.js");
  assert.equal(pinFromVerifierProof(proof("1234")), "1234");
  assert.equal(pinFromVerifierProof(proof("0007")), "0007");
  assert.equal(pinFromVerifierProof({ salt, hash: "0".repeat(64) }), null);
  const r = await punch("pp", "in", { pin: undefined, pinProof: proof("1234"), queuedAtMs: Date.now() - 1000 });
  assert.equal(r.status, "in");
  await rejects(punch("pp", "breakStart", { pin: undefined, pinProof: proof("0000") }), "wrongPin");
  await rejects(punch("pp", "breakStart", { pinProof: proof("1234") }), "invalid"); // pin + proof
  await rejects(punch("pp", "breakStart", { pin: undefined, pinProof: { salt, hash: "nothex" } }), "invalid");
  assert.equal((await punch("pp", "breakStart", { pin: undefined, pinProof: proof("1234") })).status, "break");
});

test("kioskPunch: 5 wrong PINs a minute locks the kiosk (server side), right PINs never count", async () => {
  await seed("p3");
  for (let i = 0; i < 4; i++) await rejects(punch("p3", "in", { pin: "0000" }), "wrongPin");
  await rejects(punch("p3", "in", { pin: "0000" }), "locked");
  await rejects(punch("p3", "in"), "locked");
  // the employee's own Employee App lock is untouched
  assert.equal((await db.doc("companies/p3/employeePinLocks/emp1").get()).exists, false);
});

test("kioskPunch: never for the kiosk record, an inactive employee, or another company's employee", async () => {
  await seed("p4");
  await seed("p4b");
  await rejects(run("kioskPunch", { action: "breakStart", requestId: randomUUID(), employeeId: "kiosk1", pin: "9999" }, kioskAuth("p4")), "wrongAccount");
  await rejects(run("kioskPunch", { action: "breakStart", requestId: randomUUID(), employeeId: "emp2", pin: "2222" }, kioskAuth("p4")), "inactive");
  await db.doc("companies/p4b/employees/onlyB").set({ name: "B", active: true });
  await db.doc("companies/p4b/employeePins/onlyB").set({ pin: "4321" });
  await rejects(run("kioskPunch", { action: "breakStart", requestId: randomUUID(), employeeId: "onlyB", pin: "4321" }, kioskAuth("p4")), "wrongAccount");
});

test("kioskPunch: Pro only; after a downgrade, queued punches made before it still go in (K20)", async () => {
  const co = await seed("p5", { plan: "core2_tier1" });
  await rejects(punch("p5", "in"), "notPro");
  const changedAt = Date.now() - 60 * 1000;
  await co.update({ planTierChangedAt: admin.firestore.Timestamp.fromMillis(changedAt) });
  const before = await punch("p5", "in", { queuedAtMs: changedAt - 5 * 60 * 1000 });
  assert.equal(before.status, "in");
  await rejects(punch("p5", "out", { queuedAtMs: changedAt + 10 * 1000 }), "notPro");
});

test("supervisor/employee callers can't use kioskPunch; a kiosk can't use employeeClockPunch", async () => {
  await seed("p6");
  const data = { action: "breakStart", requestId: randomUUID(), employeeId: "emp1", pin: "1234" };
  await rejects(run("kioskPunch", data, { uid: "supUid", token: { role: "supervisor", companyId: "p6", employeeId: "supEmp" } }), "notKiosk");
  await rejects(run("kioskPunch", data, { uid: "e", token: { role: "employee", companyId: "p6", employeeId: "emp1" } }), "notKiosk");
  await rejects(run("employeeClockPunch", { action: "breakStart", requestId: randomUUID() }, kioskAuth("p6")), "wrongAccount");
  await rejects(run("getPinSyncTable", {}, kioskAuth("p6")));
  await rejects(run("getMyPinVerifier", {}, kioskAuth("p6")));
  await rejects(run("getShiftData", {}, kioskAuth("p6")));
});

test("supervisor PIN table never includes a kiosk record (K8)", async () => {
  await seed("p7");
  const t = await run("getPinSyncTable", {}, { uid: "supUid", token: { role: "supervisor", companyId: "p7", employeeId: "supEmp" } });
  assert.ok(!t.employees.some((e) => e.id === "kiosk1"));
  assert.ok(t.employees.some((e) => e.id === "emp1"));
});

// ---------------- exit key ----------------

test("exit key: owner / Full access / Settings make it; single use; for one kiosk; expires", async () => {
  const co = await seed("x1");
  await co.collection("employees").doc("kiosk2").set({ name: "Back iPad", active: true, kiosk: true, linkedUserId: "kiosk2uid" });
  const { key, expiresAtMs } = await run("createKioskExitKey", { kioskEmployeeId: "kiosk1" }, ownerAuth("x1"));
  assert.match(key, /^\d{4}$/);
  assert.ok(expiresAtMs - Date.now() > 9 * 60 * 1000 && expiresAtMs - Date.now() <= 10 * 60 * 1000);
  const held = (await co.collection("pins").doc(key).get()).data();
  assert.equal(held.employeeId, kt.KIOSK_EXIT_KEY_HOLDER);
  const stored = (await co.collection("kioskExitKeys").get()).docs[0].data();
  assert.ok(!JSON.stringify(stored).includes(`"${key}"`));

  // another kiosk can't use it
  await rejects(run("checkKioskUnlock", { code: key }, { uid: "kiosk2uid", token: { role: "kiosk", companyId: "x1", employeeId: "kiosk2" } }), "wrongKey");
  assert.deepEqual(await run("checkKioskUnlock", { code: key }, kioskAuth("x1")), { ok: true });
  await rejects(run("checkKioskUnlock", { code: key }, kioskAuth("x1")), "wrongKey");
  assert.equal((await co.collection("pins").doc(key).get()).exists, false);

  // expired
  const k2 = await run("createKioskExitKey", { kioskEmployeeId: "kiosk1" }, { uid: "setAdm", token: { role: "admin", companyId: "x1" } });
  const keyDoc = (await co.collection("kioskExitKeys").where("usedAt", "==", null).get()).docs[0];
  await keyDoc.ref.update({ expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() - 1000) });
  await rejects(run("checkKioskUnlock", { code: k2.key }, kioskAuth("x1")), "wrongKey");

  // who can make one (K16)
  await run("createKioskExitKey", { kioskEmployeeId: "kiosk1" }, { uid: "fullAdm", token: { role: "admin", companyId: "x1" } });
  await assert.rejects(run("createKioskExitKey", { kioskEmployeeId: "kiosk1" }, { uid: "noAdm", token: { role: "admin", companyId: "x1" } }), /Settings/);
  await rejects(run("createKioskExitKey", { kioskEmployeeId: "kiosk1" }, { uid: "supUid", token: { role: "supervisor", companyId: "x1" } }));
  await rejects(run("createKioskExitKey", { kioskEmployeeId: "emp1" }, ownerAuth("x1")), "notKiosk");
});

test("exit key: an employee can't take a PIN an exit key holds", async () => {
  const co = await seed("x2");
  const { key } = await run("createKioskExitKey", { kioskEmployeeId: "kiosk1" }, ownerAuth("x2"));
  await assert.rejects(run("setEmployeePin", { employeeId: "emp1", pin: key }, ownerAuth("x2")), /already assigned/);
  assert.equal((await co.collection("employeePins").doc("emp1").get()).data().pin, "1234");
});

// ---------------- setEmployeeRole: Kiosk access ----------------

async function linkedRecord(c, id, extra = {}) {
  const uid = `${c}-${id}-uid`;
  await admin.auth().deleteUser(uid).catch(() => {});
  await admin.auth().createUser({ uid, email: `${uid}@example.com` });
  await db.doc(`companies/${c}/employees/${id}`).set({ name: "Tablet", active: true, linkedUserId: uid, isSupervisor: true, ...extra });
  await db.doc(`users/${uid}`).set({ role: "supervisor", companyId: c });
  return uid;
}

test("Kiosk access on: role kiosk in claims + users doc, Supervisor/Admin cleared; off again: supervisor floor", async () => {
  await seed("r1");
  const uid = await linkedRecord("r1", "tab");
  await run("setEmployeeRole", { employeeId: "tab", isKiosk: true }, ownerAuth("r1"));
  const emp = (await db.doc("companies/r1/employees/tab").get()).data();
  assert.equal(emp.kiosk, true);
  assert.equal(emp.isSupervisor, false);
  assert.equal(emp.isAdmin, false);
  assert.equal((await db.doc(`users/${uid}`).get()).data().role, "kiosk");
  const claims = (await admin.auth().getUser(uid)).customClaims;
  assert.deepEqual(claims, { role: "kiosk", companyId: "r1", employeeId: "tab" });

  await run("setEmployeeRole", { employeeId: "tab", isKiosk: false, isSupervisor: true }, ownerAuth("r1"));
  assert.equal((await db.doc("companies/r1/employees/tab").get()).data().kiosk, false);
  assert.equal((await admin.auth().getUser(uid)).customClaims.role, "supervisor");
});

test("Kiosk access refused: combined with other access, Employee App login, clocked in, Core, flag off", async () => {
  await seed("r2");
  const core = await seed("r2c", { plan: "core2_tier1" });
  await linkedRecord("r2", "a");
  await assert.rejects(run("setEmployeeRole", { employeeId: "a", isKiosk: true, isSupervisor: true }, ownerAuth("r2")), /can't be combined/);
  await linkedRecord("r2", "b", { appAccess: true });
  await assert.rejects(run("setEmployeeRole", { employeeId: "b", isKiosk: true }, ownerAuth("r2")), /Employee App/);
  await linkedRecord("r2", "c", { lastEventType: "in" });
  await assert.rejects(run("setEmployeeRole", { employeeId: "c", isKiosk: true }, ownerAuth("r2")), /clocked in/);
  await linkedRecord("r2c", "d");
  await assert.rejects(run("setEmployeeRole", { employeeId: "d", isKiosk: true }, ownerAuth("r2c")), /Pro/);
  assert.ok(core);
  process.env.KIOSK_ENABLED = "false";
  try {
    await assert.rejects(run("setEmployeeRole", { employeeId: "a", isKiosk: true }, ownerAuth("r2")), /isn't available/);
  } finally {
    process.env.KIOSK_ENABLED = "true";
  }
  // Supervisor/Admin toggles unchanged by all this
  await run("setEmployeeRole", { employeeId: "a", isSupervisor: true }, ownerAuth("r2"));
  const a = (await db.doc("companies/r2/employees/a").get()).data();
  assert.equal(a.kiosk, undefined);
});

// ---------------- acceptInvite: kiosk invite ----------------

test("kiosk invite: accepting links the record as a kiosk login", async () => {
  await seed("i1");
  await db.doc("companies/i1/employees/lobby").set({ name: "Lobby iPad", active: true });
  const inviteRef = await db.collection("invites").add({ companyId: "i1", role: "kiosk", email: "lobby@example.com", linkExistingEmployeeId: "lobby", status: "pending", name: "Lobby iPad" });
  const uid = "lobby-uid";
  await admin.auth().deleteUser(uid).catch(() => {});
  await db.doc(`users/${uid}`).delete();
  await admin.auth().createUser({ uid, email: "lobby@example.com" });
  const r = await funcs.acceptInvite.run({ data: { inviteId: inviteRef.id }, auth: { uid, token: { email: "lobby@example.com" } }, rawRequest: {} });
  assert.deepEqual(r, { companyId: "i1", role: "kiosk" });
  const emp = (await db.doc("companies/i1/employees/lobby").get()).data();
  assert.equal(emp.kiosk, true);
  assert.equal(emp.linkedUserId, uid);
  assert.equal((await db.doc(`users/${uid}`).get()).data().role, "kiosk");
  assert.equal((await admin.auth().getUser(uid)).customClaims.role, "kiosk");
});

// ---------------- pure rules ----------------

test("pure: plan gate, limiter, counts, loginRoleFor", () => {
  assert.equal(kt.kioskPlanAllows("pro_tier2", null, 5), true);
  assert.equal(kt.kioskPlanAllows("core2_tier1", null, 5), false);
  assert.equal(kt.kioskPlanAllows("core2_tier1", 10, 10), true);
  assert.equal(kt.kioskPlanAllows("free", 10, 11), false);

  let s;
  for (let i = 0; i < 5; i++) s = kt.limiterAfterWrong(s, 1000 + i);
  assert.equal(s.count, 5);
  assert.equal(kt.limiterLockedFor(s, 2000), 59);
  assert.equal(kt.limiterLockedFor(s, 1000 + 60 * 1000), 0);
  assert.deepEqual(kt.limiterAfterWrong(s, 1000 + 60 * 1000), { count: 1, windowStartMs: 61000 });

  const snap = (docs) => ({ empty: docs.length === 0, size: docs.length, docs: docs.map((a) => ({ get: () => a })) });
  assert.deepEqual(withoutKiosks({ active: 10, total: 12 }, snap([true, false])), { active: 9, total: 10 });
  assert.deepEqual(withoutKiosks({ active: 3, total: 3 }, null), { active: 3, total: 3 });

  assert.equal(loginRoleFor({ kiosk: true, isAdmin: true }), "kiosk");
  assert.equal(loginRoleFor({ isAdmin: true }), "admin");
  assert.equal(loginRoleFor({ appAccess: true }), "employee");
  assert.equal(loginRoleFor({}), "supervisor");
});
