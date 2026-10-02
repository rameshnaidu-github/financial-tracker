import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import type { FastifyRequest } from "fastify";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import { currentBatchQuerySchema } from "../shared/finance.ts";
import { forUser, initDatabase } from "./db.ts";
import { isTrustedRequestOrigin, securityHeaders } from "./security.ts";
import { SESSION_COOKIE, SESSION_DAYS, endSession, signIn, userForToken } from "./auth.ts";
import {
  createAccount,
  createAutopaySubscription,
  createBackup,
  copyBudgetFromPreviousMonth,
  createBudgetLine,
  createCategoryType,
  createInvestment,
  createLoan,
  createSubcategory,
  createTransaction,
  createVacation,
  archiveAutopaySubscription,
  archiveLoan,
  deleteAccount,
  deleteBudgetLine,
  deleteCategoryType,
  deleteInvestment,
  deleteSubcategory,
  deleteTransaction,
  deleteVacation,
  buildImportTemplate,
  exportTransactionsCsv,
  getBackupStatus,
  getBudgetPlan,
  getCurrentBatch,
  getMonthlyReport,
  getOverview,
  getPaymentHistory,
  getTrendReport,
  getBudgetTrendReport,
  getWealthSummary,
  getUpcomingPayments,
  getProfile,
  getSettings,
  importTransactionsWorkbook,
  listAccounts,
  listAutopaySubscriptions,
  listCategoryTypes,
  listInvestments,
  listLoans,
  listTransactions,
  summarizeTransactions,
  listVacations,
  saveBatch,
  startAutoBackup,
  stopAutoBackup,
  updateAccount,
  updateAppSettings,
  updateAutopaySubscription,
  updateBudgetLine,
  updateInvestment,
  updateLoan,
  updateProfile,
  updateTransaction,
  updateVacation
} from "./services.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../dist");
const app = Fastify({ logger: true });

initDatabase();
startAutoBackup(app.log);

/**
 * The only paths that answer without a session. Everything else is refused by default, so a route
 * added later is closed until somebody deliberately opens it -- the opposite way round from a list
 * of things to protect, which is one forgotten line away from an exposed route.
 */
const OPEN_PATHS = new Set(["/api/health", "/api/auth/sign-in", "/api/auth/sign-out", "/api/auth/me"]);

const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;

/** Reads our cookie out of the header without pulling in a parser for one value. */
function sessionToken(cookieHeader: string | undefined): string | undefined {
  for (const part of String(cookieHeader ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return undefined;
}

/**
 * httpOnly so script cannot read it, SameSite=Lax so another site cannot ride it, Secure whenever
 * the request arrived over HTTPS -- which is how it will be served, and which cannot simply be
 * hard-coded or sign-in would stop working over plain http on this machine.
 */
function sessionCookie(request: FastifyRequest, token: string, maxAge: number) {
  const https = request.protocol === "https" || request.headers["x-forwarded-proto"] === "https";
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    https ? "Secure" : ""
  ]
    .filter(Boolean)
    .join("; ");
}

app.addHook("onRequest", async (request, reply) => {
  if (!isTrustedRequestOrigin(request.headers.origin, request.headers.host)) {
    return reply.status(403).send({ error: "Cross-origin requests are not allowed." });
  }

  const url = request.url.split("?")[0];
  if (!url.startsWith("/api/")) {
    return undefined;
  }

  const person = userForToken(sessionToken(request.headers.cookie));
  if (person) {
    // enterWith, not run: the person has to stay in scope for the handler and everything it
    // awaits, and a callback that returns cannot do that. Checked against 40 overlapping
    // requests for five different people, each awaiting several times, with no bleed between
    // them.
    forUser(person.id);
    (request as FastifyRequest & { person?: { id: string; email: string } }).person = person;
    return undefined;
  }

  if (OPEN_PATHS.has(url)) {
    return undefined;
  }
  return reply.status(401).send({ error: "Not signed in." });
});

app.addHook("onSend", async (_request, reply) => {
  for (const [name, value] of Object.entries(securityHeaders)) {
    reply.header(name, value);
  }
});

// A single user drives this app, so a generous ceiling is invisible in normal use
// while still capping how fast any one client can hammer the server.
await app.register(rateLimit, {
  global: true,
  max: 600,
  timeWindow: "1 minute",
  // The plugin throws whatever this returns, so it must carry the status code the
  // shared error handler reads — otherwise a throttled request reports as a 500.
  errorResponseBuilder: (_request, context) =>
    Object.assign(new Error(`Too many requests. Try again in ${context.after}.`), {
      statusCode: context.statusCode
    })
});

// Backups, spreadsheet building/parsing and CSV export all touch the file system or
// walk the whole ledger, so they get a far tighter budget than ordinary API reads.
const expensiveRouteLimit = {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: "1 minute"
    }
  }
};

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

