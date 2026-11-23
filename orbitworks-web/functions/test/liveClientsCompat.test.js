// Prod dry run step 1 (2026-11-22): the LIVE clients against the NEW rules.
// Every Firestore read/write the live supervisor app 1.1.4 and the live
// website (main @ 5fd9898) make, with the exact payload shapes from main's
// code (paths noted per test), run against this branch's firestore.rules.
// Only expected difference: deleting a subcontractor (live website
// SubcontractorsSection) is refused - subcontractors are never hard-deleted
// now (active: false instead).
// COMPAT_RULES=<file> runs the same calls against another rules file (main's,
// to show a failure is a change and not the test).
// Run: firebase emulators:exec --only firestore "cd functions && node --test test/liveClientsCompat.test.js"
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const {
  setDoc, doc, updateDoc, getDoc, deleteDoc, addDoc, collection, getDocs, query, where, orderBy, limit,
  writeBatch, arrayUnion, serverTimestamp, Timestamp,
} = require("firebase/firestore");

const C = "companyA";
let env;

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: "orbitworks-live-compat",
    firestore: { host: "localhost", port: 8090, rules: fs.readFileSync(process.env.COMPAT_RULES || path.join(__dirname, "..", "..", "firestore.rules"), "utf8") },
  });
});
test.after(async () => env.cleanup());

test.beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "companies", C), { name: "A", planTier: "pro_tier2", subscriptionStatus: "active", ownerUid: "owner-uid", totalEmployeeCount: 1, activeEmployeeCount: 1 });
    await setDoc(doc(db, "users", "sup-uid"), { companyId: C, role: "supervisor", name: "Sam" });
    await setDoc(doc(db, "users", "admin-uid"), { companyId: C, role: "admin", name: "Ada" });
    await setDoc(doc(db, "companies", C, "employees", "emp1"), { name: "Jordan", active: true, assignedSiteIds: ["site1"], pin: "1234" });
    await setDoc(doc(db, "companies", C, "employees", "sup-uid"), { name: "Sam", active: true, assignedSiteIds: ["site1"], linkedUserId: "sup-uid", isSupervisor: true });
    await setDoc(doc(db, "companies", C, "jobSites", "site1"), { name: "Yard", active: true });
    await setDoc(doc(db, "companies", C, "subcontractors", "sub1"), { name: "Sub", active: true });
    await setDoc(doc(db, "companies", C, "jobs", "job1"), { name: "Laborer", hourlyRate: 20, active: true });
    await setDoc(doc(db, "companies", C, "alerts", "late-emp1"), {
      companyId: C, alertType: "lateClockIn", employeeId: "emp1", employeeName: "Jordan", siteId: "site1", siteName: "Yard",
      message: "late", severity: "warning", occurredAt: Timestamp.now(), readByDeviceIds: [],
    });
    await setDoc(doc(db, "companies", C, "alerts", "badref-emp1"), {
      companyId: C, alertType: "faceBadReference", employeeId: "emp1", message: "bad", severity: "warning", occurredAt: Timestamp.now(), readByDeviceIds: [],
    });
  });
});

const sup = () => env.authenticatedContext("sup-uid", { role: "supervisor", companyId: C }).firestore();
const adm = () => env.authenticatedContext("admin-uid", { role: "admin", companyId: C }).firestore();
const own = () => env.authenticatedContext("owner-uid", { role: "owner", companyId: C }).firestore();

