const fs = require("fs");
const path = require("path");
const WEB = path.resolve(__dirname, "..", "..");
const adminFor = require("./adminFor");
const dev = adminFor(".env.local", "orbitworks-dev-ew", "devE2E");
const webEnv = require("module").createRequire(path.join(WEB, "package.json"))("dotenv").parse(fs.readFileSync(path.join(WEB, ".env.development.local")));
if (webEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "orbitworks-dev-ew") throw new Error("web env not dev");
const creds = JSON.parse(fs.readFileSync(__dirname + "/creds.json", "utf8"));
const BASE = "http://localhost:3000";
const cache = {};
async function idToken(key) {
  if (cache[key]) return cache[key];
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${webEnv.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: creds[key].email, password: creds[key].password, returnSecureToken: true }),
  });
  const j = await r.json();
  if (!j.idToken) throw new Error("sign-in failed for " + key + ": " + (j.error && j.error.message));
  return (cache[key] = j.idToken);
}
async function api(key, method, path, body) {
  const headers = { "Content-Type": "application/json" };
  if (key) headers.Authorization = "Bearer " + (await idToken(key));
  const r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
}
async function jPage(token) {
  const r = await fetch(`${BASE}/j/${token}`);
  const html = await r.text();
  // Only a live code shows the install-then-rescan steps (JoinCodeLanding).
  if (html.includes("Scan this QR code again.")) return "live";
  if (html.includes("no longer active")) return "inactive";
  if (html.includes("problem with this company")) return "accountProblem";
  return "unknown(" + r.status + ")";
}
const results = [];
function check(name, cond, detail = "") {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? "OK    " : "FAILED"} ${name}${!cond && detail ? "  -> " + detail : ""}`);
}
module.exports = { dev, api, jPage, check, results, creds };
