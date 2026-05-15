"use server";

import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

export interface VaultRecipe {
  id: string;
  title: string;
  category: 'mains' | 'sides' | 'curated-current' | 'curated-archive';
  tags: string[];
  macros: string;
  content: string;
}

export async function getVaultRecipes(): Promise<VaultRecipe[]> {
  const categories: ('mains' | 'sides')[] = ['mains', 'sides'];
  const allRecipes: VaultRecipe[] = [];

  for (const category of categories) {
    const dirPath = path.join(process.cwd(), 'vault', category);
    try {
      const files = await fs.readdir(dirPath);
      const recipePromises = files.map(async (file) => {
        if (!file.endsWith('.md')) return null;
        
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

        return {
          id: `${category}-${file.replace('.md', '')}`,
          title: data.recipe || data.title || file.replace('.md', ''),
          category,
          tags,
          macros: macrosStr,
          content: content.trim()
        };
      });

      const results = await Promise.all(recipePromises);
      for (const res of results) {
        if (res) allRecipes.push(res);
      }
    } catch (_error) {
      console.warn(`Could not read directory ${dirPath}`);
    }
  }

  return allRecipes;
}

export async function getCuratedRecipes(type: 'current' | 'archive'): Promise<VaultRecipe[]> {
  const allCurated: (VaultRecipe & { mtimeMs: number })[] = [];
  const dirPath = path.join(process.cwd(), 'vault', 'curated', type);
  const categoryName = `curated-${type}` as 'curated-current' | 'curated-archive';

  try {
    const files = await fs.readdir(dirPath);
    const curatedPromises = files.map(async (file) => {
      if (!file.endsWith('.md')) return null;

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

      return {
        id: `${categoryName}-${file.replace('.md', '')}`,
        title: data.recipe || data.title || file.replace('.md', ''),
        category: categoryName,
        tags,
        macros: macrosStr,
        content: content.trim(),
        mtimeMs: stat.mtimeMs
      };
    });

    const curatedResults = await Promise.all(curatedPromises);
    for (const res of curatedResults) {
      if (res) allCurated.push(res);
    }
  } catch (_error) {
    console.warn(`Could not read directory ${dirPath}`);
  }

  // Sort by modification time ascending so the first generated recipe is always first
  allCurated.sort((a, b) => a.mtimeMs - b.mtimeMs);

  return allCurated.map(({ mtimeMs: _mtimeMs, ...recipe }) => recipe);
}
