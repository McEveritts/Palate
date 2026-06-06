import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from "@/lib/auth";
import { globalMacroCache, type MacroData } from '@/lib/macroCache';
import { estimateFoodNutrition } from '@/lib/ai/sage-food-discovery';
import path from 'path';
import fs from 'fs/promises';

// ── Types ──────────────────────────────────────────────────────────────────────

interface FoodSearchResult {
  id: string;
  name: string;
  brand?: string;
  source: 'usda' | 'openfoodfacts' | 'cache' | 'sage';
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  servingSize?: string;
  barcode?: string;
  confidence?: 'high' | 'medium' | 'low';
  description?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

const USDA_API_KEY = process.env.USDA_API_KEY || 'DEMO_KEY';
const MACROS_DIR = path.join(process.cwd(), 'vault', 'macros');
const USDA_IMPORTS_FILE = path.join(MACROS_DIR, 'USDA_Imports.md');

function parseCacheToResults(cache: MacroData[], query: string, limit = 5): FoodSearchResult[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return cache
    .filter((item) => {
      const name = item.ingredient_matched.toLowerCase();
      return words.every((w) => name.includes(w));
    })
    .slice(0, limit)
    .map((item, i) => ({
      id: `cache-${i}-${item.ingredient_matched.replace(/\s/g, '-')}`,
      name: item.ingredient_matched,
      source: (item.ingredient_matched.includes('(Sage Est.)') ? 'sage' : 'cache') as 'sage' | 'cache',
      calories: parseFloat(item.calories) || 0,
      protein: parseFloat(item.protein) || 0,
      carbs: parseFloat(item.carbs) || 0,
      fat: parseFloat(item.fat) || 0,
      fiber: item.fiber ? parseFloat(item.fiber) : undefined,
      sugar: item.sugar ? parseFloat(item.sugar) : undefined,
      sodium: item.sodium ? parseFloat(item.sodium) : undefined,
      servingSize: item.common_portions || '100g',
    }));
}

function extractNutrient(nutrients: { nutrientId: number; value: number }[], id: number): number {
  const n = nutrients.find((x) => x.nutrientId === id);
  return n ? +n.value.toFixed(1) : 0;
}

async function appendToVaultCache(name: string, calories: number, protein: number, carbs: number, fat: number, fiber?: number, sugar?: number, sodium?: number): Promise<void> {
  try {
    // M-20: Sanitize product name before writing to Markdown table
    const safeName = name.replace(/[|\n\r]/g, ' ').trim();

    // M-21: Use async fs/promises instead of synchronous fs
    await fs.mkdir(MACROS_DIR, { recursive: true });

    const header = '| Ingredient | Calories | Protein | Carbs | Fat | Fiber | Sugar | Sodium | Common Portions |';
    const sep = '| --- | --- | --- | --- | --- | --- | --- | --- | --- |';

    let content = '';
    try {
      content = await fs.readFile(USDA_IMPORTS_FILE, 'utf8');
    } catch {
      // File doesn't exist yet, will be created below
    }

    // Check if header exists, add if not
    if (!content.includes('| Ingredient |')) {
      content = `${header}\n${sep}\n${content}`;
    }

    const row = `| ${safeName} | ${calories}kcal | ${protein}g | ${carbs}g | ${fat}g | ${fiber ?? 0}g | ${sugar ?? 0}g | ${sodium ?? 0}mg | 100g |`;
    content = content.trimEnd() + '\n' + row + '\n';

    await fs.writeFile(USDA_IMPORTS_FILE, content, 'utf8');
    globalMacroCache.invalidate();
  } catch (err) {
    console.error('[food-search] Failed to write to vault cache:', err);
  }
}

// ── GET Handler ────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');
    const upc = searchParams.get('upc');
    const aiDisabled = searchParams.get('ai') === 'false';

    if (!query && !upc) {
      return NextResponse.json(
        { success: false, error: 'Provide either ?q=<search> or ?upc=<barcode>' },
        { status: 400 }
      );
    }

    // ── Mode 1: Barcode/UPC Lookup via Open Food Facts ────────────────────────
    if (upc) {
      // H-7: Validate UPC format (8-13 digits only)
      if (!/^\d{8,13}$/.test(upc)) {
        return NextResponse.json({ error: 'Invalid UPC format' }, { status: 400 });
      }

      try {
        const offRes = await fetch(
          `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(upc)}.json`,
          { signal: AbortSignal.timeout(8000) }
        );

        if (!offRes.ok) {
          return NextResponse.json(
            { success: false, results: [], error: 'Product not found on Open Food Facts' },
            { status: 404 }
          );
        }

        const offData = await offRes.json();
        const product = offData?.product;

        if (!product || !product.product_name) {
          return NextResponse.json(
            { success: false, results: [], error: 'Product not found for this barcode' },
            { status: 404 }
          );
        }

        const nutriments = product.nutriments || {};
        const sugarVal = nutriments['sugars_100g'] ?? nutriments['sugars'] ?? 0;
        const sodiumGrams = nutriments['sodium_100g'] ?? nutriments['sodium'] ?? 0;
        const sodiumVal = Math.round(sodiumGrams * 1000); // convert to mg

        const result: FoodSearchResult = {
          id: `off-${upc}`,
          name: product.product_name,
          brand: product.brands || undefined,
          source: 'openfoodfacts',
          calories: nutriments['energy-kcal_100g'] ?? nutriments['energy-kcal'] ?? 0,
          protein: nutriments['proteins_100g'] ?? 0,
          carbs: nutriments['carbohydrates_100g'] ?? 0,
          fat: nutriments['fat_100g'] ?? 0,
          fiber: nutriments['fiber_100g'] ?? undefined,
          sugar: sugarVal,
          sodium: sodiumVal,
          servingSize: product.serving_size || '100g',
          barcode: upc,
        };

        // Cache the result in the vault
        await appendToVaultCache(
          result.name,
          result.calories,
          result.protein,
          result.carbs,
          result.fat,
          result.fiber,
          result.sugar,
          result.sodium
        );

        return NextResponse.json({ success: true, results: [result], source: 'openfoodfacts' });
      } catch (err) {
        console.error('[food-search] Open Food Facts lookup error:', err);
        return NextResponse.json(
          { success: false, results: [], error: 'Failed to query Open Food Facts' },
          { status: 502 }
        );
      }
    }

