"use server";

import fs from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { sanitizeRecipeContent } from "../lib/parser";

export async function saveRecipeToVault(content: string, format: 'md' | 'txt' = 'md') {
  try {
    if (format !== 'md' && format !== 'txt') {
      throw new Error('Invalid format. Must be md or txt.');
    }

    // 1. Clean the content to strip thought tags, preambles, and code blocks, and reconstruct cleanly
    const { data, fileContent: sanitizedFileContent } = sanitizeRecipeContent(content);

    // 2. Extract title from frontmatter for the filename
    const titleMatch = sanitizedFileContent.match(/title:\s*["']?([^"'\n]+)["']?/i) || sanitizedFileContent.match(/Recipe:\s*["']?([^"'\n]+)["']?/i);
    const title = data.recipe || data.title || (titleMatch ? titleMatch[1].trim() : "Generated Recipe");
    
    // 3. Slugify
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const filename = `${slug}.${format}`;
    
    // 4. Determine category based on tags (default to mains)
    const tags = Array.isArray(data.tags)
      ? data.tags
      : typeof data.tags === 'string'
        ? data.tags.split(',').map((t: string) => t.trim())
        : [];
    const isSide = tags.some((t: string) => t.toLowerCase().includes('side')) || sanitizedFileContent.toLowerCase().includes("side");
    const category = isSide ? "sides" : "mains";
    
    // 5. Write file to the correct vault directory
    const vaultPath = path.join(process.cwd(), "vault", category);
    await fs.mkdir(vaultPath, { recursive: true });
    
    const filePath = path.join(vaultPath, filename);
    await fs.writeFile(filePath, sanitizedFileContent, "utf-8");
    
    revalidatePath('/vault');
    return { success: true, message: `Recipe saved to vault/${category} as ${filename}` };
  } catch (error: unknown) {
    console.error("Save error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function saveParsedRecipe(markdown: string, category: 'mains' | 'sides', title: string) {
  try {
    if (category !== 'mains' && category !== 'sides') {
      throw new Error('Invalid category. Must be mains or sides.');
    }

    const cleanContent = markdown.trim();
    
    // Slugify title for filename
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const filename = `${slug}.md`;
    
    const vaultPath = path.join(process.cwd(), "vault", category);
    await fs.mkdir(vaultPath, { recursive: true });
    
    let filePath = path.join(vaultPath, filename);
    
    // Prevent overwrite
    try {
      await fs.access(filePath);
      // File exists, append timestamp
      const newFilename = `${slug}-${Date.now()}.md`;
      filePath = path.join(vaultPath, newFilename);
    } catch {
      // File does not exist, safe to write
    }
    
    await fs.writeFile(filePath, cleanContent, "utf-8");
    
    revalidatePath('/vault');
    return { success: true, message: `Recipe saved to vault/${category} as ${path.basename(filePath)}` };
  } catch (error: unknown) {
    console.error("Save parsed recipe error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function saveCuratedToVault(id: string) {
  try {
    const [_, type, ...filenameParts] = id.split('-');
    
    if (type !== 'current' && type !== 'archive') {
      throw new Error('Invalid curated type. Must be current or archive.');
    }

    const filename = filenameParts.join('-') + '.md';
    const curatedPath = path.join(process.cwd(), 'vault', 'curated', type, filename);
    
    const fileContent = await fs.readFile(curatedPath, 'utf-8');
    
    // Determine category based on tags
    const isSide = fileContent.toLowerCase().includes("tags:") && fileContent.toLowerCase().includes("side");
    const targetCategory = isSide ? "sides" : "mains";
    
    let targetPath = path.join(process.cwd(), 'vault', targetCategory, filename);
    
    // Prevent overwrite
    try {
      await fs.access(targetPath);
      // File exists, append timestamp
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      const newFilename = `${base}-${Date.now()}${ext}`;
      targetPath = path.join(process.cwd(), 'vault', targetCategory, newFilename);
    } catch {
      // File does not exist, safe to move
    }
    
    // Move the file
    await fs.rename(curatedPath, targetPath);
    
    revalidatePath('/vault');
    revalidatePath('/plans');
    return { success: true };
  } catch (error: unknown) {
    console.error("Error moving curated recipe:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function deleteRecipeFromVault(id: string) {
  try {
    let category: string;
    let slug: string;
    
    if (id.startsWith('curated-current-')) {
      category = 'curated/current';
      slug = id.substring('curated-current-'.length);
    } else if (id.startsWith('curated-archive-')) {
      category = 'curated/archive';
      slug = id.substring('curated-archive-'.length);
    } else if (id.startsWith('mains-')) {
      category = 'mains';
      slug = id.substring('mains-'.length);
    } else if (id.startsWith('sides-')) {
      category = 'sides';
      slug = id.substring('sides-'.length);
    } else {
      throw new Error(`Invalid recipe ID format: ${id}`);
    }
    
    const filename = `${slug}.md`;
    const filePath = path.join(process.cwd(), 'vault', category, filename);
    
    // Check if the file exists before attempting deletion
    await fs.access(filePath);
    await fs.unlink(filePath);
    
    revalidatePath('/vault');
    revalidatePath('/plans');
    return { success: true, message: `Recipe successfully deleted from vault/${category}` };
  } catch (error: unknown) {
    console.error("Delete error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

