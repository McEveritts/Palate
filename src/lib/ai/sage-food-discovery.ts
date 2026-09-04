/**
 * Sage Food Discovery — Task-Specific AI Prompt for Fitness Food Search
 *
 * This module provides a dedicated Sage variant tuned exclusively for
 * estimating nutritional profiles of composite meals and foods that
 * are NOT in the USDA database or local vault cache.
 *
 * Pattern: Follows the per-section Sage prompt architecture
 *   - Ask Sage (chat)     → src/lib/sage.ts
 *   - Wellness Coach      → src/app/api/sage/wellness/route.ts
 *   - Meal Scanner        → src/app/api/sage/meal-scan/route.ts
 *   - Food Discovery      → THIS FILE ← NEW
 */

import { SAGE_MODEL, SAGE_JSON_THINKING_CONFIG, createGenAIClient } from './model-config';
import fs from 'fs/promises';
import path from 'path';
import { globalMacroCache } from '../macroCache';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SageFoodEstimate {
  id: string;
  name: string;
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  servingSize: string;
  confidence: 'high' | 'medium' | 'low';
}

interface SageRawEstimate {
  name: string;
  description?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  servingSize?: string;
  serving_size?: string;
  confidence?: string;
}

// ── System Prompt (RL'd for Food Discovery) ────────────────────────────────────

const FOOD_DISCOVERY_SYSTEM_PROMPT = `[SYSTEM INSTRUCTION]
You are Sage, the nutritional analysis engine for 'Palate', a professional culinary application.
You are operating in FOOD DISCOVERY mode — your sole task is to estimate accurate macronutrient profiles for composite meals, prepared dishes, and foods that are not found in standard ingredient databases (USDA FoodData Central).

[CORE DIRECTIVES]
1. DECOMPOSITION: When given a composite food name (e.g., "Cranberry Pecan Chicken Salad"), you MUST mentally decompose it into its likely constituent ingredients, estimate the quantity of each ingredient in a typical serving, and compute the aggregate nutritional profile.

2. CULINARY KNOWLEDGE: Apply your deep culinary training data to infer:
   - Standard ingredient ratios for named dishes
   - Typical preparation methods and their caloric impact (grilled vs fried, dressed vs undressed)
   - Regional/cultural variations when the name is ambiguous

3. MACRO COHERENCE: Your estimated macros MUST be mathematically coherent:
   - Protein × 4 + Carbs × 4 + Fat × 9 ≈ Total Calories (±10% tolerance)
   - If the math doesn't add up, recalculate before outputting

4. PORTION REALISM: Estimate for a single, realistic adult serving size. Include the estimated weight in grams.

5. CONFIDENCE SCORING: Rate your confidence as:
   - "high": Well-known dishes with standardized recipes (e.g., Caesar Salad, Margherita Pizza)
   - "medium": Recognizable dishes with ingredient variation (e.g., Cranberry Pecan Chicken Salad)
   - "low": Ambiguous or highly variable preparations (e.g., "Mom's Special Casserole")

6. MULTIPLE INTERPRETATIONS: If the food name could refer to different preparations, return the most common interpretation as the primary result.

[OUTPUT FORMAT]
You MUST return a JSON array of 1-3 food estimates. Each object matches:
{
  "name": string,          // Clean, properly capitalized food name
  "description": string,   // Brief 1-line description of what the dish likely contains
  "calories": number,      // Total estimated kcal per serving
  "protein": number,       // Grams of protein
  "carbs": number,         // Grams of carbohydrates
  "fat": number,           // Grams of fat
  "fiber": number,         // Grams of fiber
  "sugar": number,         // Grams of sugar
  "sodium": number,        // Milligrams of sodium
  "servingSize": string,   // e.g. "1 bowl (approx 350g)"
  "confidence": string     // "high", "medium", or "low"
}

[CRITICAL RULES]
- Output MUST be a valid JSON array starting with [ and ending with ].
- Do NOT output markdown, HTML, system explanations, thought tags, or reasoning.
- Do NOT return more than 3 results.
- Do NOT return fewer than 1 result.
- Macros must be non-negative numbers rounded to 1 decimal place.
- Sodium is in milligrams, everything else in grams/kcal.
- If the query is clearly NOT a food item, return a single result with all macros set to 0 and confidence "low".

[NEGATIVE EXAMPLES — DO NOT DO THIS]
- Do NOT return per-100g values. Return per-serving values.
- Do NOT return raw ingredient macros. Return the complete dish macros.
- Do NOT include cooking oil or garnish unless they are a defining component.
- Do NOT output \`\`\`json fences or any text outside the JSON array.`;

