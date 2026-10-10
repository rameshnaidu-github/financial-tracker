-- The application's schema, in Postgres.
--
-- Derived from the schema the application actually has, by .unlazy/ship-7/derive-schema.mjs.
-- Hand edits belong in that script, not here, or the next derivation will discard them.
--
-- Order matters only in that every table exists before any foreign key is added, which is why
-- the keys are ALTERs at the end rather than clauses inside the CREATEs.
--
-- schema_state below is the one table added by hand rather than derived: it records which version
-- of this file has been applied, so a cold start can find out without re-running it.

CREATE EXTENSION IF NOT EXISTS citext;

-- Which version of this file the database already has.
--
-- Re-running the whole schema looked free, because every statement is IF NOT EXISTS. It is not:
-- the foreign keys below are DROP CONSTRAINT / ADD CONSTRAINT pairs, and each pair takes an
-- ACCESS EXCLUSIVE lock on two tables. One row here lets a cold start answer "already applied"
-- with a single cheap query instead.
CREATE TABLE IF NOT EXISTS schema_state (
  id BIGINT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name CITEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('bank', 'credit_card', 'food_card')),
  starting_balance_paise BIGINT NOT NULL DEFAULT 0,
  credit_limit_paise BIGINT,
  is_archived BIGINT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  payment_due_day BIGINT,
  user_id TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS autopay_payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS autopay_subscriptions (
  id TEXT PRIMARY KEY,
  name CITEXT NOT NULL,
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  start_date TEXT NOT NULL,
  duration_months BIGINT NOT NULL CHECK (duration_months > 0),
  is_archived BIGINT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  user_id TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS budget_lines (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  month TEXT NOT NULL CHECK (month ~ '^[0-9][0-9][0-9][0-9]-[0-9][0-9]$'),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('type', 'subcategory')),
  scope_type_id TEXT,
  scope_subcategory_id TEXT,
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  created_at TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  -- Exactly one scope, and it must be the one scope_type names.
       CHECK ((scope_type = 'type' AND scope_type_id IS NOT NULL AND scope_subcategory_id IS NULL)
           OR (scope_type = 'subcategory' AND scope_subcategory_id IS NOT NULL AND scope_type_id IS NULL)),
  UNIQUE (user_id, month, scope_type, scope_type_id, scope_subcategory_id)
);

CREATE TABLE IF NOT EXISTS category_types (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name CITEXT NOT NULL,
  behavior TEXT NOT NULL CHECK (behavior IN ('expense', 'income', 'loan', 'investment', 'transfer', 'card_payment', 'refund')),
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  is_system BIGINT NOT NULL DEFAULT 0,
  is_locked BIGINT NOT NULL DEFAULT 0,
  sort_order BIGINT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS entry_batches (
  id TEXT PRIMARY KEY,
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'saved')) DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  saved_at TEXT,
  user_id TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS investment_payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  investment_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS investments (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('stocks', 'mutual_funds', 'gold', 'land', 'property', 'pf', 'fd', 'bonds', 'other')),
  name TEXT NOT NULL,
  invested_paise BIGINT NOT NULL CHECK (invested_paise >= 0),
  current_value_paise BIGINT NOT NULL CHECK (current_value_paise >= 0),
  shares REAL,
  purchase_date TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  invested_as_of TEXT,
  value_as_of TEXT,
  user_id TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS loan_payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  loan_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL UNIQUE,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('emi', 'prepayment')),
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  principal_paise BIGINT NOT NULL CHECK (principal_paise >= 0),
  interest_paise BIGINT NOT NULL CHECK (interest_paise >= 0),
  outstanding_before_paise BIGINT NOT NULL CHECK (outstanding_before_paise >= 0),
  outstanding_after_paise BIGINT NOT NULL CHECK (outstanding_after_paise >= 0),
  created_at TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS loans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name CITEXT NOT NULL,
  subcategory_id TEXT NOT NULL,
  principal_amount_paise BIGINT NOT NULL CHECK (principal_amount_paise > 0),
  starting_outstanding_paise BIGINT NOT NULL CHECK (starting_outstanding_paise >= 0),
  start_month TEXT NOT NULL CHECK (start_month ~ '^[0-9][0-9][0-9][0-9]-[0-9][0-9]$'),
  annual_interest_rate_bps BIGINT NOT NULL CHECK (annual_interest_rate_bps >= 0),
  tenure_months BIGINT NOT NULL CHECK (tenure_months > 0),
  monthly_emi_paise BIGINT NOT NULL CHECK (monthly_emi_paise > 0),
  emi_due_day BIGINT,
  is_archived BIGINT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS net_worth_snapshots (
  user_id TEXT NOT NULL,
  month TEXT NOT NULL CHECK (month ~ '^[0-9][0-9][0-9][0-9]-[0-9][0-9]$'),
  liquid_paise BIGINT NOT NULL,
  investments_paise BIGINT NOT NULL,
  liabilities_paise BIGINT NOT NULL,
  net_worth_paise BIGINT NOT NULL,
  captured_at TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  PRIMARY KEY (user_id, month)
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  last_seen_at TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subcategories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type_id TEXT NOT NULL,
  name CITEXT NOT NULL,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  is_system BIGINT NOT NULL DEFAULT 0,
  is_locked BIGINT NOT NULL DEFAULT 0,
  sort_order BIGINT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  UNIQUE(type_id, name)
);

