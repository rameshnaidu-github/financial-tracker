/**
 * What belongs to one person, and can therefore be handed to them.
 *
 * The list of tables is **derived from the schema at run time**, never written out here. A table
 * added next year with a `user_id` column is in the export the day it appears; the alternative --
 * a hand-kept array -- is the same mistake as a list of routes to protect, one forgotten line away
 * from silently leaving somebody's data behind in a file that claims to be all of it.
 *
 * A table with a `user_id` that is still not a person's data to take away has to be named in
 * `EXCLUDED` with a reason. That is the only way out of the export, and it is visible.
 */
import { currentUserId, db } from "./db.ts";

/** Carries a user_id, and is still not part of what a person exports. Reasons, not a list. */
export const EXCLUDED: Record<string, string> = {
  sessions:
    "credentials: the hashed tokens of browsers currently signed in. Handing them over would " +
    "hand over the ability to be that person, and they are not financial history."
};

/** Tables that have no `user_id` at all, with why that is correct rather than an oversight. */
export const UNOWNED: Record<string, string> = {
  app_settings: "settings that belong to the installation, not to a person",
  users: "the accounts themselves. A person's own row is exported separately, without its password hash."
};

const tableNames = (): string[] =>
  (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as Array<{ name: string }>
  ).map((row) => row.name);

const columnsOf = (table: string): string[] =>
  (db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>).map((row) => row.name);

/** Every table in this database that carries an owner. */
export function ownedTables(): string[] {
  return tableNames().filter((table) => columnsOf(table).includes("user_id"));
}

/** Every table a person's export must contain: owned, minus what is deliberately held back. */
export function exportedTables(): string[] {
  return ownedTables().filter((table) => !(table in EXCLUDED));
}

/**
 * Reconciles the schema against what this module claims about it.
 *
 * Called by the export itself, so a schema change that nobody classified fails the request rather
 * than quietly producing a file that is missing a table. A loud export beats a plausible one.
 */
export function inventoryComplaints(): string[] {
  const complaints: string[] = [];
  const tables = tableNames();
  const owned = new Set(ownedTables());

  for (const table of tables) {
    if (owned.has(table)) continue;
    if (!(table in UNOWNED)) {
      complaints.push(`${table} has no user_id and is not accounted for in UNOWNED`);
    }
  }
  for (const [table, reason] of Object.entries(EXCLUDED)) {
    if (!owned.has(table)) complaints.push(`EXCLUDED names ${table}, which is not an owned table`);
    if (!reason.trim()) complaints.push(`EXCLUDED names ${table} with no reason`);
  }
  for (const [table, reason] of Object.entries(UNOWNED)) {
    if (owned.has(table)) complaints.push(`UNOWNED names ${table}, which does carry a user_id`);
    if (!tables.includes(table)) complaints.push(`UNOWNED names ${table}, which is not a table`);
    if (!reason.trim()) complaints.push(`UNOWNED names ${table} with no reason`);
  }
  for (const table of Object.keys(EXCLUDED)) {
    if (table in UNOWNED) complaints.push(`${table} is named in both EXCLUDED and UNOWNED`);
  }
  return complaints;
}

/** Everything in one person's export, in the order a reader would want to meet it. */
export type PersonExport = {
  format: "financial-tracker-export";
  version: 1;
  generatedAt: string;
  account: { id: string; email: string; createdAt: string };
  tables: Record<string, Array<Record<string, unknown>>>;
  rowCounts: Record<string, number>;
  excluded: Record<string, string>;
};

/**
 * One person's data, whole, exact and theirs alone.
 *
 * Values come out as the database holds them: paise stay integers, dates stay the ISO strings
 * they were stored as. Nothing is formatted, rounded or localised, because this file is a copy of
 * what the application knows, not a report about it -- a reader that reinterprets ₹1,23,456.78 as
 * a float has already lost the paise this app was built in.
 */
export function buildExport(): PersonExport {
  const complaints = inventoryComplaints();
  if (complaints.length > 0) {
    // Refusing beats producing a file that claims to be everything and is not. The schema changed
    // and nobody classified the change; that is a bug to fix, not a warning to bury in a footer.
    throw new Error(
      `The export cannot describe this database yet: ${complaints.join("; ")}`
    );
  }

  const userId = currentUserId();
  const person = db
    .prepare("SELECT id, email, created_at FROM users WHERE id = ?")
    .get(userId) as { id: string; email: string; created_at: string } | undefined;
  if (!person) {
    throw new Error("No such account.");
  }

  const tables: Record<string, Array<Record<string, unknown>>> = {};
  const rowCounts: Record<string, number> = {};
  for (const table of exportedTables()) {
    // Ordered by rowid so two exports of the same unchanged data are the same file.
    const rows = db
      .prepare(`SELECT * FROM "${table}" WHERE user_id = ? ORDER BY rowid`)
      .all(userId) as Array<Record<string, unknown>>;
    tables[table] = rows;
    rowCounts[table] = rows.length;
  }

  return {
    format: "financial-tracker-export",
    version: 1,
    generatedAt: new Date().toISOString(),
    // The account, without its password hash. A person does not need their own hash to have their
    // data, and a file that carries it is a file that leaks if it is ever mislaid.
    account: { id: person.id, email: person.email, createdAt: person.created_at },
    tables,
    rowCounts,
    excluded: EXCLUDED
  };
}

/** The filename a person sees, dated so two exports do not overwrite each other. */
export function exportFilename(now = new Date()): string {
  return `financial-tracker-${now.toISOString().slice(0, 10)}.json`;
}
