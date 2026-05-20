import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import yaml from 'js-yaml';
import { sanitizeRecipeContent } from './parser';

const SAFE_MATTER_OPTIONS = {
  engines: { yaml: (s: string) => yaml.load(s, { schema: yaml.FAILSAFE_SCHEMA }) as Record<string, unknown> }
};

const VAULT_DIR = path.join(process.cwd(), 'vault');

export interface RecipeFrontmatter {
  title: string;
  tags: string[];
  macros: {
    protein: string;
    carbs: string;
    fat: string;
    calories: number;
  };
  time: {
    synthesis: string;
    execute: string;
  };
}

export interface Recipe {
  slug: string;
  category: string;
  frontmatter: RecipeFrontmatter;
  content: string;
}

export function getAllRecipes(): Recipe[] {
  const recipes: Recipe[] = [];
  const categories = ['mains', 'sides']; // Only pulling from recipe directories

  categories.forEach(category => {
    const categoryPath = path.join(VAULT_DIR, category);
    if (!fs.existsSync(categoryPath)) return;

    const files = fs.readdirSync(categoryPath);
    files.forEach(file => {
      if (path.extname(file) !== '.md') return;

      const filePath = path.join(categoryPath, file);
      const fileContent = fs.readFileSync(filePath, 'utf8');

      if (/<thought>/i.test(fileContent)) {
        const { data: sanitizedData, content: sanitizedBody, fileContent: sanitizedFileContent } = sanitizeRecipeContent(fileContent);
        
        // Synchronously overwrite the file on disk (self-heal!)
        fs.writeFileSync(filePath, sanitizedFileContent, 'utf8');

        recipes.push({
          slug: file.replace(/\.md$/, ''),
          category,
          frontmatter: sanitizedData as unknown as RecipeFrontmatter,
          content: sanitizedBody
        });
      } else {
        const { data, content } = matter(fileContent, SAFE_MATTER_OPTIONS);
        recipes.push({
          slug: file.replace(/\.md$/, ''),
          category,
          frontmatter: data as RecipeFrontmatter,
          content
        });
      }
    });
  });

  return recipes;
}