// --- signing in -------------------------------------------------------------
// D5 is invite only, so there is no sign-up route here. Accounts are made by
// `node server/account.ts create <email>`.

const signInLimit = {
  config: {
    // Sign-in is the one route worth guessing at, and each attempt costs a scrypt hash.
    rateLimit: { max: 10, timeWindow: "5 minutes" }
  }
};

app.post("/api/auth/sign-in", signInLimit, async (request, reply) => {
  const body = request.body as { email?: string; password?: string } | undefined;
  const session = await signIn(String(body?.email ?? ""), String(body?.password ?? ""));
  if (!session) {
    // The same answer whether the account exists or not, and signIn does the same work either
    // way, so neither the wording nor the timing says which email addresses have accounts.
    return reply.status(401).send({ error: "That email and password do not match." });
  }
  return reply
    .header("set-cookie", sessionCookie(request, session.token, SESSION_MAX_AGE))
    .send({ ok: true });
});

app.post("/api/auth/sign-out", async (request, reply) => {
  endSession(sessionToken(request.headers.cookie));
  return reply.header("set-cookie", sessionCookie(request, "", 0)).send({ ok: true });
});

app.get("/api/auth/me", async (request) => {
  const person = (request as FastifyRequest & { person?: { id: string; email: string } }).person;
  return person ? { signedIn: true, email: person.email } : { signedIn: false };
});

app.get("/api/bootstrap", async () => ({
  settings: getSettings(),
  profile: getProfile(),
  accounts: listAccounts().filter((account) => !account.isArchived),
  categoryTypes: listCategoryTypes(),
  loans: listLoans(true),
  subscriptions: listAutopaySubscriptions(true),
  investments: listInvestments(),
  vacations: listVacations(true)
}));

app.get("/api/profile", async () => getProfile());

app.patch("/api/profile", async (request) => updateProfile(request.body as never));

app.patch("/api/settings", async (request) => updateAppSettings(request.body as never));

app.get("/api/overview", async (request) => {
  const query = request.query as { accountId?: string; month?: string };
  return getOverview(blankToUndefined(query.accountId), query.month);
});

app.get("/api/accounts", async () => listAccounts().filter((account) => !account.isArchived));

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
  const { weekStart, weekEnd } = currentBatchQuerySchema.parse(request.query);
  return getCurrentBatch(weekStart, weekEnd);
});

app.post("/api/batches/:id/save", async (request) => {
  const params = request.params as { id: string };
  return saveBatch(params.id);
});

app.get("/api/transactions/totals", async (request) => {
  const query = request.query as Record<string, string | undefined>;
  return summarizeTransactions({
    accountId: blankToUndefined(query.accountId),
    typeId: blankToUndefined(query.typeId),
    subcategoryId: blankToUndefined(query.subcategoryId),
    status: blankToUndefined(query.status),
    search: blankToUndefined(query.search),
    from: blankToUndefined(query.from),
    to: blankToUndefined(query.to)
  });
});

