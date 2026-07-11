export function isTrustedRequestOrigin(origin: string | undefined, host: string | undefined) {
  if (origin === undefined) {
    return true;
  }
  if (!host) {
    return false;
  }

  try {
    const parsedOrigin = new URL(origin);
    return (parsedOrigin.protocol === "http:" || parsedOrigin.protocol === "https:") && parsedOrigin.host === host;
  } catch {
    return false;
  }
}

export const securityHeaders = {
  "content-security-policy":
    "default-src 'self'; base-uri 'none'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY"
} as const;
