import { z } from "zod";

export const CURRENCY = "INR";
export const CURRENCY_SYMBOL = "₹";
export const WEEK_START = "monday";
export const AUTOPAY_SUBCATEGORY_ID = "sub_autopay";
export const MUTUAL_FUNDS_SUBCATEGORY_ID = "sub_invest_mutual_funds";
export const AUTOPAY_DURATION_MONTH_OPTIONS = [1, 3, 6, 12, 24, 36] as const;

export const INVESTMENT_TYPES = [
  { id: "stocks", label: "Stocks", icon: "trending-up", color: "#4f46e5" },
  { id: "mutual_funds", label: "Mutual Funds", icon: "trending-up", color: "#0284c7" },
  { id: "gold", label: "Gold", icon: "landmark", color: "#d97706" },
  { id: "land", label: "Land", icon: "home", color: "#0f766e" },
  { id: "property", label: "Property", icon: "home", color: "#7c3aed" },
  { id: "pf", label: "PF", icon: "landmark", color: "#059669" },
  { id: "other", label: "Other", icon: "wallet", color: "#64748b" }
] as const;

export const INVESTMENT_TYPE_IDS = INVESTMENT_TYPES.map((type) => type.id) as [string, ...string[]];

export const ICON_OPTIONS = [
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
] as const;

export const COLOR_OPTIONS = [
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
] as const;

export const TAXONOMY_BEHAVIORS = [
  "expense",
  "income",
  "loan",
  "investment",
  "transfer",
  "card_payment",
  "refund"
] as const;

export const DEFAULT_CATEGORY_TYPES = [
  {
    id: "type_expense",
    name: "Expense",
    behavior: "expense",
    icon: "shopping-basket",
    color: "#16a34a",
    subcategories: [
      { id: "sub_groceries", name: "Groceries", icon: "shopping-basket", color: "#16a34a" },
      { id: "sub_dining_food", name: "Dining/Food", icon: "utensils", color: "#f97316" },
      { id: "sub_entertainment", name: "Entertainment", icon: "ticket", color: "#7c3aed" },
      { id: "sub_movies", name: "Movies", icon: "film", color: "#dc2626" },
      { id: "sub_transport", name: "Transport", icon: "car", color: "#2563eb" },
      { id: "sub_shopping", name: "Shopping", icon: "shopping-bag", color: "#db2777" },
      { id: "sub_health", name: "Health", icon: "heart-pulse", color: "#10b981" },
      { id: "sub_travel", name: "Travel", icon: "plane", color: "#0891b2" },
      { id: "sub_autopay", name: "AutoPay", icon: "calendar-clock", color: "#4f46e5" }
    ]
  },
  {
    id: "type_income",
    name: "Income",
    behavior: "income",
    icon: "arrow-down-circle",
    color: "#059669",
    subcategories: [
      { id: "sub_salary", name: "Salary", icon: "briefcase", color: "#059669" },
      { id: "sub_income_loan", name: "Loan", icon: "landmark", color: "#2563eb" },
      { id: "sub_income_mutual_funds", name: "Mutual Funds", icon: "trending-up", color: "#0284c7" },
      { id: "sub_income_stocks", name: "Stocks", icon: "trending-up", color: "#4f46e5" },
      { id: "sub_other_income", name: "Other income", icon: "wallet", color: "#0f766e" }
    ]
  },
  {
    id: "type_loan",
    name: "Loan",
    behavior: "loan",
    icon: "calendar-clock",
    color: "#be123c",
    subcategories: [
      { id: "sub_personal_loan", name: "Personal", icon: "wallet", color: "#be123c" },
      { id: "sub_home_loan", name: "Home", icon: "home", color: "#d97706" },
      { id: "sub_vehicle_loan", name: "Vehicle", icon: "car", color: "#2563eb" },
      { id: "sub_gold_loan", name: "Gold", icon: "landmark", color: "#d97706" },
      { id: "sub_other_loan", name: "Other", icon: "calendar-clock", color: "#64748b" }
    ]
  },
  {
    id: "type_investment",
    name: "Investment",
    behavior: "investment",
    icon: "trending-up",
    color: "#0284c7",
    subcategories: [
      { id: "sub_invest_mutual_funds", name: "Mutual Funds", icon: "trending-up", color: "#0284c7" },
      { id: "sub_invest_stocks", name: "Stocks", icon: "trending-up", color: "#4f46e5" },
      { id: "sub_invest_gold", name: "Gold", icon: "landmark", color: "#d97706" },
      { id: "sub_invest_land", name: "Land", icon: "home", color: "#0f766e" }
    ]
  },
  {
    id: "type_transfer",
    name: "Transfer",
    behavior: "transfer",
    icon: "arrow-left-right",
    color: "#4f46e5",
    subcategories: [
      { id: "sub_transfer_parents", name: "Parents", icon: "home", color: "#4f46e5" },
      { id: "sub_transfer_friend", name: "Friend", icon: "gift", color: "#7c3aed" }
    ]
  },
  {
    id: "type_card_payment",
    name: "Credit Card Payment",
    behavior: "card_payment",
    icon: "credit-card",
    color: "#ea580c",
    subcategories: []
  }
] as const;

