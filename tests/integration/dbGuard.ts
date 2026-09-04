/**
 * Strict database safety guard for PostgreSQL integration test suites.
 *
 * Prevents catastrophic execution against production, staging, or generic databases.
 * Throws fatal error before any database pool, client, or singleton is initialized.
 */
export function assertTestDatabaseEnv(url?: string): void {
  const isIntegrationEnabled = process.env.RUN_DB_INTEGRATION === "true";
  if (!isIntegrationEnabled) {
    return;
  }

  if (!url || typeof url !== "string" || url.trim() === "") {
    throw new Error("FATAL: RUN_DB_INTEGRATION is true but TEST_DATABASE_URL is not provided.");
  }

  let dbName: string;
  try {
    const parsed = new URL(url);
    dbName = parsed.pathname.replace(/^\//, "");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`FATAL: Malformed TEST_DATABASE_URL: ${msg}`);
  }

  if (dbName !== "palate_test") {
    throw new Error(
      `FATAL: Integration tests must run strictly against database 'palate_test', but received '${dbName}'.`
    );
  }
}
