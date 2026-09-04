/**
 * Compares two strings in constant time to prevent timing side-channel attacks.
 * Fully compatible with Edge Runtime (Middleware) and Node.js runtimes without
 * importing Node's 'crypto' module.
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ (b.charCodeAt(i % (b.length || 1)) || 0);
  }
  return diff === 0;
}

/**
 * Validates a Bearer token authorization header against the configured CRON_SECRET.
 * - Requires exact "Bearer <token>" format.
 * - Employs timing-safe comparison compatible with Edge and Node runtimes.
 * - Does not log token values.
 * - Fails safely if CRON_SECRET is missing, empty, or undefined.
 */
export function isValidCronAuth(
  authHeader: string | null | undefined,
  expectedSecret: string | undefined
): boolean {
  if (!authHeader || typeof authHeader !== "string") {
    return false;
  }
  if (!expectedSecret || typeof expectedSecret !== "string" || expectedSecret.trim().length === 0) {
    return false;
  }

  const prefix = "Bearer ";
  if (!authHeader.startsWith(prefix)) {
    return false;
  }

  const token = authHeader.slice(prefix.length).trim();
  if (token.length === 0) {
    return false;
  }

  return timingSafeEqualStrings(token, expectedSecret.trim());
}
