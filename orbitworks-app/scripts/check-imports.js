// npm run check:imports (Employee App Phase 5, run at every layer).
// Checks every local import in the app's JS - `import { a, b } from "./x"`
// and `import X from "./x"`: the target file exists and exports each name
// (ESM export, `export { default } from`, or CommonJS module.exports).
// ESLint and the Metro bundle don't catch a named import that doesn't exist
// - it is only undefined at run time, on the phone. Read-only. Run from
// orbitworks-app (npm sets the folder).
const fs = require("fs");
const path = require("path");

const roots = ["App.js", "index.js", "screens", "components", "lib", "navigation", "config"].filter((p) => fs.existsSync(p));
const files = [];
function walk(p) {
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    for (const f of fs.readdirSync(p)) if (f !== "node_modules") walk(path.join(p, f));
  } else if (/\.js$/.test(p)) files.push(p);
}
roots.forEach(walk);

function resolve(from, spec) {
  const base = path.resolve(path.dirname(from), spec);
  for (const c of [base, base + ".js", path.join(base, "index.js")]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
}
function exportsOf(file) {
  const s = fs.readFileSync(file, "utf8");
  const names = new Set();
  for (const m of s.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of s.matchAll(/export\s*\{([^}]*)\}/g)) for (const part of m[1].split(",")) { const n = part.trim().split(/\s+as\s+/).pop(); if (n) names.add(n); }
  const cjs = s.match(/module\.exports\s*=\s*\{([\s\S]*?)\};/);
  if (cjs) for (const part of cjs[1].split(",")) { const n = part.trim().split(":")[0].trim(); if (n) names.add(n); }
  const hasDefault = /export\s+default\b/.test(s) || /export\s*\{\s*default\b/.test(s) || /module\.exports\s*=/.test(s);
  return { names, hasDefault };
}

let bad = 0;
for (const f of files) {
  const s = fs.readFileSync(f, "utf8");
  for (const m of s.matchAll(/^import\s+((?:(?!\bimport\b|\bfrom\b|;)[\s\S])*?)\s+from\s+["'](\.[^"']+)["']/gm)) {
    const clause = m[1];
    const target = resolve(f, m[2]);
    if (!target) { console.log(`MISSING FILE  ${f} -> ${m[2]}`); bad++; continue; }
    const ex = exportsOf(target);
    const named = clause.match(/\{([^}]*)\}/);
    if (named) for (const part of named[1].split(",")) {
      const n = part.trim().split(/\s+as\s+/)[0].trim();
      if (n && !ex.names.has(n)) { console.log(`MISSING NAME  ${f}: ${n} from ${m[2]}`); bad++; }
    }
    const def = clause.replace(/\{[^}]*\}/, "").replace(/\*\s+as\s+\w+/, "").replace(/,/g, "").trim();
    if (def && !ex.hasDefault) { console.log(`NO DEFAULT    ${f}: ${def} from ${m[2]}`); bad++; }
  }
}
console.log(`IMPORTS CHECKED in ${files.length} files: ${bad ? "FAILED " + bad : "OK"}`);
process.exit(bad ? 1 : 0);
