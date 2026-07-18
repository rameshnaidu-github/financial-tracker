import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_CATEGORY_TYPES,
  SELF_TRANSFER_SUBCATEGORY_ID,
  WEEK_START,
  CURRENCY
} from "../shared/finance.ts";
import { ensureBackupDir, pruneBackupFiles } from "./backup-files.ts";

const configuredDbPath = process.env.FINANCE_DB_PATH;
const dataDir = path.join(process.cwd(), "data");
export const dbPath = configuredDbPath ? path.resolve(configuredDbPath) : path.join(dataDir, "finance.db");

mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);

db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA busy_timeout = 5000;");

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
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

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 0,
      is_locked INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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

    CREATE TABLE IF NOT EXISTS transaction_splits (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      category_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
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
      type TEXT NOT NULL CHECK (type IN ('stocks', 'mutual_funds', 'gold', 'land', 'property', 'pf', 'fd', 'other')),
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
      month TEXT PRIMARY KEY CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
      liquid_paise INTEGER NOT NULL,
      investments_paise INTEGER NOT NULL,
      liabilities_paise INTEGER NOT NULL,
      net_worth_paise INTEGER NOT NULL,
      captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS budget_lines (
      id TEXT PRIMARY KEY,
      month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
      scope_type TEXT NOT NULL CHECK (scope_type IN ('type', 'subcategory')),
      scope_id TEXT NOT NULL,
      amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(month, scope_type, scope_id)
    );

  `);

  migrateAccountNameConstraint();
  migrateAccountTypes();
  migrateTransactionKinds();
  migrateTransactionSplitsNullable();
  ensureTaxonomySchema();
  seedTaxonomy();
  migrateLegacyCategoriesToTaxonomy();
  ensureAccountIndexes();
  ensureTransactionIndexes();
  ensureLoanIndexes();
  ensureAutopayIndexes();
  ensureBudgetIndexes();
  ensureInvestmentColumns();
  migrateInvestmentTypes();
  ensureInvestmentIndexes();
  ensureVacationIndexes();
  ensureTaxonomyIndexes();
  seedSettings();
  pruneBackupFiles();
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
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_budget_lines_month ON budget_lines(month);
    CREATE INDEX IF NOT EXISTS idx_budget_lines_scope ON budget_lines(scope_type, scope_id);
  `);
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
}

