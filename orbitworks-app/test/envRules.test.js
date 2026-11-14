// Run: node --test test/
const test = require("node:test");
const assert = require("node:assert/strict");
const { checkBuildConfig, checkEasJson, evaluateRuntime, FIREBASE_PROJECTS, PROD_ASC_APP_ID } = require("../config/envRules");
const realEas = require("../eas.json");

const DEV = FIREBASE_PROJECTS.dev;
const PROD = FIREBASE_PROJECTS.prod;

// ---- build time ----
test("dev app + dev Firebase passes (strict and local)", () => {
  assert.deepEqual(checkBuildConfig({ appVariant: "dev", firebaseEnvRaw: "dev", strict: true }), []);
  assert.deepEqual(checkBuildConfig({ appVariant: "dev", firebaseEnvRaw: "dev", strict: false }), []);
});

test("dev app + prod Firebase FAILS, even locally", () => {
  assert.equal(checkBuildConfig({ appVariant: "dev", firebaseEnvRaw: "prod", strict: true }).length > 0, true);
  assert.equal(checkBuildConfig({ appVariant: "dev", firebaseEnvRaw: "prod", strict: false }).length > 0, true);
});

test("dev app + unset Firebase env FAILS (must be explicit)", () => {
  assert.equal(checkBuildConfig({ appVariant: "dev", firebaseEnvRaw: undefined, strict: false }).length > 0, true);
});

test("real app + dev Firebase FAILS in a build", () => {
  assert.equal(checkBuildConfig({ appVariant: undefined, firebaseEnvRaw: "dev", strict: true }).length > 0, true);
  assert.equal(checkBuildConfig({ appVariant: undefined, firebaseEnvRaw: undefined, strict: true }).length > 0, true);
});

test("real app + prod Firebase passes in a build", () => {
  assert.deepEqual(checkBuildConfig({ appVariant: undefined, firebaseEnvRaw: "prod", strict: true }), []);
});

test("unknown APP_VARIANT FAILS", () => {
  assert.equal(checkBuildConfig({ appVariant: "staging", firebaseEnvRaw: "dev", strict: false }).length > 0, true);
});

// ---- eas.json ----
test("the real eas.json passes", () => {
  assert.deepEqual(checkEasJson(realEas), []);
});

test("dev submit profile pointing at the REAL App Store app FAILS", () => {
  const eas = structuredClone(realEas);
  eas.submit.employeeDev = { ios: { ascAppId: PROD_ASC_APP_ID } };
  assert.match(checkEasJson(eas).join(" "), /REAL App Store app/);
});

test("strict dev build without a dev ascAppId FAILS", () => {
  const eas = structuredClone(realEas);
  delete eas.submit.employeeDev;
  assert.match(checkEasJson(eas, { requireDevSubmit: true }).join(" "), /ascAppId is missing/);
});

test("dev profile on the production channel FAILS", () => {
  const eas = structuredClone(realEas);
  eas.build.employeeDev.channel = "production";
  assert.equal(checkEasJson(eas).length > 0, true);
});

test("a real-app profile on the dev channel FAILS", () => {
  const eas = structuredClone(realEas);
  eas.build.production.channel = "employee-dev";
  assert.equal(checkEasJson(eas).length > 0, true);
});

// ---- launch time ----
test("dev app with dev project runs", () => {
  assert.equal(evaluateRuntime({ channel: "employee-dev", appVariant: "dev", bundleId: "com.orbitworks.app.dev", projectId: DEV }).ok, true);
});

test("dev app with prod project is BLOCKED", () => {
  const v = evaluateRuntime({ channel: "employee-dev", appVariant: "dev", bundleId: "com.orbitworks.app.dev", projectId: PROD });
  assert.deepEqual(v, { ok: false, reason: "devAppWrongProject" });
});

test("dev native build that got a prod OTA (variant says prod) is still BLOCKED by its channel", () => {
  const v = evaluateRuntime({ channel: "employee-dev", appVariant: "prod", bundleId: "com.orbitworks.app", projectId: PROD });
  assert.equal(v.ok, false);
});

test("real store app with a dev OTA is BLOCKED", () => {
  const v = evaluateRuntime({ channel: "production", appVariant: "dev", bundleId: "com.orbitworks.app.dev", projectId: DEV });
  assert.equal(v.ok, false);
});

test("real store app on dev Firebase is BLOCKED", () => {
  const v = evaluateRuntime({ channel: "production", appVariant: "prod", bundleId: "com.orbitworks.app", projectId: DEV });
  assert.deepEqual(v, { ok: false, reason: "prodAppWrongProject" });
});

test("real store app on prod Firebase runs", () => {
  assert.equal(evaluateRuntime({ channel: "production", appVariant: "prod", bundleId: "com.orbitworks.app", projectId: PROD }).ok, true);
});

test("local dev client of the real app on dev Firebase still runs (no channel)", () => {
  assert.equal(evaluateRuntime({ channel: null, appVariant: "prod", bundleId: "com.orbitworks.app", projectId: DEV }).ok, true);
});

// Crew code / invite links (prod-readiness B4): each app opens only its own
// website's links and its own scheme, so a dev link can never open the
// real app (or the reverse).
test("links: real app opens orbitsworks.com + orbitsworks://, dev app never does", () => {
  const { VARIANTS } = require("../config/envRules");
  const prod = VARIANTS.prod.joinLinks;
  const dev = VARIANTS.dev.joinLinks;
  assert.equal(prod.appUrl, "https://orbitsworks.com");
  assert.equal(prod.scheme, "orbitsworks");
  assert.notEqual(new URL(dev.appUrl).host, new URL(prod.appUrl).host);
  assert.notEqual(dev.scheme, prod.scheme);
  assert.equal(new URL(dev.appUrl).host.includes("orbitsworks.com"), false);
});

test("links: a real-app link is not a dev-app link and the reverse", () => {
  const { VARIANTS } = require("../config/envRules");
  const { parseAppLink } = require("../lib/joinLink");
  const tok = "A".repeat(43);
  const prodUrl = `https://orbitsworks.com/j/${tok}`;
  const devUrl = `${VARIANTS.dev.joinLinks.appUrl}/j/${tok}`;
  assert.ok(parseAppLink(prodUrl, VARIANTS.prod.joinLinks));
  assert.equal(parseAppLink(prodUrl, VARIANTS.dev.joinLinks), null);
  assert.equal(parseAppLink(devUrl, VARIANTS.prod.joinLinks), null);
  assert.equal(parseAppLink(`orbitsworks-dev://j/${tok}`, VARIANTS.prod.joinLinks), null);
  assert.equal(parseAppLink(`orbitsworks://j/${tok}`, VARIANTS.dev.joinLinks), null);
});
