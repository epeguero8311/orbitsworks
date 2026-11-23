// Phase 7 - employeePushValidators.ts (push token calls). Pure zod, no
// emulator. Runs the compiled lib/ (npm run build first).
// Run: node --test test/employeePushValidators.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const v = require("../lib/employeePushValidators");

const TOKEN = "ExponentPushToken[abcDEF123_-xyz]";
const ok = (schema, input) => schema.safeParse(input).success;

test("register: an Expo token and ios/android pass", () => {
  assert.ok(ok(v.registerEmployeePushTokenSchema, { token: TOKEN, platform: "ios" }));
  assert.ok(ok(v.registerEmployeePushTokenSchema, { token: "ExpoPushToken[a1]", platform: "android" }));
});

test("register: bad token, bad platform, extra fields fail", () => {
  assert.ok(!ok(v.registerEmployeePushTokenSchema, { token: "not-a-token", platform: "ios" }));
  assert.ok(!ok(v.registerEmployeePushTokenSchema, { token: "ExponentPushToken[a b]", platform: "ios" }));
  assert.ok(!ok(v.registerEmployeePushTokenSchema, { token: TOKEN, platform: "web" }));
  assert.ok(!ok(v.registerEmployeePushTokenSchema, { token: TOKEN, platform: "ios", employeeId: "someone" }));
  assert.ok(!ok(v.registerEmployeePushTokenSchema, { platform: "ios" }));
});

test("register: token over 256 chars fails", () => {
  const long = `ExponentPushToken[${"a".repeat(260)}]`;
  assert.ok(!ok(v.registerEmployeePushTokenSchema, { token: long, platform: "ios" }));
});

test("clear: needs the token, nothing else", () => {
  assert.ok(ok(v.clearEmployeePushTokenSchema, { token: TOKEN }));
  assert.ok(!ok(v.clearEmployeePushTokenSchema, {}));
  assert.ok(!ok(v.clearEmployeePushTokenSchema, { token: TOKEN, employeeId: "x" }));
});
