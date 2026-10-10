import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { SCHEMA_SQL } from "./schema.ts";
import {
  DEFAULT_CATEGORY_TYPES,
  DEFAULTS_ADDED_AFTER_LEDGER,
  SELF_TRANSFER_SUBCATEGORY_ID,
  WEEK_START,
  CURRENCY,
} from "../shared/finance.ts";

/**
 * Where the database is.
 *
 * `DATABASE_URL` is a hosted Postgres -- Supabase in production, and whatever a developer points
 * it at otherwise. Without it the application runs Postgres in process, which is the same engine
 * rather than a different one that behaves like it on a good day. One schema file serves both.
 */
const connectionString = process.env.DATABASE_URL?.trim();
export const isHostedDatabase = Boolean(connectionString);

/** Where an in-process database keeps its files. Unset means memory, which is what tests want. */
const localDataDir = process.env.FINANCE_DATA_DIR?.trim();

export type Row = Record<string, unknown>;

export type Statement = {
  all: (...params: unknown[]) => Promise<Row[]>;
  get: (...params: unknown[]) => Promise<Row | undefined>;
  run: (...params: unknown[]) => Promise<{ changes: number | bigint }>;
};

export type Adapter = {
  readonly dialect: "postgres";
  /** Whether the database is across a network, which decides what it can be asked to do. */
  readonly hosted: boolean;
  prepare: (sql: string) => Statement;
  exec: (sql: string) => Promise<void>;
  /**
   * Runs `fn` with every statement inside one transaction.
   *
   * The adapter owns this rather than the caller sending BEGIN and COMMIT, because a pooled
   * connection hands out a different socket per statement: a BEGIN sent on one and a COMMIT on
   * another are two unrelated events, and the work in between commits itself.
   */
  transaction: <T>(fn: () => T | Promise<T>) => Promise<T>;
  close: () => Promise<void>;
};

type Driver = {
  query: (sql: string, params: unknown[]) => Promise<{ rows: Row[]; rowCount: number }>;
  exec: (sql: string) => Promise<void>;
  reserve: () => Promise<{
    query: (sql: string, params: unknown[]) => Promise<{ rows: Row[]; rowCount: number }>;
    release: () => void;
  }>;
  close: () => Promise<void>;
};

/**
 * The hosted driver: a pooled `pg` client.
 *
 * A transaction reserves one connection for its whole life, because the statements in a
 * transaction have to reach the same backend to be in it at all.
 */
