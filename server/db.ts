import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_CATEGORY_TYPES,
  DEFAULTS_ADDED_AFTER_LEDGER,
  SELF_TRANSFER_SUBCATEGORY_ID,
  WEEK_START,
  CURRENCY,
} from "../shared/finance.ts";
import { ensureBackupDir, pruneBackupFiles } from "./backup-files.ts";

const configuredDbPath = process.env.FINANCE_DB_PATH;
const dataDir = path.join(process.cwd(), "data");
export const dbPath = configuredDbPath
  ? path.resolve(configuredDbPath)
  : path.join(dataDir, "finance.db");

mkdirSync(path.dirname(dbPath), { recursive: true });

/**
 * What the application needs from a database, and nothing else. The 127 statements in
 * `server/services.ts` already speak exactly this shape, so naming it costs no call sites and
 * buys one place that knows which engine is underneath.
 */
export type Row = Record<string, unknown>;

export type Statement = {
  all: (...params: unknown[]) => Row[];
  get: (...params: unknown[]) => Row | undefined;
  run: (...params: unknown[]) => { changes: number | bigint };
};

export type Adapter = {
  /** What engine this is, for the few places that legitimately have to know. */
  readonly dialect: "sqlite" | "postgres";
  prepare: (sql: string) => Statement;
  exec: (sql: string) => void;
  close: () => void;
  /**
   * Copy the whole database to a file. This is the one thing the application asks for that is not
   * a statement: SQLite does it with VACUUM INTO, which no other engine has, and a hosted Postgres
   * does not hand a client its own storage at all. Naming it here keeps that difference inside the
   * adapter instead of leaving unportable SQL in the middle of the backup code -- and a Postgres
   * adapter answers it by saying so, which is what D7 replaces it with.
   */
  copyTo: (target: string) => void;
};

const driver = new DatabaseSync(dbPath);

driver.exec("PRAGMA foreign_keys = ON;");
driver.exec("PRAGMA journal_mode = WAL;");
driver.exec("PRAGMA busy_timeout = 5000;");

/**
 * SQLite, behind the shape above. A Postgres adapter is the same three methods over `pg`, with
 * `?` rewritten to `$1, $2, …` -- `translate` below is where that will live, and it is a no-op
 * here because SQLite's own placeholder is already `?`.
 *
 * The one thing a Postgres adapter cannot do with this shape is be synchronous, and `node:sqlite`
 * is. Converting the application to `async` is the step after this one; the point of naming the
 * shape now is that the conversion then has a single place to start from rather than 127.
 */
function sqliteAdapter(): Adapter {
  return {
    dialect: "sqlite",
    prepare: (sql) => {
      const prepared = driver.prepare(translate(sql));
      return {
        all: (...params) => prepared.all(...(params as never[])) as Row[],
        get: (...params) =>
          prepared.get(...(params as never[])) as Row | undefined,
        run: (...params) => prepared.run(...(params as never[])),
      };
    },
    exec: (sql) => driver.exec(sql),
    close: () => driver.close(),
    copyTo: (target) => {
      driver.prepare("VACUUM INTO ?").run(target);
    },
  };
}

/** The one place a statement is adjusted for the engine underneath. */
function translate(sql: string): string {
  return sql;
}