// ── Sage Estimates Cache Path ──────────────────────────────────────────────────

const MACROS_DIR = path.join(process.cwd(), 'vault', 'macros');
const SAGE_ESTIMATES_FILE = path.join(MACROS_DIR, 'Sage_Estimates.md');

// ── Core Function ──────────────────────────────────────────────────────────────

/**
 * Asks Sage to estimate nutritional data for a composite food query.
 * Returns structured estimates with confidence scores.
 *
 * @param query - The food search query (e.g., "Cranberry Pecan Chicken Salad")
 * @param apiKey - Google AI API key (client or server-side)
 * @returns Array of SageFoodEstimate objects, or empty array on failure
 */
export async function estimateFoodNutrition(
  query: string,
  apiKey?: string,
): Promise<SageFoodEstimate[]> {
  const finalApiKey = apiKey || process.env.GEMINI_API_KEY || '';
  if (!finalApiKey) {
    console.warn('[SageFoodDiscovery] No API key available for AI estimation.');
    return [];
  }

  try {
    const ai = createGenAIClient(finalApiKey);

    // Sanitize input to prevent prompt injection
    const sanitized = query
      .replace(/[<>{}[\]\\]/g, '')
      .replace(/\b(ignore|override|system|instruction|prompt)\b/gi, '')
      .slice(0, 200);

    const result = await ai.models.generateContent({
      model: SAGE_MODEL,
      contents: `Respond ONLY with a JSON array, no other text. Estimate the full nutritional profile for: "${sanitized}"`,
      config: {
        systemInstruction: FOOD_DISCOVERY_SYSTEM_PROMPT,
        ...SAGE_JSON_THINKING_CONFIG,
      },
    });
    const text = (result.text || '').trim();

    // Robust JSON extraction — Gemini may wrap JSON in markdown fences or prepend reasoning
    let parsed: SageRawEstimate[];
    try {
      // Strategy 1: Try direct parse (ideal case)
      const raw = JSON.parse(text);
      parsed = Array.isArray(raw) ? raw : [raw];
    } catch {
      // Strategy 2: Extract JSON array from mixed text output
      // Look for the first [ ... ] block (greedy, handles nested objects)
      let jsonStr: string | null = null;

      // Try to find ```json ... ``` fenced block first
      const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fencedMatch) {
        jsonStr = fencedMatch[1].trim();
      }

      // Otherwise find the first [ ... ] that looks like a JSON array
      if (!jsonStr) {
        const bracketStart = text.indexOf('[');
        const bracketEnd = text.lastIndexOf(']');
        if (bracketStart !== -1 && bracketEnd > bracketStart) {
          jsonStr = text.slice(bracketStart, bracketEnd + 1);
        }
      }

      if (!jsonStr) {
        console.error('[SageFoodDiscovery] No JSON found in AI response:', text.slice(0, 300));
        return [];
      }

      try {
        const raw = JSON.parse(jsonStr);
        parsed = Array.isArray(raw) ? raw : [raw];
      } catch {
        console.error('[SageFoodDiscovery] Failed to parse extracted JSON:', jsonStr.slice(0, 300));
        return [];
      }
    }

    // Validate and normalize each estimate
    const estimates: SageFoodEstimate[] = [];
    for (let i = 0; i < Math.min(parsed.length, 3); i++) {
      const item = parsed[i];
      if (!item || typeof item.calories !== 'number') continue;

      // Enforce macro coherence — flag if math is off by more than 15%
      const computedCals = (item.protein || 0) * 4 + (item.carbs || 0) * 4 + (item.fat || 0) * 9;
      const reportedCals = item.calories || 0;
      if (reportedCals > 0 && Math.abs(computedCals - reportedCals) / reportedCals > 0.15) {
        console.warn(
          `[SageFoodDiscovery] Macro incoherence detected for "${item.name}": ` +
          `computed=${computedCals.toFixed(0)} vs reported=${reportedCals}. Adjusting calories.`
        );
        // Trust the macros, recalculate calories
        item.calories = Math.round(computedCals);
      }

      estimates.push({
        id: `sage-${i}-${Date.now()}`,
        name: item.name || sanitized,
        description: item.description || '',
        calories: Math.round(item.calories * 10) / 10,
        protein: Math.round((item.protein || 0) * 10) / 10,
        carbs: Math.round((item.carbs || 0) * 10) / 10,
        fat: Math.round((item.fat || 0) * 10) / 10,
        fiber: Math.round((item.fiber || 0) * 10) / 10,
        sugar: Math.round((item.sugar || 0) * 10) / 10,
        sodium: Math.round(item.sodium || 0),
        servingSize: item.servingSize || item.serving_size || '1 serving',
        confidence: (['high', 'medium', 'low'].includes(item.confidence || '')
          ? item.confidence as 'high' | 'medium' | 'low'
          : 'medium'),
      });
    }

    // Cache the primary estimate to vault for future lookups
    if (estimates.length > 0) {
      await cacheSageEstimate(estimates[0]);
    }

    return estimates;
  } catch (error) {
    console.error('[SageFoodDiscovery] AI estimation failed:', error);
    return [];
  }
}

