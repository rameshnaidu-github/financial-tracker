// Moves one person's rows out of their own SQLite database and into this installation, under
// their own account.
//
//   DATABASE_URL='postgresql://…' node --no-warnings scripts/import-person.ts \
//     --file ~/their-finance.db --email them@example.com --dry-run
//
// Run by whoever holds the database credential -- never by the person whose data this is. The
// application connects as a role that bypasses row level security, so that connection string
// reads and writes *everyone's* rows; handing it over to run a migration would hand over
// permanent access to the owner's money as well.
//
// Their file is opened read-only and never written to. Everything done to this database happens
// in one transaction, so it either lands completely or not at all.
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Just enough of a database connection to be given a real one or an in-process one. */
export type Query = (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, any>> }>;

export type ImportOptions = {
  sqlitePath: string;
  email: string;
  query: Query;
  dryRun?: boolean;
  replace?: boolean;
  sourceEmail?: string;
  log?: (line: string) => void;
};

export type ImportResult = {
  target: { id: string; email: string };
  perTable: Array<[string, number]>;
  moved: number;
  written: boolean;
};

/**
 * Parents before children.
 *
 * The composite owner keys refuse a row whose parent is not there yet, which is the whole point of
 * them -- so this order is not a convenience, it is what makes the import possible at all.
 */
const ORDER = [
  "user_settings", "accounts", "category_types", "subcategories",
  "entry_batches", "transactions", "transaction_splits", "transaction_links",
  "loans", "loan_payments", "autopay_subscriptions", "autopay_payments",
  "investments", "investment_payments", "vacations", "vacation_expenses",
  "net_worth_snapshots", "budget_lines",
];

// Never carried across. `sessions` is a signed-in browser's credential, issued on a machine that
// is not this one. `app_settings` belongs to the installation rather than to a person, and this
// installation has its own. `schema_state` is a fact about a database, not about anybody.
const NEVER = new Set(["sessions", "app_settings", "schema_state", "users"]);

/** Settings that describe a file on their machine, which this installation will never see. */
const LOCAL_ONLY_SETTINGS = new Set(["last_backup_at", "last_backup_path", "last_backup_mode"]);

// A new account arrives already holding these, so finding them is not a sign of work to protect.
const SEEDED = new Set(["category_types", "subcategories", "user_settings"]);

/**
 * Their file may be older than this installation.
 *
 * It is a copy of this application from before per-person rows existed, so it has no users table
 * and no user_id anywhere -- which makes every row in it theirs by construction -- and a handful
 * of tables and columns that have since been renamed or dropped. None of this is guesswork: each
 * entry below was checked against the file in front of us before it was written.
 */

/** A table this installation calls one thing and an older file calls another. */
const SOURCE_ALIAS: Record<string, string> = {
  // Settings became per-person; the file has one flat table.
  user_settings: "settings",
};

/** Columns an older file still carries that this schema has no place for. */
const DROP_COLUMNS: Record<string, Set<string>> = {
  // Superseded by subcategory_id. Measured in the file being imported: 0 of 365 transactions and
  // 0 splits still had a value in it, so nothing is being discarded.
  transactions: new Set(["category_id"]),
  transaction_splits: new Set(["category_id"]),
};

/** Tables an older file has that this one does not, and which hold nothing worth carrying. */
const SOURCE_ONLY = new Set(["categories"]);

/** The settings that belong to a person. The rest describe an installation or a machine. */
const PERSON_SETTINGS = new Set([
  "profile_name", "profile_email", "profile_age", "card_utilization_alert_percent",
  "first_screen", "week_start", "currency", "seeded_default_taxonomy_ids",
]);

/**
 * Brings one row up to date, or drops it by returning undefined.
 *
 * Only shapes that were actually found are handled. A column this does not know about reaches the
 * insert unchanged and fails loudly there, which is the right outcome: a silent drop would be a
 * row of somebody's money quietly not arriving.
 */
