// Builds an Admin SDK app from an env file. Refuses a mismatched project.
const fs = require("fs");
const path = require("path");
const WEB = path.resolve(__dirname, "..", "..");
const webRequire = require("module").createRequire(path.join(WEB, "package.json"));
const nm = (m) => webRequire(m);
const { initializeApp, cert } = nm("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = nm("firebase-admin/firestore");
const { getAuth } = nm("firebase-admin/auth");
function readEnv(file) {
  return webRequire("dotenv").parse(fs.readFileSync(path.join(WEB, file)));
}
module.exports = function adminFor(file, expectProject, name) {
  const e = readEnv(file);
  if (e.FIREBASE_ADMIN_PROJECT_ID !== expectProject) throw new Error(`${file} is ${e.FIREBASE_ADMIN_PROJECT_ID}, expected ${expectProject}`);
  const app = initializeApp({ credential: cert({ projectId: e.FIREBASE_ADMIN_PROJECT_ID, clientEmail: e.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: e.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\n/g, "\n") }) }, name);
  return { app, db: getFirestore(app), auth: getAuth(app), FieldValue, Timestamp, env: e };
};
