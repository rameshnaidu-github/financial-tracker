import {
  ArrowDownUp,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  CreditCard,
  Download,
  FileSpreadsheet,
  Home,
  Landmark,
  Loader2,
  Archive,
  Moon,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Sun,
  Tags,
  Trash2,
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
import type {
  Account,
  BackupStatus,
  Bootstrap,
  Category,
  CategoryType,
  CreateTransactionPayload,
  Loan,
  LoanPaymentType,
  MonthlyReport,
  Overview,
  PaymentMethod,
  Subcategory,
  TaxonomyBehavior,
  Transaction,
  TransactionKind,
  UserProfile
} from "./types";

type Page = "overview" | "weekly" | "transactions" | "reports" | "accounts" | "loans" | "categories" | "profile";
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
  { page: "accounts", label: "Accounts", icon: WalletCards },
  { page: "loans", label: "Loans", icon: Landmark },
  { page: "categories", label: "Categories", icon: Tags },
  { page: "profile", label: "Profile", icon: UserCircle }
];

const mobileLabels: Record<Page, string> = {
  overview: "Home",
  weekly: "Week",
  transactions: "Txns",
  reports: "Rpt",
  accounts: "Accts",
  loans: "Loan",
  categories: "Cats",
  profile: "Me"
};

const pagePaths: Record<Page, string> = {
  overview: "/overview",
  weekly: "/weekly",
  transactions: "/transactions",
  reports: "/reports",
  accounts: "/accounts",
  loans: "/loans",
  categories: "/categories",
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

  const accounts = bootstrap?.accounts ?? [];
  const loans = bootstrap?.loans ?? [];
  const categoryTypes = bootstrap?.categoryTypes ?? [];
  const categories = flattenSubcategories(categoryTypes);
  const profile = bootstrap?.profile ?? emptyProfile;
  const activeAccounts = accounts.filter((account) => !account.isArchived);
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId);
  const showAccountFilter =
    activePage !== "accounts" &&
    activePage !== "loans" &&
    activePage !== "categories" &&
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
            <span>Local-first INR</span>
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
              refreshKey={refreshKey}
              onNavigate={navigate}
            />
          )}
          {activePage === "weekly" && (
            <WeeklyEntryPage
              selectedAccountId={selectedAccountId}
              accounts={activeAccounts}
              loans={loans.filter((loan) => !loan.isArchived)}
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
              categoryTypes={categoryTypes}
              refresh={refresh}
              refreshKey={refreshKey}
              showNotice={showNotice}
              requestConfirm={requestConfirm}
            />
          )}
          {activePage === "reports" && <ReportsPage selectedAccountId={selectedAccountId} refreshKey={refreshKey} />}
          {activePage === "accounts" && (
            <AccountsPage
              accounts={accounts}
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
          {activePage === "categories" && (
            <CategoriesPage
              categoryTypes={categoryTypes}
              refresh={refresh}
              showNotice={showNotice}
              requestConfirm={requestConfirm}
            />
          )}
          {activePage === "profile" && (
            <ProfilePage
              profile={profileDraft}
              settings={bootstrap.settings}
              backupStatus={backupStatus}
              theme={theme}
              saving={profileSaving}
              onProfileChange={setProfileDraft}
              onSaveProfile={saveProfile}
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
  refreshKey,
  onNavigate
}: {
  selectedAccountId: string;
  selectedAccount?: Account;
  refreshKey: number;
  onNavigate: (page: Page) => void;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

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

  if (loading) {
    return <PanelLoader label="Loading overview" />;
  }

  if (loadError || !overview) {
    return <EmptyState text={loadError || "Could not load the overview."} />;
  }

  const monthlyNetPaise = overview.summary.incomePaise - overview.summary.totalSpendingPaise;

  return (
    <div className="page-grid">
      <OverviewDisclosure title="Financial highlights" defaultExpanded>
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
          label="This month spending"
          value={formatINR(overview.summary.totalSpendingPaise)}
          icon={<BarChart3 />}
        />
        <SummaryCard
          label="All-time uncategorized"
          value={`${overview.summary.uncategorizedCount} items`}
          icon={<CircleAlert />}
          tone={overview.summary.uncategorizedCount > 0 ? "warning" : "good"}
        />
        <SummaryCard
          label="Monthly net cash flow"
          value={signedImpact(monthlyNetPaise)}
          icon={<ArrowDownUp />}
          tone={monthlyNetPaise >= 0 ? "good" : "warning"}
        />
      </section>
      </OverviewDisclosure>

      <section className="two-column">
        <CollapsiblePanel title={`Recent activity · ${overview.recentTransactions.length}`} action={<button onClick={() => onNavigate("transactions")}>View all</button>}>
          <TransactionTable transactions={overview.recentTransactions} empty="No transactions yet." compact />
        </CollapsiblePanel>

        <CollapsiblePanel title={`Account snapshot · ${overview.accounts.length}`} action={<button onClick={() => onNavigate("accounts")}>Manage</button>}>
          <div className="account-stack">
            {overview.accounts.map((account) => (
              <OverviewAccountLine key={account.id} account={account} />
            ))}
          </div>
        </CollapsiblePanel>
      </section>

      <section className="overview-report-section">
        <CollapsiblePanel
          title={`Category report · ${formatMonth(overview.month)}`}
          action={<button onClick={() => onNavigate("reports")}>Open reports</button>}
        >
          <CategoryBars categories={overview.categoryReport} />
        </CollapsiblePanel>
      </section>
    </div>
  );
}

function WeeklyEntryPage({
  selectedAccountId,
  accounts,
  loans,
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
    loanPaymentType: "emi" as LoanPaymentType
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
        loanPaymentType: behavior === "loan" && form.loanId ? form.loanPaymentType : undefined
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
        loanPaymentType: "emi"
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
                    onChange={(event) => setForm({ ...form, subcategoryId: event.target.value, loanId: "" })}
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
          <div className="impact-stack">
            {accounts.slice(0, 4).map((account) => (
              <AccountImpactCard key={account.id} account={account} transactions={transactions} />
            ))}
          </div>
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
};

function TransactionsPage({
  selectedAccountId,
  accounts,
  loans,
  categoryTypes,
  refresh,
  refreshKey,
  showNotice,
  requestConfirm
}: {
  selectedAccountId: string;
  accounts: Account[];
  loans: Loan[];
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
  }, [search, selectedAccountId, showNotice, subcategoryId, typeId]);

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
        loanPaymentType: behavior === "loan" && editDraft.loanId ? editDraft.loanPaymentType : undefined
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
          <button onClick={() => loadPage()}>Apply</button>
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
                loanPaymentType: "emi"
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
              onChange={(event) => onChange({ ...draft, subcategoryId: event.target.value, loanId: "" })}
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
  refreshKey
}: {
  selectedAccountId: string;
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
            <div className="summary-grid report-summary">
              <SummaryCard label="Tracked outflow" value={formatINR(report.totalSpendingPaise)} icon={<BarChart3 />} />
              <SummaryCard label="Loan" value={formatINR(report.loanPaise ?? report.emiPaise)} icon={<CreditCard />} tone="warning" />
              <SummaryCard label="Investment" value={formatINR(report.investmentPaise)} icon={<ArrowDownUp />} />
              <SummaryCard label="Income" value={formatINR(report.incomePaise)} icon={<WalletCards />} />
              <SummaryCard
                label="Net"
                value={formatINR(report.incomePaise - report.totalSpendingPaise)}
                icon={<ArrowDownUp />}
              />
            </div>
            <ReportTypeAnalytics
              types={report.types}
              selectedTypeId={selectedType?.typeId ?? ""}
              onSelect={setSelectedTypeId}
            />
            <IncomeAllocationAnalytics report={report} />
            <CategoryBars categories={report.categories} />
            <a className="secondary-action export-link" href="/api/export/transactions.csv">
              <Download size={18} />
              Export CSV
            </a>
          </>
        )}
      </Panel>
    </div>
  );
}

