import { existsSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import ExcelJS from "exceljs";
import { cashflowPartsFromTypes } from "../src/report-cashflow.ts";
import { SELF_TRANSFER_SUBCATEGORY_ID } from "../shared/finance.ts";
import type { ReportType } from "../src/types.ts";

const testDbPath = path.join(tmpdir(), `finance-tracker-qa-${Date.now()}.db`);
const testBackupDir = path.join(tmpdir(), `finance-tracker-backups-${Date.now()}`);
process.env.FINANCE_DB_PATH = testDbPath;
process.env.FINANCE_BACKUP_DIR = testBackupDir;

const dbModule = await import("../server/db.ts");
const services = await import("../server/services.ts");
const security = await import("../server/security.ts");

dbModule.initDatabase();

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const tests: TestCase[] = [];

function test(name: string, run: TestCase["run"]) {
  tests.push({ name, run });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertRejects(name: string, action: () => unknown | Promise<unknown>) {
  try {
    await action();
  } catch {
    return;
  }
  throw new Error(`${name} should have rejected.`);
}

async function assertRejectsWithMessage(
  name: string,
  action: () => unknown | Promise<unknown>,
  expectedMessage: string
) {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes(expectedMessage), `${name} should explain: ${expectedMessage}`);
    return;
  }
  throw new Error(`${name} should have rejected.`);
}

function typeId(name: string) {
  const item = services.listCategoryTypes().find((type) => type.name === name);
  assert(item, `Type should exist: ${name}`);
  return item.id;
}

function subcategoryId(typeName: string, subcategoryName: string) {
  const type = services.listCategoryTypes().find((item) => item.name === typeName);
  const subcategory = type?.subcategories.find((item) => item.name === subcategoryName);
  assert(subcategory, `SubType should exist: ${typeName} -> ${subcategoryName}`);
  return subcategory.id;
}

const state: {
  bankId?: string;
  cardId?: string;
  foodCardId?: string;
  movieTransactionId?: string;
  duplicateCandidateCount?: number;
} = {};

test("allows only same-origin browser requests", () => {
  assert(security.isTrustedRequestOrigin(undefined, "192.168.1.4:4000"), "Scripts without Origin should remain available.");
  assert(
    security.isTrustedRequestOrigin("http://192.168.1.4:4000", "192.168.1.4:4000"),
    "The application origin should be trusted."
  );
  assert(
    security.isTrustedRequestOrigin("https://finance-device.example", "finance-device.example"),
    "The same HTTPS host should be trusted."
  );
  assert(
    !security.isTrustedRequestOrigin("https://malicious.example", "192.168.1.4:4000"),
    "A different browser origin must be rejected."
  );
  assert(
    !security.isTrustedRequestOrigin("http://192.168.1.4:5000", "192.168.1.4:4000"),
    "A different port must be rejected."
  );
  assert(!security.isTrustedRequestOrigin("not-a-url", "192.168.1.4:4000"), "Malformed origins must be rejected.");
});

test("seeds INR, Monday week start, and Type/SubType taxonomy", () => {
  const settings = services.getSettings();
  const taxonomy = services.listCategoryTypes();
  const names = taxonomy.map((type) => type.name);

  assert(settings.currency === "INR", "Currency should be INR.");
  assert(settings.week_start === "monday", "Week start should be Monday.");
  assert(names.includes("Expense"), "Expense Type should be seeded.");
  assert(names.includes("Loan"), "Loan Type should be seeded.");
  assert(names.includes("Credit Card Payment"), "Credit Card Payment Type should be seeded.");
  assert(
    taxonomy.find((type) => type.name === "Income")?.subcategories.some((subcategory) => subcategory.name === "Loan"),
    "Income should include the Loan SubType."
  );
  assert(!names.includes("Bills"), "Bills should not be preserved as a visible Type.");
  assert(!names.includes("Refund"), "Refund should not be preserved as a visible seed Type.");
  assert(!names.includes("Uncategorized"), "Uncategorized should remain a state, not a visible Type.");
});

test("builds a first-time-user Excel template with typed sample values and guidance", async () => {
  const template = await services.buildImportTemplate();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template as unknown as ArrayBuffer);
  const transactionSheet = workbook.getWorksheet("Transactions");
  const instructions = workbook.getWorksheet("Instructions");
  const lookups = workbook.getWorksheet("Lookups");

  assert(transactionSheet, "Template should include a Transactions sheet.");
  assert(instructions, "Template should include onboarding instructions.");
  assert(lookups?.state === "hidden", "Lookup lists should be discoverable if a user unhides sheets.");
  assert(transactionSheet.getCell("B2").value === "My Bank Account", "New user sample should include a typed account.");
  const instructionText = [2, 3, 4, 5, 6, 7]
    .map((rowNumber) => String(instructions.getCell(`B${rowNumber}`).value ?? ""))
    .join(" ");
  assert(
    instructionText.includes("type a new Account"),
    "Instructions should explain that new Accounts can be typed."
  );

  const accountValidation = transactionSheet.getCell("B2").dataValidation;
  const typeValidation = transactionSheet.getCell("D2").dataValidation;
  const subtypeValidation = transactionSheet.getCell("F2").dataValidation;
  const typeCount = services.listCategoryTypes().length;

  assert(accountValidation?.prompt?.includes("type a new account"), "Account dropdown should explain typed new accounts.");
  assert(
    typeValidation?.formulae?.[0] === `Lookups!$B$2:$B$${typeCount + 1}`,
    "Type dropdown should use a clean Type list."
  );
  assert(subtypeValidation?.prompt?.includes("type a new SubType"), "SubType dropdown should explain typed new SubTypes.");
  assert(
    Array.from({ length: typeCount }, (_, index) => index + 2).every((rowNumber) =>
      String(lookups.getCell(`B${rowNumber}`).value ?? "").trim()
    ),
    "Type lookup list should not include blank options."
  );
});

test("stores local profile fields and validates profile input", async () => {
  const profile = services.updateProfile({
    name: "Ramesh",
    email: "ramesh@example.com",
    age: "32"
  });

  assert(profile.name === "Ramesh", "Profile name should be stored.");
  assert(profile.email === "ramesh@example.com", "Profile email should be stored.");
  assert(profile.age === "32", "Profile age should be stored.");
  assert(services.getSettings().profile_email === "ramesh@example.com", "Profile should persist in settings.");

  await assertRejects("invalid profile email", () => services.updateProfile({ email: "not-an-email" }));
  await assertRejects("invalid profile age", () => services.updateProfile({ age: "150" }));
});

test("blocks deleting locked Credit Card Payment Type", async () => {
  await assertRejects("delete locked type", () => services.deleteCategoryType("type_card_payment"));
});

test("creates and deletes custom Type and SubType", () => {
  const type = services.createCategoryType({
    name: "Education QA",
    behavior: "expense",
    icon: "book-open",
    color: "#64748b"
  });
  const subcategory = services.createSubcategory({
    typeId: type.id,
    name: "Books QA",
    icon: "book-open",
    color: "#64748b"
  });

  assert(subcategory.name === "Books QA", "Custom SubType should be created.");
  services.deleteSubcategory(subcategory.id);
  services.deleteCategoryType(type.id);
  assert(!services.listCategoryTypes().some((item) => item.id === type.id), "Custom Type should delete.");
});

test("creates bank and credit-card accounts with limits", () => {
  const bank = services.createAccount({
    name: "QA HDFC Bank",
    type: "bank",
    startingBalancePaise: 10_000_000
  });
  const card = services.createAccount({
    name: "QA ICICI Card",
    type: "credit_card",
    startingBalancePaise: 0,
    creditLimitPaise: 15_000_000
  });

  state.bankId = bank.id;
  state.cardId = card.id;

  assert(bank.balancePaise === 10_000_000, "Bank starting balance should be tracked.");
  assert(card.creditLimitPaise === 15_000_000, "Credit limit should be tracked.");
  assert(card.availableLimitPaise === 15_000_000, "Available card limit should equal limit before spends.");
});

test("keeps monthly inflow source SubTypes separate in reports", () => {
  assert(state.bankId, "Bank should exist.");
  const createdIds: string[] = [];
  const addIncome = (subcategoryName: string, amountPaise: number) => {
    const created = services.createTransaction({
      date: "2026-06-08",
      accountId: state.bankId!,
      method: "bank_transfer",
      merchant: `QA ${subcategoryName} income`,
      typeId: typeId("Income"),
      subcategoryId: subcategoryId("Income", subcategoryName),
      amountPaise,
      direction: "inflow",
      kind: "income"
    });
    const id = created.transaction?.id;
    assert(id, `${subcategoryName} income transaction should be created.`);
    createdIds.push(id);
  };

  try {
    addIncome("Loan", 300_000);
    addIncome("Mutual Funds", 450_000);
    addIncome("Other income", 300_000);

    const report = services.getMonthlyReport(undefined, "2026-06");
    const incomeType = report.types.find((type) => type.name === "Income");
    assert(incomeType, "Income Type should be present in report breakdown.");
    const incomeSources = new Map(
      incomeType.subcategories.map((subcategory) => [subcategory.name, subcategory.amountPaise])
    );

    assert(report.incomePaise === 1_050_000, "Report income should include every inflow source.");
    assert(incomeType.amountPaise === 1_050_000, "Income Type total should equal all income SubTypes.");
    assert(incomeSources.get("Loan") === 300_000, "Loan income should remain a separate inflow source.");
    assert(incomeSources.get("Mutual Funds") === 450_000, "Mutual Funds income should remain a separate inflow source.");
    assert(incomeSources.get("Other income") === 300_000, "Other income should remain a separate inflow source.");
  } finally {
    for (const id of createdIds) {
      services.deleteTransaction(id);
    }
  }
});

