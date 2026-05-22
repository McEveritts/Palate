"use server";

import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import yaml from 'js-yaml';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/db";
import { getHouseholdId } from "@/lib/household";

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

