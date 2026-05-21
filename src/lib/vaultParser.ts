"use server";

import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import yaml from 'js-yaml';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/db";

const SAFE_MATTER_OPTIONS = {
  engines: { yaml: (s: string) => yaml.load(s, { schema: yaml.FAILSAFE_SCHEMA }) as Record<string, unknown> }
};

export interface VaultRecipe {
  id: string;
  slug: string;
  title: string;
  category: 'mains' | 'sides' | 'appetizers' | 'curated-current' | 'curated-archive';
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

async function seedRecipesForUser(userId: string) {
  // Read mains, sides & appetizers
  const categories: ('mains' | 'sides' | 'appetizers')[] = ['mains', 'sides', 'appetizers'];
  for (const category of categories) {
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
            userId_slug: {
              userId,
              slug,
            }
          },
          create: {
            userId,
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
      console.warn(`Could not read directory ${dirPath} for seeding`);
    }
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
            userId_slug: {
              userId,
              slug,
            }
          },
          create: {
            userId,
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

export async function getVaultRecipes(): Promise<VaultRecipe[]> {
  const userId = await getCurrentUserId();

  if (userId) {
    const count = await prisma.recipe.count({ where: { userId } });
    if (count === 0) {
      await seedRecipesForUser(userId);
    }

    const recipes = await prisma.recipe.findMany({
      where: { userId }
    });

    return recipes
      .filter(r => {
        const cat = (r.frontmatter as any)?.category;
        return cat === 'mains' || cat === 'sides' || cat === 'appetizers';
      })
      .map(r => mapDbRecipeToVaultRecipe(r));
  }

  const categories: ('mains' | 'sides' | 'appetizers')[] = ['mains', 'sides', 'appetizers'];
  const allRecipes: VaultRecipe[] = [];

  for (const category of categories) {
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
          category,
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
    const count = await prisma.recipe.count({ where: { userId } });
    let recipes = await prisma.recipe.findMany({
      where: { userId }
    });

    const currentCuratedCount = recipes.filter(r => (r.frontmatter as any)?.category === 'curated-current').length;
    if (count === 0 || currentCuratedCount !== 1) {
      await seedRecipesForUser(userId);
      recipes = await prisma.recipe.findMany({
        where: { userId }
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