test("builds report cashflow from inflow SubTypes and outflow Types", () => {
  const reportTypes: ReportType[] = [
    {
      typeId: "income",
      name: "Income",
      behavior: "income",
      icon: "wallet",
      color: "#059669",
      amountPaise: 700_000,
      share: 70,
      subcategories: [
        {
          subcategoryId: "salary",
          name: "Salary",
          icon: "wallet",
          color: "#059669",
          amountPaise: 500_000,
          share: 50
        },
        {
          subcategoryId: "mutual-funds",
          name: "Mutual Funds",
          icon: "trending-up",
          color: "#2563eb",
          amountPaise: 200_000,
          share: 20
        }
      ]
    },
    {
      typeId: "expense",
      name: "Expense",
      behavior: "expense",
      icon: "receipt",
      color: "#dc2626",
      amountPaise: 120_000,
      share: 12,
      subcategories: [
        {
          subcategoryId: "groceries",
          name: "Groceries",
          icon: "shopping-cart",
          color: "#dc2626",
          amountPaise: 120_000,
          share: 12
        }
      ]
    },
    {
      typeId: "transfer",
      name: "Transfer",
      behavior: "transfer",
      icon: "arrow-right-left",
      color: "#0f766e",
      amountPaise: 80_000,
      share: 8,
      subcategories: []
    },
    {
      typeId: "card-payment",
      name: "Credit Card Payment",
      behavior: "card_payment",
      icon: "credit-card",
      color: "#7c3aed",
      amountPaise: 100_000,
      share: 10,
      subcategories: [
        {
          subcategoryId: "axis-card",
          name: "Axis Card",
          icon: "credit-card",
          color: "#7c3aed",
          amountPaise: 100_000,
          share: 10
        }
      ]
    }
  ];

  const inflowParts = cashflowPartsFromTypes(reportTypes, "in");
  const outflowParts = cashflowPartsFromTypes(reportTypes, "out");

  assert(
    inflowParts.map((part) => part.name).join(",") === "Salary,Mutual Funds",
    "Inflow should expand Income into its SubTypes."
  );
  assert(
    outflowParts.map((part) => part.name).join(",") === "Expense,Credit Card Payment,Transfer",
    "Outflow should remain grouped by Type, including Credit Card Payment and Transfer."
  );
  assert(
    outflowParts.reduce((sum, part) => sum + part.amountPaise, 0) === 300_000,
    "Outflow total should include every outflow Type."
  );
});

test("rejects credit-card account without credit limit", async () => {
  await assertRejects("credit card without limit", () =>
    services.createAccount({
      name: "QA Broken Card",
      type: "credit_card",
      startingBalancePaise: 0
    })
  );
});

test("creates, saves, and reloads a weekly batch", () => {
  const batch = services.getCurrentBatch("2026-07-06", "2026-07-12");
  assert(batch.status === "draft", "New batch should start as draft.");
  const saved = services.saveBatch(batch.id);
  assert(saved.status === "saved", "Batch should save.");
});

test("creates backup, stores last-backup status, and keeps only the latest three backups", async () => {
  const result = services.createBackup("manual");
  const status = services.getBackupStatus();
  const backupDb = new DatabaseSync(result.path);
  const accountCount = backupDb.prepare("SELECT COUNT(*) AS count FROM accounts").get() as {
    count: number;
  };
  const backupStatus = backupDb
    .prepare("SELECT key, value FROM settings WHERE key IN ('last_backup_at', 'last_backup_path', 'last_backup_mode')")
    .all() as Array<{ key: string; value: string }>;

  assert(result.path.startsWith(testBackupDir), "Backup should be written to configured backup dir.");
  assert(existsSync(result.path), "Backup file should exist.");
  assert(status.lastBackupAt === result.createdAt, "Backup status should track created timestamp.");
  assert(status.lastBackupPath === result.path, "Backup status should track path.");
  assert(status.lastBackupMode === "manual", "Backup status should track mode.");
  assert(accountCount.count === 2, "Backup should include committed account data.");
  assert(
    backupStatus.some((row) => row.key === "last_backup_at" && row.value === result.createdAt),
    "Backup should include its own backup timestamp."
  );

  backupDb.close();

  writeFileSync(path.join(testBackupDir, "finance-before-taxonomy-2000-01-01T00-00-00-000Z.db"), "old");
  writeFileSync(path.join(testBackupDir, "finance-2099-01-01T00-00-00-000Z.db"), "");

  for (let index = 0; index < 3; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    services.createBackup(index % 2 === 0 ? "auto" : "manual");
  }

  const backups = readdirSync(testBackupDir).filter((name) => /^finance.*\.db$/.test(name));
  assert(backups.length === 3, "Only the latest three backups should be kept.");
  assert(
    !backups.some((name) => name.includes("before-taxonomy")),
    "Old migration backups should obey the same retention rule."
  );
  assert(!backups.includes("finance-2099-01-01T00-00-00-000Z.db"), "Zero-byte backups should be removed.");
});

test("creates food-card accounts and tracks them as prepaid balance", () => {
  const foodCard = services.createAccount({
    name: "QA Sodexo Food Card",
    type: "food_card",
    startingBalancePaise: 100_000
  });
  state.foodCardId = foodCard.id;

  assert(foodCard.type === "food_card", "Food Card account type should be stored.");
  assert(foodCard.balancePaise === 100_000, "Food Card should start with prepaid balance.");
  assert(foodCard.creditLimitPaise === null, "Food Card should not have a credit limit.");

  const spend = services.createTransaction({
    date: "2026-07-08",
    accountId: foodCard.id,
    method: "upi",
    merchant: "Office cafeteria",
    typeId: typeId("Expense"),
    subcategoryId: subcategoryId("Expense", "Dining/Food"),
    amountPaise: 25_000,
    direction: "outflow",
    kind: "expense"
  });
  const updated = services.listAccounts().find((account) => account.id === foodCard.id);
  assert(updated?.balancePaise === 75_000, "Food Card spend should reduce prepaid balance.");

  services.deleteTransaction(spend.transaction?.id ?? "");
});

test("records UPI expense, card expense, income, uncategorized, duplicate, split, and linked refund", () => {
  assert(state.bankId && state.cardId, "Accounts should exist.");

  services.createTransaction({
    date: "2026-07-08",
    accountId: state.bankId,
    method: "upi",
    merchant: "DMart",
    typeId: typeId("Expense"),
    subcategoryId: subcategoryId("Expense", "Groceries"),
    amountPaise: 125_000,
    direction: "outflow",
    kind: "expense"
  });

  const movie = services.createTransaction({
    date: "2026-07-08",
    accountId: state.cardId,
    method: "credit_card",
    merchant: "PVR",
    typeId: typeId("Expense"),
    subcategoryId: subcategoryId("Expense", "Movies"),
    amountPaise: 76_000,
    direction: "outflow",
    kind: "expense"
  });
  state.movieTransactionId = movie.transaction?.id;

  services.createTransaction({
    date: "2026-07-08",
    accountId: state.bankId,
    method: "bank_transfer",
    merchant: "ICICI card payment",
    typeId: typeId("Credit Card Payment"),
    amountPaise: 50_000,
    direction: "outflow",
    kind: "card_payment",
    transferAccountId: state.cardId
  });

  services.createTransaction({
    date: "2026-07-08",
    accountId: state.bankId,
    method: "bank_transfer",
    merchant: "One-off income",
    typeId: typeId("Income"),
    subcategoryId: subcategoryId("Income", "Other income"),
    amountPaise: 500_000,
    direction: "inflow",
    kind: "income"
  });

  services.createTransaction({
    date: "2026-07-09",
    accountId: state.bankId,
    method: "upi",
    merchant: "Index fund SIP",
    typeId: typeId("Investment"),
    subcategoryId: subcategoryId("Investment", "Mutual Funds"),
    amountPaise: 200_000,
    direction: "outflow",
    kind: "investment"
  });

  services.createTransaction({
    date: "2026-07-09",
    accountId: state.bankId,
    method: "bank_transfer",
    merchant: "Home loan EMI",
    typeId: typeId("Loan"),
    subcategoryId: subcategoryId("Loan", "Home"),
    amountPaise: 300_000,
    direction: "outflow",
    kind: "emi"
  });

  services.createTransaction({
    date: "2026-07-08",
    accountId: state.bankId,
    method: "upi",
    merchant: "Unknown",
    typeId: typeId("Expense"),
    amountPaise: 49_900,
    direction: "outflow",
    kind: "expense"
  });

  const duplicate = services.createTransaction({
    date: "2026-07-09",
    accountId: state.bankId,
    method: "upi",
    merchant: "Unknown again",
    typeId: typeId("Expense"),
    amountPaise: 49_900,
    direction: "outflow",
    kind: "expense"
  });
  state.duplicateCandidateCount = duplicate.duplicateCandidates.length;

  services.createTransaction({
    date: "2026-07-10",
    accountId: state.bankId,
    method: "upi",
    merchant: "Mixed store",
    typeId: typeId("Expense"),
    subcategoryId: subcategoryId("Expense", "Groceries"),
    amountPaise: 100_000,
    direction: "outflow",
    kind: "expense",
    splits: [
      { subcategoryId: subcategoryId("Expense", "Groceries"), amountPaise: 60_000 },
      { subcategoryId: subcategoryId("Expense", "Dining/Food"), amountPaise: 40_000 }
    ]
  });

  services.createTransaction({
    date: "2026-07-11",
    accountId: state.cardId,
    method: "credit_card",
    merchant: "Refund: PVR",
    amountPaise: 26_000,
    direction: "inflow",
    kind: "refund",
    linkedTransactionId: state.movieTransactionId
  });
});

