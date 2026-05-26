"use server";

import fs from "fs/promises";
import { existsSync } from 'fs';
import path from "path";
import { revalidatePath } from "next/cache";
import { sanitizeRecipeContent } from "../lib/parser";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getHouseholdId } from "@/lib/household";
import matter from "gray-matter";
import { getAllRecipes } from "../lib/vault";
import lockfile from 'proper-lockfile';
import { MealType, ChatRole, Prisma } from '@prisma/client';
import { syncMealToGoogle, deleteMealFromGoogle } from "@/lib/googleCalendar";

async function getCurrentUserId(): Promise<string | null> {
  if (typeof getServerSession !== 'function') return null;
  try {
    const session = await getServerSession(authOptions);
    return session?.user ? session.user.id : null;
  } catch {
    return null;
  }
}

/**
 * Security helper: Re-slugify user-controlled strings to strip path traversal
 * characters (../, ./, etc.) and validate the resolved path stays within the
 * target directory. Throws on any escape attempt.
 */
function safeVaultPath(baseDir: string, rawSlug: string): string {
  const safeSlug = rawSlug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/(^-|-$)/g, '');
  if (!safeSlug) throw new Error('Invalid recipe identifier.');
  const filename = `${safeSlug}.md`;
  const resolvedBase = path.resolve(baseDir);
  const resolvedPath = path.resolve(baseDir, filename);
  if (!resolvedPath.startsWith(resolvedBase + path.sep) && resolvedPath !== resolvedBase) {
    throw new Error('Security Error: Invalid file path detected.');
  }
  return resolvedPath;
}

// M6 Fix: Input validation schemas to prevent oversized payloads and invalid data
const MAX_CONTENT_LENGTH = 50_000; // 50KB max recipe content
const MAX_ID_LENGTH = 200;
const VALID_MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const;

function validateContentLength(content: string): void {
  if (content.length > MAX_CONTENT_LENGTH) {
    throw new Error(`Content too large (${content.length} chars). Maximum is ${MAX_CONTENT_LENGTH}.`);
  }
}

function validateId(id: string): void {
  if (!id || id.length > MAX_ID_LENGTH) {
    throw new Error('Invalid recipe identifier.');
  }
}