async function postgresDriver(url: string): Promise<Driver> {
  const { default: pg } = await import("pg");
  // Paise are BIGINT, and SUM over BIGINT is NUMERIC. Both arrive as strings by default, which
  // turns every amount into text and every total into concatenation -- measured: a net-worth
  // snapshot arrived as "010000000-110000050000000-...". They are integer paise and fit in a
  // double long before they fit in a rupee.
  pg.types.setTypeParser(20, (value: string) => Number(value));
  pg.types.setTypeParser(1700, (value: string) => Number(value));
  const pool = new pg.Pool({
    connectionString: url,
    // Serverless means many short-lived instances, each of which would otherwise hold connections
    // a hosted Postgres counts against one small limit.
    max: Number(process.env.DATABASE_POOL_MAX ?? 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
  });
  return {
    query: async (sql, params) => {
      const result = await pool.query(sql, params as never[]);
      return { rows: result.rows as Row[], rowCount: result.rowCount ?? 0 };
    },
    exec: async (sql) => {
      await pool.query(sql);
    },
    reserve: async () => {
      const client = await pool.connect();
      return {
        query: async (sql, params) => {
          const result = await client.query(sql, params as never[]);
          return { rows: result.rows as Row[], rowCount: result.rowCount ?? 0 };
        },
        release: () => client.release(),
      };
    },
    close: () => pool.end(),
  };
}

// A bundler resolves `await import("literal")` at build time, so naming the package here put the
// whole WebAssembly engine -- a devDependency, several megabytes of it -- inside the production
// function that never runs this branch. Going through a variable keeps it a runtime import.
const PGLITE_PACKAGE = "@electric-sql/pglite";

/** The in-process driver: Postgres compiled to WebAssembly, with the citext the schema needs. */
async function pgliteDriver(): Promise<Driver> {
  const { PGlite } = (await import(PGLITE_PACKAGE)) as typeof import("@electric-sql/pglite");
  const { citext } = (await import(`${PGLITE_PACKAGE}/contrib/citext`)) as typeof import(
    "@electric-sql/pglite/contrib/citext"
  );
  // One options object, not (dataDir, options): the two-argument form drops the extensions when
  // the directory is undefined, and the schema's citext columns then fail to create.
  const instance = await new PGlite({
    ...(localDataDir ? { dataDir: localDataDir } : {}),
    extensions: { citext },
  });
  // The same two types, for the same reason: NUMERIC and BIGINT are money here, not text.
  const parsers = { 20: Number, 1700: Number };
  const query = async (sql: string, params: unknown[]) => {
    const result = await instance.query(sql, params as never[], { parsers });
    return { rows: (result.rows ?? []) as Row[], rowCount: result.affectedRows ?? 0 };
  };
  // One process, one database: a reservation is the same instance, so a transaction's statements
  // are already on the only connection there is.
  return {
    query,
    exec: (sql) => instance.exec(sql).then(() => undefined),
    reserve: async () => ({ query, release: () => undefined }),
    close: () => instance.close(),
  };
}

// Refusing beats starting. A serverless instance has no disk to keep a database on, so the
// in-process engine would be a new empty database on every invocation: the application would show
// no accounts, accept a transaction, and lose it. DATABASE_URL was set for Production only, which
// is exactly how a Preview deployment would have behaved this way.
if (!connectionString && process.env.VERCEL) {
  throw new Error(
    "DATABASE_URL is not set, and this is a hosted runtime with no disk to keep a database on. " +
      "The in-process engine would start empty on every request and discard anything written to " +
      "it. Set DATABASE_URL for this environment -- Production, Preview and Development each need " +
      "their own -- and redeploy.",
  );
}

const driver: Driver = connectionString
  ? await postgresDriver(connectionString)
  : await pgliteDriver();

function postgresAdapter(): Adapter {
  // While a transaction is open every statement goes through its reserved connection. Anything
  // still using the pool would run outside the transaction and commit on its own.
  let reserved: Awaited<ReturnType<Driver["reserve"]>> | undefined;
  const run = async (sql: string, params: unknown[]) => {
    try {
      return await (reserved ? reserved.query(sql, params) : driver.query(sql, params));
    } catch (error) {
      // The driver reports the parameter number and nothing about the statement, which is of no
      // use at all when 126 of them are in play. Naming it is how every dialect difference in this
      // move was found; it stays for the next one.
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`${detail}\n  statement: ${sql.replace(/\s+/g, " ").slice(0, 400)}\n  params: ${JSON.stringify(params).slice(0, 200)}`);
    }
  };
  // One reserved connection at a time, so two transactions never interleave on it.
  let queue: Promise<unknown> = Promise.resolve();

  return {
    dialect: "postgres",
    hosted: isHostedDatabase,
    prepare: (sql) => {
      const text = translate(sql);
      return {
        all: async (...params) => (await run(text, params)).rows,
        get: async (...params) => (await run(text, params)).rows[0] ?? undefined,
        run: async (...params) => ({ changes: (await run(text, params)).rowCount }),
      };
    },
    exec: async (sql) => {
      if (reserved) {
        for (const statement of splitStatements(sql)) await reserved.query(statement, []);
        return;
      }
      await driver.exec(sql);
    },
    transaction: async (fn) => {
      // Postgres has no nested transactions worth the name here, so an inner call joins the one
      // already open rather than starting a second that would commit the outer one's work early.
      if (reserved) return fn();
      const mine = queue.then(async () => {
        const client = await driver.reserve();
        reserved = client;
        try {
          await client.query("BEGIN", []);
          const result = await fn();
          await client.query("COMMIT", []);
          return result;
        } catch (error) {
          try {
            await client.query("ROLLBACK", []);
          } catch {
            /* the error the body threw is the one worth reporting */
          }
          throw error;
        } finally {
          reserved = undefined;
          client.release();
        }
      });
      // The queue carries the turn, not the result, so one failure does not stop the next.
      queue = mine.catch(() => undefined);
      return mine;
    },
    close: () => driver.close(),
  };
}

