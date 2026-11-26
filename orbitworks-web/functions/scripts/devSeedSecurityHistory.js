#!/usr/bin/env node
// DEV ONLY - realistic clock history for Security Test Co (after
// scripts/devSeedSecurity.js). Refuses every other project, and refuses to
// run twice (companies/sec-test-company.historySeeded).
//
//   cd functions && npm run build
//   node scripts/devSeedSecurityHistory.js --project orbitworks-dev-ew            (dry run)
//   node scripts/devSeedSecurityHistory.js --project orbitworks-dev-ew --apply    (writes)
//
// Adds (deterministic - same data every run):
//   - jobs Foreman $24 (OT rate $36) and Operator $26
//   - 8 more employees with PINs on Site A, Site C or both
//   - a named supervisor-app device "Gate iPad"
//   - weekday shifts Mon Nov 9 - Wed Nov 25 2026 (America/Chicago) for them
//     plus Worker A / Worker C / Eve on the days they're free: varied start
//     (6:30-8:15), length (7.5-10.5 h), ~60% with a 30-45 min lunch break,
//     some days off, a few Saturdays, a split day across both sites, and a
//     couple of long days (10+ h) so the Overtime warning has something.
//     Sources: supervisor app PIN punches from the Gate iPad (most) and
//     admin manual entries (some).
//   - Approve Hours: everything before Mon Nov 23 approved with its job
//     (a few with tips), Nov 23 onward pending
//   - two people clocked in right now (today, still open) if it's after 7 am CT
//   - a few supervisor shift notes
// Never touches OT Test Co.
//
// Credentials: Application Default Credentials for the dev project.

const fs = require("node:fs");
const path = require("node:path");
const guard = require("./lib/projectGuard");

const DEV = "orbitworks-dev-ew";
const args = guard.parseArgs(process.argv.slice(2), "devSeedSecurityHistory.js");
if (args.project !== DEV) guard.fail(`This script only runs with --project ${DEV}.`);
guard.lockProject(args.project);

const COMPANY_ID = "sec-test-company";
const SITES = { "site-a": "Site A", "site-c": "Site C" };
const NEW_JOBS = [
  { id: "foreman", name: "Foreman", hourlyRate: 24, overtimeRate: 36 },
  { id: "operator", name: "Operator", hourlyRate: 26 },
];
const NEW_EMPLOYEES = [
  { id: "emp-maria", name: "Maria Lopez", sites: ["site-a"], jobId: "laborer", rate: 19, pin: "6101" },
  { id: "emp-james", name: "James Carter", sites: ["site-a"], jobId: "foreman", rate: null, pin: "6102" },
  { id: "emp-luis", name: "Luis Ramirez", sites: ["site-c"], jobId: "laborer", rate: 17, pin: "6103" },
  { id: "emp-aisha", name: "Aisha Brown", sites: ["site-c"], jobId: "operator", rate: null, pin: "6104" },
  { id: "emp-tom", name: "Tom Nguyen", sites: ["site-a", "site-c"], jobId: "foreman", rate: null, pin: "6105" },
  { id: "emp-carlos", name: "Carlos Diaz", sites: ["site-a"], jobId: "laborer", rate: 16, pin: "6106" },
  { id: "emp-kevin", name: "Kevin Smith", sites: ["site-c"], jobId: "operator", rate: null, pin: "6107" },
  { id: "emp-rosa", name: "Rosa Martinez", sites: ["site-a"], jobId: "laborer", rate: 22, pin: "6108" },
];
// Existing people who also get history (on days they have nothing).
const EXISTING = [
  { id: "worker-a", name: "Worker A", sites: ["site-a"], jobId: "laborer", busy: ["2026-11-23", "2026-11-24"] },
  { id: "worker-c", name: "Worker C", sites: ["site-c"], jobId: "laborer", busy: ["2026-11-23", "2026-11-24"] },
  { id: "sec-employee", name: "Eve Employee", sites: ["site-a"], jobId: "laborer", busy: ["2026-11-25"] },
];
const DEVICE = { id: "sec-gate-ipad", name: "Gate iPad" };
const APPROVE_BEFORE = "2026-11-23";

