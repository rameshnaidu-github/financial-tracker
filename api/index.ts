// The entry point Vercel runs.
//
// It stays this small on purpose. Vercel transpiles this file and leaves its specifiers as runtime
// imports, so every relative import here is a file that must exist in /var/task. There is exactly
// one, and vercel.json names it in includeFiles so its presence does not depend on the platform
// tracing a TypeScript import graph.
//
// ./_server.js is built by scripts/build-function.mjs and holds the whole application, with its
// dependencies inlined. api/_server.d.ts describes it so this file type-checks before it is built.
export { default } from "./_server.js";