export const accountTypeSchema = z.enum(["bank", "credit_card", "food_card"]);
export const paymentMethodSchema = z.enum([
  "upi",
  "credit_card",
  "bank_transfer",
  "cash",
  "other"
]);
export const directionSchema = z.enum(["inflow", "outflow"]);
export const loanPaymentTypeSchema = z.enum(["emi", "prepayment"]);
export const transactionKindSchema = z.enum([
  "expense",
  "income",
  "refund",
  "transfer",
  "card_payment",
  "reversal",
  "investment",
  "emi"
]);
export const taxonomyBehaviorSchema = z.enum(TAXONOMY_BEHAVIORS);
export const budgetScopeTypeSchema = z.enum(["type", "subcategory"]);

const idSchema = z.string().min(1);
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Enter a valid calendar date.");
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Enter a valid month.");
const paiseSchema = z.number().int().min(0);
const positivePaiseSchema = z.number().int().positive();
const optionalTextSchema = z
  .string()
  .trim()
  .max(160)
  .optional()
  .transform((value) => (value === "" ? undefined : value));
const optionalIdSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === "" ? undefined : value))
  .refine((value) => value === undefined || value.length > 0, "Invalid id.");

export const createAccountSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    type: accountTypeSchema,
    startingBalancePaise: paiseSchema,
    creditLimitPaise: paiseSchema.optional()
  })
  .superRefine((value, ctx) => {
    if (value.type === "credit_card" && value.creditLimitPaise === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["creditLimitPaise"],
        message: "Credit limit is required for credit cards."
      });
    }
    if (value.type !== "credit_card" && value.creditLimitPaise !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["creditLimitPaise"],
        message: "Credit limit applies only to credit cards."
      });
    }
  });

export const updateAccountSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    creditLimitPaise: paiseSchema.optional(),
    isArchived: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, "No account changes provided.");

export const createCategoryTypeSchema = z.object({
  name: z.string().trim().min(2).max(50),
  behavior: taxonomyBehaviorSchema,
  icon: z.enum(ICON_OPTIONS),
  color: z.enum(COLOR_OPTIONS)
});

export const createSubcategorySchema = z.object({
  typeId: idSchema,
  name: z.string().trim().min(2).max(50),
  icon: z.enum(ICON_OPTIONS),
  color: z.enum(COLOR_OPTIONS)
});

export const createLoanSchema = z
  .object({
    name: z.string().trim().min(2).max(90),
    subcategoryId: idSchema,
    principalAmountPaise: positivePaiseSchema,
    startingOutstandingPaise: paiseSchema,
    startMonth: monthSchema,
    annualInterestRateBps: z.number().int().min(0).max(100_000),
    tenureMonths: z.number().int().positive().max(600),
    monthlyEmiPaise: positivePaiseSchema
  })
  .superRefine((value, ctx) => {
    if (value.startingOutstandingPaise > value.principalAmountPaise) {
      ctx.addIssue({
        code: "custom",
        path: ["startingOutstandingPaise"],
        message: "Outstanding amount cannot be greater than principal amount."
      });
    }
  });

