#!/usr/bin/env node
// firebase.json functions predeploy (prod-readiness item 11 C): refuse the
// deploy, loudly, when functions/.env.<project> is missing or any param in
// src/ has no valid line in it. The Firebase CLI sets GCLOUD_PROJECT for
// predeploy hooks. Manual run:
//   GCLOUD_PROJECT=orbitworks-7ef59 node scripts/check-functions-env.js
const path = require("node:path");
const { checkFunctionsEnv, definedParams } = require("./lib/functionsEnv");

const functionsDir = path.join(__dirname, "..");
const project = process.env.GCLOUD_PROJECT;
const problems = checkFunctionsEnv(functionsDir, project);
if (problems.length > 0) {
  console.error("");
  console.error(`DEPLOY STOPPED - functions params for ${project || "(no project)"} are not set:`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error("Fix functions/.env.<project> (tracked in git) and deploy again.");
  console.error("");
  process.exit(1);
}
console.log(`functions params OK for ${project}: ${definedParams(functionsDir).map((p) => p.name).join(", ")}`);
