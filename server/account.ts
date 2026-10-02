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
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { db, initDatabase } from "./db.ts";
import { hashPassword, passwordComplaint } from "./auth.ts";

type UserRow = { id: string; email: string; password_hash: string | null; created_at: string };

function usage(): never {
  console.error("usage: node server/account.ts <list|create|password|sessions> [email]");
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
      const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
      const output = process.stdout as NodeJS.WriteStream & { muted?: boolean };
      // Echo the prompt, then nothing, so the password does not sit in the terminal's scrollback.
      const write = output.write.bind(output);
      (rl as unknown as { _writeToOutput: (text: string) => void })._writeToOutput = (text) => {
        write(text.startsWith(prompt) ? prompt : "");
      };
      rl.question(prompt, (answer) => {
        rl.close();
        write("\n");
        resolve(answer);
      });
    });

  const first = await ask("Password: ");
  const second = await ask("Again: ");
  if (first !== second) {
    console.error("Those did not match.");
    process.exit(1);
  }
  return first;
}

function findByEmail(email: string): UserRow | undefined {
  return db.prepare("SELECT id, email, password_hash, created_at FROM users WHERE email = ?").get(email) as
    | UserRow
    | undefined;
}

async function main() {
  const [command, emailArgument] = process.argv.slice(2);
  if (!command) usage();
  initDatabase();

  if (command === "list") {
    const people = db
      .prepare("SELECT id, email, password_hash, created_at FROM users ORDER BY created_at, id")
      .all() as UserRow[];
    if (people.length === 0) {
      console.log("No accounts yet.");
      return;
    }
    for (const person of people) {
      const sessions = (
        db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND expires_at > ?")
          .get(person.id, new Date().toISOString()) as { n: number }
      ).n;
      const state = person.password_hash ? `${sessions} signed in` : "no password set -- cannot sign in";
      console.log(`${person.email}  (${state})`);
    }
    return;
  }

  const email = String(emailArgument ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) usage();

  if (command === "create") {
    if (findByEmail(email)) {
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
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)").run(
      id,
      email,
      await hashPassword(password)
    );
    console.log(`Created ${email}.`);
    return;
  }

  const person = findByEmail(email);
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
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword(password), person.id);
    // Changing a password ends every session: that is the point of changing it.
    const ended = db.prepare("DELETE FROM sessions WHERE user_id = ?").run(person.id);
    console.log(`Password changed for ${email}; ${Number(ended.changes)} session(s) ended.`);
    return;
  }

  if (command === "sessions") {
    const ended = db.prepare("DELETE FROM sessions WHERE user_id = ?").run(person.id);
    console.log(`Ended ${Number(ended.changes)} session(s) for ${email}.`);
    return;
  }

  usage();
}

await main();
