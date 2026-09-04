// ── Centralized Model Configuration for SageAI ─────────────────────────────
// Single source of truth for the AI model name and thinking configuration.
// All endpoints must import from here — never hardcode the model name.

import { GoogleGenAI, ThinkingLevel } from "@google/genai";

/**
 * The primary model used across all SageAI endpoints.
 * Migrated to Gemini 3.8 Flash (`gemini-3.8-flash`).
 */
export const SAGE_MODEL = "gemini-3.8-flash";

/**
 * Thinking configuration for endpoints that stream reasoning to the UI.
 * Uses "high" thinkingLevel for maximum culinary intelligence and deep reasoning.
 * `includeThoughts: true` ensures the reasoning trace is returned in
 * response parts so the server can relay it to the client.
 */
export const SAGE_THINKING_CONFIG = {
  thinkingConfig: {
    thinkingLevel: ThinkingLevel.HIGH,
    includeThoughts: true,
  },
};

/**
 * Thinking configuration for fast transactional logging operations (food, hydration, weight, exercise).
 * Uses "minimal" thinkingLevel for near-instant response time while preserving
 * a brief 1-line reasoning trace.
 */
export const SAGE_LOGGING_THINKING_CONFIG = {
  thinkingConfig: {
    thinkingLevel: ThinkingLevel.MINIMAL,
    includeThoughts: true,
  },
};

/**
 * Thinking configuration for endpoints that return structured JSON only.
 * Thinking is minimized to save cost and avoid thought text polluting
 * JSON output. The reasoning output is NOT returned.
 */
export const SAGE_JSON_THINKING_CONFIG = {
  thinkingConfig: {
    thinkingLevel: ThinkingLevel.LOW,
    includeThoughts: false,
  },
};

/**
 * Creates a GoogleGenAI client instance.
 * Centralizes client creation so API key handling is consistent.
 */
export function createGenAIClient(apiKey?: string): GoogleGenAI {
  const key = apiKey || process.env.GEMINI_API_KEY || "";
  if (!key) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  return new GoogleGenAI({ apiKey: key });
}
