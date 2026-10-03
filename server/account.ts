// Accounts are made here and nowhere else. D5: invite only -- the site has a sign-in form and no
// sign-up, so this command is how a person comes to exist.
//
//   node server/account.ts list
//   node server/account.ts create <email>
//   node server/account.ts password <email>
//   node server/account.ts sessions <email>        -- end every signed-in browser for that person
//
// A password may be piped in (`echo … | node server/account.ts create a@b.c`) for a script; typed
// interactively it is not echoed and is asked for twice.
import { randomUUID } from "node:crypto";
import type { Adapter } from "./db.ts";

/**
 * Opened only after the guard below has let the command through.
 *
 * `./db.ts` resolves and *opens* its database the moment it is imported, which creates the file --
 * and `./auth.ts` imports it in turn, so neither can be named at the top of this file. Imported
 * there, a refusal would still have left an empty database sitting at the path it had just
 * refused to touch: a small lie in a message that says nothing has been changed.
 */
// Assigned in main(), after the guard has let the command through. The non-null assertion at the
// use sites is honest here: nothing reads it before main() opens it, and the `finally` that closes
// it checks.
let db!: Adapter;
let hashPassword: (password: string) => Promise<string>;
let passwordComplaint: (password: string) => string | null;

type UserRow = { id: string; email: string; password_hash: string | null; created_at: string };

/** Says you meant the project's own database, out loud, on the command line. */
const DELIBERATE = "--yes-the-real-one";

function usage(): never {
  console.error("usage: node server/account.ts <list|create|password|sessions> [email] [--yes-the-real-one]");
  process.exit(2);
}

/**
 * Refuses to change accounts in whatever database the command fell back to.
 *
 * Without `FINANCE_DB_PATH`, `db.ts` resolves `./data/finance.db` -- which, run from the project,
 * is the owner's real money. There is no visible difference between a command aimed at a test
 * database and one that silently landed on the real one, and on 2026-10-02 that cost the owner
 * their password: `node server/account.ts password <them>`, meant for a copy, overwrote the hash
 * in `data/finance.db` and printed a cheerful success.
 *
 * So the fallback is now a refusal rather than a default. Saying where to go, or saying you mean
 * this one, both still work -- they just have to be said.
 */
function refuseAnUnaskedForDatabase(command: string, argv: string[]): void {
  // `list` only reads. Everything else writes, including `sessions`, which signs people out.
  if (command === "list") return;
  if (argv.includes(DELIBERATE)) return;

  // The risk inverted when the database moved off this machine. It used to be that an unset
  // variable meant the owner's real file; now an unset variable means a throwaway database in this
  // process, and it is a *set* DATABASE_URL that points at the money -- production, over the
  // network, from a laptop. That is the one worth refusing.
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return;

  // The host, never the credentials: this is printed, and a connection string carries a password.
  let where = "a hosted database";
  try {
    where = new URL(url).host;
  } catch {
    /* an unparseable URL stays unnamed rather than echoed */
  }
  console.error("Refusing to change accounts in the hosted database:\n");
  console.error(`    ${where}\n`);
  console.error("Nothing has been changed. Say you mean it, or leave DATABASE_URL unset to work");
  console.error("against a local database instead:\n");
  console.error(`    node server/account.ts ${command} <email> ${DELIBERATE}`);
  process.exit(2);
}

