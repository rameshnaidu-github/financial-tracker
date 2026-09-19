import { existsSync, mkdirSync, readdirSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import ExcelJS from "exceljs";
import { cashflowPartsFromTypes } from "../src/report-cashflow.ts";
import { formatINR, formatINRWhole } from "../src/format.ts";
import { INFLOW_BEHAVIORS, SELF_TRANSFER_SUBCATEGORY_ID } from "../shared/finance.ts";
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
  // Legacy "Refund" categories are not migrated as Types; the Refund Type is a system default
  // with refund behavior so a refund can be tied to its purchase.
  assert(
    taxonomy.filter((type) => type.name === "Refund").every((type) => type.id === "type_refund" && type.behavior === "refund"),
    "The only Refund Type should be the system default with refund behavior."
  );
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

test("creates backup, stores last-backup status, and removes empty backups", async () => {
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
  assert(backups.length === 5, `The five newest backups should be kept, found ${backups.length}.`);
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
  // The estimated-history part grows with the wall clock (more installments are assumed
  // paid as time passes), so assert the invariant rather than a frozen total.
  assert(
    updatedLoan?.interestPaidPaise ===
      (updatedLoan?.estimatedHistoricalInterestPaidPaise ?? 0) + (updatedLoan?.trackedInterestPaidPaise ?? 0),
    "Interest paid should combine estimated history and tracked actual interest."
  );
  assert(
    (updatedLoan?.estimatedHistoricalInterestPaidPaise ?? 0) > 0,
    "A loan that started before tracking should estimate some historical interest."
  );
  assert(
    updatedLoan !== undefined && updatedLoan.monthsLeft !== null && updatedLoan.monthsLeft > 0 &&
      updatedLoan.monthsLeft <= updatedLoan.tenureMonths,
    "Months left should be recalculated from current outstanding and stay within the tenure."
  );
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

  // A refund tied to its purchase (the PVR refund) is described by that purchase, so it is
  // not something left to categorize.
  assert(uncategorized.length === 3, `Three uncategorized transactions should be present, got ${uncategorized.length}.`);
  assert(!uncategorized.some((item) => item.linkedTransactionId), "A linked refund is never uncategorized.");
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
  // 60% used a third of the way in is flagged. Whether it reads "Watch" or "Likely to exceed"
  // depends on how groceries usually run for the rest of the month.
  assert(
    groceryLine.status === "critical" || groceryLine.status === "watch",
    `Fast spending should be flagged before crossing the line, got ${groceryLine.status}.`
  );
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

test("attributes a split vacation expense across its subtypes", async () => {
  assert(state.bankId, "Bank should exist.");
  const trip = services.createVacation({ name: "QA Split Trip" });
  const grocSub = subcategoryId("Expense", "Groceries");
  const diningSub = subcategoryId("Expense", "Dining/Food");
  services.createTransaction({
    date: "2026-06-02",
    accountId: state.bankId,
    method: "upi",
    merchant: "Goa combined bill",
    typeId: typeId("Expense"),
    amountPaise: 10_000_00,
    direction: "outflow",
    kind: "expense",
    vacationId: trip.id,
    splits: [
      { subcategoryId: grocSub, amountPaise: 6_000_00 },
      { subcategoryId: diningSub, amountPaise: 4_000_00 }
    ]
  });

  const summary = services.listVacations(true).find((item) => item.id === trip.id);
  assert(summary, "Split trip should be listed.");
  assert(summary!.totalSpentPaise === 10_000_00, "Trip total should be the full split amount.");
  assert(summary!.transactionCount === 1, "A split is a single tagged transaction.");
  const groc = summary!.breakdown.find((row) => row.subcategoryId === grocSub);
  const dining = summary!.breakdown.find((row) => row.subcategoryId === diningSub);
  assert(
    groc?.amountPaise === 6_000_00 && dining?.amountPaise === 4_000_00,
    "Each split amount should land on its own SubType, not 'Uncategorized'."
  );
  assert(
    summary!.breakdown.reduce((sum, row) => sum + row.amountPaise, 0) === summary!.totalSpentPaise,
    "The breakdown must sum to the trip total."
  );
  services.deleteVacation(trip.id);
});

test("re-typing a vacation-tagged expense to a non-expense drops the tag without error", async () => {
  assert(state.bankId, "Bank should exist.");
  const trip = services.createVacation({ name: "QA Retag Trip" });
  const txn = services.createTransaction({
    date: "2026-07-02",
    accountId: state.bankId,
    method: "upi",
    merchant: "trip food",
    typeId: typeId("Expense"),
    subcategoryId: subcategoryId("Expense", "Groceries"),
    amountPaise: 5_000_00,
    direction: "outflow",
    kind: "expense",
    vacationId: trip.id
  });
  assert(
    services.listVacations(true).find((item) => item.id === trip.id)!.totalSpentPaise === 5_000_00,
    "Tagged expense should count on the trip."
  );

  // Change the Type to Income WITHOUT clearing vacationId in the patch — the server must
  // drop the tag rather than reject the update with a validation error.
  services.updateTransaction(txn.transaction.id, {
    typeId: typeId("Income"),
    subcategoryId: subcategoryId("Income", "Salary"),
    direction: "inflow",
    kind: "income"
  });
  assert(
    services.listVacations(true).find((item) => item.id === trip.id)!.totalSpentPaise === 0,
    "The re-typed transaction should no longer be tagged to the trip."
  );
  services.deleteVacation(trip.id);
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
  services.createInvestment({
    type: "fd",
    name: `QA Wealth FD ${suffix}`,
    investedPaise: 2_00_000_00,
    currentValuePaise: 2_00_000_00
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
  const fd = before.allocation.find((segment) => segment.key === "fd");
  assert(equity && equity.valuePaise >= 1_50_000_00, "Equity allocation should include the stock's current value.");
  assert(gold && gold.valuePaise === 60_000_00, "Gold allocation should equal the gold holding value.");
  assert(fd && fd.valuePaise >= 2_00_000_00, "Fixed deposits must appear in the asset allocation.");
  // Every investment type must land in some allocation bucket — the non-cash segments
  // should sum to the total invested value, so no holding is silently dropped.
  const nonCashAllocation = before.allocation
    .filter((segment) => segment.key !== "cash")
    .reduce((sum, segment) => sum + segment.valuePaise, 0);
  assert(
    nonCashAllocation === before.netWorth.investmentsPaise,
    "Allocation segments must cover every investment type (sum equals total investments)."
  );

  // Snapshot persisted and reflected in history for the current month.
  assert(before.history.length >= 1, "A net-worth snapshot should be recorded for the current month.");
  assert(
    before.history[before.history.length - 1].netWorthPaise === before.netWorth.netWorthPaise,
    "The latest history point should equal the live net worth."
  );

  assert(
    before.cashflow.incomePaise > 0
      ? typeof before.cashflow.savingsRatePercent === "number"
      : before.cashflow.savingsRatePercent === null,
    "Savings rate should be a number when there is inflow, and undefined when there is none."
  );
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

test("credit-card payments settle a balance and never count as outflow", async () => {
  const suffix = Date.now().toString().slice(-5);
  const bank = services.createAccount({
    name: `QA Card Bank ${suffix}`,
    type: "bank",
    startingBalancePaise: 1_00_000_00
  });
  const card = services.createAccount({
    name: `QA Card ${suffix}`,
    type: "credit_card",
    startingBalancePaise: 0,
    creditLimitPaise: 1_00_000_00
  });

  // Charge the card — this is the real spending and must be counted once.
  services.createTransaction({
    date: "2026-09-12",
    accountId: card.id,
    method: "credit_card",
    typeId: typeId("Expense"),
    subcategoryId: subcategoryId("Expense", "Groceries"),
    amountPaise: 5_000_00,
    direction: "outflow",
    kind: "expense"
  });

  const beforePayment = services.getMonthlyReport(undefined, "2026-09");

  // Paying the card bill only moves money to settle that charge.
  services.createTransaction({
    date: "2026-09-13",
    accountId: bank.id,
    method: "bank_transfer",
    typeId: typeId("Credit Card Payment"),
    amountPaise: 5_000_00,
    direction: "outflow",
    kind: "card_payment",
    transferAccountId: card.id
  });

  const afterPayment = services.getMonthlyReport(undefined, "2026-09");
  assert(
    afterPayment.totalOutflowPaise === beforePayment.totalOutflowPaise,
    "A card payment must not add to outflow — the charge was already counted."
  );
  assert(
    !afterPayment.types.some((type) => type.behavior === "card_payment"),
    "Card payments must not appear as a report line."
  );

  // Balances still move: the bank pays out and the card balance clears.
  const accounts = services.listAccounts();
  assert(
    accounts.find((account) => account.id === bank.id)?.balancePaise === 95_000_00,
    "The paying bank account should drop by the payment."
  );
  assert(
    accounts.find((account) => account.id === card.id)?.outstandingPaise === 0,
    "The card outstanding should be cleared by the payment."
  );
});

test("overview cashflow inflow matches the reports inflow rule (income + refund)", async () => {
  const suffix = Date.now().toString().slice(-5);
  const bank = services.createAccount({
    name: `QA Inflow Bank ${suffix}`,
    type: "bank",
    startingBalancePaise: 10_000_00
  });
  const refundType = services.createCategoryType({
    name: `QA Cashback ${suffix}`,
    behavior: "refund",
    icon: "rotate-ccw",
    color: "#059669"
  });
  const refundSub = services.createSubcategory({
    typeId: refundType.id,
    name: `QA Cashback Sub ${suffix}`,
    icon: "rotate-ccw",
    color: "#059669"
  });

  // A standalone refund (not linked to an original expense) is money coming in.
  services.createTransaction({
    date: "2026-09-14",
    accountId: bank.id,
    method: "bank_transfer",
    typeId: refundType.id,
    subcategoryId: refundSub.id,
    amountPaise: 2_000_00,
    direction: "inflow",
    kind: "refund"
  });

  const report = services.getMonthlyReport(undefined, "2026-09");
  const reportsInflow = report.types
    .filter((type) => INFLOW_BEHAVIORS.has(type.behavior))
    .reduce((sum, type) => sum + type.amountPaise, 0);

  assert(
    report.totalInflowPaise === reportsInflow,
    "The report's inflow total must equal the sum of its inflow-behaviour types."
  );
  assert(
    report.totalInflowPaise >= 2_000_00,
    "A standalone refund must count towards inflow."
  );
  assert(
    report.totalInflowPaise !== report.incomePaise,
    "Inflow includes refunds, so it should differ from the income-only figure here."
  );
});

test("search totals sum every matching transaction, not just the loaded page", async () => {
  const suffix = Date.now().toString().slice(-5);
  const bank = services.createAccount({
    name: `QA Totals Bank ${suffix}`,
    type: "bank",
    startingBalancePaise: 1_00_000_00
  });
  const keyword = `Bakery${suffix}`;
  for (const amount of [120_00, 245_50, 80_00]) {
    services.createTransaction({
      date: "2026-09-15",
      accountId: bank.id,
      method: "upi",
      merchant: `${keyword} Brown`,
      typeId: typeId("Expense"),
      subcategoryId: subcategoryId("Expense", "Groceries"),
      amountPaise: amount,
      direction: "outflow",
      kind: "expense"
    });
  }
  // A refund from the same shop is money coming back, not spending.
  const refundType = services.createCategoryType({
    name: `QA Totals Refund ${suffix}`,
    behavior: "refund",
    icon: "rotate-ccw",
    color: "#059669"
  });
  const refundSub = services.createSubcategory({
    typeId: refundType.id,
    name: `QA Totals Refund Sub ${suffix}`,
    icon: "rotate-ccw",
    color: "#059669"
  });
  services.createTransaction({
    date: "2026-09-16",
    accountId: bank.id,
    method: "upi",
    merchant: `${keyword} refund`,
    typeId: refundType.id,
    subcategoryId: refundSub.id,
    amountPaise: 50_00,
    direction: "inflow",
    kind: "refund"
  });
  // Unrelated noise that must not be counted.
  services.createTransaction({
    date: "2026-09-16",
    accountId: bank.id,
    method: "upi",
    merchant: `Chemist ${suffix}`,
    typeId: typeId("Expense"),
    subcategoryId: subcategoryId("Expense", "Health"),
    amountPaise: 999_00,
    direction: "outflow",
    kind: "expense"
  });

  const totals = services.summarizeTransactions({ search: keyword });
  assert(totals.count === 4, "All four bakery rows should match the search.");
  assert(totals.outflowPaise === 445_50, "Money out should sum the three purchases (120 + 245.50 + 80).");
  assert(totals.inflowPaise === 50_00, "Money in should hold the refund.");

  // Totals must not depend on paging: a one-row page still reports the full sum.
  const onePage = services.listTransactions({ search: keyword, limit: 1 });
  assert(onePage.length === 1, "The list itself is paged.");
  assert(services.summarizeTransactions({ search: keyword }).count === 4, "Totals ignore paging.");
});

test("search matches SubType names and amounts, and export honours the same filters", async () => {
  const suffix = Date.now().toString().slice(-5);
  const bank = services.createAccount({
    name: `QA Smart Search ${suffix}`,
    type: "bank",
    startingBalancePaise: 1_00_000_00
  });
  const merchant = `Corner${suffix}`;
  services.createTransaction({
    date: "2025-03-04",
    accountId: bank.id,
    method: "upi",
    merchant,
    typeId: typeId("Expense"),
    subcategoryId: subcategoryId("Expense", "Movies"),
    amountPaise: 12_345_67,
    direction: "outflow",
    kind: "expense"
  });

  // A figure copied off a statement, with the rupee sign and grouping commas, still matches.
  const byAmount = services.listTransactions({ search: "₹12,345.67", from: "2025-03-01", to: "2025-03-31" });
  assert(byAmount.some((row) => row.merchant === merchant), "Searching an exact amount should find the transaction.");

  // The SubType name matches even though it isn't in the merchant or note.
  const bySubType = services.listTransactions({ search: "movies", from: "2025-03-01", to: "2025-03-31" });
  assert(bySubType.some((row) => row.merchant === merchant), "Searching a SubType name should find the transaction.");

  const csv = services.exportTransactionsCsv({ search: merchant });
  const dataRows = csv.trim().split("\n").slice(1);
  assert(dataRows.length === 1, "A filtered export should hold only the matching rows.");
  assert(dataRows[0].includes(merchant), "The exported row should be the one that matched.");
});

test("upcoming payments list AutoPay and EMIs due soon, skipping months already paid", async () => {
  assert(state.bankId, "Bank should exist.");
  const suffix = Date.now().toString().slice(-5);
  const subscription = services.createAutopaySubscription({
    name: `QA Upcoming Stream ${suffix}`,
    amountPaise: 649_00,
    startDate: "2027-01-15",
    durationMonths: 12
  });
  const loan = services.createLoan({
    name: `QA Upcoming Loan ${suffix}`,
    subcategoryId: subcategoryId("Loan", "Vehicle"),
    principalAmountPaise: 5_00_000_00,
    startingOutstandingPaise: 5_00_000_00,
    startMonth: "2027-01",
    annualInterestRateBps: 900,
    tenureMonths: 60,
    monthlyEmiPaise: 11_000_00
  });
  services.createTransaction({
    date: "2027-02-20",
    accountId: state.bankId,
    method: "bank_transfer",
    typeId: typeId("Loan"),
    subcategoryId: subcategoryId("Loan", "Vehicle"),
    amountPaise: 11_000_00,
    direction: "outflow",
    kind: "emi",
    loanId: loan.id,
    loanPaymentType: "emi"
  });

  const upcoming = services.getUpcomingPayments(14, "2027-03-10");
  const stream = upcoming.items.find((item) => item.id === subscription.id);
  const emi = upcoming.items.find((item) => item.id === loan.id);
  assert(stream?.dueDate === "2027-03-15" && stream.daysAway === 5, "AutoPay should be due on its billing day.");
  assert(emi?.dueDate === "2027-03-20" && emi.daysAway === 10, "The EMI should follow the last EMI's day.");
  assert(
    upcoming.totalPaise === upcoming.items.reduce((sum, item) => sum + item.amountPaise, 0),
    "The total should add up the listed payments."
  );

  // Paying this month's AutoPay settles it; next month's charge is outside the 14-day window.
  services.createTransaction({
    date: "2027-03-05",
    accountId: state.bankId,
    method: "upi",
    typeId: typeId("Expense"),
    subcategoryId: subcategoryId("Expense", "AutoPay"),
    amountPaise: 649_00,
    direction: "outflow",
    kind: "expense",
    subscriptionId: subscription.id
  });
  const afterPaying = services.getUpcomingPayments(14, "2027-03-10");
  assert(
    !afterPaying.items.some((item) => item.id === subscription.id),
    "A month that already has its AutoPay payment must not show it as due."
  );
});

test("the overview compares a past month against the whole previous month", async () => {
  const suffix = Date.now().toString().slice(-5);
  const bank = services.createAccount({
    name: `QA Compare Bank ${suffix}`,
    type: "bank",
    startingBalancePaise: 1_00_000_00
  });
  for (const [date, amount] of [
    ["2025-05-28", 3_000_00],
    ["2025-06-10", 4_500_00]
  ] as const) {
    services.createTransaction({
      date,
      accountId: bank.id,
      method: "upi",
      typeId: typeId("Expense"),
      subcategoryId: subcategoryId("Expense", "Groceries"),
      amountPaise: amount,
      direction: "outflow",
      kind: "expense"
    });
  }
  const june = services.getOverview(bank.id, "2025-06");
  assert(june.comparison.month === "2025-05", "June should compare against May.");
  assert(!june.comparison.partial && june.comparison.throughDay === 31, "A finished month compares with all of May.");
  assert(june.comparison.outflowPaise === 3_000_00, "May's outflow for this account should be the 28 May purchase.");
});

test("a budget only projects once enough of the month has passed", async () => {
  // Education has no spending history in this database, so this exercises the pace path.
  const suffix = Date.now().toString().slice(-5);
  const bank = services.createAccount({
    name: `QA Projection Bank ${suffix}`,
    type: "bank",
    startingBalancePaise: 1_00_000_00
  });
  services.createBudgetLine({
    month: "2026-12",
    scopeType: "subcategory",
    scopeId: subcategoryId("Expense", "Education"),
    amountPaise: 15_000_00
  });
  services.createTransaction({
    date: "2026-12-01",
    accountId: bank.id,
    method: "upi",
    typeId: typeId("Expense"),
    subcategoryId: subcategoryId("Expense", "Education"),
    amountPaise: 1_000_00,
    direction: "outflow",
    kind: "expense"
  });

  // Day 1: one ordinary purchase must not extrapolate to a month-end blow-out.
  const dayOne = services.getBudgetPlan("2026-12", "2026-12-01").lines[0];
  assert(dayOne.projectedPaise === 1_000_00, "Too early in the month to project — show what was actually spent.");
  assert(dayOne.status !== "critical", "A single day-one purchase must not raise a 'likely to exceed' alarm.");

  // Mid-month the pace is meaningful again, so the projection kicks back in.
  const midMonth = services.getBudgetPlan("2026-12", "2026-12-16").lines[0];
  assert(midMonth.projectedPaise > 1_000_00, "Once the month is underway the budget should project forward.");
});

test("savings rate is undefined when there is no inflow to measure against", async () => {
  assert(
    services.calculateSavingsRatePercent(0, 5_000_00) === null,
    "A 0% savings rate would read as breaking even next to a negative saved figure."
  );
  assert(services.calculateSavingsRatePercent(0, 0) === null, "No inflow and no outflow still has no rate.");
  assert(services.calculateSavingsRatePercent(1_00_000_00, 25_000_00) === 75, "Kept 75,000 of 1,00,000 is 75%.");
  assert(
    services.calculateSavingsRatePercent(1_00_000_00, 1_50_000_00) === -50,
    "Outspending inflow should report a negative rate, not zero."
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

  // 4,000 expense + 3,000 transfer + 2,000 card expense. The 2,000 card payment only
  // settles the card expense already counted above, so it must not be added again.
  assert(report.totalOutflowPaise === 9_000_00, "Outflow should add up every non-inflow type once.");
  assert(
    !report.types.some((type) => type.behavior === "card_payment"),
    "A card payment must not appear as its own outflow line."
  );
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

// ---- Principal-PM review: gaps found in the full-app audit ----

function hasTaxonomyId(id: string) {
  return services.listCategoryTypes().some((type) => type.id === id || type.subcategories.some((sub) => sub.id === id));
}

test("defaults cover rent, bills, insurance, education, personal care and refunds", async () => {
  const expense = services.listCategoryTypes().find((type) => type.id === "type_expense");
  const names = new Set(expense?.subcategories.map((sub) => sub.name));
  for (const name of ["Rent", "Bills & Utilities", "Insurance", "Education", "Personal care"]) {
    assert(names.has(name), `Expense should include a ${name} SubType by default.`);
  }
  const refund = services.listCategoryTypes().find((type) => type.id === "type_refund");
  assert(refund?.behavior === "refund" && refund.subcategories.length === 0, "A Refund type with refund behavior should exist.");
  assert(refund.isLocked, "The Refund type powers the Refund button, so it must be locked.");
  await assertRejectsWithMessage("delete refund type", () => services.deleteCategoryType("type_refund"), "locked");
});

test("deleted defaults stay deleted after a restart while new defaults arrive once", () => {
  services.deleteSubcategory("sub_entertainment");
  dbModule.initDatabase();
  assert(!hasTaxonomyId("sub_entertainment"), "A deleted default must not come back on restart.");

  // A database from before the seeded-defaults ledger, missing a newly shipped default.
  services.deleteSubcategory("sub_personal_care");
  dbModule.db.prepare("DELETE FROM settings WHERE key = 'seeded_default_taxonomy_ids'").run();
  dbModule.initDatabase();
  assert(hasTaxonomyId("sub_personal_care"), "A newly shipped default should reach an existing database.");
  assert(!hasTaxonomyId("sub_entertainment"), "An original default the user deleted stays deleted on upgrade.");

  services.deleteSubcategory("sub_personal_care");
  dbModule.initDatabase();
  assert(!hasTaxonomyId("sub_personal_care"), "Once delivered and deleted, a new default stays deleted.");
});

test("backups follow a custom database and keep daily history", async () => {
  const backupFiles = await import("../server/backup-files.ts");
  assert(
    backupFiles.resolveBackupDir({ FINANCE_DB_PATH: "/tmp/qa-copy/app.db" }, "/project") === path.join("/tmp/qa-copy", "backups"),
    "A custom database path should keep its backups beside it."
  );
  assert(
    backupFiles.resolveBackupDir({}, "/project") === path.join("/project", "backups"),
    "The default database keeps backups in <project>/backups."
  );
  assert(
    backupFiles.resolveBackupDir({ FINANCE_BACKUP_DIR: "/b", FINANCE_DB_PATH: "/tmp/x.db" }, "/project") === "/b",
    "An explicit backup folder always wins."
  );

  const dir = path.join(tmpdir(), `finance-tracker-retention-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const now = new Date(2030, 5, 15, 12, 0).getTime();
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  const make = (name: string, mtime: number) => {
    const file = path.join(dir, name);
    writeFileSync(file, "x");
    utimesSync(file, mtime / 1000, mtime / 1000);
  };
  for (let k = 0; k < 6; k += 1) make(`finance-2030-06-15T0${k}-00-00-000Z.db`, now - k * 10 * 60 * 1000);
  for (let d = 1; d <= 9; d += 1) make(`finance-2030-06-${String(15 - d).padStart(2, "0")}T12-00-00-000Z.db`, now - d * day + hour);

  backupFiles.pruneBackupFiles(dir, 5, 7, now);
  const kept = new Set(readdirSync(dir));
  assert(kept.size === 12, `Expected 5 newest + 7 daily backups, kept ${kept.size}.`);
  assert(!kept.has("finance-2030-06-15T05-00-00-000Z.db"), "The sixth backup of the same day should be pruned.");
  for (let d = 1; d <= 7; d += 1) {
    assert(kept.has(`finance-2030-06-${String(15 - d).padStart(2, "0")}T12-00-00-000Z.db`), `Day -${d} should keep a backup.`);
  }
  assert(!kept.has("finance-2030-06-07T12-00-00-000Z.db"), "Backups older than a week fall back to the newest-count rule.");
});

test("backfilled EMIs are not double counted in loan history", () => {
  assert(state.bankId, "Bank should exist.");
  const emiPaise = 16_607_00;
  const loan = services.createLoan({
    name: "QA Backfilled Car Loan",
    subcategoryId: subcategoryId("Loan", "Vehicle"),
    principalAmountPaise: 8_00_000_00,
    startingOutstandingPaise: 7_00_000_00,
    startMonth: "2025-04",
    annualInterestRateBps: 900,
    tenureMonths: 60,
    monthlyEmiPaise: emiPaise
  });
  for (const date of ["2026-01-07", "2026-02-07", "2026-03-07"]) {
    services.createTransaction({
      date,
      accountId: state.bankId,
      method: "bank_transfer",
      merchant: "QA backfilled EMI",
      typeId: typeId("Loan"),
      subcategoryId: subcategoryId("Loan", "Vehicle"),
      amountPaise: emiPaise,
      direction: "outflow",
      kind: "emi",
      loanId: loan.id,
      loanPaymentType: "emi"
    });
  }
  const summary = services.listLoans(true).find((item) => item.id === loan.id);
  assert(summary, "Loan should be listed.");
  // Apr 2025 – Dec 2025 are estimated history; Jan–Mar 2026 are the recorded EMIs.
  const historical = 9;
  assert(summary.monthsElapsed === historical + 3, `Months elapsed should be 12, got ${summary.monthsElapsed}.`);
  assert(
    summary.estimatedHistoricalInterestPaidPaise === historical * emiPaise - (8_00_000_00 - 7_00_000_00),
    `Historical interest should cover only the 9 unrecorded months, got ${summary.estimatedHistoricalInterestPaidPaise}.`
  );
  const r = 900 / 10_000 / 12;
  const amortized = Math.ceil(-Math.log(1 - (summary.outstandingPaise * r) / emiPaise) / Math.log(1 + r));
  assert(
    summary.monthsLeft === amortized,
    `Months left should come from the outstanding balance (${amortized}), got ${summary.monthsLeft}.`
  );
});

test("budget projection uses the typical rest of month from recent history", () => {
  // Pure rule: history beats a straight line; pace only without history; whole rupees.
  assert(services.projectBudgetPaise(30_450_00, 60, [1_200_00, 800_00, 1_000_00]) === 31_450_00, "History adds the typical remainder.");
  assert(services.projectBudgetPaise(10_001_50, 60, []) === 16_669_00, "Without history it follows pace, in whole rupees.");
  assert(services.projectBudgetPaise(5_000_00, 10, []) === 5_000_00, "Too early in the month to extrapolate.");
  assert(services.projectBudgetPaise(5_000_00, 100, [9_000_00]) === 5_000_00, "A finished month projects to its actual.");
  assert(services.projectBudgetPaise(5_000_00, 50, [-3_000_00, -1_000_00]) === 5_000_00, "A negative remainder never lowers the projection.");
  assert(services.projectBudgetPaise(5_000_00, 50, [200_00]) === 10_000_00, "One month of history is too thin; follow pace.");

  // End to end: rent paid on the 3rd every month must not be extrapolated to double.
  assert(state.bankId, "Bank should exist.");
  const rentId = subcategoryId("Expense", "Rent");
  for (const date of ["2031-02-03", "2031-03-03", "2031-04-03", "2031-05-03"]) {
    services.createTransaction({
      date,
      accountId: state.bankId,
      method: "bank_transfer",
      merchant: "QA rent",
      typeId: typeId("Expense"),
      subcategoryId: rentId,
      amountPaise: 25_000_00,
      direction: "outflow",
      kind: "expense"
    });
  }
  services.createBudgetLine({ month: "2031-05", scopeType: "subcategory", scopeId: rentId, amountPaise: 26_000_00 });
  const line = services.getBudgetPlan("2031-05", "2031-05-15").lines.find((item) => item.subcategoryId === rentId);
  assert(line?.projectedPaise === 25_000_00, `Rent should project to 25,000, got ${line?.projectedPaise}.`);
  assert(line?.status !== "critical" && line?.status !== "over", "Rent paid in full should not raise an alarm.");
});

test("weekly account impact shows the real direction of a card's outstanding", async () => {
  const { accountImpact } = await import("../src/account-impact.ts");
  const card = { id: "card", type: "credit_card", creditLimitPaise: 2_00_000_00, balancePaise: 0 } as never;
  const bank = { id: "bank", type: "bank", creditLimitPaise: null, balancePaise: 2_16_800_00 } as never;
  const txns = [
    { accountId: "card", direction: "outflow", kind: "expense", amountPaise: 4_100_00 },
    { accountId: "bank", direction: "outflow", kind: "card_payment", transferAccountId: "card", amountPaise: 21_000_00 },
    { accountId: "bank", direction: "outflow", kind: "expense", amountPaise: 3_000_00 },
    { accountId: "bank", direction: "outflow", kind: "expense", amountPaise: 750_00 }
  ] as never[];
  const cardImpact = accountImpact(card, txns);
  assert(cardImpact.amountPaise === 4_100_00 - 21_000_00, `Card outstanding should fall by 16,900, got ${cardImpact.amountPaise}.`);
  assert(cardImpact.isGood && cardImpact.label === "Outstanding movement", "Paying down a card is good news.");
  assert(cardImpact.percentLabel === "8.5% of limit", `Card movement is measured against the limit: ${cardImpact.percentLabel}`);
  const bankImpact = accountImpact(bank, txns);
  const moved = -(21_000_00 + 3_000_00 + 750_00);
  assert(bankImpact.amountPaise === moved && !bankImpact.isGood, "Bank balance should fall by the week's outflows.");
  const expected = `${Math.round((-moved / (2_16_800_00 - moved)) * 1000) / 10}% of balance`;
  assert(bankImpact.percentLabel === expected, `Bank movement compares with the balance before it: ${bankImpact.percentLabel}`);
});

test("the spending mix leaves investments out and reports them as invested", () => {
  assert(state.bankId, "Bank should exist.");
  const base = { accountId: state.bankId, method: "upi" as const, direction: "outflow" as const };
  services.createTransaction({ ...base, date: "2032-02-05", typeId: typeId("Expense"), subcategoryId: subcategoryId("Expense", "Groceries"), amountPaise: 1_000_00, kind: "expense" });
  services.createTransaction({ ...base, date: "2032-02-06", typeId: typeId("Investment"), subcategoryId: subcategoryId("Investment", "Stocks"), amountPaise: 500_00, kind: "investment" });
  const overview = services.getOverview(undefined, "2032-02");
  assert(overview.summary.investedPaise === 500_00, `Invested should be 500, got ${overview.summary.investedPaise}.`);
  assert(overview.summary.spendingPaise === 1_000_00, `Spending should exclude the investment, got ${overview.summary.spendingPaise}.`);
  assert(overview.summary.totalOutflowPaise === 1_500_00, "Outflow still includes the investment.");
  assert(
    !overview.categoryReport.some((category) => category.typeId === typeId("Investment")),
    "No investment line should appear in the spending mix."
  );
});

test("a linked refund nets out of its purchase and cannot exceed it", async () => {
  assert(state.cardId, "Card should exist.");
  const outstanding = () => services.listAccounts().find((account) => account.id === state.cardId)?.outstandingPaise ?? 0;
  const purchase = services.createTransaction({
    date: "2032-03-08",
    accountId: state.cardId,
    method: "credit_card",
    merchant: "QA headphones",
    typeId: typeId("Expense"),
    subcategoryId: subcategoryId("Expense", "Shopping"),
    amountPaise: 5_499_00,
    direction: "outflow",
    kind: "expense"
  }).transaction;
  assert(purchase, "Purchase should be created.");
  const before = outstanding();
  const refund = (amountPaise: number) =>
    services.createTransaction({
      date: "2032-03-12",
      accountId: state.cardId as string,
      method: "credit_card",
      merchant: "QA headphones refund",
      typeId: "type_refund",
      amountPaise,
      direction: "inflow",
      kind: "refund",
      linkedTransactionId: purchase.id
    }).transaction;
  const first = refund(2_000_00);
  assert(first?.status === "categorized", `A linked refund is categorized, got ${first?.status}.`);
  assert(outstanding() === before - 2_000_00, "A card refund lowers the outstanding.");
  const report = services.getMonthlyReport(undefined, "2032-03");
  const shopping = report.categories.find((category) => category.subcategoryId === subcategoryId("Expense", "Shopping"));
  assert(shopping?.amountPaise === 3_499_00, `Shopping should net to 3,499, got ${shopping?.amountPaise}.`);
  assert(report.totalInflowPaise === 0, "A linked refund is not income.");
  await assertRejectsWithMessage("over-refund", () => refund(4_000_00), "Refunds can't add up to more than was paid");
  refund(3_499_00);
  await assertRejectsWithMessage("refund after full refund", () => refund(1_00), "already been fully refunded");
  assert(
    services.getTransaction(purchase.id)?.refundedPaise === 5_499_00,
    "The purchase should report how much of it has been refunded."
  );

  const split = services.createTransaction({
    date: "2032-03-14",
    accountId: state.cardId,
    method: "credit_card",
    merchant: "QA split basket",
    typeId: typeId("Expense"),
    amountPaise: 3_000_00,
    direction: "outflow",
    kind: "expense",
    splits: [
      { subcategoryId: subcategoryId("Expense", "Groceries"), amountPaise: 2_000_00 },
      { subcategoryId: subcategoryId("Expense", "Shopping"), amountPaise: 1_000_00 }
    ]
  }).transaction;
  await assertRejectsWithMessage(
    "refund of a split",
    () =>
      services.createTransaction({
        date: "2032-03-15",
        accountId: state.cardId as string,
        method: "credit_card",
        typeId: "type_refund",
        amountPaise: 500_00,
        direction: "inflow",
        kind: "refund",
        linkedTransactionId: split?.id
      }),
    "split transaction can't take a linked refund"
  );
});

test("a month can copy last month's budget without duplicates", () => {
  const groceries = subcategoryId("Expense", "Groceries");
  const transport = subcategoryId("Expense", "Transport");
  services.createBudgetLine({ month: "2032-04", scopeType: "subcategory", scopeId: groceries, amountPaise: 12_000_00 });
  services.createBudgetLine({ month: "2032-04", scopeType: "subcategory", scopeId: transport, amountPaise: 3_000_00 });
  services.createBudgetLine({ month: "2032-05", scopeType: "subcategory", scopeId: groceries, amountPaise: 15_000_00 });
  const result = services.copyBudgetFromPreviousMonth("2032-05");
  assert(result.copiedCount === 1 && result.skippedCount === 1, `Expected 1 copied and 1 skipped, got ${JSON.stringify(result)}.`);
  const lines = services.getBudgetPlan("2032-05", "2032-05-01").lines;
  assert(lines.find((line) => line.subcategoryId === groceries)?.amountPaise === 15_000_00, "An existing line keeps its amount.");
  assert(lines.find((line) => line.subcategoryId === transport)?.amountPaise === 3_000_00, "A missing line is copied.");
  assert(services.copyBudgetFromPreviousMonth("2032-05").copiedCount === 0, "Copying twice adds nothing.");
});

test("correcting a starting balance shifts the balance by the same amount", () => {
  const account = services.createAccount({ name: "QA Reconcile Bank", type: "bank", startingBalancePaise: 10_000_00 });
  services.createTransaction({
    date: "2032-06-02",
    accountId: account.id,
    method: "upi",
    typeId: typeId("Expense"),
    subcategoryId: subcategoryId("Expense", "Groceries"),
    amountPaise: 1_000_00,
    direction: "outflow",
    kind: "expense"
  });
  const balance = () => services.listAccounts().find((item) => item.id === account.id)?.balancePaise;
  assert(balance() === 9_000_00, "Balance before the correction.");
  const updated = services.updateAccount(account.id, { startingBalancePaise: 12_500_00 });
  assert(updated.startingBalancePaise === 12_500_00, "The starting balance should be stored.");
  assert(balance() === 11_500_00, `Balance should move by the +2,500 correction, got ${balance()}.`);
});

test("the transaction list filters to uncategorized rows", () => {
  assert(state.bankId, "Bank should exist.");
  const base = { accountId: state.bankId, method: "upi" as const, direction: "outflow" as const, kind: "expense" as const };
  services.createTransaction({ ...base, date: "2032-07-03", merchant: "QA mystery UPI", amountPaise: 321_00 });
  services.createTransaction({ ...base, date: "2032-07-04", merchant: "QA known shop", typeId: typeId("Expense"), subcategoryId: subcategoryId("Expense", "Groceries"), amountPaise: 400_00 });
  const query = { status: "uncategorized", from: "2032-07-01", to: "2032-07-31" };
  const rows = services.listTransactions(query);
  assert(rows.length === 1 && rows[0].merchant === "QA mystery UPI", "Only the uncategorized row should be listed.");
  assert(services.summarizeTransactions(query).count === 1, "Totals should use the same filter.");
  const csv = services.exportTransactionsCsv(query);
  assert(csv.includes("QA mystery UPI") && !csv.includes("QA known shop"), "Export should use the same filter.");
});

// ---- Linked SIPs grow a mutual fund's Invested and Current value ----

function isoDaysFromToday(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function logSip(investmentId: string, date: string, amountPaise: number) {
  assert(state.bankId, "Bank should exist.");
  const created = services.createTransaction({
    date,
    accountId: state.bankId,
    method: "bank_transfer",
    merchant: "QA SIP",
    typeId: typeId("Investment"),
    subcategoryId: subcategoryId("Investment", "Mutual Funds"),
    amountPaise,
    direction: "outflow",
    kind: "investment",
    investmentId
  }).transaction;
  assert(created, "SIP should be created.");
  return created.id;
}

function holding(id: string) {
  const item = services.listInvestments().find((investment) => investment.id === id);
  assert(item, "Holding should be listed.");
  return item;
}

test("linked SIPs after the entered figures grow invested and current value once", () => {
  const fund = services.createInvestment({
    type: "mutual_funds",
    name: "QA Flexi Cap SIP",
    investedPaise: 1_20_000_00,
    currentValuePaise: 1_38_500_00
  });
  // Already in the entered figures: a backfilled SIP from last month and one from today.
  logSip(fund.id, isoDaysFromToday(-30), 10_000_00);
  logSip(fund.id, isoDaysFromToday(0), 10_000_00);
  let item = holding(fund.id);
  assert(item.investedPaise === 1_20_000_00 && item.currentValuePaise === 1_38_500_00, "SIPs up to today are already in the entered figures.");
  assert(item.sipsSinceCount === 0, "Nothing should be counted as added yet.");

  logSip(fund.id, isoDaysFromToday(1), 10_000_00);
  logSip(fund.id, isoDaysFromToday(32), 5_000_00);
  item = holding(fund.id);
  assert(item.investedPaise === 1_35_000_00, `Invested should grow by 15,000, got ${item.investedPaise}.`);
  assert(item.currentValuePaise === 1_53_500_00, `Current value should grow by 15,000, got ${item.currentValuePaise}.`);
  assert(item.gainPaise === 18_500_00, "A SIP buys units worth what was paid, so the gain is unchanged.");
  assert(item.sipsSinceCount === 2 && item.sipsSincePaise === 15_000_00, "The card should know 2 SIPs worth 15,000 were added.");
  assert(item.enteredInvestedPaise === 1_20_000_00, "The entered figure is kept separately.");
});

test("editing a holding resets only the figure that changed", () => {
  const fund = services.createInvestment({
    type: "mutual_funds",
    name: "QA Index SIP",
    investedPaise: 50_000_00,
    currentValuePaise: 55_000_00
  });
  // Entered 60 days ago; one SIP has run since.
  const enteredOn = isoDaysFromToday(-60);
  dbModule.db
    .prepare("UPDATE investments SET invested_as_of = ?, value_as_of = ? WHERE id = ?")
    .run(enteredOn, enteredOn, fund.id);
  logSip(fund.id, isoDaysFromToday(-30), 5_000_00);
  const before = holding(fund.id);
  assert(before.investedPaise === 55_000_00 && before.currentValuePaise === 60_000_00, "SIP counted before editing.");

  // Saving the form unchanged (it shows the grown figures) must not change anything.
  services.updateInvestment(fund.id, {
    name: "QA Index SIP (renamed)",
    investedPaise: before.investedPaise,
    currentValuePaise: before.currentValuePaise
  });
  const unchanged = holding(fund.id);
  assert(unchanged.investedPaise === 55_000_00 && unchanged.currentValuePaise === 60_000_00, "An unchanged save keeps the SIP.");
  assert(unchanged.sipsSinceCount === 1 && unchanged.investedAsOf === enteredOn, "An unchanged save keeps the SIP baseline.");

  // Today's statement value already includes last month's SIP; Invested is left alone.
  services.updateInvestment(fund.id, { currentValuePaise: 62_000_00 });
  const revalued = holding(fund.id);
  assert(revalued.currentValuePaise === 62_000_00, `The typed value should stand as is, got ${revalued.currentValuePaise}.`);
  assert(revalued.valueAsOf === isoDaysFromToday(0), "The value baseline moves to today.");
  assert(revalued.investedPaise === 55_000_00 && revalued.investedAsOf === enteredOn, "Invested still counts the SIP.");

  logSip(fund.id, isoDaysFromToday(1), 5_000_00);
  const later = holding(fund.id);
  assert(later.currentValuePaise === 67_000_00 && later.investedPaise === 60_000_00, "A later SIP lifts both figures again.");
});

test("SIP growth follows deletes, feeds net worth and works for older holdings", () => {
  const fund = services.createInvestment({
    type: "mutual_funds",
    name: "QA Older Fund",
    investedPaise: 10_000_00,
    currentValuePaise: 11_000_00
  });
  // A holding from before this change has no as-of dates and was added some time ago.
  dbModule.db
    .prepare("UPDATE investments SET invested_as_of = NULL, value_as_of = NULL, created_at = '2026-01-10 06:00:00' WHERE id = ?")
    .run(fund.id);
  const worthBefore = services.getWealthSummary().netWorth.investmentsPaise;
  logSip(fund.id, "2026-01-05", 1_000_00);
  const sipId = logSip(fund.id, "2026-02-05", 2_000_00);
  const item = holding(fund.id);
  assert(item.investedAsOf === "2026-01-10", `An older holding counts from the day it was added, got ${item.investedAsOf}.`);
  assert(item.investedPaise === 12_000_00 && item.currentValuePaise === 13_000_00, "Only the SIP after it was added counts.");
  assert(
    services.getWealthSummary().netWorth.investmentsPaise === worthBefore + 2_000_00,
    "Net worth should use the grown current value."
  );
  services.deleteTransaction(sipId);
  const after = holding(fund.id);
  assert(after.investedPaise === 10_000_00 && after.currentValuePaise === 11_000_00, "Deleting the SIP takes it back out.");
});

// ---- Loan logic review ----

function currentMonthIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonthIso(month: string, count: number) {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(year, index - 1 + count, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function payEmi(loanId: string, date: string, amountPaise: number, subName = "Personal", type: "emi" | "prepayment" = "emi") {
  assert(state.bankId, "Bank should exist.");
  return services.createTransaction({
    date,
    accountId: state.bankId,
    method: "bank_transfer",
    merchant: "QA loan payment",
    typeId: typeId("Loan"),
    subcategoryId: subcategoryId("Loan", subName),
    amountPaise,
    direction: "outflow",
    kind: "emi",
    loanId,
    loanPaymentType: type
  });
}

test("suggested EMI matches the reducing-balance formula", async () => {
  const { calculateEmiPaise } = await import("../shared/finance.ts");
  const P = 8_00_000_00;
  const r = 900 / 10_000 / 12;
  const expected = Math.ceil(Math.round((P * r * (1 + r) ** 60) / ((1 + r) ** 60 - 1)) / 100) * 100;
  assert(calculateEmiPaise(P, 900, 60) === expected, `EMI for 8L at 9% over 60 months should be ${expected}.`);
  assert(calculateEmiPaise(P, 900, 60) === 16_607_00, "It should be the ₹16,607 banks quote for 8L at 9% over 5 years.");
  assert(calculateEmiPaise(1_20_000_00, 0, 12) === 10_000_00, "A zero-interest loan divides evenly.");
  assert(calculateEmiPaise(0, 900, 12) === 0 && calculateEmiPaise(1_000_00, 900, 0) === 0, "Missing inputs give no suggestion.");
});

test("an EMI that cannot cover the interest is refused up front", async () => {
  const terms = {
    name: "QA Underwater Loan",
    subcategoryId: subcategoryId("Loan", "Personal"),
    principalAmountPaise: 10_00_000_00,
    startingOutstandingPaise: 10_00_000_00,
    startMonth: "2026-01",
    annualInterestRateBps: 1200,
    tenureMonths: 60,
    monthlyEmiPaise: 9_000_00
  };
  await assertRejectsWithMessage("create with EMI below interest", () => services.createLoan(terms), "doesn't cover the ₹10,000 monthly interest");
  const ok = services.createLoan({ ...terms, name: "QA Healthy Loan", monthlyEmiPaise: 22_300_00 });
  await assertRejectsWithMessage(
    "edit rate so EMI no longer covers interest",
    () => services.updateLoan(ok.id, { annualInterestRateBps: 3000 }),
    "doesn't cover"
  );
});

test("a final EMI above the payoff closes the loan", async () => {
  const loan = services.createLoan({
    name: "QA Nearly Done Loan",
    subcategoryId: subcategoryId("Loan", "Personal"),
    principalAmountPaise: 2_00_000_00,
    startingOutstandingPaise: 12_000_00,
    startMonth: "2023-01",
    annualInterestRateBps: 1200,
    tenureMonths: 36,
    monthlyEmiPaise: 6_643_00
  });
  payEmi(loan.id, "2026-01-05", 6_643_00);
  const mid = services.listLoans(true).find((item) => item.id === loan.id);
  assert(mid && mid.outstandingPaise === 12_000_00 - (6_643_00 - 120_00), "First EMI: 120 interest on 12,000, the rest principal.");
  // Payoff is now about 5,531.77; the regular EMI of 6,643 must still be accepted and close it.
  payEmi(loan.id, "2026-02-05", 6_643_00);
  const closed = services.listLoans(true).find((item) => item.id === loan.id);
  assert(closed?.outstandingPaise === 0, `The final EMI should close the loan, left ${closed?.outstandingPaise}.`);
  assert(closed.monthsLeft === 0 && closed.closureMonth === null, "A closed loan has no months left or closure month.");
  assert(closed.principalPaidPaise === 2_00_000_00, "All the principal is repaid.");

  const other = services.createLoan({
    name: "QA Overpaid Loan",
    subcategoryId: subcategoryId("Loan", "Personal"),
    principalAmountPaise: 50_000_00,
    startingOutstandingPaise: 5_000_00,
    startMonth: "2025-01",
    annualInterestRateBps: 1200,
    tenureMonths: 12,
    monthlyEmiPaise: 4_443_00
  });
  await assertRejectsWithMessage("overpay beyond an EMI", () => payEmi(other.id, "2026-03-05", 9_000_00), "The payoff on this loan is about ₹5,050");
});

test("months left and closure month follow the balance and this month's EMI", () => {
  // Contract says it should be over, but money is still owed: months left must come from the balance.
  const loan = services.createLoan({
    name: "QA Overrun Loan",
    subcategoryId: subcategoryId("Loan", "Home"),
    principalAmountPaise: 5_00_000_00,
    startingOutstandingPaise: 1_00_000_00,
    startMonth: "2019-01",
    annualInterestRateBps: 900,
    tenureMonths: 60,
    monthlyEmiPaise: 10_000_00
  });
  const r = 900 / 10_000 / 12;
  const expectedLeft = (outstanding: number) => Math.ceil(-Math.log(1 - (outstanding * r) / 10_000_00) / Math.log(1 + r));
  const before = services.listLoans(true).find((item) => item.id === loan.id);
  assert(before?.monthsLeft === expectedLeft(1_00_000_00), `Expected ${expectedLeft(1_00_000_00)} months left, got ${before?.monthsLeft}.`);
  // Nothing paid this month: the remaining EMIs start this month.
  assert(
    before.closureMonth === shiftMonthIso(currentMonthIso(), before.monthsLeft - 1),
    `Closure should be ${shiftMonthIso(currentMonthIso(), before.monthsLeft - 1)}, got ${before.closureMonth}.`
  );
  payEmi(loan.id, `${currentMonthIso()}-01`, 10_000_00, "Home");
  const after = services.listLoans(true).find((item) => item.id === loan.id);
  assert(after?.monthsLeft === expectedLeft(after.outstandingPaise), "Months left follows the new balance.");
  assert(
    after.closureMonth === shiftMonthIso(currentMonthIso(), after.monthsLeft),
    `With this month paid, the remaining EMIs start next month: expected ${shiftMonthIso(currentMonthIso(), after.monthsLeft)}, got ${after.closureMonth}.`
  );
});

test("archived loans with a balance still count as owed", () => {
  const owed = services.createLoan({
    name: "QA Archived But Owed",
    subcategoryId: subcategoryId("Loan", "Other"),
    principalAmountPaise: 1_00_000_00,
    startingOutstandingPaise: 40_000_00,
    startMonth: "2025-06",
    annualInterestRateBps: 1000,
    tenureMonths: 24,
    monthlyEmiPaise: 4_700_00
  });
  const before = services.getWealthSummary().netWorth.liabilitiesPaise;
  services.archiveLoan(owed.id);
  assert(services.getWealthSummary().netWorth.liabilitiesPaise === before, "Archiving must not make a debt disappear.");
  services.updateLoan(owed.id, { startingOutstandingPaise: 0 });
  assert(
    services.getWealthSummary().netWorth.liabilitiesPaise === before - 40_000_00,
    "A paid-off archived loan no longer counts."
  );
});

test("bonds are an investment type with their own allocation slice", () => {
  const bond = services.createInvestment({ type: "bonds", name: "QA RBI Floating Rate Bond", investedPaise: 1_00_000_00, currentValuePaise: 1_03_150_00 });
  assert(bond.type === "bonds" && bond.typeLabel === "Bonds", "A bond holding should be stored with its label.");
  const slice = services.getWealthSummary().allocation.find((segment) => segment.key === "bonds");
  assert(slice?.label === "Bonds" && slice.valuePaise >= 1_03_150_00, "Bonds should get their own allocation slice.");
  const table = dbModule.db.prepare("SELECT sql FROM sqlite_master WHERE name = 'investments'").get() as { sql: string };
  assert(table.sql.includes("'bonds'"), "The investments table should accept bonds.");
});

test("whole-rupee headline figures round and never show paise", () => {
  const cases: Array<[number, string]> = [
    [1_23_456_49, "₹1,23,456"],
    [1_23_456_50, "₹1,23,457"],
    [99, "₹1"],
    [0, "₹0"],
    [-4_56_78, "-₹457"],
    [10_00_00_000_00, "₹10,00,00,000"]
  ];
  for (const [paise, expected] of cases) {
    const shown = formatINRWhole(paise).replace(/\u00a0/g, " ");
    assert(shown === expected, `formatINRWhole(${paise}) should be ${expected}, got ${shown}`);
    assert(!/\.\d/.test(shown), `formatINRWhole(${paise}) must not show paise`);
  }
  assert(formatINR(1_23_456_49).endsWith(".49"), "Row figures keep their paise.");
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