/**
 * Splits a SQL script into its statements, aware of strings and comments -- a `;` inside either is
 * not the end of anything, and the schema has both.
 */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  for (let i = 0; i < sql.length; i += 1) {
    const c = sql[i];
    if (c === "'" || c === '"') {
      const quote = c;
      current += c;
      i += 1;
      while (i < sql.length) {
        current += sql[i];
        if (sql[i] === quote) break;
        i += 1;
      }
      continue;
    }
    if (c === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") { current += sql[i]; i += 1; }
      current += "\n";
      continue;
    }
    if (c === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
      continue;
    }
    current += c;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

/**
 * The one place a statement is adjusted for the engine underneath.
 *
 * Five forms, counted from the application rather than guessed at: SQLite's `?` placeholders, its
 * `INSERT OR IGNORE`, and nothing else. Everything the application writes is already standard SQL,
 * which is what portable-5 measured when it proved all 126 statements parse as Postgres.
 */
function translate(sql: string): string {
  let out = sql.replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi, "INSERT INTO");
  const needsOnConflict = out !== sql;

  // `?` becomes $1, $2 … but only outside string literals, where a question mark is just text.
  let index = 0;
  let positional = "";
  for (let i = 0; i < out.length; i += 1) {
    const c = out[i];
    if (c === "'") {
      positional += c;
      i += 1;
      while (i < out.length) { positional += out[i]; if (out[i] === "'") break; i += 1; }
      continue;
    }
    positional += c === "?" ? `$${(index += 1)}` : c;
  }
  out = positional;

  if (needsOnConflict && !/ON\s+CONFLICT/i.test(out)) {
    out = `${out.replace(/;\s*$/, "")} ON CONFLICT DO NOTHING`;
  }
  return out;
}

export const db: Adapter = postgresAdapter();



/**
 * Brings the database up to the shape the application needs, and seeds what it must contain.
 *
 * No migration chain. The twenty steps `server/db.ts` used to run existed to carry a SQLite file
 * written by an older release forward; a hosted Postgres starts empty, so it gets the finished
 * schema in one piece. Every statement is IF NOT EXISTS, so running this on every cold start costs
 * a round trip and changes nothing.
 */
export async function initDatabase() {
  await db.exec(SCHEMA_SQL);
  await ensureOwner();
  await asOwner(async () => {
    await seedTaxonomy();
    await seedSettings();
  });
}


const PER_PERSON_SETTINGS = new Set([
  "profile_name",
  "profile_email",
  "profile_age",
  "card_utilization_alert_percent",
  "first_screen",
  "week_start",
  "currency",
  // A person's taxonomy is their own (D1), so the ledger of which defaults they have already
  // been given is theirs too.
  "seeded_default_taxonomy_ids",
]);

/**
 * There is exactly one person until sign-up exists, and on an existing database that person is
 * whoever the stored profile describes. Their id is generated once and then never changes, so
 * every row attributed to them stays attributed across restarts.
 */

/** Until a profile names them, the owner is anonymous rather than absent. */
const PLACEHOLDER_OWNER_EMAIL = "owner@localhost";

async function ensureOwner() {
  // `user_settings` only: the single `settings` table belonged to a release before Stage 2, and a
  // database that starts on Postgres has never had one.
  const profileEmail = async () => {
    const stored = (await db
      .prepare("SELECT value FROM user_settings WHERE key = 'profile_email' LIMIT 1")
      .get()) as { value: string } | undefined;
    return (stored?.value ?? "").trim();
  };

  const existing = (await db
    .prepare("SELECT id, email FROM users ORDER BY created_at, id LIMIT 1")
    .get()) as { id: string; email: string } | undefined;
  if (existing) {
    // A database created before its owner filled in a profile holds the placeholder below. Once
    // the profile names them, the owner becomes that person rather than staying anonymous.
    const email = await profileEmail();
    if (existing.email === PLACEHOLDER_OWNER_EMAIL && email) {
      (await db.prepare("UPDATE users SET email = ? WHERE id = ?").run(
        email,
        existing.id,
      ));
    }
    return existing.id;
  }

  const id = randomUUID();
  (await db.prepare("INSERT INTO users (id, email) VALUES (?, ?)").run(
    id,
    (await profileEmail()) || PLACEHOLDER_OWNER_EMAIL,
  ));
  return id;
}

/**
 * The person every query is for. Stage 3 made this the single source the whole of services.ts

 * reads -- 119 calls, most of them deep inside functions that have no idea a request exists -- so
 * that this one function could later be made to ask the request. This is that change.
 *
 * It reads an AsyncLocalStorage established once per request, rather than taking a parameter: the
 * alternative was threading the person through 182 functions.
 *
 * **Outside any request it throws.** The tempting version falls back to "the only user", and that
 * default is a hole: any path that forgets to establish a session would read the owner's money
 * instead of failing. The two callers that legitimately have no request -- the migrations at
 * start-up and the account command -- say so by calling `asOwner`, which is a named act somebody
 * can grep for rather than a silence.
 */
