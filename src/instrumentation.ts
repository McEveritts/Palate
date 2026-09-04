/**
 * Next.js Server Startup Instrumentation
 *
 * Runs once when a new Next.js server instance starts up.
 * Guarantees production secret separation and fail-closed validation before serving requests.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Skip assertion during static build phase
    if (process.env.NEXT_PHASE === "phase-production-build") {
      return;
    }

    const { assertProductionSecretsValid } = await import("@/lib/secrets");
    assertProductionSecretsValid();
  }
}