test("detects duplicate candidates", () => {
  assert((state.duplicateCandidateCount ?? 0) >= 1, "Duplicate candidate should be detected.");
});

test("rejects split amounts that do not match transaction total", async () => {
  assert(state.bankId, "Bank should exist.");
  await assertRejects("mismatched split total", () =>
    services.createTransaction({
      date: "2026-07-12",
      accountId: state.bankId,
      method: "upi",
      merchant: "Bad split",
      typeId: typeId("Expense"),
      subcategoryId: subcategoryId("Expense", "Groceries"),
      amountPaise: 1_000,
      direction: "outflow",
      kind: "expense",
      splits: [{ subcategoryId: subcategoryId("Expense", "Groceries"), amountPaise: 900 }]
    })
  );
});

test("rejects card payment from a credit-card account", async () => {
  assert(state.cardId, "Card should exist.");
  await assertRejects("bad card payment source", () =>
    services.createTransaction({
      date: "2026-07-12",
      accountId: state.cardId,
      method: "credit_card",
      merchant: "Bad card payment",
      typeId: typeId("Credit Card Payment"),
      amountPaise: 1_000,
      direction: "outflow",
      kind: "card_payment",
      transferAccountId: state.cardId
    })
  );
});

test("calculates bank balance, card outstanding, and available limit", () => {
  assert(state.bankId && state.cardId, "Accounts should exist.");
  const accounts = services.listAccounts();
  const bank = accounts.find((account) => account.id === state.bankId);
  const card = accounts.find((account) => account.id === state.cardId);

  assert(bank?.balancePaise === 9_625_200, `Unexpected bank balance: ${bank?.balancePaise}`);
  assert(card?.outstandingPaise === 0, `Unexpected card outstanding: ${card?.outstandingPaise}`);
  assert(card?.availableLimitPaise === 15_000_000, "Available limit should recover after payment/refund.");
});

test("calculates monthly Type/SubType report with splits and linked refund subtraction", () => {
  const report = services.getMonthlyReport(undefined, "2026-07");
  const byName = new Map(report.categories.map((category) => [category.name, category.amountPaise]));
  const typeByName = new Map(report.types.map((type) => [type.name, type.amountPaise]));

  assert(report.totalSpendingPaise === 874_800, `Unexpected total spending: ${report.totalSpendingPaise}`);
  assert(report.incomePaise === 500_000, "Income should be reported separately.");
  assert(report.investmentPaise === 200_000, "Investment should be reported separately.");
  assert(report.loanPaise === 300_000, "Loan should be reported separately.");
  assert(byName.get("Groceries") === 185_000, "Split groceries should be included.");
  assert(byName.get("Dining/Food") === 40_000, "Split dining should be included.");
  assert(byName.get("Movies") === 50_000, "Linked refund should subtract from Movies.");
  assert(byName.get("Mutual Funds") === 200_000, "Investment SubType should be included.");
  assert(byName.get("Home") === 300_000, "Loan SubType should be included.");
  assert(byName.get("Unspecified") === 99_800, "Unspecified spend should remain visible.");
  assert(typeByName.get("Expense") === 374_800, "Expense Type should include refund-adjusted spend.");
  assert(typeByName.get("Loan") === 300_000, "Loan Type should include loan repayment.");
});

test("calculates report for an explicit date range", () => {
  const report = services.getMonthlyReport(undefined, "2026-07", "2026-07-09", "2026-07-10");
  const byName = new Map(report.categories.map((category) => [category.name, category.amountPaise]));

  assert(report.totalSpendingPaise === 649_900, `Unexpected range total: ${report.totalSpendingPaise}`);
  assert(byName.get("Mutual Funds") === 200_000, "Range should include investment.");
  assert(byName.get("Home") === 300_000, "Range should include loan.");
  assert(byName.get("Dining/Food") === 40_000, "Range should include split dining.");
});

test("deletes an entered transaction and recalculates balances", () => {
  assert(state.bankId, "Bank should exist.");
  const created = services.createTransaction({
    date: "2026-07-12",
    accountId: state.bankId,
    method: "upi",
    merchant: "Delete me",
    typeId: typeId("Expense"),
    subcategoryId: subcategoryId("Expense", "Shopping"),
    amountPaise: 12_345,
    direction: "outflow",
    kind: "expense"
  });
  const id = created.transaction?.id;
  assert(id, "Transaction should be created.");

  services.deleteTransaction(id);
  assert(!services.getTransaction(id), "Deleted transaction should not be returned.");
  const bank = services.listAccounts().find((account) => account.id === state.bankId);
  assert(bank?.balancePaise === 9_625_200, "Balance should return after transaction delete.");
});

test("updates an entered transaction through the full edit payload", () => {
  assert(state.bankId, "Bank should exist.");
  const created = services.createTransaction({
    date: "2026-07-12",
    accountId: state.bankId,
    method: "upi",
    merchant: "Editable",
    typeId: typeId("Expense"),
    subcategoryId: subcategoryId("Expense", "Groceries"),
    amountPaise: 10_000,
    direction: "outflow",
    kind: "expense"
  });
  const id = created.transaction?.id;
  assert(id, "Transaction should be created.");

  services.updateTransaction(id, {
    date: "2026-07-13",
    accountId: state.bankId,
    method: "bank_transfer",
    merchant: "Edited merchant",
    note: "Edited note",
    typeId: typeId("Expense"),
    subcategoryId: subcategoryId("Expense", "Dining/Food"),
    amountPaise: 25_000,
    direction: "outflow",
    kind: "expense"
  });

  const edited = services.getTransaction(id);
  assert(edited?.date === "2026-07-13", "Date should update.");
  assert(edited?.method === "bank_transfer", "Method should update.");
  assert(edited?.merchant === "Edited merchant", "Merchant should update.");
  assert(edited?.note === "Edited note", "Note should update.");
  assert(edited?.subcategoryId === subcategoryId("Expense", "Dining/Food"), "SubType should update.");
  assert(edited?.amountPaise === 25_000, "Amount should update.");

  services.deleteTransaction(id);
});

test("preserves split allocations and supports clearing optional transaction fields", async () => {
  assert(state.bankId, "Bank should exist.");
  const created = services.createTransaction({
    date: "2026-07-14",
    accountId: state.bankId,
    method: "upi",
    merchant: "Split merchant",
    note: "Clear this note",
    typeId: typeId("Expense"),
    amountPaise: 30_000,
    direction: "outflow",
    kind: "expense",
    splits: [
      { subcategoryId: subcategoryId("Expense", "Groceries"), amountPaise: 20_000 },
      { subcategoryId: subcategoryId("Expense", "Dining/Food"), amountPaise: 10_000 }
    ]
  });
  const id = created.transaction?.id;
  assert(id, "Split transaction should be created.");

  services.updateTransaction(id, { merchant: "", note: "" });
  const edited = services.getTransaction(id);
  assert(edited?.status === "split", "Editing metadata should preserve split allocations.");
  assert(edited?.merchant === null && edited.note === null, "Empty optional fields should be cleared.");

  await assertRejectsWithMessage(
    "split amount mismatch after edit",
    () => services.updateTransaction(id, { amountPaise: 31_000 }),
    "Split amounts must exactly match the transaction amount."
  );
  services.deleteTransaction(id);
});

test("preserves archived AutoPay links when editing historical transactions", async () => {
  assert(state.bankId, "Bank should exist.");
  const subscription = services.createAutopaySubscription({
    name: "QA Archived AutoPay",
    amountPaise: 49_900,
    startDate: "2026-07-01",
    durationMonths: 12
  });
  const payment = services.createTransaction({
    date: "2026-07-15",
    accountId: state.bankId,
    method: "upi",
    merchant: "Archived AutoPay payment",
    typeId: typeId("Expense"),
    subcategoryId: subcategoryId("Expense", "AutoPay"),
    amountPaise: 49_900,
    direction: "outflow",
    kind: "expense",
    subscriptionId: subscription.id
  });
  const id = payment.transaction?.id;
  assert(id, "Linked AutoPay transaction should be created.");

  services.archiveAutopaySubscription(subscription.id);
  services.updateTransaction(id, { note: "Historical edit after archive" });
  const edited = services.getTransaction(id);

  assert(edited?.subscriptionId === subscription.id, "Editing history should preserve the archived AutoPay link.");
  assert(edited?.subscriptionName === subscription.name, "Historical links should still expose the subscription name.");

  await assertRejectsWithMessage(
    "new archived autopay payment",
    () =>
      services.createTransaction({
        date: "2026-07-16",
        accountId: state.bankId,
        method: "upi",
        merchant: "New archived AutoPay payment",
        typeId: typeId("Expense"),
        subcategoryId: subcategoryId("Expense", "AutoPay"),
        amountPaise: 49_900,
        direction: "outflow",
        kind: "expense",
        subscriptionId: subscription.id
      }),
    "Archived subscriptions cannot receive new payments."
  );

  services.updateTransaction(id, { subscriptionId: "" });
  assert(services.getTransaction(id)?.subscriptionId === null, "Historical AutoPay links should remain clearable.");
  services.deleteTransaction(id);
});