export const db: Adapter = sqliteAdapter();

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      -- Null until a password is set. Sign-in refuses an account without one rather than treating
      -- the absence as a match, so an account that has never been given a password cannot be
      -- signed into.
      password_hash TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- One row per signed-in browser. The token is stored hashed: a stolen copy of this table is
    -- not a set of working sessions.
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (user_id, key)
    );


    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL COLLATE NOCASE,
      type TEXT NOT NULL CHECK (type IN ('bank', 'credit_card', 'food_card')),
      starting_balance_paise INTEGER NOT NULL DEFAULT 0,
      credit_limit_paise INTEGER,
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS entry_batches (
      id TEXT PRIMARY KEY,
      week_start TEXT NOT NULL,
      week_end TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('draft', 'saved')) DEFAULT 'draft',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      saved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      batch_id TEXT REFERENCES entry_batches(id) ON DELETE SET NULL,
      date TEXT NOT NULL,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      method TEXT NOT NULL CHECK (method IN ('upi', 'credit_card', 'bank_transfer', 'cash', 'other')),
      merchant TEXT,
      note TEXT,
      amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
      direction TEXT NOT NULL CHECK (direction IN ('inflow', 'outflow')),
      kind TEXT NOT NULL CHECK (kind IN ('expense', 'income', 'refund', 'transfer', 'card_payment', 'reversal', 'investment', 'emi')),
      status TEXT NOT NULL CHECK (status IN ('categorized', 'uncategorized', 'split')) DEFAULT 'categorized',
      transfer_account_id TEXT REFERENCES accounts(id) ON DELETE RESTRICT,
      linked_transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS transaction_splits (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      amount_paise INTEGER NOT NULL CHECK (amount_paise > 0)
    );

    CREATE TABLE IF NOT EXISTS transaction_links (
      id TEXT PRIMARY KEY,
      source_transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      target_transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      link_type TEXT NOT NULL CHECK (link_type IN ('refund', 'reversal', 'duplicate', 'card_payment')),
      amount_paise INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS loans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL COLLATE NOCASE,
      subcategory_id TEXT NOT NULL REFERENCES subcategories(id) ON DELETE RESTRICT,
      principal_amount_paise INTEGER NOT NULL CHECK (principal_amount_paise > 0),
      starting_outstanding_paise INTEGER NOT NULL CHECK (starting_outstanding_paise >= 0),
      start_month TEXT NOT NULL CHECK (start_month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
      annual_interest_rate_bps INTEGER NOT NULL CHECK (annual_interest_rate_bps >= 0),
      tenure_months INTEGER NOT NULL CHECK (tenure_months > 0),
      monthly_emi_paise INTEGER NOT NULL CHECK (monthly_emi_paise > 0),
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS loan_payments (
      id TEXT PRIMARY KEY,
      loan_id TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
      transaction_id TEXT NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
      payment_type TEXT NOT NULL CHECK (payment_type IN ('emi', 'prepayment')),
      amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
      principal_paise INTEGER NOT NULL CHECK (principal_paise >= 0),
      interest_paise INTEGER NOT NULL CHECK (interest_paise >= 0),
      outstanding_before_paise INTEGER NOT NULL CHECK (outstanding_before_paise >= 0),
      outstanding_after_paise INTEGER NOT NULL CHECK (outstanding_after_paise >= 0),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS autopay_subscriptions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL COLLATE NOCASE,
      amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
      start_date TEXT NOT NULL,
      duration_months INTEGER NOT NULL CHECK (duration_months > 0),
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS autopay_payments (
      id TEXT PRIMARY KEY,
      subscription_id TEXT NOT NULL REFERENCES autopay_subscriptions(id) ON DELETE CASCADE,
      transaction_id TEXT NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS investments (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('stocks', 'mutual_funds', 'gold', 'land', 'property', 'pf', 'fd', 'bonds', 'other')),
      name TEXT NOT NULL,
      invested_paise INTEGER NOT NULL CHECK (invested_paise >= 0),
      current_value_paise INTEGER NOT NULL CHECK (current_value_paise >= 0),
      shares REAL,
      purchase_date TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS investment_payments (
      id TEXT PRIMARY KEY,
      investment_id TEXT NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
      transaction_id TEXT NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS vacations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      budget_paise INTEGER CHECK (budget_paise IS NULL OR budget_paise > 0),
      note TEXT,
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS vacation_expenses (
      id TEXT PRIMARY KEY,
      vacation_id TEXT NOT NULL REFERENCES vacations(id) ON DELETE CASCADE,
      transaction_id TEXT NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS net_worth_snapshots (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
      liquid_paise INTEGER NOT NULL,
      investments_paise INTEGER NOT NULL,
      liabilities_paise INTEGER NOT NULL,
      net_worth_paise INTEGER NOT NULL,
      captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, month)
    );

    CREATE TABLE IF NOT EXISTS budget_lines (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
      scope_type TEXT NOT NULL CHECK (scope_type IN ('type', 'subcategory')),
      scope_id TEXT NOT NULL,
      amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, month, scope_type, scope_id)
    );
  `);

  // Stage 2 of the move to more than one person: the owner exists, and settings are split by
  // whom they belong to, before anything else reads or writes a row.
  ensureOwner();

  // Start-up has no request, so it says whose rows it is touching rather than letting
  // currentUserId() guess. Everything below seeds or migrates the data of the single owner an
  // installation starts with; on a database with two people none of it writes a row.
  asOwner(() => {
    splitSettings();
    migrateAccountNameConstraint();
    migrateAccountTypes();
    migrateTransactionKinds();
    migrateTransactionSplitsNullable();
    ensureTaxonomySchema();
    // The owner columns and the keys that carry them come before anything writes a taxonomy row,
    // so every row written below belongs to somebody from the moment it exists.
    addOwnerColumns();
    rekeyForOwner();
    seedTaxonomy();
    // The legacy migration stays after seeding, because it maps old rows onto the default Types
    // and SubTypes that seeding is what puts there.
    migrateLegacyCategoriesToTaxonomy();
    dropLegacyCategories();
    addColumnIfMissing("users", "password_hash", "TEXT");
    ensureSessionIndexes();
    ensureAccountIndexes();
    ensureTransactionIndexes();
    ensureLoanIndexes();
    ensureAutopayIndexes();
    ensureBudgetIndexes();
    ensureDueDayColumns();
    ensureInvestmentColumns();
    migrateInvestmentTypes();
    ensureInvestmentIndexes();
    ensureVacationIndexes();
    ensureTaxonomyIndexes();
    seedSettings();
    // D4 and D8, last: every other migration has finished moving rows by now, so the composite
    // keys are checked against the schema as it will actually be used.
    addCompositeOwnerKeys();
  });
  pruneBackupFiles();
}

/**
 * Removes the legacy categories storage, but only once the database proves it holds nothing
 * in it. migrateLegacyCategoriesToTaxonomy runs first and has already had its chance to move
 * anything across; if a value survived that, something is unaccounted for and dropping the
 * column would destroy it. In that case this leaves every column and every row alone.
 */
function dropLegacyCategories() {
  const hasTable = tableExists("categories");
  const onTransactions = columnExists("transactions", "category_id");
  const onSplits = columnExists("transaction_splits", "category_id");
  if (!hasTable && !onTransactions && !onSplits) {
    return;
  }

  const stranded =
    (onTransactions
      ? (
          db
            .prepare(
              "SELECT COUNT(*) AS n FROM transactions WHERE category_id IS NOT NULL",
            )
            .get() as { n: number }
        ).n
      : 0) +
    (onSplits
      ? (
          db
            .prepare(
              "SELECT COUNT(*) AS n FROM transaction_splits WHERE category_id IS NOT NULL",
            )
            .get() as { n: number }
        ).n
      : 0);

  if (stranded > 0) {
    console.warn(
      `[db] ${stranded} row(s) still reference a legacy category, so the legacy columns were kept. ` +
        "Recategorise them under a SubType and restart to complete the cleanup.",
    );
    return;
  }

  db.exec("PRAGMA foreign_keys = OFF;");
  try {
    transaction(() => {
      // SQLite refuses to drop a column an index still references.
      db.exec("DROP INDEX IF EXISTS idx_transactions_category;");
      if (onTransactions)
        db.exec("ALTER TABLE transactions DROP COLUMN category_id;");
      if (onSplits)
        db.exec("ALTER TABLE transaction_splits DROP COLUMN category_id;");
      if (hasTable) db.exec("DROP TABLE categories;");
    });
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
}

/**
 * Every table whose rows belong to one person. app_settings is deliberately absent -- it holds
 * installation-wide state -- and users is the table doing the owning.
 */
const OWNED_TABLES = [
  "accounts",
  "entry_batches",
  "transactions",
  "transaction_splits",
  "transaction_links",
  "loans",
  "loan_payments",
  "autopay_subscriptions",
  "autopay_payments",
  "investments",
  "investment_payments",
  "vacations",
  "vacation_expenses",
  "net_worth_snapshots",
  "budget_lines",
  "category_types",
  "subcategories",
] as const;

/**
 * An owner id no user can ever have, used only as the default a NOT NULL column needs while it
 * is being added to a table that already has rows. Every such row is attributed to its owner
 * immediately afterwards, and because the sentinel satisfies no foreign key, a later INSERT that
 * forgets to name an owner fails loudly instead of quietly creating an unowned row.
 */
const UNATTRIBUTED = "";

/** What the owner is called until the profile says who they are. */
const PLACEHOLDER_OWNER_EMAIL = "owner@localhost";

/** D2: the settings keys that describe a person, as opposed to the installation. */
const PER_PERSON_SETTINGS = new Set([
  "profile_name",
  "profile_email",
  "profile_age",
  "card_utilization_alert_percent",
  "first_screen",
  "week_start",
  "currency",
  // A person's taxonomy is their own (D1), so the ledger of which defaults they have already
  // been given is theirs too.
  "seeded_default_taxonomy_ids",
]);

/**
 * There is exactly one person until sign-up exists, and on an existing database that person is
 * whoever the stored profile describes. Their id is generated once and then never changes, so
 * every row attributed to them stays attributed across restarts.
 */
function ensureOwner() {
  const profileEmail = () => {
    const source = tableExists("settings") ? "settings" : "user_settings";
    const stored = db
      .prepare(`SELECT value FROM ${source} WHERE key = 'profile_email'`)
      .get() as { value: string } | undefined;
    return (stored?.value ?? "").trim();
  };

  const existing = db
    .prepare("SELECT id, email FROM users ORDER BY created_at, id LIMIT 1")
    .get() as { id: string; email: string } | undefined;
  if (existing) {
    // A database created before its owner filled in a profile holds the placeholder below. Once
    // the profile names them, the owner becomes that person rather than staying anonymous.
    const email = profileEmail();
    if (existing.email === PLACEHOLDER_OWNER_EMAIL && email) {
      db.prepare("UPDATE users SET email = ? WHERE id = ?").run(
        email,
        existing.id,
      );
    }
    return existing.id;
  }

  const id = randomUUID();
  db.prepare("INSERT INTO users (id, email) VALUES (?, ?)").run(
    id,
    profileEmail() || PLACEHOLDER_OWNER_EMAIL,
  );
  return id;
}

/**
 * The person every query is for. Stage 3 made this the single source the whole of services.ts
 * reads -- 119 calls, most of them deep inside functions that have no idea a request exists -- so
 * that this one function could later be made to ask the request. This is that change.
 *
 * It reads an AsyncLocalStorage established once per request, rather than taking a parameter: the
 * alternative was threading the person through 182 functions.
 *
 * **Outside any request it throws.** The tempting version falls back to "the only user", and that
 * default is a hole: any path that forgets to establish a session would read the owner's money
 * instead of failing. The two callers that legitimately have no request -- the migrations at
 * start-up and the account command -- say so by calling `asOwner`, which is a named act somebody
 * can grep for rather than a silence.
 */
const requestUser = new AsyncLocalStorage<{ id: string }>();

export function currentUserId(): string {
  const person = requestUser.getStore();
  if (!person) {
    throw new Error(
      "No user in scope. Every request must run inside forUser(); start-up and the account command use asOwner().",
    );
  }
  return person.id;
}

/**
 * Makes everything that follows on this async stack run as the given person.
 *
 * `enterWith` rather than `run`, because a request is not a callback: the handler and everything
 * it awaits come after the hook returns, and a store set with `run` is gone by then. That was
 * checked rather than assumed -- resolving a promise inside `run` leaves the store undefined --
 * and so was the risk that comes with `enterWith`, which is one request seeing another's person:
 * forty overlapping requests for five people, each awaiting several times, never saw the wrong
 * one.
 */
export function forUser(userId: string): void {
  requestUser.enterWith({ id: userId });
}

/** The callback form, for a caller that owns its own stack. */
export function runAsUser<T>(userId: string, fn: () => T): T {
  return requestUser.run({ id: userId }, fn);
}

/**
 * For the two places with no request: the migrations that run at start-up, and the account
 * command. Both legitimately act as the single owner of an installation that has one.
 */
export function asOwner<T>(fn: () => T): T {
  return requestUser.run({ id: ownerId() }, fn);
}

/** Whether a person is in scope, for the few places that have to ask rather than assume. */
export function hasCurrentUser(): boolean {
  return requestUser.getStore() !== undefined;
}

/**
 * The owner of this installation: the first account by `created_at`.
 *
 * One definition, read from here by everything that needs it. `asOwner` picks the same row by the
 * same order, so "the owner" cannot come to mean two different people depending on which function
 * was asked -- which is exactly how the second account would quietly gain the first one's rights.
 */
export function ownerId(): string {
  const row = db
    .prepare("SELECT id FROM users ORDER BY created_at, id LIMIT 1")
    .get() as { id: string } | undefined;
  if (!row) {
    throw new Error(
      "No user exists: initDatabase must run before any row is written.",
    );
  }
  return row.id;
}

/** Whether the person in scope owns this installation. Throws outside a request, like the rest. */
export function currentUserIsOwner(): boolean {
  return currentUserId() === ownerId();
}

/** Keeps the owner's identity in step with the profile they edit. */
export function setOwnerEmail(email: string) {
  const trimmed = email.trim();
  if (!trimmed) {
    return;
  }
  db.prepare("UPDATE users SET email = ? WHERE id = ?").run(
    trimmed,
    currentUserId(),
  );
}

/**
 * Gives every owned table a user_id. SQLite cannot add a NOT NULL column without a default, and
 * refuses a default on a column that references another table, so the column is added with
 * foreign keys off and the sentinel default; the existing rows are then attributed to the owner.
 * What a table gains is an owner it cannot lose, not a nullable column somebody has to remember.
 */
function addOwnerColumns() {
  const owner = ensureOwner();
  db.exec("PRAGMA foreign_keys = OFF;");
  try {
    for (const table of OWNED_TABLES) {
      if (!tableExists(table)) continue;
      if (!columnExists(table, "user_id")) {
        db.exec(
          `ALTER TABLE ${table}
             ADD COLUMN user_id TEXT NOT NULL DEFAULT '${UNATTRIBUTED}'
             REFERENCES users(id) ON DELETE CASCADE`,
        );
      }
      db.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id = ?`).run(
        owner,
        UNATTRIBUTED,
      );
      // Every owner-filtered query the app will grow needs this, or it reads the whole table.
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_${table}_owner ON ${table}(user_id)`,
      );
    }
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
}

/**
 * The three tables whose keys make a second person impossible: one month, one budget line per
 * scope and one Type name per *database* rather than per person. SQLite cannot alter a primary
 * key or drop an inline UNIQUE, so each is rebuilt with the owner inside its key.
 */
function rekeyForOwner() {
  const owner = ensureOwner();
  const keyed = (table: string, marker: string) => {
    const row = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get(table) as { sql: string } | undefined;
    return !row || row.sql.replace(/\s+/g, " ").includes(marker);
  };

  const rebuild = (table: string, columns: string, create: string) => {
    db.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id = ?`).run(
      owner,
      UNATTRIBUTED,
    );
    db.exec(`CREATE TABLE ${table}_rekeyed (${create});`);
    db.exec(
      `INSERT INTO ${table}_rekeyed (${columns}) SELECT ${columns} FROM ${table};`,
    );
    db.exec(`DROP TABLE ${table};`);
    db.exec(`ALTER TABLE ${table}_rekeyed RENAME TO ${table};`);
  };

  db.exec("PRAGMA foreign_keys = OFF;");
  try {
    transaction(() => {
      if (!keyed("net_worth_snapshots", "PRIMARY KEY (user_id, month)")) {
        rebuild(
          "net_worth_snapshots",
          "user_id, month, liquid_paise, investments_paise, liabilities_paise, net_worth_paise, captured_at",
          `user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
           month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
           liquid_paise INTEGER NOT NULL,
           investments_paise INTEGER NOT NULL,
           liabilities_paise INTEGER NOT NULL,
           net_worth_paise INTEGER NOT NULL,
           captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
           PRIMARY KEY (user_id, month)`,
        );
      }

      // D8 later replaces scope_id with two columns and keys the table on those instead, so a
      // database that has already been through that must not be dragged back to this shape.
      const splitAlready = columnExists("budget_lines", "scope_subcategory_id");
      if (
        !splitAlready &&
        !keyed("budget_lines", "UNIQUE (user_id, month, scope_type, scope_id)")
      ) {
        rebuild(
          "budget_lines",
          "id, user_id, month, scope_type, scope_id, amount_paise, created_at, updated_at",
          `id TEXT PRIMARY KEY,
           user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
           month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
           scope_type TEXT NOT NULL CHECK (scope_type IN ('type', 'subcategory')),
           scope_id TEXT NOT NULL,
           amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
           created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
           updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
           UNIQUE (user_id, month, scope_type, scope_id)`,
        );
      }

      if (!keyed("category_types", "UNIQUE (user_id, name)")) {
        rebuild(
          "category_types",
          "id, user_id, name, behavior, icon, color, is_system, is_locked, sort_order, created_at",
          `id TEXT PRIMARY KEY,
           user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
           name TEXT NOT NULL COLLATE NOCASE,
           behavior TEXT NOT NULL CHECK (behavior IN ('expense', 'income', 'loan', 'investment', 'transfer', 'card_payment', 'refund')),
           icon TEXT NOT NULL,
           color TEXT NOT NULL,
           is_system INTEGER NOT NULL DEFAULT 0,
           is_locked INTEGER NOT NULL DEFAULT 0,
           sort_order INTEGER NOT NULL DEFAULT 0,
           created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
           UNIQUE (user_id, name)`,
        );
      }
    });
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }

  // A rebuilt table keeps none of its indexes, so the ones it had come back.
  for (const table of [
    "net_worth_snapshots",
    "budget_lines",
    "category_types",
  ]) {
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_${table}_owner ON ${table}(user_id);`,
    );
  }
  ensureBudgetIndexes();
  ensureTaxonomyIndexes();
}

/**
 * D2: one settings table held both the owner's profile and installation-wide bookkeeping, keyed
 * so only one of each could exist. It becomes two tables whose names say which kind they hold,
 * so no future reader has to know the difference by heart.
 */
function splitSettings() {
  // Only a database written by an earlier release still has the single settings table; this is the
  // one place that knows it ever existed, which is why nothing above creates it.
  if (!tableExists("settings")) {
    return;
  }
  const owner = ensureOwner();
  const rows = db.prepare("SELECT key, value FROM settings").all() as Array<{
    key: string;
    value: string;
  }>;
  const mine = db.prepare(
    "INSERT OR IGNORE INTO user_settings (user_id, key, value) VALUES (?, ?, ?)",
  );
  const shared = db.prepare(
    "INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)",
  );

  transaction(() => {
    for (const row of rows) {
      if (PER_PERSON_SETTINGS.has(row.key)) {
        mine.run(owner, row.key, row.value);
      } else {
        shared.run(row.key, row.value);
      }
    }
    db.exec("DROP TABLE settings;");
  });
}

/**
 * D4, the half Stage 2 could not do. A child row now references its parent by (id, user_id), so
 * the database itself rejects a row that points at somebody else's: the guarantee stops depending
 * on which code path remembered to check.
 *
 * SQLite needs the parent side of a composite foreign key to be uniquely indexed, which a plain
 * index on (id, user_id) satisfies -- no parent has to be rebuilt. The children do, because a
 * constraint cannot be added to an existing table.
 */
const OWNER_PARENTS = [
  "accounts",
  "entry_batches",
  "transactions",
  "loans",
  "autopay_subscriptions",
  "investments",
  "vacations",
  "category_types",
  "subcategories",
];

function ensureParentOwnerKeys() {
  for (const table of OWNER_PARENTS) {
    if (!tableExists(table)) continue;
    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_${table}_id_owner ON ${table}(id, user_id);`,
    );
  }
}

