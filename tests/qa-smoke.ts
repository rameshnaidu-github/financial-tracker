import { existsSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import ExcelJS from "exceljs";

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

test("removes accounts by deleting unused records and archiving accounts with history", () => {
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
  const archived = services.listAccounts().find((account) => account.id === used.id);

  assert(usedResult.mode === "archived", "Used account should be archived.");
  assert(archived?.isArchived, "Archived account should remain for history.");

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
