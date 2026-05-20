import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteRecipeFromVault } from './actions';
import fs from 'fs/promises';
import { revalidatePath } from 'next/cache';

vi.mock('fs/promises', () => ({
  default: {
    access: vi.fn(),
    unlink: vi.fn(),
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    rename: vi.fn(),
  }
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('actions - deleteRecipeFromVault', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should successfully delete a main recipe file', async () => {
    (fs.access as any).mockResolvedValue(undefined);
    (fs.unlink as any).mockResolvedValue(undefined);

    const result = await deleteRecipeFromVault('mains-test-recipe');
    
    expect(result.success).toBe(true);
    expect(fs.access).toHaveBeenCalled();
    expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('vault\\mains\\test-recipe.md'));
    expect(revalidatePath).toHaveBeenCalledWith('/vault');
    expect(revalidatePath).toHaveBeenCalledWith('/plans');
  });

  it('should successfully delete a curated current recipe file', async () => {
    (fs.access as any).mockResolvedValue(undefined);
    (fs.unlink as any).mockResolvedValue(undefined);

    const result = await deleteRecipeFromVault('curated-current-test-curated');
    
    expect(result.success).toBe(true);
    expect(fs.access).toHaveBeenCalled();
    expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('vault\\curated\\current\\test-curated.md'));
    expect(revalidatePath).toHaveBeenCalledWith('/vault');
    expect(revalidatePath).toHaveBeenCalledWith('/plans');
  });

  it('should return error if file does not exist', async () => {
    const error = new Error('ENOENT: no such file or directory');
    (fs.access as any).mockRejectedValue(error);

    const result = await deleteRecipeFromVault('sides-nonexistent');

    expect(result.success).toBe(false);
    expect(result.error).toBe('ENOENT: no such file or directory');
    expect(fs.unlink).not.toHaveBeenCalled();
  });
});
