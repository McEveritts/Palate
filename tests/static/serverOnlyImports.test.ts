import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

function getAllSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllSourceFiles(fullPath));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") || entry.name.endsWith(".js") || entry.name.endsWith(".jsx"))
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

describe("Static Architecture Checks: server-only Imports", () => {
  it("verifies that no client-facing ('use client') component imports 'server-only'", () => {
    const srcDir = path.resolve(__dirname, "../../src");
    const files = getAllSourceFiles(srcDir);

    const violations: string[] = [];

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, "utf8");
      const isClientComponent =
        content.startsWith('"use client"') ||
        content.startsWith("'use client'") ||
        content.includes('\n"use client"') ||
        content.includes("\n'use client'");

      if (isClientComponent) {
        if (
          content.includes('import "server-only"') ||
          content.includes("import 'server-only'") ||
          content.includes('from "server-only"') ||
          content.includes("from 'server-only'") ||
          content.includes('require("server-only")') ||
          content.includes("require('server-only')")
        ) {
          violations.push(path.relative(srcDir, filePath));
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