// Deterministic random (mulberry32).
let seed = 20261126;
function rnd() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (lo, hi, step) => lo + step * Math.floor(rnd() * (Math.floor((hi - lo) / step) + 1));

// Chicago, Nov 2026 is CST (UTC-6).
const ct = (day, minutes) => Date.UTC(2026, 10, day, 6, 0) + minutes * 60000;
const dateKey = (day) => `2026-11-${String(day).padStart(2, "0")}`;
const weekday = (day) => new Date(Date.UTC(2026, 10, day)).getUTCDay(); // 0 Sun

function buildShifts(people) {
  const shifts = []; // { emp, day, siteId, jobId, inMin, outMin, breakAt?, breakLen?, source }
  for (const p of people) {
    for (let day = 9; day <= 25; day++) {
      const wd = weekday(day);
      if (wd === 0) continue;
      if (wd === 6 && rnd() > 0.2) continue; // a few Saturdays
      if (p.busy && p.busy.includes(dateKey(day))) continue;
      if (wd !== 6 && rnd() < 0.12) continue; // day off / absent
      const start = between(390, 495, 5); // 6:30 - 8:15
      let length = between(450, 630, 5); // 7.5 - 10.5 h
      if (wd === 6) length = between(240, 330, 15);
      const source = rnd() < 0.75 ? "pin" : "adminManual";
      const hasBreak = wd !== 6 && rnd() < 0.6;
      const breakAt = hasBreak ? start + between(210, 300, 5) : null;
      const breakLen = hasBreak ? pick([30, 30, 30, 35, 45]) : null;
      // Tom: one split day across both sites.
      if (p.id === "emp-tom" && day === 18) {
        shifts.push({ emp: p, day, siteId: "site-a", jobId: p.jobId, inMin: 420, outMin: 660, source: "pin" });
        shifts.push({ emp: p, day, siteId: "site-c", jobId: p.jobId, inMin: 705, outMin: 990, source: "pin" });
        continue;
      }
      const siteId = p.sites.length > 1 ? pick(p.sites) : p.sites[0];
      shifts.push({ emp: p, day, siteId, jobId: p.jobId, inMin: start, outMin: start + length, breakAt, breakLen, source });
    }
  }
  return shifts;
}