/** Reads a password without putting it on the screen, and asks twice so a typo cannot lock you out. */
async function askForPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    const piped = await new Promise<string>((resolve) => {
      let text = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => { text += chunk; });
      process.stdin.on("end", () => resolve(text));
    });
    return piped.replace(/\r?\n$/, "");
  }

  const ask = (prompt: string) =>
    new Promise<string>((resolve) => {
      // Read the keystrokes rather than letting readline draw the line. Readline redraws the whole
      // line, prompt included, on every keypress, and any attempt to filter that either echoes the
      // password or repeats the prompt once per character -- which is what the first version here
      // did. This writes the prompt once and shows nothing else.
      // Raw mode first, then the prompt: the other way round leaves a window in which the
      // terminal is still echoing, and anything typed in it appears on screen. Measured -- over a
      // pty that answers the prompt instantly, the first password was visible and the second was
      // not, which is exactly that window.
      const input = process.stdin;
      input.setRawMode(true);
      input.resume();
      input.setEncoding("utf8");
      process.stdout.write(prompt);

      let typed = "";
      const stop = () => {
        input.setRawMode(false);
        input.pause();
        input.off("data", onData);
      };
      const onData = (chunk: string) => {
        for (const character of chunk) {
          if (character === "\r" || character === "\n") {
            stop();
            process.stdout.write("\n");
            resolve(typed);
            return;
          }
          if (character === "\u0003") {
            // Ctrl-C, which should stop the command rather than be typed into the password.
            stop();
            process.stdout.write("\n");
            process.exit(130);
          }
          if (character === "\u007f" || character === "\b") {
            typed = typed.slice(0, -1);
            continue;
          }
          // Arrow keys and the like arrive as escape sequences; none of them belong in a password.
          if (character < " ") {
            continue;
          }
          typed += character;
        }
      };
      input.on("data", onData);
    });

  const first = await ask("Password: ");
  const second = await ask("Again: ");
  if (first !== second) {
    console.error("Those did not match.");
    process.exit(1);
  }
  return first;
}

async function findByEmail(email: string): Promise<UserRow | undefined> {
  return (await db.prepare("SELECT id, email, password_hash, created_at FROM users WHERE email = ?").get(email)) as
    | UserRow
    | undefined;
}

async function main() {
  const argv = process.argv.slice(2);
  const [command, emailArgument] = argv.filter((value) => !value.startsWith("--"));
  if (!command) usage();
  // Before initDatabase: the migrations write, so the refusal has to come first or it is advice
  // given after the fact. Before askForPassword too, so nothing is typed into a prompt that was
  // never going to be used.
  refuseAnUnaskedForDatabase(command, argv);

  const database = await import("./db.ts");
  const auth = await import("./auth.ts");
  db = database.db;
  hashPassword = auth.hashPassword;
  passwordComplaint = auth.passwordComplaint;
  // Awaited: the migrations and seeding are statements over a connection now, and without this the
  // command's own first query races them -- it printed its answer while initDatabase was still
  // running, then failed against a database the `finally` below had already closed.
  await database.initDatabase();

  if (command === "list") {
    const people = (await db
      .prepare("SELECT id, email, password_hash, created_at FROM users ORDER BY created_at, id")
      .all()) as UserRow[];
    if (people.length === 0) {
      console.log("No accounts yet.");
      return;
    }
    for (const person of people) {
      const sessions = (
        (await db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND expires_at > ?")
          .get(person.id, new Date().toISOString())) as { n: number }
      ).n;
      const state = person.password_hash ? `${sessions} signed in` : "no password set -- cannot sign in";
      console.log(`${person.email}  (${state})`);
    }
    return;
  }

  const email = String(emailArgument ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) usage();

  if (command === "create") {
    if (await findByEmail(email)) {
      console.error(`${email} already has an account. Use "password" to change it.`);
      process.exit(1);
    }
    const password = await askForPassword();
    const complaint = passwordComplaint(password);
    if (complaint) {
      console.error(complaint);
      process.exit(1);
    }
    const id = randomUUID();
    (await db.prepare("INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)").run(
      id,
      email,
      await hashPassword(password)
    ));
    console.log(`Created ${email}.`);
    return;
  }

  const person = await findByEmail(email);
  if (!person) {
    console.error(`No account for ${email}.`);
    process.exit(1);
  }

  if (command === "password") {
    const password = await askForPassword();
    const complaint = passwordComplaint(password);
    if (complaint) {
      console.error(complaint);
      process.exit(1);
    }
    (await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword(password),person.id));
    // Changing a password ends every session: that is the point of changing it.
    const ended = (await db.prepare("DELETE FROM sessions WHERE user_id = ?").run(person.id));
    console.log(`Password changed for ${email}; ${Number(ended.changes)} session(s) ended.`);
    return;
  }

  if (command === "sessions") {
    const ended = (await db.prepare("DELETE FROM sessions WHERE user_id = ?").run(person.id));
    console.log(`Ended ${Number(ended.changes)} session(s) for ${email}.`);
    return;
  }

  usage();
}

// The database holds the event loop open, so a command that has finished its work would otherwise
// sit there forever with nothing to do. Measured: `account.ts list` printed its answer and never
// exited.
try {
  await main();
} finally {
  if (db) await db.close();
}
