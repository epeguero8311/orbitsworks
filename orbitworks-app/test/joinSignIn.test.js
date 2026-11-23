// Done -> sign-in after a crew code sign-up (lib/joinSignIn.js), plus
// source checks that nothing in the sign-up flow signs in before Done.
// Run via: node --test test/joinSignIn.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  HOME_SWITCH_TIMEOUT_MS,
  SIGN_IN_MESSAGES,
  signInFailMessage,
  finishJoinSignIn,
  watchForHomeSwitch,
  setLoginPrefill,
  takeLoginPrefill,
  peekLoginPrefill,
} = require("../lib/joinSignIn");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("Done signs in exactly once with the form's email and password", async () => {
  const calls = [];
  const res = await finishJoinSignIn({
    email: "ana@example.com",
    password: "s3cret-pass",
    signIn: async (e, p) => calls.push([e, p]),
  });
  assert.deepEqual(res, { ok: true });
  assert.deepEqual(calls, [["ana@example.com", "s3cret-pass"]]);
});

test("sign-in failure: email back plus a plain message, never throws", async () => {
  const fail = (code) => async () => {
    const err = new Error("internal detail that must not be shown");
    err.code = code;
    throw err;
  };
  const offline = await finishJoinSignIn({ email: "ana@example.com", password: "s3cret-pass", signIn: fail("auth/network-request-failed") });
  assert.deepEqual(offline, { ok: false, email: "ana@example.com", message: "Your account is ready. Check your connection, then sign in below." });
  const disabled = await finishJoinSignIn({ email: "ana@example.com", password: "s3cret-pass", signIn: fail("auth/user-disabled") });
  assert.equal(disabled.message, SIGN_IN_MESSAGES.disabled);
  const other = await finishJoinSignIn({ email: "ana@example.com", password: "s3cret-pass", signIn: fail("auth/internal-error") });
  assert.equal(other.message, "Your account is ready. Sign in below with your email and password.");
  assert.equal(signInFailMessage(null), SIGN_IN_MESSAGES.ready);
  for (const r of [offline, disabled, other]) assert.ok(!r.message.includes("internal detail"));
});

test("no saved credentials: no sign-in call, Login with the ready message", async () => {
  let called = false;
  const res = await finishJoinSignIn({ email: "", password: "", signIn: async () => (called = true) });
  assert.equal(called, false);
  assert.deepEqual(res, { ok: false, email: "", message: SIGN_IN_MESSAGES.ready });
});

test("signed in but no switch to EmployeeHome within 10s: falls back once", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  assert.equal(HOME_SWITCH_TIMEOUT_MS, 10000);
  let fired = 0;
  watchForHomeSwitch({ onTimeout: () => fired++ });
  t.mock.timers.tick(9999);
  assert.equal(fired, 0);
  t.mock.timers.tick(1);
  assert.equal(fired, 1);
  t.mock.timers.tick(60000);
  assert.equal(fired, 1);
});

test("switch to EmployeeHome in time (unmount cancels): no fallback", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let fired = 0;
  const cancel = watchForHomeSwitch({ onTimeout: () => fired++ });
  t.mock.timers.tick(3000);
  cancel();
  cancel();
  t.mock.timers.tick(20000);
  assert.equal(fired, 0);
});

test("fallback flow: sign-in OK, no switch -> Login gets email + ready message", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const res = await finishJoinSignIn({ email: "ana@example.com", password: "s3cret-pass", signIn: async () => {} });
  assert.equal(res.ok, true);
  watchForHomeSwitch({ onTimeout: () => setLoginPrefill("ana@example.com", SIGN_IN_MESSAGES.ready) });
  assert.equal(peekLoginPrefill(), null);
  t.mock.timers.tick(HOME_SWITCH_TIMEOUT_MS);
  assert.deepEqual(peekLoginPrefill(), { email: "ana@example.com", message: SIGN_IN_MESSAGES.ready });
  takeLoginPrefill();
});

test("Login hand-off: peek keeps it, take reads once and clears", () => {
  setLoginPrefill("ana@example.com", SIGN_IN_MESSAGES.offline);
  assert.deepEqual(peekLoginPrefill(), { email: "ana@example.com", message: SIGN_IN_MESSAGES.offline });
  assert.deepEqual(takeLoginPrefill(), { email: "ana@example.com", message: SIGN_IN_MESSAGES.offline });
  assert.equal(takeLoginPrefill(), null);
  assert.equal(peekLoginPrefill(), null);
  setLoginPrefill(undefined, 42);
  assert.deepEqual(takeLoginPrefill(), { email: "", message: "" });
});

test("nothing in the sign-up flow signs in except Done", () => {
  const files = [
    "lib/joinApi.js",
    "lib/hooks/useJoinInfo.js",
    "lib/hooks/useJoinSubmit.js",
    ...fs.readdirSync(path.join(root, "screens/join")).map((f) => "screens/join/" + f),
    ...fs.readdirSync(path.join(root, "components/join")).map((f) => "components/join/" + f),
  ];
  for (const f of files) assert.ok(!/signIn/.test(read(f)), f + " must not sign in");

  const screen = read("screens/JoinStartScreen.js");
  const calls = screen.match(/signInWithEmailAndPassword\(/g) || [];
  assert.equal(calls.length, 1, "exactly one sign-in call");
  const doneStart = screen.indexOf("async function onDone()");
  const doneEnd = screen.indexOf("const onCaptured");
  assert.ok(doneStart > 0 && doneEnd > doneStart);
  const callAt = screen.indexOf("signInWithEmailAndPassword(");
  assert.ok(callAt > doneStart && callAt < doneEnd, "the sign-in call is inside onDone");
  const submit = screen.slice(screen.indexOf("async function onSubmit("), screen.indexOf("if (step === \"switching\")"));
  assert.ok(!/signIn|onDone\(/.test(submit), "submit never signs in");
  assert.ok(screen.includes("onDone={onDone}"), "Welcome's Done is wired to onDone");
});

test("credentials and hand-off stay in memory (no storage, console or Sentry)", () => {
  for (const f of ["lib/joinSignIn.js", "screens/JoinStartScreen.js", "screens/join/JoinWelcomeStep.js"]) {
    const src = read(f);
    assert.ok(!/AsyncStorage|SecureStore|MMKV|console\.|Sentry\./.test(src), f);
  }
  const screen = read("screens/JoinStartScreen.js");
  assert.ok(!/navigation\.(navigate|reset|replace)\([^)]*(password|email)/.test(screen), "no credentials in nav params");
});
