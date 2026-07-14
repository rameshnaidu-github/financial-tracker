import {
  ArrowDownUp,
  BarChart3,
  CalendarClock,
  CalendarDays,
  Check,
  CircleHelp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CreditCard,
  Download,
  FileSpreadsheet,
  Home,
  Info,
  Landmark,
  Loader2,
  Archive,
  Moon,
  Pencil,
  PiggyBank,
  Plus,
  RotateCcw,
  Search,
  Sun,
  Tags,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  UserCircle,
  Utensils,
  WalletCards
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Api } from "./api";
import {
  currentMonth,
  formatINR,
  formatMonth,
  formatShortDate,
  mondayWeekRange,
  parseAmountToPaise,
  signedAmount,
  todayISO
} from "./format";
import { IconGlyph } from "./icons";
import { cashflowPartsFromTypes, INFLOW_BEHAVIORS, type CashflowPart } from "./report-cashflow";
import type {
  Account,
  AutopaySubscription,
  BackupStatus,
  Bootstrap,
  BudgetLine,
  BudgetPlan,
  BudgetScope,
  Category,
  CategoryType,
  CreateTransactionPayload,
  Investment,
  InvestmentType,
  Loan,
  LoanPaymentType,
  MonthlyReport,
  Overview,
  PaymentHistory,
  PaymentMethod,
  Subcategory,
  TaxonomyBehavior,
  Transaction,
  TransactionKind,
  TrendMode,
  TrendPoint,
  TrendReport,
  UserProfile,
  WealthSummary
} from "./types";
import { AUTOPAY_DURATION_MONTH_OPTIONS, AUTOPAY_SUBCATEGORY_ID, MUTUAL_FUNDS_SUBCATEGORY_ID, INVESTMENT_TYPES } from "../shared/finance";

type Page = "overview" | "weekly" | "transactions" | "reports" | "budgets" | "accounts" | "loans" | "investments" | "subscriptions" | "categories" | "faq" | "profile";
type Theme = "light" | "dark";
type DonutSegment = {
  id: string;
  name: string;
  color: string;
  amountPaise: number;
  labelShare?: number;
};
type ConfirmRequest = {
  message: string;
  detail?: string;
  confirmLabel?: string;
  tone?: "danger" | "neutral";
  onConfirm: () => Promise<void> | void;
};

const emptyProfile: UserProfile = {
  name: "",
  email: "",
  age: ""
};

const navItems: Array<{ page: Page; label: string; icon: typeof Home }> = [
  { page: "overview", label: "Overview", icon: Home },
  { page: "weekly", label: "Weekly Entry", icon: CalendarDays },
  { page: "transactions", label: "Transactions", icon: ArrowDownUp },
  { page: "reports", label: "Reports", icon: BarChart3 },
  { page: "budgets", label: "Budget Planner", icon: Target },
  { page: "accounts", label: "Accounts", icon: WalletCards },
  { page: "loans", label: "Loans", icon: Landmark },
  { page: "investments", label: "Investments", icon: TrendingUp },
  { page: "subscriptions", label: "AutoPay", icon: CalendarClock },
  { page: "categories", label: "Categories", icon: Tags },
  { page: "faq", label: "FAQ", icon: CircleHelp },
  { page: "profile", label: "Profile", icon: UserCircle }
];

const mobileLabels: Record<Page, string> = {
  overview: "Home",
  weekly: "Week",
  transactions: "Txns",
  reports: "Rpt",
  budgets: "Bdgt",
  accounts: "Accts",
  loans: "Loan",
  investments: "Invest",
  subscriptions: "Auto",
  categories: "Cats",
  faq: "FAQ",
  profile: "Me"
};

const pagePaths: Record<Page, string> = {
  overview: "/overview",
  weekly: "/weekly",
  transactions: "/transactions",
  reports: "/reports",
  budgets: "/budgets",
  accounts: "/accounts",
  loans: "/loans",
  investments: "/investments",
  subscriptions: "/subscriptions",
  categories: "/categories",
  faq: "/faq",
  profile: "/profile"
};

function pageFromPath(pathname: string): Page {
  const match = (Object.entries(pagePaths) as Array<[Page, string]>).find(([, path]) => path === pathname);
  return match?.[0] ?? "overview";
}

const iconOptions = [
  "shopping-basket",
  "utensils",
  "ticket",
  "film",
  "car",
  "receipt",
  "shopping-bag",
  "heart-pulse",
  "plane",
  "wallet",
  "credit-card",
  "arrow-down-circle",
  "arrow-left-right",
  "rotate-ccw",
  "circle-question",
  "home",
  "book-open",
  "coffee",
  "gift",
  "briefcase",
  "landmark",
  "trending-up",
  "calendar-clock"
];

const colorOptions = [
  "#16a34a",
  "#f97316",
  "#7c3aed",
  "#dc2626",
  "#2563eb",
  "#0f766e",
  "#db2777",
  "#10b981",
  "#0891b2",
  "#059669",
  "#4f46e5",
  "#d97706",
  "#ea580c",
  "#64748b",
  "#0284c7",
  "#be123c"
];

const INITIAL_TRANSACTION_LIMIT = 12;
const TRANSACTION_PAGE_SIZE = 10;

