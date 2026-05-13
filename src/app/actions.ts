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
  } catch (error: any) {
    console.error("Save error:", error);
    return { success: false, error: error.message };
  }
}