export const updateLoanSchema = z
  .object({
    name: z.string().trim().min(2).max(90).optional(),
    subcategoryId: idSchema.optional(),
    principalAmountPaise: positivePaiseSchema.optional(),
    startingOutstandingPaise: paiseSchema.optional(),
    startMonth: monthSchema.optional(),
    annualInterestRateBps: z.number().int().min(0).max(100_000).optional(),
    tenureMonths: z.number().int().positive().max(600).optional(),
    monthlyEmiPaise: positivePaiseSchema.optional(),
    isArchived: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, "No loan changes provided.");

export const createAutopaySubscriptionSchema = z.object({
  name: z.string().trim().min(2).max(90),
  amountPaise: positivePaiseSchema,
  startDate: dateSchema,
  durationMonths: z.number().int().positive().max(600)
});

export const updateAutopaySubscriptionSchema = z
  .object({
    name: z.string().trim().min(2).max(90).optional(),
    amountPaise: positivePaiseSchema.optional(),
    startDate: dateSchema.optional(),
    durationMonths: z.number().int().positive().max(600).optional(),
    isArchived: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, "No subscription changes provided.");

export const createBudgetLineSchema = z.object({
  month: monthSchema,
  scopeType: budgetScopeTypeSchema,
  scopeId: idSchema,
  amountPaise: positivePaiseSchema
});

export const updateBudgetLineSchema = z
  .object({
    amountPaise: positivePaiseSchema.optional()
  })
  .refine((value) => Object.keys(value).length > 0, "No budget changes provided.");

export const investmentTypeSchema = z.enum(INVESTMENT_TYPE_IDS);

export const createInvestmentSchema = z.object({
  type: investmentTypeSchema,
  name: z.string().trim().min(1).max(90),
  investedPaise: paiseSchema,
  currentValuePaise: paiseSchema,
  shares: z.number().nonnegative().optional(),
  purchaseDate: dateSchema.optional(),
  note: optionalTextSchema
});

export const updateInvestmentSchema = z
  .object({
    type: investmentTypeSchema.optional(),
    name: z.string().trim().min(1).max(90).optional(),
    investedPaise: paiseSchema.optional(),
    currentValuePaise: paiseSchema.optional(),
    shares: z.number().nonnegative().optional(),
    purchaseDate: dateSchema.optional(),
    note: optionalTextSchema
  })
  .refine((value) => Object.keys(value).length > 0, "No investment changes provided.");

export const updateSettingsSchema = z.object({
  cardUtilizationAlertPercent: z.number().int().min(1).max(100)
});

export const updateProfileSchema = z.object({
  name: z.string().trim().max(80).optional(),
  email: z
    .string()
    .trim()
    .max(120)
    .refine((value) => value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
      message: "Enter a valid email address or leave it blank."
    })
    .optional(),
  age: z
    .string()
    .trim()
    .max(3)
    .refine((value) => value === "" || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 120), {
      message: "Age must be between 1 and 120, or blank."
    })
    .optional()
});

export const transactionSplitSchema = z.object({
  categoryId: idSchema.optional(),
  subcategoryId: idSchema.optional(),
  amountPaise: positivePaiseSchema
}).refine((value) => value.categoryId || value.subcategoryId, {
  message: "Split must choose a SubType.",
  path: ["subcategoryId"]
});

const transactionObjectSchema = z.object({
    batchId: idSchema.optional(),
    date: dateSchema,
    accountId: idSchema,
    method: paymentMethodSchema,
    merchant: optionalTextSchema,
    note: optionalTextSchema,
    categoryId: idSchema.optional(),
    typeId: idSchema.optional(),
    subcategoryId: idSchema.optional(),
    amountPaise: positivePaiseSchema,
    direction: directionSchema,
    kind: transactionKindSchema,
    transferAccountId: idSchema.optional(),
    linkedTransactionId: idSchema.optional(),
    loanId: optionalIdSchema.optional(),
    loanPaymentType: loanPaymentTypeSchema.optional(),
    subscriptionId: optionalIdSchema.optional(),
    investmentId: optionalIdSchema.optional(),
    splits: z.array(transactionSplitSchema).optional()
  });

