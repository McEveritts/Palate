import { describe, it, expect, vi } from "vitest";
import {
  validateProductionSecrets,
  assertProductionSecretsValid,
} from "@/lib/secrets";

describe("Production Secret Separation and Startup Validation", () => {
  const validSecrets = {
    NODE_ENV: "production",
    NEXTAUTH_SECRET: "11111111111111111111111111111111",
    PALATE_ENCRYPTION_SECRET: "22222222222222222222222222222222",
    PALATE_RATE_LIMIT_SECRET: "33333333333333333333333333333333",
    CRON_SECRET: "44444444444444444444444444444444",
  };

  it("succeeds when all four secrets are present, >= 32 chars, and pairwise distinct", () => {
    const result = validateProductionSecrets(validSecrets as any);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(() => assertProductionSecretsValid(validSecrets as any)).not.toThrow();
  });

  it("fails when any required secret is missing in production", () => {
    const missingOne = { ...validSecrets, PALATE_ENCRYPTION_SECRET: undefined };
    const result = validateProductionSecrets(missingOne as any);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Missing required production secret: PALATE_ENCRYPTION_SECRET"))).toBe(true);
    expect(() => assertProductionSecretsValid(missingOne as any)).toThrow(/Production secret validation failed/);
  });

  it("fails when any required secret is shorter than 32 characters in production", () => {
    const shortOne = { ...validSecrets, CRON_SECRET: "too-short-secret" };
    const result = validateProductionSecrets(shortOne as any);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("CRON_SECRET is too short"))).toBe(true);
    expect(() => assertProductionSecretsValid(shortOne as any)).toThrow(/Production secret validation failed/);
  });

  it("fails when any two secrets share the same value (duplicated)", () => {
    const duplicated = {
      ...validSecrets,
      PALATE_RATE_LIMIT_SECRET: validSecrets.PALATE_ENCRYPTION_SECRET,
    };
    const result = validateProductionSecrets(duplicated as any);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("PALATE_ENCRYPTION_SECRET and PALATE_RATE_LIMIT_SECRET must not share the same value"))).toBe(true);
    expect(() => assertProductionSecretsValid(duplicated as any)).toThrow(/Production secret validation failed/);
  });

  it("warns in development instead of throwing when secrets are invalid", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const devEnv = {
      NODE_ENV: "development",
      NEXTAUTH_SECRET: "short",
    };

    expect(() => assertProductionSecretsValid(devEnv as any)).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[Secrets] Development Warning:"));
    warnSpy.mockRestore();
  });
});