test("tracks loan statement values, linked transactions, unlink, and archive", async () => {
  assert(state.bankId, "Bank should exist.");
  const loan = services.createLoan({
    name: "QA HDFC Personal Loan",
    subcategoryId: subcategoryId("Loan", "Personal"),
    principalAmountPaise: 77_172_700,
    startingOutstandingPaise: 68_068_600,
    startMonth: "2025-11",
    annualInterestRateBps: 1080,
    tenureMonths: 60,
    monthlyEmiPaise: 1_670_200
  });

  const emi = services.createTransaction({
    date: "2026-07-07",
    accountId: state.bankId,
    method: "bank_transfer",
    merchant: "QA linked personal EMI",
    typeId: typeId("Loan"),
    subcategoryId: subcategoryId("Loan", "Personal"),
    amountPaise: 1_670_200,
    direction: "outflow",
    kind: "emi",
    loanId: loan.id,
    loanPaymentType: "emi"
  });
  const emiId = emi.transaction?.id;
  assert(emiId, "Linked EMI transaction should be created.");

  let updatedLoan = services.listLoans(true).find((item) => item.id === loan.id);
  let linkedTransaction = services.getTransaction(emiId);
  assert(updatedLoan?.openingPrincipalPaidPaise === 9_104_100, "Opening principal history should use the entered balance.");
  assert(updatedLoan?.trackedPrincipalPaidPaise === 1_057_583, "Linked EMI should track its principal component.");
  assert(updatedLoan?.trackedInterestPaidPaise === 612_617, "Linked EMI should track interest on opening balance.");
  assert(updatedLoan?.outstandingPaise === 67_011_017, "Linked EMI principal should reduce current outstanding.");
  assert(updatedLoan?.principalPaidPaise === 10_161_683, "Principal paid should combine history and tracked payments.");
  assert(
    updatedLoan?.interestPaidPaise === 6_540_317,
    "Interest paid should combine estimated history and tracked actual interest."
  );
  assert(updatedLoan?.monthsLeft === 50, "Months left should be recalculated from current outstanding.");
  assert(linkedTransaction?.loanName === "QA HDFC Personal Loan", "Transaction should expose linked loan name.");
  await assertRejectsWithMessage(
    "loan subtype in use",
    () => services.deleteSubcategory(subcategoryId("Loan", "Personal")),
    "This SubType is used by a loan."
  );

  const prepayment = services.createTransaction({
    date: "2026-08-02",
    accountId: state.bankId,
    method: "bank_transfer",
    merchant: "QA personal prepayment",
    typeId: typeId("Loan"),
    subcategoryId: subcategoryId("Loan", "Personal"),
    amountPaise: 100_000,
    direction: "outflow",
    kind: "emi",
    loanId: loan.id,
    loanPaymentType: "prepayment"
  });
  const prepaymentId = prepayment.transaction?.id;
  assert(prepaymentId, "Linked prepayment transaction should be created.");

  updatedLoan = services.listLoans(true).find((item) => item.id === loan.id);
  assert(updatedLoan?.outstandingPaise === 66_911_017, "Prepayment should reduce outstanding principal.");
  assert(updatedLoan?.trackedPrincipalPaidPaise === 1_157_583, "Prepayment should be tracked as principal.");

  services.updateTransaction(emiId, {
    amountPaise: 1_700_000
  });
  updatedLoan = services.listLoans(true).find((item) => item.id === loan.id);
  linkedTransaction = services.getTransaction(emiId);
  assert(updatedLoan?.outstandingPaise === 66_881_217, "Editing a linked EMI should recalculate every linked payment.");
  assert(linkedTransaction?.loanName === "QA HDFC Personal Loan", "Edited EMI should remain linked to the loan.");

  services.deleteTransaction(prepaymentId);
  updatedLoan = services.listLoans(true).find((item) => item.id === loan.id);
  assert(updatedLoan?.outstandingPaise === 66_981_217, "Deleting a prepayment should restore its principal reduction.");

  services.updateTransaction(emiId, {
    loanId: ""
  });
  updatedLoan = services.listLoans(true).find((item) => item.id === loan.id);
  linkedTransaction = services.getTransaction(emiId);
  assert(updatedLoan?.outstandingPaise === 68_068_600, "Unlinking the final payment should restore opening outstanding.");
  assert(updatedLoan?.trackedPrincipalPaidPaise === 0, "Unlinking should clear tracked principal.");
  assert(updatedLoan?.trackedInterestPaidPaise === 0, "Unlinking should clear tracked interest.");
  assert(linkedTransaction?.loanId === null, "Transaction should no longer expose a linked loan after unlink.");

  const personalLoan = services.createLoan({
    name: "QA Personal Loan",
    subcategoryId: subcategoryId("Loan", "Personal"),
    principalAmountPaise: 200_000,
    startingOutstandingPaise: 200_000,
    startMonth: "2026-06",
    annualInterestRateBps: 1000,
    tenureMonths: 12,
    monthlyEmiPaise: 20_000
  });
  await assertRejectsWithMessage(
    "loan subtype mismatch",
    () =>
      services.createTransaction({
        date: "2026-08-03",
        accountId: state.bankId,
        method: "bank_transfer",
        merchant: "Bad linked loan",
        typeId: typeId("Loan"),
        subcategoryId: subcategoryId("Loan", "Home"),
        amountPaise: 20_000,
        direction: "outflow",
        kind: "emi",
        loanId: personalLoan.id,
        loanPaymentType: "emi"
      }),
    "Linked loan must match the selected Loan SubType."
  );

  const archiveResult = services.archiveLoan(loan.id);
  assert(archiveResult.mode === "archived", "Loan removal should archive, not hard-delete.");
  assert(!services.listLoans(false).some((item) => item.id === loan.id), "Archived loan should leave active loan list.");
  assert(services.listLoans(true).find((item) => item.id === loan.id)?.isArchived, "Archived loan should remain in history.");

  await assertRejectsWithMessage(
    "archived loan payment",
    () =>
      services.createTransaction({
        date: "2026-08-04",
        accountId: state.bankId,
        method: "bank_transfer",
        merchant: "Archived loan payment",
        typeId: typeId("Loan"),
        subcategoryId: subcategoryId("Loan", "Home"),
        amountPaise: 10_000,
        direction: "outflow",
        kind: "emi",
        loanId: loan.id,
        loanPaymentType: "emi"
      }),
    "Archived loans cannot receive new payments."
  );

  const restored = services.updateLoan(loan.id, { isArchived: false });
  assert(!restored.isArchived, "Archived loan should be restorable.");
});

test("deleting a used SubType moves its history to uncategorized", () => {
  assert(state.bankId, "Bank should exist.");
  const subcategory = services.createSubcategory({
    typeId: typeId("Expense"),
    name: "Fuel QA",
    icon: "car",
    color: "#2563eb"
  });
  services.createTransaction({
    date: "2026-06-01",
    accountId: state.bankId,
    method: "upi",
    merchant: "Fuel pump",
    typeId: typeId("Expense"),
    subcategoryId: subcategory.id,
    amountPaise: 10_000,
    direction: "outflow",
    kind: "expense"
  });

  services.deleteSubcategory(subcategory.id);
  const moved = services.listTransactions({ search: "Fuel pump" })[0];
  assert(moved?.subcategoryId === null, "Transaction should lose deleted SubType.");
  assert(moved?.status === "uncategorized", "Moved transaction should be flagged as uncategorized.");
});

test("removes accounts by deleting unused records and hiding accounts with history", () => {
  const unused = services.createAccount({
    name: "QA Empty Wallet",
    type: "bank",
    startingBalancePaise: 0
  });
  const unusedResult = services.deleteAccount(unused.id);
  assert(unusedResult.mode === "deleted", "Unused account should be deleted.");
  assert(!services.listAccounts().some((account) => account.id === unused.id), "Unused account should disappear.");

  const used = services.createAccount({
    name: "QA Old Wallet",
    type: "bank",
    startingBalancePaise: 0
  });
  services.createTransaction({
    date: "2026-05-01",
    accountId: used.id,
    method: "upi",
    merchant: "Historical spend",
    typeId: typeId("Expense"),
    subcategoryId: subcategoryId("Expense", "Shopping"),
    amountPaise: 1_000,
    direction: "outflow",
    kind: "expense"
  });
  const usedResult = services.deleteAccount(used.id);
  const hidden = services.listAccounts().find((account) => account.id === used.id);

  assert(usedResult.mode === "hidden", "Used account should be hidden.");
  assert(hidden?.isArchived, "Hidden account should remain for history.");

  const recreated = services.createAccount({
    name: "QA Old Wallet",
    type: "bank",
    startingBalancePaise: 42_000
  });
  assert(!recreated.isArchived, "Re-created account should be active.");
  assert(recreated.id !== used.id, "Re-created account should be a new account, not overwrite history.");
  assert(recreated.balancePaise === 42_000, "Re-created account should use the new starting balance.");

  return assertRejectsWithMessage(
    "restore account when active duplicate exists",
    () => services.updateAccount(used.id, { isArchived: false }),
    "An active account or card with this name already exists."
  );
});

