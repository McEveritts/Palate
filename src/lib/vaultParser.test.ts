import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs/promises', () => ({
  default: {
    readdir: vi.fn(),
    readFile: vi.fn(),
    stat: vi.fn(),
  }
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    recipe: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    }
  }
}));

vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn().mockResolvedValue(null), // defaults to guest mode
}));

import { getVaultRecipes } from './vaultParser';
import fs from 'fs/promises';
import { getServerSession } from 'next-auth/next';

describe('vaultParser', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getServerSession).mockResolvedValue(null);
  });

  it('should parse recipes from mains and sides directories', async () => {
    (fs.readdir as any).mockImplementation(async (dir: string) => {
      if (dir.includes('mains')) return ['test-main.md'];
      if (dir.includes('sides')) return ['test-side.md'];
      return [];
    });
    
    (fs.readFile as any).mockImplementation(async (filePath: string) => {
      if (filePath.includes('test-main.md')) {
        return `---\nrecipe: 'Main Dish'\ntags: ['dinner']\nmacros: 'Calories: 500'\n---\n# Content`;
      }
      return `---\nrecipe: 'Side Dish'\ntags: ['lunch']\nmacros: 'Calories: 200'\n---\n# Content`;
    });

    const recipes = await getVaultRecipes();
    expect(recipes).toHaveLength(2);
    expect(recipes[0].title).toBe('Main Dish');
    expect(recipes[0].category).toBe('mains');
    expect(recipes[1].title).toBe('Side Dish');
    expect(recipes[1].category).toBe('sides');
  });

  describe('authenticated database mode', () => {
    it('should fetch recipes from database when logged in', async () => {
      const { getServerSession } = await import('next-auth/next');
      const { prisma } = await import('@/lib/db');
      
      (getServerSession as any).mockResolvedValue({ user: { id: 'user-123' } });
      (prisma.recipe.count as any).mockResolvedValue(5);
      (prisma.recipe.findMany as any).mockResolvedValue([
        {
          slug: 'db-main-recipe',
          title: 'DB Main Recipe',
          markdown: '# Body content',
          frontmatter: {
            category: 'mains',
            tags: ['dinner'],
            macros: { protein: '30g', carbs: '20g', fat: '10g', calories: 300 }
          }
        }
      ]);

      const recipes = await getVaultRecipes();
      expect(recipes).toHaveLength(1);
      expect(recipes[0].title).toBe('DB Main Recipe');
      expect(recipes[0].category).toBe('mains');
      expect(recipes[0].id).toBe('mains-db-main-recipe');
      expect(recipes[0].content).toBe('# Body content');
    });
  });
});
