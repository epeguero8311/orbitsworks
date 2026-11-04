// Phase 3B - pure logic for email invites: the shared "can this invite be
// used" check, plan tiers, the per-project link helper and the email
// template's escaping. No emulator. Runs the compiled lib/.
// Run: node --test test/employeeInviteLogic.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { inviteProblem, rowCanBeInvited, companyCanUseInvites } = require("../lib/lib/employeeInviteChecks");
const { isCorePlan, isProPlan, isCoreOrProPlan, overSeatCaps } = require("../lib/lib/signupShared");
const appUrls = require("../lib/lib/appUrls");
const { buildInvitePrefill } = require("../lib/lib/invitePrefill");
const { buildEmployeeInviteEmail, escapeHtml } = require("../lib/emailTemplates/employeeInviteEmail");

const NOW = 1_000_000;
const at = (ms) => ({ toMillis: () => ms });
const pendingNew = { kind: "newPerson", status: "pending", expiresAt: at(NOW + 1000) };
const pendingRow = { kind: "existingEmployee", status: "pending", expiresAt: at(NOW + 1000) };
const core = { planTier: "core2_tier1", employeeCap: 15, totalEmployeeCap: 20, subscriptionStatus: "active" };
const seats = { active: 3, total: 3 };
const goodRow = { active: true };

test("plans: Core (legacy + core2), Pro; free / custom / unknown are neither", () => {
  for (const t of ["tier1", "tier5", "core2_tier1", "core2_tier5"]) assert.ok(isCorePlan(t) && isCoreOrProPlan(t), t);
  for (const t of ["pro_tier1", "pro_tier5"]) assert.ok(isProPlan(t) && isCoreOrProPlan(t), t);
  for (const t of ["free", "custom", "tier6", "tier10", "", null, undefined, "protier"]) assert.equal(isCoreOrProPlan(t), false, String(t));
});

test("companyCanUseInvites: Core/Pro and not past due", () => {
  assert.ok(companyCanUseInvites(core));
  assert.ok(companyCanUseInvites({ ...core, planTier: "pro_tier2" }));
  assert.equal(companyCanUseInvites({ ...core, subscriptionStatus: "past_due" }), false);
  assert.equal(companyCanUseInvites({ ...core, planTier: "free" }), false);
  assert.equal(companyCanUseInvites(undefined), false);
});

test("rowCanBeInvited: active, no login, not supervisor/admin", () => {
  assert.ok(rowCanBeInvited(goodRow));
  assert.equal(rowCanBeInvited({ active: false }), false);
  assert.equal(rowCanBeInvited({}), false);
  assert.equal(rowCanBeInvited({ active: true, linkedUserId: "u1" }), false);
  assert.equal(rowCanBeInvited({ active: true, appAccess: true }), false);
  assert.equal(rowCanBeInvited({ active: true, isSupervisor: true }), false);
  assert.equal(rowCanBeInvited({ active: true, isAdmin: true }), false);
  assert.equal(rowCanBeInvited(undefined), false);
});

test("overSeatCaps: active cap, total cap, null = none", () => {
  assert.equal(overSeatCaps({ employeeCap: 5, totalEmployeeCap: 10 }, { active: 4, total: 9 }), false);
  assert.equal(overSeatCaps({ employeeCap: 5, totalEmployeeCap: 10 }, { active: 5, total: 5 }), true);
  assert.equal(overSeatCaps({ employeeCap: 5, totalEmployeeCap: 10 }, { active: 1, total: 10 }), true);
  assert.equal(overSeatCaps({ employeeCap: null, totalEmployeeCap: null }, { active: 999, total: 999 }), false);
});

test("inviteProblem: usable invites", () => {
  assert.equal(inviteProblem({ invite: pendingNew, company: core, counts: seats, nowMs: NOW }), null);
  assert.equal(inviteProblem({ invite: pendingRow, company: core, row: goodRow, nowMs: NOW }), null);
});

test("inviteProblem: dead links are inviteInactive, checked first", () => {
  assert.equal(inviteProblem({ invite: undefined, company: core, nowMs: NOW }), "inviteInactive");
  assert.equal(inviteProblem({ invite: { ...pendingNew, expiresAt: at(NOW) }, company: core, counts: seats, nowMs: NOW }), "inviteInactive");
  assert.equal(inviteProblem({ invite: { ...pendingNew, status: "revoked" }, company: core, counts: seats, nowMs: NOW }), "inviteInactive");
  assert.equal(inviteProblem({ invite: { ...pendingNew, status: "accepted" }, company: core, counts: seats, nowMs: NOW }), "inviteInactive");
  // dead + bad plan still says inactive (no extra info leaks)
  assert.equal(inviteProblem({ invite: { ...pendingNew, status: "revoked" }, company: undefined, nowMs: NOW }), "inviteInactive");
});

