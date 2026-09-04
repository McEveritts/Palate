import "server-only";
import { timingSafeEqualStrings } from "./cronAuth";

export interface SecretValidationResult {
  valid: boolean;
  errors: string[];
}

export const REQUIRED_PRODUCTION_SECRETS = [
  "NEXTAUTH_SECRET",
  "PALATE_ENCRYPTION_SECRET",
  "PALATE_RATE_LIMIT_SECRET",
  "CRON_SECRET",
] as const;

export type RequiredSecretName = (typeof REQUIRED_PRODUCTION_SECRETS)[number];

/**
 * Validates that all production secrets are defined, meet minimum entropy requirements (>= 32 chars),
 * and are pairwise distinct without leaking or logging secret values.
 */
export function validateProductionSecrets(env: NodeJS.ProcessEnv = process.env): SecretValidationResult {
  const errors: string[] = [];

  const values: Record<RequiredSecretName, string | undefined> = {
    NEXTAUTH_SECRET: env.NEXTAUTH_SECRET,
    PALATE_ENCRYPTION_SECRET: env.PALATE_ENCRYPTION_SECRET,
    PALATE_RATE_LIMIT_SECRET: env.PALATE_RATE_LIMIT_SECRET,
    CRON_SECRET: env.CRON_SECRET,
  };

  // 1. Check presence & minimum length
  for (const name of REQUIRED_PRODUCTION_SECRETS) {
    const val = values[name];
    if (!val || val.trim() === "") {
      errors.push(`Missing required production secret: ${name}`);
    } else if (val.length < 32) {
      errors.push(`Secret ${name} is too short (minimum 32 characters required in production).`);
    }
  }

  // 2. Check pairwise distinctness for all present secrets
  for (let i = 0; i < REQUIRED_PRODUCTION_SECRETS.length; i++) {
    for (let j = i + 1; j < REQUIRED_PRODUCTION_SECRETS.length; j++) {
      const nameA = REQUIRED_PRODUCTION_SECRETS[i];
      const nameB = REQUIRED_PRODUCTION_SECRETS[j];
      const valA = values[nameA];
      const valB = values[nameB];

      if (valA && valB && timingSafeEqualStrings(valA, valB)) {
        errors.push(`Secrets ${nameA} and ${nameB} must not share the same value.`);
      }
    }
  }

  // In production, any error invalidates. In non-production, valid is false if errors exist, but does not throw.
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Throws in production if any production secret is missing, too short, or conflicting.
 * In development, emits a prominent warning.
 */
export function assertProductionSecretsValid(env: NodeJS.ProcessEnv = process.env): void {
  const result = validateProductionSecrets(env);
  if (!result.valid) {
    if (env.NODE_ENV === "production") {
      throw new Error(`Production secret validation failed:\n- ${result.errors.join("\n- ")}`);
    } else {
      console.warn(`[Secrets] Development Warning:\n- ${result.errors.join("\n- ")}`);
    }
  }
}