// M9 Fix: Strict ISO 8601 date validation
function validateDateStr(dateStr: string): Date {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: "${dateStr}". Expected ISO 8601.`);
  }
  return date;
}

export async function saveRecipeToVault(content: string, format: 'md' | 'txt' = 'md') {
  try {
    if (format !== 'md' && format !== 'txt') {
      throw new Error('Invalid format. Must be md or txt.');
    }

    validateContentLength(content);

    const userId = await getCurrentUserId();

    // 1. Clean the content to strip thought tags, preambles, and code blocks, and reconstruct cleanly
    const { data, fileContent: sanitizedFileContent } = sanitizeRecipeContent(content);

    // 2. Extract title from frontmatter
    const titleMatch = sanitizedFileContent.match(/title:\s*["']?([^"'\n]+)["']?/i) || sanitizedFileContent.match(/Recipe:\s*["']?([^"'\n]+)["']?/i);
    const title = data.recipe || data.title || (titleMatch ? titleMatch[1].trim() : "Generated Recipe");
    
    // 3. Slugify
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    
    // 4. Determine category dynamically
    const tags = Array.isArray(data.tags)
      ? data.tags.map((t: unknown) => String(t).toLowerCase())
      : typeof data.tags === 'string'
        ? data.tags.split(',').map((t: string) => t.trim().toLowerCase())
        : [];

    const isAppetizer = /appetizer/i.test(sanitizedFileContent) || tags.includes('appetizer') || tags.includes('appetizers');
    const isSide = /side/i.test(sanitizedFileContent) || tags.includes('side') || tags.includes('sides');
    const isDessert = /dessert/i.test(sanitizedFileContent) || tags.includes('dessert') || tags.includes('desserts') || tags.includes('sweet') || tags.includes('sweets');

    const isBeverage = /beverage/i.test(sanitizedFileContent) || /smoothie/i.test(sanitizedFileContent) || tags.includes('beverage') || tags.includes('beverages') || tags.includes('smoothie') || tags.includes('smoothies') || tags.includes('drink') || tags.includes('drinks');

    let category = 'mains';
    if (isDessert) {
      category = 'desserts';
    } else if (isAppetizer) {
      category = 'appetizers';
    } else if (isSide) {
      category = 'sides';
    } else if (isBeverage) {
      category = 'beverages';
    }

    if (userId) {
      const householdId = await getHouseholdId(userId);
      const { data: frontmatterData, content: bodyContent } = matter(sanitizedFileContent);
      
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
          markdown: bodyContent.trim(),
          frontmatter: {
            ...frontmatterData,
            category,
          }
        },
        update: {
          title,
          markdown: bodyContent.trim(),
          frontmatter: {
            ...frontmatterData,
            category,
          }
        }
      });

      revalidatePath('/vault');
      return { success: true, message: `Recipe saved to database as ${slug}` };
    }
    
    const filename = `${slug}.${format}`;
    
    // 5. Write file to the correct vault directory
    const vaultPath = path.join(process.cwd(), "vault", category);
    await fs.mkdir(vaultPath, { recursive: true });
    
    // L6 Fix: Prevent silent overwrite of existing recipes
    let filePath = path.join(vaultPath, filename);
    try {
      await fs.access(filePath);
      // File exists, append timestamp to prevent overwrite
      filePath = path.join(vaultPath, `${slug}-${Date.now()}.${format}`);
    } catch {
      // File does not exist, safe to write
    }
    await fs.writeFile(filePath, sanitizedFileContent, "utf-8");
    
    revalidatePath('/vault');
    return { success: true, message: `Recipe saved to vault/${category} as ${filename}` };
  } catch (error: unknown) {
    console.error("Save error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function saveParsedRecipe(markdown: string, category: 'mains' | 'sides' | 'appetizers' | 'desserts' | 'beverages', title: string) {
  try {
    if (category !== 'mains' && category !== 'sides' && category !== 'appetizers' && category !== 'desserts' && category !== 'beverages') {
      throw new Error('Invalid category. Must be mains, sides, appetizers, desserts or beverages.');
    }

    validateContentLength(markdown);

    const userId = await getCurrentUserId();

    if (userId) {
      const householdId = await getHouseholdId(userId);
      const { data, content } = matter(markdown);
      
      const tags = Array.isArray(data.tags)
        ? data.tags.map((t: unknown) => String(t).toLowerCase())
        : typeof data.tags === 'string'
          ? data.tags.split(',').map((t: string) => t.trim().toLowerCase())
          : [];
      const isAppetizer = /appetizer/i.test(markdown) || tags.includes('appetizer') || tags.includes('appetizers');
      const isSide = /side/i.test(markdown) || tags.includes('side') || tags.includes('sides');
      const isDessert = /dessert/i.test(markdown) || tags.includes('dessert') || tags.includes('desserts') || tags.includes('sweet') || tags.includes('sweets');
      const isBeverage = /beverage/i.test(markdown) || /smoothie/i.test(markdown) || tags.includes('beverage') || tags.includes('beverages') || tags.includes('smoothie') || tags.includes('smoothies') || tags.includes('drink') || tags.includes('drinks');

      let finalCategory = category;
      if (isDessert) {
        finalCategory = 'desserts';
      } else if (isAppetizer) {
        finalCategory = 'appetizers';
      } else if (isSide) {
        finalCategory = 'sides';
      } else if (isBeverage) {
        finalCategory = 'beverages';
      }

      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      
      let finalSlug = slug;
      const existing = await prisma.recipe.findUnique({
        where: { householdId_slug: { householdId, slug: finalSlug } }
      });
      if (existing) {
        finalSlug = `${slug}-${Date.now()}`;
      }

      await prisma.recipe.create({
        data: {
          householdId,
          slug: finalSlug,
          title,
          markdown: content.trim(),
          frontmatter: {
            ...data,
            category: finalCategory,
          }
        }
      });

      revalidatePath('/vault');
      return { success: true, message: `Recipe saved to database as ${finalSlug}` };
    }

    const { data: fileData } = matter(markdown);
    const tags = Array.isArray(fileData.tags)
      ? fileData.tags.map((t: unknown) => String(t).toLowerCase())
      : typeof fileData.tags === 'string'
        ? fileData.tags.split(',').map((t: string) => t.trim().toLowerCase())
        : [];
    const isAppetizer = /appetizer/i.test(markdown) || tags.includes('appetizer') || tags.includes('appetizers');
    const isSide = /side/i.test(markdown) || tags.includes('side') || tags.includes('sides');
    const isDessert = /dessert/i.test(markdown) || tags.includes('dessert') || tags.includes('desserts') || tags.includes('sweet') || tags.includes('sweets');
    const isBeverage = /beverage/i.test(markdown) || /smoothie/i.test(markdown) || tags.includes('beverage') || tags.includes('beverages') || tags.includes('smoothie') || tags.includes('smoothies') || tags.includes('drink') || tags.includes('drinks');

    let finalCategory = category;
    if (isDessert) {
      finalCategory = 'desserts';
    } else if (isAppetizer) {
      finalCategory = 'appetizers';
    } else if (isSide) {
      finalCategory = 'sides';
    } else if (isBeverage) {
      finalCategory = 'beverages';
    }

    const cleanContent = markdown.trim();
    
    // Slugify title for filename
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const filename = `${slug}.md`;
    
    const vaultPath = path.join(process.cwd(), "vault", finalCategory);
    await fs.mkdir(vaultPath, { recursive: true });
    
    let filePath = path.join(vaultPath, filename);
    
    // Prevent overwrite
    try {
      await fs.access(filePath);
      // File exists, append timestamp
      const newFilename = `${slug}-${Date.now()}.md`;
      filePath = path.join(vaultPath, newFilename);
    } catch {
      // File does not exist, safe to write
    }
    
    await fs.writeFile(filePath, cleanContent, "utf-8");
    
    revalidatePath('/vault');
    return { success: true, message: `Recipe saved to vault/${finalCategory} as ${path.basename(filePath)}` };
  } catch (error: unknown) {
    console.error("Save parsed recipe error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function saveCuratedToVault(id: string) {
  try {
    validateId(id);

    const userId = await getCurrentUserId();

    if (userId) {
      const householdId = await getHouseholdId(userId);
      let slug: string;
      if (id.startsWith('curated-current-')) {
        slug = id.substring('curated-current-'.length);
      } else if (id.startsWith('curated-archive-')) {
        slug = id.substring('curated-archive-'.length);
      } else {
        throw new Error(`Invalid recipe ID format for curated recipe: ${id}`);
      }

      const recipe = await prisma.recipe.findUnique({
        where: { householdId_slug: { householdId, slug } }
      });

      if (!recipe) {
        throw new Error(`Recipe with slug ${slug} not found in database.`);
      }

      const frontmatter = (recipe.frontmatter as Record<string, unknown> | null) || {};
      const fileContentLower = (recipe.markdown || '').toLowerCase();
      const tags = Array.isArray(frontmatter.tags)
        ? frontmatter.tags.map((t: unknown) => String(t).toLowerCase())
        : typeof frontmatter.tags === 'string'
          ? frontmatter.tags.split(',').map((t: string) => t.trim().toLowerCase())
          : [];
      
      let targetCategory = "mains";
      if (
        fileContentLower.includes("tag: dessert") || 
        fileContentLower.includes("tags: [dessert") || 
        fileContentLower.includes("category: desserts") ||
        tags.includes("dessert") ||
        tags.includes("desserts") ||
        tags.includes("sweet") ||
        tags.includes("sweets") ||
        /\bdesserts?\b/.test(fileContentLower)
      ) {
        targetCategory = "desserts";
      } else if (
        fileContentLower.includes("tag: appetizer") || 
        fileContentLower.includes("tags: [appetizer") || 
        fileContentLower.includes("category: appetizers") ||
        /\bappetizers?\b/.test(fileContentLower)
      ) {
        targetCategory = "appetizers";
      } else if (
        fileContentLower.includes("tag: side") || 
        fileContentLower.includes("tags: [side") || 
        fileContentLower.includes("category: sides") ||
        /\bsides?\b/.test(fileContentLower)
      ) {
        targetCategory = "sides";
      }

      await prisma.recipe.update({
        where: { id: recipe.id },
        data: {
          frontmatter: {
            ...frontmatter,
            category: targetCategory
          }
        }
      });

      // Synchronize file on disk by moving it to the new category folder to prevent re-seeding
      const parts = id.split('-');
      const type = parts[1];
      const filenameParts = parts.slice(2);
      if (type === 'current' || type === 'archive') {
        const rawSlug = filenameParts.join('-');
        const curatedBaseDir = path.join(process.cwd(), 'vault', 'curated', type);
        const curatedPath = safeVaultPath(curatedBaseDir, rawSlug);
        
        const safeFilename = path.basename(curatedPath);
        const targetBaseDir = path.join(process.cwd(), 'vault', targetCategory);
        let targetPath = path.join(targetBaseDir, safeFilename);
        
        try {
          await fs.access(curatedPath);
          // Prevent overwrite
          try {
            await fs.access(targetPath);
            const ext = path.extname(safeFilename);
            const base = path.basename(safeFilename, ext);
            const newFilename = `${base}-${Date.now()}${ext}`;
            targetPath = path.join(targetBaseDir, newFilename);
          } catch {}
          
          await fs.rename(curatedPath, targetPath);
        } catch {
          console.warn(`Curated file not found on disk during saveCuratedToVault: ${curatedPath}`);
        }
      }

      revalidatePath('/vault');
      revalidatePath('/plans');
      return { success: true };
    }

    const parts = id.split('-');
    const type = parts[1];
    const filenameParts = parts.slice(2);
    
    if (type !== 'current' && type !== 'archive') {
      throw new Error('Invalid curated type. Must be current or archive.');
    }
 
    const rawSlug = filenameParts.join('-');
    const curatedBaseDir = path.join(process.cwd(), 'vault', 'curated', type);
    const curatedPath = safeVaultPath(curatedBaseDir, rawSlug);
    
    const fileContent = await fs.readFile(curatedPath, 'utf-8');
    
    // Determine category based on tags
    let targetCategory = "mains";
    const fileContentLower = fileContent.toLowerCase();
    
    // Parse tags to support checks
    const { data: fileData } = matter(fileContent);
    const tags = Array.isArray(fileData.tags)
      ? fileData.tags.map((t: unknown) => String(t).toLowerCase())
      : typeof fileData.tags === 'string'
        ? fileData.tags.split(',').map((t: string) => t.trim().toLowerCase())
        : [];

    if (
      fileContentLower.includes("tag: dessert") || 
      fileContentLower.includes("tags: [dessert") || 
      fileContentLower.includes("category: desserts") ||
      tags.includes("dessert") ||
      tags.includes("desserts") ||
      tags.includes("sweet") ||
      tags.includes("sweets") ||
      /\bdesserts?\b/.test(fileContentLower)
    ) {
      targetCategory = "desserts";
    } else if (
      fileContentLower.includes("tag: appetizer") || 
      fileContentLower.includes("tags: [appetizer") || 
      fileContentLower.includes("category: appetizers") ||
      /\bappetizers?\b/.test(fileContentLower)
    ) {
      targetCategory = "appetizers";
    } else if (
      fileContentLower.includes("tag: side") || 
      fileContentLower.includes("tags: [side") || 
      fileContentLower.includes("category: sides") ||
      /\bsides?\b/.test(fileContentLower)
    ) {
      targetCategory = "sides";
    }
    
    const safeFilename = path.basename(curatedPath);
    const targetBaseDir = path.join(process.cwd(), 'vault', targetCategory);
    let targetPath = path.join(targetBaseDir, safeFilename);
    
    // Prevent overwrite
    try {
      await fs.access(targetPath);
      // File exists, append timestamp
      const ext = path.extname(safeFilename);
      const base = path.basename(safeFilename, ext);
      const newFilename = `${base}-${Date.now()}${ext}`;
      targetPath = path.join(targetBaseDir, newFilename);
    } catch {
      // File does not exist, safe to move
    }
    
    // Move the file
    await fs.rename(curatedPath, targetPath);
    
    revalidatePath('/vault');
    revalidatePath('/plans');
    return { success: true };
  } catch (error: unknown) {
    console.error("Error moving curated recipe:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function deleteRecipeFromVault(id: string) {
  try {
    validateId(id);

    const userId = await getCurrentUserId();

    if (userId) {
      const householdId = await getHouseholdId(userId);
      let slug: string;
      if (id.startsWith('curated-current-')) {
        slug = id.substring('curated-current-'.length);
      } else if (id.startsWith('curated-archive-')) {
        slug = id.substring('curated-archive-'.length);
      } else if (id.startsWith('mains-')) {
        slug = id.substring('mains-'.length);
      } else if (id.startsWith('sides-')) {
        slug = id.substring('sides-'.length);
      } else if (id.startsWith('appetizers-')) {
        slug = id.substring('appetizers-'.length);
      } else if (id.startsWith('desserts-')) {
        slug = id.substring('desserts-'.length);
      } else if (id.startsWith('beverages-')) {
        slug = id.substring('beverages-'.length);
      } else {
        throw new Error(`Invalid recipe ID format: ${id}`);
      }

      const existing = await prisma.recipe.findUnique({
        where: { householdId_slug: { householdId, slug } }
      });

      if (!existing) {
        throw new Error(`Recipe not found in database: ${slug}`);
      }

      await prisma.recipe.delete({
        where: { id: existing.id }
      });

      // Synchronize file on disk by deleting it from the flat vault as well to prevent re-seeding
      let category: string;
      if (id.startsWith('curated-current-')) {
        category = 'curated/current';
      } else if (id.startsWith('curated-archive-')) {
        category = 'curated/archive';
      } else if (id.startsWith('mains-')) {
        category = 'mains';
      } else if (id.startsWith('sides-')) {
        category = 'sides';
      } else if (id.startsWith('appetizers-')) {
        category = 'appetizers';
      } else if (id.startsWith('desserts-')) {
        category = 'desserts';
      } else if (id.startsWith('beverages-')) {
        category = 'beverages';
      } else {
        throw new Error(`Invalid recipe ID format: ${id}`);
      }
      
      const vaultPath = path.join(process.cwd(), 'vault', category);
      const filePath = safeVaultPath(vaultPath, slug);
      try {
        await fs.access(filePath);
        await fs.unlink(filePath);
      } catch {
        console.warn(`File not found on disk during DB recipe delete: ${filePath}`);
      }

      revalidatePath('/vault');
      revalidatePath('/plans');
      return { success: true, message: `Recipe successfully deleted from database and disk` };
    }

    let category: string;
    let slug: string;
    
    if (id.startsWith('curated-current-')) {
      category = 'curated/current';
      slug = id.substring('curated-current-'.length);
    } else if (id.startsWith('curated-archive-')) {
      category = 'curated/archive';
      slug = id.substring('curated-archive-'.length);
    } else if (id.startsWith('mains-')) {
      category = 'mains';
      slug = id.substring('mains-'.length);
    } else if (id.startsWith('sides-')) {
      category = 'sides';
      slug = id.substring('sides-'.length);
    } else if (id.startsWith('appetizers-')) {
      category = 'appetizers';
      slug = id.substring('appetizers-'.length);
    } else if (id.startsWith('desserts-')) {
      category = 'desserts';
      slug = id.substring('desserts-'.length);
    } else if (id.startsWith('beverages-')) {
      category = 'beverages';
      slug = id.substring('beverages-'.length);
    } else {
      throw new Error(`Invalid recipe ID format: ${id}`);
    }
    
    const vaultPath = path.join(process.cwd(), 'vault', category);
    const filePath = safeVaultPath(vaultPath, slug);
    
    // Check if the file exists before attempting deletion
    await fs.access(filePath);
    await fs.unlink(filePath);
    
    revalidatePath('/vault');
    revalidatePath('/plans');
    return { success: true, message: `Recipe successfully deleted from vault/${category}` };
  } catch (error: unknown) {
    console.error("Delete error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

const GUEST_MEALS_FILE = path.join(process.cwd(), "vault", "scheduled_meals.json");

interface GuestMeal {
  id: string;
  userId: string;
  recipeId: string;
  date: string;
  mealType: string;
  plannedYield: number;
  parentMealId: string | null;
}

async function readGuestMeals(): Promise<GuestMeal[]> {
  try {
    await fs.mkdir(path.dirname(GUEST_MEALS_FILE), { recursive: true });
    if (!existsSync(GUEST_MEALS_FILE)) return [];
    const data = await fs.readFile(GUEST_MEALS_FILE, "utf-8");
    return JSON.parse(data) as GuestMeal[];
  } catch {
    return [];
  }
}

async function writeGuestMeals(meals: GuestMeal[]): Promise<void> {
  await fs.mkdir(path.dirname(GUEST_MEALS_FILE), { recursive: true });
  // M4 Fix: File locking to prevent race conditions
  if (!existsSync(GUEST_MEALS_FILE)) {
    await fs.writeFile(GUEST_MEALS_FILE, JSON.stringify(meals, null, 2), "utf-8");
    return;
  }
  const release = await lockfile.lock(GUEST_MEALS_FILE, { retries: { retries: 5, minTimeout: 100 } });
  try {
    await fs.writeFile(GUEST_MEALS_FILE, JSON.stringify(meals, null, 2), "utf-8");
  } finally {
    await release();
  }
}

export async function scheduleMeal(
  recipeId: string,
  dateStr: string,
  mealType: string,
  plannedYield: number = 1.0,
  parentMealId?: string
) {
  try {
    const userId = await getCurrentUserId();
    const date = validateDateStr(dateStr);

    if (userId) {
      const householdId = await getHouseholdId(userId);
      // Authenticated mode: find or import recipe
      let dbRecipe = await prisma.recipe.findFirst({
        where: {
          householdId,
          OR: [
            { id: recipeId },
            { slug: recipeId },
            { slug: recipeId.replace(/^(mains-|sides-|appetizers-|desserts-|curated-current-|curated-archive-)/, "") }
          ]
        }
      });

      if (!dbRecipe) {
        // Try importing from local vault
        const cleanSlug = recipeId.replace(/^(mains-|sides-|appetizers-|desserts-|curated-current-|curated-archive-)/, "");
        const localRecipes = getAllRecipes();
        const localRecipe = localRecipes.find(r => r.slug === cleanSlug || r.slug === recipeId);
        
        if (localRecipe) {
          dbRecipe = await prisma.recipe.create({
            data: {
              householdId,
              slug: localRecipe.slug,
              title: localRecipe.frontmatter.title || localRecipe.slug,
              markdown: localRecipe.content,
              frontmatter: localRecipe.frontmatter as unknown as Prisma.InputJsonValue,
            }
          });
        }
      }

      if (!dbRecipe) {
        throw new Error(`Recipe not found in database or local vault: ${recipeId}`);
      }

      if (!VALID_MEAL_TYPES.includes(mealType as typeof VALID_MEAL_TYPES[number])) {
        throw new Error(`Invalid meal type: ${mealType}`);
      }

      const meal = await prisma.scheduledMeal.create({
        data: {
          userId,
          recipeId: dbRecipe.id,
          date,
          mealType: mealType as MealType,
          plannedYield,
          parentMealId: parentMealId || null,
        },
        include: {
          recipe: true,
        }
      });

      // Synchronize to Google Calendar if sync is enabled
      try {
        const config = await prisma.userConfig.findUnique({
          where: { userId },
        });
        if (config?.googleCalendarSyncEnabled) {
          await syncMealToGoogle(userId, meal.id);
        }
      } catch (err) {
        console.error("Failed to sync new scheduled meal to Google Calendar:", err);
      }

      revalidatePath('/calendar');
      revalidatePath('/plans');
      return { success: true, meal };
    } else {
      // Guest mode
      const meals = await readGuestMeals();
      const id = `guest-meal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const newMeal = {
        id,
        userId: "guest",
        recipeId,
        date: date.toISOString(),
        mealType,
        plannedYield,
        parentMealId: parentMealId || null,
      };

      meals.push(newMeal);
      await writeGuestMeals(meals);

      revalidatePath('/calendar');
      revalidatePath('/plans');
      return { success: true, meal: newMeal };
    }
  } catch (error) {
    console.error("scheduleMeal error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function getScheduledMeals(startDateStr: string, endDateStr: string) {
  try {
    const userId = await getCurrentUserId();
    const start = validateDateStr(startDateStr);
    const end = validateDateStr(endDateStr);

    if (userId) {
      const dbMeals = await prisma.scheduledMeal.findMany({
        where: {
          userId,
          date: {
            gte: start,
            lte: end,
          },
        },
        include: {
          recipe: true,
        },
        orderBy: {
          date: 'asc',
        },
      });
      return { success: true, meals: dbMeals };
    } else {
      // Guest mode
      const allMeals = await readGuestMeals();
      const guestMeals = allMeals.filter((meal: GuestMeal) => {
        const mealDate = new Date(meal.date);
        return mealDate >= start && mealDate <= end;
      });

      const localRecipes = getAllRecipes();
      const mealsWithRecipes = guestMeals.map((meal: GuestMeal) => {
        const cleanSlug = meal.recipeId.replace(/^(mains-|sides-|appetizers-|desserts-|curated-current-|curated-archive-)/, "");
        const recipe = localRecipes.find(
          (r) => r.slug === cleanSlug || r.slug === meal.recipeId
        );
        
        return {
          ...meal,
          recipe: recipe
            ? {
                id: meal.recipeId,
                title: recipe.frontmatter?.title || recipe.slug,
                slug: recipe.slug,
                markdown: recipe.content,
                frontmatter: recipe.frontmatter,
              }
            : {
                id: meal.recipeId,
                title: meal.recipeId.replace(/-/g, " "),
                slug: meal.recipeId,
                markdown: "",
                frontmatter: {},
              },
        };
      });

      return { success: true, meals: mealsWithRecipes };
    }
  } catch (error) {
    console.error("getScheduledMeals error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function moveScheduledMeal(mealId: string, newDateStr: string, newMealType: string) {
  try {
    const userId = await getCurrentUserId();
    const newDate = validateDateStr(newDateStr);

    if (userId) {
      if (!VALID_MEAL_TYPES.includes(newMealType as typeof VALID_MEAL_TYPES[number])) {
        throw new Error(`Invalid meal type: ${newMealType}`);
      }

      const updated = await prisma.scheduledMeal.update({
        where: { id: mealId, userId },
        data: {
          date: newDate,
          mealType: newMealType as MealType,
        },
        include: {
          recipe: true,
        },
      });

      // Synchronize updated schedule to Google Calendar if sync is enabled
      try {
        const config = await prisma.userConfig.findUnique({
          where: { userId },
        });
        if (config?.googleCalendarSyncEnabled) {
          await syncMealToGoogle(userId, mealId);
        }
      } catch (err) {
        console.error("Failed to sync updated scheduled meal to Google Calendar:", err);
      }

      revalidatePath('/calendar');
      revalidatePath('/plans');
      return { success: true, meal: updated };
    } else {
      const meals = await readGuestMeals();
      const index = meals.findIndex((m: GuestMeal) => m.id === mealId);
      if (index === -1) {
        return { success: false, error: `Meal ${mealId} not found` };
      }
      meals[index].date = newDate.toISOString();
      meals[index].mealType = newMealType;
      await writeGuestMeals(meals);
      
      revalidatePath('/calendar');
      revalidatePath('/plans');
      return { success: true, meal: meals[index] };
    }
  } catch (error) {
    console.error("moveScheduledMeal error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function cancelScheduledMeal(mealId: string) {
  try {
    const userId = await getCurrentUserId();

    if (userId) {
      // Find meal first to get googleEventId if synced
      try {
        const meal = await prisma.scheduledMeal.findUnique({
          where: { id: mealId, userId },
        });
        if (meal) {
          const config = await prisma.userConfig.findUnique({
            where: { userId },
          });
          if (config?.googleCalendarSyncEnabled && meal.googleEventId) {
            await deleteMealFromGoogle(userId, meal.googleEventId);
          }
        }
      } catch (err) {
        console.error("Failed to delete scheduled meal from Google Calendar:", err);
      }

      await prisma.scheduledMeal.delete({
        where: { id: mealId, userId },
      });
      revalidatePath('/calendar');
      revalidatePath('/plans');
      return { success: true };
    } else {
      const meals = await readGuestMeals();
      const filtered = meals.filter((m: GuestMeal) => m.id !== mealId);
      if (filtered.length === meals.length) {
        return { success: false, error: `Meal ${mealId} not found` };
      }
      await writeGuestMeals(filtered);
      
      revalidatePath('/calendar');
      revalidatePath('/plans');
      return { success: true };
    }
  } catch (error) {
    console.error("cancelScheduledMeal error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function getChatSessions() {
  try {
    const userId = await getCurrentUserId();
    if (userId) {
      const sessions = await prisma.chatSession.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        include: {
          messages: {
            orderBy: { createdAt: "asc" }
          }
        }
      });
      return { success: true, sessions };
    } else {
      return { success: true, sessions: [] };
    }
  } catch (error) {
    console.error("getChatSessions error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function getChatSession(sessionId: string) {
  try {
    const userId = await getCurrentUserId();
    if (userId) {
      const session = await prisma.chatSession.findUnique({
        where: { id: sessionId, userId },
        include: {
          messages: {
            orderBy: { createdAt: "asc" }
          }
        }
      });
      return { success: true, session };
    } else {
      return { success: true, session: null };
    }
  } catch (error) {
    console.error("getChatSession error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function createChatSession(title: string) {
  try {
    const userId = await getCurrentUserId();
    if (userId) {
      const session = await prisma.chatSession.create({
        data: {
          userId,
          title,
        }
      });
      revalidatePath('/ask_sage');
      return { success: true, session };
    } else {
      return { success: false, error: "Authentication required to create database sessions" };
    }
  } catch (error) {
    console.error("createChatSession error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function saveChatMessage(sessionId: string, role: string, content: string, thought?: string) {
  try {
    const userId = await getCurrentUserId();
    if (userId) {
      const session = await prisma.chatSession.findUnique({
        where: { id: sessionId, userId }
      });
      if (!session) {
        throw new Error("Chat session not found or unauthorized.");
      }

      const dbRole = role === 'sage' ? 'model' : role;

      if (dbRole !== 'user' && dbRole !== 'model') {
        throw new Error(`Invalid chat role: ${dbRole}`);
      }

      const message = await prisma.chatMessage.create({
        data: {
          sessionId,
          role: dbRole as ChatRole,
          content,
          thought: thought || null,
        }
      });

      await prisma.chatSession.update({
        where: { id: sessionId },
        data: { updatedAt: new Date() }
      });

      revalidatePath('/ask_sage');
      return { success: true, message };
    } else {
      return { success: false, error: "Authentication required to save messages" };
    }
  } catch (error) {
    console.error("saveChatMessage error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function deleteChatSession(sessionId: string) {
  try {
    const userId = await getCurrentUserId();
    if (userId) {
      await prisma.chatSession.delete({
        where: { id: sessionId, userId }
      });
      revalidatePath('/ask_sage');
      return { success: true };
    } else {
      return { success: false, error: "Authentication required" };
    }
  } catch (error) {
    console.error("deleteChatSession error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function getWorkoutTelemetry() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: "Authentication required" };
    }

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    fourteenDaysAgo.setHours(0, 0, 0, 0);

    // Fetch all logs from the past 14 days
    const dailyLogs = await prisma.dailyLog.findMany({
      where: {
        userId,
        date: { gte: fourteenDaysAgo },
      },
      include: {
        exerciseEntries: true,
      },
      orderBy: {
        date: 'desc',
      },
    });

    // 1. Session Frequency (active exercise days in last 14 days)
    const activeDays = dailyLogs.filter(log => log.exerciseEntries.length > 0).length;
    const sessionFrequencyStr = `${activeDays} / 14 days`;

    // 2. Training Volume & Cardio vs. Strength classification
    let totalDuration = 0;
    let totalCalories = 0;
    let cardioDuration = 0;
    let strengthDuration = 0;

    const strengthKeywords = [
      'lift', 'strength', 'squat', 'bench', 'press', 'dumbbell', 'barbell', 'hypertrophy', 
      'abs', 'core', 'resistance', 'weight', 'pullup', 'pushup', 'deadlift', 'kettlebell', 
      'bodybuilding', 'powerlifting', 'calisthenics', 'plank'
    ];

    const cardioKeywords = [
      'run', 'jog', 'cycle', 'bike', 'swim', 'row', 'treadmill', 'hiit', 'cardio', 'walk', 
      'hike', 'elliptical', 'spin', 'aerobic', 'jump rope', 'stair', 'climb', 'dance', 'zumba'
    ];

    const allExercises: Array<{
      id: string;
      exerciseName: string;
      durationMinutes: number;
      caloriesBurned: number;
      date: string;
      category: 'Cardio' | 'Strength' | 'Other';
    }> = [];

    dailyLogs.forEach(log => {
      const dateStr = log.date.toISOString().slice(0, 10);
      log.exerciseEntries.forEach(ex => {
        const name = ex.exerciseName.toLowerCase();
        let category: 'Cardio' | 'Strength' | 'Other' = 'Other';

        const isStrength = strengthKeywords.some(kw => name.includes(kw));
        const isCardio = cardioKeywords.some(kw => name.includes(kw));

        if (isStrength) {
          category = 'Strength';
          strengthDuration += ex.durationMinutes;
        } else if (isCardio) {
          category = 'Cardio';
          cardioDuration += ex.durationMinutes;
        } else {
          // If unclassified, classify by intensity rate
          const intensity = ex.caloriesBurned / Math.max(ex.durationMinutes, 1);
          if (intensity > 6) {
            category = 'Cardio';
            cardioDuration += ex.durationMinutes;
          } else {
            category = 'Strength';
            strengthDuration += ex.durationMinutes;
          }
        }

        totalDuration += ex.durationMinutes;
        totalCalories += ex.caloriesBurned;

        allExercises.push({
          id: ex.id,
          exerciseName: ex.exerciseName,
          durationMinutes: ex.durationMinutes,
          caloriesBurned: ex.caloriesBurned,
          date: dateStr,
          category,
        });
      });
    });

    // 3. Cardio vs Strength Split Percentages
    const totalCategorizedDuration = cardioDuration + strengthDuration;
    const cardioPct = totalCategorizedDuration > 0 ? Math.round((cardioDuration / totalCategorizedDuration) * 100) : 0;
    const strengthPct = totalCategorizedDuration > 0 ? Math.round((strengthDuration / totalCategorizedDuration) * 100) : 0;

    // 4. Training Load Score (CDC guideline of 150 mins per week, or 300 mins per 14 days)
    const averageMinPerWeek = totalDuration / 2;
    const avgCalorieBurnRate = totalDuration > 0 ? totalCalories / totalDuration : 0;

    const durationWeight = (averageMinPerWeek / 150) * 50; // Max 50
    const intensityWeight = (avgCalorieBurnRate / 10) * 50; // Max 50
    const trainingLoadScore = Math.min(100, Math.round(durationWeight + intensityWeight));

    return {
      success: true,
      telemetry: {
        sessionFrequency: activeDays,
        sessionFrequencyStr,
        totalDuration,
        totalCalories,
        cardioDuration,
        strengthDuration,
        cardioPct,
        strengthPct,
        trainingLoadScore,
        history: allExercises.slice(0, 10),
      }
    };
  } catch (error) {
    console.error("getWorkoutTelemetry error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}