export const createTransactionSchema = transactionObjectSchema.superRefine((value, ctx) => {
    if (value.splits?.length) {
      const splitTotal = value.splits.reduce((sum, split) => sum + split.amountPaise, 0);
      if (splitTotal !== value.amountPaise) {
        ctx.addIssue({
          code: "custom",
          path: ["splits"],
          message: "Split amounts must exactly match the transaction amount."
        });
      }
    }

    if (value.kind === "card_payment" && !value.transferAccountId) {
      ctx.addIssue({
        code: "custom",
        path: ["transferAccountId"],
        message: "Card payments must choose the credit card being paid."
      });
    }

    if (value.loanPaymentType && !value.loanId) {
      ctx.addIssue({
        code: "custom",
        path: ["loanId"],
        message: "Loan payment type requires a linked loan."
      });
    }

    if (value.loanId && value.kind !== "emi") {
      ctx.addIssue({
        code: "custom",
        path: ["loanId"],
        message: "Linked loans require Type = Loan."
      });
    }

    if (value.subscriptionId && value.subcategoryId !== AUTOPAY_SUBCATEGORY_ID) {
      ctx.addIssue({
        code: "custom",
        path: ["subscriptionId"],
        message: "Linked subscriptions require SubType = AutoPay."
      });
    }

    if (value.investmentId && value.subcategoryId !== MUTUAL_FUNDS_SUBCATEGORY_ID) {
      ctx.addIssue({
        code: "custom",
        path: ["investmentId"],
        message: "Linked mutual funds require SubType = Mutual Funds."
      });
    }

    if (
      (value.kind === "expense" || value.kind === "investment" || value.kind === "emi") &&
      value.direction !== "outflow"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["direction"],
        message: "Expenses, investments, and loans must be outflows."
      });
    }

    if ((value.kind === "income" || value.kind === "refund") && value.direction !== "inflow") {
      ctx.addIssue({
        code: "custom",
        path: ["direction"],
        message: "Income and refunds must be inflows."
      });
    }
});

const clearableIdSchema = z.union([idSchema, z.literal("")]).optional().transform((value) => value || undefined);

export const updateTransactionSchema = transactionObjectSchema.partial().extend({
  categoryId: clearableIdSchema,
  typeId: clearableIdSchema,
  subcategoryId: clearableIdSchema,
  transferAccountId: clearableIdSchema,
  linkedTransactionId: clearableIdSchema,
  loanId: clearableIdSchema,
  subscriptionId: clearableIdSchema,
  investmentId: clearableIdSchema
}).refine(
  (value) => Object.keys(value).length > 0,
  "No transaction changes provided."
);

export const createBatchSchema = z.object({
  weekStart: dateSchema,
  weekEnd: dateSchema,
  status: z.enum(["draft", "saved"]).default("draft")
});

export type AccountType = z.infer<typeof accountTypeSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type Direction = z.infer<typeof directionSchema>;
export type LoanPaymentType = z.infer<typeof loanPaymentTypeSchema>;
export type TransactionKind = z.infer<typeof transactionKindSchema>;
export type TaxonomyBehavior = z.infer<typeof taxonomyBehaviorSchema>;
export type BudgetScopeType = z.infer<typeof budgetScopeTypeSchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type CreateCategoryTypeInput = z.infer<typeof createCategoryTypeSchema>;
export type CreateSubcategoryInput = z.infer<typeof createSubcategorySchema>;
export type CreateLoanInput = z.infer<typeof createLoanSchema>;
export type UpdateLoanInput = z.infer<typeof updateLoanSchema>;
export type CreateAutopaySubscriptionInput = z.infer<typeof createAutopaySubscriptionSchema>;
export type UpdateAutopaySubscriptionInput = z.infer<typeof updateAutopaySubscriptionSchema>;
export type CreateBudgetLineInput = z.infer<typeof createBudgetLineSchema>;
export type UpdateBudgetLineInput = z.infer<typeof updateBudgetLineSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type InvestmentType = z.infer<typeof investmentTypeSchema>;
export type CreateInvestmentInput = z.infer<typeof createInvestmentSchema>;
export type UpdateInvestmentInput = z.infer<typeof updateInvestmentSchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type CreateBatchInput = z.infer<typeof createBatchSchema>;
