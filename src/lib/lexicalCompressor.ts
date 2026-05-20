/**
 * 🌿 Palate - Lexicographical Compressor
 * Compresses recipe representation and instruction markdown to maximize token density
 * within compact LLM context windows.
 */

import { isStaple, extractIngredients } from './idfFilter';

/**
 * Strips standard fillers and prepositions from recipe steps to compress length
 * while retaining core cooking instructions.
 */
export function stripFillerWords(text: string): string {
  if (!text) return '';
  
  // Set of filler words to strip
  const fillers = /\b(the|a|an|and|but|or|for|with|on|at|to|from|by|in|out|of|then|next|finally|please|just|is|are|was|were|be|been|being|highly|extremely|perfectly|carefully|gently|slowly|rapidly)\b/gi;
  
  return text
    .replace(fillers, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compresses a recipe's representation for inclusion in LLM prompts.
 * Stuffs maximum metadata density into minimal tokens by stripping filler,
 * omitting redundant ingredients (staples), and summarizing macros.
 */
export function compressRecipeForPrompt(recipe: any, idfMap?: Record<string, number>): string {
  if (!recipe) return '';

  // 1. Resolve Title
  const title = recipe.frontmatter?.title || recipe.title || 'Untitled';
  
  // 2. Resolve Tags
  const tags = recipe.frontmatter?.tags || recipe.tags || [];
  
  // 3. Resolve and Compact Macros
  let macrosStr = '';
  if (recipe.frontmatter?.macros) {
    const m = recipe.frontmatter.macros;
    if (typeof m === 'object') {
      const p = m.protein || '0g';
      const c = m.carbs || '0g';
      const f = m.fat || '0g';
      const cal = m.calories || 0;
      macrosStr = `${cal}kcal (P: ${p}, C: ${c}, F: ${f})`;
    } else {
      macrosStr = String(m);
    }
  } else if (recipe.macros) {
    macrosStr = String(recipe.macros);
  }
  
  // 4. Resolve Ingredients (Keep only unique signatures/non-staples)
  const allIngredients = extractIngredients(recipe);
  const signatures = Array.from(new Set(
    allIngredients.filter(ing => !isStaple(ing, idfMap))
  ));
  
  // 5. Compress and Truncate Instructions
  let body = recipe.content || '';
  
  // Strip YAML frontmatter block if it was included in content
  body = body.replace(/^---\n[\s\S]*?\n---\n/i, '');
  
  // Remove markdown headers for ingredients entirely since we extract it above (using lookahead for next section header)
  body = body.replace(/##\s*Ingredients\n([\s\S]*?)(?=\n##|$)/i, '');
  
  // Remove markdown headers for instructions/steps
  body = body.replace(/##\s*(Instructions|Directions|Steps|Method|Preparation)\b/gi, '');
  
  // Remove any closed or open thought blocks
  body = body.replace(/<thought>\s*([\s\S]*?)\s*<\/thought>/gi, '');
  body = body.replace(/<thought>\s*([\s\S]*)$/gi, '');
  
  // Strip markdown formatting symbols but keep letters/numbers/spaces
  body = body.replace(/[#*`_\[\]()]/g, ' ');
  
  // Strip filler words
  let compressedBody = stripFillerWords(body);
  
  // Compact whitespace
  compressedBody = compressedBody.replace(/\s+/g, ' ').trim();
  
  // Truncate instructions if they exceed 300 characters to prevent prompt bloat
  if (compressedBody.length > 300) {
    compressedBody = compressedBody.substring(0, 300) + '...';
  }
  
  // Assemble the highly compressed representation
  const lines: string[] = [];
  lines.push(`Recipe: ${title}`);
  
  if (tags.length > 0) {
    lines.push(`Tags: ${tags.join(', ')}`);
  }
  if (macrosStr) {
    lines.push(`Macros: ${macrosStr}`);
  }
  if (signatures.length > 0) {
    lines.push(`Signatures: ${signatures.join(', ')}`);
  }
  if (compressedBody) {
    lines.push(`Steps: ${compressedBody}`);
  }
  
  return lines.join('\n');
}
