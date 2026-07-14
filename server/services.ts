import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import {
  AUTOPAY_SUBCATEGORY_ID,
  INFLOW_BEHAVIORS,
  MUTUAL_FUNDS_SUBCATEGORY_ID,
  SELF_TRANSFER_SUBCATEGORY_ID,
  createAccountSchema,
  createAutopaySubscriptionSchema,
  createBudgetLineSchema,
  createBatchSchema,
  createCategoryTypeSchema,
  createInvestmentSchema,
  createLoanSchema,
  createSubcategorySchema,
  createTransactionSchema,
  updateAccountSchema,
  updateAutopaySubscriptionSchema,
  updateBudgetLineSchema,
  updateInvestmentSchema,
  updateLoanSchema,
  updateProfileSchema,
  updateSettingsSchema,
  updateTransactionSchema,
  INVESTMENT_TYPES,
  type AccountType,
  type BudgetScopeType,
  type CreateAccountInput,
  type CreateAutopaySubscriptionInput,
  type CreateBudgetLineInput,
  type CreateCategoryTypeInput,
  type CreateInvestmentInput,
  type CreateLoanInput,
  type CreateSubcategoryInput,
  type CreateTransactionInput,
  type Direction,
  type InvestmentType,
  type LoanPaymentType,
  type TaxonomyBehavior,
  type TransactionKind,
  type UpdateAccountInput,
  type UpdateAutopaySubscriptionInput,
  type UpdateBudgetLineInput,
  type UpdateInvestmentInput,
  type UpdateLoanInput,
  type UpdateProfileInput,
  type UpdateSettingsInput,
  type UpdateTransactionInput
} from "../shared/finance.ts";
import { asRecord, asRecords, db, transaction } from "./db.ts";
import { ensureBackupDir, pruneBackupFiles } from "./backup-files.ts";

export type AccountRow = {
  id: string;
  name: string;
  type: AccountType;
  starting_balance_paise: number;
  credit_limit_paise: number | null;
  is_archived: number;
  created_at: string;
  updated_at: string;
};

export type AccountSummary = {
  id: string;
  name: string;
  type: AccountType;
  startingBalancePaise: number;
  creditLimitPaise: number | null;
  balancePaise: number;
  outstandingPaise: number;
  availableLimitPaise: number | null;
  isArchived: boolean;
};

export type CategoryRow = {
  id: string;
  name: string;
  icon: string;
  color: string;
  is_system: number;
  is_locked: number;
  sort_order: number;
  created_at: string;
};

export type CategoryTypeRow = {
  id: string;
  name: string;
  behavior: TaxonomyBehavior;
  icon: string;
  color: string;
  is_system: number;
  is_locked: number;
  sort_order: number;
  created_at: string;
};

export type SubcategoryRow = {
  id: string;
  type_id: string;
  name: string;
  icon: string;
  color: string;
  is_system: number;
  is_locked: number;
  sort_order: number;
  created_at: string;
};

export type SubcategorySummary = {
  id: string;
  typeId: string;
  name: string;
  icon: string;
  color: string;
  isSystem: boolean;
  isLocked: boolean;
  sortOrder: number;
};

export type CategoryTypeSummary = {
  id: string;
  name: string;
  behavior: TaxonomyBehavior;
  icon: string;
  color: string;
  isSystem: boolean;
  isLocked: boolean;
  sortOrder: number;
  subcategories: SubcategorySummary[];
};

