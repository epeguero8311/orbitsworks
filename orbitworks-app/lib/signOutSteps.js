// Employee App Phase 7 - sign-out clean-up, with no React Native imports so
// test/signOutSteps.test.js runs it under `node --test`.
//
// Every step runs at the same time, each capped at timeoutMs; a step that
// fails, throws or hangs is skipped. signOut() ALWAYS runs after, so a
// slow network (clearing the push token) can never stop a sign-out.

const SIGN_OUT_STEP_TIMEOUT_MS = 3000;

function withTimeout(run, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("timeout"), timeoutMs);
    Promise.resolve()
      .then(run)
      .then(
        () => resolve("ok"),
        () => resolve("failed")
      )
      .finally(() => clearTimeout(timer));
  });
}

// steps: [() => Promise]. -> the result of each step, in order.
async function runSignOut({ steps, signOut, timeoutMs = SIGN_OUT_STEP_TIMEOUT_MS }) {
  let results = [];
  try {
    results = await Promise.all((steps || []).map((step) => withTimeout(step, timeoutMs)));
  } finally {
    await signOut();
  }
  return results;
}

module.exports = { SIGN_OUT_STEP_TIMEOUT_MS, runSignOut };
