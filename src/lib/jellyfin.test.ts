import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isJellyfinEnabled, getJellyfinBaseUrl, authenticateWithJellyfin } from "./jellyfin";
import { APP_VERSION } from "./version";

describe("Jellyfin Auth Client", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("Configuration & URL Validation", () => {
    it("is disabled by default when env vars are unset", () => {
      delete process.env.JELLYFIN_LOGIN_ENABLED;
      delete process.env.JELLYFIN_URL;
      delete process.env.JELLYFIN_INTERNAL_URL;
      expect(isJellyfinEnabled()).toBe(false);
    });

    it("is disabled when JELLYFIN_LOGIN_ENABLED is not 'true'", () => {
      process.env.JELLYFIN_LOGIN_ENABLED = "false";
      process.env.JELLYFIN_URL = "https://jellyfin.example.com";
      expect(isJellyfinEnabled()).toBe(false);
    });

    it("is disabled when URL is malformed or has invalid scheme", () => {
      process.env.JELLYFIN_LOGIN_ENABLED = "true";
      process.env.JELLYFIN_URL = "javascript:alert(1)";
      expect(isJellyfinEnabled()).toBe(false);

      process.env.JELLYFIN_URL = "not-a-valid-url";
      expect(isJellyfinEnabled()).toBe(false);

      delete process.env.JELLYFIN_URL;
      delete process.env.JELLYFIN_INTERNAL_URL;
      expect(isJellyfinEnabled()).toBe(false);
    });

    it("is enabled with valid HTTP/HTTPS URL and strips trailing slash", () => {
      process.env.JELLYFIN_LOGIN_ENABLED = "true";
      process.env.JELLYFIN_URL = "https://jellyfin.example.com///";
      expect(isJellyfinEnabled()).toBe(true);
      expect(getJellyfinBaseUrl()).toBe("https://jellyfin.example.com");
    });

    it("prefers JELLYFIN_INTERNAL_URL over JELLYFIN_URL", () => {
      process.env.JELLYFIN_LOGIN_ENABLED = "true";
      process.env.JELLYFIN_URL = "https://public.jellyfin.com";
      process.env.JELLYFIN_INTERNAL_URL = "http://127.0.0.1:8096/";
      expect(isJellyfinEnabled()).toBe(true);
      expect(getJellyfinBaseUrl()).toBe("http://127.0.0.1:8096");
    });
  });

  describe("authenticateWithJellyfin", () => {
    beforeEach(() => {
      process.env.JELLYFIN_LOGIN_ENABLED = "true";
      process.env.JELLYFIN_URL = "https://jellyfin.example.com";
    });

    it("returns InvalidCredentials when username is blank", async () => {
      const result = await authenticateWithJellyfin("   ", "password");
      expect(result).toEqual({ success: false, error: "InvalidCredentials" });
    });

    it("successfully authenticates with modern header and calls logout session in finally", async () => {
      const fetchMock = vi.fn()
        // Auth response
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            User: {
              Id: "jf-user-123",
              Name: "Chef Gordon",
              Policy: { IsDisabled: false },
            },
            ServerId: "jf-server-456",
            AccessToken: "test-token-789",
          }),
        })
        // Logout response
        .mockResolvedValueOnce({
          ok: true,
          status: 204,
        });

      global.fetch = fetchMock;

      const result = await authenticateWithJellyfin("Gordon", "michelin123");

      expect(result).toEqual({
        success: true,
        data: {
          jellyfinUserId: "jf-user-123",
          jellyfinServerId: "jf-server-456",
          jellyfinUsername: "Chef Gordon",
        },
      });

      // Verify modern auth header on authenticate request
      expect(fetchMock).toHaveBeenCalledWith(
        "https://jellyfin.example.com/Users/AuthenticateByName",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `MediaBrowser Client="Palate", Device="Palate Web", DeviceId="palate-web", Version="${APP_VERSION}"`,
          },
          body: JSON.stringify({ Username: "Gordon", Pw: "michelin123" }),
        })
      );

      // Verify modern auth header on session logout request with token
      expect(fetchMock).toHaveBeenCalledWith(
        "https://jellyfin.example.com/Sessions/Logout",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Authorization": `MediaBrowser Client="Palate", Device="Palate Web", DeviceId="palate-web", Version="${APP_VERSION}", Token="test-token-789"`,
          },
        })
      );
    });

    it("captures access token and calls session logout even when account is disabled", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            User: {
              Id: "jf-user-disabled",
              Name: "Disabled Chef",
              Policy: { IsDisabled: true },
            },
            ServerId: "jf-server-456",
            AccessToken: "token-for-disabled-user",
          }),
        })
        .mockResolvedValueOnce({ ok: true, status: 204 });

      global.fetch = fetchMock;

      const result = await authenticateWithJellyfin("DisabledChef", "pass");

      expect(result).toEqual({ success: false, error: "AccountDisabled" });

      // Ensure logout was still called with the token issued to the disabled account
      expect(fetchMock).toHaveBeenCalledWith(
        "https://jellyfin.example.com/Sessions/Logout",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Authorization": `MediaBrowser Client="Palate", Device="Palate Web", DeviceId="palate-web", Version="${APP_VERSION}", Token="token-for-disabled-user"`,
          },
        })
      );
    });

    it("survives failed session logout (best-effort non-fatal cleanup)", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            User: {
              Id: "jf-user-123",
              Name: "Chef Gordon",
              Policy: { IsDisabled: false },
            },
            ServerId: "jf-server-456",
            AccessToken: "test-token-789",
          }),
        })
        .mockRejectedValueOnce(new Error("Network connection dropped during logout"));

      global.fetch = fetchMock;

      const result = await authenticateWithJellyfin("Gordon", "michelin123");

      expect(result.success).toBe(true);
    });

    it("aborts stalled request after 6000ms timeout using fake timers", async () => {
      vi.useFakeTimers();

      try {
        const fetchMock = vi.fn().mockImplementation((_url, options) => {
          return new Promise((_resolve, reject) => {
            if (options?.signal) {
              options.signal.addEventListener("abort", () => {
                const abortErr = new Error("The operation was aborted");
                abortErr.name = "AbortError";
                reject(abortErr);
              });
            }
          });
        });

        global.fetch = fetchMock;

        const authPromise = authenticateWithJellyfin("SlowUser", "SlowPass");

        expect(fetchMock).toHaveBeenCalled();
        const passedOptions = fetchMock.mock.calls[0][1];
        expect(passedOptions.signal).toBeDefined();

        // Advance timers past the 6000ms timeout threshold
        await vi.advanceTimersByTimeAsync(6000);

        const result = await authPromise;
        expect(result).toEqual({ success: false, error: "JellyfinUnavailable" });
      } finally {
        vi.useRealTimers();
      }
    });

    it("returns InvalidCredentials on 401 Unauthorized", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const result = await authenticateWithJellyfin("WrongUser", "BadPassword");
      expect(result).toEqual({ success: false, error: "InvalidCredentials" });
    });

    it("returns JellyfinUnavailable on 500 server error", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await authenticateWithJellyfin("User", "Pass");
      expect(result).toEqual({ success: false, error: "JellyfinUnavailable" });
    });
  });
});