async function main() {
  const admin = require("firebase-admin");
  const { db } = require(path.join(__dirname, "..", "lib", "shared.js"));
  guard.assertResolvedProject(admin, args.project);
  const { FieldValue, Timestamp } = admin.firestore;
  console.log(`[devSeedSecurityHistory] project=${args.project} ${args.apply ? "APPLY" : "DRY RUN (no writes)"}`);

  const companyRef = db.collection("companies").doc(COMPANY_ID);
  const company = await companyRef.get();
  if (!company.exists || company.get("devSeed") !== "security-checks") guard.fail(`${COMPANY_ID} is not the security seed company - run devSeedSecurity.js first.`);
  if (company.get("historySeeded")) guard.fail("History already seeded - nothing written.");
  for (const e of NEW_EMPLOYEES) {
    if ((await companyRef.collection("pins").doc(e.pin).get()).exists) guard.fail(`PIN ${e.pin} is taken.`);
  }
  const ownerUid = company.get("ownerUid");
  const users = await db.collection("users").where("companyId", "==", COMPANY_ID).get();
  const supervisor = users.docs.find((u) => u.get("role") === "supervisor");
  const ownerName = users.docs.find((u) => u.id === ownerUid)?.get("name") ?? "Owner";

  const people = [...NEW_EMPLOYEES, ...EXISTING];
  const shifts = buildShifts(people);
  // Two long days for the Overtime warning.
  for (const s of shifts.filter((x) => x.emp.id === "emp-james" && (x.day === 12 || x.day === 19))) s.outMin = s.inMin + 660;

  const now = Date.now();
  const todayDay = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", day: "numeric" }).format(now));
  const nowCtMin = Math.floor((now - Date.UTC(2026, 10, todayDay, 6, 0)) / 60000);
  const openToday = nowCtMin > 430 && todayDay > 25 ? [
    { emp: NEW_EMPLOYEES.find((e) => e.id === "emp-tom"), siteId: "site-a", inMin: 422 },
    { emp: NEW_EMPLOYEES.find((e) => e.id === "emp-maria"), siteId: "site-a", inMin: Math.min(415, nowCtMin - 5) },
  ] : [];

  console.log(`  ${NEW_JOBS.length} jobs, ${NEW_EMPLOYEES.length} new employees, device "${DEVICE.name}"`);
  console.log(`  ${shifts.length} shifts Nov 9-25 (${shifts.filter((s) => dateKey(s.day) < APPROVE_BEFORE).length} approved, rest pending), ${shifts.filter((s) => s.breakAt).length} with a break`);
  console.log(`  open right now: ${openToday.map((o) => o.emp.name).join(", ") || "none (before 7:10 am CT or not after Nov 25)"}`);
  if (!args.apply) {
    console.log("Dry run - nothing written.");
    return;
  }

  const ts = FieldValue.serverTimestamp();
  for (const j of NEW_JOBS) await companyRef.collection("jobs").doc(j.id).set({ name: j.name, hourlyRate: j.hourlyRate, ...(j.overtimeRate ? { overtimeRate: j.overtimeRate } : {}), active: true, createdAt: ts });
  for (const e of NEW_EMPLOYEES) {
    const job = NEW_JOBS.find((j) => j.id === e.jobId) ?? { name: "Laborer" };
    const b = db.batch();
    b.set(companyRef.collection("employees").doc(e.id), {
      name: e.name, active: true, jobId: e.jobId, jobTitle: job.name, hourlyRate: e.rate, assignedSiteIds: e.sites,
      subcontractorId: null, subcontractorName: null, isAdmin: false, isSupervisor: false, pin: e.pin, createdAt: Timestamp.fromMillis(ct(2, 480)), devSeed: "security-history",
    });
    b.set(companyRef.collection("employeePins").doc(e.id), { pin: e.pin, updatedAt: Timestamp.now() });
    b.set(companyRef.collection("pins").doc(e.pin), { employeeId: e.id, updatedAt: Timestamp.now() });
    await b.commit();
  }
  await companyRef.collection("devices").doc(DEVICE.id).set({ name: DEVICE.name, platform: "ios", model: "iPad", createdByUid: supervisor?.id ?? ownerUid, createdAt: Timestamp.fromMillis(ct(2, 480)) }, { merge: true });

  // Events, oldest first.
  const events = [];
  const clockIns = []; // { ref, shift }
  for (const s of shifts) {
    const base = { employeeId: s.emp.id, employeeName: s.emp.name, siteId: s.siteId, siteName: SITES[s.siteId], subcontractorId: null, subcontractorName: null };
    const src = s.source === "pin"
      ? { source: "pin", createdByUid: supervisor?.id ?? ownerUid, authorizedById: null, authorizedByName: null, deviceId: DEVICE.id, deviceNameSnapshot: DEVICE.name, reason: null, overrideEventId: null, note: null }
      : { source: "adminManual", createdByUid: ownerUid, authorizedById: ownerUid, authorizedByName: ownerName };
    const inRef = companyRef.collection("clockEvents").doc();
    clockIns.push({ ref: inRef, shift: s });
    events.push({ ref: inRef, ms: ct(s.day, s.inMin), data: { ...base, ...src, type: "in" } });
    if (s.breakAt) {
      events.push({ ms: ct(s.day, s.breakAt), data: { ...base, ...src, type: "breakStart" } });
      events.push({ ms: ct(s.day, s.breakAt + s.breakLen), data: { ...base, ...src, type: "breakEnd" } });
    }
    events.push({ ms: ct(s.day, s.outMin), data: { ...base, ...src, type: "out" } });
  }
  for (const o of openToday) {
    events.push({ ms: ct(todayDay, o.inMin), data: { employeeId: o.emp.id, employeeName: o.emp.name, siteId: o.siteId, siteName: SITES[o.siteId], subcontractorId: null, subcontractorName: null, source: "pin", createdByUid: supervisor?.id ?? ownerUid, authorizedById: null, authorizedByName: null, deviceId: DEVICE.id, deviceNameSnapshot: DEVICE.name, reason: null, overrideEventId: null, note: null, type: "in" } });
  }
  events.sort((a, b) => a.ms - b.ms);
  for (let i = 0; i < events.length; i += 40) {
    const b = db.batch();
    for (const e of events.slice(i, i + 40)) {
      const ref = e.ref ?? companyRef.collection("clockEvents").doc();
      b.set(ref, { ...e.data, timestamp: Timestamp.fromMillis(e.ms), createdAt: Timestamp.fromMillis(e.ms) });
    }
    await b.commit();
  }
  console.log(`  ${events.length} clock events written. Waiting for the trigger's approval docs...`);

  // Approve before Nov 23 (after the trigger made each pending doc).
  const toApprove = clockIns.filter((c) => dateKey(c.shift.day) < APPROVE_BEFORE);
  const allJobs = { laborer: "Laborer", ...Object.fromEntries(NEW_JOBS.map((j) => [j.id, j.name])) };
  let missing = 0, tips = 0;
  for (const [i, c] of toApprove.entries()) {
    const ref = companyRef.collection("timesheetApprovals").doc(c.ref.id);
    let snap = await ref.get();
    for (let t = 0; !snap.exists && t < 60; t++) {
      await new Promise((r) => setTimeout(r, 1000));
      snap = await ref.get();
    }
    if (!snap.exists) missing++;
    const tipCents = i % 9 === 4 ? between(1000, 6000, 250) : 0;
    await ref.set({
      employeeId: c.shift.emp.id, employeeName: c.shift.emp.name, date: dateKey(c.shift.day), siteId: c.shift.siteId, siteName: SITES[c.shift.siteId],
      status: "approved", approvedByUid: ownerUid, approvedByName: ownerName, approvedAt: ts,
      jobId: c.shift.jobId, jobName: allJobs[c.shift.jobId], autoBreakMinutesApplied: 0, autoBreakMinShiftHoursApplied: 0,
      ...(tipCents ? { tipCents, tipUpdatedByUid: ownerUid, tipUpdatedByName: ownerName, tipUpdatedAt: ts } : {}),
    }, { merge: true });
    if (tipCents) {
      tips++;
      await ref.collection("tipEdits").add({ companyId: COMPANY_ID, clockInEventId: c.ref.id, amountCents: tipCents, previousAmountCents: 0, editedByUid: ownerUid, editedByName: ownerName, editedAt: ts });
    }
  }
  console.log(`  ${toApprove.length} shifts approved (${tips} with a tip)${missing ? `, ${missing} approval docs written directly` : ""}.`);

  const notes = [
    [12, 600, "site-a", "Concrete delivery late, crew started forms instead."],
    [17, 840, "site-c", "Rain after 2pm - sent two guys home early."],
    [20, 450, "site-a", "Gate lock jammed this morning, called the owner."],
    [24, 720, "site-c", "Inspector on site, passed rough-in."],
  ];
  for (const [day, min, siteId, note] of notes) {
    await companyRef.collection("shiftNotes").add({ note, siteId, siteName: SITES[siteId], createdByUid: supervisor?.id ?? ownerUid, timestamp: Timestamp.fromMillis(ct(day, min)) });
  }
  await companyRef.update({ historySeeded: ts });
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