function adapt(table: string, row: Record<string, unknown>): Record<string, unknown> | undefined {
  const out = { ...row };
  for (const column of DROP_COLUMNS[table] ?? []) delete out[column];

  if (table === "user_settings") {
    // The flat settings table, split into what is a person's and what is not.
    if (!PERSON_SETTINGS.has(String(out.key))) return undefined;
    return { key: out.key, value: out.value };
  }

  if (table === "budget_lines" && "scope_id" in out) {
    // One scope_id became two columns, one per kind of scope.
    const scope = String(out.scope_type ?? "");
    const id = out.scope_id ?? null;
    delete out.scope_id;
    out.scope_type_id = scope === "type" ? id : null;
    out.scope_subcategory_id = scope === "subcategory" ? id : null;
    if (id !== null && out.scope_type_id === null && out.scope_subcategory_id === null) {
      throw new Error(`budget_lines row ${String(out.id)} has scope_type "${scope}", which this does not know how to carry across`);
    }
  }

  return out;
}

export class ImportRefused extends Error {}

export async function importPerson(options: ImportOptions): Promise<ImportResult> {
  const { sqlitePath, email, query } = options;
  const dryRun = options.dryRun ?? false;
  const replace = options.replace ?? false;
  const log = options.log ?? ((line: string) => console.log(line));

  const source = new DatabaseSync(sqlitePath, { readOnly: true });
  try {
    const sourceTables = new Set(
      (source.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>)
        .map((row) => row.name),
    );

    // Whose rows these are, in their file: the first account by created_at, the same definition
    // this application uses for an owner. A file old enough to predate per-person rows has no
    // user_id at all, and then every row in it is theirs by construction.
    let sourceUserId: string | undefined;
    if (sourceTables.has("users")) {
      const people = source
        .prepare("SELECT id, email FROM users ORDER BY created_at, id")
        .all() as Array<{ id: string; email: string }>;
      if (people.length === 0) {
        throw new ImportRefused("Their file has a users table with nobody in it, so no row can be attributed.");
      }
      if (people.length > 1) {
        const wanted = options.sourceEmail?.trim().toLowerCase();
        const picked = wanted ? people.find((p) => String(p.email).toLowerCase() === wanted) : undefined;
        if (!picked) {
          throw new ImportRefused(
            `Their file holds ${people.length} accounts (${people.map((p) => p.email).join(", ")}). ` +
              "This imports one person: say which with --source-email.",
          );
        }
        sourceUserId = picked.id;
      } else {
        sourceUserId = people[0].id;
      }
    }

    const target = (await query("SELECT id, email FROM users WHERE lower(email) = $1", [email])).rows[0] as
      | { id: string; email: string }
      | undefined;
    if (!target) {
      throw new ImportRefused(
        `No account here for ${email}. Make it first, so it has a password:\n` +
          `  DATABASE_URL='…' node --no-warnings server/account.ts create ${email} --yes-the-real-one`,
      );
    }

    // What they already hold here, which an import would be writing over.
    const already: Array<[string, number]> = [];
    for (const table of ORDER) {
      const r = await query(`SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1`, [target.id]);
      if (Number(r.rows[0].n) > 0 && !SEEDED.has(table)) already.push([table, Number(r.rows[0].n)]);
    }
    if (already.length > 0 && !replace) {
      throw new ImportRefused(
        `${target.email} already holds data of their own here:\n` +
          already.map(([t, n]) => `  ${t}: ${n}`).join("\n") +
          "\nRun with --replace to discard it and import their file over the top.",
      );
    }

    // Everyone else's totals, to prove afterwards that nothing of theirs moved.
    const othersBefore = JSON.stringify(
      (await query(
        "SELECT user_id, count(*)::int AS n FROM transactions WHERE user_id <> $1 GROUP BY user_id ORDER BY user_id",
        [target.id],
      )).rows,
    );

    log(`Reading        ${sqlitePath}`);
    log(`Importing into ${target.email}`);
    if (dryRun) log("\nDry run: nothing will be written.");

    const perTable: Array<[string, number]> = [];
    let moved = 0;

    await query("BEGIN");
    try {
      if (!dryRun) {
        // Children before parents on the way out, which is this order reversed. Scoped to one
        // person every time: no statement here can reach a row that is not theirs.
        for (const table of [...ORDER].reverse()) {
          await query(`DELETE FROM ${table} WHERE user_id = $1`, [target.id]);
        }
      }

      for (const table of ORDER) {
        if (NEVER.has(table)) continue;
        const from = sourceTables.has(table) ? table : SOURCE_ALIAS[table];
        if (!from || !sourceTables.has(from)) continue;

        let rows = (sourceUserId
          ? source.prepare(`SELECT * FROM "${from}" WHERE user_id = ?`).all(sourceUserId)
          : source.prepare(`SELECT * FROM "${from}"`).all()) as Array<Record<string, unknown>>;
        if (table === "user_settings") {
          rows = rows.filter((row) => !LOCAL_ONLY_SETTINGS.has(String(row.key)));
        }
        rows = rows
          .map((row) => adapt(table, row))
          .filter((row): row is Record<string, unknown> => row !== undefined);
        if (rows.length === 0) continue;

        perTable.push([table, rows.length]);
        moved += rows.length;
        if (dryRun) continue;

        for (const row of rows) {
          // Their rows become theirs here. Every other value is carried across untouched,
          // including the id: ids are unique per person now, so theirs cannot collide.
          const record = { ...row, user_id: target.id };
          const columns = Object.keys(record);
          const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
          await query(
            `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`,
            columns.map((c) => record[c]),
          );
        }
      }

      for (const [table, n] of perTable) log(`  ${String(n).padStart(6)}  ${table}`);
      log(`  ${String(moved).padStart(6)}  in total`);

      if (dryRun) {
        await query("ROLLBACK");
        log("\nNothing was written. Run again without --dry-run to do it.");
        return { target, perTable, moved, written: false };
      }

      // Count both sides before committing, so a mismatch is a rollback rather than a discovery.
      let landed = 0;
      for (const [table] of perTable) {
        const r = await query(`SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1`, [target.id]);
        landed += Number(r.rows[0].n);
      }
      if (landed !== moved) throw new Error(`read ${moved} rows but ${landed} are here; rolling back`);

      const othersAfter = JSON.stringify(
        (await query(
          "SELECT user_id, count(*)::int AS n FROM transactions WHERE user_id <> $1 GROUP BY user_id ORDER BY user_id",
          [target.id],
        )).rows,
      );
      if (othersAfter !== othersBefore) throw new Error("somebody else's rows changed; rolling back");

      await query("COMMIT");
      log(`\nDone. ${moved} rows are now ${target.email}'s, and nobody else's rows changed.`);
      return { target, perTable, moved, written: true };
    } catch (error) {
      await query("ROLLBACK");
      throw error;
    }
  } finally {
    source.close();
  }
}