test("rejects duplicate active account names with a clear error", async () => {
  await assertRejectsWithMessage(
    "duplicate active account name",
    () =>
      services.createAccount({
        name: "QA HDFC Bank",
        type: "bank",
        startingBalancePaise: 1_000
      }),
    "An active account or card with this name already exists."
  );
});

test("filters transactions by uncategorized status and exports CSV", () => {
  const uncategorized = services.listTransactions({ status: "uncategorized" });
  const csv = services.exportTransactionsCsv();

  assert(uncategorized.length === 4, "Four uncategorized transactions should be present.");
  assert(csv.includes("date,account,type,subtype,method"), "CSV should include new taxonomy headers.");
  assert(csv.includes("DMart"), "CSV should include transaction rows.");
});

test("neutralizes spreadsheet formula injection in CSV export", () => {
  const suffix = Date.now().toString().slice(-5);
  const bank = services.createAccount({
    name: `QA CSV Bank ${suffix}`,
    type: "bank",
    startingBalancePaise: 10_000_00
  });
  services.createTransaction({
    date: "2026-07-07",
    accountId: bank.id,
    method: "upi",
    merchant: "=HYPERLINK(\"http://evil\",\"click\")",
    typeId: typeId("Expense"),
    subcategoryId: subcategoryId("Expense", "Groceries"),
    amountPaise: 1_00,
    direction: "outflow",
    kind: "expense"
  });

  const csv = services.exportTransactionsCsv();
  assert(csv.includes("\"'=HYPERLINK"), "A formula-like merchant must be prefixed with a quote in the CSV.");
  assert(!/,"=HYPERLINK/.test(csv), "No raw formula cell should be emitted.");
});

test("paginates transactions with limit and offset", () => {
  const firstPage = services.listTransactions({ limit: 3 });
  const secondPage = services.listTransactions({ limit: 3, offset: 3 });

  assert(firstPage.length === 3, "First transaction page should respect limit.");
  assert(secondPage.length === 3, "Second transaction page should respect limit and offset.");
  assert(
    firstPage.every((transaction) => !secondPage.some((next) => next.id === transaction.id)),
    "Offset page should not repeat the first page."
  );
});

test("builds Excel template and imports valid rows insert-only", async () => {
  const template = await services.buildImportTemplate();
  const result = await services.importTransactionsWorkbook(template);
  const imported = services.listTransactions({ search: "Sample row" });
  const repeated = await services.importTransactionsWorkbook(template);
  const importedAfterRepeat = services.listTransactions({ search: "Sample row" });

  assert(template.byteLength > 0, "Template should be generated.");
  assert(result.errors.length === 0, "Template sample row should validate.");
  assert(result.insertedCount === 1, "One sample row should import.");
  assert(imported.length === 1, "Imported sample row should be inserted.");
  assert(repeated.insertedCount === 0, "Repeated import should not insert exact duplicates.");
  assert(repeated.skippedDuplicateCount === 1, "Repeated import should report skipped duplicate rows.");
  assert(importedAfterRepeat.length === 1, "Repeated import should leave one imported sample row.");
  assert(repeated.affectedAccounts.length === 1, "Repeated import should still report affected account for review.");
});

test("Excel import creates missing accounts, food cards, Types, SubTypes, and target credit cards", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Transactions");
  sheet.addRow([
    "Date",
    "Account",
    "Account Type",
    "Type",
    "Type Behavior",
    "SubType",
    "Method",
    "Amount",
    "Note"
  ]);
  sheet.addRow([
    "2026-07-14",
    "QA Import Food Card",
    "Food card",
    "Snacks QA",
    "Expense",
    "Office snacks",
    "UPI",
    "45.50",
    "Auto-created food card row"
  ]);
  sheet.addRow([
    "2026-07-14",
    "QA Import Bank",
    "Bank account",
    "Credit Card Payment",
    "",
    "QA Import Target Card",
    "Bank transfer",
    "25.00",
    "Auto-created target card row"
  ]);

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const result = await services.importTransactionsWorkbook(buffer);
  const accounts = services.listAccounts();
  const foodCard = accounts.find((account) => account.name === "QA Import Food Card");
  const targetCard = accounts.find((account) => account.name === "QA Import Target Card");
  const createdType = services.listCategoryTypes().find((type) => type.name === "Snacks QA");
  const createdSubType = createdType?.subcategories.find((subcategory) => subcategory.name === "Office snacks");
  const importedRows = services.listTransactions({ search: "Auto-created" });

  assert(result.errors.length === 0, "Auto-create import should validate.");
  assert(result.insertedCount === 2, "Two rows should be imported.");
  assert(foodCard?.type === "food_card", "Missing Food Card should be created.");
  assert(targetCard?.type === "credit_card", "Missing target card should be created.");
  assert(targetCard?.creditLimitPaise === 0, "Auto-created credit card should use ₹0 limit.");
  assert(createdType?.behavior === "expense", "Missing Type should be created with requested behavior.");
  assert(createdSubType?.name === "Office snacks", "Missing SubType should be created under the new Type.");
  assert(importedRows.length === 2, "Both auto-created rows should be inserted.");
  assert(
    result.warnings.some((warning) => warning.includes("credit limit ₹0")),
    "Import should warn about updating the auto-created credit-card limit."
  );
});

test("plans selected monthly budgets with pace warnings and overlap protection", async () => {
  const suffix = Date.now().toString().slice(-5);
  const bank = services.createAccount({
    name: `QA Budget Bank ${suffix}`,
    type: "bank",
    startingBalancePaise: 100_000_00
  });

  services.createTransaction({
    date: "2026-08-05",
    accountId: bank.id,
    method: "upi",
    merchant: "Budget groceries",
    typeId: typeId("Expense"),
    subcategoryId: subcategoryId("Expense", "Groceries"),
    amountPaise: 6_000_00,
    direction: "outflow",
    kind: "expense"
  });
  services.createTransaction({
    date: "2026-08-06",
    accountId: bank.id,
    method: "bank_transfer",
    merchant: "Budget mutual fund",
    typeId: typeId("Investment"),
    subcategoryId: subcategoryId("Investment", "Mutual Funds"),
    amountPaise: 5_000_00,
    direction: "outflow",
    kind: "investment"
  });

  const groceries = services.createBudgetLine({
    month: "2026-08",
    scopeType: "subcategory",
    scopeId: subcategoryId("Expense", "Groceries"),
    amountPaise: 10_000_00
  });
  const investments = services.createBudgetLine({
    month: "2026-08",
    scopeType: "type",
    scopeId: typeId("Investment"),
    amountPaise: 20_000_00
  });

  await assertRejectsWithMessage(
    "duplicate budget",
    () =>
      services.createBudgetLine({
        month: "2026-08",
        scopeType: "subcategory",
        scopeId: subcategoryId("Expense", "Groceries"),
        amountPaise: 12_000_00
      }),
    "already has a budget"
  );
  await assertRejectsWithMessage(
    "overlapping budget",
    () =>
      services.createBudgetLine({
        month: "2026-08",
        scopeType: "type",
        scopeId: typeId("Expense"),
        amountPaise: 30_000_00
      }),
    "overlap"
  );

  const earlyPlan = services.getBudgetPlan("2026-08", "2026-08-10");
  const groceryLine = earlyPlan.lines.find((line) => line.id === groceries.id);
  const investmentLine = earlyPlan.lines.find((line) => line.id === investments.id);

  assert(groceryLine?.actualPaise === 6_000_00, "SubType budget should use monthly report actuals.");
  assert(groceryLine.status === "critical", "Fast spending should warn before crossing the line.");
  assert(groceryLine.projectedPaise > groceryLine.amountPaise, "Projection should show likely overspend.");
  assert(investmentLine?.status === "safe", "Investment budget within pace should remain safe.");
  assert(
    !earlyPlan.availableScopes.some((scope) => scope.scopeType === "type" && scope.scopeId === typeId("Expense")),
    "A Type scope should be hidden when one of its SubTypes is already budgeted."
  );

  const updated = services.updateBudgetLine(groceries.id, { amountPaise: 30_000_00 });
  assert(updated.amountPaise === 30_000_00, "Budget updates should change the allocation.");

  const deleted = services.deleteBudgetLine(investments.id);
  assert(deleted.ok, "Budget delete should confirm success.");
  assert(
    !services.getBudgetPlan("2026-08", "2026-08-10").lines.some((line) => line.id === investments.id),
    "Deleted budget lines should no longer appear."
  );

  const cleanupType = services.createCategoryType({
    name: `Budget Cleanup ${suffix}`,
    behavior: "expense",
    icon: "wallet",
    color: "#0f766e"
  });
  const cleanupSubcategory = services.createSubcategory({
    typeId: cleanupType.id,
    name: "Cleanup SubType",
    icon: "wallet",
    color: "#0f766e"
  });
  const cleanupBudget = services.createBudgetLine({
    month: "2026-08",
    scopeType: "subcategory",
    scopeId: cleanupSubcategory.id,
    amountPaise: 1_000_00
  });

  services.deleteCategoryType(cleanupType.id);
  assert(
    !services.getBudgetPlan("2026-08", "2026-08-10").lines.some((line) => line.id === cleanupBudget.id),
    "Deleting a custom Type should remove its budget lines."
  );
});