// ---------------- supervisor app 1.1.4 (main:orbitworks-app) ----------------
for (const [label, ctx] of [["supervisor", sup], ["admin", adm]]) {
  test(`1.1.4 ${label}: startup reads (AuthContext, useCompanySettings, useTodayShift, useAlertsFeed, UpdateEmployeeScreen, useDeviceDoc)`, async () => {
    const db = ctx();
    const uid = label === "supervisor" ? "sup-uid" : "admin-uid";
    await assertSucceeds(getDoc(doc(db, "users", uid)));
    await assertSucceeds(getDoc(doc(db, "companies", C)));
    await assertSucceeds(getDocs(query(collection(db, "companies", C, "employees"), where("linkedUserId", "==", uid))));
    await assertSucceeds(getDocs(collection(db, "companies", C, "employees")));
    await assertSucceeds(getDocs(query(collection(db, "companies", C, "employees"), where("active", "==", true))));
    const ev = collection(db, "companies", C, "clockEvents");
    await assertSucceeds(getDocs(query(ev, where("employeeId", "==", "emp1"), orderBy("timestamp", "desc"), limit(1))));
    await assertSucceeds(getDocs(query(ev, where("timestamp", ">=", Timestamp.fromMillis(Date.now() - 86400000)))));
    await assertSucceeds(getDocs(query(collection(db, "companies", C, "jobSites"), where("active", "==", true))));
    await assertSucceeds(getDocs(query(collection(db, "companies", C, "alerts"), orderBy("occurredAt", "desc"), limit(50))));
    await assertSucceeds(getDocs(query(collection(db, "companies", C, "alerts"), where("alertType", "==", "faceBadReference"))));
    await assertSucceeds(getDoc(doc(db, "companies", C, "devices", "dev-1")));
  });

  test(`1.1.4 ${label}: clock punch (queueSync buildEventPayload, merge) + read back + same-payload replay`, async () => {
    const db = ctx();
    const uid = label === "supervisor" ? "sup-uid" : "admin-uid";
    const t = Date.now() - 60000;
    const payload = {
      localId: `loc-${label}`, employeeId: "emp1", employeeName: "Jordan", siteId: "site1", siteName: "Yard",
      subcontractorId: null, subcontractorName: null, type: "in", source: "pin", photoPending: true,
      note: null, employeeComment: "on time", authorizedById: null, authorizedByName: null, reason: null, overrideEventId: null,
      deviceId: "dev-1", deviceNameSnapshot: "Gate iPad", location: { lat: 1, lng: 2 }, locationAccuracyM: 10,
      createdByUid: uid, clientTimestamp: Timestamp.fromMillis(t), timestamp: Timestamp.fromMillis(t), createdAt: Timestamp.fromMillis(t),
    };
    const ref = doc(db, "companies", C, "clockEvents", `loc-${label}`);
    await assertSucceeds(setDoc(ref, payload, { merge: true }));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(setDoc(ref, payload, { merge: true }));
  });

  test(`1.1.4 ${label}: queue backup, push token, device name, mark alerts read, shift note`, async () => {
    const db = ctx();
    const uid = label === "supervisor" ? "sup-uid" : "admin-uid";
    await assertSucceeds(setDoc(doc(db, "companies", C, "queueBackups", "loc-9"), {
      localId: "loc-9", employeeId: "emp1", employeeName: "Jordan", siteId: "site1", siteName: "Yard", type: "in", note: null,
      employeeComment: null, source: "pin", authorizedById: null, authorizedByName: null, createdByUid: uid, clientTimestamp: Date.now(),
      subcontractorId: null, subcontractorName: null, reason: null, overrideEventId: null, createdAt: Date.now(), attempts: 0,
      lastError: null, hadPhoto: true, backedUpByUid: uid, backedUpAt: serverTimestamp(),
    }));
    const tok = doc(db, "companies", C, "pushTokens", `push-${label}`);
    await assertSucceeds(getDoc(tok));
    await assertSucceeds(setDoc(tok, { deviceId: `push-${label}`, token: "ExponentPushToken[abc123]", platform: "ios", notificationsEnabled: true, updatedAt: serverTimestamp(), createdAt: serverTimestamp() }, { merge: true }));
    await assertSucceeds(setDoc(tok, { notificationsEnabled: false, updatedAt: serverTimestamp() }, { merge: true }));
    const dev = doc(db, "companies", C, "devices", `dev-${label}`);
    await assertSucceeds(setDoc(dev, { name: "Gate", platform: "ios", model: "", createdByUid: uid, createdAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(dev, { name: "Gate 2", updatedAt: serverTimestamp(), updatedByUid: uid }));
    const b = writeBatch(db);
    b.update(doc(db, "companies", C, "alerts", "late-emp1"), { readByDeviceIds: arrayUnion(`push-${label}`) });
    await assertSucceeds(b.commit());
    await assertSucceeds(addDoc(collection(db, "companies", C, "shiftNotes"), { note: "gate locked", siteId: "site1", siteName: "Yard", createdByUid: uid, timestamp: serverTimestamp() }));
  });
}

// ---------------- live website (main:orbitworks-web) ----------------
for (const [label, ctx] of [["admin", adm], ["owner", own]]) {
  test(`website ${label}: manual clock events (useClockEvents adminManual out + autoBreakEnd)`, async () => {
    const db = ctx();
    const uid = `${label}-uid`;
    const ev = collection(db, "companies", C, "clockEvents");
    const base = { employeeId: "emp1", employeeName: "Jordan", siteId: "site1", siteName: "Yard", subcontractorId: null, subcontractorName: null, createdByUid: uid, authorizedById: uid, authorizedByName: "Ada" };
    await assertSucceeds(addDoc(ev, { ...base, type: "in", source: "adminManual", timestamp: serverTimestamp(), createdAt: serverTimestamp() }));
    await assertSucceeds(addDoc(ev, { ...base, type: "breakEnd", source: "autoBreakEnd", timestamp: serverTimestamp(), createdAt: serverTimestamp() }));
    await assertSucceeds(addDoc(ev, { ...base, type: "out", source: "adminManual", note: "Auto-closed stale session", timestamp: Timestamp.fromMillis(Date.now() - 3600000), createdAt: serverTimestamp() }));
  });

  test(`website ${label}: employees edit + photo, settings save, invites, devices, alert actions`, async () => {
    const db = ctx();
    const uid = `${label}-uid`;
    const emp = doc(db, "companies", C, "employees", "emp1");
    await assertSucceeds(updateDoc(emp, { photoUrl: "https://x/y.jpg" }));
    await assertSucceeds(updateDoc(emp, { name: "Jordan B", jobId: "job1", photoUrl: "https://x/z.jpg", "fieldEditedAt.photoUrl": serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(db, "companies", C), { name: "A2", authMode: "pin", logoUrl: null, businessHours: { open: "07:00", close: "17:00" }, weeklyOvertimeThreshold: 40, overtimeMultiplier: 1.5 }));
    const inv = await assertSucceeds(addDoc(collection(db, "invites"), { email: "x@example.com", companyId: C, role: "supervisor", assignedSiteIds: ["site1"], status: "pending", invitedByUid: uid, createdAt: serverTimestamp() }));
    await assertSucceeds(getDocs(query(collection(db, "invites"), where("companyId", "==", C))));
    await assertSucceeds(deleteDoc(inv));
    const dev = doc(db, "companies", C, "devices", `web-${label}`);
    await assertSucceeds(setDoc(dev, { name: "Front", platform: "", model: "", createdByUid: uid, createdAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(dev, { name: "Front 2", updatedAt: serverTimestamp(), updatedByUid: uid }));
    await assertSucceeds(updateDoc(dev, { locked: true, lockedByUid: uid, lockedAt: serverTimestamp() }));
    await assertSucceeds(addDoc(collection(db, "companies", C, "alertActions"), { alertKey: "late-emp1", alertType: "lateClockIn", employeeId: "emp1", status: "resolved", actionTaken: "editTime", resolvedByUid: uid, resolvedByName: "Ada", resolvedAt: serverTimestamp() }));
  });

  test(`website ${label}: jobs, job sites, subcontractors (delete refused - expected change)`, async () => {
    const db = ctx();
    const job = await assertSucceeds(addDoc(collection(db, "companies", C, "jobs"), { name: "Op", hourlyRate: 25, active: true, createdAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(job, { active: false }));
    await assertSucceeds(deleteDoc(job));
    const site = await assertSucceeds(addDoc(collection(db, "companies", C, "jobSites"), { name: "S", address: "1 Main", active: true, createdAt: serverTimestamp(), requireGeofence: false, lat: null, lng: null, geocodedAddress: null, placeId: null }));
    await assertSucceeds(updateDoc(site, { active: false }));
    await assertSucceeds(deleteDoc(site));
    const sub = await assertSucceeds(addDoc(collection(db, "companies", C, "subcontractors"), { name: "Sub2", contactName: "", email: "", phone: "", address: "", active: true, createdAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(sub, { active: false }));
    await assertFails(deleteDoc(sub));
  });

  // Prod dry run step 4 sanity check: the reads behind the live Employees,
  // Time Tracking and Reports pages (main @ 5fd9898: useEmployees, useJobs,
  // useSites, useSubcontractors, useCompanySettings, useClockEvents via
  // ManualClockForm/ClockEventLookup, useReports).
  test(`website ${label}: page loads - Employees, Time Tracking, Reports`, async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      const d = c.firestore();
      await setDoc(doc(d, "users", "owner-uid"), { companyId: C, role: "owner", name: "Olive" });
      await setDoc(doc(d, "companies", C, "clockEvents", "e1"), { employeeId: "emp1", employeeName: "Jordan", siteId: "site1", type: "in", source: "mobile", timestamp: Timestamp.fromMillis(Date.now() - 3600000) });
      await setDoc(doc(d, "companies", C, "timesheetApprovals", "a1"), { employeeId: "emp1", date: "2026-11-20", status: "approved" });
      await setDoc(doc(d, "companies", C, "shiftNotes", "n1"), { note: "x", siteId: "site1", timestamp: Timestamp.now() });
    });
    const db = ctx();
    const co = (...p) => collection(db, "companies", C, ...p);
    // shared: AuthContext + useCompanySettings
    await assertSucceeds(getDoc(doc(db, "users", `${label}-uid`)));
    await assertSucceeds(getDoc(doc(db, "companies", C)));
    // Employees page
    await assertSucceeds(getDocs(query(co("employees"), orderBy("createdAt", "desc"))));
    await assertSucceeds(getDocs(query(co("jobs"), orderBy("createdAt", "desc"))));
    await assertSucceeds(getDocs(query(co("jobSites"), orderBy("createdAt", "desc"))));
    await assertSucceeds(getDocs(co("subcontractors")));
    // Time Tracking page (ClockEventLookup filters)
    const ev = co("clockEvents");
    await assertSucceeds(getDocs(query(ev, orderBy("timestamp", "desc"), limit(50))));
    await assertSucceeds(getDocs(query(ev, where("employeeId", "==", "emp1"), orderBy("timestamp", "desc"))));
    await assertSucceeds(getDocs(query(ev, where("siteId", "==", "site1"), orderBy("timestamp", "desc"))));
    // Reports page (useReports)
    const start = Timestamp.fromMillis(Date.now() - 7 * 86400000), end = Timestamp.now();
    await assertSucceeds(getDocs(query(ev, where("timestamp", ">=", start), where("timestamp", "<=", end), orderBy("timestamp", "asc"))));
    await assertSucceeds(getDocs(co("employees")));
    await assertSucceeds(getDocs(co("jobSites")));
    await assertSucceeds(getDocs(co("jobs")));
    await assertSucceeds(getDocs(query(co("shiftNotes"), where("timestamp", ">=", start), where("timestamp", "<=", end))));
    await assertSucceeds(getDocs(query(co("timesheetApprovals"), where("date", ">=", "2026-01-01"), where("date", "<=", "2026-11-30"))));
    await assertSucceeds(getDocs(query(collection(db, "users"), where("companyId", "==", C))));
  });
}