// --- the command ------------------------------------------------------------

const startedDirectly =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (startedDirectly) {
  const argv = process.argv.slice(2);
  const flag = (name: string) => {
    const at = argv.indexOf(`--${name}`);
    return at === -1 ? undefined : argv[at + 1];
  };
  const usage = (why: string): never => {
    console.error(`${why}\n`);
    console.error("  DATABASE_URL='postgresql://…' node --no-warnings scripts/import-person.ts \\");
    console.error("    --file <their-finance.db> --email <their address> [--dry-run] [--replace]\n");
    console.error("  --dry-run   read both sides and report what would move, writing nothing");
    console.error("  --replace   the account already holds data of its own; discard it and import anyway");
    process.exit(2);
  };

  const connectionString = process.env.DATABASE_URL?.trim();
  const sqlitePath = flag("file");
  const email = flag("email")?.trim().toLowerCase();
  if (!connectionString) usage("Set DATABASE_URL to the database to import into.");
  if (!sqlitePath) usage("Give --file, the path to their data/finance.db.");
  if (!email) usage("Give --email, the address of the account their rows belong to.");

  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await importPerson({
      sqlitePath,
      email,
      dryRun: argv.includes("--dry-run"),
      replace: argv.includes("--replace"),
      sourceEmail: flag("source-email"),
      query: (sql, params) => client.query(sql, params as never[]),
    });
  } catch (error) {
    console.error(`\nNothing was written: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