test("rolls back Excel-created records when transaction insertion fails", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Transactions");
  sheet.addRow([
    "Date",
    "Account",
    "Account Type",
    "Type",
    "Type Behavior",
    "SubType",
    "Method",
    "Amount",
    "Note"
  ]);
  sheet.addRow([
    "2026-07-15",
    "QA Atomic Import Bank",
    "Bank account",
    "Atomic Expense QA",
    "Expense",
    "Atomic SubType QA",
    "UPI",
    "50.00",
    "Must roll back"
  ]);

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  await assertRejects("invalid-batch import", () =>
    services.importTransactionsWorkbook(buffer, "missing-import-batch")
  );

  assert(
    !services.listAccounts().some((account) => account.name === "QA Atomic Import Bank"),
    "A failed import should roll back its planned account."
  );
  assert(
    !services.listCategoryTypes().some((type) => type.name === "Atomic Expense QA"),
    "A failed import should roll back its planned Type and SubType."
  );
});

test("builds week-, month- and year-on-year trend reports per Type", async () => {
  const suffix = Date.now().toString().slice(-5);
  const bank = services.createAccount({
    name: `QA Trend Bank ${suffix}`,
    type: "bank",
    startingBalancePaise: 500_000_00
  });

  const now = new Date();
  const year = now.getFullYear();
  const currentMonth = `${year}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  services.createTransaction({
    date: `${year}-01-15`,
    accountId: bank.id,
    method: "upi",
    merchant: "Trend groceries Jan",
    typeId: typeId("Expense"),
    subcategoryId: subcategoryId("Expense", "Groceries"),
    amountPaise: 3_000_00,
    direction: "outflow",
    kind: "expense"
  });
  services.createTransaction({
    date: `${currentMonth}-10`,
    accountId: bank.id,
    method: "upi",
    merchant: "Trend groceries now",
    typeId: typeId("Expense"),
    subcategoryId: subcategoryId("Expense", "Groceries"),
    amountPaise: 2_000_00,
    direction: "outflow",
    kind: "expense"
  });

  const monthly = services.getTrendReport(bank.id, typeId("Expense"), "month");
  assert(monthly.points.length === now.getMonth() + 1, "Month trend should span January through the current month.");
  assert(monthly.points[0].amountPaise === 3_000_00, "January bucket should hold the January expense.");
  assert(
    monthly.points[monthly.points.length - 1].amountPaise === 2_000_00,
    "The current month bucket should hold this month's expense."
  );
  assert(
    monthly.points.slice(1, -1).every((point) => point.amountPaise === 0),
    "Months without expenses should be zero."
  );

  const yearly = services.getTrendReport(bank.id, typeId("Expense"), "year");
  assert(yearly.points.length >= 1, "Year trend should include at least the current year.");
  assert(
    yearly.points[yearly.points.length - 1].amountPaise === 5_000_00,
    "The current year bucket should total both expenses."
  );

  const income = services.getTrendReport(bank.id, typeId("Income"), "month");
  assert(
    income.points.every((point) => point.amountPaise === 0),
    "Income trend for this account should be zero when only expenses exist."
  );

  const weekly = services.getTrendReport(bank.id, typeId("Expense"), "week", currentMonth);
  assert(weekly.month === currentMonth, "Week trend should echo the selected month.");
  assert(
    weekly.points.length >= 4 && weekly.points.length <= 5,
    "A month should split into 4–5 week buckets."
  );
  assert(
    weekly.points[1].amountPaise === 2_000_00,
    "The 8–14 week bucket should hold the 10th's expense."
  );
  assert(
    weekly.points.reduce((sum, point) => sum + point.amountPaise, 0) === 2_000_00,
    "Week buckets should only include the selected month's expense."
  );

  await assertRejects("unknown trend type", () => services.getTrendReport(undefined, "type_missing", "month"));
});

test("builds a budget-vs-actual trend for a SubType", async () => {
  const now = new Date();
  const year = now.getFullYear();
  const cur = `${year}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const bank = services.createAccount({
    name: `QA Budget Trend Bank ${Date.now().toString().slice(-5)}`,
    type: "bank",
    startingBalancePaise: 5_00_000_00
  });
  const grocSub = subcategoryId("Expense", "Groceries");

  services.createBudgetLine({ month: cur, scopeType: "subcategory", scopeId: grocSub, amountPaise: 5_000_00 });
  services.createTransaction({
    date: `${cur}-10`,
    accountId: bank.id,
    method: "upi",
    merchant: "Groceries over budget",
    typeId: typeId("Expense"),
    subcategoryId: grocSub,
    amountPaise: 7_000_00,
    direction: "outflow",
    kind: "expense"
  });

  const monthTrend = services.getBudgetTrendReport(bank.id, grocSub, "month");
  const curPoint = monthTrend.points[monthTrend.points.length - 1];
  assert(curPoint.actualPaise === 7_000_00, "Current month actual should reflect the grocery spend.");
  assert(curPoint.budgetPaise === 5_000_00, "Current month budget should reflect the set budget.");
  assert(curPoint.actualPaise > (curPoint.budgetPaise ?? 0), "Over-budget months should be detectable.");

  const weekTrend = services.getBudgetTrendReport(bank.id, grocSub, "week", cur);
  assert(weekTrend.month === cur, "Week budget trend should echo the selected month.");
  const overWeek = weekTrend.points.find((point) => point.actualPaise === 7_000_00);
  assert(overWeek, "The week holding the spend should appear.");
  assert(
    overWeek!.budgetPaise !== null && overWeek!.budgetPaise > 0,
    "Weekly budget should be pro-rated from the monthly budget."
  );

  const noBudget = services.getBudgetTrendReport(bank.id, subcategoryId("Expense", "Dining/Food"), "month");
  assert(
    noBudget.points.every((point) => point.budgetPaise === null),
    "A SubType with no budget set should have null budget points."
  );

  await assertRejects("non-budgetable SubType", () =>
    services.getBudgetTrendReport(bank.id, subcategoryId("Income", "Salary"), "month")
  );
});

test("stores the card utilization alert threshold with validation", async () => {
  assert(
    services.getSettings().card_utilization_alert_percent === "30",
    "Card utilization alert should default to 30."
  );

  const updated = services.updateAppSettings({ cardUtilizationAlertPercent: 45 });
  assert(updated.card_utilization_alert_percent === "45", "Threshold update should persist.");

  await assertRejects("threshold above 100", () => services.updateAppSettings({ cardUtilizationAlertPercent: 150 }));
  await assertRejects("threshold below 1", () => services.updateAppSettings({ cardUtilizationAlertPercent: 0 }));
  assert(
    services.getSettings().card_utilization_alert_percent === "45",
    "Rejected updates should not change the stored threshold."
  );
});

test("tracks investment holdings with computed gain and validation", async () => {
  const stock = services.createInvestment({
    type: "stocks",
    name: "QA Reliance",
    investedPaise: 1_00_000_00,
    currentValuePaise: 1_35_000_00,
    shares: 12.5,
    purchaseDate: "2026-03-15"
  });
  assert(stock.gainPaise === 35_000_00, "Gain should be current minus invested.");
  assert(stock.gainPercent === 35, "Gain percent should be computed.");
  assert(stock.typeLabel === "Stocks", "Type label should resolve from metadata.");
  assert(stock.shares === 12.5, "Fractional shares should round-trip through create.");
  assert(stock.purchaseDate === "2026-03-15", "Purchase date should round-trip through create.");

  const mf = services.createInvestment({
    type: "mutual_funds",
    name: "QA Flexicap",
    investedPaise: 2_00_000_00,
    currentValuePaise: 1_80_000_00,
    purchaseDate: "2026-01-05"
  });
  assert(mf.gainPaise === -20_000_00 && mf.gainPercent === -10, "Losses should be negative.");
  assert(mf.shares === null, "Shares should be optional for non-stock holdings.");
  assert(mf.purchaseDate === "2026-01-05", "Purchase date should round-trip for non-stocks.");

  const fd = services.createInvestment({
    type: "fd",
    name: "QA HDFC Fixed Deposit",
    investedPaise: 5_00_000_00,
    currentValuePaise: 5_35_000_00,
    purchaseDate: "2026-02-01"
  });
  assert(fd.type === "fd" && fd.typeLabel === "Fixed Deposit", "FD should be a valid investment type.");
  assert(fd.gainPaise === 35_000_00 && fd.gainPercent === 7, "FD gain should compute like any holding.");

  const updated = services.updateInvestment(stock.id, { currentValuePaise: 90_000_00 });
  assert(updated.gainPaise === -10_000_00, "Updating current value should recompute the gain.");
  assert(updated.shares === 12.5, "Untouched shares should persist across an update.");
  assert(updated.purchaseDate === "2026-03-15", "Untouched purchase date should persist across an update.");

  const reshared = services.updateInvestment(stock.id, { shares: 20, purchaseDate: "2026-04-01" });
  assert(reshared.shares === 20 && reshared.purchaseDate === "2026-04-01", "Shares and date should be updatable.");

  const list = services.listInvestments();
  assert(list.length >= 2, "Investments should be listed.");
  assert(
    list.find((item) => item.id === stock.id)?.shares === 20,
    "Updated shares should be reflected in the list."
  );

  await assertRejects("unknown investment type", () =>
    services.createInvestment({ type: "crypto" as never, name: "X", investedPaise: 100, currentValuePaise: 200 })
  );

  services.deleteInvestment(mf.id);
  assert(!services.listInvestments().some((item) => item.id === mf.id), "Deleted investment should be gone.");
  await assertRejects("delete missing investment", () => services.deleteInvestment(mf.id));
});

