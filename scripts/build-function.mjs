// The serverless function, as one self-contained file.
//
// Vercel does not bundle: it transpiles api/index.ts to /var/task/api/index.js and leaves every
// relative specifier as a runtime import. So `import "../server/index.ts"` became a request for
// /var/task/server/index.ts, which was not in the function, and every /api route answered 500:
//
//   Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/server/index.ts'
//     imported from /var/task/api/index.js
//
// Shipping the sources instead would mean relying on the platform to trace a .ts import graph for
// node_modules and on Node to strip types at runtime. Bundling needs neither: everything the
// handler uses is inlined here, so the deployed function resolves nothing at all.
import { build } from "esbuild";
import { statSync, readFileSync } from "node:fs";
import path from "node:path";

const repo = path.resolve(import.meta.dirname, "..");
const outfile = path.join(repo, "api/_server.js");

const result = await build({
  entryPoints: [path.join(repo, "server/vercel-handler.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // Nothing is external. A dependency left out here is a module the deployed function would have
  // to resolve on its own, which is the failure this file exists to remove.
  external: [],
  // esbuild's shim for a CommonJS dependency's require() defers to a real global require when
  // there is one. An ESM bundle has none unless it is created.
  banner: { js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);' },
  logLevel: "silent",
  metafile: true,
});
for (const warning of result.warnings) console.warn(`  warning: ${warning.text}`);

const text = readFileSync(outfile, "utf8");
// The development engine must not come with it: it is a devDependency, and a dynamic import whose
// specifier is a literal would still be resolved here at build time.
for (const marker of ["/pglite/bin/postgres", "icudt76l"]) {
  if (text.includes(marker)) {
    console.error(`FAILED: the function bundle carries the development database engine (${marker})`);
    process.exit(1);
  }
}
console.log(`api/_server.js written (${(statSync(outfile).size / 1e6).toFixed(2)}MB)`);