function AccountsPage({
  accounts,
  refresh,
  showNotice,
  requestConfirm
}: {
  accounts: Account[];
  refresh: () => Promise<void>;
  showNotice: (message: string) => void;
  requestConfirm: (request: ConfirmRequest) => void;
}) {
  const activeAccounts = accounts.filter((account) => !account.isArchived);
  const archivedAccounts = accounts.filter((account) => account.isArchived);

  async function remove(account: Account) {
    requestConfirm({
      message: "Are you sure you want to delete this?",
      detail: `${account.name} will be removed from active use. Existing history is preserved when the account has transactions.`,
      confirmLabel: "Remove",
      tone: "danger",
      onConfirm: async () => {
        try {
          const result = await Api.deleteAccount(account.id);
          await refresh();
          showNotice(result.mode === "archived" ? "Account removed from active use." : "Account deleted.");
        } catch (err) {
          showNotice(err instanceof Error ? err.message : "Could not remove account.");
        }
      }
    });
  }

  async function restore(account: Account) {
    try {
      await Api.updateAccount(account.id, { isArchived: false });
      await refresh();
      showNotice("Account restored.");
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Could not restore account.");
    }
  }

  return (
    <div className="two-column">
      <Panel title="Accounts & cards">
        <div className="account-stack">
          {activeAccounts.map((account) => (
            <AccountManagerLine key={account.id} account={account} onRemove={remove} />
          ))}
        </div>
        {archivedAccounts.length > 0 && (
          <>
            <h3 className="section-subtitle">Removed</h3>
            <div className="account-stack">
              {archivedAccounts.map((account) => (
                <AccountManagerLine key={account.id} account={account} onRestore={restore} />
              ))}
            </div>
          </>
        )}
        <p className="helper-text">
          Removing an account with history archives it. Balances are still derived from the starting value plus transactions.
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
      </>}
    </article>
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
            <span className="category-icon" style={{ color: category.color, background: `${category.color}18` }}>
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
          />
        </div>
      </div>
    </div>
  );
}

