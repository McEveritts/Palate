// ── Centralized Model Configuration for SageAI ─────────────────────────────
// Single source of truth for the AI model name and thinking configuration.
// All endpoints must import from here — never hardcode the model name.

import { GoogleGenAI, ThinkingLevel } from "@google/genai";

/**
 * The primary model used across all SageAI endpoints.
 * Migrated from `gemma-4-31b-it` to Gemini 3.5 Flash (June 2025).
 */
export const SAGE_MODEL = "gemini-3.5-flash";

/**
 * Thinking configuration for endpoints that stream reasoning to the UI.
 * Uses "medium" thinkingLevel for a balance of intelligence and cost.
 * `includeThoughts: true` ensures the reasoning trace is returned in
 * response parts so the server can relay it to the client.
 */
export const SAGE_THINKING_CONFIG = {
  thinkingConfig: {
    thinkingLevel: ThinkingLevel.MEDIUM,
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
    thinkingLevel: ThinkingLevel.MINIMAL,
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
