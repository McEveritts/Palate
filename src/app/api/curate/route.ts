import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/db";
import { getHouseholdId } from "@/lib/household";
import matter from 'gray-matter';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: Request) {
  try {
    // Determine if we're in DB mode or filesystem mode
    const session = await getServerSession(authOptions).catch(() => null);
    const userId = session?.user ? session.user.id : null;
    const householdId = userId ? await getHouseholdId(userId) : null;

    const currentDir = path.join(process.cwd(), 'vault', 'curated', 'current');
    const archiveDir = path.join(process.cwd(), 'vault', 'curated', 'archive');

    // 1. Archive old curated recipes
    if (householdId) {
      // DB mode: move curated-current → curated-archive
      const currentRecipes = await prisma.recipe.findMany({
        where: { householdId, frontmatter: { path: ['category'], equals: 'curated-current' } },
      });
      for (const recipe of currentRecipes) {
        const fm = (recipe.frontmatter as any) || {};
        await prisma.recipe.update({
          where: { id: recipe.id },
          data: { frontmatter: { ...fm, category: 'curated-archive' } },
        });
      }
    } else {
      // Filesystem mode: move files
      await fs.mkdir(currentDir, { recursive: true });
      await fs.mkdir(archiveDir, { recursive: true });
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
    }

    // 2. Prompt Sage to generate new curated recipes
    const model = genAI.getGenerativeModel({
      model: "gemini-3.1-pro-preview",
      systemInstruction: `You are Sage, a MasterChef-level digital sous-chef and culinary educator. 
Generate exactly 3 unique, highly appealing recipes that share a cohesive thematic thesis for this week's curation.

CRITICAL REQUIREMENTS:
1. You MUST generate exactly THREE distinct recipes.
2. ONE recipe must be the Main dish, and its YAML frontmatter MUST contain the tag "main" in the tags list.
3. TWO recipes must be Side dishes, and their YAML frontmatter MUST contain the tag "side" in the tags list.
4. Separate each of the 3 recipes with exactly this string on its own line: |||RECIPE_SPLIT|||

ACCESSIBILITY MANDATE:
While your tone and presentation must be MasterChef-level, the actual techniques and ingredients MUST be accessible to an ambitious home cook. Do not require commercial kitchen equipment or impossible-to-source ingredients. The magic should come from elevated technique applied to accessible items (e.g., using a cast-iron skillet instead of a wok).

FORMATTING REQUIREMENTS (ALL RECIPES):
You MUST format your output EXACTLY matching this structure. Use the exact emojis and headers shown below.
Do not output any markdown code blocks wrapping the entire response.

STRUCTURE TEMPLATE:
---
title: "[Recipe Name]"
tags: ["[tag1]", "[tag2]", "Curated By Sage"]
macros: "Calories: [X] | Protein: [X]g | Carbs: [X]g | Fat: [X]g"
---

# [Relevant Emoji] [Recipe Name] [Relevant Emoji]

[EDITORIAL INTRODUCTION]
- For RECIPE 1 (The Weekly Hero - Main): Write a 2-3 paragraph Master's-level editorial introduction. Start 'in media res' (in the middle of the action). Present a cultural/historical thesis. NO generic adjectives like 'delicious'.
- For RECIPES 2 and 3 (Elevated Sides): Write a sophisticated 1-paragraph introduction.

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

    const prompt = "Generate this week's 3 featured curated recipes. The first recipe must be the Hero main dish (including the Master's-level editorial intro). The remaining two recipes MUST be elevated side dishes that pair perfectly and can be served alongside the Hero main dish.";
    
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // 3. Save the newly generated recipes
    let recipes = text.split("|||RECIPE_SPLIT|||").map(r => r.trim()).filter(Boolean);

    // Fallback: If the LLM hallucinated the token or bunched them together
    if (recipes.length !== 3) {
      console.warn(`[Curation Fallback]: Expected 3 recipes, got ${recipes.length}. Using regex fallback.`);
      
      // Safely split based on standard markdown YAML frontmatter initiation (`---` followed by `title:`)
      recipes = text
        .split(/(?=^---\r?\ntitle:)/im)
        .map(r => r.trim())
        .filter(Boolean);
    }

    // Hard cap to exactly 3 recipes to prevent downstream mapping errors in the UI
    if (recipes.length > 3) recipes = recipes.slice(0, 3);
    if (recipes.length < 3) throw new Error("Curation failed to generate distinct recipes.");

    let savedCount = 0;

    for (const rawRecipe of recipes) {
      let cleanContent = rawRecipe.trim();
      if (!cleanContent) continue;
      // H5 Fix: Prevent disk exhaustion from oversized AI output
      if (cleanContent.length > 50_000) {
        console.warn(`Curated recipe output exceeds 50KB limit (${cleanContent.length} chars). Skipping.`);
        continue;
      }
      
      if (cleanContent.startsWith("\`\`\`yaml")) {
        cleanContent = cleanContent.replace(/^```yaml\n?/, "---\n");
        // L7 Fix: Only replace the NEXT standalone ``` line (closing fence), not any ``` in content
        cleanContent = cleanContent.replace(/\n```\s*\n/, "\n---\n");
      } else if (cleanContent.startsWith("\`\`\`markdown")) {
        cleanContent = cleanContent.replace(/^```markdown\n?/, "");
        cleanContent = cleanContent.replace(/\n?```\s*$/, "");
      }

      const titleMatch = cleanContent.match(/title:\s*["']?([^"'\n]+)["']?/i);
      const title = titleMatch ? titleMatch[1].trim() : `Curated Recipe ${Date.now()}`;
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      if (householdId) {
        // DB mode: save to database with householdId
        const { data: frontmatterData, content: bodyContent } = matter(cleanContent);
        await prisma.recipe.upsert({
          where: { householdId_slug: { householdId, slug } },
          create: {
            householdId,
            slug,
            title,
            markdown: bodyContent.trim(),
            frontmatter: { ...frontmatterData, category: 'curated-current' },
          },
          update: {
            title,
            markdown: bodyContent.trim(),
            frontmatter: { ...frontmatterData, category: 'curated-current' },
          },
        });
      } else {
        // Filesystem mode
        const filename = `${slug}.md`;
        await fs.mkdir(currentDir, { recursive: true });
        const filePath = path.join(currentDir, filename);
        await fs.writeFile(filePath, cleanContent.trim(), "utf-8");
      }
      savedCount++;
    }

    return NextResponse.json({ success: true, message: `Archived old recipes and generated ${savedCount} new curated recipes.` });

  } catch (error: unknown) {
    console.error("[Curate API Error]:", error);
    return NextResponse.json({ success: false, error: "An unexpected error occurred during curation." }, { status: 500 });
  }
}
