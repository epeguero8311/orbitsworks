// DEV ONLY - LIVE security checks against the DEPLOYED dev rules + functions
// (orbitworks-dev-ew; the project is fixed below). Real email/password
// sign-ins through the Firebase client SDK (what the apps and website use);
// the Admin SDK (ADC) only looks up fixture ids and puts the positive-control
// writes back (tips $0, shifts pending).
//
//   cd functions && node scripts/devLiveSecurityChecks.mjs
//
// Needs: scripts/devSeedSecurity.js --apply (Security Test Co + logins),
// scripts/devSeedKiosk.js (OT Test Co kiosk login), passwords in
// scripts/.dev-seed-logins.local. Groups: restricted admin (Site A only),
// existing-style admin (no access fields), kiosk, supervisor app 1.1.4
// (payloads from test/liveClientsCompat.test.js), Employee App. Writes test
// punches / notes / devices into Security Test Co only. Exit 1 on any failure.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
const W = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const wreq = createRequire(`${W}/package.json`);
const freq = createRequire(`${W}/functions/package.json`);
const { initializeApp } = wreq("firebase/app");
const { getAuth, signInWithEmailAndPassword } = wreq("firebase/auth");
const F = wreq("firebase/firestore");
const { getFunctions, httpsCallable } = wreq("firebase/functions");
const { getStorage, ref: sref, uploadBytes } = wreq("firebase/storage");
const { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, orderBy, limit, writeBatch, arrayUnion, serverTimestamp, Timestamp } = F;

const PROJECT = "orbitworks-dev-ew";
process.env.GCLOUD_PROJECT = PROJECT;
const admin = freq("firebase-admin");
admin.initializeApp({ projectId: PROJECT });
const adb = admin.firestore();

const CONFIG = {
  apiKey: "AIzaSyCmxM7S1kTHVwC6YJlQcDYebBayFhLX8jQ",
  authDomain: "orbitworks-dev-ew.firebaseapp.com",
  projectId: PROJECT,
  storageBucket: "orbitworks-dev-ew.firebasestorage.app",
  messagingSenderId: "797101077485",
  appId: "1:797101077485:web:319119d9bf71be32336de4",
};
const SITE = "https://orbitsworks-backend--orbitworks-dev-ew.us-central1.hosted.app";

// ---- logins ----
const loginsText = fs.readFileSync(`${W}/functions/scripts/.dev-seed-logins.local`, "utf8");
const pw = (email) => {
  const line = loginsText.split(/\r?\n/).find((l) => l.includes(`email=${email}`));
  const m = line && /password=(\S+)/.exec(line);
  if (!m) throw new Error(`no password for ${email}`);
  return m[1];
};
const sessions = {};
async function login(key, email) {
  const app = initializeApp(CONFIG, key);
  const auth = getAuth(app);
  const cred = await signInWithEmailAndPassword(auth, email, pw(email));
  const token = await cred.user.getIdTokenResult();
  sessions[key] = { app, auth, uid: cred.user.uid, db: F.getFirestore(app), fn: getFunctions(app, "us-central1"), storage: getStorage(app), claims: token.claims, idToken: token.token };
  return sessions[key];
}

