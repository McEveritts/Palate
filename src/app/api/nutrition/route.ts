import { NextResponse } from 'next/server';
import { globalMacroCache } from '@/lib/macroCache';
import fs from 'fs/promises';
import path from 'path';

interface MacroData {
  ingredient_matched: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber?: string;
  sugar?: string;
  sodium?: string;
  common_portions?: string;
}

// Helper to extract a nutrient value by typical IDs or name patterns
function extractNutrient(nutrients: any[], ids: number[], names: string[], unit: string): string {
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
  
  let fileExists = false;
  try {
    await fs.access(filePath);
    fileExists = true;
  } catch {}

  const row = `| ${macro.ingredient_matched} | ${macro.calories}kcal | ${macro.protein}g | ${macro.carbs}g | ${macro.fat}g | ${macro.fiber || '0.00'}g | ${macro.sugar || '0.00'}g | ${macro.sodium || '0.0'}mg | ${macro.common_portions || '100g (100.0g)'} |`;

  if (!fileExists) {
    const fileContent = `# USDA Imports\n${headers}\n${row}\n`;
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
    const ingredient = searchParams.get('ingredient');

    if (!ingredient || typeof ingredient !== 'string') {
      return NextResponse.json({ success: false, error: 'Ingredient query parameter is required' }, { status: 400 });
    }

    const trimmedIngredient = ingredient.trim();
    const macrosDir = path.join(process.cwd(), 'vault', 'macros');

    // 1. Local Cache Lookup
    const cache = globalMacroCache.get(macrosDir);
    let bestMatch: MacroData | null = null;
    const searchTerms = trimmedIngredient.toLowerCase().replace(/ground|fresh|raw/g, '').trim().split(' ');

    for (const item of cache) {
      const itemIngredient = item.ingredient_matched.toLowerCase();
      const matches = searchTerms.every(term => itemIngredient.includes(term));
      if (matches) {
        bestMatch = item;
        break;
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
    const usdaUrl = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${usdaApiKey}&query=${encodeURIComponent(trimmedIngredient)}&pageSize=1`;

    const response = await fetch(usdaUrl);
    if (!response.ok) {
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
    const caloriesVal = extractNutrient(nutrients, [1008], ["energy"], "kcal");
    const proteinVal = extractNutrient(nutrients, [1003], ["protein"], "g");
    const carbsVal = extractNutrient(nutrients, [1005], ["carbohydrate"], "g");
    const fatVal = extractNutrient(nutrients, [1004], ["lipid", "fat"], "g");
    const fiberVal = extractNutrient(nutrients, [1079], ["fiber"], "g");
    const sugarVal = extractNutrient(nutrients, [2000], ["sugar"], "g");
    const sodiumVal = extractNutrient(nutrients, [1093], ["sodium"], "mg");

    // Standardize title/description (capitalize nicely)
    const formattedName = food.description
      .toLowerCase()
      .split(' ')
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    const newMacro: MacroData = {
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

    // 4. Invalidate globalMacroCache so it is reloaded next time
    globalMacroCache.invalidate();

    return NextResponse.json({
      success: true,
      source: 'usda_api',
      data: newMacro
    });

  } catch (error: any) {
    console.error('Nutrition API Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to fetch nutrition data' }, { status: 500 });
  }
}
