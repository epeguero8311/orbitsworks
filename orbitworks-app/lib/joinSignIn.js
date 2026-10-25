// Sign-in after a crew code sign-up: the worker taps Done on the Welcome
// screen and is signed in with the email/password they just typed.
// CommonJS + no React Native imports so it runs under `node --test`.
//
// Nothing here touches storage, navigation params, the console or Sentry:
// the email/password and the Login hand-off live in memory only.

// How long Done waits for the app to switch to EmployeeHome after a
// successful sign-in before giving up and sending the worker to Login.
const HOME_SWITCH_TIMEOUT_MS = 10000;

const SIGN_IN_MESSAGES = {
  ready: "Your account is ready. Sign in below with your email and password.",
  offline: "Your account is ready. Check your connection, then sign in below.",
  disabled: "Your account has been deactivated by your company.",
};

function signInFailMessage(err) {
  const code = err && typeof err.code === "string" ? err.code : "";
  if (code === "auth/network-request-failed") return SIGN_IN_MESSAGES.offline;
  if (code === "auth/user-disabled") return SIGN_IN_MESSAGES.disabled;
  return SIGN_IN_MESSAGES.ready;
}

// Calls signIn(email, password) exactly once. Never throws.
// -> { ok: true } or { ok: false, email, message }
async function finishJoinSignIn({ email, password, signIn }) {
  if (!email || !password) return { ok: false, email: email || "", message: SIGN_IN_MESSAGES.ready };
  try {
    await signIn(email, password);
    return { ok: true };
  } catch (err) {
    return { ok: false, email, message: signInFailMessage(err) };
  }
}

// After a successful sign-in the app should switch to EmployeeHome on its
// own (the sign-up screen unmounts). Calls onTimeout once if that hasn't
// happened within ms. Returns cancel(), called on unmount.
function watchForHomeSwitch({ onTimeout, ms = HOME_SWITCH_TIMEOUT_MS, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let settled = false;
  const timer = setTimer(() => {
    if (settled) return;
    settled = true;
    onTimeout();
  }, ms);
  return function cancel() {
    if (settled) return;
    settled = true;
    clearTimer(timer);
  };
}

// One-shot hand-off to the Login screen (email to prefill + a message).
// Memory only; reading it clears it.
let loginPrefill = null;

function setLoginPrefill(email, message) {
  loginPrefill = { email: typeof email === "string" ? email : "", message: typeof message === "string" ? message : "" };
}

function takeLoginPrefill() {
  const value = loginPrefill;
  loginPrefill = null;
  return value;
}

// For a useState initializer (React may call it twice): read without
// clearing, then clear with takeLoginPrefill() in an effect.
function peekLoginPrefill() {
  return loginPrefill;
}

module.exports = {
  HOME_SWITCH_TIMEOUT_MS,
  SIGN_IN_MESSAGES,
  signInFailMessage,
  finishJoinSignIn,
  watchForHomeSwitch,
  setLoginPrefill,
  takeLoginPrefill,
  peekLoginPrefill,
};
