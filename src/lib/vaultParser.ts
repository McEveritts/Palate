"use server";

import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import yaml from 'js-yaml';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/db";
import { getHouseholdId } from "@/lib/household";
import { globalMacroCache, MacroData } from './macroCache';

const INGREDIENT_STOP_WORDS = /ground|fresh|raw|dried|frozen|cooked|boneless|skinless|organic/g;

const SAFE_MATTER_OPTIONS = {
  engines: { yaml: (s: string) => yaml.load(s, { schema: yaml.FAILSAFE_SCHEMA }) as Record<string, unknown> }
};

export interface VaultRecipe {
  id: string;
  slug: string;
  title: string;
  category: 'mains' | 'sides' | 'appetizers' | 'desserts' | 'curated-current' | 'curated-archive';
  tags: string[];
  macros: string;
  content: string;
  date?: string;
}

function mapDbRecipeToVaultRecipe(r: any): VaultRecipe {
  const data = (r.frontmatter as any) || {};
  const category = data.category || 'mains';
  const slug = r.slug;
  
  let tags: string[] = [];
  if (data.tags) {
    tags = Array.isArray(data.tags) ? data.tags : String(data.tags).split(',').map((t: string) => t.trim());
  }

  let macrosStr = '';
  if (typeof data.macros === 'object' && data.macros !== null) {
    macrosStr = Object.entries(data.macros).map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)}: ${v}`).join(' | ');
  } else if (data.macros) {
    macrosStr = String(data.macros);
  }

  return {
    id: `${category}-${slug}`,
    slug,
    title: r.title,
    category: category as any,
    tags,
    macros: macrosStr,
    content: r.markdown,
    date: data.date ? String(data.date) : undefined
  };
}

async function seedCategoryForHousehold(householdId: string, category: 'mains' | 'sides' | 'appetizers' | 'desserts') {
  const dirPath = path.join(process.cwd(), 'vault', category);
  try {
    const files = await fs.readdir(dirPath);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const filePath = path.join(dirPath, file);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const { data, content } = matter(fileContent, SAFE_MATTER_OPTIONS);
      const slug = file.replace('.md', '');
      const title = data.recipe || data.title || slug;
      
      await prisma.recipe.upsert({
        where: {
          householdId_slug: {
            householdId,
            slug,
          }
        },
        create: {
          householdId,
          slug,
          title,
          markdown: content.trim(),
          frontmatter: {
            ...data,
            category,
          }
        },
        update: {
          title,
          markdown: content.trim(),
          frontmatter: {
            ...data,
            category,
          }
        }
      });
    }
  } catch (error) {
    console.warn(`Could not read directory ${dirPath} for seeding ${category}`);
  }
}

async function seedRecipesForHousehold(householdId: string) {
  // Read mains, sides, appetizers & desserts
  const categories: ('mains' | 'sides' | 'appetizers' | 'desserts')[] = ['mains', 'sides', 'appetizers', 'desserts'];
  for (const category of categories) {
    await seedCategoryForHousehold(householdId, category);
  }

  // Create the desserts seeded sentinel so we never re-seed it
  await prisma.recipe.upsert({
    where: {
      householdId_slug: {
        householdId,
        slug: '__seeded_desserts',
      }
    },
    create: {
      householdId,
      slug: '__seeded_desserts',
      title: 'System Seeded Desserts',
      markdown: 'System record',
      frontmatter: { category: 'system' }
    },
    update: {}
  });

  // Read curated current & archive
  const curatedTypes: ('current' | 'archive')[] = ['current', 'archive'];
  for (const type of curatedTypes) {
    const dirPath = path.join(process.cwd(), 'vault', 'curated', type);
    const category = `curated-${type}`;
    try {
      const files = await fs.readdir(dirPath);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const filePath = path.join(dirPath, file);
        const stat = await fs.stat(filePath);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const { data, content } = matter(fileContent, SAFE_MATTER_OPTIONS);
        const slug = file.replace('.md', '');
        const title = data.recipe || data.title || slug;

        await prisma.recipe.upsert({
          where: {
            householdId_slug: {
              householdId,
              slug,
            }
          },
          create: {
            householdId,
            slug,
            title,
            markdown: content.trim(),
            frontmatter: {
              ...data,
              category,
            },
            createdAt: new Date(stat.mtimeMs),
          },
          update: {
            title,
            markdown: content.trim(),
            frontmatter: {
              ...data,
              category,
            },
            createdAt: new Date(stat.mtimeMs),
          }
        });
      }
    } catch (error) {
      console.warn(`Could not read directory ${dirPath} for seeding`);
    }
  }
}

async function getCurrentUserId(): Promise<string | null> {
  if (typeof getServerSession !== 'function') return null;
  try {
    const session = await getServerSession(authOptions);
    return session?.user ? session.user.id : null;
  } catch (error) {
    return null;
  }
}

export async function getVaultRecipes(userCategories?: string[]): Promise<VaultRecipe[]> {
  const userId = await getCurrentUserId();
  const categoriesToScan = userCategories || ['mains', 'sides', 'appetizers', 'desserts'];

  if (userId) {
    const householdId = await getHouseholdId(userId);
    const count = await prisma.recipe.count({ where: { householdId } });
    if (count === 0) {
      await seedRecipesForHousehold(householdId);
    } else {
      // Dynamic incremental seeding of new default categories (e.g., desserts)
      const wasDessertsSeeded = await prisma.recipe.findUnique({
        where: {
          householdId_slug: {
            householdId,
            slug: '__seeded_desserts'
          }
        }
      });
      if (!wasDessertsSeeded) {
        const dessertCount = await prisma.recipe.count({
          where: {
            householdId,
            frontmatter: {
              path: ['category'],
              equals: 'desserts'
            }
          }
        });
        if (dessertCount === 0) {
          await seedCategoryForHousehold(householdId, 'desserts');
        }
        await prisma.recipe.upsert({
          where: {
            householdId_slug: {
              householdId,
              slug: '__seeded_desserts'
            }
          },
          create: {
            householdId,
            slug: '__seeded_desserts',
            title: 'System Seeded Desserts',
            markdown: 'System record',
            frontmatter: { category: 'system' }
          },
          update: {}
        });
      }
    }

    const recipes = await prisma.recipe.findMany({
      where: { householdId }
    });

    return recipes
      .filter(r => {
        const cat = (r.frontmatter as any)?.category;
        return categoriesToScan.includes(cat);
      })
      .map(r => mapDbRecipeToVaultRecipe(r));
  }

  const allRecipes: VaultRecipe[] = [];

  for (const category of categoriesToScan) {
    const dirPath = path.join(process.cwd(), 'vault', category);
    try {
      const files = await fs.readdir(dirPath);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        
        const filePath = path.join(dirPath, file);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const { data, content } = matter(fileContent, SAFE_MATTER_OPTIONS);
        
        let tags: string[] = [];
        if (data.tags) {
           tags = Array.isArray(data.tags) ? data.tags : data.tags.split(',').map((t: string) => t.trim());
        }

        let macrosStr = '';
        if (typeof data.macros === 'object' && data.macros !== null) {
          macrosStr = Object.entries(data.macros).map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)}: ${v}`).join(' | ');
        } else if (data.macros) {
          macrosStr = String(data.macros);
        }

        allRecipes.push({
          id: `${category}-${file.replace('.md', '')}`,
          slug: file.replace('.md', ''),
          title: data.recipe || data.title || file.replace('.md', ''),
          category: category as any,
          tags,
          macros: macrosStr,
          content: content.trim()
        });
      }
    } catch (error) {
      console.warn(`Could not read directory ${dirPath}`);
    }
  }

  return allRecipes;
}

