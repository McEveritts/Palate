"use server";

import fs from "fs/promises";
import path from "path";

export async function saveRecipeToVault(content: string, format: 'md' | 'txt' = 'md') {
  try {
    // 1. Clean the content to ensure standard YAML frontmatter (---) instead of ```yaml
    let cleanContent = content.trim();
    if (cleanContent.startsWith("```yaml")) {
      cleanContent = cleanContent.replace(/^```yaml/, "---");
      cleanContent = cleanContent.replace(/```/, "---");
    }

    // 2. Extract title from frontmatter for the filename
    const titleMatch = cleanContent.match(/title:\s*["']?([^"'\n]+)["']?/i) || cleanContent.match(/Recipe:\s*["']?([^"'\n]+)["']?/i);
    const title = titleMatch ? titleMatch[1].trim() : "Generated Recipe";
    
    // 3. Slugify
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const filename = `${slug}.${format}`;
    
    // 4. Determine category based on tags (default to mains)
    const isSide = cleanContent.toLowerCase().includes("tags:") && cleanContent.toLowerCase().includes("side");
    const category = isSide ? "sides" : "mains";
    
    // 5. Write file to the correct vault directory
    const vaultPath = path.join(process.cwd(), "vault", category);
    await fs.mkdir(vaultPath, { recursive: true });
    
    const filePath = path.join(vaultPath, filename);
    await fs.writeFile(filePath, cleanContent, "utf-8");
    
    return { success: true, message: `Recipe saved to vault/${category} as ${filename}` };
  } catch (error: unknown) {
    console.error("Save error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function saveParsedRecipe(markdown: string, category: 'mains' | 'sides', title: string) {
  try {
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
    
    return { success: true, message: `Recipe saved to vault/${category} as ${path.basename(filePath)}` };
  } catch (error: unknown) {
    console.error("Save parsed recipe error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function saveCuratedToVault(id: string) {
  try {
    const [_, type, ...filenameParts] = id.split('-');
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
    
    return { success: true };
  } catch (error: unknown) {
    console.error("Error moving curated recipe:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

