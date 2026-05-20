"use server";

import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/db";

export interface VaultRecipe {
  id: string;
  slug: string;
  title: string;
  category: 'mains' | 'sides' | 'curated-current' | 'curated-archive';
  tags: string[];
  macros: string;
  content: string;
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
    content: r.markdown
  };
}

async function seedRecipesForUser(userId: string) {
  // Read mains & sides
  const categories: ('mains' | 'sides')[] = ['mains', 'sides'];
  for (const category of categories) {
    const dirPath = path.join(process.cwd(), 'vault', category);
    try {
      const files = await fs.readdir(dirPath);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const filePath = path.join(dirPath, file);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const { data, content } = matter(fileContent);
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
        const { data, content } = matter(fileContent);
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
    return session?.user ? (session.user as any).id : null;
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
        return cat === 'mains' || cat === 'sides';
      })
      .map(r => mapDbRecipeToVaultRecipe(r));
  }

  const categories: ('mains' | 'sides')[] = ['mains', 'sides'];
  const allRecipes: VaultRecipe[] = [];

  for (const category of categories) {
    const dirPath = path.join(process.cwd(), 'vault', category);
    try {
      const files = await fs.readdir(dirPath);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        
        const filePath = path.join(dirPath, file);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const { data, content } = matter(fileContent);
        
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
    if (count === 0) {
      await seedRecipesForUser(userId);
    }

    const recipes = await prisma.recipe.findMany({
      where: { userId }
    });

    const categoryName = `curated-${type}`;
    const curated = recipes.filter(r => (r.frontmatter as any)?.category === categoryName);
    
    // Sort by createdAt ascending (same chronological order concept)
    curated.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

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
      const { data, content } = matter(fileContent);

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
        mtimeMs: stat.mtimeMs
      });
    }
  } catch (error) {
    console.warn(`Could not read directory ${dirPath}`);
  }

  // Sort by modification time ascending so the first generated recipe is always first
  allCurated.sort((a, b) => a.mtimeMs - b.mtimeMs);

  return allCurated.map(({ mtimeMs, ...recipe }) => recipe);
}