// ---- result helpers ----
const results = [];
function rec(group, name, ok, detail = "") {
  results.push({ group, name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} [${group}] ${name}${detail ? " - " + detail : ""}`);
}
async function denied(group, name, fn) {
  try {
    await fn();
    rec(group, name, false, "ALLOWED (expected refused)");
  } catch (e) {
    const code = e.code || e.message;
    const ok = /permission-denied|PERMISSION_DENIED|unauthenticated/.test(code);
    rec(group, name, ok, ok ? `refused (${code})` : `refused, but with ${code}: ${e.message}`);
  }
}
async function allowed(group, name, fn) {
  try {
    const out = await fn();
    rec(group, name, true, typeof out === "string" ? out : "");
    return out;
  } catch (e) {
    rec(group, name, false, `${e.code || ""} ${e.message}`);
    return undefined;
  }
}
const NOPERM = { approveHours: false, employees: false, editPay: false, exportPayroll: false, analytics: false, billing: false, settings: false, invites: false };
const ALLPERM = { approveHours: true, employees: true, editPay: true, exportPayroll: true, analytics: true, billing: true, settings: true, invites: true };
const call = (s, name, data) => httpsCallable(s.fn, name)(data).then((r) => r.data);

// ---- fixtures ----
const SEC = "sec-test-company";
const OT = "ot-test-company";
const approvals = (await adb.collection(`companies/${SEC}/timesheetApprovals`).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const siteA = approvals.filter((a) => a.siteId === "site-a").sort((x, y) => x.date.localeCompare(y.date));
const siteC = approvals.filter((a) => a.siteId === "site-c").sort((x, y) => x.date.localeCompare(y.date));
if (!siteA.length || !siteC.length) throw new Error("fixtures missing - run scripts/devSeedSecurity.js");
const A1 = siteA[0].id, C1 = siteC[0].id;
const ownerUid = (await adb.collection("companies").doc(SEC).get()).get("ownerUid");
const range = { startMs: Date.UTC(2026, 10, 22), endMs: Date.UTC(2026, 10, 26) };

const owner = await login("owner", "sec-owner@dev.orbitsworks.test");
const ra = await login("restricted", "sec-admin-a@dev.orbitsworks.test");
const legacy = await login("legacy", "sec-legacy-admin@dev.orbitsworks.test");
const sup = await login("supervisor", "sec-supervisor@dev.orbitsworks.test");
const emp = await login("employee", "sec-employee@dev.orbitsworks.test");
const kiosk = await login("kiosk", "ot-kiosk@dev.orbitsworks.test");
console.log("claims:", JSON.stringify({ restricted: ra.claims.allSites, legacy: [legacy.claims.role, legacy.claims.lvl ?? null], kiosk: kiosk.claims.role }));

// =================== 1. Restricted admin (Site A only) ===================
{
  const G = "Restricted admin";
  const s = ra, co = (...p) => collection(s.db, "companies", SEC, ...p);
  await denied(G, "direct read: site C clock-in doc", () => getDoc(doc(s.db, "companies", SEC, "clockEvents", C1)));
  await denied(G, "direct query: clockEvents where siteId == site-c", () => getDocs(query(co("clockEvents"), where("siteId", "==", "site-c"))));
  await denied(G, "direct query: all clockEvents", () => getDocs(co("clockEvents")));
  await denied(G, "direct read: site C approval doc", () => getDoc(doc(s.db, "companies", SEC, "timesheetApprovals", C1)));
  await denied(G, "direct query: siteExits / shiftNotes", async () => { await getDocs(co("shiftNotes")); });
  const data = await allowed(G, "getShiftData (shifts) through the server", async () => call(s, "getShiftData", { purpose: "shifts", ...range, want: { clockEvents: true, approvals: true } }));
  if (data) {
    const ev = data.clockEvents ?? [];
    const sites = [...new Set(ev.map((e) => e.siteId))];
    rec(G, "getShiftData returns only Site A shifts", ev.length > 0 && sites.every((x) => x === "site-a"), `${ev.length} events, sites ${JSON.stringify(sites)}`);
  }
  await denied(G, "setApprovalStatus on a site C shift", () => call(s, "setApprovalStatus", { eventId: C1, status: "approved" }));
  await denied(G, "setShiftTip on a site C shift", () => call(s, "setShiftTip", { eventId: C1, amountCents: 500 }));
  await denied(G, "adminClockAction for the site C worker at site C", () => call(s, "adminClockAction", { employeeId: "worker-c", action: "in", siteId: "site-c" }));
  // positive controls on site A (put back afterwards)
  await allowed(G, "setApprovalStatus on a site A shift (control)", () => call(s, "setApprovalStatus", { eventId: A1, status: "approved" }));
  await allowed(G, "setShiftTip on a site A shift (control)", () => call(s, "setShiftTip", { eventId: A1, amountCents: 1000 }));
  // raise own access
  await denied(G, "setAdminAccess on self -> Full access", () => call(s, "setAdminAccess", { targetUid: s.uid, level: "full", sites: "all", permissions: ALLPERM }));
  await denied(G, "setAdminAccess on self -> all sites + Billing", () => call(s, "setAdminAccess", { targetUid: s.uid, level: "admin", sites: "all", permissions: { approveHours: true, employees: true, editPay: true, exportPayroll: true, analytics: true, billing: true, settings: true, invites: true } }));
  await denied(G, "direct write users/self.adminAccess", () => updateDoc(doc(s.db, "users", s.uid), { adminAccess: { level: "full", sites: "all" } }));
  await denied(G, "direct write users/self.role = owner", () => updateDoc(doc(s.db, "users", s.uid), { role: "owner" }));
  await denied(G, "setSiteAdmins (add self to site C)", () => call(s, "setSiteAdmins", { siteId: "site-c", adminUids: [s.uid] }));
  await denied(G, "setEmployeeRole on own employee record -> admin (re-role self)", () => call(s, "setEmployeeRole", { employeeId: "sec-admin-a", role: "admin" }));
  // the owner + other admins
  await denied(G, "setAdminAccess on the owner", () => call(s, "setAdminAccess", { targetUid: ownerUid, level: "admin", sites: [], permissions: NOPERM }));
  await denied(G, "direct write users/{owner}", () => updateDoc(doc(s.db, "users", ownerUid), { role: "admin" }));
  await denied(G, "direct delete users/{owner}", () => deleteDoc(doc(s.db, "users", ownerUid)));
  await denied(G, "setAdminAccess on another admin (existing-style)", () => call(s, "setAdminAccess", { targetUid: legacy.uid, level: "admin", sites: [], permissions: NOPERM }));
  const billing = await fetch(`${SITE}/api/stripe/payment-method`, { headers: { Authorization: `Bearer ${s.idToken}` } });
  rec(G, "billing API (no Billing permission) refused", billing.status === 403, `HTTP ${billing.status}`);
}

// =================== 2. Existing-style admin (no access fields) ===================
{
  const G = "Existing-style admin";
  const s = legacy, co = (...p) => collection(s.db, "companies", SEC, ...p);
  await allowed(G, "direct read: all clockEvents (both sites)", async () => { const q = await getDocs(co("clockEvents")); const sites = [...new Set(q.docs.map((d) => d.get("siteId")))].sort(); if (!sites.includes("site-a") || !sites.includes("site-c")) throw new Error(`sites ${sites}`); return `${q.size} events, sites ${sites.join("+")}`; });
  await allowed(G, "direct read: timesheetApprovals", async () => `${(await getDocs(co("timesheetApprovals"))).size} docs`);
  await allowed(G, "read employees (pay visible)", async () => { const q = await getDocs(co("employees")); return `${q.size} employees`; });
  await allowed(G, "setApprovalStatus on a site C shift", () => call(s, "setApprovalStatus", { eventId: C1, status: "approved" }));
  await allowed(G, "setShiftTip on a site C shift", () => call(s, "setShiftTip", { eventId: C1, amountCents: 700 }));
  await allowed(G, "getShiftData export (Export payroll)", async () => { const d = await call(s, "getShiftData", { purpose: "export", ...range, want: { clockEvents: true } }); return `${d.clockEvents.length} events`; });
  await allowed(G, "settings save (company doc, Settings)", () => updateDoc(doc(s.db, "companies", SEC), { businessHours: { open: "07:00", close: "17:00" } }));
  await allowed(G, "jobs: add + delete (Edit pay)", async () => { const r = await addDoc(co("jobs"), { name: "Sec check job", hourlyRate: 21, active: true, createdAt: serverTimestamp() }); await deleteDoc(r); });
  await allowed(G, "job site create without createdByUid (live website shape)", async () => { const r = await addDoc(co("jobSites"), { name: "Sec check site", address: "", active: true, createdAt: serverTimestamp(), requireGeofence: false, lat: null, lng: null, geocodedAddress: null, placeId: null }); await updateDoc(r, { active: false }); await deleteDoc(r); });
  const billing = await fetch(`${SITE}/api/stripe/payment-method`, { headers: { Authorization: `Bearer ${s.idToken}` } });
  rec(G, "billing API refused (Billing stays owner-only, D8)", billing.status === 403, `HTTP ${billing.status}`);
  const ob = await fetch(`${SITE}/api/stripe/payment-method`, { headers: { Authorization: `Bearer ${owner.idToken}` } });
  rec(G, "billing API works for the owner (control)", ob.status === 200, `HTTP ${ob.status}`);
}

// =================== 3. Kiosk login (OT Test Co) ===================
{
  const G = "Kiosk";
  const s = kiosk, co = (...p) => collection(s.db, "companies", OT, ...p);
  await allowed(G, "users/self readable (website sends role kiosk to /use-app)", async () => { const d = await getDoc(doc(s.db, "users", s.uid)); if (d.get("role") !== "kiosk") throw new Error("role " + d.get("role")); return "role kiosk"; });
  await denied(G, "company doc (dashboard's first read)", () => getDoc(doc(s.db, "companies", OT)));
  await denied(G, "employees collection", () => getDocs(co("employees")));
  await denied(G, "employee doc (pay + PIN fields)", () => getDoc(doc(s.db, "companies", OT, "employees", "kiosk-ava")));
  await denied(G, "employeeSelfViews doc", () => getDoc(doc(s.db, "companies", OT, "employeeSelfViews", "kiosk-ava")));
  await denied(G, "jobs (pay rates)", () => getDocs(co("jobs")));
  await denied(G, "employeePins/{id} (plain PIN)", () => getDoc(doc(s.db, "companies", OT, "employeePins", "kiosk-ava")));
  await denied(G, "pins/{pin} (plain PIN reservation)", () => getDoc(doc(s.db, "companies", OT, "pins", "2581")));
  await denied(G, "clockEvents", () => getDocs(query(co("clockEvents"), limit(1))));
  await denied(G, "timesheetApprovals", () => getDocs(query(co("timesheetApprovals"), limit(1))));
  await denied(G, "users of the company", () => getDocs(query(collection(s.db, "users"), where("companyId", "==", OT))));
  await denied(G, "direct clock event write (source kiosk)", () => setDoc(doc(s.db, "companies", OT, "clockEvents", `seccheck-${Date.now()}`), { employeeId: "kiosk-ava", type: "in", source: "kiosk", timestamp: serverTimestamp() }));
  const t = await allowed(G, "getKioskPinTable (its own callable, control)", () => call(s, "getKioskPinTable", {}));
  if (t) {
    const rows = t.employees ?? [];
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].sort();
    const bad = keys.filter((k) => /pin$|^pin|rate|pay|email|phone|dob|wage/i.test(k) && k !== "hash");
    const plain = rows.some((r) => /^\d{4}$/.test(String(r.hash)));
    rec(G, "PIN table has no pay / PII / plain PINs", rows.length > 0 && bad.length === 0 && !plain, `${rows.length} rows, keys ${keys.join(",")}`);
  }
  const refusedCalls = [
    ["getPinSyncTable (supervisor PIN table)", "getPinSyncTable", {}],
    ["getEmployeePins (admin)", "getEmployeePins", {}],
    ["getMyPin (employee)", "getMyPin", {}],
    ["verifyPin (supervisor)", "verifyPin", { employeeId: "kiosk-ava", pin: "2581" }],
    ["setApprovalStatus", "setApprovalStatus", { eventId: "seccheck-none", status: "pending" }],
    ["setShiftTip", "setShiftTip", { eventId: "seccheck-none", amountCents: 0 }],
    ["getShiftData", "getShiftData", { purpose: "shifts", ...range }],
    ["adminClockAction", "adminClockAction", { employeeId: "kiosk-ava", action: "in" }],
    ["setEmployeePinSupervisor", "setEmployeePinSupervisor", { employeeId: "kiosk-ava", pin: "9999" }],
    ["setEmployeeRole", "setEmployeeRole", { employeeId: "kiosk-ava", role: "admin" }],
    ["setAdminAccess", "setAdminAccess", { targetUid: s.uid, level: "full", sites: "all", permissions: ALLPERM }],
    ["addManualTimestamp", "addManualTimestamp", { employeeId: "kiosk-ava", type: "in", timestampMs: Date.now() - 3600000 }],
    ["correctClockEvent", "correctClockEvent", { eventId: "seccheck-none", newTimestampMs: Date.now() - 3600000, reason: "x" }],
    ["generateTempClockLink", "generateTempClockLink", { employeeId: "kiosk-ava" }],
    ["createEmployeeInvite", "createEmployeeInvite", { employeeId: "kiosk-ava", email: "nobody@dev.orbitsworks.test" }],
  ];
  for (const [label, name, data] of refusedCalls) await denied(G, `callable ${label}`, () => call(s, name, data));
}

// =================== 4. Supervisor app 1.1.4 (Security Test Co) ===================
{
  const G = "Supervisor app";
  const s = sup, db = s.db, C = SEC, uid = s.uid;
  await allowed(G, "startup reads (AuthContext, settings, today shift, alerts, employees, sites, device)", async () => {
    await getDoc(doc(db, "users", uid));
    await getDoc(doc(db, "companies", C));
    await getDocs(query(collection(db, "companies", C, "employees"), where("linkedUserId", "==", uid)));
    await getDocs(collection(db, "companies", C, "employees"));
    await getDocs(query(collection(db, "companies", C, "employees"), where("active", "==", true)));
    const ev = collection(db, "companies", C, "clockEvents");
    await getDocs(query(ev, where("employeeId", "==", "worker-a"), orderBy("timestamp", "desc"), limit(1)));
    await getDocs(query(ev, where("timestamp", ">=", Timestamp.fromMillis(Date.now() - 86400000))));
    await getDocs(query(collection(db, "companies", C, "jobSites"), where("active", "==", true)));
    await getDocs(query(collection(db, "companies", C, "alerts"), orderBy("occurredAt", "desc"), limit(50)));
    await getDocs(query(collection(db, "companies", C, "alerts"), where("alertType", "==", "faceBadReference")));
    await getDoc(doc(db, "companies", C, "devices", "seccheck-dev"));
    return "11 reads OK";
  });
  await allowed(G, "getPinSyncTable (PIN sync)", async () => { const d = await call(s, "getPinSyncTable", {}); return `${(d.employees ?? d.pins ?? []).length ?? "?"} rows`; });
  const mk = (type, t) => ({
    localId: null, employeeId: "worker-a", employeeName: "Worker A", siteId: "site-a", siteName: "Site A",
    subcontractorId: null, subcontractorName: null, type, source: "pin", photoPending: true,
    note: null, ...(type === "in" ? { employeeComment: "sec check" } : {}), authorizedById: null, authorizedByName: null, reason: null, overrideEventId: null,
    deviceId: "seccheck-dev", deviceNameSnapshot: null, location: { lat: 1, lng: 2 }, locationAccuracyM: 10,
    createdByUid: uid, clientTimestamp: Timestamp.fromMillis(t), timestamp: Timestamp.fromMillis(t), createdAt: Timestamp.fromMillis(t),
  });
  const inId = `seccheck-in-${Date.now()}`, outId = `seccheck-out-${Date.now()}`;
  const tIn = Date.now() - 120000, tOut = Date.now() - 60000;
  await allowed(G, "clock-in punch (queueSync payload, merge) + read back + same-payload replay", async () => {
    const p = { ...mk("in", tIn), localId: inId };
    const r = doc(db, "companies", C, "clockEvents", inId);
    await setDoc(r, p, { merge: true });
    await getDoc(r);
    await setDoc(r, p, { merge: true });
  });
  await allowed(G, "clock-out punch", () => setDoc(doc(db, "companies", C, "clockEvents", outId), { ...mk("out", tOut), localId: outId }, { merge: true }));
  const qbId = `seccheck-${Date.now()}`;
  await allowed(G, "queue backup (live payload)", () => setDoc(doc(db, "companies", C, "queueBackups", qbId), {
      localId: qbId, employeeId: "worker-a", employeeName: "Worker A", siteId: "site-a", siteName: "Site A", type: "in", note: null,
      employeeComment: null, source: "pin", authorizedById: null, authorizedByName: null, createdByUid: uid, clientTimestamp: Date.now(),
      subcontractorId: null, subcontractorName: null, reason: null, overrideEventId: null, createdAt: Date.now(), attempts: 0,
      lastError: null, hadPhoto: true, backedUpByUid: uid, backedUpAt: serverTimestamp(),
    }));
  await allowed(G, "push token read + set + update", async () => {
    const tok = doc(db, "companies", C, "pushTokens", "seccheck-push");
    await getDoc(tok);
    await setDoc(tok, { deviceId: "seccheck-push", token: "ExponentPushToken[seccheck]", platform: "ios", notificationsEnabled: true, updatedAt: serverTimestamp(), createdAt: serverTimestamp() }, { merge: true });
    await setDoc(tok, { notificationsEnabled: false, updatedAt: serverTimestamp() }, { merge: true });
  });
  const devRef = doc(db, "companies", C, "devices", `seccheck-dev-${Date.now()}`);
  await allowed(G, "device doc create", () => setDoc(devRef, { name: "Sec Gate", platform: "ios", model: "", createdByUid: uid, createdAt: serverTimestamp() }));
  await allowed(G, "device rename", () => updateDoc(devRef, { name: "Sec Gate 2", updatedAt: serverTimestamp(), updatedByUid: uid }));
  await allowed(G, "shift note", () => addDoc(collection(db, "companies", C, "shiftNotes"), { note: "sec check note", siteId: "site-a", siteName: "Site A", createdByUid: uid, timestamp: serverTimestamp() }));
  await denied(G, "supervisor can't read approvals (admin-only)", () => getDocs(collection(db, "companies", C, "timesheetApprovals")));
  await denied(G, "supervisor can't call setShiftTip", () => call(s, "setShiftTip", { eventId: A1, amountCents: 100 }));
}

// =================== 5. Employee App (Security Test Co) ===================
{
  const G = "Employee app";
  const s = emp, db = s.db, C = SEC, me = "sec-employee";
  await allowed(G, "startup reads (users/self, self view, app config, alerts, my events, appConfig/versions)", async () => {
    await getDoc(doc(db, "users", s.uid));
    await getDoc(doc(db, "companies", C, "employeeSelfViews", me));
    await getDoc(doc(db, "companies", C, "employeeAppConfig", "current"));
    await getDocs(query(collection(db, "companies", C, "employeeAlerts"), where("employeeId", "==", me), orderBy("createdAt", "desc"), limit(50)));
    await getDocs(query(collection(db, "companies", C, "clockEvents"), where("employeeId", "==", me), orderBy("timestamp", "desc"), limit(20)));
    await getDocs(query(collection(db, "companies", C, "clockEvents"), where("employeeId", "==", me), where("timestamp", ">=", Timestamp.fromMillis(Date.now() - 14 * 86400000)), orderBy("timestamp", "asc")));
    await getDoc(doc(db, "appConfig", "versions"));
    return "7 reads OK";
  });
  await allowed(G, "getEmployeeHomeSite + getMyPinVerifier", async () => { await call(s, "getEmployeeHomeSite", {}); await call(s, "getMyPinVerifier", {}); });
  const jpg = await wreq("sharp")({ create: { width: 64, height: 64, channels: 3, background: { r: 200, g: 180, b: 160 } } }).jpeg().toBuffer();
  for (const action of ["in", "out"]) {
    await allowed(G, `employeeClockPunch ${action} (photo upload + PIN)`, async () => {
      const requestId = crypto.randomUUID();
      const path = `companies/${C}/clockEvents/${me}/${requestId}.jpg`;
      await uploadBytes(sref(s.storage, path), jpg, { contentType: "image/jpeg" });
      const r = await call(s, "employeeClockPunch", { action, requestId, pin: "5555", photoPath: path, queuedAtMs: Date.now(), waitMs: 0 });
      return JSON.stringify(r).slice(0, 120);
    });
  }
  await denied(G, "employee can't read the company doc", () => getDoc(doc(db, "companies", C)));
  await denied(G, "employee can't read other employees", () => getDocs(collection(db, "companies", C, "employees")));
  await denied(G, "employee can't read another employee's events", () => getDocs(query(collection(db, "companies", C, "clockEvents"), where("employeeId", "==", "worker-a"))));
}

// ---- put positive-control writes back (owner, through the same callables) ----
await call(owner, "setShiftTip", { eventId: A1, amountCents: 0 }).catch((e) => console.log("restore tip A1:", e.message));
await call(owner, "setShiftTip", { eventId: C1, amountCents: 0 }).catch((e) => console.log("restore tip C1:", e.message));
await call(owner, "setApprovalStatus", { eventId: A1, status: "pending" }).catch((e) => console.log("restore A1:", e.message));
await call(owner, "setApprovalStatus", { eventId: C1, status: "pending" }).catch((e) => console.log("restore C1:", e.message));
await updateDoc(doc(owner.db, "companies", SEC), { businessHours: { open: "07:00", close: "17:00" } });

const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} passed`);
process.exit(fails.length ? 1 : 0);
