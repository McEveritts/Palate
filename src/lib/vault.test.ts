import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAllRecipes } from './vault';
import fs from 'fs';

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  }
}));

describe('vault - getAllRecipes self-healing', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return normal recipes as is when no thought tags are present', () => {
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readdirSync as any).mockImplementation((dirPath: string) => {
      if (dirPath.endsWith('mains')) return ['perfect-recipe.md'];
      return [];
    });
    (fs.readFileSync as any).mockReturnValue(`---
title: Perfect Recipe
---
Delicious dinner.`);

    const recipes = getAllRecipes();

    expect(recipes).toHaveLength(1);
    expect(recipes[0].frontmatter.title).toBe('Perfect Recipe');
    expect(recipes[0].content).toBe('Delicious dinner.');
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('should detect thought tags, sanitize in-memory, and NOT rewrite file to disk (M8 fix)', () => {
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readdirSync as any).mockImplementation((dirPath: string) => {
      if (dirPath.endsWith('mains')) return ['bad-recipe.md'];
      return [];
    });
    (fs.readFileSync as any).mockReturnValue(`<thought>
Let me construct a bad recipe.
</thought>
---
title: Self Healed Recipe
---
This is a delicious dinner.`);

    const recipes = getAllRecipes();

    expect(recipes).toHaveLength(1);
    expect(recipes[0].frontmatter.title).toBe('Self Healed Recipe');
    expect(recipes[0].content).toBe('This is a delicious dinner.');

    // M8 Fix: Verify that read operations no longer write to disk
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });
});
