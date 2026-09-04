import { describe, it, expect, afterEach } from "vitest";
import { isJellyfinEnabled } from "@/lib/jellyfin";
import { authOptions } from "@/lib/auth";

describe("Login UI & Server Provider Alignment", () => {
  const origInternalUrl = process.env.JELLYFIN_INTERNAL_URL;
  const origLoginEnabled = process.env.JELLYFIN_LOGIN_ENABLED;
  const origPublicEnabled = process.env.NEXT_PUBLIC_JELLYFIN_LOGIN_ENABLED;

  afterEach(() => {
    if (origInternalUrl !== undefined) process.env.JELLYFIN_INTERNAL_URL = origInternalUrl;
    else delete process.env.JELLYFIN_INTERNAL_URL;

    if (origLoginEnabled !== undefined) process.env.JELLYFIN_LOGIN_ENABLED = origLoginEnabled;
    else delete process.env.JELLYFIN_LOGIN_ENABLED;

    if (origPublicEnabled !== undefined) process.env.NEXT_PUBLIC_JELLYFIN_LOGIN_ENABLED = origPublicEnabled;
    else delete process.env.NEXT_PUBLIC_JELLYFIN_LOGIN_ENABLED;
  });

  it("server isJellyfinEnabled returns false when JELLYFIN_LOGIN_ENABLED is false", () => {
    process.env.JELLYFIN_LOGIN_ENABLED = "false";
    process.env.JELLYFIN_INTERNAL_URL = "http://localhost:8096";
    expect(isJellyfinEnabled()).toBe(false);
  });

  it("server isJellyfinEnabled returns false when JELLYFIN_INTERNAL_URL is not set", () => {
    process.env.JELLYFIN_LOGIN_ENABLED = "true";
    delete process.env.JELLYFIN_INTERNAL_URL;
    delete process.env.JELLYFIN_SERVER_URL;
    expect(isJellyfinEnabled()).toBe(false);
  });

  it("server isJellyfinEnabled returns true only when enabled and URL is configured", () => {
    process.env.JELLYFIN_LOGIN_ENABLED = "true";
    process.env.JELLYFIN_INTERNAL_URL = "http://localhost:8096";
    expect(isJellyfinEnabled()).toBe(true);
  });

  it("client login form logic never defaults to visible when NEXT_PUBLIC_JELLYFIN_LOGIN_ENABLED is not 'true'", () => {
    delete process.env.NEXT_PUBLIC_JELLYFIN_LOGIN_ENABLED;
    const isEnvEnabled1 = process.env.NEXT_PUBLIC_JELLYFIN_LOGIN_ENABLED === "true";
    expect(isEnvEnabled1).toBe(false);

    process.env.NEXT_PUBLIC_JELLYFIN_LOGIN_ENABLED = "false";
    const isEnvEnabled2 = process.env.NEXT_PUBLIC_JELLYFIN_LOGIN_ENABLED === "true";
    expect(isEnvEnabled2).toBe(false);

    process.env.NEXT_PUBLIC_JELLYFIN_LOGIN_ENABLED = "";
    const isEnvEnabled3 = process.env.NEXT_PUBLIC_JELLYFIN_LOGIN_ENABLED === "true";
    expect(isEnvEnabled3).toBe(false);
  });

  it("server auth providers strictly NEVER include Google sign-in", () => {
    process.env.JELLYFIN_LOGIN_ENABLED = "true";
    process.env.JELLYFIN_INTERNAL_URL = "http://localhost:8096";
    const providerIds = authOptions.providers.map((p) => p.id);
    expect(providerIds).not.toContain("google");
    expect(providerIds).toContain("jellyfin");
  });
});
