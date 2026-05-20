/**
 * 🌿 Palate - Inverse Staple Filter (IDF)
 * Elegant, precise module to categorize ingredients into Staples and Signatures.
 * 
 * Staples are low IDF weight, high frequency ingredients (e.g. salt, pepper, olive oil).
 * Signatures are high IDF weight, low frequency ingredients (e.g. saffron, duck, salmon).
 */

// A fallback list of standard culinary staples to ensure reliable behavior in smaller vaults
export const COMMON_STAPLES = new Set([
  'salt',
  'black pepper',
  'pepper',
  'water',
  'olive oil',
  'vegetable oil',
  'oil',
  'butter',
  'garlic',
  'onion',
  'sugar',
  'flour',
  'kosher salt',
  'salt and pepper',
  'garlic powder'
]);

/**
 * Standardizes and cleans raw ingredient lines to extract their core name.
 * e.g., "1 1/2 cups of diced red onions" -> "red onion"
 */
export function cleanIngredientName(rawIng: string): string {
  let clean = rawIng.toLowerCase();
  
  // 1. Remove parenthetical descriptions like (optional) or (chopped)
  clean = clean.replace(/\([^)]*\)/g, '');
  
  // 2. Remove numbers, fractions, decimal points, and range dashes/slashes
  clean = clean.replace(/[\d\/\.\-\u00BC-\u00BE\u2150-\u215E]/g, '');
  
  // 3. Remove common units and prepositions
  const unitRegex = /\b(oz|ounce|ounces|g|gram|grams|ml|milliliter|milliliters|l|liter|liters|cup|cups|tbsp|tsp|tablespoon|tablespoons|teaspoon|teaspoons|clove|cloves|head|heads|pound|pounds|lb|lbs|dash|dashes|pinch|pinches|can|cans|pkg|package|packages|slice|slices|bunch|bunches|to taste|for|with|of|and|or)\b/g;
  clean = clean.replace(unitRegex, '');
  
  // 4. Remove common preparation states/descriptors
  const prepRegex = /\b(sliced|chopped|diced|cooked|fresh|raw|warm|minced|grated|peeled|melted|extra virgin|ground|fine|coarse|powder|kosher|dried|organic|finely|roughly)\b/g;
  clean = clean.replace(prepRegex, '');
  
  // 5. Remove punctuation and excess whitespace
  clean = clean.replace(/[,;.:*_\-]/g, ' ');
  clean = clean.replace(/\s+/g, ' ').trim();
  
  // 6. Singularize common plurals to normalize (e.g. onions -> onion, carrots -> carrot)
  if (clean.endsWith('es')) {
    if (clean.endsWith('potatoes')) clean = clean.slice(0, -2);
    else if (clean.endsWith('tomatoes')) clean = clean.slice(0, -2);
    else clean = clean.slice(0, -1);
  } else if (clean.endsWith('s') && !clean.endsWith('ss') && !clean.endsWith('is') && !clean.endsWith('us')) {
    clean = clean.slice(0, -1);
  }
  
  return clean;
}

/**
 * Extracts and cleans the list of ingredient names from a recipe.
 * Supports standard Recipe objects, objects with an ingredients array, or raw markdown strings.
 */
export function extractIngredients(recipe: any): string[] {
  if (!recipe) return [];
  
  if (typeof recipe === 'string') {
    return parseIngredientsFromMarkdown(recipe);
  }
  
  if (Array.isArray(recipe.ingredients)) {
    return recipe.ingredients.map(cleanIngredientName).filter(Boolean);
  }
  
  if (recipe.content && typeof recipe.content === 'string') {
    return parseIngredientsFromMarkdown(recipe.content);
  }
  
  return [];
}

/**
 * Helper to parse ingredients from a markdown string under the "Ingredients" header.
 */
function parseIngredientsFromMarkdown(content: string): string[] {
  const match = content.match(/##\s*Ingredients\n([\s\S]*?)(?:\n##|$)/i);
  if (!match) return [];
  
  const rawList = match[1]
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('-') || l.startsWith('*'))
    .map(l => l.replace(/^[-*]\s*/, ''));
    
  return rawList.map(cleanIngredientName).filter(Boolean);
}

/**
 * Computes the Inverse Document Frequency (IDF) of ingredients across the vault.
 * Formula: IDF(t) = ln(1 + N / df(t))
 */
export function calculateIDF(recipes: any[]): Record<string, number> {
  const N = recipes.length;
  if (N === 0) return {};
  
  const dfMap: Record<string, number> = {};
  
  recipes.forEach(recipe => {
    const ingredients = new Set(extractIngredients(recipe));
    ingredients.forEach(ing => {
      dfMap[ing] = (dfMap[ing] || 0) + 1;
    });
  });
  
  const idfMap: Record<string, number> = {};
  for (const [ing, df] of Object.entries(dfMap)) {
    // Smoothed IDF ensures positive value and handles N/df elegantly
    idfMap[ing] = Math.log(1 + N / df);
  }
  
  return idfMap;
}

/**
 * Determines whether an ingredient is classified as a culinary staple.
 * Checks both computed IDF weight and the pre-defined list of common staples.
 */
export function isStaple(ingredient: string, idfMap?: Record<string, number>): boolean {
  const cleaned = cleanIngredientName(ingredient);
  if (!cleaned) return false;
  
  // 1. Direct or partial check against COMMON_STAPLES list
  if (COMMON_STAPLES.has(cleaned)) {
    return true;
  }
  
  for (const staple of COMMON_STAPLES) {
    if (cleaned.includes(staple) || staple.includes(cleaned)) {
      return true;
    }
  }
  
  // 2. Check against idfMap if provided
  // To avoid statistical noise in tiny vaults (e.g. guest mode with 2 recipes),
  // we estimate N and only dynamically classify new staples if N >= 5.
  if (idfMap && idfMap[cleaned] !== undefined) {
    const maxIdf = Math.max(...Object.values(idfMap));
    const estimatedN = Math.round(Math.exp(maxIdf) - 1);
    
    if (estimatedN >= 5 && idfMap[cleaned] <= 1.5) {
      return true;
    }
  }
  
  return false;
}

/**
 * Determines whether an ingredient is classified as a culinary signature.
 * Non-staples with low document frequency / high IDF weight.
 */
export function isSignature(ingredient: string, idfMap?: Record<string, number>): boolean {
  return !isStaple(ingredient, idfMap);
}

/**
 * Categorizes ingredients in a set of recipes into Staples and Signatures.
 */
export function categorizeIngredients(recipes: any[]): { staples: string[]; signatures: string[] } {
  const idfMap = calculateIDF(recipes);
  const staples: Set<string> = new Set();
  const signatures: Set<string> = new Set();
  
  recipes.forEach(recipe => {
    const ingredients = extractIngredients(recipe);
    ingredients.forEach(ing => {
      if (isStaple(ing, idfMap)) {
        staples.add(ing);
      } else {
        signatures.add(ing);
      }
    });
  });
  
  return {
    staples: Array.from(staples),
    signatures: Array.from(signatures)
  };
}