test("builds a monthly payment-history grid and rejects unknown sources", async () => {
  assert(state.bankId, "Bank should exist.");
  const loan = services.createLoan({
    name: "QA Payment History Loan",
    subcategoryId: subcategoryId("Loan", "Personal"),
    principalAmountPaise: 12_000_000,
    startingOutstandingPaise: 12_000_000,
    startMonth: "2029-01",
    annualInterestRateBps: 1000,
    tenureMonths: 24,
    monthlyEmiPaise: 500_000
  });

  services.createTransaction({
    date: "2029-03-10",
    accountId: state.bankId,
    method: "bank_transfer",
    merchant: "QA history EMI",
    typeId: typeId("Loan"),
    subcategoryId: subcategoryId("Loan", "Personal"),
    amountPaise: 500_000,
    direction: "outflow",
    kind: "emi",
    loanId: loan.id,
    loanPaymentType: "emi"
  });

  const history = services.getPaymentHistory("loan", loan.id, 2029);
  assert(history.months.length === 12, "Payment history should always have 12 months.");
  assert(history.months[2] === true, "March (index 2) should be marked paid.");
  assert(
    history.months.filter((paid) => paid).length === 1,
    "Only the paid month should be true."
  );
  assert(history.year === 2029 && history.source === "loan", "History should echo its scope.");

  const otherYear = services.getPaymentHistory("loan", loan.id, 2030);
  assert(
    otherYear.months.every((paid) => paid === false),
    "A year with no payments should be all false."
  );

  await assertRejects("invalid payment history source", () =>
    services.getPaymentHistory("stocks" as never, loan.id, 2029)
  );
});

test("scopes mutual-fund payment history to the linked holding only", async () => {
  assert(state.bankId, "Bank should exist.");
  const fundA = services.createInvestment({
    type: "mutual_funds",
    name: "QA Fund Alpha",
    investedPaise: 5_000_00,
    currentValuePaise: 5_500_00
  });
  const fundB = services.createInvestment({
    type: "mutual_funds",
    name: "QA Fund Beta",
    investedPaise: 3_000_00,
    currentValuePaise: 2_900_00
  });

  // A SIP into fund A during April 2031, explicitly linked to that holding.
  services.createTransaction({
    date: "2031-04-12",
    accountId: state.bankId,
    method: "upi",
    merchant: "QA SIP Alpha",
    typeId: typeId("Investment"),
    subcategoryId: subcategoryId("Investment", "Mutual Funds"),
    amountPaise: 250_000,
    direction: "outflow",
    kind: "investment",
    investmentId: fundA.id
  });

  // A mutual-fund investment that is NOT linked to any holding must not tick anyone.
  services.createTransaction({
    date: "2031-06-01",
    accountId: state.bankId,
    method: "upi",
    merchant: "QA unlinked MF",
    typeId: typeId("Investment"),
    subcategoryId: subcategoryId("Investment", "Mutual Funds"),
    amountPaise: 100_000,
    direction: "outflow",
    kind: "investment"
  });

  const alpha = services.getPaymentHistory("mutual_fund", fundA.id, 2031);
  assert(alpha.months[3] === true, "April (index 3) should tick for the linked fund.");
  assert(
    alpha.months.filter((paid) => paid).length === 1,
    "Only the linked month should tick for fund A."
  );

  const beta = services.getPaymentHistory("mutual_fund", fundB.id, 2031);
  assert(
    beta.months.every((paid) => paid === false),
    "A fund with no linked payments must show no ticks (not all funds)."
  );

  await assertRejects("mutual-fund link requires the Mutual Funds subtype", () =>
    services.createTransaction({
      date: "2031-04-15",
      accountId: state.bankId!,
      method: "upi",
      merchant: "QA wrong subtype",
      typeId: typeId("Expense"),
      subcategoryId: subcategoryId("Expense", "Groceries"),
      amountPaise: 50_000,
      direction: "outflow",
      kind: "expense",
      investmentId: fundA.id
    })
  );
});

test("tags expenses to a vacation, rolls them up by subtype, and double-counts", async () => {
  assert(state.bankId, "Bank should exist.");
  const trip = services.createVacation({
    name: "QA Goa Trip",
    startDate: "2026-05-01",
    endDate: "2026-05-06",
    budgetPaise: 50_000_00
  });
  assert(trip.totalSpentPaise === 0 && trip.transactionCount === 0, "A new trip starts empty.");
  assert(trip.remainingPaise === 50_000_00, "Remaining should equal the budget when nothing is spent.");

  const grocSub = subcategoryId("Expense", "Groceries");
  const travelSub = subcategoryId("Expense", "Travel");
  const foodTxn = services.createTransaction({
    date: "2026-05-02",
    accountId: state.bankId,
    method: "upi",
    merchant: "Goa food",
    typeId: typeId("Expense"),
    subcategoryId: grocSub,
    amountPaise: 20_000_00,
    direction: "outflow",
    kind: "expense",
    vacationId: trip.id
  });
  services.createTransaction({
    date: "2026-05-03",
    accountId: state.bankId,
    method: "upi",
    merchant: "Goa cab",
    typeId: typeId("Expense"),
    subcategoryId: travelSub,
    amountPaise: 8_000_00,
    direction: "outflow",
    kind: "expense",
    vacationId: trip.id
  });

  const withSpend = services.listVacations(true).find((item) => item.id === trip.id);
  assert(withSpend, "Trip should be listed.");
  assert(withSpend!.totalSpentPaise === 28_000_00, "Total should sum the tagged expenses.");
  assert(withSpend!.transactionCount === 2, "Both tagged expenses should be counted.");
  assert(withSpend!.remainingPaise === 22_000_00, "Remaining = budget minus spend.");
  const groc = withSpend!.breakdown.find((row) => row.subcategoryId === grocSub);
  const travel = withSpend!.breakdown.find((row) => row.subcategoryId === travelSub);
  assert(groc?.amountPaise === 20_000_00 && travel?.amountPaise === 8_000_00, "Breakdown groups by SubType.");

  // Double-counting: the tagged expense still shows in the normal monthly expense report.
  const report = services.getMonthlyReport(undefined, "2026-05");
  const grocReport = report.categories.find((row) => row.subcategoryId === grocSub);
  assert(
    (grocReport?.amountPaise ?? 0) >= 20_000_00,
    "A vacation-tagged expense must also appear in normal expenses."
  );

  // Editing a transaction to drop the tag removes it from the trip only.
  services.updateTransaction(foodTxn.transaction.id, { vacationId: "" });
  const afterUntag = services.listVacations(true).find((item) => item.id === trip.id);
  assert(afterUntag!.totalSpentPaise === 8_000_00, "Untagging removes the expense from the trip total.");

  await assertRejects("non-expense tagged to a vacation", () =>
    services.createTransaction({
      date: "2026-05-04",
      accountId: state.bankId!,
      method: "bank_transfer",
      merchant: "Salary",
      typeId: typeId("Income"),
      subcategoryId: subcategoryId("Income", "Salary"),
      amountPaise: 1_00_000_00,
      direction: "inflow",
      kind: "income",
      vacationId: trip.id
    })
  );

  // Deleting the trip keeps the transactions as normal expenses.
  services.deleteVacation(trip.id);
  assert(!services.listVacations(true).some((item) => item.id === trip.id), "Deleted trip should be gone.");
  const afterDelete = services.getMonthlyReport(undefined, "2026-05");
  assert(
    (afterDelete.categories.find((row) => row.subcategoryId === travelSub)?.amountPaise ?? 0) >= 8_000_00,
    "Deleting a trip must not delete its expenses."
  );
});

