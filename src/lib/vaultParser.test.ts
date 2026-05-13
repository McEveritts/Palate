import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getVaultRecipes } from './vaultParser';
import fs from 'fs/promises';

vi.mock('fs/promises');

describe('vaultParser', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should parse recipes from mains and sides directories', async () => {
    vi.mocked(fs.readdir).mockImplementation(async (dir) => {
      if (dir.toString().includes('mains')) return ['test-main.md'] as any;
      if (dir.toString().includes('sides')) return ['test-side.md'] as any;
      return [];
    });
    
    vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
      if (filePath.toString().includes('test-main.md')) {
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
});
