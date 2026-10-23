// Guard for the DEV website deploy (orbitworks-dev-ew App Hosting).
// apphosting.orbitworks_dev.yaml is merged over apphosting.yaml (prod), so
// any variable it forgets would silently keep its PROD value on the dev
// site. This fails (exit 1) unless every variable is redefined with a dev
// value. Run: node scripts/check-apphosting-dev.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEV_PROJECT = "orbitworks-dev-ew";
const PROD_MARKERS = ["orbitworks-7ef59", "248478616055", "pk_live", "sk_live", "rk_live"];

// Tiny reader for the flat "- variable / value|secret" layout these files use.
function readVars(file) {
  const text = readFileSync(path.resolve(root, file), "utf8");
  const vars = new Map();
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const v = /^\s*-\s*variable:\s*(\S+)\s*$/.exec(line);
    if (v) {
      current = { name: v[1], value: null, secret: null };
      vars.set(v[1], current);
      continue;
    }
    const val = /^\s+value:\s*(.*)$/.exec(line);
    if (val && current) current.value = val[1].trim().replace(/^"(.*)"$/, "$1");
    const sec = /^\s+secret:\s*(\S+)\s*$/.exec(line);
    if (sec && current) current.secret = sec[1];
  }
  return { text, vars };
}

const prod = readVars("apphosting.yaml");
// Optional path argument is only for testing the checker itself.
const dev = readVars(process.argv[2] ?? "apphosting.orbitworks_dev.yaml");
let failed = 0;
function check(label, ok, detail) {
  console.log(`${label}: ${ok ? "OK" : "FAILED"}${!ok && detail ? " - " + detail : ""}`);
  if (!ok) failed += 1;
}

const missing = [...prod.vars.keys()].filter((k) => !dev.vars.has(k));
check(`Every apphosting.yaml variable redefined for dev (${prod.vars.size})`, missing.length === 0, missing.join(", "));

const prodValues = new Set([...prod.vars.values()].map((v) => v.value).filter(Boolean));
const reused = [...dev.vars.values()].filter((v) => v.value && prodValues.has(v.value)).map((v) => v.name);
check("No dev value equals a prod value", reused.length === 0, reused.join(", "));

const marked = [...dev.vars.values()].filter((v) => v.value && PROD_MARKERS.some((m) => v.value.includes(m))).map((v) => v.name);
check("No prod project IDs or live keys in dev values", marked.length === 0, marked.join(", "));

const secretMismatch = [...prod.vars.values()].filter((v) => v.secret && !dev.vars.get(v.name)?.secret).map((v) => v.name);
check("Secrets stay Secret Manager references", secretMismatch.length === 0, secretMismatch.join(", "));

check("NEXT_PUBLIC_FIREBASE_PROJECT_ID is dev", dev.vars.get("NEXT_PUBLIC_FIREBASE_PROJECT_ID")?.value === DEV_PROJECT);

const appUrl = dev.vars.get("NEXT_PUBLIC_APP_URL")?.value ?? "";
check("NEXT_PUBLIC_APP_URL is the dev backend", new RegExp(`^https://[a-z0-9-]+--${DEV_PROJECT}\\.[a-z0-9-]+\\.hosted\\.app$`).test(appUrl), appUrl);

const iosIds = (dev.vars.get("APP_LINKS_IOS_APP_IDS")?.value ?? "").split(",").map((s) => s.trim());
check(
  "APP_LINKS_IOS_APP_IDS = <TeamID>.com.orbitworks.app.dev only",
  iosIds.length === 1 && /^[A-Z0-9]{10}\.com\.orbitworks\.app\.dev$/.test(iosIds[0]),
  iosIds.join(",") + " (needs the real Apple Team ID)"
);

check("apphosting.orbitworks_dev.yaml is ASCII only", /^[\x00-\x7F]*$/.test(dev.text));

console.log(failed === 0 ? "APPHOSTING DEV CHECK: OK" : `APPHOSTING DEV CHECK: FAILED (${failed})`);
process.exit(failed === 0 ? 0 : 1);
