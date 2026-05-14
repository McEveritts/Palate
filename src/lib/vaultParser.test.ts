import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getVaultRecipes } from './vaultParser';
import fs from 'fs/promises';

vi.mock('fs/promises', () => ({
  default: {
    readdir: vi.fn(),
    readFile: vi.fn(),
  }
}));

describe('vaultParser', () => {
  beforeEach(() => {
    vi.resetAllMocks();
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
});