CREATE TABLE IF NOT EXISTS transaction_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_transaction_id TEXT NOT NULL,
  target_transaction_id TEXT NOT NULL,
  link_type TEXT NOT NULL CHECK (link_type IN ('refund', 'reversal', 'duplicate', 'card_payment')),
  amount_paise BIGINT,
  created_at TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS transaction_splits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  subcategory_id TEXT,
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0)
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  batch_id TEXT,
  date TEXT NOT NULL,
  account_id TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('upi', 'credit_card', 'bank_transfer', 'cash', 'other')),
  merchant TEXT,
  note TEXT,
  type_id TEXT,
  subcategory_id TEXT,
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  direction TEXT NOT NULL CHECK (direction IN ('inflow', 'outflow')),
  kind TEXT NOT NULL CHECK (kind IN ('expense', 'income', 'refund', 'transfer', 'card_payment', 'reversal', 'investment', 'emi')),
  status TEXT NOT NULL CHECK (status IN ('categorized', 'uncategorized', 'split')) DEFAULT 'categorized',
  transfer_account_id TEXT,
  linked_transaction_id TEXT,
  created_at TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email CITEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  password_hash TEXT
);

CREATE TABLE IF NOT EXISTS vacation_expenses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  vacation_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS vacations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  budget_paise BIGINT CHECK (budget_paise IS NULL OR budget_paise > 0),
  note TEXT,
  is_archived BIGINT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  user_id TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_accounts_active_name ON accounts(is_archived, name);
