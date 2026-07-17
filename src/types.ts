export type AccountType = "bank" | "credit_card" | "food_card";
export type Direction = "inflow" | "outflow";
export type LoanPaymentType = "emi" | "prepayment";
export type TransactionKind =
  | "expense"
  | "income"
  | "refund"
  | "transfer"
  | "card_payment"
  | "reversal"
  | "investment"
  | "emi";
export type PaymentMethod = "upi" | "credit_card" | "bank_transfer" | "cash" | "other";
export type TaxonomyBehavior =
  | "expense"
  | "income"
  | "loan"
  | "investment"
  | "transfer"
  | "card_payment"
  | "refund";
export type BudgetScopeType = "type" | "subcategory";

export type Account = {
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

export type Category = {
  id: string;
  name: string;
  icon: string;
  color: string;
  isSystem: boolean;
  isLocked: boolean;
  sortOrder: number;
};

export type Subcategory = {
  id: string;
  typeId: string;
  name: string;
  icon: string;
  color: string;
  isSystem: boolean;
  isLocked: boolean;
  sortOrder: number;
};

export type CategoryType = {
  id: string;
  name: string;
  behavior: TaxonomyBehavior;
  icon: string;
  color: string;
  isSystem: boolean;
  isLocked: boolean;
  sortOrder: number;
  subcategories: Subcategory[];
};

export type Transaction = {
  id: string;
  batchId: string | null;
  date: string;
  accountId: string;
  accountName: string;
  accountType: AccountType;
  method: PaymentMethod;
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

export type AutopaySubscription = {
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

export type Loan = {
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

export type Bootstrap = {
  settings: Record<string, string>;
  profile: UserProfile;
  accounts: Account[];
  categoryTypes: CategoryType[];
  loans: Loan[];
  subscriptions: AutopaySubscription[];
  investments: Investment[];
};

export type UserProfile = {
  name: string;
  email: string;
  age: string;
};

export type BackupStatus = {
  intervalMs: number;
  lastBackupAt: string | null;
  lastBackupPath: string | null;
  lastBackupMode: "manual" | "auto" | "shutdown" | null;
};

export type Batch = {
  id: string;
  weekStart: string;
  weekEnd: string;
  status: "draft" | "saved";
  createdAt: string;
  savedAt: string | null;
};

export type Overview = {
  month: string;
  accounts: Account[];
  summary: {
    availableCashPaise: number;
    creditOutstandingPaise: number;
    totalSpendingPaise: number;
    totalOutflowPaise: number;
    incomePaise: number;
    uncategorizedCount: number;
  };
  recentTransactions: Transaction[];
  categoryReport: ReportCategory[];
};

export type ReportCategory = {
  categoryId: string;
  subcategoryId?: string;
  typeId?: string;
  name: string;
  icon: string;
  color: string;
  amountPaise: number;
  share: number;
};

export type ReportType = {
  typeId: string;
  name: string;
  behavior: TaxonomyBehavior | "uncategorized";
  icon: string;
  color: string;
  amountPaise: number;
  share: number;
  subcategories: Array<{
    subcategoryId: string;
    name: string;
    icon: string;
    color: string;
    amountPaise: number;
    share: number;
  }>;
};

export type MonthlyReport = {
  month: string;
  start: string;
  end: string;
  totalSpendingPaise: number;
  totalOutflowPaise: number;
  incomePaise: number;
  emiPaise: number;
  loanPaise: number;
  investmentPaise: number;
  categories: ReportCategory[];
  types: ReportType[];
};

export type WealthSummary = {
  netWorth: {
    liquidPaise: number;
    investmentsPaise: number;
    liabilitiesPaise: number;
    netWorthPaise: number;
  };
  history: Array<{ month: string; netWorthPaise: number }>;
  allocation: Array<{ key: string; label: string; color: string; valuePaise: number }>;
  cashflow: {
    incomePaise: number;
    expensePaise: number;
    savedPaise: number;
    savingsRatePercent: number;
  };
  runwayMonths: number | null;
};

export type InvestmentType = "stocks" | "mutual_funds" | "gold" | "land" | "property" | "pf" | "other";

export type Investment = {
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

export type BudgetTrendPoint = {
  label: string;
  actualPaise: number;
  budgetPaise: number | null;
};

export type BudgetTrendReport = {
  mode: TrendMode;
  subcategoryId: string;
  name: string;
  typeName: string;
  color: string;
  month: string | null;
  points: BudgetTrendPoint[];
};

export type PaymentHistory = { source: string; id: string; year: number; months: boolean[] };

export type BudgetStatus = "safe" | "watch" | "critical" | "over";

export type BudgetScope = {
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

export type BudgetLine = BudgetScope & {
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
  lines: BudgetLine[];
  availableScopes: BudgetScope[];
};

export type CreateTransactionPayload = {
  batchId?: string;
  date: string;
  accountId: string;
  method: PaymentMethod;
  merchant?: string;
  note?: string;
  categoryId?: string;
  typeId?: string;
  subcategoryId?: string;
  amountPaise: number;
  direction: Direction;
  kind: TransactionKind;
  transferAccountId?: string;
  linkedTransactionId?: string;
  loanId?: string;
  loanPaymentType?: LoanPaymentType;
  subscriptionId?: string;
  investmentId?: string;
  splits?: Array<{
    categoryId: string;
    amountPaise: number;
  }>;
};