/**
 * Each child, as it must look once its references carry the owner. D8 is here too: budget_lines
 * stops holding one polymorphic scope_id and holds two columns the database can actually check,
 * with a CHECK that exactly one of them is set.
 */
const COMPOSITE_CHILDREN: Array<{
  table: string;
  marker: string;
  columns: string;
  create: string;
  select?: string;
}> = [
  {
    table: "subcategories",
    marker: "REFERENCES category_types(id, user_id)",
    columns:
      "id, user_id, type_id, name, icon, color, is_system, is_locked, sort_order, created_at",
    create: `id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       type_id TEXT NOT NULL,
       name TEXT NOT NULL COLLATE NOCASE,
       icon TEXT NOT NULL,
       color TEXT NOT NULL,
       is_system INTEGER NOT NULL DEFAULT 0,
       is_locked INTEGER NOT NULL DEFAULT 0,
       sort_order INTEGER NOT NULL DEFAULT 0,
       created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
       UNIQUE(type_id, name),
       FOREIGN KEY (type_id, user_id) REFERENCES category_types(id, user_id) ON DELETE CASCADE`,
  },
  {
    table: "transactions",
    marker: "REFERENCES accounts(id, user_id)",
    columns: `id, user_id, batch_id, date, account_id, method, merchant, note, type_id, subcategory_id,
              amount_paise, direction, kind, status, transfer_account_id, linked_transaction_id,
              created_at, updated_at`,
    create: `id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       batch_id TEXT,
       date TEXT NOT NULL,
       account_id TEXT NOT NULL,
       method TEXT NOT NULL CHECK (method IN ('upi', 'credit_card', 'bank_transfer', 'cash', 'other')),
       merchant TEXT,
       note TEXT,
       type_id TEXT,
       subcategory_id TEXT,
       amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
       direction TEXT NOT NULL CHECK (direction IN ('inflow', 'outflow')),
       kind TEXT NOT NULL CHECK (kind IN ('expense', 'income', 'refund', 'transfer', 'card_payment', 'reversal', 'investment', 'emi')),
       status TEXT NOT NULL CHECK (status IN ('categorized', 'uncategorized', 'split')) DEFAULT 'categorized',
       transfer_account_id TEXT,
       linked_transaction_id TEXT,
       created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
       updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY (account_id, user_id) REFERENCES accounts(id, user_id) ON DELETE RESTRICT,
       FOREIGN KEY (transfer_account_id, user_id) REFERENCES accounts(id, user_id) ON DELETE RESTRICT,
       FOREIGN KEY (batch_id, user_id) REFERENCES entry_batches(id, user_id) ON DELETE SET NULL,
       FOREIGN KEY (type_id, user_id) REFERENCES category_types(id, user_id) ON DELETE RESTRICT,
       FOREIGN KEY (subcategory_id, user_id) REFERENCES subcategories(id, user_id) ON DELETE RESTRICT,
       FOREIGN KEY (linked_transaction_id, user_id) REFERENCES transactions(id, user_id) ON DELETE SET NULL`,
  },
  {
    table: "transaction_splits",
    marker: "REFERENCES transactions(id, user_id)",
    columns: "id, user_id, transaction_id, subcategory_id, amount_paise",
    create: `id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       transaction_id TEXT NOT NULL,
       subcategory_id TEXT,
       amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
       FOREIGN KEY (transaction_id, user_id) REFERENCES transactions(id, user_id) ON DELETE CASCADE,
       FOREIGN KEY (subcategory_id, user_id) REFERENCES subcategories(id, user_id) ON DELETE RESTRICT`,
  },
  {
    table: "transaction_links",
    marker: "REFERENCES transactions(id, user_id)",
    columns:
      "id, user_id, source_transaction_id, target_transaction_id, link_type, amount_paise, created_at",
    create: `id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       source_transaction_id TEXT NOT NULL,
       target_transaction_id TEXT NOT NULL,
       link_type TEXT NOT NULL CHECK (link_type IN ('refund', 'reversal', 'duplicate', 'card_payment')),
       amount_paise INTEGER,
       created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY (source_transaction_id, user_id) REFERENCES transactions(id, user_id) ON DELETE CASCADE,
       FOREIGN KEY (target_transaction_id, user_id) REFERENCES transactions(id, user_id) ON DELETE CASCADE`,
  },
  {
    table: "loans",
    marker: "REFERENCES subcategories(id, user_id)",
    columns: `id, user_id, name, subcategory_id, principal_amount_paise, starting_outstanding_paise,
              start_month, annual_interest_rate_bps, tenure_months, monthly_emi_paise, emi_due_day,
              is_archived, created_at, updated_at`,
    create: `id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       name TEXT NOT NULL COLLATE NOCASE,
       subcategory_id TEXT NOT NULL,
       principal_amount_paise INTEGER NOT NULL CHECK (principal_amount_paise > 0),
       starting_outstanding_paise INTEGER NOT NULL CHECK (starting_outstanding_paise >= 0),
       start_month TEXT NOT NULL CHECK (start_month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
       annual_interest_rate_bps INTEGER NOT NULL CHECK (annual_interest_rate_bps >= 0),
       tenure_months INTEGER NOT NULL CHECK (tenure_months > 0),
       monthly_emi_paise INTEGER NOT NULL CHECK (monthly_emi_paise > 0),
       emi_due_day INTEGER,
       is_archived INTEGER NOT NULL DEFAULT 0,
       created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
       updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY (subcategory_id, user_id) REFERENCES subcategories(id, user_id) ON DELETE RESTRICT`,
  },
  {
    table: "loan_payments",
    marker: "REFERENCES loans(id, user_id)",
    columns: `id, user_id, loan_id, transaction_id, payment_type, amount_paise, principal_paise,
              interest_paise, outstanding_before_paise, outstanding_after_paise, created_at, updated_at`,
    create: `id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       loan_id TEXT NOT NULL,
       transaction_id TEXT NOT NULL UNIQUE,
       payment_type TEXT NOT NULL CHECK (payment_type IN ('emi', 'prepayment')),
       amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
       principal_paise INTEGER NOT NULL CHECK (principal_paise >= 0),
       interest_paise INTEGER NOT NULL CHECK (interest_paise >= 0),
       outstanding_before_paise INTEGER NOT NULL CHECK (outstanding_before_paise >= 0),
       outstanding_after_paise INTEGER NOT NULL CHECK (outstanding_after_paise >= 0),
       created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
       updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY (loan_id, user_id) REFERENCES loans(id, user_id) ON DELETE CASCADE,
       FOREIGN KEY (transaction_id, user_id) REFERENCES transactions(id, user_id) ON DELETE CASCADE`,
  },
  {
    table: "autopay_payments",
    marker: "REFERENCES autopay_subscriptions(id, user_id)",
    columns: "id, user_id, subscription_id, transaction_id, created_at",
    create: `id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       subscription_id TEXT NOT NULL,
       transaction_id TEXT NOT NULL UNIQUE,
       created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY (subscription_id, user_id) REFERENCES autopay_subscriptions(id, user_id) ON DELETE CASCADE,
       FOREIGN KEY (transaction_id, user_id) REFERENCES transactions(id, user_id) ON DELETE CASCADE`,
  },
  {
    table: "investment_payments",
    marker: "REFERENCES investments(id, user_id)",
    columns: "id, user_id, investment_id, transaction_id, created_at",
    create: `id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       investment_id TEXT NOT NULL,
       transaction_id TEXT NOT NULL UNIQUE,
       created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY (investment_id, user_id) REFERENCES investments(id, user_id) ON DELETE CASCADE,
       FOREIGN KEY (transaction_id, user_id) REFERENCES transactions(id, user_id) ON DELETE CASCADE`,
  },
  {
    table: "vacation_expenses",
    marker: "REFERENCES vacations(id, user_id)",
    columns: "id, user_id, vacation_id, transaction_id, created_at",
    create: `id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       vacation_id TEXT NOT NULL,
       transaction_id TEXT NOT NULL UNIQUE,
       created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY (vacation_id, user_id) REFERENCES vacations(id, user_id) ON DELETE CASCADE,
       FOREIGN KEY (transaction_id, user_id) REFERENCES transactions(id, user_id) ON DELETE CASCADE`,
  },
  {
    // D8. The one column the database could not check becomes two it can.
    table: "budget_lines",
    marker: "scope_subcategory_id",
    columns: `id, user_id, month, scope_type, scope_type_id, scope_subcategory_id, amount_paise,
              created_at, updated_at`,
    select: `id, user_id, month, scope_type,
             CASE WHEN scope_type = 'type' THEN scope_id END,
             CASE WHEN scope_type = 'subcategory' THEN scope_id END,
             amount_paise, created_at, updated_at`,
    create: `id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
       scope_type TEXT NOT NULL CHECK (scope_type IN ('type', 'subcategory')),
       scope_type_id TEXT,
       scope_subcategory_id TEXT,
       amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
       created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
       updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
       -- Exactly one scope, and it must be the one scope_type names.
       CHECK ((scope_type = 'type' AND scope_type_id IS NOT NULL AND scope_subcategory_id IS NULL)
           OR (scope_type = 'subcategory' AND scope_subcategory_id IS NOT NULL AND scope_type_id IS NULL)),
       UNIQUE (user_id, month, scope_type, scope_type_id, scope_subcategory_id),
       FOREIGN KEY (scope_type_id, user_id) REFERENCES category_types(id, user_id) ON DELETE CASCADE,
       FOREIGN KEY (scope_subcategory_id, user_id) REFERENCES subcategories(id, user_id) ON DELETE CASCADE`,
  },
];