export default function App() {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [activePage, setActivePage] = useState<Page>(() =>
    typeof window === "undefined" ? "overview" : pageFromPath(window.location.pathname)
  );
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [profileDraft, setProfileDraft] = useState<UserProfile>(emptyProfile);
  const [profileSaving, setProfileSaving] = useState(false);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [theme, setTheme] = useState<Theme>(() =>
    typeof window !== "undefined" && window.localStorage.getItem("finance-theme") === "dark" ? "dark" : "light"
  );

  const loadBootstrap = useCallback(async () => {
    setError("");
    const data = await Api.bootstrap();
    setBootstrap(data);
  }, []);

  useEffect(() => {
    loadBootstrap()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [loadBootstrap]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("finance-theme", theme);
  }, [theme]);

  useEffect(() => {
    const onPopState = () => setActivePage(pageFromPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((page: Page) => {
    if (window.location.pathname !== pagePaths[page]) {
      window.history.pushState({}, "", pagePaths[page]);
    }
    setActivePage(page);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadBackupStatus() {
      try {
        const status = await Api.backupStatus();
        if (isMounted) setBackupStatus(status);
      } catch {
        if (isMounted) setBackupStatus(null);
      }
    }

    loadBackupStatus();
    const timer = window.setInterval(loadBackupStatus, 60_000);
    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const refresh = useCallback(async () => {
    await loadBootstrap();
    setRefreshKey((key) => key + 1);
  }, [loadBootstrap]);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
  }, []);

  const requestConfirm = useCallback((request: ConfirmRequest) => {
    setConfirmRequest(request);
  }, []);

  const saveProfile = useCallback(async () => {
    setProfileSaving(true);
    try {
      const updated = await Api.updateProfile(profileDraft);
      setBootstrap((current) =>
        current
          ? {
              ...current,
              profile: updated,
              settings: {
                ...current.settings,
                profile_name: updated.name,
                profile_email: updated.email,
                profile_age: updated.age
              }
            }
          : current
      );
      setProfileDraft(updated);
      showNotice("Profile saved.");
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Could not save profile.");
    } finally {
      setProfileSaving(false);
    }
  }, [profileDraft, showNotice]);

  const saveCardAlert = useCallback(
    async (percent: number) => {
      try {
        const settings = await Api.updateSettings({ cardUtilizationAlertPercent: percent });
        setBootstrap((current) => (current ? { ...current, settings } : current));
        showNotice("Card alert threshold saved.");
      } catch (err) {
        showNotice(err instanceof Error ? err.message : "Could not save the setting.");
      }
    },
    [showNotice]
  );

  const accounts = bootstrap?.accounts ?? [];
  const loans = bootstrap?.loans ?? [];
  const subscriptions = bootstrap?.subscriptions ?? [];
  const investments = bootstrap?.investments ?? [];
  const categoryTypes = bootstrap?.categoryTypes ?? [];
  const categories = flattenSubcategories(categoryTypes);
  const profile = bootstrap?.profile ?? emptyProfile;
  const cardAlertPercent = (() => {
    const parsed = Number(bootstrap?.settings?.card_utilization_alert_percent ?? "30");
    return Number.isFinite(parsed) && parsed >= 1 && parsed <= 100 ? Math.round(parsed) : 30;
  })();
  const activeAccounts = accounts.filter((account) => !account.isArchived);
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId);
  const showAccountFilter =
    activePage !== "accounts" &&
    activePage !== "budgets" &&
    activePage !== "loans" &&
    activePage !== "investments" &&
    activePage !== "subscriptions" &&
    activePage !== "categories" &&
    activePage !== "faq" &&
    activePage !== "profile";

  useEffect(() => {
    setProfileDraft(profile);
  }, [profile]);

  useEffect(() => {
    if (selectedAccountId && !activeAccounts.some((account) => account.id === selectedAccountId)) {
      setSelectedAccountId("");
    }
  }, [activeAccounts, selectedAccountId]);

  if (loading) {
    return <FullScreenState icon={<Loader2 className="spin" />} title="Loading Financial Tracker" />;
  }

  if (error) {
    return <FullScreenState icon={<CircleAlert />} title="Could not load app" detail={error} />;
  }

  if (!bootstrap || activeAccounts.length === 0) {
    return (
      <SetupPage
        categories={categories}
        onCreated={async () => {
          await refresh();
          navigate("overview");
          showNotice("First account added. Welcome in.");
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">₹</div>
          <div>
            <strong>Financial Tracker</strong>
          </div>
        </div>

        <nav className="nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.page}
                className={`nav-item ${item.page === "profile" ? "profile-nav-item" : ""} ${activePage === item.page ? "active" : ""}`}
                onClick={() => navigate(item.page)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Financial Tracker</p>
            <h1>{navItems.find((item) => item.page === activePage)?.label}</h1>
          </div>
          <div className="topbar-actions">
            {showAccountFilter && (
            <label className="control-field account-filter">
              <span className="control-label">Filter account/card</span>
              <select value={selectedAccountId} onChange={(event) => setSelectedAccountId(event.target.value)}>
                <option value="">All active accounts and cards</option>
                {activeAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {accountTypeLabel(account.type)}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} />
            </label>
            )}
          </div>
        </header>

        <section className="content-area">
          {activePage === "overview" && (
            <OverviewPage
              selectedAccountId={selectedAccountId}
              selectedAccount={selectedAccount}
              cardAlertPercent={cardAlertPercent}
              refreshKey={refreshKey}
              onNavigate={navigate}
            />
          )}
          {activePage === "weekly" && (
            <WeeklyEntryPage
              selectedAccountId={selectedAccountId}
              accounts={activeAccounts}
              loans={loans.filter((loan) => !loan.isArchived)}
              subscriptions={subscriptions.filter((subscription) => !subscription.isArchived)}
              mutualFunds={investments.filter((investment) => investment.type === "mutual_funds")}
              categoryTypes={categoryTypes}
              refresh={refresh}
              refreshKey={refreshKey}
              showNotice={showNotice}
              onNavigate={navigate}
              onAccountSelect={setSelectedAccountId}
            />
          )}
          {activePage === "transactions" && (
            <TransactionsPage
              selectedAccountId={selectedAccountId}
              accounts={activeAccounts}
              loans={loans.filter((loan) => !loan.isArchived)}
              subscriptions={subscriptions}
              mutualFunds={investments.filter((investment) => investment.type === "mutual_funds")}
              categoryTypes={categoryTypes}
              refresh={refresh}
              refreshKey={refreshKey}
              showNotice={showNotice}
              requestConfirm={requestConfirm}
            />
          )}
          {activePage === "reports" && (
            <ReportsPage selectedAccountId={selectedAccountId} categoryTypes={categoryTypes} refreshKey={refreshKey} />
          )}
          {activePage === "budgets" && (
            <BudgetPlannerPage
              refreshKey={refreshKey}
              showNotice={showNotice}
              requestConfirm={requestConfirm}
            />
          )}
          {activePage === "accounts" && (
            <AccountsPage
              accounts={accounts}
              cardAlertPercent={cardAlertPercent}
              refresh={refresh}
              showNotice={showNotice}
              requestConfirm={requestConfirm}
            />
          )}
          {activePage === "loans" && (
            <LoansPage
              loans={loans}
              categoryTypes={categoryTypes}
              refresh={refresh}
              showNotice={showNotice}
              requestConfirm={requestConfirm}
            />
          )}
          {activePage === "investments" && (
            <InvestmentsPage
              investments={investments}
              refresh={refresh}
              showNotice={showNotice}
              requestConfirm={requestConfirm}
            />
          )}
          {activePage === "subscriptions" && (
            <SubscriptionsPage
              subscriptions={subscriptions}
              refresh={refresh}
              showNotice={showNotice}
              requestConfirm={requestConfirm}
            />
          )}
          {activePage === "categories" && (
            <CategoriesPage
              categoryTypes={categoryTypes}
              refresh={refresh}
              showNotice={showNotice}
              requestConfirm={requestConfirm}
            />
          )}
          {activePage === "faq" && <FaqPage />}
          {activePage === "profile" && (
            <ProfilePage
              profile={profileDraft}
              settings={bootstrap.settings}
              backupStatus={backupStatus}
              theme={theme}
              saving={profileSaving}
              cardAlertPercent={cardAlertPercent}
              onProfileChange={setProfileDraft}
              onSaveProfile={saveProfile}
              onSaveCardAlert={saveCardAlert}
              onThemeToggle={() => setTheme((value) => (value === "dark" ? "light" : "dark"))}
            />
          )}
        </section>
      </main>

      <nav className="mobile-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.page}
              className={activePage === item.page ? "active" : ""}
              onClick={() => navigate(item.page)}
            >
              <Icon size={19} />
              <span>{mobileLabels[item.page]}</span>
            </button>
          );
        })}
      </nav>

      {notice && <div className="toast">{notice}</div>}
      {confirmRequest && (
        <ConfirmModal
          request={confirmRequest}
          onCancel={() => setConfirmRequest(null)}
          onDone={() => setConfirmRequest(null)}
        />
      )}
    </div>
  );
}

function SetupPage({
  categories,
  onCreated
}: {
  categories: Category[];
  onCreated: () => Promise<void>;
}) {
  return (
    <div className="setup-screen">
      <div className="setup-copy">
        <div className="brand setup-brand">
          <div className="brand-mark">₹</div>
          <div>
            <strong>Financial Tracker</strong>
            <span>Local SQLite database</span>
          </div>
        </div>
        <h1>Start with your first account.</h1>
        <p>
          Add one bank account, credit card, or food card. Balances will then come from the starting value plus
          transactions you enter.
        </p>
        <div className="category-cloud">
          {categories.map((category) => (
            <CategoryBadge key={category.id} category={category} />
          ))}
        </div>
      </div>
      <div className="panel setup-panel">
        <h2>Add account</h2>
        <AccountForm onCreated={onCreated} />
      </div>
    </div>
  );
}

function OverviewPage({
  selectedAccountId,
  selectedAccount,
  cardAlertPercent,
  refreshKey,
  onNavigate
}: {
  selectedAccountId: string;
  selectedAccount?: Account;
  cardAlertPercent: number;
  refreshKey: number;
  onNavigate: (page: Page) => void;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [allExpanded, setAllExpanded] = useState(true);
  const [budgetPlan, setBudgetPlan] = useState<BudgetPlan | null>(null);
  const [wealth, setWealth] = useState<WealthSummary | null>(null);

  useEffect(() => {
    setLoading(true);
    setLoadError("");
    Api.overview(selectedAccountId || undefined)
      .then(setOverview)
      .catch((err) => {
        setOverview(null);
        setLoadError(err instanceof Error ? err.message : "Could not load the overview.");
      })
      .finally(() => setLoading(false));
  }, [selectedAccountId, refreshKey]);

  useEffect(() => {
    let active = true;
    Api.budgetPlan()
      .then((plan) => {
        if (active) {
          setBudgetPlan(plan);
        }
      })
      .catch(() => {
        if (active) setBudgetPlan(null);
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    let active = true;
    Api.wealth()
      .then((next) => {
        if (active) setWealth(next);
      })
      .catch(() => {
        if (active) setWealth(null);
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  if (loading) {
    return <PanelLoader label="Loading overview" />;
  }

  if (loadError || !overview) {
    return <EmptyState text={loadError || "Could not load the overview."} />;
  }

  const spendingSegments = consolidateDonutSegments(
    overview.categoryReport.map((category) => ({
      id: category.subcategoryId ?? category.categoryId ?? category.name,
      name: category.name,
      color: category.color,
      amountPaise: category.amountPaise
    }))
  );
  const budgetAlerts =
    budgetPlan?.lines.filter((line) => line.status === "critical" || line.status === "over") ?? [];

  return (
    <div className="page-grid">
      <div className="overview-toolbar">
        <button
          type="button"
          className="secondary-action collapse-all-button"
          aria-expanded={allExpanded}
          onClick={() => setAllExpanded((value) => !value)}
        >
          <ChevronDown size={16} className={allExpanded ? "collapse-all-icon expanded" : "collapse-all-icon"} />
          {allExpanded ? "Collapse all" : "Expand all"}
        </button>
      </div>

      {budgetAlerts.length > 0 && (
        <section className="overview-budget-alert">
          <div className="budget-alert-head">
            <CircleAlert size={18} />
            <strong>Budgets to watch</strong>
            <button type="button" className="budget-alert-link" onClick={() => onNavigate("budgets")}>
              Open budget planner
            </button>
          </div>
          <table className="budget-alert-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>SubType</th>
                <th>Status</th>
                <th className="budget-alert-percent">% Used</th>
              </tr>
            </thead>
            <tbody>
              {budgetAlerts.map((line) => (
                <tr className={`budget-alert-row ${line.status}`} key={line.id}>
                  <td>{line.typeName}</td>
                  <td>{budgetSubLabel(line)}</td>
                  <td>
                    <span className={`budget-alert-status ${line.status}`}>{line.statusLabel}</span>
                  </td>
                  <td className="budget-alert-percent">
                    <span>{line.usedPercent}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <OverviewDisclosure title="Financial highlights" expanded={allExpanded}>
      <section className="summary-grid overview-summary">
        <SummaryCard
          label={selectedAccount?.type === "credit_card" ? "Available card limit" : "Available cash"}
          value={
            selectedAccount?.type === "credit_card"
              ? formatINR(selectedAccount.availableLimitPaise ?? 0)
              : formatINR(overview.summary.availableCashPaise)
          }
          icon={<WalletCards />}
        />
        <SummaryCard
          label="Credit card outstanding"
          value={formatINR(overview.summary.creditOutstandingPaise)}
          icon={<CreditCard />}
          tone="warning"
        />
        <SummaryCard
          label="Tracked spending"
          value={formatINR(overview.summary.totalSpendingPaise)}
          icon={<BarChart3 />}
        />
        <SummaryCard
          label="This month income"
          value={formatINR(overview.summary.incomePaise)}
          icon={<TrendingUp />}
        />
      </section>
      <p className="helper-text overview-summary-note">
        Tracked spending includes Expense, Loan, Investment and uncategorized report lines after refunds. It excludes
        credit-card payments and transfers so money movement is not double-counted as spending.
      </p>
      </OverviewDisclosure>

      <section className="two-column">
        <CollapsiblePanel title={`Recent activity · ${overview.recentTransactions.length}`} expanded={allExpanded} action={<button onClick={() => onNavigate("transactions")}>View all</button>}>
          <TransactionTable transactions={overview.recentTransactions} empty="No transactions yet." compact />
        </CollapsiblePanel>

        <CollapsiblePanel title={`Account snapshot · ${overview.accounts.length}`} expanded={allExpanded} action={<button onClick={() => onNavigate("accounts")}>Manage</button>}>
          <div className="account-stack">
            {overview.accounts.map((account) => (
              <OverviewAccountLine key={account.id} account={account} alertPercent={cardAlertPercent} />
            ))}
          </div>
        </CollapsiblePanel>
      </section>

      <section className="two-column overview-analytics">
        <CollapsiblePanel
          title={`Spending mix · ${formatMonth(overview.month)}`}
          expanded={allExpanded}
          action={<button onClick={() => onNavigate("reports")}>Open reports</button>}
        >
          {spendingSegments.length === 0 || overview.summary.totalSpendingPaise <= 0 ? (
            <EmptyState text="No category spending yet this month." />
          ) : (
            <DonutChart
              segments={spendingSegments}
              totalPaise={overview.summary.totalSpendingPaise}
              ariaLabel="Spending by category"
              centerLabel="Spent"
              centerValue={formatINR(overview.summary.totalSpendingPaise)}
              className="overview-donut-chart"
            />
          )}
        </CollapsiblePanel>

        <CollapsiblePanel title="Net worth" expanded={allExpanded}>
          {wealth ? (
            <NetWorthPanel wealth={wealth} />
          ) : (
            <EmptyState text="Net worth is loading." />
          )}
        </CollapsiblePanel>
      </section>

      <section className="two-column overview-analytics">
        <CollapsiblePanel title="Top spending lines" expanded={allExpanded} action={<button onClick={() => onNavigate("reports")}>Details</button>}>
          <CategoryBars categories={overview.categoryReport.slice(0, 5)} />
        </CollapsiblePanel>

        <CollapsiblePanel title="Budget guardrails" expanded={allExpanded} action={<button onClick={() => onNavigate("budgets")}>Plan</button>}>
          <BudgetGuardrails plan={budgetPlan} uncategorizedCount={overview.summary.uncategorizedCount} />
        </CollapsiblePanel>
      </section>

      <section className="overview-report-section">
        <CollapsiblePanel title="Asset allocation" expanded={allExpanded}>
          {wealth && wealth.allocation.length > 0 ? (
            <DonutChart
              segments={wealth.allocation.map((segment) => ({
                id: segment.key,
                name: segment.label,
                color: segment.color,
                amountPaise: segment.valuePaise
              }))}
              totalPaise={wealth.allocation.reduce((sum, segment) => sum + segment.valuePaise, 0)}
              ariaLabel="Asset allocation"
              centerLabel="Assets"
              centerValue={formatINR(wealth.allocation.reduce((sum, segment) => sum + segment.valuePaise, 0))}
              className="overview-donut-chart overview-donut-chart--large"
            />
          ) : (
            <EmptyState text="Add accounts or investments to see your allocation." />
          )}
        </CollapsiblePanel>
      </section>

      <section className="overview-report-section">
        <CollapsiblePanel title={`This month's cashflow · ${formatMonth(overview.month)}`} expanded={allExpanded}>
          {wealth ? <CashflowPanel wealth={wealth} /> : <EmptyState text="Cashflow is loading." />}
        </CollapsiblePanel>
      </section>
    </div>
  );
}

function NetWorthPanel({ wealth }: { wealth: WealthSummary }) {
  const { netWorth, history } = wealth;
  const points = history.map((row) => ({ label: formatMonth(row.month).slice(0, 3), amountPaise: row.netWorthPaise }));
  return (
    <div className="net-worth-panel">
      <div className="net-worth-headline">
        <span>Total net worth</span>
        <strong className={netWorth.netWorthPaise >= 0 ? "amount-in" : "amount-out"}>
          {formatINR(netWorth.netWorthPaise)}
        </strong>
      </div>
      <div className="net-worth-breakdown">
        <div>
          <span>Liquid cash</span>
          <strong>{formatINR(netWorth.liquidPaise)}</strong>
        </div>
        <div>
          <span>Investments</span>
          <strong>{formatINR(netWorth.investmentsPaise)}</strong>
        </div>
        <div>
          <span>Liabilities</span>
          <strong className="amount-out">−{formatINR(netWorth.liabilitiesPaise)}</strong>
        </div>
      </div>
      {points.length >= 2 ? (
        <TrendChart points={points} variant="line" color="#0284c7" />
      ) : (
        <p className="helper-text net-worth-hint">
          A month-by-month net-worth chart builds here as you keep using the app.
        </p>
      )}
    </div>
  );
}

function CashflowPanel({ wealth }: { wealth: WealthSummary }) {
  const { cashflow, runwayMonths } = wealth;
  return (
    <div className="cashflow-panel">
      <div className="cashflow-metrics">
        <div>
          <span>Income</span>
          <strong className="amount-in">{formatINR(cashflow.incomePaise)}</strong>
        </div>
        <div>
          <span>Spending</span>
          <strong className="amount-out">{formatINR(cashflow.expensePaise)}</strong>
        </div>
        <div>
          <span>Saved</span>
          <strong className={cashflow.savedPaise >= 0 ? "amount-in" : "amount-out"}>
            {signedImpact(cashflow.savedPaise)}
          </strong>
        </div>
        <div>
          <span>Savings rate</span>
          <strong className={cashflow.savingsRatePercent >= 0 ? "amount-in" : "amount-out"}>
            {cashflow.savingsRatePercent}%
          </strong>
        </div>
      </div>
      <div className="cashflow-runway">
        <span>Emergency-fund runway</span>
        <strong>{runwayMonths === null ? "—" : `${runwayMonths} months`}</strong>
        <small>How long your liquid cash covers your recent average monthly spending.</small>
      </div>
    </div>
  );
}

function BudgetGuardrails({
  plan,
  uncategorizedCount
}: {
  plan: BudgetPlan | null;
  uncategorizedCount: number;
}) {
  if (!plan || plan.lines.length === 0) {
    return <EmptyState text="Add budget lines to see month-to-date guardrails." />;
  }

  const usedPercent = boundedPercent(plan.totals.actualPaise, plan.totals.amountPaise);
  const paceDelta = Math.round(usedPercent - plan.elapsedPercent);
  const healthRows = [
    { label: "On track", value: plan.totals.safeCount, tone: "safe" },
    { label: "Watch", value: plan.totals.watchCount + plan.totals.criticalCount, tone: "watch" },
    { label: "Over", value: plan.totals.overCount, tone: "over" }
  ];

  return (
    <div className="budget-guardrails">
      <div className="budget-pace-meter">
        <div className="budget-pace-copy">
          <span>Budget used</span>
          <strong>{usedPercent}%</strong>
          <small>{paceDelta > 0 ? `${paceDelta}% ahead of today` : `${Math.abs(paceDelta)}% under today's pace`}</small>
        </div>
        <div className="budget-pace-track" aria-label="Budget used compared with month elapsed">
          <span className="expected" style={{ left: `${Math.min(plan.elapsedPercent, 100)}%` }} />
          <span className={usedPercent > 100 ? "over" : usedPercent >= 75 ? "watch" : "safe"} style={{ width: `${Math.min(usedPercent, 100)}%` }} />
        </div>
      </div>
      <div className="budget-health-grid">
        {healthRows.map((row) => (
          <div className={`budget-health ${row.tone}`} key={row.label}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
      <div className="budget-signal-list">
        <Metric label="Unplanned spend" value={formatINR(plan.totals.unplannedActualPaise)} warning={plan.totals.unplannedActualPaise > 0} />
        <Metric label="Uncategorized" value={`${uncategorizedCount} item${uncategorizedCount === 1 ? "" : "s"}`} warning={uncategorizedCount > 0} />
      </div>
    </div>
  );
}

function WeeklyEntryPage({
  selectedAccountId,
  accounts,
  loans,
  subscriptions,
  mutualFunds,
  categoryTypes,
  refresh,
  refreshKey,
  showNotice,
  onNavigate,
  onAccountSelect
}: {
  selectedAccountId: string;
  accounts: Account[];
  loans: Loan[];
  subscriptions: AutopaySubscription[];
  mutualFunds: Investment[];
  categoryTypes: CategoryType[];
  refresh: () => Promise<void>;
  refreshKey: number;
  showNotice: (message: string) => void;
  onNavigate: (page: Page) => void;
  onAccountSelect: (accountId: string) => void;
}) {
  const week = useMemo(() => mondayWeekRange(), []);
  const visibleAccounts = selectedAccountId
    ? accounts.filter((account) => account.id === selectedAccountId)
    : accounts;
  const firstAccount = visibleAccounts[0] ?? accounts[0];
  const categories = flattenSubcategories(categoryTypes);
  const defaultType = preferredType(categoryTypes, "expense") ?? categoryTypes[0];
  const [batchId, setBatchId] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [weeklyCategoryFilterId, setWeeklyCategoryFilterId] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    date: todayISO(),
    accountId: firstAccount?.id ?? "",
    method: firstAccount?.type === "credit_card" ? ("credit_card" as PaymentMethod) : ("upi" as PaymentMethod),
    merchant: "",
    note: "",
    typeId: defaultType?.id ?? "",
    subcategoryId: "",
    amount: "",
    transferAccountId: accounts.find((account) => account.type === "credit_card")?.id ?? "",
    loanId: "",
    loanPaymentType: "emi" as LoanPaymentType,
    subscriptionId: "",
    investmentId: ""
  });

  const reloadWeek = useCallback(async () => {
    const batch = await Api.currentBatch(week.weekStart, week.weekEnd);
    setBatchId(batch.id);
    const rows = await Api.transactions({
      from: week.weekStart,
      to: week.weekEnd,
      accountId: selectedAccountId || undefined
    });
    setTransactions(rows);
  }, [selectedAccountId, week.weekEnd, week.weekStart]);

  useEffect(() => {
    reloadWeek();
  }, [reloadWeek, refreshKey]);

  useEffect(() => {
    if (firstAccount && !visibleAccounts.some((account) => account.id === form.accountId)) {
      setForm((current) => ({
        ...current,
        accountId: firstAccount.id,
        method: firstAccount.type === "credit_card" ? "credit_card" : "upi"
      }));
    }
  }, [firstAccount, form.accountId, visibleAccounts]);

  useEffect(() => {
    if (form.typeId && !categoryTypes.some((type) => type.id === form.typeId)) {
      setForm((current) => ({
        ...current,
        typeId: defaultType?.id ?? "",
        subcategoryId: ""
      }));
    }
  }, [categoryTypes, defaultType?.id, form.typeId]);

  const selectedAccount = accounts.find((account) => account.id === form.accountId);
  const cardAccounts = accounts.filter((account) => account.type === "credit_card");
  const selectedType = categoryTypes.find((type) => type.id === form.typeId);
  const availableSubcategories = selectedType?.subcategories ?? [];
  const selectedBehavior = selectedType?.behavior ?? "expense";
  const availableLoans = loans.filter((loan) => loan.subcategoryId === form.subcategoryId);
  const isAutopaySelected = form.subcategoryId === AUTOPAY_SUBCATEGORY_ID;
  const isMutualFundsSelected = form.subcategoryId === MUTUAL_FUNDS_SUBCATEGORY_ID;
  const expenseTotal = transactions
    .filter((transaction) => transaction.kind === "expense")
    .reduce((sum, transaction) => sum + transaction.amountPaise, 0);
  const emiTotal = transactions
    .filter((transaction) => transaction.kind === "emi")
    .reduce((sum, transaction) => sum + transaction.amountPaise, 0);
  const investmentTotal = transactions
    .filter((transaction) => transaction.kind === "investment")
    .reduce((sum, transaction) => sum + transaction.amountPaise, 0);
  const incomeTotal = transactions
    .filter((transaction) => transaction.kind === "income")
    .reduce((sum, transaction) => sum + transaction.amountPaise, 0);
  const uncategorizedCount = transactions.filter((transaction) => transaction.status === "uncategorized").length;
  const visibleTransactions = weeklyCategoryFilterId
    ? transactions.filter((transaction) => transaction.categoryId === weeklyCategoryFilterId)
    : transactions;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);

    try {
      const behavior = selectedType?.behavior ?? "expense";
      const kind = kindForBehavior(behavior);
      const payload: CreateTransactionPayload = {
        batchId,
        date: form.date,
        accountId: form.accountId,
        method: selectedAccount?.type === "credit_card" ? "credit_card" : form.method,
        merchant: form.merchant || undefined,
        note: form.note || undefined,
        typeId: form.typeId || undefined,
        subcategoryId: behavior === "card_payment" ? undefined : form.subcategoryId || undefined,
        amountPaise: parseAmountToPaise(form.amount),
        direction: directionForBehavior(behavior),
        kind,
        transferAccountId: behavior === "card_payment" ? form.transferAccountId : undefined,
        loanId: behavior === "loan" ? form.loanId || undefined : undefined,
        loanPaymentType: behavior === "loan" && form.loanId ? form.loanPaymentType : undefined,
        subscriptionId:
          form.subcategoryId === AUTOPAY_SUBCATEGORY_ID ? form.subscriptionId || undefined : undefined,
        investmentId:
          form.subcategoryId === MUTUAL_FUNDS_SUBCATEGORY_ID ? form.investmentId || undefined : undefined
      };

      const result = await Api.createTransaction(payload);
      setDuplicateCount(result.duplicateCandidates.length);
      setForm((current) => ({
        ...current,
        merchant: "",
        note: "",
        amount: "",
        subcategoryId: "",
        loanId: "",
        loanPaymentType: "emi",
        subscriptionId: "",
        investmentId: ""
      }));
      await reloadWeek();
      await refresh();
      showNotice(
        result.duplicateCandidates.length
          ? "Transaction saved. Possible duplicate found."
          : "Transaction added."
      );
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Could not save transaction.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <div className="page-grid weekly-grid">
      <section className="panel entry-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Weekly Entry</p>
            <h2>{week.label}</h2>
          </div>
          <button className="secondary-action" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet size={17} />
            Import transactions
          </button>
        </div>

            <form className="entry-form" onSubmit={submit}>
              <label>
                Date
                <input
                  type="date"
                  value={form.date}
                  onChange={(event) => setForm({ ...form, date: event.target.value })}
                  required
                />
              </label>
              <label>
                Account
                <select
                  value={form.accountId}
                  onChange={(event) => {
                    const account = accounts.find((item) => item.id === event.target.value);
                    setForm({
                      ...form,
                      accountId: event.target.value,
                      method: account?.type === "credit_card" ? "credit_card" : form.method
                    });
                  }}
                  required
                >
                  {visibleAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Type
                <select
                  value={form.typeId}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      typeId: event.target.value,
                      subcategoryId: "",
                      transferAccountId: accounts.find((account) => account.type === "credit_card")?.id ?? "",
                      loanId: "",
                      loanPaymentType: "emi"
                    })
                  }
                  required
                >
                  {categoryTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Method
                <select
                  value={selectedAccount?.type === "credit_card" ? "credit_card" : form.method}
                  disabled={selectedAccount?.type === "credit_card"}
                  onChange={(event) => setForm({ ...form, method: event.target.value as PaymentMethod })}
                >
                  <option value="upi">UPI</option>
                  <option value="credit_card">Credit card</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="cash">Cash</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="wide">
                Merchant / note
                <input
                  value={form.merchant}
                  onChange={(event) => setForm({ ...form, merchant: event.target.value })}
                  placeholder="DMart, PVR, unknown..."
                />
              </label>
              <label>
                SubType
                {selectedBehavior === "card_payment" ? (
                  <select
                    value={form.transferAccountId}
                    onChange={(event) => setForm({ ...form, transferAccountId: event.target.value })}
                    required
                  >
                    <option value="">Choose card</option>
                    {cardAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={form.subcategoryId}
                    onChange={(event) =>
                      setForm({ ...form, subcategoryId: event.target.value, loanId: "", subscriptionId: "", investmentId: "" })
                    }
                  >
                    <option value="">Decide later</option>
                    {availableSubcategories.map((subcategory) => (
                      <option key={subcategory.id} value={subcategory.id}>
                        {subcategory.name}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              {isAutopaySelected && (
                <label>
                  Subscription
                  <select
                    value={form.subscriptionId}
                    onChange={(event) => setForm({ ...form, subscriptionId: event.target.value })}
                  >
                    <option value="">Not linked yet</option>
                    {subscriptions
                      .filter((subscription) => subscription.status === "active")
                      .map((subscription) => (
                        <option key={subscription.id} value={subscription.id}>
                          {subscription.name} · {formatINR(subscription.amountPaise)}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {isMutualFundsSelected && (
                <label>
                  Mutual fund
                  <select
                    value={form.investmentId}
                    onChange={(event) => setForm({ ...form, investmentId: event.target.value })}
                  >
                    <option value="">Not linked yet</option>
                    {mutualFunds.map((fund) => (
                      <option key={fund.id} value={fund.id}>
                        {fund.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {selectedBehavior === "loan" && (
                <>
                  <label>
                    Linked loan
                    <select
                      value={form.loanId}
                      onChange={(event) => setForm({ ...form, loanId: event.target.value })}
                      disabled={!form.subcategoryId}
                    >
                      <option value="">Not linked yet</option>
                      {availableLoans.map((loan) => (
                        <option key={loan.id} value={loan.id}>
                          {loan.name} · {formatINR(loan.outstandingPaise)} outstanding
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Payment type
                    <select
                      value={form.loanPaymentType}
                      onChange={(event) =>
                        setForm({ ...form, loanPaymentType: event.target.value as LoanPaymentType })
                      }
                      disabled={!form.loanId}
                    >
                      <option value="emi">EMI</option>
                      <option value="prepayment">Prepayment</option>
                    </select>
                  </label>
                </>
              )}
              <label>
                Amount
                <input
                  value={form.amount}
                  onChange={(event) => setForm({ ...form, amount: event.target.value })}
                  placeholder="₹0"
                  inputMode="decimal"
                  required
                />
              </label>
              <button className="primary-action add-button" disabled={saving || !batchId}>
                <Plus size={18} />
                Add transaction
              </button>
            </form>

            <div className="category-shortcuts category-filter-chips">
              {categories.map((category) => (
                <button
                  key={category.id}
                  className={weeklyCategoryFilterId === category.id ? "active" : ""}
                  onClick={() =>
                    setWeeklyCategoryFilterId((current) => (current === category.id ? "" : category.id))
                  }
                  type="button"
                >
                  <CategoryBadge category={category} />
                </button>
              ))}
              {weeklyCategoryFilterId && (
                <button type="button" onClick={() => setWeeklyCategoryFilterId("")}>
                  Clear filter
                </button>
              )}
              <button type="button" onClick={() => onNavigate("categories")}>
                <Plus size={16} /> Add category
              </button>
            </div>

            <TransactionTable transactions={visibleTransactions} empty="No transactions in this week yet." />
      </section>

      <aside className="side-stack">
        <Panel title="This week">
          <div className="metric-list">
            <Metric label="Spending" value={formatINR(expenseTotal)} />
            <Metric label="Loan" value={formatINR(emiTotal)} warning={emiTotal > 0} />
            <Metric label="Investment" value={formatINR(investmentTotal)} />
            <Metric label="Income" value={formatINR(incomeTotal)} />
            <Metric label="Uncategorized" value={`${uncategorizedCount} items`} warning={uncategorizedCount > 0} />
            <Metric label="Possible duplicate" value={`${duplicateCount} found`} warning={duplicateCount > 0} />
          </div>
        </Panel>

        <Panel title="Account impact">
          {(() => {
            const impactedAccounts = accounts
              .filter((account) => accountImpact(account, transactions).amountPaise !== 0)
              .slice(0, 4);
            return impactedAccounts.length === 0 ? (
              <EmptyState text="No account activity this week yet." />
            ) : (
              <div className="impact-stack">
                {impactedAccounts.map((account) => (
                  <AccountImpactCard key={account.id} account={account} transactions={transactions} />
                ))}
              </div>
            );
          })()}
        </Panel>
      </aside>
    </div>
    {importOpen && (
      <ImportTransactionsModal
        batchId={batchId}
        onClose={() => setImportOpen(false)}
        onImported={async (count, details) => {
          setImportOpen(false);
          await reloadWeek();
          await refresh();
          const createdCount =
            (details?.createdAccounts?.length ?? 0) +
            (details?.createdTypes?.length ?? 0) +
            (details?.createdSubcategories?.length ?? 0);
          const limitWarning = details?.warnings?.some((warning) => warning.includes("credit limit"));
          const skippedDuplicateCount = details?.skippedDuplicateCount ?? 0;
          const affectedAccounts = details?.affectedAccounts ?? [];
          if (affectedAccounts.length === 1) {
            onAccountSelect(affectedAccounts[0].id);
          }
          onNavigate("transactions");
          showNotice(
            `Imported ${count} transaction${count === 1 ? "" : "s"}.` +
              (skippedDuplicateCount
                ? ` Skipped ${skippedDuplicateCount} duplicate row${skippedDuplicateCount === 1 ? "" : "s"}.`
                : "") +
              (createdCount ? ` Created ${createdCount} lookup item${createdCount === 1 ? "" : "s"}.` : "") +
              (limitWarning ? " Update new card limits in Accounts." : "")
          );
        }}
      />
    )}
    </>
  );
}

type TransactionEditDraft = {
  id: string;
  date: string;
  accountId: string;
  kind: TransactionKind;
  method: PaymentMethod;
  merchant: string;
  note: string;
  typeId: string;
  subcategoryId: string;
  amount: string;
  transferAccountId: string;
  loanId: string;
  loanPaymentType: LoanPaymentType;
  subscriptionId: string;
  investmentId: string;
};

function TransactionsPage({
  selectedAccountId,
  accounts,
  loans,
  subscriptions,
  mutualFunds,
  categoryTypes,
  refresh,
  refreshKey,
  showNotice,
  requestConfirm
}: {
  selectedAccountId: string;
  accounts: Account[];
  loans: Loan[];
  subscriptions: AutopaySubscription[];
  mutualFunds: Investment[];
  categoryTypes: CategoryType[];
  refresh: () => Promise<void>;
  refreshKey: number;
  showNotice: (message: string) => void;
  requestConfirm: (request: ConfirmRequest) => void;
}) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [search, setSearch] = useState("");
  const [typeId, setTypeId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const rangeIsValid = !from || !to || from <= to;
  const [hasMoreTransactions, setHasMoreTransactions] = useState(false);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [loadingMoreTransactions, setLoadingMoreTransactions] = useState(false);
  const [editDraft, setEditDraft] = useState<TransactionEditDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const categories = flattenSubcategories(categoryTypes);
  const selectedFilterType = categoryTypes.find((type) => type.id === typeId);
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId);

  const loadPage = useCallback(async (offset = 0, append = false) => {
    const pageSize = offset === 0 ? INITIAL_TRANSACTION_LIMIT : TRANSACTION_PAGE_SIZE;
    if (offset === 0) {
      setLoadingTransactions(true);
    } else {
      setLoadingMoreTransactions(true);
    }

    try {
      const rows = await Api.transactions({
        accountId: selectedAccountId || undefined,
        search: search || undefined,
        typeId: typeId || undefined,
        subcategoryId: subcategoryId || undefined,
        from: rangeIsValid ? from || undefined : undefined,
        to: rangeIsValid ? to || undefined : undefined,
        limit: pageSize + 1,
        offset
      });
      setHasMoreTransactions(rows.length > pageSize);
      setTransactions((current) => (append ? [...current, ...rows.slice(0, pageSize)] : rows.slice(0, pageSize)));
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Could not load transactions.");
    } finally {
      setLoadingTransactions(false);
      setLoadingMoreTransactions(false);
    }
  }, [from, rangeIsValid, search, selectedAccountId, showNotice, subcategoryId, to, typeId]);

  useEffect(() => {
    setEditDraft(null);
    loadPage();
  }, [loadPage, refreshKey]);

  async function loadMore() {
    await loadPage(transactions.length, true);
  }

  const cardAccounts = accounts.filter((account) => account.type === "credit_card");

  async function remove(transaction: Transaction) {
    requestConfirm({
      message: "Are you sure you want to delete this?",
      detail: `${transaction.merchant || transaction.note || "Transaction"} will be removed and balances will recalculate immediately.`,
      confirmLabel: "Delete",
      tone: "danger",
      onConfirm: async () => {
        try {
          await Api.deleteTransaction(transaction.id);
          setEditDraft(null);
          await loadPage();
          await refresh();
          showNotice("Transaction deleted.");
        } catch (err) {
          showNotice(err instanceof Error ? err.message : "Could not delete transaction.");
        }
      }
    });
  }

  async function saveEdit() {
    if (!editDraft) return;
    const account = accounts.find((item) => item.id === editDraft.accountId);
    const amountPaise = parseAmountToPaise(editDraft.amount);

    if (!account || amountPaise <= 0) {
      showNotice("Choose an account and enter an amount greater than zero.");
      return;
    }

    setSavingEdit(true);
    try {
      const selectedType = categoryTypes.find((type) => type.id === editDraft.typeId);
      const behavior = selectedType?.behavior ?? behaviorForKind(editDraft.kind);
      const kind = kindForBehavior(behavior);
      await Api.updateTransaction(editDraft.id, {
        date: editDraft.date,
        accountId: editDraft.accountId,
        method: account.type === "credit_card" ? "credit_card" : editDraft.method,
        merchant: editDraft.merchant,
        note: editDraft.note,
        typeId: editDraft.typeId,
        subcategoryId: behavior === "card_payment" ? "" : editDraft.subcategoryId,
        amountPaise,
        direction: directionForBehavior(behavior),
        kind,
        transferAccountId: behavior === "card_payment" ? editDraft.transferAccountId : "",
        loanId: behavior === "loan" ? editDraft.loanId : "",
        loanPaymentType: behavior === "loan" && editDraft.loanId ? editDraft.loanPaymentType : undefined,
        subscriptionId:
          editDraft.subcategoryId === AUTOPAY_SUBCATEGORY_ID ? editDraft.subscriptionId : "",
        investmentId:
          editDraft.subcategoryId === MUTUAL_FUNDS_SUBCATEGORY_ID ? editDraft.investmentId : ""
      });
      setEditDraft(null);
      await loadPage();
      await refresh();
      showNotice("Transaction updated.");
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Could not update transaction.");
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-header toolbar-header">
        <div>
          <p className="eyebrow">Ledger</p>
          <h2>Transactions</h2>
        </div>
        <div className="toolbar filter-toolbar">
          <label className="search-box">
            <Search size={17} />
            <input
              placeholder="Search merchant or note"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="control-field toolbar-control">
            <span className="control-label">Type</span>
            <select
              value={typeId}
              onChange={(event) => {
                setTypeId(event.target.value);
                setSubcategoryId("");
              }}
            >
              <option value="">All types</option>
              {categoryTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
          <label className="control-field toolbar-control">
            <span className="control-label">SubType</span>
            <select
              value={subcategoryId}
              onChange={(event) => setSubcategoryId(event.target.value)}
              disabled={!selectedFilterType}
            >
              <option value="">All SubTypes</option>
              {(selectedFilterType?.subcategories ?? categories).map((subcategory) => (
                <option key={subcategory.id} value={subcategory.id}>
                  {subcategory.name}
                </option>
              ))}
            </select>
          </label>
          <label className="control-field toolbar-control">
            <span className="control-label">From</span>
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="control-field toolbar-control">
            <span className="control-label">To</span>
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <button
            onClick={() => {
              if (!rangeIsValid) {
                showNotice("Choose a valid date range.");
                return;
              }
              loadPage();
            }}
          >
            Apply
          </button>
        </div>
      </div>

      <div className="ledger-result-summary">
        <span>
          Showing {transactions.length} transaction{transactions.length === 1 ? "" : "s"}
          {selectedAccount ? ` for ${selectedAccount.name}` : ""}
        </span>
        {hasMoreTransactions && <small>More history available</small>}
      </div>

      <div className="ledger-list">
        {loadingTransactions && transactions.length === 0 ? (
          <PanelLoader label="Loading transactions" />
        ) : transactions.length === 0 ? (
          <EmptyState text="No matching transactions." />
        ) : (
          transactions.map((transaction) => {
            const typeCategory = typeCategoryFromTransaction(transaction);
            const subTypeCategory = categoryFromTransaction(transaction);
            return (
              <div className="ledger-item" key={transaction.id}>
                {editDraft?.id === transaction.id ? (
                  <TransactionEditRow
                    draft={editDraft}
                    accounts={accounts}
                    loans={loans}
                    subscriptions={subscriptions}
                    mutualFunds={mutualFunds}
                    categoryTypes={categoryTypes}
                    cardAccounts={cardAccounts}
                    saving={savingEdit}
                    onChange={setEditDraft}
                    onCancel={() => setEditDraft(null)}
                    onSave={saveEdit}
                    onDelete={() => remove(transaction)}
                  />
                ) : (
                  <div className="ledger-row transaction-row-card">
                    <div className="transaction-primary-cell">
                      <strong>{transaction.merchant || transaction.note || "Untitled transaction"}</strong>
                      <span>{formatShortDate(transaction.date)}</span>
                    </div>
                    <div className="transaction-tag-strip" aria-label="Transaction tags">
                      <TransactionTag
                        tone="account"
                        icon={accountIconForType(transaction.accountType, 13)}
                        label={transaction.accountName}
                      />
                      <TransactionTag tone="method" label={methodLabel(transaction.method)} />
                      <TransactionTag
                        tone="type"
                        icon={<IconGlyph name={typeCategory.icon} size={13} />}
                        label={typeCategory.name}
                        color={typeCategory.color}
                      />
                      <TransactionTag
                        tone="subtype"
                        icon={<IconGlyph name={subTypeCategory.icon} size={13} />}
                        label={subTypeCategory.name}
                        color={subTypeCategory.color}
                      />
                    </div>
                    <strong className={`transaction-amount-cell ${transaction.direction === "inflow" ? "amount-in" : "amount-out"}`}>
                      {signedAmount(transaction.amountPaise, transaction.direction)}
                    </strong>
                    <div className="row-actions">
                      <button
                        className="secondary-action row-edit-action"
                        onClick={() => setEditDraft(draftFromTransaction(transaction, categoryTypes, accounts))}
                      >
                        <Pencil size={16} />
                        Edit
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      {transactions.length > 0 && (
        <div className="ledger-pagination">
          <span>
            {hasMoreTransactions
              ? `Showing latest ${transactions.length}. Use More to load older transactions.`
              : `Showing all ${transactions.length} matching transactions.`}
          </span>
          {hasMoreTransactions && (
            <button className="secondary-action" onClick={loadMore} disabled={loadingMoreTransactions}>
              {loadingMoreTransactions ? "Loading..." : "More"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TransactionEditRow({
  draft,
  accounts,
  loans,
  subscriptions,
  mutualFunds,
  categoryTypes,
  cardAccounts,
  saving,
  onChange,
  onCancel,
  onSave,
  onDelete
}: {
  draft: TransactionEditDraft;
  accounts: Account[];
  loans: Loan[];
  subscriptions: AutopaySubscription[];
  mutualFunds: Investment[];
  categoryTypes: CategoryType[];
  cardAccounts: Account[];
  saving: boolean;
  onChange: (draft: TransactionEditDraft) => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const selectedAccount = accounts.find((account) => account.id === draft.accountId);
  const selectedType = categoryTypes.find((type) => type.id === draft.typeId);
  const behavior = selectedType?.behavior ?? behaviorForKind(draft.kind);
  const availableSubcategories = selectedType?.subcategories ?? [];
  const availableLoans = loans.filter((loan) => loan.subcategoryId === draft.subcategoryId);
  const isAutopaySelected = draft.subcategoryId === AUTOPAY_SUBCATEGORY_ID;
  const isMutualFundsSelected = draft.subcategoryId === MUTUAL_FUNDS_SUBCATEGORY_ID;
  const availableSubscriptions = subscriptions.filter(
    (subscription) => subscription.status === "active" || subscription.id === draft.subscriptionId
  );

  return (
    <div className="transaction-edit-row">
      <div className="transaction-edit-grid">
        <label>
          Date
          <input
            type="date"
            value={draft.date}
            onChange={(event) => onChange({ ...draft, date: event.target.value })}
          />
        </label>
        <label>
          Account
          <select
            value={draft.accountId}
            onChange={(event) => {
              const nextAccount = accounts.find((account) => account.id === event.target.value);
              onChange({
                ...draft,
                accountId: event.target.value,
                method: nextAccount?.type === "credit_card" ? "credit_card" : draft.method
              });
            }}
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Type
          <select
            value={draft.typeId}
            onChange={(event) => {
              onChange({
                ...draft,
                typeId: event.target.value,
                subcategoryId: "",
                transferAccountId: cardAccounts[0]?.id ?? "",
                loanId: "",
                loanPaymentType: "emi",
                subscriptionId: "",
                investmentId: ""
              });
            }}
          >
            <option value="">No Type</option>
            {categoryTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Method
          <select
            value={selectedAccount?.type === "credit_card" ? "credit_card" : draft.method}
            disabled={selectedAccount?.type === "credit_card"}
            onChange={(event) => onChange({ ...draft, method: event.target.value as PaymentMethod })}
          >
            <option value="upi">UPI</option>
            <option value="credit_card">Credit card</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="cash">Cash</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Merchant
          <input
            value={draft.merchant}
            onChange={(event) => onChange({ ...draft, merchant: event.target.value })}
            placeholder="Merchant"
          />
        </label>
        <label>
          Note
          <input
            value={draft.note}
            onChange={(event) => onChange({ ...draft, note: event.target.value })}
            placeholder="Optional note"
          />
        </label>
        <label>
          SubType
          {behavior === "card_payment" ? (
            <select
              value={draft.transferAccountId}
              onChange={(event) => onChange({ ...draft, transferAccountId: event.target.value })}
            >
              <option value="">Choose card</option>
              {cardAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={draft.subcategoryId}
              onChange={(event) =>
                onChange({ ...draft, subcategoryId: event.target.value, loanId: "", subscriptionId: "", investmentId: "" })
              }
              disabled={!selectedType}
            >
              <option value="">Decide later</option>
              {availableSubcategories.map((subcategory) => (
                <option key={subcategory.id} value={subcategory.id}>
                  {subcategory.name}
                </option>
              ))}
            </select>
          )}
        </label>
        {isAutopaySelected && (
          <label>
            Subscription
            <select
              value={draft.subscriptionId}
              onChange={(event) => onChange({ ...draft, subscriptionId: event.target.value })}
            >
              <option value="">Not linked yet</option>
              {availableSubscriptions.map((subscription) => (
                <option key={subscription.id} value={subscription.id}>
                  {subscription.name} · {formatINR(subscription.amountPaise)}
                </option>
              ))}
            </select>
          </label>
        )}
        {isMutualFundsSelected && (
          <label>
            Mutual fund
            <select
              value={draft.investmentId}
              onChange={(event) => onChange({ ...draft, investmentId: event.target.value })}
            >
              <option value="">Not linked yet</option>
              {mutualFunds.map((fund) => (
                <option key={fund.id} value={fund.id}>
                  {fund.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {behavior === "loan" && (
          <>
            <label>
              Linked loan
              <select
                value={draft.loanId}
                onChange={(event) => onChange({ ...draft, loanId: event.target.value })}
                disabled={!draft.subcategoryId}
              >
                <option value="">Not linked yet</option>
                {availableLoans.map((loan) => (
                  <option key={loan.id} value={loan.id}>
                    {loan.name} · {formatINR(loan.outstandingPaise)} outstanding
                  </option>
                ))}
              </select>
            </label>
            <label>
              Payment type
              <select
                value={draft.loanPaymentType}
                onChange={(event) => onChange({ ...draft, loanPaymentType: event.target.value as LoanPaymentType })}
                disabled={!draft.loanId}
              >
                <option value="emi">EMI</option>
                <option value="prepayment">Prepayment</option>
              </select>
            </label>
          </>
        )}
        <label>
          Amount
          <input
            value={draft.amount}
            onChange={(event) => onChange({ ...draft, amount: event.target.value })}
            inputMode="decimal"
            placeholder="₹0"
          />
        </label>
      </div>
      <div className="transaction-edit-actions">
        <button className="secondary-action danger-action" onClick={onDelete}>
          <Trash2 size={16} />
          Delete
        </button>
        <span />
        <button className="secondary-action" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary-action" onClick={onSave} disabled={saving}>
          <Check size={16} />
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

function ImportTransactionsModal({
  batchId,
  onClose,
  onImported
}: {
  batchId: string;
  onClose: () => void;
  onImported: (
    count: number,
    details?: {
      createdAccounts?: string[];
      createdTypes?: string[];
      createdSubcategories?: string[];
      affectedAccounts?: Array<{ id: string; name: string }>;
      skippedDuplicateCount?: number;
      warnings?: string[];
    }
  ) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [working, setWorking] = useState(false);
  const [errors, setErrors] = useState<Array<{ row: number; message: string }>>([]);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setMessage("Choose an Excel .xlsx file first.");
      return;
    }

    setWorking(true);
    setErrors([]);
    setMessage("");
    try {
      const result = await Api.importTransactions(file, batchId);
      if (result.errors.length > 0) {
        setErrors(result.errors);
        setMessage("Fix the rows below and upload again. No transactions were imported.");
        return;
      }
      await onImported(result.insertedCount, {
        createdAccounts: result.createdAccounts,
        createdTypes: result.createdTypes,
        createdSubcategories: result.createdSubcategories,
        affectedAccounts: result.affectedAccounts,
        skippedDuplicateCount: result.skippedDuplicateCount,
        warnings: result.warnings
      });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not import transactions.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="import-modal" onSubmit={submit} role="dialog" aria-modal="true">
        <div className="modal-title-row">
          <div>
            <p className="eyebrow">Excel Import</p>
            <h2>Import transactions</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title="Close">
            X
          </button>
        </div>

        <a className="secondary-action import-template-link" href={Api.importTemplateUrl()}>
          <Download size={17} />
          Download sample Excel template
        </a>

        <label className="file-upload">
          <Upload size={20} />
          <span>{file ? file.name : "Choose filled .xlsx file"}</span>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>

        {message && <p className={errors.length > 0 ? "form-error" : "helper-text"}>{message}</p>}
        {errors.length > 0 && (
          <div className="import-errors">
            {errors.slice(0, 8).map((error) => (
              <div key={`${error.row}-${error.message}`}>
                <strong>Row {error.row}</strong>
                <span>{error.message}</span>
              </div>
            ))}
            {errors.length > 8 && <p className="helper-text">{errors.length - 8} more row errors.</p>}
          </div>
        )}

        <div className="confirm-actions">
          <button type="button" className="secondary-action" onClick={onClose} disabled={working}>
            Cancel
          </button>
          <button className="primary-action" disabled={working}>
            <Upload size={16} />
            {working ? "Importing..." : "Import"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ReportsPage({
  selectedAccountId,
  categoryTypes,
  refreshKey
}: {
  selectedAccountId: string;
  categoryTypes: CategoryType[];
  refreshKey: number;
}) {
  const initialMonth = currentMonth();
  const [from, setFrom] = useState(`${initialMonth}-01`);
  const [to, setTo] = useState(monthEndForInput(initialMonth));
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [reportError, setReportError] = useState("");
  const [reportRetryKey, setReportRetryKey] = useState(0);
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const rangeIsValid = from <= to;
  const trendTypes = categoryTypes.filter((type) => type.behavior !== "card_payment");
  const [trendMode, setTrendMode] = useState<TrendMode>("month");
  const [trendMonth, setTrendMonth] = useState(initialMonth);
  const [trendStyle, setTrendStyle] = useState<"bar" | "line">("bar");
  const trendMonthOptions = useMemo(() => recentMonthOptions(initialMonth, 12), [initialMonth]);
  const [trendTypeId, setTrendTypeId] = useState(
    () => trendTypes.find((type) => type.behavior === "expense")?.id ?? trendTypes[0]?.id ?? ""
  );
  const [trend, setTrend] = useState<TrendReport | null>(null);
  const [trendError, setTrendError] = useState("");

  useEffect(() => {
    if (trendTypeId && trendTypes.some((type) => type.id === trendTypeId)) return;
    setTrendTypeId(trendTypes[0]?.id ?? "");
  }, [trendTypes, trendTypeId]);

  useEffect(() => {
    if (!trendTypeId) {
      setTrend(null);
      return;
    }
    let active = true;
    setTrend(null);
    setTrendError("");
    Api.trendReport(trendTypeId, trendMode, selectedAccountId || undefined, trendMonth)
      .then((next) => {
        if (active) setTrend(next);
      })
      .catch((error: unknown) => {
        if (active) setTrendError(error instanceof Error ? error.message : "Could not load the trend.");
      });
    return () => {
      active = false;
    };
  }, [trendTypeId, trendMode, trendMonth, selectedAccountId, refreshKey]);

  useEffect(() => {
    if (!rangeIsValid) {
      setReport(null);
      setReportError("");
      return;
    }

    let active = true;
    setReport(null);
    setReportError("");
    Api.monthlyReport(selectedAccountId || undefined, from.slice(0, 7), from, to)
      .then((nextReport) => {
        if (active) setReport(nextReport);
      })
      .catch((error: unknown) => {
        if (active) {
          setReportError(error instanceof Error ? error.message : "Could not load this report.");
        }
      });

    return () => {
      active = false;
    };
  }, [from, rangeIsValid, reportRetryKey, selectedAccountId, refreshKey, to]);

  useEffect(() => {
    if (!report?.types.length) {
      setSelectedTypeId("");
      return;
    }
    if (!selectedTypeId || !report.types.some((type) => type.typeId === selectedTypeId)) {
      setSelectedTypeId(report.types[0].typeId);
    }
  }, [report, selectedTypeId]);

  const selectedType = report?.types.find((type) => type.typeId === selectedTypeId) ?? report?.types[0];
  const trendModeLabels: Record<TrendMode, string> = {
    week: "Week on week",
    month: "Month on month",
    year: "Year on year"
  };

  return (
    <div className="page-grid">
      <Panel
        title="Category Report"
        action={
          <div className="report-filters">
            <label>
              From
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label>
              To
              <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </label>
          </div>
        }
      >
        {!rangeIsValid ? (
          <EmptyState text="Choose a valid date range." />
        ) : reportError ? (
          <div className="stacked-empty-state">
            <EmptyState text={reportError} />
            <button type="button" className="secondary-action" onClick={() => setReportRetryKey((key) => key + 1)}>
              <RotateCcw size={17} />
              Retry
            </button>
          </div>
        ) : !report ? (
          <PanelLoader label="Loading report" />
        ) : (
          <>
            <p className="helper-text report-range">
              {formatShortDate(report.start)} to {formatShortDate(report.end)}
            </p>
            <CashflowSummary types={report.types} />
            <div className="report-chart-grid">
              <OutflowMixChart types={report.types} />
              <ReportTypeAnalytics
                types={report.types}
                selectedTypeId={selectedType?.typeId ?? ""}
                onSelect={setSelectedTypeId}
              />
            </div>
            <CategoryBars categories={report.categories} />
            <a className="secondary-action export-link" href="/api/export/transactions.csv">
              <Download size={18} />
              Export CSV
            </a>
          </>
        )}
      </Panel>

      <Panel title="Trends">
        <div className="trend-controls">
          <label className="control-field toolbar-control trend-mode-control">
            <span className="control-label">Period</span>
            <select value={trendMode} onChange={(event) => setTrendMode(event.target.value as TrendMode)}>
              {(["week", "month", "year"] as TrendMode[]).map((mode) => (
                <option key={mode} value={mode}>
                  {trendModeLabels[mode]}
                </option>
              ))}
            </select>
          </label>
          {trendMode === "week" && (
            <label className="control-field toolbar-control trend-month-control">
              <span className="control-label">Month</span>
              <select value={trendMonth} onChange={(event) => setTrendMonth(event.target.value)}>
                {trendMonthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="control-field toolbar-control trend-style-control">
            <span className="control-label">Chart</span>
            <select value={trendStyle} onChange={(event) => setTrendStyle(event.target.value as "bar" | "line")}>
              <option value="bar">Bar</option>
              <option value="line">Line</option>
            </select>
          </label>
          <label className="control-field toolbar-control trend-type-control">
            <span className="control-label">Type</span>
            <select value={trendTypeId} onChange={(event) => setTrendTypeId(event.target.value)}>
              {trendTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {trendError ? (
          <EmptyState text={trendError} />
        ) : !trendTypeId ? (
          <EmptyState text="Add a Type in Categories to see trends." />
        ) : !trend ? (
          <PanelLoader label="Loading trend" />
        ) : trend.points.every((point) => point.amountPaise === 0) ? (
          <EmptyState
            text={
              trendMode === "week"
                ? `No ${trend.typeName} recorded in ${formatMonth(trendMonth)}.`
                : `No ${trend.typeName} recorded ${trendMode === "month" ? "this year" : "yet"}.`
            }
          />
        ) : (
          <>
            <p className="helper-text trend-caption">
              {trend.typeName} ·{" "}
              {trendMode === "week"
                ? `${formatMonth(trendMonth)}, by week`
                : trendMode === "month"
                  ? `${new Date().getFullYear()}, January to date`
                  : "by year"}
            </p>
            <TrendChart points={trend.points} variant={trendStyle} color={trend.color} />
          </>
        )}
      </Panel>
    </div>
  );
}

function compactINR(paise: number) {
  const rupees = paise / 100;
  if (rupees >= 10000000) return `₹${(rupees / 10000000).toFixed(1).replace(/\.0$/, "")}Cr`;
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1).replace(/\.0$/, "")}L`;
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `₹${Math.round(rupees)}`;
}

function boundedPercent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

function TrendChart({
  points,
  variant,
  color
}: {
  points: TrendPoint[];
  variant: "bar" | "line";
  color: string;
}) {
  const width = 760;
  const height = 300;
  const pad = { top: 30, right: 14, bottom: 32, left: 14 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const max = Math.max(...points.map((point) => point.amountPaise), 1);
  const step = innerWidth / points.length;
  const baseline = pad.top + innerHeight;

  const centers = points.map((point, index) => ({
    ...point,
    x: pad.left + step * index + step / 2,
    y: baseline - (point.amountPaise / max) * innerHeight
  }));

  return (
    <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trend chart">
      {[0.25, 0.5, 0.75].map((fraction) => (
        <line
          key={fraction}
          className="trend-gridline"
          x1={pad.left}
          x2={width - pad.right}
          y1={baseline - innerHeight * fraction}
          y2={baseline - innerHeight * fraction}
        />
      ))}
      <line className="trend-axis" x1={pad.left} x2={width - pad.right} y1={baseline} y2={baseline} />

      {variant === "bar" ? (
        centers.map((point) => {
          const barWidth = Math.min(step * 0.55, 52);
          const barHeight = Math.max(baseline - point.y, point.amountPaise > 0 ? 2 : 0);
          return (
            <g key={point.label}>
              <title>{`${point.label}: ${formatINR(point.amountPaise)}`}</title>
              <rect
                x={point.x - barWidth / 2}
                y={baseline - barHeight}
                width={barWidth}
                height={barHeight}
                rx={5}
                fill={color}
              />
            </g>
          );
        })
      ) : (
        <>
          <polyline
            className="trend-line"
            stroke={color}
            points={centers.map((point) => `${point.x},${point.y}`).join(" ")}
          />
          {centers.map((point) => (
            <g key={point.label}>
              <title>{`${point.label}: ${formatINR(point.amountPaise)}`}</title>
              <circle cx={point.x} cy={point.y} r={4.5} fill={color} />
            </g>
          ))}
        </>
      )}

      {centers.map((point) => (
        <g key={`labels-${point.label}`}>
          {point.amountPaise > 0 && (
            <text className="trend-value" x={point.x} y={point.y - 9} textAnchor="middle">
              {compactINR(point.amountPaise)}
            </text>
          )}
          <text className="trend-label" x={point.x} y={height - 10} textAnchor="middle">
            {point.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

const PAYMENT_HISTORY_MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC"
];

function PaymentHistoryGrid({
  source,
  id
}: {
  source: "loan" | "autopay" | "mutual_fund";
  id: string;
}) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [months, setMonths] = useState<boolean[]>(() => Array.from({ length: 12 }, () => false));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Api.paymentHistory(source, id, year)
      .then((history: PaymentHistory) => {
        if (!active) return;
        const next = Array.from({ length: 12 }, (_, index) => Boolean(history.months?.[index]));
        setMonths(next);
      })
      .catch(() => {
        if (active) setMonths(Array.from({ length: 12 }, () => false));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [source, id, year]);

  return (
    <div className="payment-history">
      <div className="payment-history-header">
        <span className="payment-history-title">Payment history</span>
        <div className="payment-history-stepper">
          <button
            type="button"
            aria-label="Previous year"
            onClick={() => setYear((value) => value - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <span className="payment-history-year">{year}</span>
          <button
            type="button"
            aria-label="Next year"
            onClick={() => setYear((value) => value + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="payment-history-grid" aria-busy={loading}>
        {PAYMENT_HISTORY_MONTHS.map((label, index) => {
          const paid = months[index];
          return (
            <div className="payment-history-cell" key={label}>
              <span
                className={`payment-history-circle${paid ? " is-paid" : ""}`}
                aria-label={`${label} ${paid ? "paid" : "not paid"}`}
              >
                {paid ? <Check size={18} strokeWidth={3} /> : null}
              </span>
              <span className="payment-history-month">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BudgetPlannerPage({
  refreshKey,
  showNotice,
  requestConfirm
}: {
  refreshKey: number;
  showNotice: (message: string) => void;
  requestConfirm: (request: ConfirmRequest) => void;
}) {
  const [month, setMonth] = useState(currentMonth());
  const [plan, setPlan] = useState<BudgetPlan | null>(null);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [typeId, setTypeId] = useState("");
  const [subKey, setSubKey] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [editAmount, setEditAmount] = useState("");

  const budgetTypes = useMemo(() => budgetTypeOptions(plan?.availableScopes ?? []), [plan]);
  const subScopes = useMemo(
    () => (plan?.availableScopes ?? []).filter((scope) => scope.typeId === typeId),
    [plan, typeId]
  );

  const loadPlan = useCallback(async () => {
    setPlan(null);
    setError("");
    try {
      setPlan(await Api.budgetPlan(month));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load budget plan.");
    }
  }, [month]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan, retryKey, refreshKey]);

  useEffect(() => {
    if (!budgetTypes.length) {
      setTypeId("");
      return;
    }
    if (!budgetTypes.some((type) => type.typeId === typeId)) {
      setTypeId(budgetTypes[0].typeId);
    }
  }, [budgetTypes, typeId]);

  useEffect(() => {
    if (!subScopes.length) {
      setSubKey("");
      return;
    }
    if (!subScopes.some((scope) => budgetScopeKey(scope) === subKey)) {
      setSubKey(budgetScopeKey(subScopes[0]));
    }
  }, [subScopes, subKey]);

  async function addBudget(event: FormEvent) {
    event.preventDefault();
    const scope = subScopes.find((item) => budgetScopeKey(item) === subKey);
    if (!scope) {
      showNotice("Choose a budget line.");
      return;
    }
    const amountPaise = parseAmountToPaise(amount);
    if (amountPaise <= 0) {
      showNotice("Enter a budget amount.");
      return;
    }
    setSaving(true);
    try {
      await Api.createBudgetLine({ month, scopeType: scope.scopeType, scopeId: scope.scopeId, amountPaise });
      setAmount("");
      await loadPlan();
      showNotice("Budget added.");
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Could not add budget.");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(line: BudgetLine) {
    const amountPaise = parseAmountToPaise(editAmount);
    if (amountPaise <= 0) {
      showNotice("Enter a budget amount.");
      return;
    }
    setSaving(true);
    try {
      await Api.updateBudgetLine(line.id, { amountPaise });
      setEditingId("");
      setEditAmount("");
      await loadPlan();
      showNotice("Budget updated.");
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Could not update budget.");
    } finally {
      setSaving(false);
    }
  }

  function remove(line: BudgetLine) {
    requestConfirm({
      message: "Remove this budget line?",
      detail: `${line.name} will be removed from ${formatMonth(line.month)}. Transactions and reports stay unchanged.`,
      confirmLabel: "Remove",
      tone: "danger",
      onConfirm: async () => {
        try {
          await Api.deleteBudgetLine(line.id);
          await loadPlan();
          showNotice("Budget removed.");
        } catch (err) {
          showNotice(err instanceof Error ? err.message : "Could not remove budget.");
        }
      }
    });
  }

  return (
    <div className="page-grid budget-page">
      <Panel
        title="Monthly Budget"
        action={
          <label className="control-field budget-month-control">
            <span className="control-label">Month</span>
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </label>
        }
      >
        {error ? (
          <div className="stacked-empty-state">
            <EmptyState text={error} />
            <button type="button" className="secondary-action" onClick={() => setRetryKey((key) => key + 1)}>
              <RotateCcw size={17} />
              Retry
            </button>
          </div>
        ) : !plan ? (
          <PanelLoader label="Loading budget" />
        ) : (
          <>
            <p className="helper-text budget-range">
              {formatShortDate(plan.start)} to {formatShortDate(plan.end)} · Day {plan.dayOfMonth} of {plan.daysInMonth}
            </p>
            <div className="summary-grid report-summary">
              <SummaryCard label="Budgeted" value={formatINR(plan.totals.amountPaise)} icon={<PiggyBank />} />
              <SummaryCard label="Used" value={formatINR(plan.totals.actualPaise)} icon={<BarChart3 />} tone={budgetSummaryTone(plan)} />
              <SummaryCard label="Remaining" value={formatINR(plan.totals.remainingPaise)} icon={<WalletCards />} tone="good" />
              <SummaryCard label="Projected" value={formatINR(plan.totals.projectedPaise)} icon={<TrendingUp />} tone={plan.totals.projectedPaise > plan.totals.amountPaise ? "warning" : "neutral"} />
            </div>

            <form className="budget-add-form" onSubmit={addBudget}>
              <label>
                Type
                <select value={typeId} onChange={(event) => setTypeId(event.target.value)} disabled={!budgetTypes.length}>
                  {budgetTypes.length === 0 && <option value="">No Types available</option>}
                  {budgetTypes.map((type) => (
                    <option key={type.typeId} value={type.typeId}>
                      {type.typeName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                SubType
                <select value={subKey} onChange={(event) => setSubKey(event.target.value)} disabled={!subScopes.length}>
                  {subScopes.length === 0 && <option value="">No SubTypes available</option>}
                  {subScopes.map((scope) => (
                    <option key={budgetScopeKey(scope)} value={budgetScopeKey(scope)}>
                      {budgetSubLabel(scope)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Amount
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="25000"
                />
              </label>
              <button className="primary-action" type="submit" disabled={saving || !subScopes.length}>
                <Plus size={17} />
                Add
              </button>
            </form>

            {plan.lines.length === 0 ? (
              <EmptyState text="No budget lines for this month." />
            ) : (
              <div className="budget-line-list">
                {plan.lines.map((line) => (
                  <BudgetLineCard
                    key={line.id}
                    line={line}
                    isEditing={editingId === line.id}
                    editAmount={editAmount}
                    saving={saving}
                    onEditAmount={setEditAmount}
                    onStartEdit={() => {
                      setEditingId(line.id);
                      setEditAmount(String(line.amountPaise / 100));
                    }}
                    onCancelEdit={() => {
                      setEditingId("");
                      setEditAmount("");
                    }}
                    onSave={() => void saveEdit(line)}
                    onDelete={() => remove(line)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}

function BudgetLineCard({
  line,
  isEditing,
  editAmount,
  saving,
  onEditAmount,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete
}: {
  line: BudgetLine;
  isEditing: boolean;
  editAmount: string;
  saving: boolean;
  onEditAmount: (value: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const progress = Math.min(line.usedPercent, 100);
  return (
    <article className={`budget-line-card ${line.status}`}>
      <div className="budget-line-header">
        <div className="loan-title">
          <span className="loan-icon" style={{ background: `${line.color}18`, color: line.color }}>
            <IconGlyph name={line.icon} size={20} />
          </span>
          <div>
            <strong>{line.name}</strong>
            <span>{line.scopeType === "type" ? "Type budget" : "SubType budget"}</span>
          </div>
        </div>
        <div className="loan-header-actions">
          <span className={`budget-status ${line.status}`}>{line.statusLabel}</span>
          <button
            type="button"
            className={`icon-button disclosure-toggle ${expanded ? "expanded" : ""}`}
            aria-label={expanded ? `Collapse ${line.name}` : `Expand ${line.name}`}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            <ChevronDown size={18} />
          </button>
        </div>
      </div>

      <div className="budget-progress">
        <div>
          <span>{line.usedPercent}% used</span>
          <strong>{formatINR(line.actualPaise)} / {formatINR(line.amountPaise)}</strong>
        </div>
        <div className="budget-progress-bar" aria-label={`${line.name} budget usage`}>
          <span className={line.status} style={{ width: `${progress}%` }} />
        </div>
      </div>

      {expanded && <>
      <div className="budget-line-metrics">
        <Metric label="Remaining" value={formatINR(line.remainingPaise)} warning={line.remainingPaise < 0} />
        <Metric label="Projection" value={formatINR(line.projectedPaise)} warning={line.projectedPaise > line.amountPaise} />
      </div>

      <div className="budget-line-actions">
        {isEditing ? (
          <>
            <input
              aria-label={`Budget amount for ${line.name}`}
              inputMode="decimal"
              value={editAmount}
              onChange={(event) => onEditAmount(event.target.value)}
            />
            <button type="button" className="secondary-action" disabled={saving} onClick={onSave}>
              <Check size={16} />
              Save
            </button>
            <button type="button" className="secondary-action" onClick={onCancelEdit}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button type="button" className="secondary-action" onClick={onStartEdit}>
              <Pencil size={16} />
              Edit
            </button>
            <button type="button" className="secondary-action danger-action" onClick={onDelete}>
              <Trash2 size={16} />
              Remove
            </button>
          </>
        )}
      </div>
      </>}
    </article>
  );
}

function budgetScopeKey(scope: BudgetScope) {
  return `${scope.scopeType}:${scope.scopeId}`;
}

function budgetTypeOptions(scopes: BudgetScope[]): Array<{ typeId: string; typeName: string }> {
  const seen = new Set<string>();
  const types: Array<{ typeId: string; typeName: string }> = [];
  for (const scope of scopes) {
    if (!seen.has(scope.typeId)) {
      seen.add(scope.typeId);
      types.push({ typeId: scope.typeId, typeName: scope.typeName });
    }
  }
  return types;
}

function budgetSubLabel(scope: BudgetScope) {
  if (scope.scopeType === "type") {
    return "All subtypes";
  }
  const prefix = `${scope.typeName} / `;
  return scope.name.startsWith(prefix) ? scope.name.slice(prefix.length) : scope.name;
}

function budgetSummaryTone(plan: BudgetPlan): "neutral" | "warning" | "good" {
  if (plan.totals.overCount > 0 || plan.totals.criticalCount > 0 || plan.totals.watchCount > 0) {
    return "warning";
  }
  return plan.lines.length > 0 ? "good" : "neutral";
}

function AccountsPage({
  accounts,
  cardAlertPercent,
  refresh,
  showNotice,
  requestConfirm
}: {
  accounts: Account[];
  cardAlertPercent: number;
  refresh: () => Promise<void>;
  showNotice: (message: string) => void;
  requestConfirm: (request: ConfirmRequest) => void;
}) {
  const activeAccounts = accounts.filter((account) => !account.isArchived);

  async function remove(account: Account) {
    requestConfirm({
      message: "Are you sure you want to delete this?",
      detail: `${account.name} will disappear from the app. Existing transaction history is preserved when history is linked to this account.`,
      confirmLabel: "Delete",
      tone: "danger",
      onConfirm: async () => {
        try {
          const result = await Api.deleteAccount(account.id);
          await refresh();
          showNotice(result.mode === "hidden" ? "Account hidden. Existing history is preserved." : "Account deleted.");
        } catch (err) {
          showNotice(err instanceof Error ? err.message : "Could not remove account.");
        }
      }
    });
  }

  return (
    <div className="two-column">
      <Panel title="Accounts & cards">
        {activeAccounts.length === 0 ? (
          <EmptyState text="No active accounts or cards. Add one to keep tracking." />
        ) : (
          <div className="account-stack">
            {activeAccounts.map((account) => (
              <AccountManagerLine key={account.id} account={account} alertPercent={cardAlertPercent} onRemove={remove} />
            ))}
          </div>
        )}
        <p className="helper-text">
          Deleting an unused account removes it permanently. Accounts with linked transactions are hidden so reports keep their history.
        </p>
      </Panel>
      <Panel title="Add account">
        <AccountForm
          onCreated={async () => {
            await refresh();
            showNotice("Account added.");
          }}
        />
      </Panel>
    </div>
  );
}

function LoansPage({
  loans,
  categoryTypes,
  refresh,
  showNotice,
  requestConfirm
}: {
  loans: Loan[];
  categoryTypes: CategoryType[];
  refresh: () => Promise<void>;
  showNotice: (message: string) => void;
  requestConfirm: (request: ConfirmRequest) => void;
}) {
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const activeLoans = loans.filter((loan) => !loan.isArchived);
  const archivedLoans = loans.filter((loan) => loan.isArchived);
  const loanType = categoryTypes.find((type) => type.behavior === "loan");
  const activeOutstanding = activeLoans.reduce((sum, loan) => sum + loan.outstandingPaise, 0);
  const monthlyEmiTotal = activeLoans.reduce((sum, loan) => sum + loan.monthlyEmiPaise, 0);
  const paidInterest = activeLoans.reduce((sum, loan) => sum + loanInterestPaidValue(loan), 0);

  function archive(loan: Loan) {
    requestConfirm({
      message: "Are you sure you want to archive this loan?",
      detail: `${loan.name} will move out of active tracking. Existing transactions and reports stay preserved.`,
      confirmLabel: "Archive",
      tone: "danger",
      onConfirm: async () => {
        try {
          await Api.archiveLoan(loan.id);
          if (editingLoan?.id === loan.id) setEditingLoan(null);
          await refresh();
          showNotice("Loan archived.");
        } catch (err) {
          showNotice(err instanceof Error ? err.message : "Could not archive loan.");
        }
      }
    });
  }

  async function restore(loan: Loan) {
    try {
      await Api.updateLoan(loan.id, { isArchived: false });
      await refresh();
      showNotice("Loan restored.");
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Could not restore loan.");
    }
  }

  return (
    <div className="page-grid loans-page">
      <section className="summary-grid mini loan-summary-grid">
        <SummaryCard label="Active outstanding" value={formatINR(activeOutstanding)} icon={<Landmark />} tone="warning" />
        <SummaryCard label="Monthly EMI total" value={formatINR(monthlyEmiTotal)} icon={<CalendarDays />} />
        <SummaryCard label="Interest paid" value={formatINR(paidInterest)} icon={<BarChart3 />} />
      </section>

      <div className="two-column loans-layout">
        <Panel title="Loan tracker">
          {activeLoans.length === 0 ? (
            <EmptyState text="No active loans yet." />
          ) : (
            <div className="loan-card-grid">
              {activeLoans.map((loan) => (
                <LoanCard
                  key={loan.id}
                  loan={loan}
                  onEdit={setEditingLoan}
                  onArchive={archive}
                />
              ))}
            </div>
          )}

          {archivedLoans.length > 0 && (
            <>
              <h3 className="section-subtitle">Archived loans</h3>
              <div className="loan-card-grid archived-loans">
                {archivedLoans.map((loan) => (
                  <LoanCard
                    key={loan.id}
                    loan={loan}
                    onEdit={setEditingLoan}
                    onRestore={restore}
                  />
                ))}
              </div>
            </>
          )}
        </Panel>

        <Panel title={editingLoan ? "Edit loan" : "Add loan"}>
          {loanType ? (
            <LoanForm
              key={editingLoan?.id ?? "new-loan"}
              loan={editingLoan}
              loanType={loanType}
              onCancel={editingLoan ? () => setEditingLoan(null) : undefined}
              onSaved={async (message) => {
                setEditingLoan(null);
                await refresh();
                showNotice(message);
              }}
            />
          ) : (
            <EmptyState text="Loan Type is missing. Add a Type with Loan behavior in Categories first." />
          )}
        </Panel>
      </div>
    </div>
  );
}

function LoanForm({
  loan,
  loanType,
  onSaved,
  onCancel
}: {
  loan: Loan | null;
  loanType: CategoryType;
  onSaved: (message: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const defaultSubcategoryId = loan?.subcategoryId ?? loanType.subcategories[0]?.id ?? "__custom__";
  const [subcategoryChoice, setSubcategoryChoice] = useState(defaultSubcategoryId);
  const [customSubType, setCustomSubType] = useState("");
  const [name, setName] = useState(loan?.name ?? "");
  const [principal, setPrincipal] = useState(loan ? amountInputFromPaise(loan.principalAmountPaise) : "");
  const [outstanding, setOutstanding] = useState(loan ? amountInputFromPaise(loan.startingOutstandingPaise) : "");
  const [startMonth, setStartMonth] = useState(loan?.startMonth ?? currentMonth());
  const [interestRate, setInterestRate] = useState(loan ? rateInputFromBps(loan.annualInterestRateBps) : "");
  const [tenureMonths, setTenureMonths] = useState(loan ? String(loan.tenureMonths) : "");
  const [monthlyEmi, setMonthlyEmi] = useState(loan ? amountInputFromPaise(loan.monthlyEmiPaise) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      let subcategoryId = subcategoryChoice;
      if (subcategoryChoice === "__custom__") {
        if (!customSubType.trim()) {
          throw new Error("Enter the custom loan type name.");
        }
        const created = await Api.createSubcategory({
          typeId: loanType.id,
          name: customSubType.trim(),
          icon: "calendar-clock",
          color: "#be123c"
        });
        subcategoryId = created.id;
      }

      const payload = {
        name,
        subcategoryId,
        principalAmountPaise: parseAmountToPaise(principal),
        startingOutstandingPaise: parseAmountToPaise(outstanding),
        startMonth,
        annualInterestRateBps: parseRateToBps(interestRate),
        tenureMonths: Number.parseInt(tenureMonths, 10),
        monthlyEmiPaise: parseAmountToPaise(monthlyEmi)
      };

      if (loan) {
        await Api.updateLoan(loan.id, payload);
        await onSaved("Loan updated.");
      } else {
        await Api.createLoan(payload);
        setSubcategoryChoice(loanType.subcategories[0]?.id ?? "__custom__");
        setCustomSubType("");
        setName("");
        setPrincipal("");
        setOutstanding("");
        setStartMonth(currentMonth());
        setInterestRate("");
        setTenureMonths("");
        setMonthlyEmi("");
        await onSaved("Loan added.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save loan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack-form loan-form" onSubmit={submit}>
      <label>
        Loan name
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="HDFC home loan" required />
      </label>
      <label>
        Type of loan
        <select value={subcategoryChoice} onChange={(event) => setSubcategoryChoice(event.target.value)} required>
          {loanType.subcategories.map((subcategory) => (
            <option key={subcategory.id} value={subcategory.id}>
              {subcategory.name}
            </option>
          ))}
          <option value="__custom__">Add custom loan type</option>
        </select>
      </label>
      {subcategoryChoice === "__custom__" && (
        <label>
          Custom loan type
          <input
            value={customSubType}
            onChange={(event) => setCustomSubType(event.target.value)}
            placeholder="Education, Business..."
            required
          />
        </label>
      )}
      <label>
        Principal amount
        <input value={principal} onChange={(event) => setPrincipal(event.target.value)} placeholder="₹0" inputMode="decimal" required />
      </label>
      <label>
        Current outstanding
        <input value={outstanding} onChange={(event) => setOutstanding(event.target.value)} placeholder="₹0" inputMode="decimal" required />
      </label>
      <label>
        Month and year taken
        <input type="month" value={startMonth} onChange={(event) => setStartMonth(event.target.value)} required />
      </label>
      <label>
        Interest rate
        <input value={interestRate} onChange={(event) => setInterestRate(event.target.value)} placeholder="8.5%" inputMode="decimal" required />
      </label>
      <label>
        Tenure in months
        <input value={tenureMonths} onChange={(event) => setTenureMonths(event.target.value)} placeholder="240" inputMode="numeric" required />
      </label>
      <label>
        Monthly EMI
        <input value={monthlyEmi} onChange={(event) => setMonthlyEmi(event.target.value)} placeholder="₹0" inputMode="decimal" required />
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="loan-form-actions">
        {onCancel && (
          <button type="button" className="secondary-action" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
        <button className="primary-action" disabled={saving}>
          <Plus size={18} />
          {saving ? "Saving..." : loan ? "Save loan" : "Add loan"}
        </button>
      </div>
    </form>
  );
}

function LoanCard({
  loan,
  onEdit,
  onArchive,
  onRestore
}: {
  loan: Loan;
  onEdit: (loan: Loan) => void;
  onArchive?: (loan: Loan) => void;
  onRestore?: (loan: Loan) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const progress = loanProgressPercent(loan);
  const closed = loan.outstandingPaise <= 0;
  const monthsLeftLabel =
    loan.monthsLeft === null ? "Not enough EMI data" : loan.monthsLeft === 0 ? "Closing now" : `${loan.monthsLeft} months left`;

  return (
    <article className={`loan-card ${loan.isArchived ? "archived" : ""}`}>
      <div className="loan-card-header">
        <div className="loan-title">
          <span className="loan-icon" style={{ color: loan.subcategoryColor, background: `${loan.subcategoryColor}14` }}>
            <IconGlyph name={loan.subcategoryIcon} size={18} />
          </span>
          <div>
            <strong>{loan.name}</strong>
            <span>{loan.subcategoryName}</span>
          </div>
        </div>
        <div className="loan-header-actions">
          <span className={`loan-status ${closed ? "closed" : loan.isArchived ? "archived" : ""}`}>
            {loan.isArchived ? "Archived" : closed ? "Closed" : "Active"}
          </span>
          <button
            type="button"
            className={`icon-button disclosure-toggle ${expanded ? "expanded" : ""}`}
            aria-label={expanded ? `Collapse ${loan.name}` : `Expand ${loan.name}`}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            <ChevronDown size={18} />
          </button>
        </div>
      </div>

      <div className="loan-card-quick">
        <span>Current outstanding</span>
        <strong>{formatINR(loanOutstandingValue(loan))}</strong>
        <small>{monthsLeftLabel}</small>
      </div>

      {expanded && <>
      <div className="loan-progress">
        <div>
          <span>Principal repaid</span>
          <strong>{Math.round(progress)}%</strong>
        </div>
        <div className="loan-progress-bar">
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="loan-metrics">
        <Metric label="Current outstanding" value={formatINR(loanOutstandingValue(loan))} warning={loanOutstandingValue(loan) > 0} />
        <Metric label="Principal amount paid" value={formatINR(loanPrincipalPaidValue(loan))} />
        <Metric label="Interest paid" value={formatINR(loanInterestPaidValue(loan))} />
        <Metric label="Months left" value={monthsLeftLabel} warning={!closed && loan.monthsLeft !== null && loan.monthsLeft <= 6} />
      </div>

      <div className="loan-detail-grid">
        <div>
          <span>Principal</span>
          <strong>{formatINR(loan.principalAmountPaise)}</strong>
        </div>
        <div>
          <span>EMI</span>
          <strong>{formatINR(loan.monthlyEmiPaise)}</strong>
        </div>
        <div>
          <span>Interest</span>
          <strong>{formatRateFromBps(loan.annualInterestRateBps)}</strong>
        </div>
        <div>
          <span>Started</span>
          <strong>{formatMonth(loan.startMonth)}</strong>
        </div>
        <div>
          <span>Tenure</span>
          <strong>{loan.tenureMonths} months</strong>
        </div>
        <div>
          <span>Est. closure</span>
          <strong>{loan.closureMonth ? formatMonth(loan.closureMonth) : "Review EMI"}</strong>
        </div>
      </div>

      <div className="loan-actions">
        <button className="secondary-action" onClick={() => onEdit(loan)}>
          <Pencil size={16} />
          Edit
        </button>
        {loan.isArchived ? (
          <button className="secondary-action" onClick={() => onRestore?.(loan)}>
            <RotateCcw size={16} />
            Restore
          </button>
        ) : (
          <button className="secondary-action danger-action" onClick={() => onArchive?.(loan)}>
            <Archive size={16} />
            Archive
          </button>
        )}
      </div>

      <PaymentHistoryGrid source="loan" id={loan.id} />
      </>}
    </article>
  );
}

function InvestmentsPage({
  investments,
  refresh,
  showNotice,
  requestConfirm
}: {
  investments: Investment[];
  refresh: () => Promise<void>;
  showNotice: (message: string) => void;
  requestConfirm: (request: ConfirmRequest) => void;
}) {
  const [editing, setEditing] = useState<Investment | null>(null);
  const totalInvested = investments.reduce((sum, item) => sum + item.investedPaise, 0);
  const totalCurrent = investments.reduce((sum, item) => sum + item.currentValuePaise, 0);
  const totalGain = totalCurrent - totalInvested;
  const returnPercent = totalInvested > 0 ? Math.round((totalGain / totalInvested) * 100) : 0;
  const groups = INVESTMENT_TYPES.map((type) => ({
    type,
    items: investments.filter((item) => item.type === type.id)
  })).filter((group) => group.items.length > 0);
  const lastUpdated = investments.reduce(
    (latest, item) => (item.updatedAt > latest ? item.updatedAt : latest),
    ""
  );

  function remove(investment: Investment) {
    requestConfirm({
      message: "Remove this investment?",
      detail: `${investment.name} will be removed from your portfolio.`,
      confirmLabel: "Remove",
      tone: "danger",
      onConfirm: async () => {
        try {
          await Api.deleteInvestment(investment.id);
          if (editing?.id === investment.id) setEditing(null);
          await refresh();
          showNotice("Investment removed.");
        } catch (err) {
          showNotice(err instanceof Error ? err.message : "Could not remove investment.");
        }
      }
    });
  }

  return (
    <div className="page-grid loans-page">
      <section className="summary-grid report-summary">
        <SummaryCard label="Invested" value={formatINR(totalInvested)} icon={<WalletCards />} />
        <SummaryCard label="Current value" value={formatINR(totalCurrent)} icon={<BarChart3 />} />
        <SummaryCard
          label="Total gain"
          value={signedImpact(totalGain)}
          icon={<TrendingUp />}
          tone={totalGain >= 0 ? "good" : "warning"}
        />
        <SummaryCard
          label="Return"
          value={`${returnPercent >= 0 ? "+" : ""}${returnPercent}%`}
          icon={<ArrowDownUp />}
          tone={totalGain >= 0 ? "good" : "warning"}
        />
      </section>

      {lastUpdated && (
        <p className="helper-text investments-asof">
          <Info size={14} />
          Values are entered manually — figures reflect what you last saved on{" "}
          {formatDateWithYear(lastUpdated.slice(0, 10))}.
        </p>
      )}

      <div className="two-column loans-layout">
        <Panel title="Portfolio">
          {groups.length === 0 ? (
            <EmptyState text="No investments yet. Add your first holding on the right." />
          ) : (
            <div className="investment-groups">
              {groups.map((group) => {
                const invested = group.items.reduce((sum, item) => sum + item.investedPaise, 0);
                const current = group.items.reduce((sum, item) => sum + item.currentValuePaise, 0);
                return (
                  <div className="investment-group" key={group.type.id}>
                    <div className="investment-group-head">
                      <span className="investment-group-name" style={{ color: group.type.color }}>
                        <IconGlyph name={group.type.icon} size={15} />
                        {group.type.label}
                      </span>
                      <strong>{formatINR(current)}</strong>
                      <small className={current - invested >= 0 ? "amount-in" : "amount-out"}>
                        {signedImpact(current - invested)}
                      </small>
                    </div>
                    <div className="loan-card-grid">
                      {group.items.map((investment) => (
                        <InvestmentCard
                          key={investment.id}
                          investment={investment}
                          onEdit={setEditing}
                          onDelete={remove}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title={editing ? "Edit investment" : "Add investment"}>
          <InvestmentForm
            key={editing?.id ?? "new-investment"}
            investment={editing}
            onCancel={editing ? () => setEditing(null) : undefined}
            onSaved={async (message) => {
              setEditing(null);
              await refresh();
              showNotice(message);
            }}
          />
        </Panel>
      </div>
    </div>
  );
}

function InvestmentCard({
  investment,
  onEdit,
  onDelete
}: {
  investment: Investment;
  onEdit: (investment: Investment) => void;
  onDelete: (investment: Investment) => void;
}) {
  const positive = investment.gainPaise >= 0;
  const [expanded, setExpanded] = useState(false);
  return (
    <article className="loan-card investment-card">
      <div className="loan-card-header">
        <div className="loan-title">
          <span className="loan-icon" style={{ color: investment.color, background: `${investment.color}18` }}>
            <IconGlyph name={investment.icon} size={18} />
          </span>
          <div>
            <strong>{investment.name}</strong>
            <span>
              {investment.typeLabel}
              {investment.type === "stocks" && investment.shares != null
                ? ` · ${investment.shares} shares`
                : ""}
            </span>
          </div>
        </div>
        <div className="loan-header-actions">
          <span className={`investment-gain-badge ${positive ? "up" : "down"}`}>
            {positive ? "+" : ""}
            {investment.gainPercent}%
          </span>
          <button
            type="button"
            className={`icon-button disclosure-toggle ${expanded ? "expanded" : ""}`}
            aria-label={expanded ? `Collapse ${investment.name}` : `Expand ${investment.name}`}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            <ChevronDown size={18} />
          </button>
        </div>
      </div>

      <div className="loan-card-quick">
        <span>Current value</span>
        <strong>{formatINR(investment.currentValuePaise)}</strong>
        <small className={positive ? "amount-in" : "amount-out"}>{signedImpact(investment.gainPaise)}</small>
      </div>

      {expanded && <>
      <div className="investment-values">
        <div>
          <span>Invested</span>
          <strong>{formatINR(investment.investedPaise)}</strong>
        </div>
        <div>
          <span>Current</span>
          <strong>{formatINR(investment.currentValuePaise)}</strong>
        </div>
        <div>
          <span>Gain / loss</span>
          <strong className={positive ? "amount-in" : "amount-out"}>{signedImpact(investment.gainPaise)}</strong>
        </div>
      </div>

      {investment.purchaseDate && (
        <p className="investment-note">Invested on {formatDateWithYear(investment.purchaseDate)}</p>
      )}

      {investment.note && <p className="investment-note">{investment.note}</p>}

      <div className="loan-actions">
        <button type="button" className="secondary-action" onClick={() => onEdit(investment)}>
          <Pencil size={16} />
          Edit
        </button>
        <button type="button" className="secondary-action danger-action" onClick={() => onDelete(investment)}>
          <Trash2 size={16} />
          Remove
        </button>
      </div>

      {investment.type === "mutual_funds" && <PaymentHistoryGrid source="mutual_fund" id={investment.id} />}
      </>}
    </article>
  );
}

function InvestmentForm({
  investment,
  onSaved,
  onCancel
}: {
  investment: Investment | null;
  onSaved: (message: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [type, setType] = useState<InvestmentType>(investment?.type ?? "stocks");
  const [name, setName] = useState(investment?.name ?? "");
  const [invested, setInvested] = useState(investment ? amountInputFromPaise(investment.investedPaise) : "");
  const [currentValue, setCurrentValue] = useState(
    investment ? amountInputFromPaise(investment.currentValuePaise) : ""
  );
  const [sharesInput, setSharesInput] = useState(
    investment?.shares != null ? String(investment.shares) : ""
  );
  const [purchaseDate, setPurchaseDate] = useState(investment?.purchaseDate ?? todayISO());
  const [note, setNote] = useState(investment?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Enter a name for this investment.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const shares =
        type === "stocks" && sharesInput.trim() !== "" ? Number(sharesInput) : undefined;
      const payload = {
        type,
        name: name.trim(),
        investedPaise: parseAmountToPaise(invested),
        currentValuePaise: parseAmountToPaise(currentValue),
        shares,
        purchaseDate: purchaseDate || undefined,
        note: note.trim() || undefined
      };
      if (investment) {
        await Api.updateInvestment(investment.id, { ...payload, note: note.trim() });
        await onSaved("Investment updated.");
      } else {
        await Api.createInvestment(payload);
        setName("");
        setInvested("");
        setCurrentValue("");
        setSharesInput("");
        setPurchaseDate(todayISO());
        setNote("");
        await onSaved("Investment added.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save investment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack-form loan-form" onSubmit={submit}>
      <label>
        Type
        <select value={type} onChange={(event) => setType(event.target.value as InvestmentType)}>
          {INVESTMENT_TYPES.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Reliance, HDFC Flexicap, Plot in Mysore..." required />
      </label>
      <label>
        Amount invested
        <input value={invested} onChange={(event) => setInvested(event.target.value)} placeholder="₹0" inputMode="decimal" required />
      </label>
      <label>
        Current value
        <input value={currentValue} onChange={(event) => setCurrentValue(event.target.value)} placeholder="₹0" inputMode="decimal" required />
      </label>
      {type === "stocks" && (
        <label>
          Number of shares (optional)
          <input
            value={sharesInput}
            onChange={(event) => setSharesInput(event.target.value)}
            placeholder="e.g. 10.5"
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
          />
        </label>
      )}
      <label>
        Date invested
        <input type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} />
      </label>
      <label>
        Note (optional)
        <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. broker, folio, plot size" />
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="loan-form-actions">
        {onCancel && (
          <button type="button" className="secondary-action" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
        <button className="primary-action" disabled={saving}>
          <Plus size={18} />
          {saving ? "Saving..." : investment ? "Save investment" : "Add investment"}
        </button>
      </div>
    </form>
  );
}

function formatDateWithYear(dateLike: string) {
  const date = new Date(`${dateLike}T00:00:00`);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function SubscriptionsPage({
  subscriptions,
  refresh,
  showNotice,
  requestConfirm
}: {
  subscriptions: AutopaySubscription[];
  refresh: () => Promise<void>;
  showNotice: (message: string) => void;
  requestConfirm: (request: ConfirmRequest) => void;
}) {
  const [editing, setEditing] = useState<AutopaySubscription | null>(null);
  const active = subscriptions.filter((subscription) => !subscription.isArchived);
  const archived = subscriptions.filter((subscription) => subscription.isArchived);
  const activeCount = active.filter((subscription) => subscription.status === "active").length;
  const monthlyTotal = active
    .filter((subscription) => subscription.status === "active")
    .reduce((sum, subscription) => sum + subscription.amountPaise, 0);
  const totalPayments = subscriptions.reduce((sum, subscription) => sum + subscription.paymentCount, 0);

  function archive(subscription: AutopaySubscription) {
    requestConfirm({
      message: "Are you sure you want to archive this subscription?",
      detail: `${subscription.name} will move out of active tracking. Existing transactions and counts stay preserved.`,
      confirmLabel: "Archive",
      tone: "danger",
      onConfirm: async () => {
        try {
          await Api.archiveSubscription(subscription.id);
          if (editing?.id === subscription.id) setEditing(null);
          await refresh();
          showNotice("Subscription archived.");
        } catch (err) {
          showNotice(err instanceof Error ? err.message : "Could not archive subscription.");
        }
      }
    });
  }

  async function restore(subscription: AutopaySubscription) {
    try {
      await Api.updateSubscription(subscription.id, { isArchived: false });
      await refresh();
      showNotice("Subscription restored.");
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Could not restore subscription.");
    }
  }

  return (
    <div className="page-grid loans-page">
      <section className="summary-grid mini loan-summary-grid">
        <SummaryCard label="Active subscriptions" value={String(activeCount)} icon={<CalendarClock />} />
        <SummaryCard label="Monthly total" value={formatINR(monthlyTotal)} icon={<ArrowDownUp />} tone="warning" />
        <SummaryCard label="Payments logged" value={String(totalPayments)} icon={<Check />} />
      </section>

      <div className="two-column loans-layout">
        <Panel title="Subscription tracker">
          {active.length === 0 ? (
            <EmptyState text="No active subscriptions yet." />
          ) : (
            <div className="loan-card-grid">
              {active.map((subscription) => (
                <SubscriptionCard
                  key={subscription.id}
                  subscription={subscription}
                  onEdit={setEditing}
                  onArchive={archive}
                />
              ))}
            </div>
          )}

          {archived.length > 0 && (
            <>
              <h3 className="section-subtitle">Archived subscriptions</h3>
              <div className="loan-card-grid archived-loans">
                {archived.map((subscription) => (
                  <SubscriptionCard
                    key={subscription.id}
                    subscription={subscription}
                    onEdit={setEditing}
                    onRestore={restore}
                  />
                ))}
              </div>
            </>
          )}
        </Panel>

        <Panel title={editing ? "Edit subscription" : "Add subscription"}>
          <SubscriptionForm
            key={editing?.id ?? "new-subscription"}
            subscription={editing}
            onCancel={editing ? () => setEditing(null) : undefined}
            onSaved={async (message) => {
              setEditing(null);
              await refresh();
              showNotice(message);
            }}
          />
        </Panel>
      </div>
    </div>
  );
}

function SubscriptionCard({
  subscription,
  onEdit,
  onArchive,
  onRestore
}: {
  subscription: AutopaySubscription;
  onEdit: (subscription: AutopaySubscription) => void;
  onArchive?: (subscription: AutopaySubscription) => void;
  onRestore?: (subscription: AutopaySubscription) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const expired = subscription.status === "expired";
  return (
    <article className={`loan-card ${subscription.isArchived ? "archived" : ""}`}>
      <div className="loan-card-header">
        <div className="loan-title">
          <span className="loan-icon" style={{ color: "#4f46e5", background: "#4f46e514" }}>
            <IconGlyph name="calendar-clock" size={18} />
          </span>
          <div>
            <strong>{subscription.name}</strong>
            <span>{formatINR(subscription.amountPaise)} / cycle</span>
          </div>
        </div>
        <div className="loan-header-actions">
          <span className={`subscription-status ${expired ? "expired" : "active"}`}>
            {expired ? "Expired" : "Active"}
          </span>
          <button
            type="button"
            className={`icon-button disclosure-toggle ${expanded ? "expanded" : ""}`}
            aria-label={expanded ? `Collapse ${subscription.name}` : `Expand ${subscription.name}`}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            <ChevronDown size={18} />
          </button>
        </div>
      </div>

      <div className="loan-card-quick">
        <span>Payments made</span>
        <strong>{subscription.paymentCount}</strong>
        <small>Renews until {formatDateWithYear(subscription.expiryDate)}</small>
      </div>

      {expanded && <>
      <div className="subscription-meta">
        <div>
          <span>Started</span>
          <strong>{formatDateWithYear(subscription.startDate)}</strong>
        </div>
        <div>
          <span>Expires</span>
          <strong>{formatDateWithYear(subscription.expiryDate)}</strong>
        </div>
        <div>
          <span>Duration</span>
          <strong>{subscription.durationMonths} months</strong>
        </div>
        <div>
          <span>Payments made</span>
          <strong>{subscription.paymentCount}</strong>
        </div>
      </div>

      <div className="loan-actions">
        <button type="button" className="secondary-action" onClick={() => onEdit(subscription)}>
          <Pencil size={16} />
          Edit
        </button>
        {onRestore && (
          <button type="button" className="secondary-action" onClick={() => onRestore(subscription)}>
            <RotateCcw size={16} />
            Restore
          </button>
        )}
        {onArchive && (
          <button type="button" className="secondary-action danger-action" onClick={() => onArchive(subscription)}>
            <Archive size={16} />
            Archive
          </button>
        )}
      </div>

      <PaymentHistoryGrid source="autopay" id={subscription.id} />
      </>}
    </article>
  );
}

function SubscriptionForm({
  subscription,
  onSaved,
  onCancel
}: {
  subscription: AutopaySubscription | null;
  onSaved: (message: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(subscription?.name ?? "");
  const [amount, setAmount] = useState(subscription ? amountInputFromPaise(subscription.amountPaise) : "");
  const [startDate, setStartDate] = useState(subscription?.startDate ?? todayISO());
  const [durationMonths, setDurationMonths] = useState(String(subscription?.durationMonths ?? 12));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const payload = {
        name,
        amountPaise: parseAmountToPaise(amount),
        startDate,
        durationMonths: Number.parseInt(durationMonths, 10)
      };

      if (subscription) {
        await Api.updateSubscription(subscription.id, payload);
        await onSaved("Subscription updated.");
      } else {
        await Api.createSubscription(payload);
        setName("");
        setAmount("");
        setStartDate(todayISO());
        setDurationMonths("12");
        await onSaved("Subscription added.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save subscription.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack-form loan-form" onSubmit={submit}>
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Netflix, Spotify..." required />
      </label>
      <label>
        Amount
        <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="₹0" inputMode="decimal" required />
      </label>
      <label>
        Start date
        <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
      </label>
      <label>
        Duration
        <select value={durationMonths} onChange={(event) => setDurationMonths(event.target.value)} required>
          {AUTOPAY_DURATION_MONTH_OPTIONS.map((months) => (
            <option key={months} value={months}>
              {months} {months === 1 ? "month" : "months"}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="loan-form-actions">
        {onCancel && (
          <button type="button" className="secondary-action" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
        <button className="primary-action" disabled={saving}>
          <Plus size={18} />
          {saving ? "Saving..." : subscription ? "Save subscription" : "Add subscription"}
        </button>
      </div>
    </form>
  );
}

function CategoriesPage({
  categoryTypes,
  refresh,
  showNotice,
  requestConfirm
}: {
  categoryTypes: CategoryType[];
  refresh: () => Promise<void>;
  showNotice: (message: string) => void;
  requestConfirm: (request: ConfirmRequest) => void;
}) {
  const [mode, setMode] = useState<"subtype" | "type">("subtype");
  const [name, setName] = useState("");
  const [typeId, setTypeId] = useState(categoryTypes.find((type) => type.behavior !== "card_payment")?.id ?? "");
  const [behavior, setBehavior] = useState<TaxonomyBehavior>("expense");
  const [icon, setIcon] = useState(iconOptions[0]);
  const [color, setColor] = useState(colorOptions[0]);
  const [openTypeIds, setOpenTypeIds] = useState<string[]>([]);
  const parentTypes = useMemo(
    () => categoryTypes.filter((type) => type.behavior !== "card_payment"),
    [categoryTypes]
  );

  useEffect(() => {
    if (typeId && parentTypes.some((type) => type.id === typeId)) return;
    setTypeId(parentTypes[0]?.id ?? "");
  }, [parentTypes, typeId]);

  useEffect(() => {
    setOpenTypeIds((current) => {
      const available = new Set(categoryTypes.map((type) => type.id));
      const retained = current.filter((id) => available.has(id));
      return retained.length === current.length ? current : retained;
    });
  }, [categoryTypes]);

  function toggleTypeOpen(id: string) {
    setOpenTypeIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      if (mode === "type") {
        await Api.createCategoryType({ name, behavior, icon, color });
      } else {
        await Api.createSubcategory({ typeId, name, icon, color });
      }
      setName("");
      await refresh();
      showNotice(mode === "type" ? "Type created." : "SubType created.");
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Could not create item.");
    }
  }

  async function removeType(categoryType: CategoryType) {
    requestConfirm({
      message: "Are you sure you want to delete this?",
      detail: `${categoryType.name} and its SubTypes will be removed. Existing transactions will move to uncategorized.`,
      confirmLabel: "Delete",
      tone: "danger",
      onConfirm: async () => {
        try {
          await Api.deleteCategoryType(categoryType.id);
          await refresh();
          showNotice("Type deleted. Existing usage moved to uncategorized.");
        } catch (err) {
          showNotice(err instanceof Error ? err.message : "Could not delete Type.");
        }
      }
    });
  }

  async function removeSubcategory(subcategory: Subcategory) {
    requestConfirm({
      message: "Are you sure you want to delete this?",
      detail: `${subcategory.name} will be removed. Existing transactions will move to uncategorized.`,
      confirmLabel: "Delete",
      tone: "danger",
      onConfirm: async () => {
        try {
          await Api.deleteSubcategory(subcategory.id);
          await refresh();
          showNotice("SubType deleted. Existing usage moved to uncategorized.");
        } catch (err) {
          showNotice(err instanceof Error ? err.message : "Could not delete SubType.");
        }
      }
    });
  }

  return (
    <div className="two-column">
      <Panel title="Create Type or SubType">
        <form className="stack-form" onSubmit={submit}>
          <div className="segmented-control">
            <button type="button" className={mode === "subtype" ? "active" : ""} onClick={() => setMode("subtype")}>
              Add SubType
            </button>
            <button type="button" className={mode === "type" ? "active" : ""} onClick={() => setMode("type")}>
              Add Type
            </button>
          </div>
          {mode === "subtype" ? (
            <label>
              Parent Type
              <select value={typeId} onChange={(event) => setTypeId(event.target.value)} required>
                {parentTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              Money behavior
              <select value={behavior} onChange={(event) => setBehavior(event.target.value as TaxonomyBehavior)}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="loan">Loan</option>
                <option value="investment">Investment</option>
                <option value="transfer">Transfer</option>
                <option value="refund">Refund</option>
              </select>
            </label>
          )}
          <label>
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={mode === "type" ? "Education, Business..." : "Fuel, Pharmacy, Rent..."}
              required
            />
          </label>
          <div>
            <span className="field-label">Icon</span>
            <div className="icon-grid">
              {iconOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={icon === option ? "selected" : ""}
                  onClick={() => setIcon(option)}
                  title={option}
                >
                  <IconGlyph name={option} size={18} />
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="field-label">Color</span>
            <div className="color-grid">
              {colorOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={color === option ? "selected" : ""}
                  style={{ background: option }}
                  onClick={() => setColor(option)}
                  title={option}
                />
              ))}
            </div>
          </div>
          <button className="primary-action">
            <Plus size={18} />
            {mode === "type" ? "Add Type" : "Add SubType"}
          </button>
        </form>
      </Panel>

      <Panel title="Type library">
        <div className="taxonomy-tree">
          {categoryTypes.map((categoryType) => {
            const isOpen = openTypeIds.includes(categoryType.id);
            return (
            <div className={`taxonomy-group ${isOpen ? "open" : ""}`} key={categoryType.id}>
              <div className="taxonomy-type-row">
                <button
                  className="taxonomy-toggle"
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggleTypeOpen(categoryType.id)}
                >
                  <ChevronDown size={16} />
                  <CategoryBadge category={typeToCategory(categoryType)} />
                </button>
                <span className="category-flags">
                  {categoryType.isLocked ? "Locked" : categoryType.isSystem ? "Default" : "Custom"}
                </span>
                <button
                  className="icon-button danger"
                  onClick={() => removeType(categoryType)}
                  disabled={categoryType.isLocked}
                  title={categoryType.isLocked ? "This Type is locked" : "Delete Type"}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              {isOpen && categoryType.behavior === "card_payment" ? (
                <p className="helper-text dynamic-subtype-note">SubTypes come from active credit-card accounts.</p>
              ) : isOpen ? (
                <div className="taxonomy-subtypes">
                  {categoryType.subcategories.map((subcategory) => (
                    <div className="taxonomy-subtype-row" key={subcategory.id}>
                      <CategoryBadge category={subcategoryToCategory(subcategory)} compact />
                      <button
                        className="icon-button danger"
                        onClick={() => removeSubcategory(subcategory)}
                        disabled={subcategory.isLocked}
                        title={subcategory.isLocked ? "This SubType is locked" : "Delete SubType"}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
          })}
        </div>
      </Panel>
    </div>
  );
}

function AccountForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [type, setType] = useState<Account["type"]>("bank");
  const [name, setName] = useState("");
  const [starting, setStarting] = useState("");
  const [limit, setLimit] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      await Api.createAccount({
        name,
        type,
        startingBalancePaise: parseAmountToPaise(starting),
        creditLimitPaise: type === "credit_card" ? parseAmountToPaise(limit) : undefined
      });
      setName("");
      setStarting("");
      setLimit("");
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add account.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack-form" onSubmit={submit}>
      <label>
        Account type
        <select value={type} onChange={(event) => setType(event.target.value as Account["type"])}>
          <option value="bank">Bank account</option>
          <option value="credit_card">Credit card</option>
          <option value="food_card">Food card</option>
        </select>
      </label>
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="HDFC Bank, ICICI Card..." required />
      </label>
      <label>
        {type === "credit_card" ? "Starting outstanding" : "Starting balance"}
        <input value={starting} onChange={(event) => setStarting(event.target.value)} placeholder="₹0" inputMode="decimal" />
      </label>
      {type === "credit_card" && (
        <label>
          Credit limit
          <input value={limit} onChange={(event) => setLimit(event.target.value)} placeholder="₹1,50,000" inputMode="decimal" required />
        </label>
      )}
      {error && <p className="form-error">{error}</p>}
      <button className="primary-action" disabled={saving}>
        <Plus size={18} />
        {saving ? "Adding..." : "Add account"}
      </button>
    </form>
  );
}

function TransactionTable({
  transactions,
  empty,
  compact = false
}: {
  transactions: Transaction[];
  empty: string;
  compact?: boolean;
}) {
  if (transactions.length === 0) {
    return <EmptyState text={empty} />;
  }

  return (
    <div className={`transaction-table ${compact ? "compact" : ""}`}>
      <div className="table-head">
        <span>Date</span>
        <span>Account</span>
        <span>Merchant</span>
        <span>Type / SubType</span>
        <span>Amount</span>
      </div>
      {transactions.map((transaction) => (
        <div className="table-row" key={transaction.id}>
          <span>{formatShortDate(transaction.date)}</span>
          <span>{transaction.accountName}</span>
          <strong>{transaction.merchant || transaction.note || "Unknown"}</strong>
          <span>
            <TransactionTaxonomyBadge transaction={transaction} />
          </span>
          <strong className={transaction.direction === "inflow" ? "amount-in" : "amount-out"}>
            {signedAmount(transaction.amountPaise, transaction.direction)}
          </strong>
        </div>
      ))}
    </div>
  );
}

function CategoryBars({ categories }: { categories: Array<{ name: string; icon: string; color: string; amountPaise: number; share: number }> }) {
  if (categories.length === 0) {
    return <EmptyState text="No category spending for this period." />;
  }

  return (
    <div className="category-bars">
      {categories.map((category) => (
        <div className="bar-row" key={category.name}>
          <div className="bar-label">
            <span className="category-icon" style={{ "--cat-color": category.color } as React.CSSProperties}>
              <IconGlyph name={category.icon} size={16} />
            </span>
            <span>{category.name}</span>
          </div>
          <div className="bar-track">
            <div style={{ width: `${Math.min(Math.abs(category.share), 100)}%`, background: category.color }} />
          </div>
          <strong>{formatINR(category.amountPaise)}</strong>
        </div>
      ))}
    </div>
  );
}

function CashflowSummary({ types }: { types: MonthlyReport["types"] }) {
  const inflowParts = cashflowPartsFromTypes(types, "in");
  const outflowParts = cashflowPartsFromTypes(types, "out");
  const inflowPaise = inflowParts.reduce((sum, part) => sum + part.amountPaise, 0);
  const outflowPaise = outflowParts.reduce((sum, part) => sum + part.amountPaise, 0);
  const savingsPaise = inflowPaise - outflowPaise;

  return (
    <div className="cashflow-summary" aria-label="Inflow, outflow and savings breakdown">
      <div className="cashflow-summary-row cashflow-section">
        <div className="cashflow-formula-left" aria-label="Inflow minus outflow">
          <div className="cashflow-summary-line inflow">
            <div className="cashflow-summary-head">
              <span>Inflow</span>
              <strong className="amount-in">{formatINR(inflowPaise)}</strong>
            </div>
          </div>
          <span className="cashflow-summary-operator">−</span>
          <div className="cashflow-summary-line outflow">
            <div className="cashflow-summary-head">
              <span>Outflow</span>
              <strong className="amount-out">{formatINR(outflowPaise)}</strong>
            </div>
          </div>
        </div>
        <span className="cashflow-summary-operator">=</span>
        <div className="cashflow-summary-line savings">
          <div className="cashflow-summary-head">
            <span>Savings</span>
            <strong className={savingsPaise >= 0 ? "amount-in" : "amount-out"}>
              {signedImpact(savingsPaise)}
            </strong>
          </div>
        </div>
      </div>

      <CashflowEquation label="Inflow" total={inflowPaise} parts={inflowParts} tone="in" />
      <CashflowEquation label="Outflow" total={outflowPaise} parts={outflowParts} tone="out" />
    </div>
  );
}

function CashflowEquation({
  label,
  total,
  parts,
  tone
}: {
  label: string;
  total: number;
  parts: CashflowPart[];
  tone: "in" | "out";
}) {
  return (
    <div className={`cashflow-equation-row cashflow-section ${tone}`}>
      <div className="cashflow-equation-parts" aria-label={`${label} components`}>
        {parts.length === 0 ? (
          <span className="cashflow-equation-empty">Nothing yet</span>
        ) : (
          parts.map((part, index) => (
            <span className="cashflow-equation-piece" key={part.id}>
              {index > 0 && <span className="cashflow-equation-plus">+</span>}
              <span className="cashflow-equation-part" style={{ "--cat-color": part.color } as React.CSSProperties}>
                <span className="cashflow-equation-name">{part.name}</span>
                <span className="cashflow-equation-amount">{formatINR(part.amountPaise)}</span>
              </span>
            </span>
          ))
        )}
      </div>
      <span className="cashflow-equation-eq">=</span>
      <div className="cashflow-equation-total-card">
        <span>{label}</span>
        <strong className={tone === "in" ? "amount-in" : "amount-out"}>{formatINR(total)}</strong>
      </div>
    </div>
  );
}

function OutflowMixChart({ types }: { types: MonthlyReport["types"] }) {
  const outflowTypes = [...types.filter((type) => !INFLOW_BEHAVIORS.has(type.behavior))].sort(
    (a, b) => b.amountPaise - a.amountPaise
  );
  const outflowPaise = outflowTypes.reduce((sum, type) => sum + type.amountPaise, 0);
  const outflowSegments = consolidateDonutSegments(
    outflowTypes.map((type) => ({
      id: type.typeId,
      name: type.name,
      color: type.color,
      amountPaise: type.amountPaise
    }))
  );

  return (
    <div className="report-analytics outflow-mix-analytics">
      <div className="report-chart-header">
        <div>
          <span>Outflow mix</span>
          <strong>{formatINR(outflowPaise)}</strong>
        </div>
      </div>
      <div className="pie-panel">
        <div className="pie-chart">
          {outflowSegments.length === 0 || outflowPaise <= 0 ? (
            <EmptyState text="No outflow yet for this period." />
          ) : (
            <DonutChart
              segments={outflowSegments}
              totalPaise={outflowPaise}
              ariaLabel="Outflow mix by Type"
              centerLabel="Outflow"
              centerValue={formatINR(outflowPaise)}
              className="report-donut-chart"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ReportTypeAnalytics({
  types,
  selectedTypeId,
  onSelect
}: {
  types: MonthlyReport["types"];
  selectedTypeId: string;
  onSelect: (typeId: string) => void;
}) {
  if (types.length === 0) {
    return <EmptyState text="No Type breakdown for this period." />;
  }

  const selected = types.find((type) => type.typeId === selectedTypeId) ?? types[0];
  const segments = selected.subcategories
    .filter((item) => item.amountPaise > 0)
    .map((item) => ({
      id: item.subcategoryId,
      name: item.name,
      color: item.color,
      amountPaise: item.amountPaise
    }));
  const chartSegments = consolidateDonutSegments(segments);

  return (
    <div className="report-analytics">
      <div className="report-chart-header">
        <div>
          <span>SubType mix</span>
          <strong>{selected.name}</strong>
        </div>
      </div>
      <div className="type-filter-chips">
        {types.map((type) => (
          <button
            key={type.typeId}
            className={selected.typeId === type.typeId ? "active" : ""}
            onClick={() => onSelect(type.typeId)}
            type="button"
          >
            <CategoryBadge category={typeToCategory(type)} compact />
          </button>
        ))}
      </div>
      <div className="pie-panel">
        <div className="pie-chart">
          <DonutChart
            segments={chartSegments}
            totalPaise={selected.amountPaise}
            ariaLabel={`${selected.name} SubType percentage chart`}
            centerLabel="Total"
            centerValue={formatINR(selected.amountPaise)}
            className="report-donut-chart"
          />
        </div>
      </div>
    </div>
  );
}

function DonutChart({
  segments,
  totalPaise,
  ariaLabel,
  centerLabel,
  centerValue,
  className = ""
}: {
  segments: DonutSegment[];
  totalPaise: number;
  ariaLabel: string;
  centerLabel: string;
  centerValue: string;
  className?: string;
}) {
  const width = 520;
  const height = 360;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = 92;
  const lineStartRadius = 116;
  const lineBendRadius = 138;
  const circumference = 2 * Math.PI * radius;
  let cursor = 0;

  if (segments.length === 0 || totalPaise <= 0) {
    return (
      <svg className={`donut-chart ${className}`.trim()} viewBox={`0 0 ${width} ${height}`} aria-label="No chart data">
        <circle className="donut-empty" cx={centerX} cy={centerY} r={radius} />
      </svg>
    );
  }

  const slices = segments.map((segment) => {
    const share = (segment.amountPaise / totalPaise) * 100;
    const labelShare = segment.labelShare ?? share;
    const dash = (share / 100) * circumference;
    const dashOffset = -(cursor / 100) * circumference;
    const midAngle = ((cursor + share / 2) / 100) * 360 - 90;
    const radians = (midAngle * Math.PI) / 180;
    const side = Math.cos(radians) >= 0 ? "right" : "left";
    const slice = {
      ...segment,
      share,
      labelShare,
      dash,
      dashOffset,
      radians,
      side,
      labelY: centerY + Math.sin(radians) * lineBendRadius
    };
    cursor += share;
    return slice;
  });

  for (const side of ["left", "right"] as const) {
    const sideSlices = slices.filter((slice) => slice.side === side).sort((a, b) => a.labelY - b.labelY);
    // Each label is two text lines (~30px tall); stack labels relative to the
    // previous one so clustered small slices never overlap.
    const gap = 36;
    sideSlices.forEach((slice, index) => {
      const floor = index === 0 ? 45 : sideSlices[index - 1].labelY + gap;
      slice.labelY = Math.max(slice.labelY, floor);
    });
    for (let index = sideSlices.length - 1; index >= 0; index -= 1) {
      const ceiling = index === sideSlices.length - 1 ? 315 : sideSlices[index + 1].labelY - gap;
      sideSlices[index].labelY = Math.min(sideSlices[index].labelY, ceiling);
    }
  }

  return (
    <svg className={`donut-chart ${className}`.trim()} viewBox={`0 0 ${width} ${height}`} aria-label={ariaLabel}>
      <circle className="donut-track" cx={centerX} cy={centerY} r={radius} />
      {slices.map((segment) => {
        const startX = centerX + Math.cos(segment.radians) * lineStartRadius;
        const startY = centerY + Math.sin(segment.radians) * lineStartRadius;
        const bendX = centerX + Math.cos(segment.radians) * lineBendRadius;
        const labelX = segment.side === "right" ? 455 : 65;
        const lineEndX = segment.side === "right" ? labelX - 8 : labelX + 8;
        return (
          <g key={segment.id}>
            <title>{`${segment.name}: ${formatShare(segment.labelShare)} (${formatINR(segment.amountPaise)})`}</title>
            <circle
              className="donut-segment"
              cx={centerX}
              cy={centerY}
              r={radius}
              stroke={segment.color}
              strokeDasharray={`${segment.dash} ${circumference - segment.dash}`}
              strokeDashoffset={segment.dashOffset}
              transform={`rotate(-90 ${centerX} ${centerY})`}
            />
            <polyline
              className="donut-leader"
              stroke={segment.color}
              points={`${startX},${startY} ${bendX},${segment.labelY} ${lineEndX},${segment.labelY}`}
            />
            <text
              className="donut-label"
              x={labelX}
              y={segment.labelY - 3}
              textAnchor={segment.side === "right" ? "start" : "end"}
            >
              <tspan x={labelX}>{segment.name}</tspan>
              <tspan className="donut-label-share" x={labelX} dy="16">{formatShare(segment.labelShare)}</tspan>
            </text>
          </g>
        );
      })}
      <circle className="donut-center" cx={centerX} cy={centerY} r="64" />
      <text className="donut-center-label" x={centerX} y={centerY - 5} textAnchor="middle">{centerLabel}</text>
      <text className="donut-center-value" x={centerX} y={centerY + 17} textAnchor="middle">{centerValue}</text>
    </svg>
  );
}

function consolidateDonutSegments(segments: DonutSegment[], maxSegments = 8): DonutSegment[] {
  const sorted = [...segments].sort((a, b) => b.amountPaise - a.amountPaise);
  if (sorted.length <= maxSegments) return sorted;

  const visible = sorted.slice(0, maxSegments - 1);
  const remainder = sorted.slice(maxSegments - 1);
  const amountPaise = remainder.reduce((sum, segment) => sum + segment.amountPaise, 0);
  const labelShare = remainder.reduce((sum, segment) => sum + (segment.labelShare ?? 0), 0);
  return [
    ...visible,
    {
      id: "other-chart-segments",
      name: "Other",
      color: "#64748b",
      amountPaise,
      ...(remainder.some((segment) => segment.labelShare !== undefined) ? { labelShare } : {})
    }
  ];
}

function CategoryBadge({ category, compact = false }: { category: Category; compact?: boolean }) {
  return (
    <span
      className={`category-badge ${compact ? "compact" : ""}`}
      style={{ "--cat-color": category.color } as React.CSSProperties}
    >
      <IconGlyph name={category.icon} size={14} />
      <span className="category-badge-label">{category.name}</span>
    </span>
  );
}

function TransactionTag({
  icon,
  label,
  tone = "neutral",
  color
}: {
  icon?: React.ReactNode;
  label: string;
  tone?: "neutral" | "account" | "method" | "type" | "subtype";
  color?: string;
}) {
  const colorStyle = color ? ({ "--cat-color": color } as React.CSSProperties) : undefined;

  return (
    <span className={`transaction-tag ${tone}`} style={colorStyle}>
      {icon}
      <span>{label}</span>
    </span>
  );
}

function TransactionTaxonomyBadge({
  transaction,
  compact = false
}: {
  transaction: Transaction;
  compact?: boolean;
}) {
  const typeCategory = typeCategoryFromTransaction(transaction);
  const category = categoryFromTransaction(transaction);
  return (
    <span className={`taxonomy-badges ${compact ? "compact" : ""}`}>
      <CategoryBadge category={typeCategory} compact={compact} />
      <CategoryBadge category={category} compact={compact} />
    </span>
  );
}

function typeCategoryFromTransaction(transaction: Transaction): Category {
  return {
    id: transaction.typeId ?? "uncategorized",
    name: transaction.typeName ?? "Uncategorized",
    icon: transaction.typeIcon ?? "circle-question",
    color: transaction.typeColor ?? "#ea580c",
    isSystem: true,
    isLocked: false,
    sortOrder: 0
  };
}

function categoryFromTransaction(transaction: Transaction): Category {
  if (transaction.kind === "card_payment" && transaction.transferAccountName) {
    return {
      id: transaction.transferAccountId ?? "",
      name: transaction.transferAccountName,
      icon: "credit-card",
      color: transaction.typeColor ?? "#ea580c",
      isSystem: true,
      isLocked: false,
      sortOrder: 0
    };
  }

  return {
    id: transaction.subcategoryId ?? transaction.typeId ?? transaction.categoryId ?? "",
    name:
      transaction.subcategoryName ??
      transaction.typeName ??
      transaction.categoryName ??
      "Uncategorized",
    icon:
      transaction.subcategoryIcon ??
      transaction.typeIcon ??
      transaction.categoryIcon ??
      "circle-question",
    color:
      transaction.subcategoryColor ??
      transaction.typeColor ??
      transaction.categoryColor ??
      "#ea580c",
    isSystem: true,
    isLocked: false,
    sortOrder: 0
  };
}

function OverviewAccountLine({ account, alertPercent }: { account: Account; alertPercent: number }) {
  const isCard = account.type === "credit_card";
  const limit = account.creditLimitPaise ?? 0;
  const usage = isCard && limit > 0 ? Math.min(Math.max(Math.round((account.outstandingPaise / limit) * 100), 0), 100) : 0;
  const highUsage = isCard && usage > alertPercent;

  return (
    <div className="account-line overview-account-line">
      <div className="account-leading">
        <span className={`account-icon ${accountIconTone(account.type)}`}>
          {accountIconForType(account.type, 21)}
        </span>
        <div>
          <strong>{account.name}</strong>
          <span>{accountTypeLabel(account.type)}</span>
        </div>
      </div>
      <div className="account-values">
        {isCard ? (
          <>
            <strong className={highUsage ? "utilization-danger" : ""}>{usage}%</strong>
            <span>Utilized</span>
          </>
        ) : (
          <>
            <strong>{formatINR(account.balancePaise)}</strong>
            <span>Balance</span>
          </>
        )}
      </div>
    </div>
  );
}

const FAQ_ITEMS: Array<{ question: string; answer: string }> = [
  {
    question: "Where is my data stored? Is anything uploaded online?",
    answer:
      "Everything runs on this device. Your accounts, transactions, budgets and settings live in a local database on your computer — nothing is uploaded to any server. Backups are also saved locally."
  },
  {
    question: "How is 'Available cash' calculated?",
    answer:
      "It's the money across your bank and food-card accounts: each account's starting balance, plus every income you recorded into it, minus every expense, transfer and card payment made from it."
  },
  {
    question: "How is a credit card's 'Outstanding' and 'Available limit' calculated?",
    answer:
      "Outstanding is what you currently owe: the card's starting balance plus everything charged to it, minus the payments you've made toward it. Available limit is the card's total limit minus the outstanding."
  },
  {
    question: "How is 'This month spending' calculated?",
    answer:
      "It adds up every expense dated in the current calendar month. Income, transfers between your own accounts, and credit-card payments are not counted as spending."
  },
  {
    question: "How does a budget's 'Projection' work?",
    answer:
      "It estimates where your spending will land by month-end if you keep the current pace. It takes what you've spent so far and scales it up by how much of the month has passed — for example, ₹9,000 spent one-third of the way through the month projects to about ₹27,000."
  },
  {
    question: "What do the budget labels mean — On track, Watch, Likely to exceed, Over budget?",
    answer:
      "On track means spending is comfortably within budget. Watch means you're getting close. Likely to exceed means that, at your current pace, the projection lands over the budget. Over budget means you've already spent more than the budgeted amount."
  },
  {
    question: "What's the difference between a Type budget and a SubType budget?",
    answer:
      "A Type budget (chosen as 'All subtypes') caps a whole category like Expense. A SubType budget caps a single line like Groceries. For a given month you can budget either the whole Type or its individual SubTypes — not both at once."
  },
  {
    question: "Which categories can I set a budget for?",
    answer:
      "Budgets track outflow categories: Expense, Loan, Investment and Transfer. Income isn't budgeted, so it won't appear as a budget line."
  },
  {
    question: "How does AutoPay 'Payments made' count work?",
    answer:
      "Each time you add a transaction, choose SubType = AutoPay, and link it to a subscription, that subscription's counter goes up by one. Deleting or unlinking the transaction lowers the count again."
  },
  {
    question: "How does a mutual fund's monthly payment history (the ticks) work?",
    answer:
      "It works just like AutoPay. When you add an investment transaction, choose SubType = Mutual Funds and pick which fund it belongs to from the 'Mutual fund' dropdown. A month is ticked only for the specific fund that has a linked transaction that month — funds without a tracked payment stay unticked. Older transactions that were never linked to a fund won't tick until you edit them and choose the fund."
  },
  {
    question: "Are my investment values updated automatically?",
    answer:
      "No. Stocks, mutual funds, gold, land, property and PF values are entered by you and stay fixed until you edit them. The Investments page shows the date you last saved a change so you know how current the figures are. Open a holding with the chevron (▾) to see its full details and payment history."
  },
  {
    question: "How are Inflow, Outflow and Savings in Reports calculated?",
    answer:
      "Inflow adds up everything that brought money in for the period (income and refunds across all their categories). Outflow adds up everything that took money out (expense, loan, investment, transfer and any other outflow categories). Savings is simply Inflow minus Outflow — positive means you kept money, negative means you spent more than came in."
  },
  {
    question: "How is the 'Spending mix' chart calculated?",
    answer:
      "It shows how this month's spending splits across your categories, as a share of the total. The largest categories are shown individually and the smallest are grouped together as 'Other'."
  },
  {
    question: "How are backups made?",
    answer:
      "The app saves a local backup automatically every 30 minutes while it's running, and once more when you close it normally. Backups are kept in a local 'backups' folder on this device."
  }
];

function FaqPage() {
  return (
    <div className="page-grid">
      <Panel title="Frequently asked questions">
        <p className="helper-text faq-intro">
          Plain-language answers about how the numbers in this app are worked out.
        </p>
        <div className="faq-list">
          {FAQ_ITEMS.map((item) => (
            <FaqItem key={item.question} question={item.question} answer={item.answer} />
          ))}
        </div>
      </Panel>
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`faq-item ${open ? "open" : ""}`}>
      <button
        type="button"
        className="faq-question"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{question}</span>
        <ChevronDown size={18} className={`faq-chevron ${open ? "expanded" : ""}`} />
      </button>
      {open && <p className="faq-answer">{answer}</p>}
    </div>
  );
}

function CardLimitSummary({ account, alertPercent }: { account: Account; alertPercent: number }) {
  const limit = account.creditLimitPaise ?? 0;
  const outstanding = account.outstandingPaise;
  const available = account.availableLimitPaise ?? Math.max(limit - outstanding, 0);
  const usage = creditUtilization(account);
  const highUsage = usage > alertPercent;

  return (
    <div className="card-limit-summary">
      <div className="card-utilization-row">
        <span>Utilization</span>
        <strong className={highUsage ? "utilization-danger" : ""}>{usage}%</strong>
      </div>
      <div className="card-limit-meter">
        <span className={highUsage ? "danger" : ""} style={{ width: `${usage}%` }} />
      </div>
      <div className="card-limit-grid">
        <div>
          <span>Total Amount</span>
          <strong>{formatINR(limit)}</strong>
        </div>
        <div className={highUsage ? "danger" : "warning"}>
          <span>Outstanding</span>
          <strong>{formatINR(outstanding)}</strong>
        </div>
        <div className="good">
          <span>Available</span>
          <strong>{formatINR(available)}</strong>
        </div>
      </div>
    </div>
  );
}

function AccountImpactCard({ account, transactions }: { account: Account; transactions: Transaction[] }) {
  const impact = accountImpact(account, transactions);
  const isPositive = impact.amountPaise > 0;
  const isNegative = impact.amountPaise < 0;

  return (
    <div className={`impact-card ${isPositive ? "positive" : isNegative ? "negative" : "flat"}`}>
      <div className="impact-main">
        <span className="impact-arrow">{isPositive ? "↑" : isNegative ? "↓" : "→"}</span>
        <div>
          <strong>{account.name}</strong>
          <span>{account.type === "credit_card" ? "Outstanding movement" : "Balance movement"}</span>
        </div>
      </div>
      <div className="impact-values">
        <strong>{signedImpact(impact.amountPaise)}</strong>
        <span>{impact.percentLabel}</span>
      </div>
    </div>
  );
}

function ProfilePage({
  profile,
  settings,
  backupStatus,
  theme,
  saving,
  cardAlertPercent,
  onProfileChange,
  onSaveProfile,
  onSaveCardAlert,
  onThemeToggle
}: {
  profile: UserProfile;
  settings: Record<string, string>;
  backupStatus: BackupStatus | null;
  theme: Theme;
  saving: boolean;
  cardAlertPercent: number;
  onProfileChange: (profile: UserProfile) => void;
  onSaveProfile: () => void;
  onSaveCardAlert: (percent: number) => Promise<void> | void;
  onThemeToggle: () => void;
}) {
  const displayName = profile.name || "Your profile";
  const displayEmail = profile.email || "Local profile";
  const [cardAlertDraft, setCardAlertDraft] = useState(String(cardAlertPercent));

  useEffect(() => {
    setCardAlertDraft(String(cardAlertPercent));
  }, [cardAlertPercent]);

  const draftValue = Number.parseInt(cardAlertDraft, 10);
  const draftIsValid = Number.isInteger(draftValue) && draftValue >= 1 && draftValue <= 100;
  const profileAgeText = profile.age.trim();
  const profileAge = Number.parseInt(profileAgeText, 10);
  const profileCanSave =
    profile.name.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email.trim()) &&
    /^\d+$/.test(profileAgeText) &&
    Number.isInteger(profileAge) &&
    profileAge >= 1 &&
    profileAge <= 120;

  return (
    <div className="profile-page">
      <div className="profile-menu profile-page-card" aria-label="Profile">
        <div className="profile-card-header">
          <div className="profile-avatar">{profile.name.trim().charAt(0).toUpperCase() || "₹"}</div>
          <div>
            <h2>{displayName}</h2>
            <p>{displayEmail}</p>
          </div>
        </div>

        <div className="profile-fields">
          <label>
            Name
            <input
              value={profile.name}
              onChange={(event) => onProfileChange({ ...profile, name: event.target.value })}
              placeholder="Add your name"
            />
          </label>
          <label>
            Email
            <input
              value={profile.email}
              onChange={(event) => onProfileChange({ ...profile, email: event.target.value })}
              placeholder="name@example.com"
            />
          </label>
          <label>
            Age
            <input
              value={profile.age}
              inputMode="numeric"
              onChange={(event) => onProfileChange({ ...profile, age: event.target.value })}
              placeholder="Add age"
            />
          </label>
          <button
            className={`profile-save-button ${profileCanSave ? "" : "blurred"}`}
            onClick={onSaveProfile}
            disabled={saving || !profileCanSave}
            title={profileCanSave ? "Save profile" : "Enter a valid name, email, and age"}
          >
            <Check size={16} />
            {saving ? "Saving..." : "Save profile"}
          </button>
        </div>

        <div className="profile-settings" aria-label="Settings">
          <h3>Settings</h3>
          <div className="settings-row">
            <span>Currency</span>
            <strong>{settings.currency ?? "INR"}</strong>
          </div>
          <div className="settings-row">
            <span>Week starts from</span>
            <strong>{formatWeekStart(settings.week_start)}</strong>
          </div>
          <div className="settings-row card-alert-row">
            <span>Card utilization alert</span>
            <div className="card-alert-controls">
              <input
                aria-label="Card utilization alert percentage"
                inputMode="numeric"
                value={cardAlertDraft}
                onChange={(event) => setCardAlertDraft(event.target.value)}
              />
              <span className="card-alert-suffix">%</span>
              <button
                type="button"
                className="secondary-action"
                disabled={!draftIsValid || draftValue === cardAlertPercent}
                onClick={() => void onSaveCardAlert(draftValue)}
              >
                Save
              </button>
            </div>
            <small>Credit cards turn red when utilization crosses this value (1–100).</small>
          </div>
          <div className="settings-row backup-row">
            <span>Backup status</span>
            <strong>{formatBackupStatus(backupStatus)}</strong>
            <small>{formatBackupDetail(backupStatus)}</small>
          </div>
          <button className="settings-row theme-row" onClick={onThemeToggle}>
            <span>{theme === "dark" ? "Light theme" : "Dark theme"}</span>
            <strong>{theme === "dark" ? "Switch on" : "Switch on"}</strong>
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function AccountManagerLine({
  account,
  alertPercent,
  onRemove
}: {
  account: Account;
  alertPercent: number;
  onRemove?: (account: Account) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isCard = account.type === "credit_card";
  const primaryValue = isCard ? account.outstandingPaise : account.balancePaise;
  const primaryLabel = isCard ? "Outstanding" : "Balance";

  return (
    <article className={`loan-card account-card ${account.isArchived ? "archived" : ""}`}>
      <div className="loan-card-header">
        <div className="loan-title">
          <span className={`account-icon ${accountIconTone(account.type)}`}>
            {accountIconForType(account.type, 20)}
          </span>
          <div>
            <strong>{account.name}</strong>
            <span>{accountTypeLabel(account.type)}</span>
          </div>
        </div>
        <div className="loan-header-actions">
          <div className="account-card-primary">
            <strong>{formatINR(primaryValue)}</strong>
            <span>{primaryLabel}</span>
          </div>
          <button
            type="button"
            className={`icon-button disclosure-toggle ${expanded ? "expanded" : ""}`}
            aria-label={expanded ? `Collapse ${account.name}` : `Expand ${account.name}`}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            <ChevronDown size={18} />
          </button>
        </div>
      </div>

      {expanded && <>
        {isCard && <CardLimitSummary account={account} alertPercent={alertPercent} />}
        <div className="account-actions">
          <button className="secondary-action danger-action" onClick={() => onRemove?.(account)}>
            <Trash2 size={16} />
            Delete
          </button>
        </div>
      </>}
    </article>
  );
}

function Panel({
  title,
  action,
  children
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>{title}</h2>
        {action && <div className="panel-action">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function CollapsiblePanel({
  title,
  action,
  expanded,
  children
}: {
  title: string;
  action?: React.ReactNode;
  expanded: boolean;
  children: React.ReactNode;
}) {
  const contentId = `panel-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <section className={`panel collapsible-panel ${expanded ? "expanded" : ""}`}>
      <div className="panel-header">
        <h2>{title}</h2>
        {action && (
          <div className="panel-header-actions">
            <div className="panel-action">{action}</div>
          </div>
        )}
      </div>
      {expanded && <div id={contentId} className="collapsible-content">{children}</div>}
    </section>
  );
}

function OverviewDisclosure({
  title,
  expanded,
  children
}: {
  title: string;
  expanded: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="overview-disclosure">
      <div className="overview-disclosure-header">
        <h2>{title}</h2>
      </div>
      {expanded && <div className="collapsible-content">{children}</div>}
    </section>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone = "neutral"
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "neutral" | "warning" | "good";
}) {
  return (
    <div className={`summary-card ${tone}`}>
      <span>{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function Metric({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className={`metric ${warning ? "warning" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function PanelLoader({ label }: { label: string }) {
  return (
    <div className="panel-loader">
      <Loader2 className="spin" size={20} />
      {label}
    </div>
  );
}

function FullScreenState({
  icon,
  title,
  detail
}: {
  icon: React.ReactNode;
  title: string;
  detail?: string;
}) {
  return (
    <div className="fullscreen-state">
      <div>{icon}</div>
      <h1>{title}</h1>
      {detail && <p>{detail}</p>}
    </div>
  );
}

function ConfirmModal({
  request,
  onCancel,
  onDone
}: {
  request: ConfirmRequest;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [working, setWorking] = useState(false);

  async function confirm() {
    setWorking(true);
    try {
      await request.onConfirm();
      onDone();
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className={`confirm-modal ${request.tone === "danger" ? "danger" : ""}`} role="dialog" aria-modal="true">
        <div className="confirm-icon">
          <Trash2 size={20} />
        </div>
        <div>
          <h2>{request.message}</h2>
          {request.detail && <p>{request.detail}</p>}
        </div>
        <div className="confirm-actions">
          <button className="secondary-action" onClick={onCancel} disabled={working}>
            Cancel
          </button>
          <button className="primary-action danger-confirm" onClick={confirm} disabled={working}>
            {working ? "Working..." : request.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function monthEndForInput(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const date = new Date(year, monthIndex, 0);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function recentMonthOptions(fromMonth: string, count: number) {
  const [year, monthNumber] = fromMonth.split("-").map(Number);
  const options: Array<{ value: string; label: string }> = [];
  for (let back = 0; back < count; back += 1) {
    const date = new Date(year, monthNumber - 1 - back, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    options.push({ value, label: formatMonth(value) });
  }
  return options;
}

function draftFromTransaction(
  transaction: Transaction,
  categoryTypes: CategoryType[],
  accounts: Account[]
): TransactionEditDraft {
  const fallbackType = typeForKind(categoryTypes, transaction.kind);
  return {
    id: transaction.id,
    date: transaction.date,
    accountId: transaction.accountId,
    kind: transaction.kind,
    method: transaction.method,
    merchant: transaction.merchant ?? "",
    note: transaction.note ?? "",
    typeId: transaction.typeId ?? fallbackType?.id ?? "",
    subcategoryId: transaction.subcategoryId ?? "",
    amount: (transaction.amountPaise / 100).toFixed(2),
    transferAccountId:
      transaction.transferAccountId ??
      accounts.find((account) => account.type === "credit_card")?.id ??
      "",
    loanId: transaction.loanId ?? "",
    loanPaymentType: transaction.loanPaymentType ?? "emi",
    subscriptionId: transaction.subscriptionId ?? "",
    investmentId: transaction.investmentId ?? ""
  };
}

function flattenSubcategories(categoryTypes: CategoryType[]): Category[] {
  return categoryTypes.flatMap((type) =>
    type.subcategories.map((subcategory) => subcategoryToCategory(subcategory))
  );
}

function preferredType(categoryTypes: CategoryType[], behavior: TaxonomyBehavior) {
  return categoryTypes.find((type) => type.behavior === behavior);
}

function typeForKind(categoryTypes: CategoryType[], kind: TransactionKind) {
  return categoryTypes.find((type) => type.behavior === behaviorForKind(kind));
}

function behaviorForKind(kind: TransactionKind): TaxonomyBehavior {
  if (kind === "income") return "income";
  if (kind === "investment") return "investment";
  if (kind === "emi") return "loan";
  if (kind === "transfer") return "transfer";
  if (kind === "card_payment") return "card_payment";
  if (kind === "refund" || kind === "reversal") return "refund";
  return "expense";
}

function kindForBehavior(behavior: TaxonomyBehavior): TransactionKind {
  if (behavior === "income") return "income";
  if (behavior === "investment") return "investment";
  if (behavior === "loan") return "emi";
  if (behavior === "transfer") return "transfer";
  if (behavior === "card_payment") return "card_payment";
  if (behavior === "refund") return "refund";
  return "expense";
}

function directionForBehavior(behavior: TaxonomyBehavior) {
  return behavior === "income" || behavior === "refund" ? "inflow" : "outflow";
}

function subcategoryToCategory(subcategory: Subcategory): Category {
  return {
    id: subcategory.id,
    name: subcategory.name,
    icon: subcategory.icon,
    color: subcategory.color,
    isSystem: subcategory.isSystem,
    isLocked: subcategory.isLocked,
    sortOrder: subcategory.sortOrder
  };
}

function typeToCategory(type: CategoryType | MonthlyReport["types"][number]): Category {
  const id = "typeId" in type ? type.typeId : type.id;
  return {
    id,
    name: type.name,
    icon: type.icon,
    color: type.color,
    isSystem: "isSystem" in type ? type.isSystem : true,
    isLocked: "isLocked" in type ? type.isLocked : false,
    sortOrder: "sortOrder" in type ? type.sortOrder : 0
  };
}

function accountImpact(account: Account, transactions: Transaction[]) {
  const amountPaise = transactions.reduce((sum, transaction) => {
    if (account.type === "credit_card") {
      if (transaction.accountId === account.id && transaction.direction === "outflow") return sum - transaction.amountPaise;
      if (transaction.accountId === account.id && transaction.direction === "inflow") return sum + transaction.amountPaise;
      if (transaction.kind === "card_payment" && transaction.transferAccountId === account.id) return sum + transaction.amountPaise;
      return sum;
    }

    if (transaction.accountId !== account.id) return sum;
    return sum + (transaction.direction === "inflow" ? transaction.amountPaise : -transaction.amountPaise);
  }, 0);

  const base = account.type === "credit_card" ? account.creditLimitPaise ?? 0 : account.startingBalancePaise;
  const percent = base > 0 ? Math.round((Math.abs(amountPaise) / base) * 1000) / 10 : null;

  return {
    amountPaise,
    percentLabel: percent === null ? "New activity" : `${percent}%`
  };
}

function signedImpact(paise: number) {
  if (paise === 0) return formatINR(0);
  return `${paise > 0 ? "+" : "-"}${formatINR(Math.abs(paise))}`;
}

function formatShare(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  if (value < 1) return "<1%";
  if (value < 10) return `${Math.round(value * 10) / 10}%`;
  return `${Math.round(value)}%`;
}

function amountInputFromPaise(paise: number) {
  return (paise / 100).toFixed(2);
}

function parseRateToBps(value: string) {
  const normalized = value.replace("%", "").trim();
  const rate = Number.parseFloat(normalized);
  if (!Number.isFinite(rate) || rate < 0) {
    throw new Error("Enter a valid interest rate.");
  }
  return Math.round(rate * 100);
}

function rateInputFromBps(bps: number) {
  return String(Math.round((bps / 100) * 100) / 100);
}

function formatRateFromBps(bps: number) {
  return `${rateInputFromBps(bps)}%`;
}

function loanProgressPercent(loan: Loan) {
  const principal = safePaise(loan.principalAmountPaise);
  if (principal <= 0) return 0;
  return Math.min(Math.max((loanPrincipalPaidValue(loan) / principal) * 100, 0), 100);
}

function safePaise(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function loanOutstandingValue(loan: Loan) {
  return safePaise(loan.outstandingPaise);
}

function loanPrincipalPaidValue(loan: Loan) {
  const direct = safePaise(loan.principalPaidPaise);
  if (direct > 0) return direct;
  return Math.max(safePaise(loan.principalAmountPaise) - loanOutstandingValue(loan), 0);
}

function loanInterestPaidValue(loan: Loan) {
  return safePaise(loan.interestPaidPaise);
}

function accountIconForType(type: Account["type"], size = 16) {
  if (type === "credit_card") return <CreditCard size={size} />;
  if (type === "food_card") return <Utensils size={size} />;
  return <Landmark size={size} />;
}

function accountTypeLabel(type: Account["type"]) {
  if (type === "credit_card") return "Credit card";
  if (type === "food_card") return "Food card";
  return "Bank account";
}

function methodLabel(method: PaymentMethod) {
  if (method === "upi") return "UPI";
  if (method === "credit_card") return "Credit card";
  if (method === "bank_transfer") return "Bank transfer";
  if (method === "cash") return "Cash";
  return "Other";
}

function accountIconTone(type: Account["type"]) {
  if (type === "credit_card") return "card";
  if (type === "food_card") return "food";
  return "bank";
}

function creditUtilization(account: Account) {
  const limit = account.creditLimitPaise ?? 0;
  if (account.type !== "credit_card" || limit <= 0) {
    return 0;
  }
  return Math.min(Math.max(Math.round((account.outstandingPaise / limit) * 100), 0), 100);
}

function formatWeekStart(value: string | undefined) {
  if (!value) return "Monday";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatBackupStatus(status: BackupStatus | null) {
  if (!status?.lastBackupAt) return "No backup yet";
  const date = new Date(status.lastBackupAt);
  return `Last backup: ${date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

function formatBackupDetail(status: BackupStatus | null) {
  const intervalMinutes = Math.round((status?.intervalMs ?? 30 * 60 * 1000) / 60_000);
  if (!status?.lastBackupAt) {
    return `Pending: automatic backup runs every ${intervalMinutes} minutes while the app is open.`;
  }

  const mode =
    status.lastBackupMode === "auto"
      ? "Automatic"
      : status.lastBackupMode === "shutdown"
        ? "Shutdown"
        : "Manual";
  return `${mode} backup · every ${intervalMinutes} minutes`;
}
