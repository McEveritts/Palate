import { describe, it, expect } from "vitest";
import packageJson from "../package.json";
import { APP_VERSION } from "@/lib/version";
import { JELLYFIN_CLIENT_HEADER } from "@/lib/jellyfin";
import fs from "fs";
import path from "path";

describe("Release Version Agreement (v1.5.23)", () => {
  const TARGET_VERSION = "1.5.23";

  it("package.json version matches target version exactly", () => {
    expect(packageJson.version).toBe(TARGET_VERSION);
  });

  it("APP_VERSION constant matches target version exactly", () => {
    expect(APP_VERSION).toBe(TARGET_VERSION);
  });

  it("JELLYFIN_CLIENT_HEADER includes exact target version", () => {
    expect(JELLYFIN_CLIENT_HEADER).toContain(`Version="${TARGET_VERSION}"`);
  });

  it("Release notes document exists and references target version", () => {
    const releaseDocPath = path.resolve(__dirname, "../docs/releases/v1.5.23.md");
    expect(fs.existsSync(releaseDocPath)).toBe(true);

    const content = fs.readFileSync(releaseDocPath, "utf8");
    expect(content).toContain(`v${TARGET_VERSION}`);
    expect(content).toContain(`\`${TARGET_VERSION}\``);
  });
});