CREATE INDEX IF NOT EXISTS idx_accounts_owner ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type);
CREATE INDEX IF NOT EXISTS idx_autopay_payments_owner ON autopay_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_autopay_payments_subscription ON autopay_payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_autopay_payments_transaction ON autopay_payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_autopay_subscriptions_archived ON autopay_subscriptions(is_archived);
CREATE INDEX IF NOT EXISTS idx_autopay_subscriptions_owner ON autopay_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_lines_month ON budget_lines(month);
CREATE INDEX IF NOT EXISTS idx_budget_lines_owner ON budget_lines(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_lines_subcategory_scope ON budget_lines(scope_subcategory_id);
CREATE INDEX IF NOT EXISTS idx_budget_lines_type_scope ON budget_lines(scope_type_id);
CREATE INDEX IF NOT EXISTS idx_category_types_behavior ON category_types(behavior);
CREATE INDEX IF NOT EXISTS idx_category_types_owner ON category_types(user_id);
CREATE INDEX IF NOT EXISTS idx_entry_batches_owner ON entry_batches(user_id);
CREATE INDEX IF NOT EXISTS idx_investment_payments_investment ON investment_payments(investment_id);
CREATE INDEX IF NOT EXISTS idx_investment_payments_owner ON investment_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_investment_payments_transaction ON investment_payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_investments_owner ON investments(user_id);
CREATE INDEX IF NOT EXISTS idx_investments_type ON investments(type);
CREATE INDEX IF NOT EXISTS idx_loan_payments_loan ON loan_payments(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_payments_owner ON loan_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_loan_payments_transaction ON loan_payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_loans_archived ON loans(is_archived);
CREATE INDEX IF NOT EXISTS idx_loans_owner ON loans(user_id);
CREATE INDEX IF NOT EXISTS idx_loans_subcategory ON loans(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_net_worth_snapshots_owner ON net_worth_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_owner ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_subcategories_owner ON subcategories(user_id);
CREATE INDEX IF NOT EXISTS idx_subcategories_type ON subcategories(type_id);
CREATE INDEX IF NOT EXISTS idx_transaction_links_owner ON transaction_links(user_id);
CREATE INDEX IF NOT EXISTS idx_transaction_splits_owner ON transaction_splits(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_batch ON transactions(batch_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_owner ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_subcategory ON transactions(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_transactions_transfer_account ON transactions(transfer_account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type_id);
CREATE INDEX IF NOT EXISTS idx_vacation_expenses_owner ON vacation_expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_vacation_expenses_transaction ON vacation_expenses(transaction_id);
CREATE INDEX IF NOT EXISTS idx_vacation_expenses_vacation ON vacation_expenses(vacation_id);
CREATE INDEX IF NOT EXISTS idx_vacations_archived ON vacations(is_archived);
CREATE INDEX IF NOT EXISTS idx_vacations_owner ON vacations(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounts_id_owner ON accounts(id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_autopay_subscriptions_id_owner ON autopay_subscriptions(id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_category_types_id_owner ON category_types(id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_entry_batches_id_owner ON entry_batches(id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_investments_id_owner ON investments(id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_loans_id_owner ON loans(id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_subcategories_id_owner ON subcategories(id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_id_owner ON transactions(id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vacations_id_owner ON vacations(id, user_id);

ALTER TABLE accounts DROP CONSTRAINT IF EXISTS fk_accounts_0;
ALTER TABLE accounts ADD CONSTRAINT fk_accounts_0 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE autopay_payments DROP CONSTRAINT IF EXISTS fk_autopay_payments_1;
ALTER TABLE autopay_payments ADD CONSTRAINT fk_autopay_payments_1 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE autopay_payments DROP CONSTRAINT IF EXISTS fk_autopay_payments_2;
ALTER TABLE autopay_payments ADD CONSTRAINT fk_autopay_payments_2 FOREIGN KEY (subscription_id, user_id) REFERENCES autopay_subscriptions(id, user_id) ON DELETE CASCADE;
ALTER TABLE autopay_payments DROP CONSTRAINT IF EXISTS fk_autopay_payments_3;
ALTER TABLE autopay_payments ADD CONSTRAINT fk_autopay_payments_3 FOREIGN KEY (transaction_id, user_id) REFERENCES transactions(id, user_id) ON DELETE CASCADE;
ALTER TABLE autopay_subscriptions DROP CONSTRAINT IF EXISTS fk_autopay_subscriptions_4;
ALTER TABLE autopay_subscriptions ADD CONSTRAINT fk_autopay_subscriptions_4 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE budget_lines DROP CONSTRAINT IF EXISTS fk_budget_lines_5;
ALTER TABLE budget_lines ADD CONSTRAINT fk_budget_lines_5 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE budget_lines DROP CONSTRAINT IF EXISTS fk_budget_lines_6;
ALTER TABLE budget_lines ADD CONSTRAINT fk_budget_lines_6 FOREIGN KEY (scope_type_id, user_id) REFERENCES category_types(id, user_id) ON DELETE CASCADE;
ALTER TABLE budget_lines DROP CONSTRAINT IF EXISTS fk_budget_lines_7;
ALTER TABLE budget_lines ADD CONSTRAINT fk_budget_lines_7 FOREIGN KEY (scope_subcategory_id, user_id) REFERENCES subcategories(id, user_id) ON DELETE CASCADE;
ALTER TABLE category_types DROP CONSTRAINT IF EXISTS fk_category_types_8;
ALTER TABLE category_types ADD CONSTRAINT fk_category_types_8 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE entry_batches DROP CONSTRAINT IF EXISTS fk_entry_batches_9;
ALTER TABLE entry_batches ADD CONSTRAINT fk_entry_batches_9 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE investment_payments DROP CONSTRAINT IF EXISTS fk_investment_payments_10;
ALTER TABLE investment_payments ADD CONSTRAINT fk_investment_payments_10 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE investment_payments DROP CONSTRAINT IF EXISTS fk_investment_payments_11;
ALTER TABLE investment_payments ADD CONSTRAINT fk_investment_payments_11 FOREIGN KEY (investment_id, user_id) REFERENCES investments(id, user_id) ON DELETE CASCADE;
ALTER TABLE investment_payments DROP CONSTRAINT IF EXISTS fk_investment_payments_12;
ALTER TABLE investment_payments ADD CONSTRAINT fk_investment_payments_12 FOREIGN KEY (transaction_id, user_id) REFERENCES transactions(id, user_id) ON DELETE CASCADE;
ALTER TABLE investments DROP CONSTRAINT IF EXISTS fk_investments_13;
ALTER TABLE investments ADD CONSTRAINT fk_investments_13 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE loan_payments DROP CONSTRAINT IF EXISTS fk_loan_payments_14;
ALTER TABLE loan_payments ADD CONSTRAINT fk_loan_payments_14 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE loan_payments DROP CONSTRAINT IF EXISTS fk_loan_payments_15;
ALTER TABLE loan_payments ADD CONSTRAINT fk_loan_payments_15 FOREIGN KEY (loan_id, user_id) REFERENCES loans(id, user_id) ON DELETE CASCADE;
ALTER TABLE loan_payments DROP CONSTRAINT IF EXISTS fk_loan_payments_16;
ALTER TABLE loan_payments ADD CONSTRAINT fk_loan_payments_16 FOREIGN KEY (transaction_id, user_id) REFERENCES transactions(id, user_id) ON DELETE CASCADE;
ALTER TABLE loans DROP CONSTRAINT IF EXISTS fk_loans_17;
ALTER TABLE loans ADD CONSTRAINT fk_loans_17 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE loans DROP CONSTRAINT IF EXISTS fk_loans_18;
ALTER TABLE loans ADD CONSTRAINT fk_loans_18 FOREIGN KEY (subcategory_id, user_id) REFERENCES subcategories(id, user_id) ON DELETE RESTRICT;
ALTER TABLE net_worth_snapshots DROP CONSTRAINT IF EXISTS fk_net_worth_snapshots_19;
ALTER TABLE net_worth_snapshots ADD CONSTRAINT fk_net_worth_snapshots_19 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS fk_sessions_20;
ALTER TABLE sessions ADD CONSTRAINT fk_sessions_20 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE subcategories DROP CONSTRAINT IF EXISTS fk_subcategories_21;
ALTER TABLE subcategories ADD CONSTRAINT fk_subcategories_21 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE subcategories DROP CONSTRAINT IF EXISTS fk_subcategories_22;
ALTER TABLE subcategories ADD CONSTRAINT fk_subcategories_22 FOREIGN KEY (type_id, user_id) REFERENCES category_types(id, user_id) ON DELETE CASCADE;
ALTER TABLE transaction_links DROP CONSTRAINT IF EXISTS fk_transaction_links_23;
ALTER TABLE transaction_links ADD CONSTRAINT fk_transaction_links_23 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE transaction_links DROP CONSTRAINT IF EXISTS fk_transaction_links_24;
ALTER TABLE transaction_links ADD CONSTRAINT fk_transaction_links_24 FOREIGN KEY (source_transaction_id, user_id) REFERENCES transactions(id, user_id) ON DELETE CASCADE;
ALTER TABLE transaction_links DROP CONSTRAINT IF EXISTS fk_transaction_links_25;
ALTER TABLE transaction_links ADD CONSTRAINT fk_transaction_links_25 FOREIGN KEY (target_transaction_id, user_id) REFERENCES transactions(id, user_id) ON DELETE CASCADE;
ALTER TABLE transaction_splits DROP CONSTRAINT IF EXISTS fk_transaction_splits_26;
ALTER TABLE transaction_splits ADD CONSTRAINT fk_transaction_splits_26 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE transaction_splits DROP CONSTRAINT IF EXISTS fk_transaction_splits_27;
ALTER TABLE transaction_splits ADD CONSTRAINT fk_transaction_splits_27 FOREIGN KEY (transaction_id, user_id) REFERENCES transactions(id, user_id) ON DELETE CASCADE;
ALTER TABLE transaction_splits DROP CONSTRAINT IF EXISTS fk_transaction_splits_28;
ALTER TABLE transaction_splits ADD CONSTRAINT fk_transaction_splits_28 FOREIGN KEY (subcategory_id, user_id) REFERENCES subcategories(id, user_id) ON DELETE RESTRICT;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS fk_transactions_29;
ALTER TABLE transactions ADD CONSTRAINT fk_transactions_29 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS fk_transactions_30;
ALTER TABLE transactions ADD CONSTRAINT fk_transactions_30 FOREIGN KEY (account_id, user_id) REFERENCES accounts(id, user_id) ON DELETE RESTRICT;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS fk_transactions_31;
ALTER TABLE transactions ADD CONSTRAINT fk_transactions_31 FOREIGN KEY (transfer_account_id, user_id) REFERENCES accounts(id, user_id) ON DELETE RESTRICT;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS fk_transactions_32;
ALTER TABLE transactions ADD CONSTRAINT fk_transactions_32 FOREIGN KEY (batch_id, user_id) REFERENCES entry_batches(id, user_id) ON DELETE SET NULL;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS fk_transactions_33;
ALTER TABLE transactions ADD CONSTRAINT fk_transactions_33 FOREIGN KEY (type_id, user_id) REFERENCES category_types(id, user_id) ON DELETE RESTRICT;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS fk_transactions_34;
ALTER TABLE transactions ADD CONSTRAINT fk_transactions_34 FOREIGN KEY (subcategory_id, user_id) REFERENCES subcategories(id, user_id) ON DELETE RESTRICT;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS fk_transactions_35;
ALTER TABLE transactions ADD CONSTRAINT fk_transactions_35 FOREIGN KEY (linked_transaction_id, user_id) REFERENCES transactions(id, user_id) ON DELETE SET NULL;
ALTER TABLE user_settings DROP CONSTRAINT IF EXISTS fk_user_settings_36;
ALTER TABLE user_settings ADD CONSTRAINT fk_user_settings_36 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE vacation_expenses DROP CONSTRAINT IF EXISTS fk_vacation_expenses_37;
ALTER TABLE vacation_expenses ADD CONSTRAINT fk_vacation_expenses_37 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE vacation_expenses DROP CONSTRAINT IF EXISTS fk_vacation_expenses_38;
ALTER TABLE vacation_expenses ADD CONSTRAINT fk_vacation_expenses_38 FOREIGN KEY (vacation_id, user_id) REFERENCES vacations(id, user_id) ON DELETE CASCADE;
ALTER TABLE vacation_expenses DROP CONSTRAINT IF EXISTS fk_vacation_expenses_39;
ALTER TABLE vacation_expenses ADD CONSTRAINT fk_vacation_expenses_39 FOREIGN KEY (transaction_id, user_id) REFERENCES transactions(id, user_id) ON DELETE CASCADE;
ALTER TABLE vacations DROP CONSTRAINT IF EXISTS fk_vacations_40;
ALTER TABLE vacations ADD CONSTRAINT fk_vacations_40 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Deny by default to anyone who does not bypass row level security.
--
-- The application reaches this database over a Postgres connection as a role that bypasses
-- RLS, so none of this applies to it. What it closes is the REST endpoint a hosted Postgres
-- puts in front of the same tables: its anonymous key is public by design, and with RLS off
-- it could read and write everything here. Measured before this was added -- that key returned
-- the owner's transactions and email over the open internet.
--
-- No policies, deliberately. A policy is a rule for granting access to some rows; there is
-- nobody here who should reach these tables that way at all.
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE autopay_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE autopay_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE net_worth_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vacation_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE vacations ENABLE ROW LEVEL SECURITY;
