"use server";

import fs from "fs/promises";
import { existsSync } from 'fs';
import path from "path";
import { revalidatePath } from "next/cache";
import { sanitizeRecipeContent } from "../lib/parser";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/db";
import { getHouseholdId } from "@/lib/household";
import matter from "gray-matter";
import { getAllRecipes } from "../lib/vault";
import { z } from 'zod/v4';
import { syncMealToGoogle, deleteMealFromGoogle } from "@/lib/googleCalendar";
import lockfile from 'proper-lockfile';

async function getCurrentUserId(): Promise<string | null> {
  if (typeof getServerSession !== 'function') return null;
  try {
    const session = await getServerSession(authOptions);
    return session?.user ? session.user.id : null;
  } catch (error) {
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
    let category = "mains"; // default fallback
    const contentLower = sanitizedFileContent.toLowerCase();

    if (
      contentLower.includes("tag: appetizer") || 
      contentLower.includes("tags: [appetizer") || 
      contentLower.includes("category: appetizers") ||
      /\bappetizers?\b/.test(contentLower)
    ) {
      category = "appetizers";
    } else if (
      contentLower.includes("tag: side") || 
      contentLower.includes("tags: [side") || 
      contentLower.includes("category: sides") ||
      /\bsides?\b/.test(contentLower)
    ) {
      category = "sides";
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

export async function saveParsedRecipe(markdown: string, category: 'mains' | 'sides' | 'appetizers', title: string) {
  try {
    if (category !== 'mains' && category !== 'sides' && category !== 'appetizers') {
      throw new Error('Invalid category. Must be mains, sides or appetizers.');
    }

    validateContentLength(markdown);

    const userId = await getCurrentUserId();

    if (userId) {
      const householdId = await getHouseholdId(userId);
      const { data, content } = matter(markdown);
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
            category,
          }
        }
      });

      revalidatePath('/vault');
      return { success: true, message: `Recipe saved to database as ${finalSlug}` };
    }

    const cleanContent = markdown.trim();
    
    // Slugify title for filename
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const filename = `${slug}.md`;
    
    const vaultPath = path.join(process.cwd(), "vault", category);
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
    return { success: true, message: `Recipe saved to vault/${category} as ${path.basename(filePath)}` };
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

      const frontmatter = (recipe.frontmatter as any) || {};
      const fileContentLower = (recipe.markdown || '').toLowerCase();
      const tags = Array.isArray(frontmatter.tags)
        ? frontmatter.tags
        : typeof frontmatter.tags === 'string'
          ? frontmatter.tags.split(',').map((t: string) => t.trim())
          : [];
      
      let targetCategory = "mains";
      if (
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

      revalidatePath('/vault');
      revalidatePath('/plans');
      return { success: true };
    }

    const [_, type, ...filenameParts] = id.split('-');
    
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
    if (
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

      revalidatePath('/vault');
      revalidatePath('/plans');
      return { success: true, message: `Recipe successfully deleted from database` };
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

async function readGuestMeals(): Promise<any[]> {
  try {
    await fs.mkdir(path.dirname(GUEST_MEALS_FILE), { recursive: true });
    if (!existsSync(GUEST_MEALS_FILE)) return [];
    const data = await fs.readFile(GUEST_MEALS_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

async function writeGuestMeals(meals: any[]): Promise<void> {
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
            { slug: recipeId.replace(/^(mains-|sides-|curated-current-|curated-archive-)/, "") }
          ]
        }
      });

      if (!dbRecipe) {
        // Try importing from local vault
        const cleanSlug = recipeId.replace(/^(mains-|sides-|curated-current-|curated-archive-)/, "");
        const localRecipes = getAllRecipes();
        const localRecipe = localRecipes.find(r => r.slug === cleanSlug || r.slug === recipeId);
        
        if (localRecipe) {
          dbRecipe = await prisma.recipe.create({
            data: {
              householdId,
              slug: localRecipe.slug,
              title: localRecipe.frontmatter.title || localRecipe.slug,
              markdown: localRecipe.content,
              frontmatter: localRecipe.frontmatter as any,
            }
          });
        }
      }

      if (!dbRecipe) {
        throw new Error(`Recipe not found in database or local vault: ${recipeId}`);
      }

      const meal = await prisma.scheduledMeal.create({
        data: {
          userId,
          recipeId: dbRecipe.id,
          date,
          mealType,
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
      const guestMeals = allMeals.filter((meal: any) => {
        const mealDate = new Date(meal.date);
        return mealDate >= start && mealDate <= end;
      });

      const localRecipes = getAllRecipes();
      const mealsWithRecipes = guestMeals.map((meal: any) => {
        const cleanSlug = meal.recipeId.replace(/^(mains-|sides-|curated-current-|curated-archive-)/, "");
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
      const updated = await prisma.scheduledMeal.update({
        where: { id: mealId, userId },
        data: {
          date: newDate,
          mealType: newMealType,
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
      const index = meals.findIndex((m: any) => m.id === mealId);
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
      const filtered = meals.filter((m: any) => m.id !== mealId);
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


