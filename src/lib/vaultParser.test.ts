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
    },
    user: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ householdId: 'household-abc', name: 'Test' }),
    },
    household: {
      create: vi.fn().mockResolvedValue({ id: 'household-abc' }),
    },
  }
}));

vi.mock('@/lib/household', () => ({
  getHouseholdId: vi.fn().mockResolvedValue('household-abc'),
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
    vi.mocked(fs.readdir).mockImplementation(async (dir: string) => {
      if (dir.includes('mains')) return ['test-main.md'];
      if (dir.includes('sides')) return ['test-side.md'];
      return [];
    });
    
    vi.mocked(fs.readFile).mockImplementation(async (filePath: string) => {
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
      
      vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'user-123' } });
      vi.mocked(prisma.recipe.count).mockResolvedValue(5);
      vi.mocked(prisma.recipe.findMany).mockResolvedValue([
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

    it('should incrementally seed desserts if user is logged in, count > 0, but no dessert recipes exist', async () => {
      const { getServerSession } = await import('next-auth/next');
      const { prisma } = await import('@/lib/db');
      
      vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'user-123' } });
      
      let countCall = 0;
      vi.mocked(prisma.recipe.count).mockImplementation(async () => {
        countCall++;
        if (countCall === 1) return 5;
        if (countCall === 2) return 0;
        return 0;
      });

      vi.mocked(fs.readdir).mockImplementation(async (dir: string) => {
        if (dir.includes('desserts')) return ['matcha-chia-pudding.md'];
        return [];
      });
      vi.mocked(fs.readFile).mockImplementation(async (filePath: string) => {
        if (filePath.includes('matcha-chia-pudding.md')) {
          return `---\nrecipe: 'Matcha Chia Pudding'\ntags: ['sweet']\nmacros: 'Protein: 5g'\n---\n# Delicious green tea pudding`;
        }
        return '';
      });

      vi.mocked(prisma.recipe.findMany).mockResolvedValue([
        {
          slug: 'matcha-chia-pudding',
          title: 'Matcha Chia Pudding',
          markdown: '# Delicious green tea pudding',
          frontmatter: {
            category: 'desserts',
            tags: ['sweet'],
            macros: { protein: '5g' }
          }
        }
      ]);

      const recipes = await getVaultRecipes();
      
      expect(prisma.recipe.upsert).toHaveBeenCalled();
      expect(recipes).toHaveLength(1);
      expect(recipes[0].title).toBe('Matcha Chia Pudding');
      expect(recipes[0].category).toBe('desserts');
    });
  });
});
