// Moves the owner's rows from the local SQLite database into Postgres, once.
//
//   DATABASE_URL='postgresql://…' node --no-warnings scripts/import-owner.ts
//
// This is the one job the laptop still has. It reads `data/finance.db` -- never writes to it --
// and inserts the same rows into whatever DATABASE_URL points at, inside one transaction, so the
// import either lands completely or not at all.
//
// It refuses a target that already holds rows unless --replace is given, because running it twice
// by accident should not be how a database ends up with two of everything.
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import pg from "pg";

const replace = process.argv.includes("--replace");
const sqlitePath = process.env.FINANCE_SQLITE_PATH ?? path.join(process.cwd(), "data", "finance.db");
const connectionString = process.env.DATABASE_URL?.trim();

if (!connectionString) {
  console.error("Set DATABASE_URL to the Postgres database to import into.\n");
  console.error("  DATABASE_URL='postgresql://…' node --no-warnings scripts/import-owner.ts");
  process.exit(2);
}

/**
 * Parents before children.
 *
 * The composite owner keys refuse a row whose parent is not there yet, which is the whole point of
 * them -- so the order here is not a convenience, it is what makes the import possible at all.
 *
 * `sessions` is deliberately absent: a signed-in browser's token belongs to the machine it was
 * issued on, and carrying a credential across for no reason is how credentials end up in places
 * nobody is thinking about.
 */
const ORDER = [
  "users", "app_settings", "user_settings", "accounts", "category_types", "subcategories",
  "entry_batches", "transactions", "transaction_splits", "transaction_links",
  "loans", "loan_payments", "autopay_subscriptions", "autopay_payments",
  "investments", "investment_payments", "vacations", "vacation_expenses",
  "net_worth_snapshots", "budget_lines",
];

/** Settings that describe a file on this machine, which the hosted application will never see. */
const LOCAL_ONLY_SETTINGS = new Set(["last_backup_at", "last_backup_path", "last_backup_mode"]);

const source = new DatabaseSync(sqlitePath, { readOnly: true });
const client = new pg.Client({ connectionString });
await client.connect();

try {
  const existing = await client.query("SELECT count(*)::int AS n FROM users");
  if (existing.rows[0].n > 0 && !replace) {
    console.error(`The target already holds ${existing.rows[0].n} account(s). Run with --replace to overwrite.`);
    process.exit(1);
  }

  await client.query("BEGIN");
  if (replace) {
    // Every owned row hangs off users by a cascading key, so one delete empties the lot -- and
    // leaves the schema, which this script does not own, exactly as it found it.
    await client.query("DELETE FROM users");
    await client.query("DELETE FROM app_settings");
  }

  let total = 0;
  for (const table of ORDER) {
    const present = source
      .prepare("SELECT 1 AS n FROM sqlite_master WHERE type='table' AND name = ?")
      .get(table);
    if (!present) continue;

    let rows = source.prepare(`SELECT * FROM "${table}"`).all() as Array<Record<string, unknown>>;
    if (table === "app_settings") {
      rows = rows.filter((row) => !LOCAL_ONLY_SETTINGS.has(String(row.key)));
    }
    if (rows.length === 0) continue;

    const columns = Object.keys(rows[0]);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
    const statement = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`;
    for (const row of rows) {
      await client.query(statement, columns.map((column) => row[column] ?? null));
    }
    total += rows.length;
    console.log(`  ${String(rows.length).padStart(4)}  ${table}`);
  }

  // Counted on both sides before the transaction closes, so a mismatch rolls the import back
  // rather than leaving a database that looks finished and is not.
  for (const table of ORDER) {
    const present = source
      .prepare("SELECT 1 AS n FROM sqlite_master WHERE type='table' AND name = ?")
      .get(table);
    if (!present) continue;
    const here = (source.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number }).n;
    const expected = table === "app_settings" ? here - LOCAL_ONLY_SETTINGS.size : here;
    const there = (await client.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
    if (there !== expected) {
      throw new Error(`${table}: ${expected} rows here, ${there} rows there -- the import is incomplete`);
    }
  }

  await client.query("COMMIT");
  console.log(`\n${total} rows imported, and every table counted on both sides.`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error("\nNothing was imported.");
  throw error;
} finally {
  source.close();
  await client.end();
}
