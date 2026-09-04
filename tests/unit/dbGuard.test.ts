import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { assertTestDatabaseEnv } from "../integration/dbGuard";

describe("Database Integration Safety Guard", () => {
  const origEnv = process.env.RUN_DB_INTEGRATION;

  beforeEach(() => {
    process.env.RUN_DB_INTEGRATION = "true";
  });

  afterEach(() => {
    if (origEnv !== undefined) {
      process.env.RUN_DB_INTEGRATION = origEnv;
    } else {
      delete process.env.RUN_DB_INTEGRATION;
    }
  });

  it("should pass when RUN_DB_INTEGRATION is disabled regardless of URL", () => {
    process.env.RUN_DB_INTEGRATION = "false";
    expect(() => assertTestDatabaseEnv(undefined)).not.toThrow();
    expect(() => assertTestDatabaseEnv("postgresql://postgres@localhost:5432/palate_prod")).not.toThrow();
  });

  it("should fail when TEST_DATABASE_URL is missing or empty", () => {
    expect(() => assertTestDatabaseEnv(undefined)).toThrow(
      "FATAL: RUN_DB_INTEGRATION is true but TEST_DATABASE_URL is not provided."
    );
    expect(() => assertTestDatabaseEnv("")).toThrow(
      "FATAL: RUN_DB_INTEGRATION is true but TEST_DATABASE_URL is not provided."
    );
    expect(() => assertTestDatabaseEnv("   ")).toThrow(
      "FATAL: RUN_DB_INTEGRATION is true but TEST_DATABASE_URL is not provided."
    );
  });

  it("should fail when TEST_DATABASE_URL is malformed", () => {
    expect(() => assertTestDatabaseEnv("not-a-valid-url")).toThrow(
      /FATAL: Malformed TEST_DATABASE_URL:/
    );
    expect(() => assertTestDatabaseEnv("http://:invalid")).toThrow(
      /FATAL: Malformed TEST_DATABASE_URL:/
    );
  });

  it("should fail for all database names other than 'palate_test'", () => {
    const nonTestDatabases = [
      "postgresql://user:pass@localhost:5432/palate",
      "postgresql://user:pass@localhost:5432/palate_prod",
      "postgresql://user:pass@localhost:5432/palate_staging",
      "postgresql://user:pass@localhost:5432/postgres",
      "postgresql://user:pass@localhost:5432/test",
      "postgresql://user:pass@localhost:5432/palate_test_2",
      "postgresql://user:pass@localhost:5432/",
    ];

    for (const url of nonTestDatabases) {
      expect(() => assertTestDatabaseEnv(url)).toThrow(
        /FATAL: Integration tests must run strictly against database 'palate_test'/
      );
    }
  });

  it("should succeed strictly when database name is 'palate_test'", () => {
    const validUrls = [
      "postgresql://user:pass@localhost:28015/palate_test",
      "postgresql://betheenvy@localhost:28015/palate_test?schema=public",
      "postgresql://localhost:5432/palate_test",
    ];

    for (const url of validUrls) {
      expect(() => assertTestDatabaseEnv(url)).not.toThrow();
    }
  });
});
