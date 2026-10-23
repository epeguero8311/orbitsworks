const { dev, api, jPage, check, results } = require("./lib");
const PRO = "jc-test-pro-dev", CORE = "jc-test-core-dev";
const db = dev.db;
const co = (id) => db.collection("companies").doc(id);
const codeDoc = (t) => db.collection("joinCodes").doc(t);
const hour = 3600e3;
const future = () => new Date(Date.now() + 48 * hour).toISOString();
const past = () => new Date(Date.now() - hour).toISOString();
const base = (o = {}) => ({ name: "Gate A", siteId: "site-north", subcontractorIds: ["sub-acme"], locationRequired: true, userLimit: 10, expiresAt: null, ...o });
const list = async (who = "jc-pro-admin") => (await api(who, "GET", "/api/join-codes")).body;
const row = async (token) => (await list()).codes.find((c) => c.token === token);
const issued = [];

(async () => {
  // ---- Create ----
  let r = await api("jc-pro-admin", "POST", "/api/join-codes", { ...base(), companyId: CORE });
  const t1 = r.body && r.body.token; issued.push(t1);
  check("Create -> 200", r.status === 200, JSON.stringify(r.body));
  check("Token is base64url, 24 bytes (32 chars)", /^[A-Za-z0-9_-]{32}$/.test(t1 || ""));
  const d1 = (await codeDoc(t1).get()).data();
  check("companyId from claims, body companyId ignored", d1.companyId === PRO);
  check("Stored fields complete", ["codeId","name","companyId","siteId","subcontractorIds","locationRequired","userLimit","expiresAt","joinedCount","status","createdByUid","createdAt","updatedAt","revokedAt","replacedByToken"].every((k) => k in d1));
  let rw = await row(t1);
  check("Create -> shows Active", rw && rw.status === "active", JSON.stringify(rw));
  check("List columns: site name, sub names, joined/limit", rw && rw.siteName === "North Yard" && rw.subcontractorNames.join() === "Acme Labor" && rw.joinedCount === 0 && rw.userLimit === 10);
  check("Create -> /j/{token} live", (await jPage(t1)) === "live");

  // ---- Edit ----
  const exp = future();
  r = await api("jc-pro-admin", "POST", "/api/join-codes/update", { token: t1, ...base({ name: "Gate A2", siteId: "site-south", subcontractorIds: ["sub-acme", "sub-bolt"], locationRequired: false, userLimit: 5, expiresAt: exp }) });
  check("Edit -> 200", r.status === 200, JSON.stringify(r.body));
  rw = await row(t1);
  check("Edit -> changes saved", rw && rw.name === "Gate A2" && rw.siteName === "South Plant" && rw.subcontractorNames.length === 2 && rw.userLimit === 5 && rw.locationRequired === false && Math.abs(rw.expiresAt - Date.parse(exp)) < 1000, JSON.stringify(rw));
  check("Edit -> token unchanged", r.body.token === t1 && rw.token === t1);
  check("Edit -> codeId unchanged", (await codeDoc(t1).get()).get("codeId") === d1.codeId);

  // ---- Regenerate ----
  await codeDoc(t1).update({ joinedCount: 3 }); // simulate 3 joins
  r = await api("jc-pro-admin", "POST", "/api/join-codes/regenerate", { token: t1 });
  const t2 = r.body && r.body.token; issued.push(t2);
  check("Regenerate -> 200 + new token", r.status === 200 && t2 && t2 !== t1, JSON.stringify(r.body));
  const old = (await codeDoc(t1).get()).data(), nu = (await codeDoc(t2).get()).data();
  check("Regenerate -> old doc revoked + replacedByToken", old.status === "revoked" && old.replacedByToken === t2 && !!old.revokedAt);
  check("Regenerate -> same codeId + settings", nu.codeId === d1.codeId && nu.name === "Gate A2" && nu.siteId === "site-south" && nu.userLimit === 5 && nu.expiresAt.toMillis() === old.expiresAt.toMillis());
  check("Regenerate -> joined count kept", nu.joinedCount === 3);
  check("Regenerate -> old link 'no longer active'", (await jPage(t1)) === "inactive");
  check("Regenerate -> new link works", (await jPage(t2)) === "live");
  const l = await list();
  check("Regenerate -> list shows one row for the code", l.codes.filter((c) => c.codeId === d1.codeId).length === 1 && l.codes.some((c) => c.token === t2));
  check("Regenerate old token again -> 409", (await api("jc-pro-admin", "POST", "/api/join-codes/regenerate", { token: t1 })).status === 409);

  // ---- Revoke ----
  r = await api("jc-pro-admin", "POST", "/api/join-codes/revoke", { token: t2 });
  check("Revoke -> 200", r.status === 200, JSON.stringify(r.body));
  rw = (await list()).codes.find((c) => c.token === t2);
  check("Revoke -> shows Revoked", rw && rw.status === "revoked");
  check("Revoke -> revokedAt set", !!(await codeDoc(t2).get()).get("revokedAt"));
  check("Revoke -> link 'no longer active'", (await jPage(t2)) === "inactive");
  check("No un-revoke: edit revoked -> 409", (await api("jc-pro-admin", "POST", "/api/join-codes/update", { token: t2, ...base() })).status === 409);
  check("No un-revoke: revoke again -> 409", (await api("jc-pro-admin", "POST", "/api/join-codes/revoke", { token: t2 })).status === 409);

  // ---- Expired ----
  r = await api("jc-pro-admin", "POST", "/api/join-codes", base({ name: "Expiry test" }));
  const t3 = r.body.token; issued.push(t3);
  check("Create with past expiry -> 400", (await api("jc-pro-admin", "POST", "/api/join-codes", base({ expiresAt: past() }))).status === 400);
  r = await api("jc-pro-admin", "POST", "/api/join-codes/update", { token: t3, ...base({ name: "Expiry test", expiresAt: past() }) });
  check("Edit expiry into the past -> 200", r.status === 200, JSON.stringify(r.body));
  check("Past expiry -> shows Expired", (await row(t3)).status === "expired");
  check("Past expiry -> link dead ('no longer active')", (await jPage(t3)) === "inactive");

  // ---- Full ----
  r = await api("jc-pro-admin", "POST", "/api/join-codes", base({ name: "Full test", userLimit: 2 }));
  const t4 = r.body.token; issued.push(t4);
  await codeDoc(t4).update({ joinedCount: 2 });
  check("joinedCount = userLimit -> shows Full", (await row(t4)).status === "full");
  check("Full -> /j shows account problem", (await jPage(t4)) === "accountProblem");

  // ---- User limit vs plan cap (cap 15) ----
  check("User limit 16 > cap 15 rejected on create", (await api("jc-pro-admin", "POST", "/api/join-codes", base({ userLimit: 16 }))).status === 400);
  check("User limit 16 > cap 15 rejected on edit", (await api("jc-pro-admin", "POST", "/api/join-codes/update", { token: t3, ...base({ userLimit: 16 }) })).status === 400);
  r = await api("jc-pro-admin", "POST", "/api/join-codes", base({ name: "Cap ok", userLimit: 15 }));
  issued.push(r.body && r.body.token);
  check("User limit 15 = cap accepted", r.status === 200);
  const t5 = r.body.token;

  // ---- Validation / references ----
  check("Unknown site -> 400", (await api("jc-pro-admin", "POST", "/api/join-codes", base({ siteId: "nope" }))).status === 400);
  check("Subcontractor id not in this company -> 400", (await api("jc-pro-admin", "POST", "/api/join-codes", base({ subcontractorIds: ["sub-from-elsewhere"] }))).status === 400);
  check("Malformed token -> 404", (await api("jc-pro-admin", "POST", "/api/join-codes/revoke", { token: "abc" })).status === 404);

  // ---- Seats ----
  const live = (await co(PRO).collection("employees").where("active", "==", true).count().get()).data().count;
  const counter = (await co(PRO).get()).get("activeEmployeeCount");
  const L = await list();
  check(`Seats left matches active employees (cap 15, live ${live}, counter ${counter}, shown ${L.seatsLeft})`, L.activeCount === live && L.seatsLeft === 15 - live && L.activeCap === 15);
  await co(PRO).update({ employeeCap: counter });
  const L0 = await list();
  check("0 seats -> seatsLeft 0, live codes show 'No seats left'", L0.seatsLeft === 0 && L0.codes.find((c) => c.token === t5).status === "noSeats");
  check("0 seats -> /j shows account problem", (await jPage(t5)) === "accountProblem");
  await co(PRO).update({ employeeCap: 15 });
  check("Seat frees up -> code Active again", (await row(t5)).status === "active" && (await jPage(t5)) === "live");

  // ---- Owner = admin ----
  check("Owner can list", (await api("jc-pro-owner", "GET", "/api/join-codes")).status === 200);

  // ---- Cross-company: another Pro company's admin gets 404 ----
  await co(CORE).update({ planTier: "pro_tier1" });
  const other = await api("jc-core-admin", "GET", "/api/join-codes");
  check("Other company list has none of Pro's codes", other.status === 200 && !other.body.codes.some((c) => issued.includes(c.token)));
  for (const p of ["update", "regenerate", "revoke"]) {
    const x = await api("jc-core-admin", "POST", `/api/join-codes/${p}`, { token: t5, ...base({ siteId: "site-core", subcontractorIds: [] }) });
    check(`Other company ${p} -> 404 (not 403)`, x.status === 404, String(x.status));
  }
  const t5doc = (await codeDoc(t5).get()).data();
  check("Cross-company attempts changed nothing", t5doc.status === "active" && t5doc.name === "Cap ok");
  await co(CORE).update({ planTier: "core2_tier1" });

  // ---- Role / plan denials on every route ----
  const routes = [["GET", "/api/join-codes", undefined], ["POST", "/api/join-codes", base()], ["POST", "/api/join-codes/update", { token: t5, ...base() }], ["POST", "/api/join-codes/regenerate", { token: t5 }], ["POST", "/api/join-codes/revoke", { token: t5 }]];
  for (const who of ["jc-pro-supervisor", "jc-pro-employee", "jc-core-admin"]) {
    const codes = [];
    for (const [m, p, b] of routes) codes.push((await api(who, m, p, b)).status);
    check(`${who} denied (403) on all 5 join-code routes [${codes.join(",")}]`, codes.every((s) => s === 403));
  }
  const anon = [];
  for (const [m, p, b] of routes) anon.push((await api(null, m, p, b)).status);
  check(`No token -> 401 on all 5 routes [${anon.join(",")}]`, anon.every((s) => s === 401));
  check("Denied calls changed nothing", (await codeDoc(t5).get()).get("status") === "active");

  // ---- Downgrade Pro -> Core ----
  await co(PRO).update({ planTier: "core2_tier1" });
  check("Downgraded company -> /j shows dead (account problem)", (await jPage(t5)) === "accountProblem");
  check("Downgraded company -> list route 403", (await api("jc-pro-admin", "GET", "/api/join-codes")).status === 403);
  await co(PRO).update({ planTier: "pro_tier1" });
  check("Upgraded back -> link live again", (await jPage(t5)) === "live");

  // ---- Unknown token ----
  check("Unknown token -> 'no longer active'", (await jPage("Z".repeat(32))) === "inactive");

  require("fs").writeFileSync(require("os").tmpdir() + "/jc-issued.json", JSON.stringify(issued));
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(0);
})().catch(async (e) => {
  console.error("ERR", e.message);
  await co(PRO).update({ planTier: "pro_tier1", employeeCap: 15 });
  await co(CORE).update({ planTier: "core2_tier1" });
  process.exit(1);
});