    // ── Mode 2: Text Search ──────────────────────────────────────────────────
    const results: FoodSearchResult[] = [];
    const cacheHitNames = new Set<string>();

    // 1. Check local USDA cache first (includes Sage_Estimates.md)
    try {
      const cached = globalMacroCache.get(MACROS_DIR);
      const cacheResults = parseCacheToResults(cached, query!);
      for (const r of cacheResults) {
        results.push(r);
        cacheHitNames.add(r.name.toLowerCase());
      }
    } catch (err) {
      console.error('[food-search] Cache read error:', err);
    }

    // 2. Query USDA FoodData Central
    try {
      const usdaUrl = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
      usdaUrl.searchParams.set('api_key', USDA_API_KEY);
      usdaUrl.searchParams.set('query', query!);
      usdaUrl.searchParams.set('pageSize', '10');
      usdaUrl.searchParams.set('dataType', 'Foundation,SR Legacy');

      const usdaRes = await fetch(usdaUrl.toString(), { signal: AbortSignal.timeout(8000) });

      if (usdaRes.ok) {
        const usdaData = await usdaRes.json();
        const foods = usdaData.foods || [];

        for (const food of foods) {
          const name = food.description || food.lowercaseDescription || 'Unknown';
          // Deduplicate against cache hits
          if (cacheHitNames.has(name.toLowerCase())) continue;

          const nutrients = food.foodNutrients || [];
          results.push({
            id: `usda-${food.fdcId}`,
            name,
            brand: food.brandName || food.brandOwner || undefined,
            source: 'usda',
            calories: extractNutrient(nutrients, 1008),
            protein: extractNutrient(nutrients, 1003),
            carbs: extractNutrient(nutrients, 1005),
            fat: extractNutrient(nutrients, 1004),
            fiber: extractNutrient(nutrients, 1079) || undefined,
            sugar: extractNutrient(nutrients, 2000) || undefined,
            sodium: extractNutrient(nutrients, 1093) || undefined,
            servingSize: food.servingSize ? `${food.servingSize}${food.servingSizeUnit || 'g'}` : '100g',
          });
        }
      }
    } catch (err) {
      console.error('[food-search] USDA API error:', err);
      // Non-fatal: continue to Sage fallback
    }

    // 3. Sage AI Supplement — for composite meals not matched by USDA raw ingredients
    //    USDA returns raw ingredients (cranberries, pecans, chicken) for multi-word queries,
    //    but never the composite meal itself. Detect this and invoke Sage.
    if (!aiDisabled && query) {
      const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const isCompositeQuery = queryWords.length >= 3;

      // Check if any existing result closely matches the full composite query
      const hasCloseMatch = results.some((r) => {
        const nameWords = r.name.toLowerCase().split(/[\s,]+/);
        const matchCount = queryWords.filter(qw => nameWords.some(nw => nw.includes(qw) || qw.includes(nw))).length;
        // At least 60% of query words must appear in the result name
        return matchCount >= queryWords.length * 0.6;
      });

      const shouldInvokeSage = results.length === 0 || (isCompositeQuery && !hasCloseMatch);

      if (shouldInvokeSage) {
        console.log(`[food-search] No close match for "${query}" (${results.length} raw results). Invoking Sage Food Discovery...`);
        try {
          const estimates = await estimateFoodNutrition(query);
          const sageResults: FoodSearchResult[] = [];
          for (const est of estimates) {
            sageResults.push({
              id: est.id,
              name: est.name,
              source: 'sage',
              calories: est.calories,
              protein: est.protein,
              carbs: est.carbs,
              fat: est.fat,
              fiber: est.fiber || undefined,
              sugar: est.sugar || undefined,
              sodium: est.sodium || undefined,
              servingSize: est.servingSize,
              confidence: est.confidence,
              description: est.description,
            });
          }
          // Prepend Sage results so the composite meal estimate appears FIRST
          results.unshift(...sageResults);
        } catch (err) {
          console.error('[food-search] Sage AI fallback error:', err);
          // Non-fatal: return existing results
        }
      }
    }

    return NextResponse.json({
      success: true,
      results: results.slice(0, 15),
      cached: results.filter((r) => r.source === 'cache').length,
      sage: results.filter((r) => r.source === 'sage').length,
      total: results.length,
    });
  } catch (error) {
    console.error('[food-search] Unexpected error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