const requestUser = new AsyncLocalStorage<{ id?: string }>();

export function currentUserId(): string {
  const person = requestUser.getStore();
  if (!person?.id) {
    throw new Error(
      "No user in scope. Every request must run inside forUser(); start-up and the account command use asOwner().",
    );
  }
  return person.id;
}

/**
 * Opens an empty scope for one request and keeps it open for everything the request goes on to do.
 *
 * The scope is opened with `run`, not `enterWith`, and the callback it is given is the rest of the
 * request. `enterWith` was the earlier answer to "the handler comes after the hook returns", but it
 * only changes the *current* async resource: Fastify resumes a request from a context captured
 * before the hook ran, so the person set that way was gone by the time the handler asked for it --
 * every signed-in request answered 500 with "No user in scope".
 *
 * What survives from that reasoning is the shape: the store is a mutable holder, entered empty
 * before anyone is known, so `forUser` can fill it in later without needing to own the stack.
 */
export function beginRequestScope<T>(fn: () => T): T {
  return requestUser.run({}, fn);
}

/**
 * Makes everything in this request run as the given person.
 *
 * Inside a scope this fills in the holder, so the identity reaches the handler and everything it
 * awaits. Outside one -- a caller that owns its own stack and never opened a scope -- it falls
 * back to entering the current context, which is correct there because there is nothing to resume.
 */
export function forUser(userId: string): void {
  const store = requestUser.getStore();
  if (store) {
    store.id = userId;
    return;
  }
  requestUser.enterWith({ id: userId });
}

/** The callback form, for a caller that owns its own stack. */
export function runAsUser<T>(userId: string, fn: () => T): T {
  return requestUser.run({ id: userId }, fn);
}

/**
 * For the two places with no request: the migrations that run at start-up, and the account
 * command. Both legitimately act as the single owner of an installation that has one.
 */
export async function asOwner<T>(fn: () => T | Promise<T>): Promise<T> {
  return requestUser.run({ id: await ownerId() }, fn);
}

/** Whether a person is in scope, for the few places that have to ask rather than assume. */
export function hasCurrentUser(): boolean {
  // A scope is opened before anyone is known, so the holder existing is not the same as a person
  // being in it.
  return requestUser.getStore()?.id !== undefined;
}

/**
 * The owner of this installation: the first account by `created_at`.
 *
 * One definition, read from here by everything that needs it. `asOwner` picks the same row by the
 * same order, so "the owner" cannot come to mean two different people depending on which function
 * was asked -- which is exactly how the second account would quietly gain the first one's rights.
 */
export async function ownerId(): Promise<string> {
  const row = (await db
    .prepare("SELECT id FROM users ORDER BY created_at, id LIMIT 1")
    .get()) as { id: string } | undefined;
  if (!row) {
    throw new Error(
      "No user exists: initDatabase must run before any row is written.",
    );
  }
  return row.id;
}

/** Whether the person in scope owns this installation. Throws outside a request, like the rest. */
export async function currentUserIsOwner(): Promise<boolean> {
  return currentUserId() === (await ownerId());
}

/** Keeps the owner's identity in step with the profile they edit. */
export async function setOwnerEmail(email: string) {
  const trimmed = email.trim();
  if (!trimmed) {
    return;
  }
  (await db.prepare("UPDATE users SET email = ? WHERE id = ?").run(
    trimmed,
    currentUserId(),
  ));
}


const SEEDED_DEFAULTS_SETTING = "seeded_default_taxonomy_ids";

/**
 * Inserts each shipped default Type/SubType exactly once per person. The ids already delivered
 * are recorded against that person, so a default they delete stays deleted after a restart, while
 * a default added in a later release still reaches existing databases.
 */
