import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: Request) {
  try {
    const currentDir = path.join(process.cwd(), 'vault', 'curated', 'current');
    const archiveDir = path.join(process.cwd(), 'vault', 'curated', 'archive');

    // Ensure directories exist
    await fs.mkdir(currentDir, { recursive: true });
    await fs.mkdir(archiveDir, { recursive: true });

    // 1. Move all current files to archive
    try {
      const currentFiles = await fs.readdir(currentDir);
      for (const file of currentFiles) {
        if (!file.endsWith('.md')) continue;
        const oldPath = path.join(currentDir, file);
        const newPath = path.join(archiveDir, file);
        await fs.rename(oldPath, newPath);
      }
    } catch (e) {
      console.warn("Could not move current to archive (might be empty).", e);
    }

    // 2. Prompt Sage to generate new curated recipes
    const model = genAI.getGenerativeModel({
      model: "gemini-3.1-pro-preview",
      systemInstruction: `You are Sage, a MasterChef-level digital sous-chef. 
Generate exactly 2 unique, highly appealing, MasterChef-level recipes. 
Format each recipe as a standard Markdown file with YAML frontmatter.
The YAML frontmatter MUST contain: title, tags (always include 'Curated By Sage'), macros (estimated calories, protein, carbs, fat).
Separate each recipe with the delimiter: "|||RECIPE_SPLIT|||"
Do not output anything other than the recipes and the delimiter.`
    });

    const prompt = "Generate this week's 2 featured curated recipes. One should be a hearty main course, and one should be a delicate, elevated side or appetizer.";
    
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // 3. Save the newly generated recipes
    const recipes = text.split("|||RECIPE_SPLIT|||");
    let savedCount = 0;

    for (const rawRecipe of recipes) {
      let cleanContent = rawRecipe.trim();
      if (!cleanContent) continue;
      
      if (cleanContent.startsWith("\`\`\`yaml")) {
        cleanContent = cleanContent.replace(/^```yaml/, "---");
        cleanContent = cleanContent.replace(/```/, "---");
      } else if (cleanContent.startsWith("\`\`\`markdown")) {
        cleanContent = cleanContent.replace(/^```markdown/, "");
        cleanContent = cleanContent.replace(/```$/, "");
      }

      const titleMatch = cleanContent.match(/title:\s*["']?([^"'\n]+)["']?/i);
      const title = titleMatch ? titleMatch[1].trim() : `Curated Recipe ${Date.now()}`;
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const filename = `${slug}.md`;

      const filePath = path.join(currentDir, filename);
      await fs.writeFile(filePath, cleanContent.trim(), "utf-8");
      savedCount++;
    }

    return NextResponse.json({ success: true, message: `Archived old recipes and generated ${savedCount} new curated recipes.` });

  } catch (error: unknown) {
    console.error("Curate API Error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