app.get("/api/transactions", async (request) => {
  const query = request.query as {
    accountId?: string;
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

app.get("/api/wealth", async () => getWealthSummary());

app.get("/api/upcoming", async (request) => {
  // The Overview asks for a week; anything else falls back to the fortnight this used to serve.
  const asked = Number((request.query as { windowDays?: string }).windowDays);
  const windowDays = Number.isInteger(asked) && asked >= 1 && asked <= 60 ? asked : 14;
  return getUpcomingPayments(windowDays);
});

app.get("/api/reports/trends", async (request) => {
  const query = request.query as { accountId?: string; typeId?: string; mode?: string; month?: string };
  const mode = query.mode === "year" ? "year" : query.mode === "week" ? "week" : "month";
  return getTrendReport(
    blankToUndefined(query.accountId),
    query.typeId ?? "",
    mode,
    blankToUndefined(query.month)
  );
});

app.get("/api/reports/budget-trend", async (request) => {
  const query = request.query as { accountId?: string; subcategoryId?: string; mode?: string; month?: string };
  const mode = query.mode === "year" ? "year" : query.mode === "week" ? "week" : "month";
  return getBudgetTrendReport(
    blankToUndefined(query.accountId),
    query.subcategoryId ?? "",
    mode,
    blankToUndefined(query.month)
  );
});

app.get("/api/payment-history", async (request) => {
  const query = request.query as { source?: string; id?: string; year?: string };
  return getPaymentHistory(
    (blankToUndefined(query.source) ?? "") as never,
    blankToUndefined(query.id) ?? "",
    query.year ? Number(query.year) : new Date().getFullYear()
  );
});

app.get("/api/budgets", async (request) => {
  const query = request.query as { month?: string };
  return getBudgetPlan(query.month);
});

app.post("/api/budgets", async (request, reply) => {
  const line = createBudgetLine(request.body as never);
  return reply.status(201).send(line);
});

app.post("/api/budgets/copy-previous", async (request) => {
  const body = (request.body ?? {}) as { month?: string };
  return copyBudgetFromPreviousMonth(body.month ?? "");
});

app.patch("/api/budgets/:id", async (request) => {
  const params = request.params as { id: string };
  return updateBudgetLine(params.id, request.body as never);
});

app.delete("/api/budgets/:id", async (request) => {
  const params = request.params as { id: string };
  return deleteBudgetLine(params.id);
});

app.get("/api/investments", async () => listInvestments());

app.post("/api/investments", async (request, reply) => {
  const investment = createInvestment(request.body as never);
  return reply.status(201).send(investment);
});

app.patch("/api/investments/:id", async (request) => {
  const params = request.params as { id: string };
  return updateInvestment(params.id, request.body as never);
});

app.delete("/api/investments/:id", async (request) => {
  const params = request.params as { id: string };
  return deleteInvestment(params.id);
});

app.get("/api/vacations", async () => listVacations(true));

app.post("/api/vacations", async (request, reply) => {
  const vacation = createVacation(request.body as never);
  return reply.status(201).send(vacation);
});

app.patch("/api/vacations/:id", async (request) => {
  const params = request.params as { id: string };
  return updateVacation(params.id, request.body as never);
});

app.delete("/api/vacations/:id", async (request) => {
  const params = request.params as { id: string };
  return deleteVacation(params.id);
});

app.get("/api/backup/status", async () => getBackupStatus());

app.post("/api/backup", expensiveRouteLimit, async () => createBackup("manual"));

app.get("/api/import/template.xlsx", expensiveRouteLimit, async (_request, reply) => {
  const buffer = await buildImportTemplate();
  return reply
    .header("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    .header("content-disposition", "attachment; filename=\"financial-tracker-import-template.xlsx\"")
    .send(buffer);
});

app.post("/api/import/transactions", expensiveRouteLimit, async (request, reply) => {
  const query = request.query as { batchId?: string };
  const file = await request.file();
  if (!file) {
    return reply.status(400).send({ error: "Upload an Excel .xlsx file." });
  }
  const buffer = await file.toBuffer();
  return importTransactionsWorkbook(buffer, blankToUndefined(query.batchId));
});

app.get("/api/export/transactions.csv", expensiveRouteLimit, async (request, reply) => {
  const query = request.query as Record<string, string | undefined>;
  return reply
    .header("content-type", "text/csv; charset=utf-8")
    .header("content-disposition", "attachment; filename=\"transactions.csv\"")
    .send(
      exportTransactionsCsv({
        accountId: blankToUndefined(query.accountId),
        typeId: blankToUndefined(query.typeId),
        subcategoryId: blankToUndefined(query.subcategoryId),
        status: blankToUndefined(query.status),
        search: blankToUndefined(query.search),
        from: blankToUndefined(query.from),
        to: blankToUndefined(query.to)
      })
    );
});

if (existsSync(distDir)) {
  await app.register(fastifyStatic, {
    root: distDir,
    cacheControl: false,
    setHeaders(reply, filePath) {
      // Content-hashed assets are immutable and safe to cache forever.
      // index.html must never be cached, so a full reload always loads the
      // newest build (and the fresh asset hashes it references).
      if (filePath.endsWith(`${path.sep}index.html`) || filePath.endsWith("/index.html")) {
        reply.header("cache-control", "no-store");
      } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        reply.header("cache-control", "public, max-age=31536000, immutable");
      } else {
        reply.header("cache-control", "no-cache");
      }
    }
  });

  // The single-page app owns every path the server does not, so an unknown page URL gets the app
  // and the router sorts it out. An unknown /api path is a different thing entirely: it is a call
  // that was never going to work, and answering it with the page means the caller gets 200 and a
  // mouthful of HTML where it expected JSON, then fails later with a parse error that says nothing
  // about the real mistake.
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) {
      return reply.status(404).send({ error: "Not found", method: request.method, path: request.url });
    }
    return reply.header("cache-control", "no-store").sendFile("index.html");
  });
}

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "127.0.0.1";
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

// Last-resort safety net: on an otherwise-fatal error, try to capture a backup
// before exiting so a crash never costs the user data.
process.once("uncaughtException", (error) => {
  app.log.error(error, "Uncaught exception");
  void shutdown("uncaughtException");
});

process.once("unhandledRejection", (reason) => {
  app.log.error(reason, "Unhandled promise rejection");
  void shutdown("unhandledRejection");
});

await app.listen({ port, host });

function blankToUndefined(value: string | undefined) {
  return value && value.trim() !== "" ? value : undefined;
}
