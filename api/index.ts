// The application, as a Vercel serverless function.
//
// Vercel does not run a server: it hands a Node process one request at a time and expects an
// answer. So this imports the Fastify app rather than starting it, waits for it to be ready --
// which is also when the schema has been applied and the taxonomy seeded -- and then hands the
// request to the HTTP server Fastify built but never told to listen.
//
// Only /api/* reaches here. The built pages are static files, served by Vercel's CDN, which is why
// nothing in this file knows about `dist`.
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Anything that looks like a credential, removed.
 *
 * A failure to reach the database can quote the thing it tried to reach, and this reply is public.
 */
function redact(text: string): string {
  return text
    .replace(/\/\/[^@\s/]*:[^@\s/]*@/g, "//***:***@")
    .replace(/\b(password|sslmode|pgpassword)=[^\s&;'"]*/gi, "$1=***");
}

// The import is inside the boot, not at the top, so that a module that throws while loading is
// reported rather than taking the whole invocation down with no explanation. It runs once: the
// promise is kept, so later requests reuse the same app.
let booting: Promise<typeof import("../server/index.ts")> | undefined;
const boot = () => (booting ??= import("../server/index.ts"));

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  let app;
  try {
    const module = await boot();
    // Awaited on every invocation, not just the first. It resolves once and is then free, and a
    // cold start that began handling a request before the schema existed is exactly the failure
    // this avoids.
    await module.ready;
    app = module.app;
  } catch (error) {
    // Without this the platform answers FUNCTION_INVOCATION_FAILED and the reason is only in the
    // runtime logs, which are not available on every plan. A boot failure is an outage, so it says
    // what broke -- the application cannot serve anything until it is fixed either way.
    booting = undefined; // so the next request retries rather than caching the failure
    const cause = error instanceof Error ? error : new Error(String(error));
    const body = {
      error: "The application could not start.",
      name: cause.name,
      message: redact(cause.message),
      code: redact(String((cause as NodeJS.ErrnoException).code ?? "")),
      // The first few frames locate it; the whole stack is noise in a JSON body.
      at: redact(String(cause.stack ?? "")).split("\n").slice(1, 5).map((line) => line.trim()),
    };
    response.statusCode = 503;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.setHeader("cache-control", "no-store");
    response.end(JSON.stringify(body, null, 2));
    return;
  }
  app.server.emit("request", request, response);
}