test("inviteProblem: plan, billing and seats are accountProblem", () => {
  assert.equal(inviteProblem({ invite: pendingNew, company: { ...core, planTier: "free" }, counts: seats, nowMs: NOW }), "accountProblem");
  assert.equal(inviteProblem({ invite: pendingNew, company: { ...core, subscriptionStatus: "past_due" }, counts: seats, nowMs: NOW }), "accountProblem");
  assert.equal(inviteProblem({ invite: pendingNew, company: undefined, counts: seats, nowMs: NOW }), "accountProblem");
  assert.equal(inviteProblem({ invite: pendingNew, company: core, counts: { active: 15, total: 15 }, nowMs: NOW }), "accountProblem");
  assert.equal(inviteProblem({ invite: pendingNew, company: core, counts: undefined, nowMs: NOW }), "accountProblem");
  // An existing active row doesn't need a new seat.
  assert.equal(inviteProblem({ invite: pendingRow, company: { ...core, employeeCap: 1 }, row: goodRow, nowMs: NOW }), null);
});

test("inviteProblem: existing row gone / inactive / linked is inviteUnusable (extra rule 1)", () => {
  assert.equal(inviteProblem({ invite: pendingRow, company: core, row: undefined, nowMs: NOW }), "inviteUnusable");
  assert.equal(inviteProblem({ invite: pendingRow, company: core, row: { active: false }, nowMs: NOW }), "inviteUnusable");
  assert.equal(inviteProblem({ invite: pendingRow, company: core, row: { active: true, linkedUserId: "u" }, nowMs: NOW }), "inviteUnusable");
});

test("appUrls: dev -> dev site, prod -> orbitsworks.com, anything else -> null", () => {
  const T = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";
  assert.equal(appUrls.employeeInviteLink(T, "orbitworks-dev-ew"), `https://orbitsworks-backend--orbitworks-dev-ew.us-central1.hosted.app/i/${T}`);
  assert.equal(appUrls.employeeInviteLink(T, "orbitworks-7ef59"), `https://orbitsworks.com/i/${T}`);
  assert.equal(appUrls.employeeInviteLink(T, "orbitworks-something-else"), null);
  assert.equal(appUrls.employeeInviteLink(T, ""), null);
  assert.equal(appUrls.employeeInviteLink(T, "toString"), null);
  assert.equal(appUrls.supervisorJoinLink("A+b@x.co", "orbitworks-dev-ew"), "https://orbitsworks-backend--orbitworks-dev-ew.us-central1.hosted.app/join?email=A%2Bb%40x.co");
  assert.equal(appUrls.supervisorJoinLink("a@x.co", "orbitworks-7ef59"), "https://orbitsworks.com/join?email=a%40x.co");
  assert.equal(appUrls.siteFor("orbitworks-dev-ew").appName, "OrbitsWorks Dev");
});

test("appUrls: dev URL matches the app's DEV_APP_URL", () => {
  const { VARIANTS } = require("../../../orbitworks-app/config/envRules");
  assert.equal(appUrls.siteFor("orbitworks-dev-ew").baseUrl, VARIANTS.dev.joinLinks.appUrl);
});

test("email: company name and link are escaped, subject has no line breaks, ASCII", () => {
  const { subject, html } = buildEmployeeInviteEmail({
    companyName: 'Acme <script>alert(1)</script> & "Co"\r\nBcc: x',
    inviteLink: "https://example.com/i/abc?x=1&y=2",
    appName: "OrbitsWorks Dev",
    installFrom: "TestFlight",
    expiryDays: 7,
    companyLogoUrl: "javascript:alert(1)",
  });
  assert.equal(html.includes("<script>"), false);
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("https://example.com/i/abc?x=1&amp;y=2"));
  assert.equal(html.includes("javascript:"), false);
  assert.equal(/[\r\n]/.test(subject), false);
  assert.ok(html.includes("expires in 7 days"));
  assert.equal(/[^\x00-\x7F]/.test(html + subject), false);
  assert.equal(escapeHtml(`'"<>&`), "&#39;&quot;&lt;&gt;&amp;");
});

// ---- Phase 5d: invite autofill ----

test("5d buildInvitePrefill: existing row -> email, name, dob, listed subcontractor", () => {
  const p = buildInvitePrefill({
    invite: { kind: "existingEmployee", email: "pat@example.com" },
    row: { name: "Pat Row", dob: "1990-01-31", subcontractorId: "subA", pin: "4821", phone: "555" },
    subcontractorIds: ["subA"],
  });
  assert.deepEqual(p, { email: "pat@example.com", fullName: "Pat Row", birthday: "1990-01-31", subcontractorId: "subA" });
});

test("5d buildInvitePrefill: newPerson -> email only, even if a row is passed", () => {
  const p = buildInvitePrefill({ invite: { kind: "newPerson", email: "new@example.com" }, row: { name: "Someone", dob: "1990-01-31" }, subcontractorIds: [] });
  assert.deepEqual(p, { email: "new@example.com", fullName: null, birthday: null, subcontractorId: null });
});

test("5d buildInvitePrefill: unlisted subcontractor, junk fields -> null; bad email -> no prefill", () => {
  const p = buildInvitePrefill({ invite: { kind: "existingEmployee", email: "a@b.co" }, row: { name: 5, dob: "nope", subcontractorId: "gone" }, subcontractorIds: ["subA"] });
  assert.deepEqual(p, { email: "a@b.co", fullName: null, birthday: null, subcontractorId: null });
  assert.equal(buildInvitePrefill({ invite: { kind: "newPerson", email: "" }, subcontractorIds: [] }), null);
  assert.equal(buildInvitePrefill({ invite: { kind: "newPerson", email: undefined }, subcontractorIds: [] }), null);
});