function IncomeAllocationAnalytics({ report }: { report: MonthlyReport }) {
  const incomePaise = report.incomePaise;
  const outflows = report.types
    .filter((type) => type.behavior !== "income" && type.behavior !== "refund" && type.amountPaise > 0)
    .map((type) => ({
      id: type.typeId,
      name: type.name,
      color: type.color,
      amountPaise: type.amountPaise,
      labelShare: incomePaise > 0 ? (type.amountPaise / incomePaise) * 100 : 0
    }));
  const outflowTotal = outflows.reduce((sum, item) => sum + item.amountPaise, 0);
  const unallocated = Math.max(incomePaise - outflowTotal, 0);
  const visualTotal = Math.max(incomePaise, outflowTotal);
  const segments: DonutSegment[] =
    incomePaise > 0
      ? [
          ...outflows,
          ...(unallocated > 0
            ? [
                {
                  id: "unallocated-income",
                  name: "Unallocated",
                  color: "#64748b",
                  amountPaise: unallocated,
                  labelShare: (unallocated / incomePaise) * 100
                }
              ]
            : [])
        ]
      : [];

  return (
    <div className="income-allocation">
      <div className="income-allocation-header">
        <div>
          <p className="eyebrow">Income allocation</p>
          <h3>Where the income went</h3>
        </div>
        <strong>{formatINR(incomePaise)}</strong>
      </div>
      {incomePaise <= 0 ? (
        <EmptyState text="No income recorded for this period." />
      ) : (
        <div className="pie-panel">
          <div className="pie-chart">
            <DonutChart
              segments={consolidateDonutSegments(segments)}
              totalPaise={visualTotal}
              ariaLabel="Income allocation percentage chart"
              centerLabel="Income"
              centerValue={formatINR(incomePaise)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function DonutChart({
  segments,
  totalPaise,
  ariaLabel,
  centerLabel,
  centerValue
}: {
  segments: DonutSegment[];
  totalPaise: number;
  ariaLabel: string;
  centerLabel: string;
  centerValue: string;
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
      <svg className="donut-chart" viewBox={`0 0 ${width} ${height}`} aria-label="No chart data">
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
    const gap = Math.max(25, Math.min(38, 260 / Math.max(sideSlices.length - 1, 1)));
    sideSlices.forEach((slice, index) => {
      slice.labelY = Math.max(slice.labelY, 45 + index * gap);
    });
    for (let index = sideSlices.length - 1; index >= 0; index -= 1) {
      const maxY = 315 - (sideSlices.length - 1 - index) * gap;
      sideSlices[index].labelY = Math.min(sideSlices[index].labelY, maxY);
    }
  }

  return (
    <svg className="donut-chart" viewBox={`0 0 ${width} ${height}`} aria-label={ariaLabel}>
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
      style={{ color: category.color, background: `${category.color}16` }}
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
  const colorStyle = color
    ? {
        color,
        background: `${color}14`,
        borderColor: `${color}30`
      }
    : undefined;

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

function OverviewAccountLine({ account }: { account: Account }) {
  const isCard = account.type === "credit_card";
  const limit = account.creditLimitPaise ?? 0;
  const usage = isCard && limit > 0 ? Math.min(Math.max(Math.round((account.outstandingPaise / limit) * 100), 0), 100) : 0;
  const highUsage = isCard && usage > 30;

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

function AccountLine({ account, expanded = false }: { account: Account; expanded?: boolean }) {
  const isCard = account.type === "credit_card";
  return (
    <div className={`account-line ${isCard && expanded ? "card-rich" : ""}`}>
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
          expanded ? (
            <CardLimitSummary account={account} />
          ) : (
            <>
              <strong>{formatINR(account.outstandingPaise)}</strong>
              <span>Outstanding</span>
            </>
          )
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

function CardLimitSummary({ account }: { account: Account }) {
  const limit = account.creditLimitPaise ?? 0;
  const outstanding = account.outstandingPaise;
  const available = account.availableLimitPaise ?? Math.max(limit - outstanding, 0);
  const usage = creditUtilization(account);
  const highUsage = usage > 30;

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
  onProfileChange,
  onSaveProfile,
  onThemeToggle
}: {
  profile: UserProfile;
  settings: Record<string, string>;
  backupStatus: BackupStatus | null;
  theme: Theme;
  saving: boolean;
  onProfileChange: (profile: UserProfile) => void;
  onSaveProfile: () => void;
  onThemeToggle: () => void;
}) {
  const displayName = profile.name || "Your profile";
  const displayEmail = profile.email || "Local profile";

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
          <button className="profile-save-button" onClick={onSaveProfile} disabled={saving}>
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
  onRemove,
  onRestore
}: {
  account: Account;
  onRemove?: (account: Account) => void;
  onRestore?: (account: Account) => void;
}) {
  return (
    <div className={`account-manage-line ${account.isArchived ? "archived" : ""}`}>
      <AccountLine account={account} expanded />
      <div className="account-actions">
        {account.isArchived ? (
          <button className="secondary-action" onClick={() => onRestore?.(account)}>
            <RotateCcw size={16} />
            Restore
          </button>
        ) : (
          <button className="secondary-action danger-action" onClick={() => onRemove?.(account)}>
            <Archive size={16} />
            Remove
          </button>
        )}
      </div>
    </div>
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
  children
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const contentId = `panel-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <section className={`panel collapsible-panel ${expanded ? "expanded" : ""}`}>
      <div className="panel-header">
        <h2>{title}</h2>
        <div className="panel-header-actions">
          {action && <div className="panel-action">{action}</div>}
          <button
            type="button"
            className={`icon-button disclosure-toggle ${expanded ? "expanded" : ""}`}
            aria-label={expanded ? `Collapse ${title}` : `Expand ${title}`}
            aria-expanded={expanded}
            aria-controls={contentId}
            onClick={() => setExpanded((value) => !value)}
          >
            <ChevronDown size={18} />
          </button>
        </div>
      </div>
      {expanded && <div id={contentId} className="collapsible-content">{children}</div>}
    </section>
  );
}

function OverviewDisclosure({
  title,
  defaultExpanded = false,
  children
}: {
  title: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <section className="overview-disclosure">
      <div className="overview-disclosure-header">
        <h2>{title}</h2>
        <button
          type="button"
          className={`icon-button disclosure-toggle ${expanded ? "expanded" : ""}`}
          aria-label={expanded ? `Collapse ${title}` : `Expand ${title}`}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronDown size={18} />
        </button>
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
    loanPaymentType: transaction.loanPaymentType ?? "emi"
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
