// DEV ONLY (orbitworks-dev-ew). Creates isolated join-code test companies and
// logins. Idempotent. Passwords go to ./creds.json (gitignored).
const fs = require("fs");
const crypto = require("crypto");
const adminFor = require("./adminFor");
const { db, auth, FieldValue, env } = adminFor(".env.local", "orbitworks-dev-ew", "devSetup");
if (env.FIREBASE_ADMIN_PROJECT_ID !== "orbitworks-dev-ew") throw new Error("not dev");

const PRO = "jc-test-pro-dev";
const CORE = "jc-test-core-dev";
const credsPath = __dirname + "/creds.json";
const creds = fs.existsSync(credsPath) ? JSON.parse(fs.readFileSync(credsPath, "utf8")) : {};

async function company(id, name, planTier, cap) {
  await db.collection("companies").doc(id).set({
    name, authMode: "individual", businessHours: { open: "08:00", close: "17:00" }, weeklyOvertimeThreshold: 40,
    overtimeMultiplier: 1.5, alerts: { maxHoursWarning: true, overtimeWarning: true, missedClockOutAlert: true },
    planTier, employeeCap: cap, totalEmployeeCap: cap + 5, subscriptionStatus: "active",
    stripeCustomerId: null, stripeSubscriptionId: null, jcTestFixture: true,
  }, { merge: true });
  const snap = await db.collection("companies").doc(id).get();
  if (snap.get("activeEmployeeCount") === undefined) await snap.ref.update({ activeEmployeeCount: 0, totalEmployeeCount: 0, createdAt: FieldValue.serverTimestamp() });
}

async function employee(companyId, id, data) {
  const ref = db.collection("companies").doc(companyId).collection("employees").doc(id);
  if (!(await ref.get()).exists) await ref.set({ active: true, assignedSiteIds: [], hourlyRate: 20, createdAt: FieldValue.serverTimestamp(), ...data });
}

async function login(key, role, companyId, extraClaims = {}) {
  const email = `${key}@orbitworks-dev-test.invalid`;
  if (!creds[key]) creds[key] = { email, password: crypto.randomBytes(12).toString("base64url") };
  let user;
  try { user = await auth.getUserByEmail(email); await auth.updateUser(user.uid, { password: creds[key].password }); }
  catch { user = await auth.createUser({ email, password: creds[key].password, displayName: key }); }
  await auth.setCustomUserClaims(user.uid, { role, companyId, ...extraClaims });
  await db.collection("users").doc(user.uid).set({ role, companyId, email, name: key, createdAt: FieldValue.serverTimestamp(), ...extraClaims }, { merge: true });
  creds[key].uid = user.uid;
  return user.uid;
}

(async () => {
  await company(PRO, "JC-Test Pro (dev)", "pro_tier1", 15);
  await company(CORE, "JC-Test Core (dev)", "core2_tier1", 15);

  const proSites = db.collection("companies").doc(PRO).collection("jobSites");
  await proSites.doc("site-north").set({ name: "North Yard", address: "", active: true, requireGeofence: false, lat: null, lng: null, geocodedAddress: null, placeId: null, createdAt: FieldValue.serverTimestamp() }, { merge: true });
  await proSites.doc("site-south").set({ name: "South Plant", address: "", active: true, requireGeofence: false, lat: null, lng: null, geocodedAddress: null, placeId: null, createdAt: FieldValue.serverTimestamp() }, { merge: true });
  await db.collection("companies").doc(CORE).collection("jobSites").doc("site-core").set({ name: "Core Site", address: "", active: true, requireGeofence: false, lat: null, lng: null, geocodedAddress: null, placeId: null, createdAt: FieldValue.serverTimestamp() }, { merge: true });
  const subs = db.collection("companies").doc(PRO).collection("subcontractors");
  await subs.doc("sub-acme").set({ name: "Acme Labor", contactName: "", email: "", phone: "", address: "", active: true, createdAt: FieldValue.serverTimestamp() }, { merge: true });
  await subs.doc("sub-bolt").set({ name: "Bolt Staffing", contactName: "", email: "", phone: "", address: "", active: true, createdAt: FieldValue.serverTimestamp() }, { merge: true });

  await employee(PRO, "emp-sup", { name: "JC Supervisor", isSupervisor: true });
  await employee(PRO, "emp-worker", { name: "JC Worker", appAccess: true, joinedVia: "admin" });
  await employee(PRO, "emp-plain", { name: "JC Plain" });

  await login("jc-pro-admin", "admin", PRO);
  await login("jc-pro-owner", "owner", PRO);
  await login("jc-core-admin", "admin", CORE);
  const supUid = await login("jc-pro-supervisor", "supervisor", PRO, { employeeId: "emp-sup" });
  const empUid = await login("jc-pro-employee", "employee", PRO, { employeeId: "emp-worker" });
  await db.collection("companies").doc(PRO).collection("employees").doc("emp-sup").update({ linkedUserId: supUid });
  await db.collection("companies").doc(PRO).collection("employees").doc("emp-worker").update({ linkedUserId: empUid });

  fs.writeFileSync(credsPath, JSON.stringify(creds, null, 2));
  console.log("setup OK; logins: " + Object.keys(creds).join(", "));
  process.exit(0);
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