/** True once the table's own definition carries the marker, so this runs once and then never. */
function alreadyComposite(table: string, marker: string) {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table) as { sql: string } | undefined;
  return !row || row.sql.replace(/\s+/g, " ").includes(marker);
}

function addCompositeOwnerKeys() {
  ensureParentOwnerKeys();

  // A database that still holds a legacy category keeps its category_id columns -- dropLegacyCategories
  // leaves them alone and asks the owner to recategorise those rows first. Rebuilding a table here
  // writes out an explicit column list, so it would take those columns, and the values in them, with
  // it. Nothing is rebuilt until that cleanup has happened; the keys arrive on the next start.
  const legacyRemains =
    columnExists("transactions", "category_id") ||
    columnExists("transaction_splits", "category_id");
  if (legacyRemains) {
    console.warn(
      "[db] Legacy category columns are still present, so the owner keys were not added yet. " +
        "Recategorise the rows that still reference a legacy category and restart.",
    );
    return;
  }

  const pending = COMPOSITE_CHILDREN.filter(
    (child) =>
      tableExists(child.table) && !alreadyComposite(child.table, child.marker),
  );
  if (pending.length === 0) {
    return;
  }
  createMigrationBackup("composite-owner-keys");

  db.exec("PRAGMA foreign_keys = OFF;");
  try {
    transaction(() => {
      for (const child of pending) {
        const columns = child.columns.replace(/\s+/g, " ").trim();
        db.exec(`CREATE TABLE ${child.table}_owned (${child.create});`);
        db.exec(
          `INSERT INTO ${child.table}_owned (${columns})
           SELECT ${(child.select ?? columns).replace(/\s+/g, " ").trim()} FROM ${child.table};`,
        );
        db.exec(`DROP TABLE ${child.table};`);
        db.exec(`ALTER TABLE ${child.table}_owned RENAME TO ${child.table};`);
      }
    });
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }

  // A rebuilt table keeps none of its indexes, and a parent that was rebuilt loses the unique
  // index its own children depend on.
  ensureParentOwnerKeys();
  for (const child of pending) {
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_${child.table}_owner ON ${child.table}(user_id);`,
    );
  }
  ensureAccountIndexes();
  ensureTransactionIndexes();
  ensureLoanIndexes();
  ensureAutopayIndexes();
  ensureBudgetIndexes();
  ensureInvestmentIndexes();
  ensureVacationIndexes();
  ensureTaxonomyIndexes();

  // Nothing may have been orphaned on the way through.
  const broken = db.prepare("PRAGMA foreign_key_check").all() as Array<{
    table?: string;
  }>;
  if (broken.length > 0) {
    const where = [...new Set(broken.map((row) => row.table ?? "?"))].join(
      ", ",
    );
    throw new Error(
      `Composite owner keys left ${broken.length} broken reference(s) in ${where}.`,
    );
  }
}

function ensureLoanIndexes() {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_loans_subcategory ON loans(subcategory_id);
    CREATE INDEX IF NOT EXISTS idx_loans_archived ON loans(is_archived);
    CREATE INDEX IF NOT EXISTS idx_loan_payments_loan ON loan_payments(loan_id);
    CREATE INDEX IF NOT EXISTS idx_loan_payments_transaction ON loan_payments(transaction_id);
  `);
}