export async function getCuratedRecipes(type: 'current' | 'archive'): Promise<VaultRecipe[]> {
  const userId = await getCurrentUserId();

  if (userId) {
    const householdId = await getHouseholdId(userId);
    const count = await prisma.recipe.count({ where: { householdId } });
    let recipes = await prisma.recipe.findMany({
      where: { householdId }
    });

    // Read the current curated files on disk to detect out-of-sync state
    let diskSlugs: string[] = [];
    try {
      const files = await fs.readdir(path.join(process.cwd(), 'vault', 'curated', 'current'));
      diskSlugs = files.filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''));
    } catch (e) {
      console.warn("Could not read current curated files from disk:", e);
    }

    const dbCuratedCurrent = recipes.filter(r => (r.frontmatter as any)?.category === 'curated-current');
    const dbSlugs = new Set(dbCuratedCurrent.map(r => r.slug));

    const isOutOfSync = diskSlugs.length > 0 && (
      dbCuratedCurrent.length !== diskSlugs.length || 
      diskSlugs.some(slug => !dbSlugs.has(slug))
    );

    if (count === 0 || isOutOfSync) {
      await seedRecipesForHousehold(householdId);
      recipes = await prisma.recipe.findMany({
        where: { householdId }
      });
    }

    const categoryName = `curated-${type}`;
    const curated = recipes.filter(r => (r.frontmatter as any)?.category === categoryName);
    
    // Sort by date ascending (chronological order) with createdAt as fallback
    curated.sort((a, b) => {
      const dateA = (a.frontmatter as any)?.date;
      const dateB = (b.frontmatter as any)?.date;
      if (dateA && dateB) {
        return String(dateA).localeCompare(String(dateB));
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    return curated.map(r => mapDbRecipeToVaultRecipe(r));
  }

  const allCurated: (VaultRecipe & { mtimeMs: number })[] = [];
  const dirPath = path.join(process.cwd(), 'vault', 'curated', type);
  const categoryName = `curated-${type}` as 'curated-current' | 'curated-archive';

  try {
    const files = await fs.readdir(dirPath);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      const filePath = path.join(dirPath, file);
      const stat = await fs.stat(filePath);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const { data, content } = matter(fileContent, SAFE_MATTER_OPTIONS);

      let tags: string[] = [];
      if (data.tags) {
         tags = Array.isArray(data.tags) ? data.tags : data.tags.split(',').map((t: string) => t.trim());
      }

      let macrosStr = '';
      if (typeof data.macros === 'object' && data.macros !== null) {
        macrosStr = Object.entries(data.macros).map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)}: ${v}`).join(' | ');
      } else if (data.macros) {
        macrosStr = String(data.macros);
      }

      allCurated.push({
        id: `${categoryName}-${file.replace('.md', '')}`,
        slug: file.replace('.md', ''),
        title: data.recipe || data.title || file.replace('.md', ''),
        category: categoryName,
        tags,
        macros: macrosStr,
        content: content.trim(),
        date: data.date ? String(data.date) : undefined,
        mtimeMs: stat.mtimeMs
      });
    }
  } catch (error) {
    console.warn(`Could not read directory ${dirPath}`);
  }

  // Sort by date ascending (chronological order) with mtimeMs as fallback
  allCurated.sort((a, b) => {
    if (a.date && b.date) {
      return a.date.localeCompare(b.date);
    }
    return a.mtimeMs - b.mtimeMs;
  });

  return allCurated.map(({ mtimeMs, ...recipe }) => recipe);
}

export async function compileVaultContextString(): Promise<string> {
  try {
    const recipes = await getVaultRecipes();
    if (!recipes || recipes.length === 0) {
      return "No recipes found in the vault.";
    }
    return recipes
      .map(r => `Recipe: ${r.title}\nCategory: ${r.category}\nTags: ${r.tags?.join(', ')}\nMacros: ${r.macros}\nContent:\n${r.content}`)
      .join('\n\n---\n\n');
  } catch (error) {
    console.error("Error compiling vault context string:", error);
    return "Error compilation failed.";
  }
}

export interface ParsedIngredient {
  name: string;
  amount: number;
  unit: string;
}

export interface MacroResult {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
}

export interface ScaledIngredient extends ParsedIngredient {
  usdaMatch?: string;
  macros: MacroResult;
}

export interface CulinaryLogAST {
  ingredients: ScaledIngredient[];
  totalMacros: MacroResult;
  yieldMultiplier: number;
}

function parseNumber(val: string): number {
  const trimmed = val.trim();
  // Handle mixed numbers like '1 1/2'
  const mixedMatch = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    const denom = parseInt(mixedMatch[3]);
    return denom !== 0 ? parseInt(mixedMatch[1]) + parseInt(mixedMatch[2]) / denom : parseInt(mixedMatch[1]);
  }
  // Handle simple fractions like '1/2'
  const fracMatch = trimmed.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) {
    const denom = parseInt(fracMatch[2]);
    return denom !== 0 ? parseInt(fracMatch[1]) / denom : 0;
  }
  const parsed = parseFloat(trimmed);
  return isNaN(parsed) ? 0 : parsed;
}

function convertToGrams(amount: number, unit: string): number {
  const u = unit.toLowerCase().trim();
  switch (u) {
    case 'kg':
    case 'kilogram':
    case 'kilograms':
      return amount * 1000;
    case 'g':
    case 'gram':
    case 'grams':
      return amount;
    case 'mg':
    case 'milligram':
    case 'milligrams':
      return amount / 1000;
    case 'l':
    case 'liter':
    case 'liters':
    case 'litre':
      return amount * 1000;
    case 'ml':
    case 'milliliter':
    case 'milliliters':
      return amount;
    case 'cup':
    case 'cups':
      return amount * 240;
    case 'tbsp':
    case 'tablespoon':
    case 'tablespoons':
      return amount * 15;
    case 'tsp':
    case 'teaspoon':
    case 'teaspoons':
      return amount * 5;
    case 'fl oz':
    case 'fluid ounce':
      return amount * 30;
    case 'qt':
    case 'quart':
      return amount * 946;
    case 'pt':
    case 'pint':
      return amount * 473;
    case 'gal':
    case 'gallon':
      return amount * 3785;
    case 'oz':
    case 'ounce':
    case 'ounces':
      return amount * 28.3495;
    case 'lb':
    case 'lbs':
    case 'pound':
    case 'pounds':
      return amount * 453.592;
    case 'clove': case 'cloves': return amount * 5;
    case 'pinch': return amount * 0.5;
    case 'dash': return amount * 0.5;
    case 'bunch': return amount * 150;
    case 'stick': return amount * 113;
    case 'can': return amount * 400;
    case 'slice': case 'slices': return amount * 30;
    case 'whole': case 'piece': case 'pieces': return amount * 100;
    case 'head': return amount * 500;
    default:
      console.warn(`Unknown unit '${unit}', estimating ${amount * 100}g`);
      return amount * 100;
  }
}

// TODO: Wire into recipe detail page or diary logging flow
export async function compileCulinaryToLogAST(
  markdownContent: string,
  amountConsumedMultiplier: number = 1.0
): Promise<CulinaryLogAST> {
  const ingredients: ScaledIngredient[] = [];
  // Matches @name{amount%unit} or @name{amount}
  const cooklangRegex = /@([^{@]+)\{([^%}]+)(?:%([^}]+))?\}/g;
  let match;
  
  const macrosDir = path.join(process.cwd(), 'vault', 'macros');
  const cache = globalMacroCache.get(macrosDir);

  if (!cache || cache.length === 0) {
    console.warn('USDA macro cache is empty — all macro values will be zero.');
  }

  const totalMacros: MacroResult = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
    sugar: 0,
    sodium: 0
  };

  while ((match = cooklangRegex.exec(markdownContent)) !== null) {
    const name = match[1].trim();
    const amountStr = match[2].trim();
    const unit = match[3] ? match[3].trim() : 'piece';
    const amount = parseNumber(amountStr);

    const amountInGrams = convertToGrams(amount, unit);
    const multiplier = (amountInGrams / 100) * amountConsumedMultiplier;

    const searchTerms = name.toLowerCase().replace(INGREDIENT_STOP_WORDS, '').trim().split(/\s+/);
    let bestMatch: MacroData | null = null;
    let bestScore = 0;

    for (const item of cache) {
      const itemIngredient = item.ingredient_matched.toLowerCase();
      const matchingTerms = searchTerms.filter(term => term && itemIngredient.includes(term));
      const score = matchingTerms.length / Math.max(searchTerms.filter(t => t).length, 1);
      if (score > bestScore && score >= 0.5) {
        bestScore = score;
        bestMatch = item;
      }
    }

    const ingMacros: MacroResult = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 };

    if (bestMatch) {
      ingMacros.calories = parseNumber(bestMatch.calories) * multiplier;
      ingMacros.protein = parseNumber(bestMatch.protein) * multiplier;
      ingMacros.carbs = parseNumber(bestMatch.carbs) * multiplier;
      ingMacros.fat = parseNumber(bestMatch.fat) * multiplier;
      if (bestMatch.fiber) ingMacros.fiber = parseNumber(bestMatch.fiber) * multiplier;
      if (bestMatch.sugar) ingMacros.sugar = parseNumber(bestMatch.sugar) * multiplier;
      if (bestMatch.sodium) ingMacros.sodium = parseNumber(bestMatch.sodium) * multiplier;
      
      totalMacros.calories += ingMacros.calories;
      totalMacros.protein += ingMacros.protein;
      totalMacros.carbs += ingMacros.carbs;
      totalMacros.fat += ingMacros.fat;
      totalMacros.fiber += ingMacros.fiber;
      totalMacros.sugar += ingMacros.sugar;
      totalMacros.sodium += ingMacros.sodium;
    }

    ingredients.push({
      name,
      amount: amount * amountConsumedMultiplier,
      unit,
      usdaMatch: bestMatch ? bestMatch.ingredient_matched : undefined,
      macros: ingMacros
    });
  }

  return {
    ingredients,
    totalMacros,
    yieldMultiplier: amountConsumedMultiplier
  };
}

