import type {
  Account,
  AutopaySubscription,
  BackupStatus,
  Batch,
  Bootstrap,
  BudgetLine,
  BudgetPlan,
  CategoryType,
  CreateTransactionPayload,
  Loan,
  MonthlyReport,
  Subcategory,
  Overview,
  Transaction,
  TrendReport,
  UserProfile
} from "./types";

type ApiOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers =
    options.body === undefined
      ? options.headers
      : {
          "content-type": "application/json",
          ...(options.headers ?? {})
        };

  const response = await fetch(path, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? "Request failed.");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const Api = {
  bootstrap: () => api<Bootstrap>("/api/bootstrap"),
  profile: () => api<UserProfile>("/api/profile"),
  updateProfile: (body: Partial<UserProfile>) =>
    api<UserProfile>("/api/profile", { method: "PATCH", body }),
  updateSettings: (body: { cardUtilizationAlertPercent: number }) =>
    api<Record<string, string>>("/api/settings", { method: "PATCH", body }),
  overview: (accountId?: string, month?: string) => {
    const params = new URLSearchParams();
    if (accountId) params.set("accountId", accountId);
    if (month) params.set("month", month);
    return api<Overview>(`/api/overview?${params}`);
  },
  accounts: () => api<Account[]>("/api/accounts"),
  createAccount: (body: {
    name: string;
    type: "bank" | "credit_card" | "food_card";
    startingBalancePaise: number;
    creditLimitPaise?: number;
  }) => api<Account>("/api/accounts", { method: "POST", body }),
  updateAccount: (id: string, body: { name?: string; creditLimitPaise?: number; isArchived?: boolean }) =>
    api<Account>(`/api/accounts/${id}`, { method: "PATCH", body }),
  deleteAccount: (id: string) =>
    api<{ ok: true; mode: "deleted" | "archived" }>(`/api/accounts/${id}`, { method: "DELETE" }),
  categoryTypes: () => api<CategoryType[]>("/api/category-types"),
  createCategoryType: (body: { name: string; behavior: string; icon: string; color: string }) =>
    api<CategoryType>("/api/category-types", { method: "POST", body }),
  deleteCategoryType: (id: string) => api<{ ok: true }>(`/api/category-types/${id}`, { method: "DELETE" }),
  createSubcategory: (body: { typeId: string; name: string; icon: string; color: string }) =>
    api<Subcategory>("/api/subcategories", { method: "POST", body }),
  deleteSubcategory: (id: string) => api<{ ok: true }>(`/api/subcategories/${id}`, { method: "DELETE" }),
  loans: (includeArchived = true) =>
    api<Loan[]>(`/api/loans?${new URLSearchParams({ includeArchived: String(includeArchived) })}`),
  createLoan: (body: {
    name: string;
    subcategoryId: string;
    principalAmountPaise: number;
    startingOutstandingPaise: number;
    startMonth: string;
    annualInterestRateBps: number;
    tenureMonths: number;
    monthlyEmiPaise: number;
  }) => api<Loan>("/api/loans", { method: "POST", body }),
  updateLoan: (id: string, body: Partial<{
    name: string;
    subcategoryId: string;
    principalAmountPaise: number;
    startingOutstandingPaise: number;
    startMonth: string;
    annualInterestRateBps: number;
    tenureMonths: number;
    monthlyEmiPaise: number;
    isArchived: boolean;
  }>) => api<Loan>(`/api/loans/${id}`, { method: "PATCH", body }),
  archiveLoan: (id: string) =>
    api<{ ok: true; mode: "archived" }>(`/api/loans/${id}`, { method: "DELETE" }),
  subscriptions: (includeArchived = true) =>
    api<AutopaySubscription[]>(
      `/api/subscriptions?${new URLSearchParams({ includeArchived: String(includeArchived) })}`
    ),
  createSubscription: (body: {
    name: string;
    amountPaise: number;
    startDate: string;
    durationMonths: number;
  }) => api<AutopaySubscription>("/api/subscriptions", { method: "POST", body }),
  updateSubscription: (
    id: string,
    body: Partial<{
      name: string;
      amountPaise: number;
      startDate: string;
      durationMonths: number;
      isArchived: boolean;
    }>
  ) => api<AutopaySubscription>(`/api/subscriptions/${id}`, { method: "PATCH", body }),
  archiveSubscription: (id: string) =>
    api<{ ok: true; mode: "archived" }>(`/api/subscriptions/${id}`, { method: "DELETE" }),
  currentBatch: (weekStart: string, weekEnd: string) => {
    const params = new URLSearchParams({ weekStart, weekEnd });
    return api<Batch>(`/api/batches/current?${params}`);
  },
  saveBatch: (id: string) => api<Batch>(`/api/batches/${id}/save`, { method: "POST" }),
  transactions: (query: Record<string, string | number | undefined> = {}) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== "") params.set(key, String(value));
    });
    return api<Transaction[]>(`/api/transactions?${params}`);
  },
  createTransaction: (body: CreateTransactionPayload) =>
    api<{ transaction: Transaction; duplicateCandidates: Transaction[] }>("/api/transactions", {
      method: "POST",
      body
    }),
  updateTransaction: (id: string, body: Partial<CreateTransactionPayload>) =>
    api<{ transaction: Transaction; duplicateCandidates: Transaction[] }>(`/api/transactions/${id}`, {
      method: "PATCH",
      body
    }),
  deleteTransaction: (id: string) =>
    api<{ ok: true }>(`/api/transactions/${id}`, { method: "DELETE" }),
  monthlyReport: (accountId?: string, month?: string, from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (accountId) params.set("accountId", accountId);
    if (month) params.set("month", month);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return api<MonthlyReport>(`/api/reports/monthly?${params}`);
  },
  trendReport: (typeId: string, mode: "month" | "year", accountId?: string) => {
    const params = new URLSearchParams({ typeId, mode });
    if (accountId) params.set("accountId", accountId);
    return api<TrendReport>(`/api/reports/trends?${params}`);
  },
  budgetPlan: (month?: string) => {
    const params = new URLSearchParams();
    if (month) params.set("month", month);
    return api<BudgetPlan>(`/api/budgets?${params}`);
  },
  createBudgetLine: (body: { month: string; scopeType: "type" | "subcategory"; scopeId: string; amountPaise: number }) =>
    api<BudgetLine>("/api/budgets", { method: "POST", body }),
  updateBudgetLine: (id: string, body: { amountPaise: number }) =>
    api<BudgetLine>(`/api/budgets/${id}`, { method: "PATCH", body }),
  deleteBudgetLine: (id: string) => api<{ ok: true }>(`/api/budgets/${id}`, { method: "DELETE" }),
  backupStatus: () => api<BackupStatus>("/api/backup/status"),
  backup: () => api<{ path: string; mode: "manual" | "auto" | "shutdown"; createdAt: string }>("/api/backup", { method: "POST" }),
  importTemplateUrl: () => "/api/import/template.xlsx",
  importTransactions: async (file: File, batchId?: string) => {
    const params = new URLSearchParams();
    if (batchId) params.set("batchId", batchId);
    const form = new FormData();
    form.set("file", file);
    const response = await fetch(`/api/import/transactions?${params}`, {
      method: "POST",
      body: form
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error ?? "Import failed.");
    }
    return response.json() as Promise<{
      insertedCount: number;
      errors: Array<{ row: number; message: string }>;
      createdAccounts?: string[];
      createdTypes?: string[];
      createdSubcategories?: string[];
      affectedAccounts?: Array<{ id: string; name: string }>;
      skippedDuplicateCount?: number;
      warnings?: string[];
    }>;
  }
};