function ensureAutopayIndexes() {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_autopay_subscriptions_archived ON autopay_subscriptions(is_archived);
    CREATE INDEX IF NOT EXISTS idx_autopay_payments_subscription ON autopay_payments(subscription_id);
    CREATE INDEX IF NOT EXISTS idx_autopay_payments_transaction ON autopay_payments(transaction_id);
  `);
}

function ensureBudgetIndexes() {
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_budget_lines_month ON budget_lines(month);",
  );
  // D8 replaced the single polymorphic scope_id with one column per kind, so the index that
  // served lookups by scope follows it. An older database still has the old column until the
  // migration below has run on it.
  if (columnExists("budget_lines", "scope_subcategory_id")) {
    db.exec(`
      DROP INDEX IF EXISTS idx_budget_lines_scope;
      CREATE INDEX IF NOT EXISTS idx_budget_lines_type_scope ON budget_lines(scope_type_id);
      CREATE INDEX IF NOT EXISTS idx_budget_lines_subcategory_scope ON budget_lines(scope_subcategory_id);
    `);
  } else if (columnExists("budget_lines", "scope_id")) {
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_budget_lines_scope ON budget_lines(scope_type, scope_id);",
    );
  }
}

function ensureVacationIndexes() {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_vacations_archived ON vacations(is_archived);
    CREATE INDEX IF NOT EXISTS idx_vacation_expenses_vacation ON vacation_expenses(vacation_id);
    CREATE INDEX IF NOT EXISTS idx_vacation_expenses_transaction ON vacation_expenses(transaction_id);
  `);
}

