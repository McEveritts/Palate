import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  SAGE_MODEL,
  SAGE_THINKING_CONFIG,
  SAGE_JSON_THINKING_CONFIG,
  createGenAIClient,
} from "@/lib/ai/model-config";
import { ThinkingLevel } from "@google/genai";

describe("SageAI Model Configuration", () => {
  const originalEnvKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    if (originalEnvKey !== undefined) {
      process.env.GEMINI_API_KEY = originalEnvKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  });

  it("configures SAGE_MODEL strictly as gemini-3.8-flash", () => {
    expect(SAGE_MODEL).toBe("gemini-3.8-flash");
  });

  it("configures SAGE_THINKING_CONFIG with HIGH thinkingLevel and includeThoughts true", () => {
    expect(SAGE_THINKING_CONFIG.thinkingConfig.thinkingLevel).toBe(ThinkingLevel.HIGH);
    expect(SAGE_THINKING_CONFIG.thinkingConfig.includeThoughts).toBe(true);
  });

  it("configures SAGE_JSON_THINKING_CONFIG with MINIMAL thinkingLevel and includeThoughts false", () => {
    expect(SAGE_JSON_THINKING_CONFIG.thinkingConfig.thinkingLevel).toBe(ThinkingLevel.MINIMAL);
    expect(SAGE_JSON_THINKING_CONFIG.thinkingConfig.includeThoughts).toBe(false);
  });

  it("creates GoogleGenAI instance when passed an explicit API key", () => {
    const client = createGenAIClient("test-explicit-key");
    expect(client).toBeDefined();
    expect(client.models).toBeDefined();
  });

  it("creates GoogleGenAI instance when fallback env var GEMINI_API_KEY is present", () => {
    process.env.GEMINI_API_KEY = "test-env-key";
    const client = createGenAIClient();
    expect(client).toBeDefined();
    expect(client.models).toBeDefined();
  });

  it("throws descriptive error when no API key is provided and env var is unset", () => {
    expect(() => createGenAIClient()).toThrow("GEMINI_API_KEY is not configured.");
  });
});
