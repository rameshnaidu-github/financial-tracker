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
import { app, ready } from "../server/index.ts";

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  // Awaited on every invocation, not just the first. It resolves once and is then free, and a cold
  // start that began handling a request before the schema existed is exactly the failure this
  // avoids.
  await ready;
  app.server.emit("request", request, response);
}
