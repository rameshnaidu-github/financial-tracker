// server/schema.sql, as a TypeScript module.
//
// A bundler collapses server/db.ts into one file somewhere else, so a path built from
// import.meta.url no longer points at the schema -- which is how production came to answer every
// API request with a 500. A module constant travels with the code wherever it is bundled to.
//
// server/schema.sql stays the authored file. Run this after editing it; a gate checks they match.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const repo = path.resolve(import.meta.dirname, "..");
const sql = readFileSync(path.join(repo, "server/schema.sql"), "utf8");

// The schema has no backticks, no ${, and no backslashes today, and a template literal keeps it
// readable and diffable. Escaping them anyway means a future statement cannot quietly become code.
const escaped = sql.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

writeFileSync(
  path.join(repo, "server/schema.ts"),
  `// Generated from server/schema.sql by scripts/generate-schema-module.mjs. Do not edit.\n` +
    `//\n` +
    `// The schema is carried as a string rather than read from disk, because a serverless function\n` +
    `// is a bundle: there is no file beside it to read.\n` +
    `export const SCHEMA_SQL = \`${escaped}\`;\n`,
  "utf8",
);
console.log(`server/schema.ts written from server/schema.sql (${sql.length} characters)`);
