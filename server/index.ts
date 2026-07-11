import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import { initDatabase } from "./db.ts";
import { isTrustedRequestOrigin, securityHeaders } from "./security.ts";
import {
  createAccount,
  createAutopaySubscription,
  createBackup,
  createCategoryType,
  createLoan,
  createSubcategory,
  createTransaction,
  archiveAutopaySubscription,
  archiveLoan,
  deleteAccount,
  deleteCategoryType,
  deleteSubcategory,
  deleteTransaction,
  buildImportTemplate,
  exportTransactionsCsv,
  getBackupStatus,
  getCurrentBatch,
  getMonthlyReport,
  getOverview,
  getProfile,
  getSettings,
  importTransactionsWorkbook,
  listAccounts,
  listAutopaySubscriptions,
  listCategoryTypes,
  listLoans,
  listTransactions,
  saveBatch,
  startAutoBackup,
  stopAutoBackup,
  updateAccount,
  updateAutopaySubscription,
  updateLoan,
  updateProfile,
  updateTransaction
} from "./services.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../dist");
const app = Fastify({ logger: true });

initDatabase();
startAutoBackup(app.log);

app.addHook("onRequest", async (request, reply) => {
  if (!isTrustedRequestOrigin(request.headers.origin, request.headers.host)) {
    return reply.status(403).send({ error: "Cross-origin requests are not allowed." });
  }
});

app.addHook("onSend", async (_request, reply) => {
  for (const [name, value] of Object.entries(securityHeaders)) {
    reply.header(name, value);
  }
});

await app.register(multipart, {
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1
  }
});

app.setErrorHandler((error, request, reply) => {
  request.log.error(error);

  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: "Validation error",
      details: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    });
  }

  const handledError = error as Error & { statusCode?: number };
  const statusCode = typeof handledError.statusCode === "number" ? handledError.statusCode : 500;
  return reply.status(statusCode).send({
    error: statusCode === 500 ? "Internal server error" : handledError.message
  });
});

app.get("/api/health", async () => ({ ok: true }));

app.get("/api/bootstrap", async () => ({
  settings: getSettings(),
  profile: getProfile(),
  accounts: listAccounts(),
  categoryTypes: listCategoryTypes(),
  loans: listLoans(true),
  subscriptions: listAutopaySubscriptions(true)
}));

app.get("/api/profile", async () => getProfile());

app.patch("/api/profile", async (request) => updateProfile(request.body as never));

app.get("/api/overview", async (request) => {
  const query = request.query as { accountId?: string; month?: string };
  return getOverview(blankToUndefined(query.accountId), query.month);
});

app.get("/api/accounts", async () => listAccounts());

app.post("/api/accounts", async (request, reply) => {
  const account = createAccount(request.body as never);
  return reply.status(201).send(account);
});

app.patch("/api/accounts/:id", async (request) => {
  const params = request.params as { id: string };
  return updateAccount(params.id, request.body as never);
});

app.delete("/api/accounts/:id", async (request) => {
  const params = request.params as { id: string };
  return deleteAccount(params.id);
});

app.get("/api/category-types", async () => listCategoryTypes());

app.post("/api/category-types", async (request, reply) => {
  const categoryType = createCategoryType(request.body as never);
  return reply.status(201).send(categoryType);
});

app.delete("/api/category-types/:id", async (request) => {
  const params = request.params as { id: string };
  return deleteCategoryType(params.id);
});

app.post("/api/subcategories", async (request, reply) => {
  const subcategory = createSubcategory(request.body as never);
  return reply.status(201).send(subcategory);
});

app.delete("/api/subcategories/:id", async (request) => {
  const params = request.params as { id: string };
  return deleteSubcategory(params.id);
});

app.get("/api/loans", async (request) => {
  const query = request.query as { includeArchived?: string };
  return listLoans(query.includeArchived === "true");
});

app.post("/api/loans", async (request, reply) => {
  const loan = createLoan(request.body as never);
  return reply.status(201).send(loan);
});

app.patch("/api/loans/:id", async (request) => {
  const params = request.params as { id: string };
  return updateLoan(params.id, request.body as never);
});