export type TransactionRow = {
  id: string;
  batch_id: string | null;
  date: string;
  account_id: string;
  method: string;
  merchant: string | null;
  note: string | null;
  category_id: string | null;
  type_id: string | null;
  subcategory_id: string | null;
  amount_paise: number;
  direction: Direction;
  kind: TransactionKind;
  status: "categorized" | "uncategorized" | "split";
  transfer_account_id: string | null;
  linked_transaction_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TransactionSummary = {
  id: string;
  batchId: string | null;
  date: string;
  accountId: string;
  accountName: string;
  accountType: AccountType;
  method: string;
  merchant: string | null;
  note: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  typeId: string | null;
  typeName: string | null;
  typeIcon: string | null;
  typeColor: string | null;
  typeBehavior: TaxonomyBehavior | null;
  subcategoryId: string | null;
  subcategoryName: string | null;
  subcategoryIcon: string | null;
  subcategoryColor: string | null;
  amountPaise: number;
  direction: Direction;
  kind: TransactionKind;
  status: "categorized" | "uncategorized" | "split";
  transferAccountId: string | null;
  transferAccountName: string | null;
  linkedTransactionId: string | null;
  loanId: string | null;
  loanName: string | null;
  loanPaymentType: LoanPaymentType | null;
  loanPrincipalPaise: number | null;
  loanInterestPaise: number | null;
  subscriptionId: string | null;
  subscriptionName: string | null;
  investmentId: string | null;
  investmentName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UserProfile = {
  name: string;
  email: string;
  age: string;
};

export type LoanRow = {
  id: string;
  name: string;
  subcategory_id: string;
  principal_amount_paise: number;
  starting_outstanding_paise: number;
  start_month: string;
  annual_interest_rate_bps: number;
  tenure_months: number;
  monthly_emi_paise: number;
  is_archived: number;
  created_at: string;
  updated_at: string;
};

export type LoanPaymentRow = {
  id: string;
  loan_id: string;
  transaction_id: string;
  payment_type: LoanPaymentType;
  amount_paise: number;
  principal_paise: number;
  interest_paise: number;
  outstanding_before_paise: number;
  outstanding_after_paise: number;
  created_at: string;
  updated_at: string;
};

export type LoanSummary = {
  id: string;
  name: string;
  subcategoryId: string;
  subcategoryName: string;
  subcategoryIcon: string;
  subcategoryColor: string;
  principalAmountPaise: number;
  startingOutstandingPaise: number;
  outstandingPaise: number;
  openingPrincipalPaidPaise: number;
  trackedPrincipalPaidPaise: number;
  principalPaidPaise: number;
  trackedInterestPaidPaise: number;
  interestPaidPaise: number;
  estimatedHistoricalInterestPaidPaise: number;
  estimatedInterestPaidPaise: number;
  startMonth: string;
  annualInterestRateBps: number;
  tenureMonths: number;
  monthlyEmiPaise: number;
  monthsElapsed: number;
  monthsLeft: number | null;
  closureMonth: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

type BudgetLineRow = {
  id: string;
  month: string;
  scope_type: BudgetScopeType;
  scope_id: string;
  amount_paise: number;
  created_at: string;
  updated_at: string;
};

export type BudgetStatus = "safe" | "watch" | "critical" | "over";

export type BudgetScopeSummary = {
  scopeType: BudgetScopeType;
  scopeId: string;
  typeId: string;
  subcategoryId: string | null;
  name: string;
  typeName: string;
  behavior: TaxonomyBehavior;
  icon: string;
  color: string;
};

export type BudgetLineSummary = BudgetScopeSummary & {
  id: string;
  month: string;
  amountPaise: number;
  actualPaise: number;
  remainingPaise: number;
  usedPercent: number;
  expectedPercent: number;
  paceDeltaPercent: number;
  projectedPaise: number;
  status: BudgetStatus;
  statusLabel: string;
  createdAt: string;
  updatedAt: string;
};

export type BudgetPlan = {
  month: string;
  start: string;
  end: string;
  asOfDate: string;
  dayOfMonth: number;
  daysInMonth: number;
  elapsedPercent: number;
  totals: {
    amountPaise: number;
    actualPaise: number;
    remainingPaise: number;
    projectedPaise: number;
    safeCount: number;
    watchCount: number;
    criticalCount: number;
    overCount: number;
    unplannedActualPaise: number;
  };
  lines: BudgetLineSummary[];
  availableScopes: BudgetScopeSummary[];
};

type TransactionQuery = {
  accountId?: string;
  categoryId?: string;
  typeId?: string;
  subcategoryId?: string;
  status?: string;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

type SqlParam = string | number | null;
type BackupMode = "manual" | "auto" | "shutdown";
const BUDGETABLE_BEHAVIORS = new Set<TaxonomyBehavior>(["expense", "loan", "investment", "transfer"]);
const AUTO_BACKUP_INTERVAL_MS = 30 * 60 * 1000;
let autoBackupTimer: ReturnType<typeof setInterval> | undefined;

export function getSettings() {
  const rows = asRecords<{ key: string; value: string }>(
    db.prepare("SELECT key, value FROM settings ORDER BY key").all()
  );

  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export function getProfile(): UserProfile {
  const settings = getSettings();
  return {
    name: settings.profile_name ?? "",
    email: settings.profile_email ?? "",
    age: settings.profile_age ?? ""
  };
}

export function updateAppSettings(input: UpdateSettingsInput) {
  const parsed = updateSettingsSchema.parse(input);
  setSetting("card_utilization_alert_percent", String(parsed.cardUtilizationAlertPercent));
  return getSettings();
}

export function updateProfile(input: UpdateProfileInput): UserProfile {
  const parsed = updateProfileSchema.parse(input);
  const current = getProfile();
  const next = {
    name: parsed.name ?? current.name,
    email: parsed.email ?? current.email,
    age: parsed.age ?? current.age
  };

  transaction(() => {
    setSetting("profile_name", next.name);
    setSetting("profile_email", next.email);
    setSetting("profile_age", next.age);
  });

  return getProfile();
}

export function listLoans(includeArchived = false): LoanSummary[] {
  const rows = asRecords<LoanRow>(
    db
      .prepare(
        `SELECT id, name, subcategory_id, principal_amount_paise, starting_outstanding_paise,
                start_month, annual_interest_rate_bps, tenure_months, monthly_emi_paise,
                is_archived, created_at, updated_at
         FROM loans
         ${includeArchived ? "" : "WHERE is_archived = 0"}
         ORDER BY is_archived ASC, name COLLATE NOCASE ASC`
      )
      .all()
  );

  return rows.map(mapLoan);
}

export function createLoan(input: CreateLoanInput): LoanSummary {
  const parsed = createLoanSchema.parse(input);
  const subcategory = requireLoanSubcategory(parsed.subcategoryId);
  const id = randomUUID();

  db.prepare(
    `INSERT INTO loans
      (id, name, subcategory_id, principal_amount_paise, starting_outstanding_paise,
       start_month, annual_interest_rate_bps, tenure_months, monthly_emi_paise)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    parsed.name,
    subcategory.id,
    parsed.principalAmountPaise,
    parsed.startingOutstandingPaise,
    parsed.startMonth,
    parsed.annualInterestRateBps,
    parsed.tenureMonths,
    parsed.monthlyEmiPaise
  );

  return requireLoanSummary(id);
}

export function updateLoan(id: string, input: UpdateLoanInput): LoanSummary {
  const existing = requireLoanRow(id);
  const patch = updateLoanSchema.parse(input);
  const merged = {
    name: patch.name ?? existing.name,
    subcategoryId: patch.subcategoryId ?? existing.subcategory_id,
    principalAmountPaise: patch.principalAmountPaise ?? existing.principal_amount_paise,
    startingOutstandingPaise: patch.startingOutstandingPaise ?? existing.starting_outstanding_paise,
    startMonth: patch.startMonth ?? existing.start_month,
    annualInterestRateBps: patch.annualInterestRateBps ?? existing.annual_interest_rate_bps,
    tenureMonths: patch.tenureMonths ?? existing.tenure_months,
    monthlyEmiPaise: patch.monthlyEmiPaise ?? existing.monthly_emi_paise,
    isArchived: patch.isArchived ?? Boolean(existing.is_archived)
  };

  const parsed = createLoanSchema.parse({
    name: merged.name,
    subcategoryId: merged.subcategoryId,
    principalAmountPaise: merged.principalAmountPaise,
    startingOutstandingPaise: merged.startingOutstandingPaise,
    startMonth: merged.startMonth,
    annualInterestRateBps: merged.annualInterestRateBps,
    tenureMonths: merged.tenureMonths,
    monthlyEmiPaise: merged.monthlyEmiPaise
  });
  requireLoanSubcategory(parsed.subcategoryId);

  transaction(() => {
    db.prepare(
      `UPDATE loans
       SET name = ?, subcategory_id = ?, principal_amount_paise = ?, starting_outstanding_paise = ?,
           start_month = ?, annual_interest_rate_bps = ?, tenure_months = ?, monthly_emi_paise = ?,
           is_archived = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(
      parsed.name,
      parsed.subcategoryId,
      parsed.principalAmountPaise,
      parsed.startingOutstandingPaise,
      parsed.startMonth,
      parsed.annualInterestRateBps,
      parsed.tenureMonths,
      parsed.monthlyEmiPaise,
      merged.isArchived ? 1 : 0,
      id
    );

    if (parsed.subcategoryId !== existing.subcategory_id) {
      db.prepare(
        `UPDATE transactions
         SET subcategory_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id IN (SELECT transaction_id FROM loan_payments WHERE loan_id = ?)`
      ).run(parsed.subcategoryId, id);
    }

    refreshLoanPayments(id);
  });
  return requireLoanSummary(id);
}

export function archiveLoan(id: string) {
  requireLoanRow(id);
  db.prepare("UPDATE loans SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  return { ok: true, mode: "archived" as const };
}

export type AutopaySubscriptionRow = {
  id: string;
  name: string;
  amount_paise: number;
  start_date: string;
  duration_months: number;
  is_archived: number;
  created_at: string;
  updated_at: string;
};

export type AutopaySubscriptionSummary = {
  id: string;
  name: string;
  amountPaise: number;
  startDate: string;
  durationMonths: number;
  expiryDate: string;
  paymentCount: number;
  status: "active" | "expired";
  isArchived: boolean;
};

export function listAutopaySubscriptions(includeArchived = false): AutopaySubscriptionSummary[] {
  const rows = asRecords<AutopaySubscriptionRow>(
    db
      .prepare(
        `SELECT id, name, amount_paise, start_date, duration_months, is_archived, created_at, updated_at
         FROM autopay_subscriptions
         ${includeArchived ? "" : "WHERE is_archived = 0"}
         ORDER BY is_archived ASC, name COLLATE NOCASE ASC`
      )
      .all()
  );

  return rows.map(mapAutopaySubscription);
}

export function createAutopaySubscription(input: CreateAutopaySubscriptionInput): AutopaySubscriptionSummary {
  const parsed = createAutopaySubscriptionSchema.parse(input);
  const id = randomUUID();

  db.prepare(
    `INSERT INTO autopay_subscriptions
      (id, name, amount_paise, start_date, duration_months)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, parsed.name, parsed.amountPaise, parsed.startDate, parsed.durationMonths);

  return requireAutopaySummary(id);
}

export function updateAutopaySubscription(
  id: string,
  input: UpdateAutopaySubscriptionInput
): AutopaySubscriptionSummary {
  const existing = requireAutopayRow(id);
  const patch = updateAutopaySubscriptionSchema.parse(input);
  const merged = {
    name: patch.name ?? existing.name,
    amountPaise: patch.amountPaise ?? existing.amount_paise,
    startDate: patch.startDate ?? existing.start_date,
    durationMonths: patch.durationMonths ?? existing.duration_months,
    isArchived: patch.isArchived ?? Boolean(existing.is_archived)
  };

  createAutopaySubscriptionSchema.parse({
    name: merged.name,
    amountPaise: merged.amountPaise,
    startDate: merged.startDate,
    durationMonths: merged.durationMonths
  });

  db.prepare(
    `UPDATE autopay_subscriptions
     SET name = ?, amount_paise = ?, start_date = ?, duration_months = ?,
         is_archived = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(
    merged.name,
    merged.amountPaise,
    merged.startDate,
    merged.durationMonths,
    merged.isArchived ? 1 : 0,
    id
  );

  return requireAutopaySummary(id);
}

export function archiveAutopaySubscription(id: string) {
  requireAutopayRow(id);
  db.prepare(
    "UPDATE autopay_subscriptions SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(id);
  return { ok: true, mode: "archived" as const };
}

type InvestmentRow = {
  id: string;
  type: InvestmentType;
  name: string;
  invested_paise: number;
  current_value_paise: number;
  shares: number | null;
  purchase_date: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type InvestmentSummary = {
  id: string;
  type: InvestmentType;
  typeLabel: string;
  icon: string;
  color: string;
  name: string;
  investedPaise: number;
  currentValuePaise: number;
  gainPaise: number;
  gainPercent: number;
  shares: number | null;
  purchaseDate: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export function listInvestments(): InvestmentSummary[] {
  const rows = asRecords<InvestmentRow>(
    db
      .prepare(
        `SELECT id, type, name, invested_paise, current_value_paise, shares, purchase_date, note, created_at, updated_at
         FROM investments
         ORDER BY created_at, id`
      )
      .all()
  );
  return rows.map(mapInvestment);
}

export function createInvestment(input: CreateInvestmentInput): InvestmentSummary {
  const parsed = createInvestmentSchema.parse(input);
  const id = randomUUID();
  db.prepare(
    `INSERT INTO investments (id, type, name, invested_paise, current_value_paise, shares, purchase_date, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    parsed.type,
    parsed.name,
    parsed.investedPaise,
    parsed.currentValuePaise,
    parsed.shares ?? null,
    parsed.purchaseDate ?? null,
    parsed.note ?? null
  );
  return requireInvestmentSummary(id);
}

export function updateInvestment(id: string, input: UpdateInvestmentInput): InvestmentSummary {
  const existing = requireInvestmentRow(id);
  const patch = updateInvestmentSchema.parse(input);
  const merged = {
    type: patch.type ?? existing.type,
    name: patch.name ?? existing.name,
    investedPaise: patch.investedPaise ?? existing.invested_paise,
    currentValuePaise: patch.currentValuePaise ?? existing.current_value_paise,
    shares: Object.prototype.hasOwnProperty.call(patch, "shares") ? patch.shares ?? null : existing.shares,
    purchaseDate: Object.prototype.hasOwnProperty.call(patch, "purchaseDate")
      ? patch.purchaseDate ?? null
      : existing.purchase_date,
    note: Object.prototype.hasOwnProperty.call(patch, "note") ? patch.note ?? null : existing.note
  };
  db.prepare(
    `UPDATE investments
     SET type = ?, name = ?, invested_paise = ?, current_value_paise = ?, shares = ?, purchase_date = ?, note = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(
    merged.type,
    merged.name,
    merged.investedPaise,
    merged.currentValuePaise,
    merged.shares,
    merged.purchaseDate,
    merged.note,
    id
  );
  return requireInvestmentSummary(id);
}

export function deleteInvestment(id: string) {
  const result = db.prepare("DELETE FROM investments WHERE id = ?").run(id);
  if (result.changes === 0) {
    throw notFound("Investment not found.");
  }
  return { ok: true };
}

function requireInvestmentRow(id: string) {
  const row = asRecord<InvestmentRow | undefined>(
    db
      .prepare(
        `SELECT id, type, name, invested_paise, current_value_paise, shares, purchase_date, note, created_at, updated_at
         FROM investments
         WHERE id = ?`
      )
      .get(id)
  );
  if (!row) {
    throw notFound("Investment not found.");
  }
  return row;
}

function requireInvestmentSummary(id: string) {
  return mapInvestment(requireInvestmentRow(id));
}

function mapInvestment(row: InvestmentRow): InvestmentSummary {
  const meta = INVESTMENT_TYPES.find((type) => type.id === row.type) ?? INVESTMENT_TYPES[INVESTMENT_TYPES.length - 1];
  const gainPaise = row.current_value_paise - row.invested_paise;
  const gainPercent = row.invested_paise > 0 ? Math.round((gainPaise / row.invested_paise) * 100) : 0;
  return {
    id: row.id,
    type: row.type,
    typeLabel: meta.label,
    icon: meta.icon,
    color: meta.color,
    name: row.name,
    investedPaise: row.invested_paise,
    currentValuePaise: row.current_value_paise,
    gainPaise,
    gainPercent,
    shares: row.shares,
    purchaseDate: row.purchase_date,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function getBackupStatus() {
  const settings = getSettings();
  return {
    intervalMs: AUTO_BACKUP_INTERVAL_MS,
    lastBackupAt: settings.last_backup_at ?? null,
    lastBackupPath: settings.last_backup_path ?? null,
    lastBackupMode: settings.last_backup_mode ?? null
  };
}

export function startAutoBackup(logger?: { info: (value: unknown, message?: string) => void; error: (value: unknown, message?: string) => void }) {
  if (autoBackupTimer) {
    return;
  }

  autoBackupTimer = setInterval(() => {
    try {
      const result = createBackup("auto");
      logger?.info(result, "Automatic finance backup completed");
    } catch (error) {
      logger?.error(error, "Automatic finance backup failed");
    }
  }, AUTO_BACKUP_INTERVAL_MS);

  autoBackupTimer.unref?.();
}

export function stopAutoBackup() {
  if (!autoBackupTimer) {
    return;
  }

  clearInterval(autoBackupTimer);
  autoBackupTimer = undefined;
}

export function listCategoryTypes(): CategoryTypeSummary[] {
  const typeRows = asRecords<CategoryTypeRow>(
    db
      .prepare(
        `SELECT id, name, behavior, icon, color, is_system, is_locked, sort_order, created_at
         FROM category_types
         ORDER BY sort_order, name`
      )
      .all()
  );
  const subcategoryRows = asRecords<SubcategoryRow>(
    db
      .prepare(
        `SELECT id, type_id, name, icon, color, is_system, is_locked, sort_order, created_at
         FROM subcategories
         ORDER BY sort_order, name`
      )
      .all()
  );
  const grouped = new Map<string, SubcategorySummary[]>();

  for (const row of subcategoryRows) {
    const items = grouped.get(row.type_id) ?? [];
    items.push(mapSubcategory(row));
    grouped.set(row.type_id, items);
  }

  return typeRows.map((row) => ({
    ...mapCategoryType(row),
    subcategories: grouped.get(row.id) ?? []
  }));
}

export function createCategoryType(input: CreateCategoryTypeInput) {
  const parsed = createCategoryTypeSchema.parse(input);
  const duplicate = getCategoryTypeByName(parsed.name);

  if (duplicate) {
    throw badRequest("A Type with this name already exists.");
  }

  const maxSort = asRecord<{ max_sort: number | null }>(
    db.prepare("SELECT MAX(sort_order) AS max_sort FROM category_types").get()
  );
  const id = randomUUID();

  db.prepare(
    `INSERT INTO category_types
      (id, name, behavior, icon, color, is_system, is_locked, sort_order)
     VALUES (?, ?, ?, ?, ?, 0, 0, ?)`
  ).run(id, parsed.name, parsed.behavior, parsed.icon, parsed.color, (maxSort.max_sort ?? 0) + 1);

  return getCategoryType(id);
}

export function createSubcategory(input: CreateSubcategoryInput) {
  const parsed = createSubcategorySchema.parse(input);
  const type = requireCategoryType(parsed.typeId);

  if (type.behavior === "card_payment") {
    throw badRequest("Credit Card Payment SubTypes come from active credit-card accounts.");
  }

  const duplicate = getSubcategoryByName(parsed.typeId, parsed.name);
  if (duplicate) {
    throw badRequest("A SubType with this name already exists under this Type.");
  }

  const maxSort = asRecord<{ max_sort: number | null }>(
    db.prepare("SELECT MAX(sort_order) AS max_sort FROM subcategories WHERE type_id = ?").get(parsed.typeId)
  );
  const id = randomUUID();

  db.prepare(
    `INSERT INTO subcategories
      (id, type_id, name, icon, color, is_system, is_locked, sort_order)
     VALUES (?, ?, ?, ?, ?, 0, 0, ?)`
  ).run(id, parsed.typeId, parsed.name, parsed.icon, parsed.color, (maxSort.max_sort ?? 0) + 1);

  return getSubcategory(id);
}

export function deleteCategoryType(id: string) {
  const categoryType = getCategoryTypeRow(id);
  if (!categoryType) {
    throw notFound("Type not found.");
  }
  if (categoryType.is_locked) {
    throw badRequest("This Type is locked and cannot be deleted.");
  }
  const loanUsage = asRecord<{ count: number }>(
    db.prepare(
      `SELECT COUNT(*) AS count
       FROM loans
       WHERE subcategory_id IN (SELECT id FROM subcategories WHERE type_id = ?)`
    ).get(id)
  );
  if (loanUsage.count > 0) {
    throw badRequest("This Type is used by a loan. Archive or reclassify the loan before deleting it.");
  }

  transaction(() => {
    db.prepare(
      `UPDATE transactions
       SET type_id = NULL,
           subcategory_id = NULL,
           status = CASE WHEN status = 'split' THEN status ELSE 'uncategorized' END,
           updated_at = CURRENT_TIMESTAMP
       WHERE type_id = ?`
    ).run(id);

    db.prepare(
      `UPDATE transaction_splits
       SET subcategory_id = NULL
       WHERE subcategory_id IN (SELECT id FROM subcategories WHERE type_id = ?)`
    ).run(id);

    db.prepare(
      `DELETE FROM budget_lines
       WHERE (scope_type = 'type' AND scope_id = ?)
          OR (scope_type = 'subcategory' AND scope_id IN (SELECT id FROM subcategories WHERE type_id = ?))`
    ).run(id, id);

    db.prepare("DELETE FROM category_types WHERE id = ?").run(id);
  });

  return { ok: true };
}

export function deleteSubcategory(id: string) {
  const subcategory = getSubcategoryRow(id);
  if (!subcategory) {
    throw notFound("SubType not found.");
  }
  if (subcategory.is_locked) {
    throw badRequest("This SubType is locked and cannot be deleted.");
  }
  const loanUsage = asRecord<{ count: number }>(
    db.prepare("SELECT COUNT(*) AS count FROM loans WHERE subcategory_id = ?").get(id)
  );
  if (loanUsage.count > 0) {
    throw badRequest("This SubType is used by a loan. Archive or reclassify the loan before deleting it.");
  }

  transaction(() => {
    db.prepare(
      `UPDATE transactions
       SET subcategory_id = NULL,
           status = CASE WHEN status = 'split' THEN status ELSE 'uncategorized' END,
           updated_at = CURRENT_TIMESTAMP
       WHERE subcategory_id = ?`
    ).run(id);
    db.prepare("UPDATE transaction_splits SET subcategory_id = NULL WHERE subcategory_id = ?").run(id);
    db.prepare("DELETE FROM budget_lines WHERE scope_type = 'subcategory' AND scope_id = ?").run(id);
    db.prepare("DELETE FROM subcategories WHERE id = ?").run(id);
  });

  return { ok: true };
}

export function listAccounts(): AccountSummary[] {
  const rows = asRecords<AccountRow>(
    db
      .prepare(
        `SELECT id, name, type, starting_balance_paise, credit_limit_paise,
                is_archived, created_at, updated_at
         FROM accounts
         ORDER BY is_archived, type, name`
      )
      .all()
  );

  return rows.map(mapAccountWithBalance);
}

export function createAccount(input: CreateAccountInput) {
  const parsed = createAccountSchema.parse(input);
  const activeDuplicate = getActiveAccountByName(parsed.name);

  if (activeDuplicate) {
    throw badRequest("An active account or card with this name already exists.");
  }

  const id = randomUUID();

  db.prepare(
    `INSERT INTO accounts
      (id, name, type, starting_balance_paise, credit_limit_paise)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    id,
    parsed.name,
    parsed.type,
    parsed.startingBalancePaise,
    parsed.type === "credit_card" ? parsed.creditLimitPaise ?? 0 : null
  );

  return getAccount(id);
}

export function updateAccount(id: string, input: UpdateAccountInput) {
  const existing = getAccountRow(id);
  if (!existing) {
    throw notFound("Account not found.");
  }

  const parsed = updateAccountSchema.parse(input);
  const name = parsed.name ?? existing.name;
  const creditLimit =
    existing.type === "credit_card"
      ? parsed.creditLimitPaise ?? existing.credit_limit_paise ?? 0
      : null;
  const isArchived =
    parsed.isArchived === undefined ? existing.is_archived : parsed.isArchived ? 1 : 0;

  if (isArchived === 0) {
    const activeDuplicate = getActiveAccountByName(name, id);
    if (activeDuplicate) {
      throw badRequest("An active account or card with this name already exists.");
    }
  }

  db.prepare(
    `UPDATE accounts
     SET name = ?, credit_limit_paise = ?, is_archived = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(name, creditLimit, isArchived, id);

  return getAccount(id);
}

export function deleteAccount(id: string) {
  const account = getAccountRow(id);
  if (!account) {
    throw notFound("Account not found.");
  }

  const usage = asRecord<{ count: number }>(
    db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM transactions
         WHERE account_id = ? OR transfer_account_id = ?`
      )
      .get(id, id)
  );

  if (usage.count === 0) {
    db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
    return { ok: true, mode: "deleted" };
  }

  db.prepare(
    `UPDATE accounts
     SET is_archived = 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(id);

  return { ok: true, mode: "hidden" };
}

export function getCurrentBatch(weekStart: string, weekEnd: string) {
  const existing = asRecord<{ id: string } | undefined>(
    db
      .prepare(
        `SELECT id FROM entry_batches
         WHERE week_start = ? AND week_end = ? AND status = 'draft'
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(weekStart, weekEnd)
  );

  if (existing) {
    return getBatch(existing.id);
  }

  const parsed = createBatchSchema.parse({ weekStart, weekEnd, status: "draft" });
  const id = randomUUID();
  db.prepare(
    `INSERT INTO entry_batches (id, week_start, week_end, status)
     VALUES (?, ?, ?, ?)`
  ).run(id, parsed.weekStart, parsed.weekEnd, parsed.status);

  return getBatch(id);
}

export function saveBatch(id: string) {
  const result = db
    .prepare(
      `UPDATE entry_batches
       SET status = 'saved', saved_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .run(id);

  if (result.changes === 0) {
    throw notFound("Batch not found.");
  }

  return getBatch(id);
}

export function listTransactions(query: TransactionQuery = {}): TransactionSummary[] {
  const filters: string[] = [];
  const params: SqlParam[] = [];

  if (query.accountId) {
    filters.push("t.account_id = ?");
    params.push(query.accountId);
  }
  if (query.categoryId) {
    filters.push(
      `(t.subcategory_id = ? OR t.category_id = ? OR EXISTS (
        SELECT 1 FROM transaction_splits s
        WHERE s.transaction_id = t.id AND (s.subcategory_id = ? OR s.category_id = ?)
      ))`
    );
    params.push(query.categoryId, query.categoryId, query.categoryId, query.categoryId);
  }
  if (query.typeId) {
    filters.push(
      `(t.type_id = ? OR EXISTS (
        SELECT 1 FROM transaction_splits s
        JOIN subcategories ss ON ss.id = s.subcategory_id
        WHERE s.transaction_id = t.id AND ss.type_id = ?
      ))`
    );
    params.push(query.typeId, query.typeId);
  }
  if (query.subcategoryId) {
    filters.push(
      `(t.subcategory_id = ? OR EXISTS (
        SELECT 1 FROM transaction_splits s
        WHERE s.transaction_id = t.id AND s.subcategory_id = ?
      ))`
    );
    params.push(query.subcategoryId, query.subcategoryId);
  }
  if (query.status) {
    filters.push("t.status = ?");
    params.push(query.status);
  }
  if (query.from) {
    filters.push("t.date >= ?");
    params.push(query.from);
  }
  if (query.to) {
    filters.push("t.date <= ?");
    params.push(query.to);
  }
  if (query.search) {
    filters.push("(t.merchant LIKE ? OR t.note LIKE ?)");
    params.push(`%${query.search}%`, `%${query.search}%`);
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const requestedLimit = Number.isFinite(query.limit) ? Math.trunc(query.limit as number) : 200;
  const requestedOffset = Number.isFinite(query.offset) ? Math.trunc(query.offset as number) : 0;
  const limit = Math.min(Math.max(requestedLimit, 1), 500);
  const offset = Math.min(Math.max(requestedOffset, 0), 100_000);

  const rows = asRecords<TransactionRow & JoinedFields>(
    db
      .prepare(
        `SELECT ${transactionSelectFields}
         FROM transactions t
         JOIN accounts a ON a.id = t.account_id
         LEFT JOIN categories c ON c.id = t.category_id
         LEFT JOIN category_types ct ON ct.id = t.type_id
         LEFT JOIN subcategories sc ON sc.id = t.subcategory_id
         LEFT JOIN accounts ta ON ta.id = t.transfer_account_id
         LEFT JOIN loan_payments lp ON lp.transaction_id = t.id
         LEFT JOIN loans l ON l.id = lp.loan_id
         LEFT JOIN autopay_payments ap ON ap.transaction_id = t.id
         LEFT JOIN autopay_subscriptions s ON s.id = ap.subscription_id
         LEFT JOIN investment_payments ip ON ip.transaction_id = t.id
         LEFT JOIN investments iv ON iv.id = ip.investment_id
${where}
         ORDER BY t.date DESC, t.created_at DESC
         LIMIT ${limit} OFFSET ${offset}`
      )
      .all(...params)
  );

  return rows.map(mapTransaction);
}

export function getTransaction(id: string) {
  const row = asRecord<(TransactionRow & JoinedFields) | undefined>(
    db
      .prepare(
        `SELECT ${transactionSelectFields}
         FROM transactions t
         JOIN accounts a ON a.id = t.account_id
         LEFT JOIN categories c ON c.id = t.category_id
         LEFT JOIN category_types ct ON ct.id = t.type_id
         LEFT JOIN subcategories sc ON sc.id = t.subcategory_id
         LEFT JOIN accounts ta ON ta.id = t.transfer_account_id
         LEFT JOIN loan_payments lp ON lp.transaction_id = t.id
         LEFT JOIN loans l ON l.id = lp.loan_id
         LEFT JOIN autopay_payments ap ON ap.transaction_id = t.id
         LEFT JOIN autopay_subscriptions s ON s.id = ap.subscription_id
         LEFT JOIN investment_payments ip ON ip.transaction_id = t.id
         LEFT JOIN investments iv ON iv.id = ip.investment_id
WHERE t.id = ?`
      )
      .get(id)
  );

  return row ? mapTransaction(row) : null;
}

export function createTransaction(input: CreateTransactionInput) {
  const parsed = createTransactionSchema.parse(input);
  let id = "";
  transaction(() => {
    id = insertValidatedTransaction(parsed);
  });

  return {
    transaction: getTransaction(id),
    duplicateCandidates: findDuplicateCandidates({
      id,
      accountId: parsed.accountId,
      date: parsed.date,
      amountPaise: parsed.amountPaise,
      direction: parsed.direction
    })
  };
}

function insertValidatedTransaction(parsed: CreateTransactionInput) {
  const account = requireAccount(parsed.accountId);
  const taxonomy = resolveTransactionTaxonomy(parsed);

  validateTransactionAgainstAccounts(parsed, account);

  const id = randomUUID();
  const status = parsed.splits?.length
    ? "split"
    : !taxonomy.typeId || (!taxonomy.subcategoryId && parsed.kind !== "card_payment")
      ? "uncategorized"
      : "categorized";

  db.prepare(
      `INSERT INTO transactions
        (id, batch_id, date, account_id, method, merchant, note, category_id,
         type_id, subcategory_id, amount_paise, direction, kind, status,
         transfer_account_id, linked_transaction_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
      id,
      parsed.batchId ?? null,
      parsed.date,
      parsed.accountId,
      parsed.method,
      parsed.merchant ?? null,
      parsed.note ?? null,
      taxonomy.legacyCategoryId,
      taxonomy.typeId,
      taxonomy.subcategoryId,
      parsed.amountPaise,
      parsed.direction,
      parsed.kind,
      status,
      parsed.transferAccountId ?? null,
      parsed.linkedTransactionId ?? null
  );

  if (parsed.splits?.length) {
    insertSplits(id, parsed.splits);
  }

  if (parsed.linkedTransactionId && (parsed.kind === "refund" || parsed.kind === "reversal")) {
    db.prepare(
      `INSERT INTO transaction_links
        (id, source_transaction_id, target_transaction_id, link_type, amount_paise)
       VALUES (?, ?, ?, ?, ?)`
    ).run(randomUUID(), id, parsed.linkedTransactionId, parsed.kind, parsed.amountPaise);
  }

  syncLoanPaymentForTransaction(id, parsed);
  if (parsed.loanId) {
    refreshLoanPayments(parsed.loanId);
  }

  syncAutopayPaymentForTransaction(id, parsed);
  syncInvestmentPaymentForTransaction(id, parsed);

  return id;
}

export function updateTransaction(id: string, input: UpdateTransactionInput) {
  const existing = getTransactionRow(id);
  if (!existing) {
    throw notFound("Transaction not found.");
  }
  const existingLoanPayment = getLoanPaymentForTransaction(id);
  const existingAutopayPayment = getAutopayPaymentForTransaction(id);
  const existingInvestmentPayment = getInvestmentPaymentForTransaction(id);
  const existingSplits = getTransactionSplits(id);
  const patch = updateTransactionSchema.parse(input);
  if (Object.prototype.hasOwnProperty.call(patch, "loanId") && !patch.loanId) {
    patch.loanPaymentType = undefined;
  }

  const mergedInput: Record<string, unknown> = {
    batchId: existing.batch_id ?? undefined,
    date: existing.date,
    accountId: existing.account_id,
    method: existing.method,
    merchant: existing.merchant ?? undefined,
    note: existing.note ?? undefined,
    categoryId: existing.category_id ?? undefined,
    typeId: existing.type_id ?? undefined,
    subcategoryId: existing.subcategory_id ?? undefined,
    amountPaise: existing.amount_paise,
    direction: existing.direction,
    kind: existing.kind,
    transferAccountId: existing.transfer_account_id ?? undefined,
    linkedTransactionId: existing.linked_transaction_id ?? undefined,
    loanId: existingLoanPayment?.loan_id ?? undefined,
    loanPaymentType: existingLoanPayment?.payment_type ?? undefined,
    subscriptionId: existingAutopayPayment?.subscription_id ?? undefined,
    investmentId: existingInvestmentPayment?.investment_id ?? undefined,
    splits: existingSplits.length ? existingSplits : undefined
  };
  Object.assign(mergedInput, patch);
  if (mergedInput.subcategoryId !== AUTOPAY_SUBCATEGORY_ID) {
    mergedInput.subscriptionId = undefined;
  }
  if (mergedInput.subcategoryId !== MUTUAL_FUNDS_SUBCATEGORY_ID) {
    mergedInput.investmentId = undefined;
  }
  const merged = createTransactionSchema.parse(mergedInput);
  if (merged.kind !== "emi") {
    merged.loanId = undefined;
    merged.loanPaymentType = undefined;
  }

  const account = requireAccount(merged.accountId);
  const taxonomy = resolveTransactionTaxonomy(merged);
  validateTransactionAgainstAccounts(merged, account);

  const status = merged.splits?.length
    ? "split"
    : !taxonomy.typeId || (!taxonomy.subcategoryId && merged.kind !== "card_payment")
      ? "uncategorized"
      : "categorized";

  transaction(() => {
    db.prepare(
      `UPDATE transactions
       SET batch_id = ?, date = ?, account_id = ?, method = ?, merchant = ?, note = ?,
           category_id = ?, type_id = ?, subcategory_id = ?,
           amount_paise = ?, direction = ?, kind = ?, status = ?,
           transfer_account_id = ?, linked_transaction_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(
      merged.batchId ?? null,
      merged.date,
      merged.accountId,
      merged.method,
      merged.merchant ?? null,
      merged.note ?? null,
      taxonomy.legacyCategoryId,
      taxonomy.typeId,
      taxonomy.subcategoryId,
      merged.amountPaise,
      merged.direction,
      merged.kind,
      status,
      merged.transferAccountId ?? null,
      merged.linkedTransactionId ?? null,
      id
    );

    db.prepare("DELETE FROM transaction_splits WHERE transaction_id = ?").run(id);
    if (merged.splits?.length) {
      insertSplits(id, merged.splits);
    }

    db.prepare("DELETE FROM loan_payments WHERE transaction_id = ?").run(id);
    syncLoanPaymentForTransaction(id, merged);
    const nextLoanId = merged.loanId;
    const loanIdsToRefresh = new Set([existingLoanPayment?.loan_id, nextLoanId].filter(Boolean));
    for (const loanId of loanIdsToRefresh) {
      refreshLoanPayments(loanId as string);
    }

    db.prepare("DELETE FROM autopay_payments WHERE transaction_id = ?").run(id);
    syncAutopayPaymentForTransaction(id, merged, existingAutopayPayment?.subscription_id);

    db.prepare("DELETE FROM investment_payments WHERE transaction_id = ?").run(id);
    syncInvestmentPaymentForTransaction(id, merged);
  });

  return {
    transaction: getTransaction(id),
    duplicateCandidates: findDuplicateCandidates({
      id,
      accountId: merged.accountId,
      date: merged.date,
      amountPaise: merged.amountPaise,
      direction: merged.direction
    })
  };
}

export function deleteTransaction(id: string) {
  const loanPayment = getLoanPaymentForTransaction(id);
  const result = db.prepare("DELETE FROM transactions WHERE id = ?").run(id);
  if (result.changes === 0) {
    throw notFound("Transaction not found.");
  }
  if (loanPayment) {
    refreshLoanPayments(loanPayment.loan_id);
  }
  return { ok: true };
}

export function getOverview(accountId?: string, month = currentMonth()) {
  const accounts = listAccounts().filter((account) => !account.isArchived);
  const scopedAccounts = accountId
    ? accounts.filter((account) => account.id === accountId)
    : accounts;
  const monthly = getMonthlyReport(accountId, month);
  const uncategorized = asRecord<{ count: number }>(
    db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM transactions
         WHERE status = 'uncategorized' ${accountId ? "AND account_id = ?" : ""}`
      )
      .get(...(accountId ? [accountId] : []))
  );

  return {
    month,
    accounts: scopedAccounts,
    summary: {
      availableCashPaise: scopedAccounts
        .filter((account) => account.type === "bank" || account.type === "food_card")
        .reduce((sum, account) => sum + account.balancePaise, 0),
      creditOutstandingPaise: scopedAccounts
        .filter((account) => account.type === "credit_card")
        .reduce((sum, account) => sum + account.outstandingPaise, 0),
      totalSpendingPaise: monthly.totalSpendingPaise,
      totalOutflowPaise: monthly.totalOutflowPaise,
      incomePaise: monthly.incomePaise,
      uncategorizedCount: uncategorized.count
    },
    recentTransactions: listTransactions({ accountId, limit: 5 }),
    categoryReport: monthly.categories.slice(0, 6)
  };
}

export type WealthAllocationSegment = {
  key: string;
  label: string;
  color: string;
  valuePaise: number;
};

export type WealthSummary = {
  netWorth: {
    liquidPaise: number;
    investmentsPaise: number;
    liabilitiesPaise: number;
    netWorthPaise: number;
  };
  history: Array<{ month: string; netWorthPaise: number }>;
  allocation: WealthAllocationSegment[];
  cashflow: {
    incomePaise: number;
    expensePaise: number;
    savedPaise: number;
    savingsRatePercent: number;
  };
  runwayMonths: number | null;
};

function computeNetWorthNow() {
  const accounts = listAccounts().filter((account) => !account.isArchived);
  const liquidPaise = accounts
    .filter((account) => account.type === "bank" || account.type === "food_card")
    .reduce((sum, account) => sum + account.balancePaise, 0);
  const creditPaise = accounts
    .filter((account) => account.type === "credit_card")
    .reduce((sum, account) => sum + account.outstandingPaise, 0);
  const investmentsPaise = listInvestments().reduce((sum, item) => sum + item.currentValuePaise, 0);
  const loanPaise = listLoans(false).reduce((sum, loan) => sum + loan.outstandingPaise, 0);
  const liabilitiesPaise = creditPaise + loanPaise;
  return {
    liquidPaise,
    investmentsPaise,
    liabilitiesPaise,
    netWorthPaise: liquidPaise + investmentsPaise - liabilitiesPaise
  };
}

export function getWealthSummary(): WealthSummary {
  const month = currentMonth();
  const netWorth = computeNetWorthNow();

  // Freeze this month's snapshot so a net-worth history builds over time.
  db.prepare(
    `INSERT INTO net_worth_snapshots (month, liquid_paise, investments_paise, liabilities_paise, net_worth_paise)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(month) DO UPDATE SET
       liquid_paise = excluded.liquid_paise,
       investments_paise = excluded.investments_paise,
       liabilities_paise = excluded.liabilities_paise,
       net_worth_paise = excluded.net_worth_paise,
       captured_at = CURRENT_TIMESTAMP`
  ).run(month, netWorth.liquidPaise, netWorth.investmentsPaise, netWorth.liabilitiesPaise, netWorth.netWorthPaise);

  const history = asRecords<{ month: string; net_worth_paise: number }>(
    db
      .prepare("SELECT month, net_worth_paise FROM net_worth_snapshots ORDER BY month ASC")
      .all()
  ).map((row) => ({ month: row.month, netWorthPaise: row.net_worth_paise }));

  // Asset allocation — where the wealth currently sits (positive holdings only).
  const investments = listInvestments();
  const byType = (types: string[]) =>
    investments.filter((item) => types.includes(item.type)).reduce((sum, item) => sum + item.currentValuePaise, 0);
  const allocation: WealthAllocationSegment[] = [
    { key: "cash", label: "Cash", color: "#0284c7", valuePaise: netWorth.liquidPaise },
    { key: "equity", label: "Equity (stocks + MF)", color: "#4f46e5", valuePaise: byType(["stocks", "mutual_funds"]) },
    { key: "gold", label: "Gold", color: "#d97706", valuePaise: byType(["gold"]) },
    { key: "realestate", label: "Real estate", color: "#0f766e", valuePaise: byType(["land", "property"]) },
    { key: "pf", label: "PF", color: "#059669", valuePaise: byType(["pf"]) },
    { key: "other", label: "Other", color: "#64748b", valuePaise: byType(["other"]) }
  ].filter((segment) => segment.valuePaise > 0);

  // Cashflow this month.
  const monthReport = getMonthlyReport(undefined, month);
  const incomePaise = monthReport.incomePaise;
  const expensePaise = monthReport.totalOutflowPaise;
  const savedPaise = incomePaise - expensePaise;
  const savingsRatePercent = incomePaise > 0 ? Math.round((savedPaise / incomePaise) * 100) : 0;

  // Emergency-fund runway = liquid cash ÷ average monthly outflow over the trailing 3 months.
  const trailingExpenses = [0, 1, 2].map(
    (back) => getMonthlyReport(undefined, addMonths(month, -back)).totalOutflowPaise
  );
  const avgExpense = trailingExpenses.reduce((sum, value) => sum + value, 0) / trailingExpenses.length;
  const runwayMonths = avgExpense > 0 ? Math.round((netWorth.liquidPaise / avgExpense) * 10) / 10 : null;

  return {
    netWorth,
    history,
    allocation,
    cashflow: { incomePaise, expensePaise, savedPaise, savingsRatePercent },
    runwayMonths
  };
}

export function getBudgetPlan(month = currentMonth(), asOfDate = localIsoDate(new Date())): BudgetPlan {
  const safeMonth = /^\d{4}-\d{2}$/.test(month) ? month : currentMonth();
  const start = `${safeMonth}-01`;
  const end = monthEndDate(safeMonth);
  const pace = budgetPace(safeMonth, asOfDate);
  const report = getMonthlyReport(undefined, safeMonth);
  const actuals = budgetActualMaps(report);
  const rows = listBudgetRows(safeMonth);
  const lines = rows.map((row) => budgetLineFromRow(row, actuals, pace));
  const covered = new Set(lines.map((line) => `${line.scopeType}:${line.scopeId}`));
  const coveredTypeIds = new Set(lines.filter((line) => line.scopeType === "type").map((line) => line.typeId));
  const coveredSubcategoryIds = new Set(
    lines.filter((line) => line.scopeType === "subcategory" && line.subcategoryId).map((line) => line.subcategoryId)
  );
  const unplannedActualPaise = report.types.reduce((sum, type) => {
    if (!BUDGETABLE_BEHAVIORS.has(type.behavior as TaxonomyBehavior) || coveredTypeIds.has(type.typeId)) {
      return sum;
    }
    return (
      sum +
      type.subcategories.reduce(
        (subSum, subcategory) =>
          coveredSubcategoryIds.has(subcategory.subcategoryId) ? subSum : subSum + subcategory.amountPaise,
        0
      )
    );
  }, 0);

  return {
    month: safeMonth,
    start,
    end,
    asOfDate: pace.asOfDate,
    dayOfMonth: pace.dayOfMonth,
    daysInMonth: pace.daysInMonth,
    elapsedPercent: pace.elapsedPercent,
    totals: {
      amountPaise: lines.reduce((sum, line) => sum + line.amountPaise, 0),
      actualPaise: lines.reduce((sum, line) => sum + line.actualPaise, 0),
      remainingPaise: lines.reduce((sum, line) => sum + line.remainingPaise, 0),
      projectedPaise: lines.reduce((sum, line) => sum + line.projectedPaise, 0),
      safeCount: lines.filter((line) => line.status === "safe").length,
      watchCount: lines.filter((line) => line.status === "watch").length,
      criticalCount: lines.filter((line) => line.status === "critical").length,
      overCount: lines.filter((line) => line.status === "over").length,
      unplannedActualPaise
    },
    lines,
    availableScopes: listBudgetScopes(safeMonth).filter(
      (scope) => !covered.has(`${scope.scopeType}:${scope.scopeId}`)
    )
  };
}

export function createBudgetLine(input: CreateBudgetLineInput): BudgetLineSummary {
  const parsed = createBudgetLineSchema.parse(input);
  const scope = resolveBudgetScope(parsed.scopeType, parsed.scopeId);
  ensureNoBudgetOverlap(parsed.month, parsed.scopeType, parsed.scopeId);
  const id = randomUUID();

  try {
    db.prepare(
      `INSERT INTO budget_lines (id, month, scope_type, scope_id, amount_paise)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, parsed.month, parsed.scopeType, scope.scopeId, parsed.amountPaise);
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw badRequest(`${scope.name} already has a budget for ${parsed.month}.`);
    }
    throw error;
  }

  return getBudgetLine(id);
}

export function updateBudgetLine(id: string, input: UpdateBudgetLineInput): BudgetLineSummary {
  const parsed = updateBudgetLineSchema.parse(input);
  const current = requireBudgetLineRow(id);

  db.prepare(
    `UPDATE budget_lines
     SET amount_paise = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(parsed.amountPaise ?? current.amount_paise, id);

  return getBudgetLine(id);
}

export function deleteBudgetLine(id: string) {
  const result = db.prepare("DELETE FROM budget_lines WHERE id = ?").run(id);
  if (result.changes === 0) {
    throw notFound("Budget line not found.");
  }
  return { ok: true };
}

export type TrendMode = "month" | "year" | "week";

export type TrendPoint = {
  label: string;
  amountPaise: number;
};

export type TrendReport = {
  mode: TrendMode;
  typeId: string;
  typeName: string;
  color: string;
  month: string | null;
  points: TrendPoint[];
};

export function getTrendReport(
  accountId: string | undefined,
  typeId: string,
  mode: TrendMode,
  month?: string
): TrendReport {
  const type = requireCategoryType(typeId);
  const now = new Date();
  const currentYear = now.getFullYear();
  const points: TrendPoint[] = [];
  let selectedMonth: string | null = null;

  const amountForType = (report: ReturnType<typeof getMonthlyReport>) =>
    report.types.find((item) => item.typeId === typeId)?.amountPaise ?? 0;

  if (mode === "month") {
    for (let index = 0; index <= now.getMonth(); index += 1) {
      const month = `${currentYear}-${String(index + 1).padStart(2, "0")}`;
      points.push({
        label: new Date(currentYear, index, 1).toLocaleDateString("en-IN", { month: "short" }),
        amountPaise: amountForType(getMonthlyReport(accountId, month))
      });
    }
  } else if (mode === "week") {
    // Week-on-week within a single month: split the month into 7-day windows
    // so the chart stays readable instead of plotting every week of the year.
    selectedMonth = /^\d{4}-\d{2}$/.test(month ?? "") ? (month as string) : currentMonth();
    const daysInMonth = Number(monthEndDate(selectedMonth).slice(8, 10));
    for (let startDay = 1; startDay <= daysInMonth; startDay += 7) {
      const endDay = Math.min(startDay + 6, daysInMonth);
      const from = `${selectedMonth}-${String(startDay).padStart(2, "0")}`;
      const to = `${selectedMonth}-${String(endDay).padStart(2, "0")}`;
      points.push({
        label: `${startDay}–${endDay}`,
        amountPaise: amountForType(getMonthlyReport(accountId, selectedMonth, from, to))
      });
    }
  } else {
    const firstRow = asRecord<{ first: string | null }>(
      db.prepare("SELECT MIN(date) AS first FROM transactions").get()
    );
    const firstYear = firstRow?.first ? Number(firstRow.first.slice(0, 4)) : currentYear;
    // Cap the window so a mis-dated transaction can never trigger an unbounded
    // number of per-year report queries.
    const startYear = Math.max(Math.min(firstYear, currentYear), currentYear - 9);
    for (let year = startYear; year <= currentYear; year += 1) {
      points.push({
        label: String(year),
        amountPaise: amountForType(getMonthlyReport(accountId, `${year}-01`, `${year}-01-01`, `${year}-12-31`))
      });
    }
  }

  return { mode, typeId, typeName: type.name, color: type.color, month: selectedMonth, points };
}

export type PaymentHistorySource = "loan" | "autopay" | "mutual_fund";

export type PaymentHistory = {
  source: string;
  id: string;
  year: number;
  months: boolean[];
};

const PAYMENT_HISTORY_SOURCES = new Set<PaymentHistorySource>(["loan", "autopay", "mutual_fund"]);

export function getPaymentHistory(
  source: PaymentHistorySource,
  id: string,
  year: number
): PaymentHistory {
  if (!PAYMENT_HISTORY_SOURCES.has(source)) {
    throw badRequest("Unknown payment history source.");
  }

  const safeYear = Math.min(Math.max(Math.trunc(Number(year) || 0), 2000), 2100);
  const yearText = String(safeYear);

  let rows: Array<{ month: string }>;
  if (source === "loan") {
    rows = asRecords<{ month: string }>(
      db
        .prepare(
          `SELECT DISTINCT substr(t.date, 6, 2) AS month
           FROM transactions t
           JOIN loan_payments lp ON lp.transaction_id = t.id
           WHERE lp.loan_id = ? AND substr(t.date, 1, 4) = ?`
        )
        .all(id, yearText)
    );
  } else if (source === "autopay") {
    rows = asRecords<{ month: string }>(
      db
        .prepare(
          `SELECT DISTINCT substr(t.date, 6, 2) AS month
           FROM transactions t
           JOIN autopay_payments ap ON ap.transaction_id = t.id
           WHERE ap.subscription_id = ? AND substr(t.date, 1, 4) = ?`
        )
        .all(id, yearText)
    );
  } else {
    // A month ticks only when a Mutual-Funds investment transaction is explicitly
    // linked to THIS holding (via the investment picker), mirroring AutoPay/loan linking.
    rows = asRecords<{ month: string }>(
      db
        .prepare(
          `SELECT DISTINCT substr(t.date, 6, 2) AS month
           FROM transactions t
           JOIN investment_payments iph ON iph.transaction_id = t.id
           WHERE iph.investment_id = ? AND substr(t.date, 1, 4) = ?`
        )
        .all(id, yearText)
    );
  }

  const months = Array.from({ length: 12 }, () => false);
  for (const row of rows) {
    const index = Number(row.month) - 1;
    if (index >= 0 && index < 12) {
      months[index] = true;
    }
  }

  return { source, id, year: safeYear, months };
}

export function getMonthlyReport(
  accountId?: string,
  month = currentMonth(),
  from?: string,
  to?: string
) {
  const range = resolveReportRange(month, from, to);
  const { start, end } = range;
  const params: SqlParam[] = [start, end];
  const accountFilter = accountId ? "AND (t.account_id = ? OR t.transfer_account_id = ?)" : "";
  if (accountId) {
    params.push(accountId, accountId);
  }

  const reportRows = asRecords<ReportSourceRow>(
    db
      .prepare(
        `SELECT t.kind, t.direction, t.amount_paise, t.transfer_account_id,
                tt.id AS type_id, tt.name AS type_name, tt.behavior AS type_behavior,
                tt.icon AS type_icon, tt.color AS type_color,
                ts.id AS subcategory_id, ts.name AS subcategory_name,
                ts.icon AS subcategory_icon, ts.color AS subcategory_color,
                ota.name AS transfer_account_name,
                ott.id AS original_type_id, ott.name AS original_type_name,
                ott.behavior AS original_type_behavior, ott.icon AS original_type_icon,
                ott.color AS original_type_color,
                ots.id AS original_subcategory_id, ots.name AS original_subcategory_name,
                ots.icon AS original_subcategory_icon, ots.color AS original_subcategory_color,
                st.id AS split_type_id, st.name AS split_type_name,
                st.behavior AS split_type_behavior, st.icon AS split_type_icon,
                st.color AS split_type_color,
                ss.id AS split_subcategory_id, ss.name AS split_subcategory_name,
                ss.icon AS split_subcategory_icon, ss.color AS split_subcategory_color,
                s.amount_paise AS split_amount_paise
         FROM transactions t
         LEFT JOIN category_types tt ON tt.id = t.type_id
         LEFT JOIN subcategories ts ON ts.id = t.subcategory_id
         LEFT JOIN accounts ota ON ota.id = t.transfer_account_id
         LEFT JOIN transactions original ON original.id = t.linked_transaction_id
         LEFT JOIN category_types ott ON ott.id = original.type_id
         LEFT JOIN subcategories ots ON ots.id = original.subcategory_id
         LEFT JOIN transaction_splits s ON s.transaction_id = t.id
         LEFT JOIN subcategories ss ON ss.id = s.subcategory_id
         LEFT JOIN category_types st ON st.id = ss.type_id
         WHERE t.date >= ? AND t.date <= ?
           ${accountFilter}`
      )
      .all(...params)
  );

  const typeTotals = new Map<string, ReportTypeAccumulator>();
  const subcategoryTotals = new Map<string, ReportSubcategoryAccumulator>();
  let totalSpending = 0;

  for (const row of reportRows) {
    const bucket = reportBucket(row);
    const sign = reportSign(row);
    const amount = row.split_amount_paise ?? row.amount_paise;
    const lineAmount = amount * sign;

    if (sign === 0 || lineAmount === 0) {
      continue;
    }

    // Self transfers only move money between the user's own accounts, so they are
    // neither inflow nor outflow and stay out of every report figure.
    if (bucket.subcategoryId === SELF_TRANSFER_SUBCATEGORY_ID) {
      continue;
    }

    const typeCurrent =
      typeTotals.get(bucket.typeId) ??
      {
        typeId: bucket.typeId,
        name: bucket.typeName,
        behavior: bucket.behavior,
        icon: bucket.typeIcon,
        color: bucket.typeColor,
        amountPaise: 0,
        subcategories: new Map<string, ReportSubcategoryAccumulator>()
      };
    const subCurrent =
      typeCurrent.subcategories.get(bucket.subcategoryId) ??
      {
        subcategoryId: bucket.subcategoryId,
        behavior: bucket.behavior,
        name: bucket.subcategoryName,
        icon: bucket.subcategoryIcon,
        color: bucket.subcategoryColor,
        amountPaise: 0
      };

    typeCurrent.amountPaise += lineAmount;
    subCurrent.amountPaise += lineAmount;
    typeCurrent.subcategories.set(bucket.subcategoryId, subCurrent);
    typeTotals.set(bucket.typeId, typeCurrent);

    const flatSub =
      subcategoryTotals.get(bucket.subcategoryId) ??
      {
        subcategoryId: bucket.subcategoryId,
        typeId: bucket.typeId,
        behavior: bucket.behavior,
        name: bucket.subcategoryName,
        icon: bucket.subcategoryIcon,
        color: bucket.subcategoryColor,
        amountPaise: 0
      };
    flatSub.amountPaise += lineAmount;
    subcategoryTotals.set(bucket.subcategoryId, flatSub);

    if (
      bucket.behavior === "expense" ||
      bucket.behavior === "loan" ||
      bucket.behavior === "investment" ||
      bucket.behavior === "uncategorized"
    ) {
      totalSpending += lineAmount;
    }
  }

  const totals = asRecord<{
    income: number | null;
    loan: number | null;
    investment: number | null;
  }>(
    db
      .prepare(
        `SELECT
           SUM(CASE WHEN kind = 'income' AND direction = 'inflow' THEN amount_paise ELSE 0 END) AS income,
           SUM(CASE WHEN kind = 'emi' AND direction = 'outflow' THEN amount_paise ELSE 0 END) AS loan,
           SUM(CASE WHEN kind = 'investment' AND direction = 'outflow' THEN amount_paise ELSE 0 END) AS investment
         FROM transactions t
         WHERE t.date >= ? AND t.date <= ?
           ${accountFilter}`
      )
      .get(...params)
  );

  const typeRows = Array.from(typeTotals.values())
    .map((type) => {
      const subcategories = Array.from(type.subcategories.values())
        .filter((item) => item.amountPaise > 0)
        .sort((a, b) => b.amountPaise - a.amountPaise);
      const typeAmount = subcategories.reduce((sum, item) => sum + item.amountPaise, 0);

      return {
        typeId: type.typeId,
        name: type.name,
        behavior: type.behavior,
        icon: type.icon,
        color: type.color,
        amountPaise: typeAmount,
        share: 0,
        subcategories: subcategories.map((item) => ({
          ...item,
          share: typeAmount > 0 ? Math.max(0, Math.round((item.amountPaise / typeAmount) * 100)) : 0
        }))
      };
    })
    .filter((type) => type.amountPaise > 0)
    .sort((a, b) => b.amountPaise - a.amountPaise);

  const positiveTotal = typeRows.reduce((sum, type) => sum + type.amountPaise, 0);
  const reportTypes = typeRows.map((type) => ({
    ...type,
    share: positiveTotal > 0 ? Math.max(0, Math.round((type.amountPaise / positiveTotal) * 100)) : 0
  }));

  const categoryRows = Array.from(subcategoryTotals.values())
    .filter(
      (row) =>
        row.amountPaise > 0 &&
        (row.behavior === "expense" ||
          row.behavior === "loan" ||
          row.behavior === "investment" ||
          row.behavior === "uncategorized")
    )
    .sort((a, b) => b.amountPaise - a.amountPaise);
  const categoryTotalPaise = categoryRows.reduce((sum, row) => sum + row.amountPaise, 0);
  const totalOutflowPaise = reportTypes.reduce(
    (sum, type) => (INFLOW_BEHAVIORS.has(type.behavior) ? sum : sum + type.amountPaise),
    0
  );

  return {
    month: range.month,
    start,
    end,
    totalSpendingPaise: Math.max(0, totalSpending),
    totalOutflowPaise: Math.max(0, totalOutflowPaise),
    incomePaise: totals.income ?? 0,
    emiPaise: totals.loan ?? 0,
    loanPaise: totals.loan ?? 0,
    investmentPaise: totals.investment ?? 0,
    categories: categoryRows.map((row) => ({
      categoryId: row.subcategoryId,
      subcategoryId: row.subcategoryId,
      typeId: row.typeId,
      name: row.name,
      icon: row.icon,
      color: row.color,
      amountPaise: row.amountPaise,
      share:
        categoryTotalPaise > 0 ? Math.max(0, Math.round((row.amountPaise / categoryTotalPaise) * 100)) : 0
    })),
    types: reportTypes
  };
}

type ReportSourceRow = {
    kind: TransactionKind;
    direction: Direction;
    amount_paise: number;
    transfer_account_id: string | null;
    type_id: string | null;
    type_name: string | null;
    type_behavior: TaxonomyBehavior | null;
    type_icon: string | null;
    type_color: string | null;
    subcategory_id: string | null;
    subcategory_name: string | null;
    subcategory_icon: string | null;
    subcategory_color: string | null;
    transfer_account_name: string | null;
    original_type_id: string | null;
    original_type_name: string | null;
    original_type_behavior: TaxonomyBehavior | null;
    original_type_icon: string | null;
    original_type_color: string | null;
    original_subcategory_id: string | null;
    original_subcategory_name: string | null;
    original_subcategory_icon: string | null;
    original_subcategory_color: string | null;
    split_type_id: string | null;
    split_type_name: string | null;
    split_type_behavior: TaxonomyBehavior | null;
    split_type_icon: string | null;
    split_type_color: string | null;
    split_subcategory_id: string | null;
    split_subcategory_name: string | null;
    split_subcategory_icon: string | null;
    split_subcategory_color: string | null;
    split_amount_paise: number | null;
};

type ReportBehavior = TaxonomyBehavior | "uncategorized";

type ReportSubcategoryAccumulator = {
  subcategoryId: string;
  typeId?: string;
  behavior: ReportBehavior;
  name: string;
  icon: string;
  color: string;
  amountPaise: number;
};

type ReportTypeAccumulator = {
  typeId: string;
  name: string;
  behavior: ReportBehavior;
  icon: string;
  color: string;
  amountPaise: number;
  subcategories: Map<string, ReportSubcategoryAccumulator>;
};

type ReportBucket = {
  typeId: string;
  typeName: string;
  behavior: ReportBehavior;
  typeIcon: string;
  typeColor: string;
  subcategoryId: string;
  subcategoryName: string;
  subcategoryIcon: string;
  subcategoryColor: string;
};

function reportBucket(row: ReportSourceRow): ReportBucket {
  if (row.split_subcategory_id && row.split_type_id) {
    return {
      typeId: row.split_type_id,
      typeName: row.split_type_name ?? "Uncategorized",
      behavior: row.split_type_behavior ?? "uncategorized",
      typeIcon: row.split_type_icon ?? "circle-question",
      typeColor: row.split_type_color ?? "#ea580c",
      subcategoryId: row.split_subcategory_id,
      subcategoryName: row.split_subcategory_name ?? "Unspecified",
      subcategoryIcon: row.split_subcategory_icon ?? row.split_type_icon ?? "circle-question",
      subcategoryColor: row.split_subcategory_color ?? row.split_type_color ?? "#ea580c"
    };
  }

  if ((row.kind === "refund" || row.kind === "reversal") && row.original_type_id) {
    return {
      typeId: row.original_type_id,
      typeName: row.original_type_name ?? "Uncategorized",
      behavior: row.original_type_behavior ?? "uncategorized",
      typeIcon: row.original_type_icon ?? "circle-question",
      typeColor: row.original_type_color ?? "#ea580c",
      subcategoryId: row.original_subcategory_id ?? `${row.original_type_id}:unspecified`,
      subcategoryName: row.original_subcategory_name ?? "Unspecified",
      subcategoryIcon: row.original_subcategory_icon ?? row.original_type_icon ?? "circle-question",
      subcategoryColor: row.original_subcategory_color ?? row.original_type_color ?? "#ea580c"
    };
  }

  if (row.type_behavior === "card_payment" && row.transfer_account_id) {
    return {
      typeId: row.type_id ?? "type_card_payment",
      typeName: row.type_name ?? "Credit Card Payment",
      behavior: "card_payment" as const,
      typeIcon: row.type_icon ?? "credit-card",
      typeColor: row.type_color ?? "#ea580c",
      subcategoryId: `card:${row.transfer_account_id}`,
      subcategoryName: row.transfer_account_name ?? "Credit card",
      subcategoryIcon: "credit-card",
      subcategoryColor: row.type_color ?? "#ea580c"
    };
  }

  if (row.type_id) {
    return {
      typeId: row.type_id,
      typeName: row.type_name ?? "Uncategorized",
      behavior: row.type_behavior ?? "uncategorized",
      typeIcon: row.type_icon ?? "circle-question",
      typeColor: row.type_color ?? "#ea580c",
      subcategoryId: row.subcategory_id ?? `${row.type_id}:unspecified`,
      subcategoryName: row.subcategory_name ?? "Unspecified",
      subcategoryIcon: row.subcategory_icon ?? row.type_icon ?? "circle-question",
      subcategoryColor: row.subcategory_color ?? row.type_color ?? "#ea580c"
    };
  }

  return {
    typeId: "uncategorized",
    typeName: "Uncategorized",
    behavior: "uncategorized" as const,
    typeIcon: "circle-question",
    typeColor: "#ea580c",
    subcategoryId: "uncategorized",
    subcategoryName: "Uncategorized",
    subcategoryIcon: "circle-question",
    subcategoryColor: "#ea580c"
  };
}

function reportSign(row: ReportSourceRow) {
  if ((row.kind === "refund" || row.kind === "reversal") && row.direction === "inflow") {
    return row.original_type_id ? -1 : 1;
  }
  if (row.direction === "outflow") {
    return 1;
  }
  if (row.kind === "income" && row.direction === "inflow") {
    return 1;
  }
  return 0;
}

function listBudgetRows(month: string) {
  return asRecords<BudgetLineRow>(
    db
      .prepare(
        `SELECT id, month, scope_type, scope_id, amount_paise, created_at, updated_at
         FROM budget_lines
         WHERE month = ?
         ORDER BY created_at, id`
      )
      .all(month)
  );
}

function requireBudgetLineRow(id: string) {
  const row = asRecord<BudgetLineRow | undefined>(
    db
      .prepare(
        `SELECT id, month, scope_type, scope_id, amount_paise, created_at, updated_at
         FROM budget_lines
         WHERE id = ?`
      )
      .get(id)
  );
  if (!row) {
    throw notFound("Budget line not found.");
  }
  return row;
}

function getBudgetLine(id: string): BudgetLineSummary {
  const row = requireBudgetLineRow(id);
  const report = getMonthlyReport(undefined, row.month);
  return budgetLineFromRow(row, budgetActualMaps(report), budgetPace(row.month, localIsoDate(new Date())));
}

function budgetActualMaps(report: ReturnType<typeof getMonthlyReport>) {
  const typeActuals = new Map<string, number>();
  const subcategoryActuals = new Map<string, number>();

  for (const type of report.types) {
    if (!BUDGETABLE_BEHAVIORS.has(type.behavior as TaxonomyBehavior)) {
      continue;
    }
    typeActuals.set(type.typeId, type.amountPaise);
    for (const subcategory of type.subcategories) {
      subcategoryActuals.set(subcategory.subcategoryId, subcategory.amountPaise);
    }
  }

  return { typeActuals, subcategoryActuals };
}

function budgetLineFromRow(
  row: BudgetLineRow,
  actuals: ReturnType<typeof budgetActualMaps>,
  pace: ReturnType<typeof budgetPace>
): BudgetLineSummary {
  const scope = resolveBudgetScope(row.scope_type, row.scope_id);
  const actualPaise =
    row.scope_type === "type"
      ? actuals.typeActuals.get(row.scope_id) ?? 0
      : actuals.subcategoryActuals.get(row.scope_id) ?? 0;
  const usedPercent = percent(actualPaise, row.amount_paise);
  const projectedPaise =
    pace.elapsedPercent > 0 ? Math.max(actualPaise, Math.round(actualPaise / (pace.elapsedPercent / 100))) : actualPaise;
  const remainingPaise = row.amount_paise - actualPaise;
  const status = budgetStatus(row.amount_paise, actualPaise, usedPercent, projectedPaise, pace.elapsedPercent);

  return {
    ...scope,
    id: row.id,
    month: row.month,
    amountPaise: row.amount_paise,
    actualPaise,
    remainingPaise,
    usedPercent,
    expectedPercent: pace.elapsedPercent,
    paceDeltaPercent: Math.round(usedPercent - pace.elapsedPercent),
    projectedPaise,
    status,
    statusLabel: budgetStatusLabel(status),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function budgetStatus(
  amountPaise: number,
  actualPaise: number,
  usedPercent: number,
  projectedPaise: number,
  elapsedPercent: number
): BudgetStatus {
  if (actualPaise > amountPaise) {
    return "over";
  }
  if (usedPercent > 90 || projectedPaise > amountPaise) {
    return "critical";
  }
  if (usedPercent >= 75 || usedPercent > elapsedPercent + 10) {
    return "watch";
  }
  return "safe";
}

function budgetStatusLabel(status: BudgetStatus) {
  switch (status) {
    case "over":
      return "Over budget";
    case "critical":
      return "Likely to exceed";
    case "watch":
      return "Watch";
    case "safe":
      return "On track";
  }
}

function budgetPace(month: string, asOfDate: string) {
  const start = `${month}-01`;
  const end = monthEndDate(month);
  const daysInMonth = Number(end.slice(8, 10));
  const safeAsOfDate = isIsoDate(asOfDate) ? asOfDate : localIsoDate(new Date());
  const dayOfMonth = safeAsOfDate < start ? 0 : safeAsOfDate > end ? daysInMonth : Number(safeAsOfDate.slice(8, 10));
  const elapsedPercent = daysInMonth > 0 ? Math.round((dayOfMonth / daysInMonth) * 100) : 0;

  return {
    asOfDate: safeAsOfDate,
    dayOfMonth,
    daysInMonth,
    elapsedPercent
  };
}

function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function listBudgetScopes(month: string): BudgetScopeSummary[] {
  const existing = listBudgetRows(month);
  const typeBudgetIds = new Set<string>();
  const subcategoryBudgetTypeIds = new Set<string>();
  const blockedSubcategoryIds = new Set<string>();

  for (const row of existing) {
    const scope = resolveBudgetScope(row.scope_type, row.scope_id);
    if (scope.scopeType === "type") {
      typeBudgetIds.add(scope.typeId);
    } else if (scope.subcategoryId) {
      blockedSubcategoryIds.add(scope.subcategoryId);
      subcategoryBudgetTypeIds.add(scope.typeId);
    }
  }

  const scopes: BudgetScopeSummary[] = [];
  for (const type of listCategoryTypes()) {
    if (!BUDGETABLE_BEHAVIORS.has(type.behavior)) {
      continue;
    }
    if (!typeBudgetIds.has(type.id) && !subcategoryBudgetTypeIds.has(type.id)) {
      scopes.push({
        scopeType: "type",
        scopeId: type.id,
        typeId: type.id,
        subcategoryId: null,
        name: type.name,
        typeName: type.name,
        behavior: type.behavior,
        icon: type.icon,
        color: type.color
      });
    }
    if (!typeBudgetIds.has(type.id)) {
      for (const subcategory of type.subcategories) {
        if (blockedSubcategoryIds.has(subcategory.id) || subcategory.id === SELF_TRANSFER_SUBCATEGORY_ID) {
          continue;
        }
        scopes.push({
          scopeType: "subcategory",
          scopeId: subcategory.id,
          typeId: type.id,
          subcategoryId: subcategory.id,
          name: `${type.name} / ${subcategory.name}`,
          typeName: type.name,
          behavior: type.behavior,
          icon: subcategory.icon,
          color: subcategory.color
        });
      }
    }
  }

  return scopes;
}

function resolveBudgetScope(scopeType: BudgetScopeType, scopeId: string): BudgetScopeSummary {
  if (scopeType === "type") {
    const type = requireCategoryType(scopeId);
    if (!BUDGETABLE_BEHAVIORS.has(type.behavior)) {
      throw badRequest("Selected Type is not available for budgeting.");
    }
    return {
      scopeType,
      scopeId: type.id,
      typeId: type.id,
      subcategoryId: null,
      name: type.name,
      typeName: type.name,
      behavior: type.behavior,
      icon: type.icon,
      color: type.color
    };
  }

  const subcategory = getSubcategoryRow(scopeId);
  if (!subcategory) {
    throw badRequest("Selected SubType does not exist.");
  }
  const type = requireCategoryType(subcategory.type_id);
  if (!BUDGETABLE_BEHAVIORS.has(type.behavior)) {
    throw badRequest("Selected SubType is not available for budgeting.");
  }
  return {
    scopeType,
    scopeId: subcategory.id,
    typeId: type.id,
    subcategoryId: subcategory.id,
    name: `${type.name} / ${subcategory.name}`,
    typeName: type.name,
    behavior: type.behavior,
    icon: subcategory.icon,
    color: subcategory.color
  };
}

function ensureNoBudgetOverlap(
  month: string,
  scopeType: BudgetScopeType,
  scopeId: string,
  exceptId?: string
) {
  const nextScope = resolveBudgetScope(scopeType, scopeId);
  const rows = listBudgetRows(month).filter((row) => row.id !== exceptId);

  for (const row of rows) {
    const existingScope = resolveBudgetScope(row.scope_type, row.scope_id);
    if (existingScope.scopeType === nextScope.scopeType && existingScope.scopeId === nextScope.scopeId) {
      throw badRequest(`${nextScope.name} already has a budget for ${month}.`);
    }
    if (existingScope.typeId === nextScope.typeId && (existingScope.scopeType === "type" || nextScope.scopeType === "type")) {
      throw badRequest("Budget scopes overlap. Choose either the Type or its SubTypes for this month.");
    }
  }
}

export function createBackup(mode: BackupMode = "manual") {
  const backupDir = ensureBackupDir();
  const createdAt = new Date().toISOString();
  const stamp = createdAt.replace(/[:.]/g, "-");
  const target = path.join(backupDir, `finance-${stamp}.db`);

  const settings = getSettings();
  const previousStatus = {
    lastBackupAt: settings.last_backup_at ?? null,
    lastBackupPath: settings.last_backup_path ?? null,
    lastBackupMode: settings.last_backup_mode ?? null
  };

  setSetting("last_backup_at", createdAt);
  setSetting("last_backup_path", target);
  setSetting("last_backup_mode", mode);

  try {
    db.prepare("VACUUM INTO ?").run(target);
    pruneBackupFiles(backupDir);
  } catch (error) {
    if (existsSync(target)) {
      unlinkSync(target);
    }
    restoreBackupStatus(previousStatus);
    throw error;
  }

  return { path: target, mode, createdAt };
}

export function exportTransactionsCsv() {
  const rows: TransactionSummary[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = listTransactions({ limit: 500, offset });
    rows.push(...page);
    if (page.length < 500) break;
  }
  const headers = [
    "date",
    "account",
    "type",
    "subtype",
    "method",
    "direction",
    "kind",
    "amount_inr",
    "merchant",
    "note",
    "status"
  ];
  const body = rows.map((row) =>
    [
      row.date,
      row.accountName,
      row.typeName ?? "",
      row.subcategoryName ?? (row.kind === "card_payment" ? cardPaymentSubTypeName(row) : ""),
      row.method,
      row.direction,
      row.kind,
      (row.amountPaise / 100).toFixed(2),
      row.merchant ?? "",
      row.note ?? "",
      row.status
    ]
      .map(csvCell)
      .join(",")
  );

  return [headers.join(","), ...body].join("\n");
}

export async function buildImportTemplate() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Financial Tracker";
  workbook.created = new Date();

  const instructions = workbook.addWorksheet("Instructions");
  instructions.columns = [
    { header: "Topic", key: "topic", width: 26 },
    { header: "Guidance", key: "guidance", width: 92 }
  ];
  instructions.getRow(1).font = { bold: true };
  instructions.addRow({
    topic: "How to use",
    guidance:
      "Fill rows in the Transactions sheet. Existing users can pick from dropdowns; new users can type a new Account, Type, or SubType."
  });
  instructions.addRow({
    topic: "New accounts",
    guidance:
      "When you type a new Account, choose its Account Type. Credit-card accounts are created with a zero limit so you can update the limit later."
  });
  instructions.addRow({
    topic: "New Types",
    guidance:
      "When you type a new Type, choose Type Behavior so the app knows whether it is Expense, Income, Loan, Investment, Transfer, or Refund."
  });
  instructions.addRow({
    topic: "SubTypes",
    guidance:
      "Pick an existing SubType from the dropdown or type a new SubType. New SubTypes are created under the row's Type."
  });
  instructions.addRow({
    topic: "Credit Card Payment",
    guidance:
      "For Credit Card Payment rows, Account should be the paying bank account and SubType should be the target credit-card name."
  });
  instructions.addRow({
    topic: "Sample row",
    guidance: "The sample row is valid for import, but delete it if you only want to import your own rows."
  });

  const transactionSheet = workbook.addWorksheet("Transactions");
  transactionSheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Account", key: "account", width: 24 },
    { header: "Account Type", key: "accountType", width: 18 },
    { header: "Type", key: "type", width: 22 },
    { header: "Type Behavior", key: "typeBehavior", width: 18 },
    { header: "SubType", key: "subtype", width: 24 },
    { header: "Method", key: "method", width: 18 },
    { header: "Amount", key: "amount", width: 14 },
    { header: "Note", key: "note", width: 32 }
  ];
  transactionSheet.getRow(1).font = { bold: true };
  const sampleAccount = listAccounts().find((account) => !account.isArchived);
  transactionSheet.addRow({
    date: currentIsoDate(),
    account: sampleAccount?.name ?? "My Bank Account",
    accountType: sampleAccount ? importAccountTypeLabel(sampleAccount.type) : "Bank account",
    type: "Expense",
    typeBehavior: "Expense",
    subtype: "Groceries",
    method: "UPI",
    amount: "100.00",
    note: "Sample row - delete before import"
  });

  const lookups = workbook.addWorksheet("Lookups");
  lookups.columns = [
    { header: "Accounts", key: "accounts", width: 28 },
    { header: "Types", key: "types", width: 24 },
    { header: "SubTypes", key: "subtypes", width: 28 },
    { header: "Type for SubType", key: "typeForSubtype", width: 24 },
    { header: "Account Types", key: "accountTypes", width: 18 },
    { header: "Type Behaviors", key: "typeBehaviors", width: 18 },
    { header: "Methods", key: "methods", width: 18 }
  ];
  lookups.getRow(1).font = { bold: true };

  const taxonomy = listCategoryTypes();
  const accounts = listAccounts().filter((account) => !account.isArchived);
  const cardAccounts = accounts.filter((account) => account.type === "credit_card");
  const accountTypes = ["Bank account", "Credit card", "Food card"];
  const typeBehaviors = ["Expense", "Income", "Loan", "Investment", "Transfer", "Refund"];
  const methods = ["UPI", "Credit card", "Bank transfer", "Cash", "Other"];
  const typeNames = taxonomy.map((type) => type.name);
  const subtypeRows = taxonomy.flatMap((type) => {
    if (type.behavior === "card_payment") {
      return cardAccounts.map((card) => ({
        subtypes: card.name,
        typeForSubtype: type.name
      }));
    }

    return type.subcategories.map((subcategory) => ({
      subtypes: subcategory.name,
      typeForSubtype: type.name
    }));
  });

  const maxRows = Math.max(
    accounts.length,
    typeNames.length,
    subtypeRows.length,
    accountTypes.length,
    typeBehaviors.length,
    methods.length
  );
  for (let index = 0; index < maxRows; index += 1) {
    lookups.addRow({
      accounts: accounts[index]?.name ?? "",
      types: typeNames[index] ?? "",
      ...(subtypeRows[index] ?? {}),
      accountTypes: accountTypes[index] ?? "",
      typeBehaviors: typeBehaviors[index] ?? "",
      methods: methods[index] ?? ""
    });
  }

  for (let rowNumber = 2; rowNumber <= 250; rowNumber += 1) {
    transactionSheet.getCell(`A${rowNumber}`).numFmt = "@";
    transactionSheet.getCell(`B${rowNumber}`).dataValidation = {
      type: "list",
      allowBlank: false,
      showInputMessage: true,
      promptTitle: "Account",
      prompt: "Pick an existing account or type a new account name.",
      showErrorMessage: false,
      formulae: [`Lookups!$A$2:$A$${Math.max(accounts.length + 1, 2)}`]
    };
    transactionSheet.getCell(`C${rowNumber}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`Lookups!$E$2:$E$${accountTypes.length + 1}`]
    };
    transactionSheet.getCell(`D${rowNumber}`).dataValidation = {
      type: "list",
      allowBlank: false,
      showInputMessage: true,
      promptTitle: "Type",
      prompt: "Pick an existing Type or type a new one. Choose Type Behavior when Type is new.",
      showErrorMessage: false,
      formulae: [`Lookups!$B$2:$B$${typeNames.length + 1}`]
    };
    transactionSheet.getCell(`F${rowNumber}`).dataValidation = {
      type: "list",
      allowBlank: false,
      showInputMessage: true,
      promptTitle: "SubType",
      prompt: "Pick an existing SubType or type a new SubType for this row's Type.",
      showErrorMessage: false,
      formulae: [`Lookups!$C$2:$C$${Math.max(subtypeRows.length + 1, 2)}`]
    };
    transactionSheet.getCell(`E${rowNumber}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`Lookups!$F$2:$F$${typeBehaviors.length + 1}`]
    };
    transactionSheet.getCell(`G${rowNumber}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`Lookups!$G$2:$G$${methods.length + 1}`]
    };
  }

  lookups.state = "hidden";
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function importTransactionsWorkbook(buffer: Buffer, batchId?: string) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.getWorksheet("Transactions") ?? workbook.worksheets[0];

  if (!sheet) {
    throw badRequest("Workbook does not contain a Transactions sheet.");
  }

  const header = sheet.getRow(1).values as Array<string | undefined>;
  const actualHeaders = header.slice(1).map((value) => normalizeHeader(String(value ?? "")));
  const expectedHeaders = [
    "date",
    "account",
    "accounttype",
    "type",
    "typebehavior",
    "subtype",
    "method",
    "amount",
    "note"
  ];

  if (expectedHeaders.some((value, index) => actualHeaders[index] !== value)) {
    throw badRequest(
      "Template headers must be Date, Account, Account Type, Type, Type Behavior, SubType, Method, Amount, Note."
    );
  }

  const errors: Array<{ row: number; message: string }> = [];
  const validRows: CreateTransactionInput[] = [];
  const importKeys = new Set<string>();
  const affectedAccounts = new Map<string, string>();
  let skippedDuplicateCount = 0;
  const context = buildImportContext();

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values = {
      date: cellText(row.getCell(1).value),
      account: cellText(row.getCell(2).value),
      accountType: cellText(row.getCell(3).value),
      type: cellText(row.getCell(4).value),
      typeBehavior: cellText(row.getCell(5).value),
      subtype: cellText(row.getCell(6).value),
      method: cellText(row.getCell(7).value),
      amount: cellText(row.getCell(8).value),
      note: cellText(row.getCell(9).value)
    };

    if (!Object.values(values).some((value) => value.trim() !== "")) {
      continue;
    }

    const parsed = parseImportRow(values, context, batchId);
    if ("error" in parsed) {
      errors.push({ row: rowNumber, message: parsed.error });
    } else {
      affectedAccounts.set(parsed.payload.accountId, importAccountNameById(context, parsed.payload.accountId));
      const duplicateKey = exactImportDuplicateKey(parsed.payload);
      if (importKeys.has(duplicateKey) || exactTransactionExists(parsed.payload)) {
        skippedDuplicateCount += 1;
        continue;
      }
      importKeys.add(duplicateKey);
      validRows.push(parsed.payload);
    }
  }

  if (errors.length > 0) {
    return {
      insertedCount: 0,
      errors,
      createdAccounts: [],
      createdTypes: [],
      createdSubcategories: [],
      affectedAccounts: [],
      skippedDuplicateCount: 0,
      warnings: []
    };
  }

  transaction(() => {
    insertImportPlans(context);
    for (const row of validRows) {
      insertValidatedTransaction(createTransactionSchema.parse(row));
    }
  });

  return {
    insertedCount: validRows.length,
    errors,
    createdAccounts: context.createdAccounts,
    createdTypes: context.createdTypes,
    createdSubcategories: context.createdSubcategories,
    affectedAccounts: Array.from(affectedAccounts, ([id, name]) => ({ id, name })),
    skippedDuplicateCount,
    warnings: context.warnings
  };
}

function getBatch(id: string) {
  const row = asRecord<
    | {
        id: string;
        week_start: string;
        week_end: string;
        status: "draft" | "saved";
        created_at: string;
        saved_at: string | null;
      }
    | undefined
  >(
    db
      .prepare(
        `SELECT id, week_start, week_end, status, created_at, saved_at
         FROM entry_batches
         WHERE id = ?`
      )
      .get(id)
  );

  if (!row) {
    throw notFound("Batch not found.");
  }

  return {
    id: row.id,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    status: row.status,
    createdAt: row.created_at,
    savedAt: row.saved_at
  };
}

function requireLoanRow(id: string) {
  const row = asRecord<LoanRow | undefined>(
    db
      .prepare(
        `SELECT id, name, subcategory_id, principal_amount_paise, starting_outstanding_paise,
                start_month, annual_interest_rate_bps, tenure_months, monthly_emi_paise,
                is_archived, created_at, updated_at
         FROM loans
         WHERE id = ?`
      )
      .get(id)
  );

  if (!row) {
    throw notFound("Loan not found.");
  }
  return row;
}

function requireLoanSummary(id: string) {
  return mapLoan(requireLoanRow(id));
}

function requireActiveLoan(id: string) {
  const loan = requireLoanRow(id);
  if (loan.is_archived) {
    throw badRequest("Archived loans cannot receive new payments.");
  }
  return loan;
}

function requireLoanSubcategory(id: string) {
  const subcategory = getSubcategoryRow(id);
  if (!subcategory) {
    throw badRequest("Selected loan type does not exist.");
  }
  const type = getCategoryTypeRow(subcategory.type_id);
  if (type?.behavior !== "loan") {
    throw badRequest("Loan must use a SubType under Type = Loan.");
  }
  return subcategory;
}

function mapLoan(row: LoanRow): LoanSummary {
  const subcategory = getSubcategoryRow(row.subcategory_id);
  const paymentTotals = asRecord<{
    principal_paise: number;
    interest_paise: number;
    emi_count: number;
  }>(
    db
      .prepare(
        `SELECT COALESCE(SUM(principal_paise), 0) AS principal_paise,
                COALESCE(SUM(interest_paise), 0) AS interest_paise,
                COALESCE(SUM(CASE WHEN payment_type = 'emi' THEN 1 ELSE 0 END), 0) AS emi_count
         FROM loan_payments
         WHERE loan_id = ?`
      )
      .get(row.id)
  );
  const openingPrincipalPaidPaise = Math.max(
    row.principal_amount_paise - row.starting_outstanding_paise,
    0
  );
  const trackingStartMonth = localMonthFromSqliteTimestamp(row.created_at);
  const historicalInstallments = paidInstallmentsThroughMonth(
    row.start_month,
    trackingStartMonth,
    row.tenure_months
  );
  const estimatedHistoricalInterestPaidPaise = Math.max(
    historicalInstallments * row.monthly_emi_paise - openingPrincipalPaidPaise,
    0
  );
  const trackedPrincipalPaidPaise = paymentTotals?.principal_paise ?? 0;
  const trackedInterestPaidPaise = paymentTotals?.interest_paise ?? 0;
  const trackedEmiCount = paymentTotals?.emi_count ?? 0;
  const outstandingPaise = Math.max(row.starting_outstanding_paise - trackedPrincipalPaidPaise, 0);
  const principalPaidPaise = openingPrincipalPaidPaise + trackedPrincipalPaidPaise;
  const interestPaidPaise = estimatedHistoricalInterestPaidPaise + trackedInterestPaidPaise;
  const contractualMonthsLeft = Math.max(
    row.tenure_months - historicalInstallments - trackedEmiCount,
    0
  );
  const amortizedMonthsLeft = calculateRemainingPayments(
    outstandingPaise,
    row.annual_interest_rate_bps,
    row.monthly_emi_paise
  );
  const monthsLeft =
    amortizedMonthsLeft === null
      ? contractualMonthsLeft
      : Math.min(amortizedMonthsLeft, contractualMonthsLeft);
  const monthsElapsed = historicalInstallments + trackedEmiCount;

  return {
    id: row.id,
    name: row.name,
    subcategoryId: row.subcategory_id,
    subcategoryName: subcategory?.name ?? "Loan",
    subcategoryIcon: subcategory?.icon ?? "calendar-clock",
    subcategoryColor: subcategory?.color ?? "#be123c",
    principalAmountPaise: row.principal_amount_paise,
    startingOutstandingPaise: row.starting_outstanding_paise,
    outstandingPaise,
    openingPrincipalPaidPaise,
    trackedPrincipalPaidPaise,
    principalPaidPaise,
    trackedInterestPaidPaise,
    interestPaidPaise,
    estimatedHistoricalInterestPaidPaise,
    estimatedInterestPaidPaise: interestPaidPaise,
    startMonth: row.start_month,
    annualInterestRateBps: row.annual_interest_rate_bps,
    tenureMonths: row.tenure_months,
    monthlyEmiPaise: row.monthly_emi_paise,
    monthsElapsed,
    monthsLeft,
    closureMonth: addMonths(currentMonth(), monthsLeft),
    isArchived: Boolean(row.is_archived),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function calculateRemainingPayments(
  outstandingPaise: number,
  annualInterestRateBps: number,
  monthlyEmiPaise: number
) {
  if (outstandingPaise <= 0) {
    return 0;
  }
  if (monthlyEmiPaise <= 0) {
    return null;
  }

  const monthlyRate = annualInterestRateBps / 10_000 / 12;
  if (monthlyRate === 0) {
    return Math.ceil(outstandingPaise / monthlyEmiPaise);
  }
  if (monthlyEmiPaise <= outstandingPaise * monthlyRate) {
    return null;
  }

  const paymentCount =
    -Math.log(1 - (outstandingPaise * monthlyRate) / monthlyEmiPaise) /
    Math.log(1 + monthlyRate);
  return Number.isFinite(paymentCount) ? Math.max(Math.ceil(paymentCount), 0) : null;
}

function calculateLoanPaymentSplitFromOutstanding(
  outstandingBeforePaise: number,
  annualInterestRateBps: number,
  amountPaise: number,
  paymentType: LoanPaymentType
) {
  if (outstandingBeforePaise <= 0) {
    throw badRequest("This loan is already fully paid.");
  }

  if (paymentType === "prepayment") {
    if (amountPaise > outstandingBeforePaise) {
      throw badRequest("Prepayment cannot be greater than the current loan outstanding.");
    }
    const principalPaise = Math.min(amountPaise, outstandingBeforePaise);
    return {
      principalPaise,
      interestPaise: 0,
      outstandingBeforePaise,
      outstandingAfterPaise: Math.max(outstandingBeforePaise - principalPaise, 0)
    };
  }

  const estimatedMonthlyInterest = Math.min(
    Math.round((outstandingBeforePaise * annualInterestRateBps) / 10_000 / 12),
    amountPaise
  );
  if (amountPaise > outstandingBeforePaise + estimatedMonthlyInterest) {
    throw badRequest("Payment cannot be greater than the current payoff amount.");
  }
  const principalCandidate = amountPaise - estimatedMonthlyInterest;
  if (principalCandidate <= 0) {
    throw badRequest("EMI is lower than the estimated monthly interest. Increase the amount or record it manually later.");
  }
  const principalPaise = Math.min(principalCandidate, outstandingBeforePaise);
  const interestPaise = Math.max(amountPaise - principalPaise, 0);

  return {
    principalPaise,
    interestPaise,
    outstandingBeforePaise,
    outstandingAfterPaise: Math.max(outstandingBeforePaise - principalPaise, 0)
  };
}

function refreshLoanPayments(loanId: string) {
  const loan = requireLoanRow(loanId);
  const payments = asRecords<LoanPaymentRow>(
    db
      .prepare(
        `SELECT lp.id, lp.loan_id, lp.transaction_id, lp.payment_type, lp.amount_paise, lp.principal_paise,
                lp.interest_paise, lp.outstanding_before_paise, lp.outstanding_after_paise,
                lp.created_at, lp.updated_at
         FROM loan_payments lp
         JOIN transactions t ON t.id = lp.transaction_id
         WHERE lp.loan_id = ?
         ORDER BY t.date ASC, t.created_at ASC, lp.id ASC`
      )
      .all(loanId)
  );

  let outstandingPaise = loan.starting_outstanding_paise;
  for (const payment of payments) {
    const split = calculateLoanPaymentSplitFromOutstanding(
      outstandingPaise,
      loan.annual_interest_rate_bps,
      payment.amount_paise,
      payment.payment_type
    );
    db.prepare(
      `UPDATE loan_payments
       SET principal_paise = ?, interest_paise = ?, outstanding_before_paise = ?,
           outstanding_after_paise = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(
      split.principalPaise,
      split.interestPaise,
      split.outstandingBeforePaise,
      split.outstandingAfterPaise,
      payment.id
    );
    outstandingPaise = split.outstandingAfterPaise;
  }
}

function getLoanPaymentForTransaction(transactionId: string) {
  return asRecord<LoanPaymentRow | undefined>(
    db
      .prepare(
        `SELECT id, loan_id, transaction_id, payment_type, amount_paise, principal_paise,
                interest_paise, outstanding_before_paise, outstanding_after_paise, created_at, updated_at
         FROM loan_payments
         WHERE transaction_id = ?
         LIMIT 1`
      )
      .get(transactionId)
  );
}

function mapAutopaySubscription(row: AutopaySubscriptionRow): AutopaySubscriptionSummary {
  const paymentCount = asRecord<{ count: number }>(
    db.prepare("SELECT COUNT(*) AS count FROM autopay_payments WHERE subscription_id = ?").get(row.id)
  ).count;
  const expiryDate = addMonthsToIsoDate(row.start_date, row.duration_months);
  const status: "active" | "expired" = currentIsoDate() >= expiryDate ? "expired" : "active";

  return {
    id: row.id,
    name: row.name,
    amountPaise: row.amount_paise,
    startDate: row.start_date,
    durationMonths: row.duration_months,
    expiryDate,
    paymentCount,
    status,
    isArchived: Boolean(row.is_archived)
  };
}

function requireAutopayRow(id: string) {
  const row = asRecord<AutopaySubscriptionRow | undefined>(
    db
      .prepare(
        `SELECT id, name, amount_paise, start_date, duration_months, is_archived, created_at, updated_at
         FROM autopay_subscriptions
         WHERE id = ?`
      )
      .get(id)
  );

  if (!row) {
    throw notFound("Subscription not found.");
  }
  return row;
}

function requireAutopaySummary(id: string) {
  return mapAutopaySubscription(requireAutopayRow(id));
}

function requireActiveAutopay(id: string) {
  const subscription = requireAutopayRow(id);
  if (subscription.is_archived) {
    throw badRequest("Archived subscriptions cannot receive new payments.");
  }
  return subscription;
}

function getAutopayPaymentForTransaction(transactionId: string) {
  return asRecord<{ id: string; subscription_id: string; transaction_id: string } | undefined>(
    db
      .prepare(
        `SELECT id, subscription_id, transaction_id
         FROM autopay_payments
         WHERE transaction_id = ?
         LIMIT 1`
      )
      .get(transactionId)
  );
}

function syncAutopayPaymentForTransaction(
  transactionId: string,
  input: CreateTransactionInput,
  existingSubscriptionId?: string
) {
  if (!input.subscriptionId) {
    return;
  }
  if (input.subcategoryId !== AUTOPAY_SUBCATEGORY_ID) {
    throw badRequest("Only AutoPay transactions can be linked to a subscription.");
  }

  const subscription =
    input.subscriptionId === existingSubscriptionId
      ? requireAutopayRow(input.subscriptionId)
      : requireActiveAutopay(input.subscriptionId);
  db.prepare(
    `INSERT INTO autopay_payments (id, subscription_id, transaction_id)
     VALUES (?, ?, ?)`
  ).run(randomUUID(), subscription.id, transactionId);
}

function getInvestmentPaymentForTransaction(transactionId: string) {
  return asRecord<{ id: string; investment_id: string; transaction_id: string } | undefined>(
    db
      .prepare(
        `SELECT id, investment_id, transaction_id
         FROM investment_payments
         WHERE transaction_id = ?
         LIMIT 1`
      )
      .get(transactionId)
  );
}

function syncInvestmentPaymentForTransaction(transactionId: string, input: CreateTransactionInput) {
  if (!input.investmentId) {
    return;
  }
  if (input.subcategoryId !== MUTUAL_FUNDS_SUBCATEGORY_ID) {
    throw badRequest("Only Mutual Funds transactions can be linked to a holding.");
  }

  const investment = requireInvestmentRow(input.investmentId);
  if (investment.type !== "mutual_funds") {
    throw badRequest("Linked holding must be a mutual fund.");
  }
  db.prepare(
    `INSERT INTO investment_payments (id, investment_id, transaction_id)
     VALUES (?, ?, ?)`
  ).run(randomUUID(), investment.id, transactionId);
}

function syncLoanPaymentForTransaction(transactionId: string, input: CreateTransactionInput) {
  if (!input.loanId) {
    return;
  }
  if (input.kind !== "emi") {
    throw badRequest("Only Loan transactions can be linked to a loan.");
  }

  const loan = requireActiveLoan(input.loanId);
  if (loan.subcategory_id !== input.subcategoryId) {
    throw badRequest("Linked loan must match the selected Loan SubType.");
  }

  const paymentType = input.loanPaymentType ?? "emi";
  const placeholderPrincipalPaise = Math.min(input.amountPaise, loan.starting_outstanding_paise);
  const placeholderOutstandingAfterPaise = Math.max(loan.starting_outstanding_paise - placeholderPrincipalPaise, 0);
  db.prepare(
    `INSERT INTO loan_payments
      (id, loan_id, transaction_id, payment_type, amount_paise, principal_paise, interest_paise,
       outstanding_before_paise, outstanding_after_paise)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    loan.id,
    transactionId,
    paymentType,
    input.amountPaise,
    placeholderPrincipalPaise,
    0,
    loan.starting_outstanding_paise,
    placeholderOutstandingAfterPaise
  );
}

function getAccount(id: string) {
  const account = getAccountRow(id);
  if (!account) {
    throw notFound("Account not found.");
  }
  return mapAccountWithBalance(account);
}

function getAccountRow(id: string) {
  return asRecord<AccountRow | undefined>(
    db
      .prepare(
        `SELECT id, name, type, starting_balance_paise, credit_limit_paise,
                is_archived, created_at, updated_at
         FROM accounts
         WHERE id = ?`
      )
      .get(id)
  );
}

function getActiveAccountByName(name: string, exceptId?: string) {
  return asRecord<{ id: string } | undefined>(
    db
      .prepare(
        `SELECT id
         FROM accounts
         WHERE name = ? COLLATE NOCASE
           AND is_archived = 0
           AND (? IS NULL OR id != ?)
         LIMIT 1`
      )
      .get(name, exceptId ?? null, exceptId ?? null)
  );
}

function getCategoryType(id: string) {
  const row = getCategoryTypeRow(id);
  if (!row) {
    throw notFound("Type not found.");
  }

  return {
    ...mapCategoryType(row),
    subcategories: listSubcategoriesForType(id)
  };
}

function getCategoryTypeRow(id: string) {
  return asRecord<CategoryTypeRow | undefined>(
    db
      .prepare(
        `SELECT id, name, behavior, icon, color, is_system, is_locked, sort_order, created_at
         FROM category_types
         WHERE id = ?`
      )
      .get(id)
  );
}

function getCategoryTypeByName(name: string) {
  return asRecord<CategoryTypeRow | undefined>(
    db
      .prepare(
        `SELECT id, name, behavior, icon, color, is_system, is_locked, sort_order, created_at
         FROM category_types
         WHERE name = ? COLLATE NOCASE
         LIMIT 1`
      )
      .get(name)
  );
}

function requireCategoryType(id: string) {
  const type = getCategoryTypeRow(id);
  if (!type) {
    throw badRequest("Selected Type does not exist.");
  }
  return type;
}

function getSubcategory(id: string) {
  const row = getSubcategoryRow(id);
  if (!row) {
    throw notFound("SubType not found.");
  }
  return mapSubcategory(row);
}

function getSubcategoryRow(id: string) {
  return asRecord<SubcategoryRow | undefined>(
    db
      .prepare(
        `SELECT id, type_id, name, icon, color, is_system, is_locked, sort_order, created_at
         FROM subcategories
         WHERE id = ?`
      )
      .get(id)
  );
}

function getSubcategoryByName(typeId: string, name: string) {
  return asRecord<SubcategoryRow | undefined>(
    db
      .prepare(
        `SELECT id, type_id, name, icon, color, is_system, is_locked, sort_order, created_at
         FROM subcategories
         WHERE type_id = ?
           AND name = ? COLLATE NOCASE
         LIMIT 1`
      )
      .get(typeId, name)
  );
}

function listSubcategoriesForType(typeId: string) {
  return asRecords<SubcategoryRow>(
    db
      .prepare(
        `SELECT id, type_id, name, icon, color, is_system, is_locked, sort_order, created_at
         FROM subcategories
         WHERE type_id = ?
         ORDER BY sort_order, name`
      )
      .all(typeId)
  ).map(mapSubcategory);
}

function getCategoryRow(id: string) {
  return asRecord<CategoryRow | undefined>(
    db
      .prepare(
        `SELECT id, name, icon, color, is_system, is_locked, sort_order, created_at
         FROM categories
         WHERE id = ?`
      )
      .get(id)
  );
}

function getTransactionRow(id: string) {
  return asRecord<TransactionRow | undefined>(
    db.prepare("SELECT * FROM transactions WHERE id = ?").get(id)
  );
}

function requireAccount(id: string) {
  const account = getAccountRow(id);
  if (!account) {
    throw badRequest("Selected account does not exist.");
  }
  if (account.is_archived) {
    throw badRequest("Selected account is archived.");
  }
  return account;
}

function requireCategory(id: string) {
  const category = getCategoryRow(id);
  if (!category) {
    throw badRequest("Selected category does not exist.");
  }
  return category;
}

function resolveTransactionTaxonomy(input: CreateTransactionInput) {
  let typeId = input.typeId;
  let subcategoryId = input.subcategoryId ?? input.categoryId;
  let legacyCategoryId = input.categoryId ?? null;
  let type: CategoryTypeRow | undefined;
  let subcategory: SubcategoryRow | undefined;

  if (subcategoryId) {
    subcategory = getSubcategoryRow(subcategoryId);
    if (subcategory) {
      typeId = typeId ?? subcategory.type_id;
      legacyCategoryId = null;
    } else if (input.categoryId) {
      requireCategory(input.categoryId);
      subcategoryId = undefined;
    } else {
      throw badRequest("Selected SubType does not exist.");
    }
  }

  if (typeId) {
    type = requireCategoryType(typeId);
  }

  if (subcategory && typeId && subcategory.type_id !== typeId) {
    throw badRequest("Selected SubType does not belong to the selected Type.");
  }

  if (type) {
    const expectedKinds = behaviorToKinds(type.behavior);
    if (!expectedKinds.includes(input.kind)) {
      throw badRequest(`Selected Type does not match the transaction behavior.`);
    }
  }

  return {
    typeId: type?.id ?? null,
    subcategoryId: subcategory?.id ?? null,
    legacyCategoryId
  };
}

function validateTransactionAgainstAccounts(input: CreateTransactionInput, account: AccountRow) {
  if (input.method === "credit_card" && account.type !== "credit_card") {
    throw badRequest("Credit-card transactions must use a credit-card account.");
  }

  if (account.type === "credit_card" && input.method !== "credit_card") {
    throw badRequest("Credit-card account transactions must use the Credit card method.");
  }

  if (input.kind === "card_payment") {
    if (account.type !== "bank") {
      throw badRequest("Card payments must be paid from a bank account.");
    }
    if (input.direction !== "outflow") {
      throw badRequest("Card payments must be bank outflows.");
    }
    const target = requireAccount(input.transferAccountId ?? "");
    if (target.type !== "credit_card") {
      throw badRequest("Card payments must target a credit-card account.");
    }
  }

  if (input.subcategoryId === SELF_TRANSFER_SUBCATEGORY_ID) {
    if (account.type !== "bank") {
      throw badRequest("Self transfers must move money out of a bank account.");
    }
    if (input.direction !== "outflow") {
      throw badRequest("Self transfers must be recorded as an outflow from the source account.");
    }
    const target = requireAccount(input.transferAccountId ?? "");
    if (target.type !== "bank") {
      throw badRequest("Self transfers must move money into a bank account.");
    }
    if (target.is_archived) {
      throw badRequest("Self transfers cannot move money into an archived account.");
    }
  }
}

function insertSplits(
  transactionId: string,
  splits: NonNullable<CreateTransactionInput["splits"]>
) {
  const insert = db.prepare(
    `INSERT INTO transaction_splits (id, transaction_id, category_id, subcategory_id, amount_paise)
     VALUES (?, ?, ?, ?, ?)`
  );

  for (const split of splits) {
    const subcategoryId = split.subcategoryId ?? split.categoryId;
    let legacyCategoryId = split.categoryId ?? null;
    if (!subcategoryId) {
      throw badRequest("Split must choose a SubType.");
    }
    const subcategory = getSubcategoryRow(subcategoryId);
    if (subcategory) {
      legacyCategoryId = null;
    } else if (split.categoryId) {
      requireCategory(split.categoryId);
    } else {
      throw badRequest("Selected split SubType does not exist.");
    }
    insert.run(randomUUID(), transactionId, legacyCategoryId, subcategory?.id ?? null, split.amountPaise);
  }
}

function getTransactionSplits(transactionId: string): NonNullable<CreateTransactionInput["splits"]> {
  const rows = asRecords<{ category_id: string | null; subcategory_id: string | null; amount_paise: number }>(
    db.prepare(
      `SELECT category_id, subcategory_id, amount_paise
       FROM transaction_splits
       WHERE transaction_id = ?
       ORDER BY rowid ASC`
    ).all(transactionId)
  );

  return rows.map((row) => ({
    categoryId: row.category_id ?? undefined,
    subcategoryId: row.subcategory_id ?? undefined,
    amountPaise: row.amount_paise
  }));
}

function behaviorToKinds(behavior: TaxonomyBehavior): TransactionKind[] {
  switch (behavior) {
    case "expense":
      return ["expense"];
    case "income":
      return ["income"];
    case "loan":
      return ["emi"];
    case "investment":
      return ["investment"];
    case "transfer":
      return ["transfer"];
    case "card_payment":
      return ["card_payment"];
    case "refund":
      return ["refund", "reversal"];
  }
}

function behaviorToKind(behavior: TaxonomyBehavior): TransactionKind {
  return behaviorToKinds(behavior)[0];
}

function directionForBehavior(behavior: TaxonomyBehavior): Direction {
  return behavior === "income" || behavior === "refund" ? "inflow" : "outflow";
}

function parseImportRow(
  row: {
    date: string;
    account: string;
    accountType: string;
    type: string;
    typeBehavior: string;
    subtype: string;
    method: string;
    amount: string;
    note: string;
  },
  context: ImportContext,
  batchId?: string
): { payload: CreateTransactionInput } | { error: string } {
  const date = normalizeImportDate(row.date);
  if (!date) {
    return { error: "Date must use ISO format YYYY-MM-DD." };
  }

  const accountResult = ensureImportAccount(context, row.account, row.accountType);
  if ("error" in accountResult) return accountResult;
  const account = accountResult.account;

  const typeResult = ensureImportType(context, row.type, row.typeBehavior);
  if ("error" in typeResult) return typeResult;
  const type = typeResult.type;

  const method = parseImportMethod(row.method);
  if (!method) {
    return { error: "Method must be UPI, Credit card, Bank transfer, Cash, or Other." };
  }

  if (account.type === "credit_card" && method !== "credit_card") {
    return { error: "Credit-card account rows must use Method = Credit card." };
  }

  if (method === "credit_card" && account.type !== "credit_card") {
    return { error: "Method = Credit card requires a credit-card account." };
  }

  const amountPaise = parseImportAmount(row.amount);
  if (amountPaise <= 0) {
    return { error: "Amount must be greater than zero." };
  }

  const payload: CreateTransactionInput = {
    batchId,
    date,
    accountId: account.id,
    method,
    merchant: undefined,
    note: row.note || undefined,
    typeId: type.id,
    amountPaise,
    direction: directionForBehavior(type.behavior),
    kind: behaviorToKind(type.behavior)
  };

  if (type.behavior === "card_payment") {
    if (account.type !== "bank") {
      return { error: "Credit Card Payment rows must use a bank account as Account." };
    }
    const targetResult = ensureImportAccount(
      context,
      row.subtype,
      "Credit card",
      "Credit Card Payment SubType"
    );
    if ("error" in targetResult) return targetResult;
    const targetCard = targetResult.account;
    if (targetCard.type !== "credit_card") {
      return { error: `SubType must be a credit-card name for Credit Card Payment.` };
    }
    payload.transferAccountId = targetCard.id;
    return { payload };
  }

  const subcategoryResult = ensureImportSubcategory(context, type, row.subtype);
  if ("error" in subcategoryResult) return subcategoryResult;

  payload.subcategoryId = subcategoryResult.subcategory.id;
  return { payload };
}

function exactImportDuplicateKey(input: CreateTransactionInput) {
  return [
    input.date,
    input.accountId,
    input.method,
    input.amountPaise,
    input.direction,
    input.kind,
    input.typeId ?? "",
    input.subcategoryId ?? "",
    input.transferAccountId ?? "",
    input.merchant ?? "",
    input.note ?? ""
  ].join("\u001f");
}

function exactTransactionExists(input: CreateTransactionInput) {
  const row = asRecord<{ id: string } | undefined>(
    db
      .prepare(
        `SELECT id
         FROM transactions
         WHERE date = ?
           AND account_id = ?
           AND method = ?
           AND amount_paise = ?
           AND direction = ?
           AND kind = ?
           AND COALESCE(type_id, '') = ?
           AND COALESCE(subcategory_id, '') = ?
           AND COALESCE(transfer_account_id, '') = ?
           AND COALESCE(merchant, '') = ?
           AND COALESCE(note, '') = ?
         LIMIT 1`
      )
      .get(
        input.date,
        input.accountId,
        input.method,
        input.amountPaise,
        input.direction,
        input.kind,
        input.typeId ?? "",
        input.subcategoryId ?? "",
        input.transferAccountId ?? "",
        input.merchant ?? "",
        input.note ?? ""
      )
  );

  return Boolean(row);
}

function importAccountNameById(context: ImportContext, id: string) {
  for (const account of context.accountsByName.values()) {
    if (account.id === id) return account.name;
  }
  return "Unknown account";
}

type ImportContext = {
  accountsByName: Map<string, AccountRow>;
  typesByName: Map<string, CategoryTypeRow>;
  subcategoriesByTypeAndName: Map<string, SubcategoryRow>;
  plannedAccounts: AccountRow[];
  plannedTypes: CategoryTypeRow[];
  plannedSubcategories: SubcategoryRow[];
  createdAccounts: string[];
  createdTypes: string[];
  createdSubcategories: string[];
  warnings: string[];
};

function buildImportContext(): ImportContext {
  const accounts = asRecords<AccountRow>(
    db
      .prepare(
        `SELECT id, name, type, starting_balance_paise, credit_limit_paise,
                is_archived, created_at, updated_at
         FROM accounts
         WHERE is_archived = 0`
      )
      .all()
  );
  const types = asRecords<CategoryTypeRow>(
    db
      .prepare(
        `SELECT id, name, behavior, icon, color, is_system, is_locked, sort_order, created_at
         FROM category_types`
      )
      .all()
  );
  const subcategories = asRecords<SubcategoryRow>(
    db
      .prepare(
        `SELECT id, type_id, name, icon, color, is_system, is_locked, sort_order, created_at
         FROM subcategories`
      )
      .all()
  );

  return {
    accountsByName: new Map(accounts.map((account) => [importKey(account.name), account])),
    typesByName: new Map(types.map((type) => [importKey(type.name), type])),
    subcategoriesByTypeAndName: new Map(
      subcategories.map((subcategory) => [importSubcategoryKey(subcategory.type_id, subcategory.name), subcategory])
    ),
    plannedAccounts: [],
    plannedTypes: [],
    plannedSubcategories: [],
    createdAccounts: [],
    createdTypes: [],
    createdSubcategories: [],
    warnings: []
  };
}

function ensureImportAccount(
  context: ImportContext,
  rawName: string,
  rawType: string,
  sourceLabel = "Account"
): { account: AccountRow } | { error: string } {
  const name = rawName.trim();
  if (!name) {
    return { error: `${sourceLabel} is required.` };
  }

  const type = parseImportAccountType(rawType);
  if (!type) {
    return { error: `${sourceLabel} Type must be Bank account, Credit card, or Food card.` };
  }

  const key = importKey(name);
  const existing = context.accountsByName.get(key);
  if (existing) {
    if (existing.type !== type) {
      return {
        error: `${sourceLabel} "${name}" already exists as ${importAccountTypeLabel(existing.type)}, but this row says ${importAccountTypeLabel(type)}.`
      };
    }
    return { account: existing };
  }

  const now = new Date().toISOString();
  const account: AccountRow = {
    id: randomUUID(),
    name,
    type,
    starting_balance_paise: 0,
    credit_limit_paise: type === "credit_card" ? 0 : null,
    is_archived: 0,
    created_at: now,
    updated_at: now
  };
  context.accountsByName.set(key, account);
  context.plannedAccounts.push(account);
  context.createdAccounts.push(`${account.name} (${importAccountTypeLabel(account.type)})`);

  if (account.type === "credit_card") {
    context.warnings.push(`Created credit card "${account.name}" with credit limit ₹0. Update the limit in Accounts.`);
  }

  return { account };
}

function ensureImportType(
  context: ImportContext,
  rawName: string,
  rawBehavior: string
): { type: CategoryTypeRow } | { error: string } {
  const name = rawName.trim();
  if (!name) {
    return { error: "Type is required." };
  }

  const existing = context.typesByName.get(importKey(name));
  const parsedBehavior = rawBehavior.trim() ? parseImportBehavior(rawBehavior) : null;
  if (rawBehavior.trim() && !parsedBehavior) {
    return { error: "Type Behavior must be Expense, Income, Loan, Investment, Transfer, Refund, or Credit Card Payment." };
  }

  if (existing) {
    if (parsedBehavior && parsedBehavior !== existing.behavior) {
      return {
        error: `Type "${name}" already exists with behavior ${importBehaviorLabel(existing.behavior)}, but this row says ${importBehaviorLabel(parsedBehavior)}.`
      };
    }
    return { type: existing };
  }

  if (!parsedBehavior) {
    return { error: `New Type "${name}" needs a Type Behavior.` };
  }
  if (parsedBehavior === "card_payment") {
    return { error: `Use the default "Credit Card Payment" Type instead of creating another card-payment Type.` };
  }

  const style = defaultImportStyleForBehavior(parsedBehavior);
  const now = new Date().toISOString();
  const type: CategoryTypeRow = {
    id: randomUUID(),
    name,
    behavior: parsedBehavior,
    icon: style.icon,
    color: style.color,
    is_system: 0,
    is_locked: 0,
    sort_order: nextImportTypeSort(context),
    created_at: now
  };

  context.typesByName.set(importKey(name), type);
  context.plannedTypes.push(type);
  context.createdTypes.push(`${type.name} (${importBehaviorLabel(type.behavior)})`);
  return { type };
}

function ensureImportSubcategory(
  context: ImportContext,
  type: CategoryTypeRow,
  rawName: string
): { subcategory: SubcategoryRow } | { error: string } {
  const name = rawName.trim();
  if (!name) {
    return { error: "SubType is required." };
  }

  const key = importSubcategoryKey(type.id, name);
  const existing = context.subcategoriesByTypeAndName.get(key);
  if (existing) {
    return { subcategory: existing };
  }

  const now = new Date().toISOString();
  const subcategory: SubcategoryRow = {
    id: randomUUID(),
    type_id: type.id,
    name,
    icon: type.icon,
    color: type.color,
    is_system: 0,
    is_locked: 0,
    sort_order: nextImportSubcategorySort(context, type.id),
    created_at: now
  };

  context.subcategoriesByTypeAndName.set(key, subcategory);
  context.plannedSubcategories.push(subcategory);
  context.createdSubcategories.push(`${type.name} > ${subcategory.name}`);
  return { subcategory };
}

function insertImportPlans(context: ImportContext) {
  const insertAccount = db.prepare(
    `INSERT INTO accounts
      (id, name, type, starting_balance_paise, credit_limit_paise, is_archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertType = db.prepare(
    `INSERT INTO category_types
      (id, name, behavior, icon, color, is_system, is_locked, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertSubcategory = db.prepare(
    `INSERT INTO subcategories
      (id, type_id, name, icon, color, is_system, is_locked, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const account of context.plannedAccounts) {
    insertAccount.run(
      account.id,
      account.name,
      account.type,
      account.starting_balance_paise,
      account.credit_limit_paise,
      account.is_archived,
      account.created_at,
      account.updated_at
    );
  }

  for (const type of context.plannedTypes) {
    insertType.run(
      type.id,
      type.name,
      type.behavior,
      type.icon,
      type.color,
      type.is_system,
      type.is_locked,
      type.sort_order,
      type.created_at
    );
  }

  for (const subcategory of context.plannedSubcategories) {
    insertSubcategory.run(
      subcategory.id,
      subcategory.type_id,
      subcategory.name,
      subcategory.icon,
      subcategory.color,
      subcategory.is_system,
      subcategory.is_locked,
      subcategory.sort_order,
      subcategory.created_at
    );
  }
}

function parseImportMethod(value: string): CreateTransactionInput["method"] | null {
  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, " ");
  if (normalized === "upi") return "upi";
  if (normalized === "credit card") return "credit_card";
  if (normalized === "bank transfer") return "bank_transfer";
  if (normalized === "cash") return "cash";
  if (normalized === "other") return "other";
  return null;
}

function parseImportAccountType(value: string): AccountType | null {
  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, " ");
  if (normalized === "bank" || normalized === "bank account") return "bank";
  if (normalized === "credit card" || normalized === "card") return "credit_card";
  if (normalized === "food card" || normalized === "foodcard" || normalized === "wallet") return "food_card";
  return null;
}

function parseImportBehavior(value: string): TaxonomyBehavior | null {
  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, " ");
  if (normalized === "expense") return "expense";
  if (normalized === "income") return "income";
  if (normalized === "loan" || normalized === "emi") return "loan";
  if (normalized === "investment") return "investment";
  if (normalized === "transfer") return "transfer";
  if (normalized === "refund" || normalized === "reversal") return "refund";
  if (normalized === "credit card payment" || normalized === "card payment") return "card_payment";
  return null;
}

function importAccountTypeLabel(type: AccountType) {
  if (type === "credit_card") return "Credit card";
  if (type === "food_card") return "Food card";
  return "Bank account";
}

function importBehaviorLabel(behavior: TaxonomyBehavior) {
  if (behavior === "card_payment") return "Credit Card Payment";
  return behavior.charAt(0).toUpperCase() + behavior.slice(1);
}

function defaultImportStyleForBehavior(behavior: TaxonomyBehavior) {
  switch (behavior) {
    case "income":
      return { icon: "arrow-down-circle", color: "#059669" };
    case "loan":
      return { icon: "calendar-clock", color: "#be123c" };
    case "investment":
      return { icon: "trending-up", color: "#0284c7" };
    case "transfer":
      return { icon: "arrow-left-right", color: "#4f46e5" };
    case "refund":
      return { icon: "rotate-ccw", color: "#d97706" };
    case "card_payment":
      return { icon: "credit-card", color: "#ea580c" };
    case "expense":
    default:
      return { icon: "shopping-basket", color: "#16a34a" };
  }
}

function nextImportTypeSort(context: ImportContext) {
  const maxSort = asRecord<{ max_sort: number | null }>(
    db.prepare("SELECT MAX(sort_order) AS max_sort FROM category_types").get()
  );
  return (maxSort.max_sort ?? 0) + context.plannedTypes.length + 1;
}

function nextImportSubcategorySort(context: ImportContext, typeId: string) {
  const maxSort = asRecord<{ max_sort: number | null }>(
    db.prepare("SELECT MAX(sort_order) AS max_sort FROM subcategories WHERE type_id = ?").get(typeId)
  );
  const plannedMax = context.plannedSubcategories
    .filter((subcategory) => subcategory.type_id === typeId)
    .reduce((max, subcategory) => Math.max(max, subcategory.sort_order), 0);
  return Math.max(maxSort.max_sort ?? 0, plannedMax) + 1;
}

function importKey(value: string) {
  return value.trim().toLowerCase();
}

function importSubcategoryKey(typeId: string, name: string) {
  return `${typeId}:${importKey(name)}`;
}

function parseImportAmount(value: string) {
  const cleaned = value.replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return 0;
  }
  const [rupees, paise = ""] = cleaned.split(".");
  return Number(rupees) * 100 + Number(paise.padEnd(2, "0"));
}

function normalizeImportDate(value: string) {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function cellText(value: ExcelJS.CellValue) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return localIsoDate(value);
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
  }
  return String(value).trim();
}

function currentIsoDate() {
  return localIsoDate(new Date());
}

function cardPaymentSubTypeName(transaction: TransactionSummary) {
  return transaction.transferAccountName ?? "";
}

function findDuplicateCandidates(input: {
  id: string;
  accountId: string;
  date: string;
  amountPaise: number;
  direction: Direction;
}) {
  const rows = asRecords<TransactionRow & JoinedFields>(
    db
      .prepare(
        `SELECT ${transactionSelectFields}
         FROM transactions t
         JOIN accounts a ON a.id = t.account_id
         LEFT JOIN categories c ON c.id = t.category_id
         LEFT JOIN category_types ct ON ct.id = t.type_id
         LEFT JOIN subcategories sc ON sc.id = t.subcategory_id
         LEFT JOIN accounts ta ON ta.id = t.transfer_account_id
         LEFT JOIN loan_payments lp ON lp.transaction_id = t.id
         LEFT JOIN loans l ON l.id = lp.loan_id
         LEFT JOIN autopay_payments ap ON ap.transaction_id = t.id
         LEFT JOIN autopay_subscriptions s ON s.id = ap.subscription_id
         LEFT JOIN investment_payments ip ON ip.transaction_id = t.id
         LEFT JOIN investments iv ON iv.id = ip.investment_id
WHERE t.id != ?
           AND t.account_id = ?
           AND t.amount_paise = ?
           AND t.direction = ?
           AND ABS(julianday(t.date) - julianday(?)) <= 2
         ORDER BY t.date DESC
         LIMIT 5`
      )
      .all(input.id, input.accountId, input.amountPaise, input.direction, input.date)
  );

  return rows.map(mapTransaction);
}

function mapAccountWithBalance(account: AccountRow): AccountSummary {
  if (account.type === "credit_card") {
    const cardActivity = asRecord<{ total: number | null }>(
      db
        .prepare(
          `SELECT SUM(
             CASE
               WHEN account_id = ? AND direction = 'outflow' THEN amount_paise
               WHEN account_id = ? AND direction = 'inflow' THEN -amount_paise
               WHEN kind = 'card_payment' AND transfer_account_id = ? THEN -amount_paise
               ELSE 0
             END
           ) AS total
           FROM transactions
           WHERE account_id = ? OR transfer_account_id = ?`
        )
        .get(account.id, account.id, account.id, account.id, account.id)
    );
    const outstanding = account.starting_balance_paise + (cardActivity.total ?? 0);
    const creditLimit = account.credit_limit_paise ?? 0;

    return {
      id: account.id,
      name: account.name,
      type: account.type,
      startingBalancePaise: account.starting_balance_paise,
      creditLimitPaise: creditLimit,
      balancePaise: 0,
      outstandingPaise: outstanding,
      availableLimitPaise: Math.max(creditLimit - outstanding, 0),
      isArchived: Boolean(account.is_archived)
    };
  }

  const bankActivity = asRecord<{ total: number | null }>(
    db
      .prepare(
        `SELECT SUM(
           CASE
             WHEN account_id = ? AND direction = 'inflow' THEN amount_paise
             WHEN account_id = ? THEN -amount_paise
             ELSE amount_paise
           END
         ) AS total
         FROM transactions
         WHERE account_id = ?
            OR (subcategory_id = ? AND transfer_account_id = ?)`
      )
      .get(account.id, account.id, account.id, SELF_TRANSFER_SUBCATEGORY_ID, account.id)
  );
  const balance = account.starting_balance_paise + (bankActivity.total ?? 0);

  return {
    id: account.id,
    name: account.name,
    type: account.type,
    startingBalancePaise: account.starting_balance_paise,
    creditLimitPaise: null,
    balancePaise: balance,
    outstandingPaise: 0,
    availableLimitPaise: null,
    isArchived: Boolean(account.is_archived)
  };
}

function mapCategoryType(row: CategoryTypeRow): Omit<CategoryTypeSummary, "subcategories"> {
  return {
    id: row.id,
    name: row.name,
    behavior: row.behavior,
    icon: row.icon,
    color: row.color,
    isSystem: Boolean(row.is_system),
    isLocked: Boolean(row.is_locked),
    sortOrder: row.sort_order
  };
}

function mapSubcategory(row: SubcategoryRow): SubcategorySummary {
  return {
    id: row.id,
    typeId: row.type_id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    isSystem: Boolean(row.is_system),
    isLocked: Boolean(row.is_locked),
    sortOrder: row.sort_order
  };
}

type JoinedFields = {
  account_name: string;
  account_type: AccountType;
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
  type_name: string | null;
  type_behavior: TaxonomyBehavior | null;
  type_icon: string | null;
  type_color: string | null;
  subcategory_name: string | null;
  subcategory_icon: string | null;
  subcategory_color: string | null;
  transfer_account_name: string | null;
  loan_id: string | null;
  loan_name: string | null;
  loan_payment_type: LoanPaymentType | null;
  loan_principal_paise: number | null;
  loan_interest_paise: number | null;
  subscription_id: string | null;
  subscription_name: string | null;
  investment_id: string | null;
  investment_name: string | null;
};

const transactionSelectFields = `
  t.id,
  t.batch_id,
  t.date,
  t.account_id,
  t.method,
  t.merchant,
  t.note,
  t.category_id,
  t.type_id,
  t.subcategory_id,
  t.amount_paise,
  t.direction,
  t.kind,
  t.status,
  t.transfer_account_id,
  t.linked_transaction_id,
  t.created_at,
  t.updated_at,
  a.name AS account_name,
  a.type AS account_type,
  c.name AS category_name,
  c.icon AS category_icon,
  c.color AS category_color,
  ct.name AS type_name,
  ct.behavior AS type_behavior,
  ct.icon AS type_icon,
  ct.color AS type_color,
  sc.name AS subcategory_name,
  sc.icon AS subcategory_icon,
  sc.color AS subcategory_color,
  ta.name AS transfer_account_name,
  lp.loan_id AS loan_id,
  l.name AS loan_name,
  lp.payment_type AS loan_payment_type,
  lp.principal_paise AS loan_principal_paise,
  lp.interest_paise AS loan_interest_paise,
  ap.subscription_id AS subscription_id,
  s.name AS subscription_name,
  ip.investment_id AS investment_id,
  iv.name AS investment_name
`;

function mapTransaction(row: TransactionRow & JoinedFields): TransactionSummary {
  return {
    id: row.id,
    batchId: row.batch_id,
    date: row.date,
    accountId: row.account_id,
    accountName: row.account_name,
    accountType: row.account_type,
    method: row.method,
    merchant: row.merchant,
    note: row.note,
    categoryId: row.subcategory_id ?? row.category_id,
    categoryName: row.subcategory_name ?? row.category_name,
    categoryIcon: row.subcategory_icon ?? row.category_icon,
    categoryColor: row.subcategory_color ?? row.category_color,
    typeId: row.type_id,
    typeName: row.type_name,
    typeIcon: row.type_icon,
    typeColor: row.type_color,
    typeBehavior: row.type_behavior,
    subcategoryId: row.subcategory_id,
    subcategoryName: row.subcategory_name,
    subcategoryIcon: row.subcategory_icon,
    subcategoryColor: row.subcategory_color,
    amountPaise: row.amount_paise,
    direction: row.direction,
    kind: row.kind,
    status: row.status,
    transferAccountId: row.transfer_account_id,
    transferAccountName: row.transfer_account_name,
    linkedTransactionId: row.linked_transaction_id,
    loanId: row.loan_id,
    loanName: row.loan_name,
    loanPaymentType: row.loan_payment_type,
    loanPrincipalPaise: row.loan_principal_paise,
    loanInterestPaise: row.loan_interest_paise,
    subscriptionId: row.subscription_id,
    subscriptionName: row.subscription_name,
    investmentId: row.investment_id,
    investmentName: row.investment_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function resolveReportRange(month: string, from?: string, to?: string) {
  const safeMonth = /^\d{4}-\d{2}$/.test(month) ? month : currentMonth();
  const start = from && isIsoDate(from) ? from : `${safeMonth}-01`;
  const end = to && isIsoDate(to) ? to : monthEndDate(safeMonth);

  if (start > end) {
    throw badRequest("From date must be before or equal to To date.");
  }

  return { month: safeMonth, start, end };
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function currentMonth() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

function localMonthFromSqliteTimestamp(timestamp: string) {
  const parsed = new Date(`${timestamp.replace(" ", "T")}Z`);
  if (Number.isNaN(parsed.getTime())) {
    return currentMonth();
  }
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

function monthsBetween(startMonth: string, endMonth: string) {
  const [startYear, startIndex] = startMonth.split("-").map(Number);
  const [endYear, endIndex] = endMonth.split("-").map(Number);
  return Math.max((endYear - startYear) * 12 + (endIndex - startIndex), 0);
}

function paidInstallmentsThroughMonth(startMonth: string, throughMonth: string, tenureMonths: number) {
  if (startMonth > throughMonth) {
    return 0;
  }
  return Math.min(monthsBetween(startMonth, throughMonth) + 1, tenureMonths);
}

function addMonths(month: string, count: number) {
  const [year, monthIndex] = month.split("-").map(Number);
  const date = new Date(year, monthIndex - 1 + count, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthEndDate(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  return localIsoDate(new Date(year, monthIndex, 0));
}

function addMonthsToIsoDate(isoDate: string, count: number) {
  const [year, monthIndex, day] = isoDate.split("-").map(Number);
  const target = new Date(year, monthIndex - 1 + count, 1);
  const daysInTargetMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const clampedDay = Math.min(day, daysInTargetMonth);
  return localIsoDate(new Date(target.getFullYear(), target.getMonth(), clampedDay));
}

function localIsoDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function csvCell(value: string) {
  // Neutralize spreadsheet formula injection: a cell that a spreadsheet would
  // read as a formula (leading = + - @, or a leading control character) is
  // prefixed with a single quote so Excel/Sheets treat it as plain text.
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}

function setSetting(key: string, value: string) {
  db.prepare(
    `INSERT INTO settings (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

function setOptionalSetting(key: string, value: string | null) {
  if (value === null) {
    db.prepare("DELETE FROM settings WHERE key = ?").run(key);
    return;
  }

  setSetting(key, value);
}

function restoreBackupStatus(status: {
  lastBackupAt: string | null;
  lastBackupPath: string | null;
  lastBackupMode: string | null;
}) {
  setOptionalSetting("last_backup_at", status.lastBackupAt);
  setOptionalSetting("last_backup_path", status.lastBackupPath);
  setOptionalSetting("last_backup_mode", status.lastBackupMode);
}

export function badRequest(message: string) {
  const error = new Error(message);
  Object.assign(error, { statusCode: 400 });
  return error;
}

export function notFound(message: string) {
  const error = new Error(message);
  Object.assign(error, { statusCode: 404 });
  return error;
}
