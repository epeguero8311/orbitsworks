// prod-readiness item 11 C: every functions param defined in src/ has a
// valid line in BOTH tracked .env files, and the predeploy check refuses a
// deploy when the project's file is missing or incomplete. No emulator.
//
// Run: node --test test/functionsEnv.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { checkFunctionsEnv, definedParams, parseEnv } = require("../scripts/lib/functionsEnv");

const functionsDir = path.join(__dirname, "..");

test("every defined param has a valid line in both project .env files", () => {
  const params = definedParams(functionsDir).map((p) => p.name);
  for (const name of ["ALERTS_FEED_ENABLED", "PUSH_NOTIFICATIONS_ENABLED", "AUTO_CLOCK_OUT_ENABLED", "DEVICE_TRACKING_ENABLED", "EMPLOYEE_DOC_PIN_REMOVED"]) {
    assert.ok(params.includes(name), name);
  }
  assert.deepEqual(checkFunctionsEnv(functionsDir, "orbitworks-7ef59"), []);
  assert.deepEqual(checkFunctionsEnv(functionsDir, "orbitworks-dev-ew"), []);
});

test("prod values: alerts, pushes, auto clock-out, device tracking on; PIN phase ii off; no TEST_COMPANY_IDS", () => {
  const env = parseEnv(fs.readFileSync(path.join(functionsDir, ".env.orbitworks-7ef59"), "utf8"));
  assert.equal(env.get("ALERTS_FEED_ENABLED"), "true");
  assert.equal(env.get("PUSH_NOTIFICATIONS_ENABLED"), "true");
  assert.equal(env.get("AUTO_CLOCK_OUT_ENABLED"), "true");
  assert.equal(env.get("DEVICE_TRACKING_ENABLED"), "true");
  assert.equal(env.get("EMPLOYEE_DOC_PIN_REMOVED"), "false");
  assert.equal(env.has("TEST_COMPANY_IDS"), false);
});

test("the .env files hold flags only - nothing that looks like a key or secret", () => {
  for (const f of [".env.orbitworks-7ef59", ".env.orbitworks-dev-ew"]) {
    for (const [name, value] of parseEnv(fs.readFileSync(path.join(functionsDir, f), "utf8"))) {
      assert.match(value, /^(true|false|\d+)$/, `${f} ${name}`);
    }
  }
});

test("a deploy is refused: missing file, missing line, bad value, unknown or no project", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fenv-"));
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "flags.ts"), 'defineBoolean("A_FLAG", { default: true });\ndefineInt("N", { default: 1 });\n');
  assert.match(checkFunctionsEnv(dir, "orbitworks-7ef59")[0], /missing/);
  fs.writeFileSync(path.join(dir, ".env.orbitworks-7ef59"), "A_FLAG=true\n");
  assert.deepEqual(checkFunctionsEnv(dir, "orbitworks-7ef59"), ["N has no line in .env.orbitworks-7ef59."]);
  fs.writeFileSync(path.join(dir, ".env.orbitworks-7ef59"), "A_FLAG=yes\nN=2\n");
  assert.match(checkFunctionsEnv(dir, "orbitworks-7ef59")[0], /must be true or false/);
  fs.writeFileSync(path.join(dir, ".env.orbitworks-7ef59"), "# c\nA_FLAG=false\r\nN=2\n");
  assert.deepEqual(checkFunctionsEnv(dir, "orbitworks-7ef59"), []);
  assert.match(checkFunctionsEnv(dir, "some-other")[0], /Unknown project/);
  assert.match(checkFunctionsEnv(dir, undefined)[0], /No project/);
  fs.rmSync(dir, { recursive: true, force: true });
});