async function seedTaxonomy() {
  const owner = currentUserId();
  const insertType = db.prepare(`
    INSERT OR IGNORE INTO category_types
      (id, user_id, name, behavior, icon, color, is_system, is_locked, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);
  const insertSubcategory = db.prepare(`
    INSERT OR IGNORE INTO subcategories
      (id, user_id, type_id, name, icon, color, is_system, is_locked, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);
  const typeExists = db.prepare(
    "SELECT 1 FROM category_types WHERE id = ? AND user_id = ?",
  );

  const recorded = await getSetting(SEEDED_DEFAULTS_SETTING);
  let seeded: Set<string>;
  if (recorded !== undefined) {
    seeded = new Set(JSON.parse(recorded) as string[]);
  } else {
    const hasTaxonomy =
      (
        (await db
          .prepare(
            "SELECT COUNT(*) AS count FROM category_types WHERE user_id = ?",
          )
          .get(owner)) as { count: number }
      ).count > 0;
    // Before this ledger existed every original default was inserted on each boot, so an
    // original default missing from an existing database is one the user deleted.
    seeded = new Set(
      hasTaxonomy
        ? DEFAULT_CATEGORY_TYPES.flatMap((type) => [
            type.id,
            ...type.subcategories.map((sub) => sub.id),
          ]).filter((id) => !DEFAULTS_ADDED_AFTER_LEDGER.has(id))
        : [],
    );
  }

  // for…of, not forEach: forEach discards the promise each callback returns, so every insert below
  // was fired and forgotten -- seeding raced itself, the settings row was written before the rows
  // it describes existed, and the transaction holding them could not commit because its own
  // statements were still in flight.
  let typeIndex = -1;
  for (const type of DEFAULT_CATEGORY_TYPES) {
    typeIndex += 1;
    if (!seeded.has(type.id)) {
      await insertType.run(
        type.id,
        owner,
        type.name,
        type.behavior,
        type.icon,
        type.color,
        // Card payments and refunds are wired into the app's logic, so their Types can't be deleted.
        type.id === "type_card_payment" || type.id === "type_refund" ? 1 : 0,
        typeIndex + 1,
      );
      seeded.add(type.id);
    }

    let subIndex = -1;
    for (const subcategory of type.subcategories) {
      subIndex += 1;
      if (seeded.has(subcategory.id)) {
        continue;
      }
      // A default SubType can only be added under a parent Type the user still has.
      if (!(await typeExists.get(type.id, owner))) {
        continue;
      }
      await insertSubcategory.run(
        subcategory.id,
        owner,
        type.id,
        subcategory.name,
        subcategory.icon,
        subcategory.color,
        subcategory.id === SELF_TRANSFER_SUBCATEGORY_ID ? 1 : 0,
        subIndex + 1,
      );
      seeded.add(subcategory.id);
    }
  }

  await setSetting(SEEDED_DEFAULTS_SETTING, JSON.stringify([...seeded].sort()));
}


async function getSetting(key: string) {
  const row = (
    PER_PERSON_SETTINGS.has(key)
      ? (await db
          .prepare(
            "SELECT value FROM user_settings WHERE user_id = ? AND key = ?",
          )
          .get(currentUserId(), key))
      : (await db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key))
  ) as { value: string } | undefined;
  return row?.value;
}

async function setSetting(key: string, value: string) {
  if (PER_PERSON_SETTINGS.has(key)) {
    (await db.prepare(
      `INSERT INTO user_settings (user_id, key, value)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`,
    ).run(currentUserId(), key, value));
    return;
  }
  (await db.prepare(
    `INSERT INTO app_settings (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value));
}

/** The split in D2, as one list the server can ask about rather than two tables to remember. */

export function isPerPersonSetting(key: string) {
  return PER_PERSON_SETTINGS.has(key);
}


async function seedSettings() {
  const owner = currentUserId();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO user_settings (user_id, key, value)
    VALUES (?, ?, ?)
  `);
  const seed = async (key: string, value: string) => insert.run(owner, key, value);

  await seed("currency", CURRENCY);
  await seed("week_start", WEEK_START);
  await seed("first_screen", "overview");
  await seed("card_utilization_alert_percent", "30");
  await seed("profile_name", "");
  await seed("profile_email", "");
  await seed("profile_age", "");
}

/**
 * Runs `fn` between BEGIN and COMMIT, rolling back if it throws.
 *
 * Awaits each step now that statements cross a wire. The await on `fn()` is the one that matters:
 * without it the COMMIT would be sent while the body's own statements were still in flight, and
 * the rollback on failure would arrive after the thing it was meant to undo had already committed.
 */

/** Runs `fn` between BEGIN and COMMIT, rolling back if it throws. */
export async function transaction<T>(fn: () => T | Promise<T>): Promise<T> {
  return db.transaction(fn);
}

export function asRecord<T>(row: unknown): T {
  return row as T;
}

export function asRecords<T>(rows: unknown[]): T[] {
  return rows as T[];
}

