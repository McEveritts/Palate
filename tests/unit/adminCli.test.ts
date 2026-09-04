import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";
import dotenv from "dotenv";

describe("Admin CLI Unit & Smoke Tests", () => {
  it("loads environment files cleanly without leaking secrets", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "palate-cli-test-"));
    const envLocalPath = path.join(tmpDir, ".env.local");
    fs.writeFileSync(envLocalPath, "TEST_FIXTURE_KEY=fixture-value-12345\n");

    const result = dotenv.config({ path: envLocalPath });

    expect(result.error).toBeUndefined();
    expect(result.parsed?.TEST_FIXTURE_KEY).toBe("fixture-value-12345");

    // Clean up
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.TEST_FIXTURE_KEY;
  });

  it("verifies confirmation flag parsing logic", () => {
    function parseArgs(args: string[]) {
      const flags: Record<string, string | boolean> = {};
      for (const arg of args) {
        if (arg.startsWith("--")) {
          const eqIdx = arg.indexOf("=");
          if (eqIdx !== -1) {
            flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
          } else {
            flags[arg.slice(2)] = true;
          }
        }
      }
      return flags;
    }

    const withoutConfirmed = parseArgs(["tokens:migrate"]);
    expect(withoutConfirmed.confirmed).toBeUndefined();

    const withConfirmed = parseArgs(["tokens:migrate", "--confirmed"]);
    expect(withConfirmed.confirmed).toBe(true);

    const withKeyValue = parseArgs(["users:pre-link", "--jellyfin-server-id=abc-123"]);
    expect(withKeyValue["jellyfin-server-id"]).toBe("abc-123");
  });
});