function ensureInvestmentIndexes() {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_investments_type ON investments(type);
    CREATE INDEX IF NOT EXISTS idx_investment_payments_investment ON investment_payments(investment_id);
    CREATE INDEX IF NOT EXISTS idx_investment_payments_transaction ON investment_payments(transaction_id);
  `);
}

function ensureInvestmentColumns() {
  addColumnIfMissing("investments", "shares", "REAL");
  addColumnIfMissing("investments", "purchase_date", "TEXT");
  // The day the user last entered each figure; linked SIPs dated after it are added on top.
  // NULL (holdings from before this) means "the day the holding was added".
  addColumnIfMissing("investments", "invested_as_of", "TEXT");
  addColumnIfMissing("investments", "value_as_of", "TEXT");
}

function migrateInvestmentTypes() {
  const row = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'investments'",
    )
    .get() as { sql?: string } | undefined;

  // Only rebuild older tables whose CHECK constraint predates the newest type ('bonds').
  if (!row?.sql || row.sql.includes("'bonds'")) {
    return;
  }

  createMigrationBackup("investment-types");
  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec("BEGIN;");
  try {
    db.exec(`
      CREATE TABLE investments_new (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('stocks', 'mutual_funds', 'gold', 'land', 'property', 'pf', 'fd', 'bonds', 'other')),
        name TEXT NOT NULL,
        invested_paise INTEGER NOT NULL CHECK (invested_paise >= 0),
        current_value_paise INTEGER NOT NULL CHECK (current_value_paise >= 0),
        shares REAL,
        purchase_date TEXT,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        invested_as_of TEXT,
        value_as_of TEXT
      );

      INSERT INTO investments_new
        (id, type, name, invested_paise, current_value_paise, shares, purchase_date, note, created_at, updated_at,
         invested_as_of, value_as_of)
      SELECT id, type, name, invested_paise, current_value_paise, shares, purchase_date, note, created_at, updated_at,
             invested_as_of, value_as_of
      FROM investments;

      DROP TABLE investments;
      ALTER TABLE investments_new RENAME TO investments;
    `);
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
}

function migrateAccountNameConstraint() {
  const row = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'accounts'",
    )
    .get() as { sql?: string } | undefined;

  if (!row?.sql?.includes("name TEXT NOT NULL COLLATE NOCASE UNIQUE")) {
    return;
  }

  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec("BEGIN;");
  try {
    db.exec(`
      CREATE TABLE accounts_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE,
        type TEXT NOT NULL CHECK (type IN ('bank', 'credit_card', 'food_card')),
        starting_balance_paise INTEGER NOT NULL DEFAULT 0,
        credit_limit_paise INTEGER,
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO accounts_new
        (id, name, type, starting_balance_paise, credit_limit_paise,
         is_archived, created_at, updated_at)
      SELECT id, name, type, starting_balance_paise, credit_limit_paise,
             is_archived, created_at, updated_at
      FROM accounts;

      DROP TABLE accounts;
      ALTER TABLE accounts_new RENAME TO accounts;
    `);
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
}

function migrateAccountTypes() {
  const row = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'accounts'",
    )
    .get() as { sql?: string } | undefined;

  if (row?.sql?.includes("'food_card'")) {
    return;
  }

  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec("BEGIN;");
  try {
    db.exec(`
      CREATE TABLE accounts_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE,
        type TEXT NOT NULL CHECK (type IN ('bank', 'credit_card', 'food_card')),
        starting_balance_paise INTEGER NOT NULL DEFAULT 0,
        credit_limit_paise INTEGER,
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO accounts_new
        (id, name, type, starting_balance_paise, credit_limit_paise,
         is_archived, created_at, updated_at)
      SELECT id, name, type, starting_balance_paise, credit_limit_paise,
             is_archived, created_at, updated_at
      FROM accounts;

      DROP TABLE accounts;
      ALTER TABLE accounts_new RENAME TO accounts;
    `);
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
}

function migrateTransactionKinds() {
  const row = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'transactions'",
    )
    .get() as { sql?: string } | undefined;

  if (row?.sql?.includes("'investment'") && row.sql.includes("'emi'")) {
    return;
  }

  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec("BEGIN;");
  try {
    db.exec(`
      CREATE TABLE transactions_new (
        id TEXT PRIMARY KEY,
        batch_id TEXT REFERENCES entry_batches(id) ON DELETE SET NULL,
        date TEXT NOT NULL,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
        method TEXT NOT NULL CHECK (method IN ('upi', 'credit_card', 'bank_transfer', 'cash', 'other')),
        merchant TEXT,
        note TEXT,
        category_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
        amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
        direction TEXT NOT NULL CHECK (direction IN ('inflow', 'outflow')),
        kind TEXT NOT NULL CHECK (kind IN ('expense', 'income', 'refund', 'transfer', 'card_payment', 'reversal', 'investment', 'emi')),
        status TEXT NOT NULL CHECK (status IN ('categorized', 'uncategorized', 'split')) DEFAULT 'categorized',
        transfer_account_id TEXT REFERENCES accounts(id) ON DELETE RESTRICT,
        linked_transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO transactions_new
        (id, batch_id, date, account_id, method, merchant, note, category_id,
         amount_paise, direction, kind, status, transfer_account_id,
         linked_transaction_id, created_at, updated_at)
      SELECT id, batch_id, date, account_id, method, merchant, note, category_id,
             amount_paise, direction, kind, status, transfer_account_id,
             linked_transaction_id, created_at, updated_at
      FROM transactions;

      DROP TABLE transactions;
      ALTER TABLE transactions_new RENAME TO transactions;
    `);
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
}

function migrateTransactionSplitsNullable() {
  const row = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'transaction_splits'",
    )
    .get() as { sql?: string } | undefined;

  if (!row?.sql?.includes("category_id TEXT NOT NULL")) {
    return;
  }

  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec("BEGIN;");
  try {
    db.exec(`
      CREATE TABLE transaction_splits_new (
        id TEXT PRIMARY KEY,
        transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
        category_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
        amount_paise INTEGER NOT NULL CHECK (amount_paise > 0)
      );

      INSERT INTO transaction_splits_new
        (id, transaction_id, category_id, amount_paise)
      SELECT id, transaction_id, category_id, amount_paise
      FROM transaction_splits;

      DROP TABLE transaction_splits;
      ALTER TABLE transaction_splits_new RENAME TO transaction_splits;
    `);
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
}

function ensureSessionIndexes() {
  if (!tableExists("sessions")) {
    return;
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_owner ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
  `);
  // A session that has run out is of no use to anybody and is one more row to leak.
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(
    new Date().toISOString(),
  );
}