app.delete("/api/loans/:id", async (request) => {
  const params = request.params as { id: string };
  return archiveLoan(params.id);
});

app.get("/api/subscriptions", async (request) => {
  const query = request.query as { includeArchived?: string };
  return listAutopaySubscriptions(query.includeArchived === "true");
});

app.post("/api/subscriptions", async (request, reply) => {
  const subscription = createAutopaySubscription(request.body as never);
  return reply.status(201).send(subscription);
});

app.patch("/api/subscriptions/:id", async (request) => {
  const params = request.params as { id: string };
  return updateAutopaySubscription(params.id, request.body as never);
});

app.delete("/api/subscriptions/:id", async (request) => {
  const params = request.params as { id: string };
  return archiveAutopaySubscription(params.id);
});

app.get("/api/batches/current", async (request) => {
  const query = request.query as { weekStart: string; weekEnd: string };
  return getCurrentBatch(query.weekStart, query.weekEnd);
});

app.post("/api/batches/:id/save", async (request) => {
  const params = request.params as { id: string };
  return saveBatch(params.id);
});

app.get("/api/transactions", async (request) => {
  const query = request.query as {
    accountId?: string;
    categoryId?: string;
    typeId?: string;
    subcategoryId?: string;
    status?: string;
    search?: string;
    from?: string;
    to?: string;
    limit?: string;
    offset?: string;
  };
  return listTransactions({
    accountId: blankToUndefined(query.accountId),
    categoryId: blankToUndefined(query.categoryId),
    typeId: blankToUndefined(query.typeId),
    subcategoryId: blankToUndefined(query.subcategoryId),
    status: blankToUndefined(query.status),
    search: blankToUndefined(query.search),
    from: blankToUndefined(query.from),
    to: blankToUndefined(query.to),
    limit: query.limit ? Number(query.limit) : undefined,
    offset: query.offset ? Number(query.offset) : undefined
  });
});

app.post("/api/transactions", async (request, reply) => {
  const result = createTransaction(request.body as never);
  return reply.status(201).send(result);
});

app.patch("/api/transactions/:id", async (request) => {
  const params = request.params as { id: string };
  return updateTransaction(params.id, request.body as never);
});

app.delete("/api/transactions/:id", async (request) => {
  const params = request.params as { id: string };
  return deleteTransaction(params.id);
});

app.get("/api/reports/monthly", async (request) => {
  const query = request.query as { accountId?: string; month?: string; from?: string; to?: string };
  return getMonthlyReport(
    blankToUndefined(query.accountId),
    query.month,
    blankToUndefined(query.from),
    blankToUndefined(query.to)
  );
});

app.get("/api/backup/status", async () => getBackupStatus());

app.post("/api/backup", async () => createBackup("manual"));

app.get("/api/import/template.xlsx", async (_request, reply) => {
  const buffer = await buildImportTemplate();
  return reply
    .header("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    .header("content-disposition", "attachment; filename=\"financial-tracker-import-template.xlsx\"")
    .send(buffer);
});

app.post("/api/import/transactions", async (request, reply) => {
  const query = request.query as { batchId?: string };
  const file = await request.file();
  if (!file) {
    return reply.status(400).send({ error: "Upload an Excel .xlsx file." });
  }
  const buffer = await file.toBuffer();
  return importTransactionsWorkbook(buffer, blankToUndefined(query.batchId));
});

app.get("/api/export/transactions.csv", async (_request, reply) => {
  return reply
    .header("content-type", "text/csv; charset=utf-8")
    .header("content-disposition", "attachment; filename=\"transactions.csv\"")
    .send(exportTransactionsCsv());
});

if (existsSync(distDir)) {
  await app.register(fastifyStatic, {
    root: distDir
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.sendFile("index.html");
  });
}

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";
let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) {
    process.exit(1);
  }

  shuttingDown = true;
  app.log.info({ signal }, "Shutting down finance tracker");
  stopAutoBackup();

  try {
    const result = createBackup("shutdown");
    app.log.info(result, "Shutdown backup completed");
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error(error, "Shutdown failed");
    process.exit(1);
  }
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

await app.listen({ port, host });

function blankToUndefined(value: string | undefined) {
  return value && value.trim() !== "" ? value : undefined;
}