function migrateInvestmentTypes() {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'investments'")
    .get() as { sql?: string } | undefined;

  // Only rebuild older tables whose CHECK constraint predates the 'fd' type.
  if (!row?.sql || row.sql.includes("'fd'")) {
    return;
  }

  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec("BEGIN;");
  try {
    db.exec(`
      CREATE TABLE investments_new (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('stocks', 'mutual_funds', 'gold', 'land', 'property', 'pf', 'fd', 'other')),
        name TEXT NOT NULL,
        invested_paise INTEGER NOT NULL CHECK (invested_paise >= 0),
        current_value_paise INTEGER NOT NULL CHECK (current_value_paise >= 0),
        shares REAL,
        purchase_date TEXT,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO investments_new
        (id, type, name, invested_paise, current_value_paise, shares, purchase_date, note, created_at, updated_at)
      SELECT id, type, name, invested_paise, current_value_paise, shares, purchase_date, note, created_at, updated_at
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
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'accounts'")
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
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'accounts'")
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
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'transactions'")
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
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'transaction_splits'")
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
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
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
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      behavior TEXT NOT NULL CHECK (behavior IN ('expense', 'income', 'loan', 'investment', 'transfer', 'card_payment', 'refund')),
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 0,
      is_locked INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS subcategories (
      id TEXT PRIMARY KEY,
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
    "TEXT REFERENCES category_types(id) ON DELETE RESTRICT"
  );
  addColumnIfMissing(
    "transactions",
    "subcategory_id",
    "TEXT REFERENCES subcategories(id) ON DELETE RESTRICT"
  );
  addColumnIfMissing(
    "transaction_splits",
    "subcategory_id",
    "TEXT REFERENCES subcategories(id) ON DELETE RESTRICT"
  );
}

function seedTaxonomy() {
  const insertType = db.prepare(`
    INSERT OR IGNORE INTO category_types
      (id, name, behavior, icon, color, is_system, is_locked, sort_order)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `);
  const insertSubcategory = db.prepare(`
    INSERT OR IGNORE INTO subcategories
      (id, type_id, name, icon, color, is_system, is_locked, sort_order)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `);

  DEFAULT_CATEGORY_TYPES.forEach((type, typeIndex) => {
    insertType.run(
      type.id,
      type.name,
      type.behavior,
      type.icon,
      type.color,
      type.name === "Credit Card Payment" ? 1 : 0,
      typeIndex + 1
    );

    type.subcategories.forEach((subcategory, subIndex) => {
      insertSubcategory.run(
        subcategory.id,
        type.id,
        subcategory.name,
        subcategory.icon,
        subcategory.color,
        subcategory.id === SELF_TRANSFER_SUBCATEGORY_ID ? 1 : 0,
        subIndex + 1
      );
    });
  });
}

function migrateLegacyCategoriesToTaxonomy() {
  if (getSetting("taxonomy_migration_v1") === "complete") {
    return;
  }

  transaction(() => {
    db.prepare(
      `UPDATE transactions
       SET type_id = 'type_card_payment',
           subcategory_id = NULL
       WHERE type_id IS NULL
         AND kind = 'card_payment'`
    ).run();

    db.prepare(
      `UPDATE transactions
       SET type_id = 'type_loan',
           subcategory_id = 'sub_other_loan',
           status = CASE WHEN status = 'split' THEN status ELSE 'categorized' END
       WHERE type_id IS NULL
         AND (kind = 'emi'
              OR category_id IN (SELECT id FROM categories WHERE name = 'EMI' COLLATE NOCASE))`
    ).run();

    db.prepare(
      `UPDATE transactions
       SET type_id = 'type_income',
           subcategory_id = 'sub_other_income',
           status = CASE WHEN status = 'split' THEN status ELSE 'categorized' END
       WHERE type_id IS NULL
         AND kind = 'income'`
    ).run();

    db.prepare(
      `UPDATE transactions
       SET type_id = 'type_investment',
           subcategory_id = NULL
       WHERE type_id IS NULL
         AND kind = 'investment'`
    ).run();

    db.prepare(
      `UPDATE transactions
       SET type_id = 'type_transfer',
           subcategory_id = NULL
       WHERE type_id IS NULL
         AND kind = 'transfer'`
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
         AND kind = 'expense'`
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
       WHERE subcategory_id IS NULL`
    ).run();

    db.prepare(
      `UPDATE transactions
       SET status = CASE WHEN status = 'split' THEN status ELSE 'uncategorized' END
       WHERE type_id IS NULL
          OR (kind IN ('expense', 'investment') AND subcategory_id IS NULL)`
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
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function addColumnIfMissing(table: string, column: string, definition: string) {
  if (columnExists(table, column)) {
    return;
  }
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
}

function createMigrationBackup(label: string) {
  if (process.env.FINANCE_SKIP_MIGRATION_BACKUP === "1") {
    return;
  }

  const backupDir = ensureBackupDir();
  const target = path.join(
    backupDir,
    `finance-before-${label}-${new Date().toISOString().replace(/[:.]/g, "-")}.db`
  );

  if (existsSync(target)) {
    return;
  }

  db.prepare("VACUUM INTO ?").run(target);
  pruneBackupFiles(backupDir);
}

function getSetting(key: string) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

function setSetting(key: string, value: string) {
  db.prepare(
    `INSERT INTO settings (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

function seedSettings() {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value)
    VALUES (?, ?)
  `);

  insert.run("currency", CURRENCY);
  insert.run("week_start", WEEK_START);
  insert.run("first_screen", "overview");
  insert.run("card_utilization_alert_percent", "30");
  insert.run("profile_name", "");
  insert.run("profile_email", "");
  insert.run("profile_age", "");
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
