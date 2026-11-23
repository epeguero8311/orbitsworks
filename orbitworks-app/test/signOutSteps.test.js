// Employee App Phase 7 - sign-out clean-up (lib/signOutSteps.js): clearing
// the push token, cancelling break reminders and dropping the PIN check
// value never stop or delay the sign-out past the 3 s cap.
// Run: node --test test/signOutSteps.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { runSignOut, SIGN_OUT_STEP_TIMEOUT_MS } = require("../lib/signOutSteps");

test("all steps run, then sign-out", async () => {
  const order = [];
  const results = await runSignOut({
    steps: [async () => order.push("pin"), async () => order.push("push"), async () => order.push("reminders")],
    signOut: async () => order.push("signOut"),
  });
  assert.deepEqual(results, ["ok", "ok", "ok"]);
  assert.equal(order[order.length - 1], "signOut");
  assert.equal(order.length, 4);
});

test("a step that fails or throws right away still signs out", async () => {
  let signedOut = false;
  const results = await runSignOut({
    steps: [
      async () => {
        throw new Error("offline");
      },
      () => {
        throw new Error("sync throw");
      },
      async () => {},
    ],
    signOut: async () => {
      signedOut = true;
    },
  });
  assert.deepEqual(results, ["failed", "failed", "ok"]);
  assert.equal(signedOut, true);
});

test("a step that hangs (no signal) is cut off at the cap and sign-out still happens", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signedOut = false;
  const done = runSignOut({
    steps: [() => new Promise(() => {}), async () => {}],
    signOut: async () => {
      signedOut = true;
    },
  });
  await new Promise((resolve) => setImmediate(resolve)); // let the fast step finish
  assert.equal(signedOut, false);
  t.mock.timers.tick(SIGN_OUT_STEP_TIMEOUT_MS);
  const results = await done;
  assert.deepEqual(results, ["timeout", "ok"]);
  assert.equal(signedOut, true);
  assert.equal(SIGN_OUT_STEP_TIMEOUT_MS, 3000);
});

test("no steps: just signs out", async () => {
  let signedOut = false;
  await runSignOut({ steps: [], signOut: async () => (signedOut = true) });
  assert.equal(signedOut, true);
});