function ensureAccountIndexes() {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_accounts_active_name ON accounts(is_archived, name);
    CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type);
  `);
}

function ensureTransactionIndexes() {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_subcategory ON transactions(subcategory_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_batch ON transactions(batch_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_transfer_account ON transactions(transfer_account_id);
  `);
}

function ensureTaxonomyIndexes() {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_subcategories_type ON subcategories(type_id);
    CREATE INDEX IF NOT EXISTS idx_category_types_behavior ON category_types(behavior);
  `);
}

function ensureTaxonomySchema() {
  const needsBackup =
    !tableExists("category_types") ||
    !tableExists("subcategories") ||
    !columnExists("transactions", "type_id") ||
    !columnExists("transactions", "subcategory_id");

  if (needsBackup) {
    createMigrationBackup("taxonomy");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS category_types (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL COLLATE NOCASE,
      behavior TEXT NOT NULL CHECK (behavior IN ('expense', 'income', 'loan', 'investment', 'transfer', 'card_payment', 'refund')),
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 0,
      is_locked INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, name)
    );

    CREATE TABLE IF NOT EXISTS subcategories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type_id TEXT NOT NULL REFERENCES category_types(id) ON DELETE CASCADE,
      name TEXT NOT NULL COLLATE NOCASE,
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 0,
      is_locked INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(type_id, name)
    );
  `);

  addColumnIfMissing(
    "transactions",
    "type_id",
    "TEXT REFERENCES category_types(id) ON DELETE RESTRICT",
  );
  addColumnIfMissing(
    "transactions",
    "subcategory_id",
    "TEXT REFERENCES subcategories(id) ON DELETE RESTRICT",
  );
  addColumnIfMissing(
    "transaction_splits",
    "subcategory_id",
    "TEXT REFERENCES subcategories(id) ON DELETE RESTRICT",
  );
}

const SEEDED_DEFAULTS_SETTING = "seeded_default_taxonomy_ids";

/**
 * Inserts each shipped default Type/SubType exactly once per person. The ids already delivered
 * are recorded against that person, so a default they delete stays deleted after a restart, while
 * a default added in a later release still reaches existing databases.
 */
function seedTaxonomy() {
  const owner = currentUserId();
  const insertType = db.prepare(`
    INSERT OR IGNORE INTO category_types
      (id, user_id, name, behavior, icon, color, is_system, is_locked, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);
  const insertSubcategory = db.prepare(`
    INSERT OR IGNORE INTO subcategories
      (id, user_id, type_id, name, icon, color, is_system, is_locked, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);
  const typeExists = db.prepare(
    "SELECT 1 FROM category_types WHERE id = ? AND user_id = ?",
  );

  const recorded = getSetting(SEEDED_DEFAULTS_SETTING);
  let seeded: Set<string>;
  if (recorded !== undefined) {
    seeded = new Set(JSON.parse(recorded) as string[]);
  } else {
    const hasTaxonomy =
      (
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM category_types WHERE user_id = ?",
          )
          .get(owner) as { count: number }
      ).count > 0;
    // Before this ledger existed every original default was inserted on each boot, so an
    // original default missing from an existing database is one the user deleted.
    seeded = new Set(
      hasTaxonomy
        ? DEFAULT_CATEGORY_TYPES.flatMap((type) => [
            type.id,
            ...type.subcategories.map((sub) => sub.id),
          ]).filter((id) => !DEFAULTS_ADDED_AFTER_LEDGER.has(id))
        : [],
    );
  }

  DEFAULT_CATEGORY_TYPES.forEach((type, typeIndex) => {
    if (!seeded.has(type.id)) {
      insertType.run(
        type.id,
        owner,
        type.name,
        type.behavior,
        type.icon,
        type.color,
        // Card payments and refunds are wired into the app's logic, so their Types can't be deleted.
        type.id === "type_card_payment" || type.id === "type_refund" ? 1 : 0,
        typeIndex + 1,
      );
      seeded.add(type.id);
    }

    type.subcategories.forEach((subcategory, subIndex) => {
      if (seeded.has(subcategory.id)) {
        return;
      }
      // A default SubType can only be added under a parent Type the user still has.
      if (!typeExists.get(type.id, owner)) {
        return;
      }
      insertSubcategory.run(
        subcategory.id,
        owner,
        type.id,
        subcategory.name,
        subcategory.icon,
        subcategory.color,
        subcategory.id === SELF_TRANSFER_SUBCATEGORY_ID ? 1 : 0,
        subIndex + 1,
      );
      seeded.add(subcategory.id);
    });
  });

  setSetting(SEEDED_DEFAULTS_SETTING, JSON.stringify([...seeded].sort()));
}

