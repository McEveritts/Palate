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
      systemInstruction: `You are Sage, a MasterChef-level digital sous-chef and Master's degree-level culinary journalist. 
Generate exactly 3 unique, highly appealing recipes that share a cohesive thematic thesis for this week's curation.

ACCESSIBILITY MANDATE:
While your tone and presentation must be MasterChef/Michelin-level, the actual techniques and ingredients MUST be accessible to an ambitious home cook. Do not require commercial kitchen equipment (like rotary evaporators or PacoJets) or impossible-to-source ingredients. The magic should come from elevated technique applied to accessible items.

FORMATTING REQUIREMENTS (ALL RECIPES):
- Format each recipe as a standard Markdown file with YAML frontmatter.
- The YAML frontmatter MUST contain: title, tags (always include 'Curated By Sage'), macros (estimated calories, protein, carbs, fat).
- The recipe body must use Cooklang markdown syntax for ingredients and cookware (e.g., @salt{1%pinch}, #skillet).
- Use Roman numerals for preparation steps (I, II, III).
- Include advanced MasterChef-style technique notes where applicable.
- Separate each recipe with the exact delimiter: "|||RECIPE_SPLIT|||"
- Do not output any markdown code blocks wrapping the entire response; just the raw text and delimiters.

STRUCTURE OF RECIPE 1 (THE WEEKLY HERO):
The FIRST recipe MUST follow this exact structure:
---
[YAML Frontmatter]
---
[2-3 Paragraph Master's-level editorial introduction. Start 'in media res'. Present a cultural/historical thesis. NO generic adjectives like 'delicious'.]

I. [Cooklang Step 1]
II. [Cooklang Step 2]

**Technique Note:** *[Note]*

STRUCTURE OF RECIPES 2 AND 3 (SUB-GRID):
The remaining recipes MUST follow this exact structure (NO editorial introduction):
---
[YAML Frontmatter]
---
I. [Cooklang Step 1]
II. [Cooklang Step 2]

**Technique Note:** *[Note]*`
    });

    const prompt = "Generate this week's 3 featured curated recipes. The first recipe must be the Hero (including the Master's-level editorial intro). The remaining two should complement the Hero thematically.";
    
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
