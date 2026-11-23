// Functions params check (prod-readiness item 11 C).
//
// Every defineBoolean/defineString/defineInt/... param in src/ must have a
// line in functions/.env.<project> for the project being deployed. Without
// this, a deploy from a folder that lacks the file (it used to exist only,
// untracked, in the main worktree) silently fell back to the code defaults
// and switched alerts/pushes off on prod. Both .env files are now tracked
// (flags only - secrets live in Secret Manager via defineSecret).
//
// Used by scripts/check-functions-env.js (firebase.json predeploy) and
// test/functionsEnv.test.js.

const fs = require("node:fs");
const path = require("node:path");

const KNOWN_PROJECTS = ["orbitworks-7ef59", "orbitworks-dev-ew"];
const PARAM_RE = /define(Boolean|String|Int|Float|List)\(\s*"([A-Z][A-Z0-9_]*)"/g;

function listSourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(p));
    else if (entry.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

// [{ name, type }] for every param defined in functions/src.
function definedParams(functionsDir) {
  const found = new Map();
  for (const file of listSourceFiles(path.join(functionsDir, "src"))) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(PARAM_RE)) found.set(m[2], m[1]);
  }
  return [...found].map(([name, type]) => ({ name, type })).sort((a, b) => a.name.localeCompare(b.name));
}

function parseEnv(text) {
  const out = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    out.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
  }
  return out;
}

// Returns a list of problems (empty = OK).
function checkFunctionsEnv(functionsDir, project) {
  const problems = [];
  if (!project) return ["No project id (GCLOUD_PROJECT not set by the Firebase CLI)."];
  if (!KNOWN_PROJECTS.includes(project)) {
    return [`Unknown project "${project}" - expected one of ${KNOWN_PROJECTS.join(", ")}.`];
  }
  const envFile = path.join(functionsDir, `.env.${project}`);
  if (!fs.existsSync(envFile)) {
    return [`${path.basename(envFile)} is missing in ${functionsDir} - deploying would switch features off. Are you in the right folder/branch?`];
  }
  const env = parseEnv(fs.readFileSync(envFile, "utf8"));
  for (const { name, type } of definedParams(functionsDir)) {
    if (!env.has(name)) {
      problems.push(`${name} has no line in .env.${project}.`);
      continue;
    }
    const value = env.get(name);
    if (type === "Boolean" && value !== "true" && value !== "false") {
      problems.push(`${name}=${value} in .env.${project} must be true or false.`);
    }
    if ((type === "Int" || type === "Float") && !Number.isFinite(Number(value))) {
      problems.push(`${name} in .env.${project} must be a number.`);
    }
  }
  return problems;
}

module.exports = { KNOWN_PROJECTS, definedParams, parseEnv, checkFunctionsEnv };
