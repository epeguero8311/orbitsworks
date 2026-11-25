// Lets plain `node --test` load lib modules that import with the "@/"
// alias (tsconfig paths) and without a file extension. Register this
// first, then import the module under test with a dynamic import():
//
//   import "./helpers/aliasHooks.mjs";
//   const { fn } = await import("../lib/someModule.ts");
//
// Test-only; Next.js resolves these itself in the app.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const EXTENSIONS = [".ts", ".tsx", "/index.ts"];

function resolveFile(base) {
  if (existsSync(base) && !base.endsWith(path.sep)) return base;
  for (const ext of EXTENSIONS) {
    if (existsSync(base + ext)) return base + ext;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    let base = null;
    if (specifier.startsWith("@/")) {
      base = path.join(root, specifier.slice(2));
    } else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
      const parent = fileURLToPath(context.parentURL);
      if (parent.startsWith(root) && !parent.includes("node_modules") && !path.extname(specifier)) {
        base = path.resolve(path.dirname(parent), specifier);
      }
    }
    if (base) {
      const file = resolveFile(base);
      if (file) return nextResolve(pathToFileURL(file).href, context);
    }
    return nextResolve(specifier, context);
  },
});