test("computes net worth, asset allocation, cashflow and runway", async () => {
  const suffix = Date.now().toString().slice(-5);
  const bank = services.createAccount({
    name: `QA Wealth Bank ${suffix}`,
    type: "bank",
    startingBalancePaise: 3_00_000_00
  });
  services.createInvestment({
    type: "stocks",
    name: `QA Wealth Stock ${suffix}`,
    investedPaise: 1_00_000_00,
    currentValuePaise: 1_50_000_00
  });
  services.createInvestment({
    type: "gold",
    name: `QA Wealth Gold ${suffix}`,
    investedPaise: 50_000_00,
    currentValuePaise: 60_000_00
  });

  const before = services.getWealthSummary();
  // Net worth = liquid + investments − liabilities (no loans/cards here).
  assert(
    before.netWorth.netWorthPaise === before.netWorth.liquidPaise + before.netWorth.investmentsPaise - before.netWorth.liabilitiesPaise,
    "Net worth must equal liquid + investments − liabilities."
  );
  assert(before.netWorth.investmentsPaise >= 2_10_000_00, "Investments should include both holdings' current value.");
  const equity = before.allocation.find((segment) => segment.key === "equity");
  const gold = before.allocation.find((segment) => segment.key === "gold");
  assert(equity && equity.valuePaise >= 1_50_000_00, "Equity allocation should include the stock's current value.");
  assert(gold && gold.valuePaise === 60_000_00, "Gold allocation should equal the gold holding value.");

  // Snapshot persisted and reflected in history for the current month.
  assert(before.history.length >= 1, "A net-worth snapshot should be recorded for the current month.");
  assert(
    before.history[before.history.length - 1].netWorthPaise === before.netWorth.netWorthPaise,
    "The latest history point should equal the live net worth."
  );

  assert(typeof before.cashflow.savingsRatePercent === "number", "Savings rate should be a number.");
  assert(before.runwayMonths === null || before.runwayMonths >= 0, "Runway should be null or non-negative.");
});

test("self transfers move money between accounts without counting as outflow", async () => {
  const suffix = Date.now().toString().slice(-5);
  const source = services.createAccount({
    name: `QA Self Source ${suffix}`,
    type: "bank",
    startingBalancePaise: 50_000_00
  });
  const target = services.createAccount({
    name: `QA Self Target ${suffix}`,
    type: "bank",
    startingBalancePaise: 10_000_00
  });
  const card = services.createAccount({
    name: `QA Self Card ${suffix}`,
    type: "credit_card",
    startingBalancePaise: 0,
    creditLimitPaise: 1_00_000_00
  });

  const before = services.getMonthlyReport(undefined, "2026-09");

  services.createTransaction({
    date: "2026-09-10",
    accountId: source.id,
    method: "bank_transfer",
    typeId: typeId("Transfer"),
    subcategoryId: SELF_TRANSFER_SUBCATEGORY_ID,
    amountPaise: 15_000_00,
    direction: "outflow",
    kind: "transfer",
    transferAccountId: target.id
  });

  const accounts = services.listAccounts();
  const sourceAfter = accounts.find((account) => account.id === source.id);
  const targetAfter = accounts.find((account) => account.id === target.id);
  assert(sourceAfter?.balancePaise === 35_000_00, "The source balance should drop by the transferred amount.");
  assert(targetAfter?.balancePaise === 25_000_00, "The target balance should rise by the transferred amount.");

  const after = services.getMonthlyReport(undefined, "2026-09");
  assert(
    after.totalOutflowPaise === before.totalOutflowPaise,
    "A self transfer must not change the report outflow."
  );
  assert(
    after.totalSpendingPaise === before.totalSpendingPaise,
    "A self transfer must not change tracked spending."
  );
  assert(
    !after.types.some((type) => type.subcategories.some((sub) => sub.subcategoryId === SELF_TRANSFER_SUBCATEGORY_ID)),
    "Self transfers must not appear as a report line."
  );

  await assertRejects("Self transfer without a destination", () =>
    services.createTransaction({
      date: "2026-09-11",
      accountId: source.id,
      method: "bank_transfer",
      typeId: typeId("Transfer"),
      subcategoryId: SELF_TRANSFER_SUBCATEGORY_ID,
      amountPaise: 1_000_00,
      direction: "outflow",
      kind: "transfer"
    })
  );

  await assertRejects("Self transfer into the same account", () =>
    services.createTransaction({
      date: "2026-09-11",
      accountId: source.id,
      method: "bank_transfer",
      typeId: typeId("Transfer"),
      subcategoryId: SELF_TRANSFER_SUBCATEGORY_ID,
      amountPaise: 1_000_00,
      direction: "outflow",
      kind: "transfer",
      transferAccountId: source.id
    })
  );

  await assertRejects("Self transfer into a credit card", () =>
    services.createTransaction({
      date: "2026-09-11",
      accountId: source.id,
      method: "bank_transfer",
      typeId: typeId("Transfer"),
      subcategoryId: SELF_TRANSFER_SUBCATEGORY_ID,
      amountPaise: 1_000_00,
      direction: "outflow",
      kind: "transfer",
      transferAccountId: card.id
    })
  );
});

test("report outflow covers every non-inflow type and matches the overview", async () => {
  const suffix = Date.now().toString().slice(-5);
  const bank = services.createAccount({
    name: `QA Outflow Bank ${suffix}`,
    type: "bank",
    startingBalancePaise: 5_00_000_00
  });
  const card = services.createAccount({
    name: `QA Outflow Card ${suffix}`,
    type: "credit_card",
    startingBalancePaise: 0,
    creditLimitPaise: 2_00_000_00
  });

  services.createTransaction({
    date: "2026-10-05",
    accountId: bank.id,
    method: "upi",
    typeId: typeId("Expense"),
    subcategoryId: subcategoryId("Expense", "Groceries"),
    amountPaise: 4_000_00,
    direction: "outflow",
    kind: "expense"
  });
  services.createTransaction({
    date: "2026-10-06",
    accountId: bank.id,
    method: "bank_transfer",
    typeId: typeId("Transfer"),
    subcategoryId: subcategoryId("Transfer", "Parents"),
    amountPaise: 3_000_00,
    direction: "outflow",
    kind: "transfer"
  });
  services.createTransaction({
    date: "2026-10-07",
    accountId: card.id,
    method: "credit_card",
    typeId: typeId("Expense"),
    subcategoryId: subcategoryId("Expense", "Shopping"),
    amountPaise: 2_000_00,
    direction: "outflow",
    kind: "expense"
  });
  services.createTransaction({
    date: "2026-10-08",
    accountId: bank.id,
    method: "bank_transfer",
    typeId: typeId("Credit Card Payment"),
    amountPaise: 2_000_00,
    direction: "outflow",
    kind: "card_payment",
    transferAccountId: card.id
  });

  const report = services.getMonthlyReport(undefined, "2026-10");
  const outflowFromTypes = cashflowPartsFromTypes(report.types as ReportType[], "out").reduce(
    (sum, part) => sum + part.amountPaise,
    0
  );

  // 4,000 expense + 3,000 transfer + 2,000 card expense + 2,000 card payment.
  assert(report.totalOutflowPaise === 11_000_00, "Outflow should add up every non-inflow type.");
  assert(
    report.totalOutflowPaise === outflowFromTypes,
    "The outflow total must equal the Reports outflow breakdown."
  );

  const overview = services.getOverview(undefined, "2026-10");
  assert(
    overview.summary.totalOutflowPaise === report.totalOutflowPaise,
    "The overview outflow must match the report outflow."
  );
});

test("budget totals keep budgeted equal to used plus remaining", async () => {
  const suffix = Date.now().toString().slice(-5);
  const bank = services.createAccount({
    name: `QA Budget Remaining Bank ${suffix}`,
    type: "bank",
    startingBalancePaise: 1_00_000_00
  });

  // Deliberately overspend one line so its remaining goes negative.
  services.createTransaction({
    date: "2026-11-05",
    accountId: bank.id,
    method: "upi",
    typeId: typeId("Expense"),
    subcategoryId: subcategoryId("Expense", "Groceries"),
    amountPaise: 9_000_00,
    direction: "outflow",
    kind: "expense"
  });
  services.createTransaction({
    date: "2026-11-06",
    accountId: bank.id,
    method: "upi",
    typeId: typeId("Expense"),
    subcategoryId: subcategoryId("Expense", "Transport"),
    amountPaise: 1_000_00,
    direction: "outflow",
    kind: "expense"
  });

  services.createBudgetLine({
    month: "2026-11",
    scopeType: "subcategory",
    scopeId: subcategoryId("Expense", "Groceries"),
    amountPaise: 5_000_00
  });
  services.createBudgetLine({
    month: "2026-11",
    scopeType: "subcategory",
    scopeId: subcategoryId("Expense", "Transport"),
    amountPaise: 4_000_00
  });

  const plan = services.getBudgetPlan("2026-11", "2026-11-30");
  assert(plan.totals.amountPaise === 9_000_00, "Budgeted should be the sum of the budget lines.");
  assert(plan.totals.actualPaise === 10_000_00, "Used should be the sum of the actuals.");
  assert(
    plan.totals.amountPaise === plan.totals.actualPaise + plan.totals.remainingPaise,
    "Budgeted must equal used plus remaining, even when a line is over budget."
  );
  assert(plan.totals.remainingPaise === -1_000_00, "Remaining should go negative once spending passes the budget.");
});

let failed = 0;

for (const item of tests) {
  try {
    await item.run();
    console.log(`PASS ${item.name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${item.name}`);
    console.error(error instanceof Error ? error.message : error);
  }
}

dbModule.db.close();

if (existsSync(testDbPath)) {
  unlinkSync(testDbPath);
}

if (failed > 0) {
  console.error(`${failed} QA test(s) failed.`);
  process.exit(1);
}

console.log(`${tests.length} QA tests passed.`);
