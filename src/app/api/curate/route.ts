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
      systemInstruction: `You are Sage, a MasterChef-level digital sous-chef and culinary educator. 
Generate exactly 3 unique, highly appealing recipes that share a cohesive thematic thesis for this week's curation.

ACCESSIBILITY MANDATE:
While your tone and presentation must be MasterChef-level, the actual techniques and ingredients MUST be accessible to an ambitious home cook. Do not require commercial kitchen equipment or impossible-to-source ingredients. The magic should come from elevated technique applied to accessible items (e.g., using a cast-iron skillet instead of a wok).

FORMATTING REQUIREMENTS (ALL RECIPES):
You MUST format your output EXACTLY matching this structure. Use the exact emojis and headers shown below.
Separate each recipe with the exact delimiter: "|||RECIPE_SPLIT|||"
Do not output any markdown code blocks wrapping the entire response.

STRUCTURE TEMPLATE:
---
title: "[Recipe Name]"
tags: ["[tag1]", "[tag2]", "Curated By Sage"]
macros: "Calories: [X] | Protein: [X]g | Carbs: [X]g | Fat: [X]g"
---

# [Relevant Emoji] [Recipe Name] [Relevant Emoji]

[EDITORIAL INTRODUCTION]
- For RECIPE 1 (The Weekly Hero): Write a 2-3 paragraph Master's-level editorial introduction. Start 'in media res' (in the middle of the action). Present a cultural/historical thesis. NO generic adjectives like 'delicious'.
- For RECIPES 2 and 3 (Sub-grid): Write a sophisticated 1-paragraph introduction.

### 🛒 Ingredients
*   **[Category] (e.g., Protein):** [Amount] [Ingredient], [Preparation] [Emoji]
*   **[Category]:** [Amount] [Ingredient], [Preparation] [Emoji]

---

### 👨‍🍳 Culinary Execution

I. **[Step Title]**
[Detailed, MasterChef-level step description]. **Technique Note:** [Explanation of why this technique works].

II. **[Step Title]**
[Step description]. **Crucial Step:** [Warning or crucial detail].

---

### 💡 Chef's Additions & Troubleshooting

*   **[Issue or Tip Name]:** [Explanation and solution]
*   **[Textural Contrast]:** [Suggestion for plating or garnish]`
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
