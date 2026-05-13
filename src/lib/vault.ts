import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

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
      const { data, content } = matter(fileContent);

      recipes.push({
        slug: file.replace(/\.md$/, ''),
        category,
        frontmatter: data as RecipeFrontmatter,
        content
      });
    });
  });

  return recipes;
}
