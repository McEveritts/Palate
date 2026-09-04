import { NextResponse } from 'next/server';
import { globalMacroCache, MacroData } from '@/lib/macroCache';
import { SAGE_MODEL, SAGE_JSON_THINKING_CONFIG, createGenAIClient } from '@/lib/ai/model-config';
import fs, { mkdir } from 'fs/promises';
import path from 'path';

interface USDANutrient {
  nutrientId: number;
  nutrientName: string;
  value: number;
}

// Helper to extract a nutrient value by typical IDs or name patterns
function extractNutrient(nutrients: USDANutrient[], ids: number[], names: string[]): string {
  const nutrient = nutrients.find(n => 
    ids.includes(n.nutrientId) || 
    names.some(name => n.nutrientName.toLowerCase().includes(name.toLowerCase()))
  );
  
  if (!nutrient) return `0.0`;
  const val = Math.round(nutrient.value * 100) / 100;
  return `${val}`;
}

async function writeToLocalMacros(macro: MacroData) {
  const filePath = path.join(process.cwd(), 'vault', 'macros', 'USDA_Imports.md');
  const headers = `| **Ingredient** | **Calories** | **Protein** | **Carbs** | **Fat** | **Fiber** | **Sugar** | **Sodium** | **Common Portions** |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |`;

  // H-6: Ensure directory exists before any file operations
  await mkdir(path.dirname(filePath), { recursive: true });
  
  let fileExists = false;
  try {
    await fs.access(filePath);
    fileExists = true;
  } catch {}

    // H6 Fix: Prevent disk exhaustion — 2MB hard limit on USDA_Imports.md
    if (fileExists) {
      const stats = await fs.stat(filePath);
      if (stats.size > 2 * 1024 * 1024) {
        console.warn('USDA_Imports.md exceeds 2MB limit. Skipping disk write.');
        return;
      }
    }

  const row = `| ${macro.ingredient_matched} | ${macro.calories}kcal | ${macro.protein}g | ${macro.carbs}g | ${macro.fat}g | ${macro.fiber || '0.00'}g | ${macro.sugar || '0.00'}g | ${macro.sodium || '0.0'}mg | ${macro.common_portions || '100g (100.0g)'} |`;

  if (!fileExists) {
    const fileContent = `# USDA Imports
${headers}
${row}
`;
    await fs.writeFile(filePath, fileContent, 'utf-8');
  } else {
    // Ensure the file ends with a newline before appending
    const existingContent = await fs.readFile(filePath, 'utf-8');
    const endsWithNewline = existingContent.endsWith('\n');
    await fs.appendFile(filePath, `${endsWithNewline ? '' : '\n'}${row}\n`, 'utf-8');
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ingredient = searchParams.get('ingredient') || searchParams.get('query');

    if (!ingredient || typeof ingredient !== 'string') {
      return NextResponse.json({ success: false, error: 'Ingredient query parameter is required' }, { status: 400 });
    }

    const trimmedIngredient = ingredient.trim();
    const macrosDir = path.join(process.cwd(), 'vault', 'macros');

    // 1. Local Cache Lookup
    const cache = globalMacroCache.get(macrosDir);
    let bestMatch: MacroData | null = null;
    const searchTerms = trimmedIngredient.toLowerCase().replace(/ground|fresh|raw|dried|frozen|cooked|boneless|skinless|organic/g, '').trim().split(/\s+/);
    const validTerms = searchTerms.filter(t => t.length > 0);

    if (validTerms.length > 0) {
      for (const item of cache) {
        const itemIngredient = item.ingredient_matched.toLowerCase();
        const matches = validTerms.every(term => itemIngredient.includes(term));
        if (matches) {
          bestMatch = item;
          break;
        }
      }
    }

    if (bestMatch) {
      return NextResponse.json({
        success: true,
        source: 'local_cache',
        data: bestMatch
      });
    }

    // 2. Fallback to USDA FoodData Central API
    const usdaApiKey = process.env.USDA_API_KEY || "DEMO_KEY";
    // L3 Fix: Warn about restricted USDA rate limits when using DEMO_KEY
    if (!process.env.USDA_API_KEY || usdaApiKey === 'DEMO_KEY') {
      console.warn('WARNING: Using USDA DEMO_KEY. Rate limits will be severely restricted (40 req/hour).');
    }
    const usdaUrl = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${usdaApiKey}&query=${encodeURIComponent(trimmedIngredient)}&pageSize=1`;

    let newMacro: MacroData;
    let source = 'usda_api';

    try {
      const response = await fetch(usdaUrl);
      if (!response.ok || response.status === 429) {
        throw new Error(`USDA API responded with status ${response.status}`);
      }

      const result = await response.json();
      if (!result.foods || result.foods.length === 0) {
        return NextResponse.json({ 
          success: false, 
          error: `No food matches found in USDA Central for "${trimmedIngredient}"` 
        }, { status: 404 });
      }

      const food = result.foods[0];
      const nutrients = food.foodNutrients || [];

      // Parse nutrients per 100g
      const caloriesVal = extractNutrient(nutrients, [1008], ["energy"]);
      const proteinVal = extractNutrient(nutrients, [1003], ["protein"]);
      const carbsVal = extractNutrient(nutrients, [1005], ["carbohydrate"]);
      const fatVal = extractNutrient(nutrients, [1004], ["lipid", "fat"]);
      const fiberVal = extractNutrient(nutrients, [1079], ["fiber"]);
      const sugarVal = extractNutrient(nutrients, [2000, 1063], ["sugar"]);
      const sodiumVal = extractNutrient(nutrients, [1093], ["sodium"]);

      // Standardize title/description (capitalize nicely)
      const formattedName = food.description
        .toLowerCase()
        .split(' ')
        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      newMacro = {
        ingredient_matched: formattedName,
        calories: caloriesVal,
        protein: proteinVal,
        carbs: carbsVal,
        fat: fatVal,
        fiber: fiberVal,
        sugar: sugarVal,
        sodium: sodiumVal,
        common_portions: '100g (100.0g)'
      };

      // 3. Write-back to local vault
      await writeToLocalMacros(newMacro);
    } catch (error: unknown) {
      console.warn(`[USDA API Error]: Request failed for "${trimmedIngredient}". Triggering Gemini fallback.`, error);

      try {
        const ai = createGenAIClient();

        // M-17: Sanitize ingredient to prevent prompt injection
        const sanitized = trimmedIngredient.replace(/["\\]/g, '').slice(0, 100);

        const prompt = `You are a strict nutrition database. Estimate the macronutrient profile per 100g for the raw ingredient: "${sanitized}".
Return ONLY a valid JSON object matching this exact schema, with no markdown formatting or text:
{"calories": <number>, "protein": <number>, "carbs": <number>, "fat": <number>}`;

        const result = await ai.models.generateContent({
          model: SAGE_MODEL,
          contents: prompt,
          config: {
            ...SAGE_JSON_THINKING_CONFIG,
          },
        });
        let text = (result.text || '').trim();

        // Clean potential markdown fences
        text = text.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
        const estimatedMacros = JSON.parse(text);

        newMacro = {
          ingredient_matched: `${trimmedIngredient} (AI Estimated)`,
          calories: String(estimatedMacros.calories),
          protein: String(estimatedMacros.protein),
          carbs: String(estimatedMacros.carbs),
          fat: String(estimatedMacros.fat),
          fiber: '0.00',
          sugar: '0.00',
          sodium: '0.0',
          common_portions: '100g (100.0g)'
        };

        source = 'ai_fallback';

        // 2. Self-heal: Cache to local vault
        await writeToLocalMacros(newMacro);
      } catch (llmError) {
        console.error("[Nutrition AI Fallback Error]:", llmError);
        return NextResponse.json({ success: false, error: "Nutrition data unavailable." }, { status: 500 });
      }
    }

    // 4. Invalidate globalMacroCache so it is reloaded next time
    globalMacroCache.invalidate();

    return NextResponse.json({
      success: true,
      source: source,
      data: newMacro
    });

  } catch (error: unknown) {
    console.error('[Nutrition API Error]:', error);
    return NextResponse.json({ success: false, error: 'An unexpected error occurred while fetching nutrition data.' }, { status: 500 });
  }
}