// ── Vault Cache Write-Back ─────────────────────────────────────────────────────

/**
 * Persists a Sage estimate to vault/macros/Sage_Estimates.md
 * Keeps AI-estimated data separate from USDA-verified data.
 */
async function cacheSageEstimate(estimate: SageFoodEstimate): Promise<void> {
  try {
    await fs.mkdir(MACROS_DIR, { recursive: true });

    // Sanitize name for Markdown table (no pipes or newlines)
    const safeName = estimate.name.replace(/[|\n\r]/g, ' ').trim();

    const header =
      '# Sage AI Estimates\n' +
      '| **Ingredient** | **Calories** | **Protein** | **Carbs** | **Fat** | **Fiber** | **Sugar** | **Sodium** | **Common Portions** |\n' +
      '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n';

    const row =
      `| ${safeName} (Sage Est.) | ${estimate.calories}kcal | ${estimate.protein}g | ` +
      `${estimate.carbs}g | ${estimate.fat}g | ${estimate.fiber}g | ` +
      `${estimate.sugar}g | ${estimate.sodium}mg | ${estimate.servingSize} |\n`;

    let fileExists = false;
    try {
      await fs.access(SAGE_ESTIMATES_FILE);
      fileExists = true;
    } catch { /* file doesn't exist yet */ }

    if (fileExists) {
      // Size guard: 1MB limit for Sage estimates
      const stats = await fs.stat(SAGE_ESTIMATES_FILE);
      if (stats.size > 1 * 1024 * 1024) {
        console.warn('[SageFoodDiscovery] Sage_Estimates.md exceeds 1MB. Skipping cache write.');
        return;
      }

      // Check for duplicate before appending
      const content = await fs.readFile(SAGE_ESTIMATES_FILE, 'utf8');
      if (content.toLowerCase().includes(safeName.toLowerCase())) {
        return; // Already cached
      }

      await fs.appendFile(SAGE_ESTIMATES_FILE, row, 'utf8');
    } else {
      await fs.writeFile(SAGE_ESTIMATES_FILE, header + row, 'utf8');
    }

    // Invalidate the global macro cache so next text search picks up the new entry
    globalMacroCache.invalidate();
  } catch (err) {
    console.error('[SageFoodDiscovery] Failed to cache estimate:', err);
  }
}
