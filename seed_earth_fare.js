const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require("@google/genai");

// Helper to manually load .env files to avoid dependency issues
function loadEnv() {
  const envPaths = [path.join(process.cwd(), '.env'), path.join(process.cwd(), '.env.local')];
  envPaths.forEach(p => {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf-8');
      const lines = content.split(/\r?\n/);
      lines.forEach(line => {
        const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)$/);
        if (match) {
          let val = match[2].trim();
          if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
          if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
          process.env[match[1]] = val;
        }
      });
    }
  });
}

loadEnv();

const apiKey = process.env.GEMINI_API_KEY || "";
if (!apiKey) {
  console.error("Error: GEMINI_API_KEY is not defined in system environment, .env, or .env.local");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

const recipesToSeed = [
  { title: "Love Note Cookies", category: "desserts", tags: ["dessert", "cookies", "sweet", "bonne-maman"] },
  { title: "Connecticut-Style Lobster Rolls", category: "mains", tags: ["lunch", "seafood", "lobster", "main"] },
  { title: "Caprese Chicken", category: "mains", tags: ["dinner", "chicken", "caprese", "main"] },
  { title: "Buffalo Chicken Pasta Salad", category: "appetizers", tags: ["appetizer", "salad", "pasta", "buffalo-chicken"] },
  { title: "Cranberry Eggnog Cream Tart", category: "desserts", tags: ["dessert", "tart", "eggnog", "holiday"] },
  { title: "Fruity and Spicy Cheese Dip", category: "appetizers", tags: ["appetizer", "dip", "cheese", "spicy"] },
  { title: "Bacon Cheeseburger Football Dip", category: "appetizers", tags: ["appetizer", "dip", "cheese", "bacon"] },
  { title: "Citrus-Glazed Chicken and Apricot Kabobs", category: "mains", tags: ["dinner", "kabob", "chicken", "apricot", "main"] },
  { title: "Garlic Herb Meatballs with Butterkase Toasts", category: "mains", tags: ["dinner", "meatballs", "garlic", "main"] },
  { title: "Miso French Lentil Soup", category: "appetizers", tags: ["appetizer", "soup", "lentil", "miso"] },
  { title: "Parmesan Potato Wedges with Lemony Aioli", category: "sides", tags: ["side", "potato", "parmesan", "aioli"] },
  { title: "Lemon Chicken Pasta Salad", category: "mains", tags: ["lunch", "salad", "pasta", "chicken", "main"] },
  { title: "Chicken with Asiago-Wild Rice Stuffing", category: "mains", tags: ["dinner", "chicken", "wild-rice", "stuffing", "main"] },
  { title: "Basil Shrimp with Sweet Corn Salad", category: "mains", tags: ["lunch", "seafood", "shrimp", "salad", "main"] },
  { title: "Barbecue Chicken Potato Skins", category: "appetizers", tags: ["appetizer", "potato-skins", "bbq-chicken"] },
  { title: "Halloumi Prosciutto Bites", category: "appetizers", tags: ["appetizer", "finger-food", "halloumi", "prosciutto"] },
  { title: "Miso Master Sweet, Spicy Butternut Mac & Cheese", category: "mains", tags: ["dinner", "mac-and-cheese", "butternut-squash", "miso", "main"] },
  { title: "Taco Casserole", category: "mains", tags: ["dinner", "casserole", "taco", "beef", "main"] },
  { title: "Riesling Peach Ham Glaze", category: "sides", tags: ["side", "glaze", "peach", "riesling"] },
  { title: "Herby Lamb Marinade", category: "sides", tags: ["side", "marinade", "lamb", "herbs"] },
  { title: "Lemon Dill Potato Salad", category: "sides", tags: ["side", "salad", "potato", "lemon-dill"] },
  { title: "Shepherd’s Pie Cabbage Rolls with Guiness Gravy", category: "mains", tags: ["dinner", "cabbage-rolls", "shepherds-pie", "guinness", "main"] },
  { title: "Strawberry Shortcake Sammys", category: "desserts", tags: ["dessert", "strawberry", "shortcake", "sweet"] },
  { title: "Hoppin John", category: "mains", tags: ["dinner", "rice", "beans", "southern", "main"] },
  { title: "Loaded Cheesy Potato Casserole", category: "sides", tags: ["side", "casserole", "potato", "cheese"] },
  { title: "Italian Hoagie Dip", category: "appetizers", tags: ["appetizer", "dip", "italian", "hoagie"] },
  { title: "Zesty Bread Cheese Salad", category: "mains", tags: ["lunch", "salad", "bread-cheese", "main"] },
  { title: "Pumpkin and Béchamel Lasagna", category: "mains", tags: ["dinner", "lasagna", "pumpkin", "bechamel", "main"] },
  { title: "Reuben Roll Ups", category: "appetizers", tags: ["appetizer", "reuben", "finger-food"] },
  { title: "Autumn Quinoa Bowls", category: "mains", tags: ["lunch", "quinoa", "bowl", "autumn", "main"] },
  { title: "Cranberry Orange Relish", category: "sides", tags: ["side", "relish", "cranberry", "orange"] },
  { title: "Orange Pomegranate Salad", category: "sides", tags: ["side", "salad", "orange", "pomegranate"] },
  { title: "Vegan Falafel Bowl", category: "mains", tags: ["lunch", "falafel", "vegan", "bowl", "main"] },
  { title: "Grilled Brown Sugar and Cinnamon Peaches", category: "desserts", tags: ["dessert", "peaches", "grilled", "sweet"] },
  { title: "Mediterranean Chickpea Salad with Lemon Parsley Vinaigrette", category: "mains", tags: ["lunch", "salad", "chickpea", "mediterranean", "main"] },
  { title: "Veggie Coconut Soup", category: "appetizers", tags: ["appetizer", "soup", "coconut", "vegetable"] },
  { title: "Slow Cooked Beef Short Ribs", category: "mains", tags: ["dinner", "short-ribs", "beef", "slow-cooked", "main"] },
  { title: "Miso Master Pesto", category: "appetizers", tags: ["appetizer", "pesto", "miso"] }
];

async function generateRecipe(recipe) {
  const prompt = `
You are Sage (🌿), an elegant, precise, professional digital sous-chef for 'Palate', a premium culinary app.
Generate an authentic clean-eating recipe based on the Earth Fare blog title: "${recipe.title}".

[CRITICAL OUTPUT RULE]
Do NOT output any thinking, reasoning, or meta-commentary. Your response MUST begin directly with the YAML frontmatter (---) and end directly with the markdown. No explanations, no thought blocks.

[FORMATTING RULES]
1. Output MUST be standard Markdown.
2. YAML frontmatter MUST be at the very top:
   - recipe: "${recipe.title}"
   - tags: ${JSON.stringify(recipe.tags)}
   - macros: "Calories: X | Protein: Xg | Carbs: Xg | Fat: Xg" (Calculate realistic/estimated values based on standard clean ingredients)
   - category: "${recipe.category}"
   - date: "2026-05-25"
3. Use emojis in headers (e.g., # 🥖 Ingredients).
4. Use Roman numerals (I, II, III) for instructions.
5. Annotate ingredients inline using Cooklang style: @ingredient name{amount%unit} or @ingredient name{amount} (e.g., @organic spinach{2%cups}, @unrefined coconut oil{1%tbsp}).
6. Highlight explicit technique notes like "Crucial Step:" or "Technique Note:" in the instructions.
7. Include a "💡 Chef's Additions & Troubleshooting" section at the end with 2-3 detailed bullet points of culinary science.

Begin directly with "---".
`;

  try {
    const result = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
    });
    let text = (result.text || '').trim();
    // Strip XML thought blocks if any
    text = text.replace(/<(?:thought|thinking)>\s*[\s\S]*?<\/(?:thought|thinking)>/gi, '').trim();
    text = text.replace(/<(?:thought|thinking)>\s*[\s\S]*/gi, '').trim();
    
    // Convert "```yaml" wrapper blocks into standard frontmatter blocks if present
    if (text.includes('```yaml')) {
      text = text.replace(/```yaml/g, '---').replace(/```/g, '---');
    }

    // Backward-Scanning Delimiter Locator:
    // 1. Locate the first actual recipe title property in the YAML block (unindented)
    const recipeMatch = text.match(/^[ \t]{0,2}(?:recipe|title):\s*["']?[^"'\n]+/im);
    if (recipeMatch) {
      const recipeIndex = recipeMatch.index;
      // 2. Scan backwards from the recipe key to find the preceding "---"
      const precedingText = text.substring(0, recipeIndex);
      const lastDashIndex = precedingText.lastIndexOf('---');
      if (lastDashIndex !== -1) {
        text = text.substring(lastDashIndex).trim();
      } else {
        // Fallback: If no dashes were found before the recipe key, inject them
        text = '---\n' + text.substring(recipeIndex).trim();
      }
    } else {
      // Fallback: search for standard delimiter match
      const delimiterMatch = text.match(/---|```yaml/);
      if (delimiterMatch) {
        text = text.substring(delimiterMatch.index).trim();
      }
    }

    // Safety check: ensure the clean text starts exactly with "---"
    if (!text.startsWith('---')) {
      text = '---\n' + text;
    }
    
    return text;
  } catch (e) {
    console.error(`Failed to generate recipe ${recipe.title}:`, e);
    return null;
  }
}

async function main() {
  console.log(`Starting generation of ${recipesToSeed.length} Earth Fare recipes...`);
  
  for (let i = 0; i < recipesToSeed.length; i++) {
    const recipe = recipesToSeed[i];
    const slug = recipe.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const dir = path.join(process.cwd(), 'vault', recipe.category);
    const filePath = path.join(dir, `${slug}.md`);

    if (fs.existsSync(filePath)) {
      console.log(`[${i+1}/${recipesToSeed.length}] Skipping existing: ${recipe.title}`);
      continue;
    }

    console.log(`[${i+1}/${recipesToSeed.length}] Generating: ${recipe.title}...`);
    const content = await generateRecipe(recipe);
    if (content) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, content, 'utf-8');
      console.log(`[${i+1}/${recipesToSeed.length}] Saved: ${recipe.title}`);
    }
    
    // Tiny delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 800));
  }

  console.log("Successfully completed Earth Fare recipe seeding!");
}

main();
