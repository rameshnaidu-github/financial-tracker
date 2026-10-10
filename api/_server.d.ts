// Types for api/_server.js, which scripts/build-function.mjs generates during the build.
//
// The generated file is not in the repository, so without this declaration `tsc --noEmit` would
// fail on a clean checkout before the build has run.
import type { IncomingMessage, ServerResponse } from "node:http";

declare const handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
export default handler;