function migrateLegacyCategoriesToTaxonomy() {
  if (getSetting("taxonomy_migration_v1") === "complete") {
    return;
  }

  // A database created after the legacy table was removed has nothing to migrate from, and
  // every statement below joins it. Record the migration as done and leave.
  if (!tableExists("categories")) {
    setSetting("taxonomy_migration_v1", "complete");
    return;
  }

  transaction(() => {
    db.prepare(
      `UPDATE transactions
       SET type_id = 'type_card_payment',
           subcategory_id = NULL
       WHERE type_id IS NULL
         AND kind = 'card_payment'`,
    ).run();

    db.prepare(
      `UPDATE transactions
       SET type_id = 'type_loan',
           subcategory_id = 'sub_other_loan',
           status = CASE WHEN status = 'split' THEN status ELSE 'categorized' END
       WHERE type_id IS NULL
         AND (kind = 'emi'
              OR category_id IN (SELECT id FROM categories WHERE name = 'EMI' COLLATE NOCASE))`,
    ).run();

    db.prepare(
      `UPDATE transactions
       SET type_id = 'type_income',
           subcategory_id = 'sub_other_income',
           status = CASE WHEN status = 'split' THEN status ELSE 'categorized' END
       WHERE type_id IS NULL
         AND kind = 'income'`,
    ).run();

    db.prepare(
      `UPDATE transactions
       SET type_id = 'type_investment',
           subcategory_id = NULL
       WHERE type_id IS NULL
         AND kind = 'investment'`,
    ).run();

    db.prepare(
      `UPDATE transactions
       SET type_id = 'type_transfer',
           subcategory_id = NULL
       WHERE type_id IS NULL
         AND kind = 'transfer'`,
    ).run();

    db.prepare(
      `UPDATE transactions
       SET type_id = 'type_expense',
           subcategory_id = (
             SELECT s.id
             FROM subcategories s
             JOIN categories c ON c.name = s.name COLLATE NOCASE
             WHERE c.id = transactions.category_id
               AND s.type_id = 'type_expense'
             LIMIT 1
           ),
           status = CASE
             WHEN status = 'split' THEN status
             WHEN (
               SELECT s.id
               FROM subcategories s
               JOIN categories c ON c.name = s.name COLLATE NOCASE
               WHERE c.id = transactions.category_id
                 AND s.type_id = 'type_expense'
               LIMIT 1
             ) IS NULL THEN 'uncategorized'
             ELSE 'categorized'
           END
       WHERE type_id IS NULL
         AND kind = 'expense'`,
    ).run();

    db.prepare(
      `UPDATE transaction_splits
       SET subcategory_id = (
         SELECT s.id
         FROM subcategories s
         JOIN categories c ON c.name = s.name COLLATE NOCASE
         WHERE c.id = transaction_splits.category_id
         LIMIT 1
       )
       WHERE subcategory_id IS NULL`,
    ).run();

    db.prepare(
      `UPDATE transactions
       SET status = CASE WHEN status = 'split' THEN status ELSE 'uncategorized' END
       WHERE type_id IS NULL
          OR (kind IN ('expense', 'investment') AND subcategory_id IS NULL)`,
    ).run();

    setSetting("taxonomy_migration_v1", "complete");
  });
}

function tableExists(name: string) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as { name?: string } | undefined;
  return Boolean(row);
}

function columnExists(table: string, column: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  return rows.some((row) => row.name === column);
}

function addColumnIfMissing(table: string, column: string, definition: string) {
  if (columnExists(table, column)) {
    return;
  }
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
}

/**
 * Due days are optional and were added later, so the columns are appended in place. Existing rows
 * keep NULL, which means "no reminder", exactly how they behaved before.
 */
function ensureDueDayColumns() {
  addColumnIfMissing("loans", "emi_due_day", "INTEGER");
  addColumnIfMissing("accounts", "payment_due_day", "INTEGER");
}

function createMigrationBackup(label: string) {
  if (process.env.FINANCE_SKIP_MIGRATION_BACKUP === "1") {
    return;
  }

  const backupDir = ensureBackupDir();
  const target = path.join(
    backupDir,
    `finance-before-${label}-${new Date().toISOString().replace(/[:.]/g, "-")}.db`,
  );

  if (existsSync(target)) {
    return;
  }

  db.prepare("VACUUM INTO ?").run(target);
  pruneBackupFiles(backupDir);
}

/**
 * Reads a setting from whichever of the two tables owns that kind of key (D2), so every existing
 * caller keeps working without having to know which is which.
 */
function getSetting(key: string) {
  const row = (
    PER_PERSON_SETTINGS.has(key)
      ? db
          .prepare(
            "SELECT value FROM user_settings WHERE user_id = ? AND key = ?",
          )
          .get(currentUserId(), key)
      : db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key)
  ) as { value: string } | undefined;
  return row?.value;
}

function setSetting(key: string, value: string) {
  if (PER_PERSON_SETTINGS.has(key)) {
    db.prepare(
      `INSERT INTO user_settings (user_id, key, value)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`,
    ).run(currentUserId(), key, value);
    return;
  }
  db.prepare(
    `INSERT INTO app_settings (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

/** The split in D2, as one list the server can ask about rather than two tables to remember. */
export function isPerPersonSetting(key: string) {
  return PER_PERSON_SETTINGS.has(key);
}

function seedSettings() {
  const owner = currentUserId();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO user_settings (user_id, key, value)
    VALUES (?, ?, ?)
  `);
  const seed = (key: string, value: string) => insert.run(owner, key, value);

  seed("currency", CURRENCY);
  seed("week_start", WEEK_START);
  seed("first_screen", "overview");
  seed("card_utilization_alert_percent", "30");
  seed("profile_name", "");
  seed("profile_email", "");
  seed("profile_age", "");
}

export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN;");
  try {
    const result = fn();
    db.exec("COMMIT;");
    return result;
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

export function asRecord<T>(row: unknown): T {
  return row as T;
}

export function asRecords<T>(rows: unknown[]): T[] {
  return rows as T[];
}
