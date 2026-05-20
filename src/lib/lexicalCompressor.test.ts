import { describe, it, expect } from 'vitest';
import { stripFillerWords, compressRecipeForPrompt } from './lexicalCompressor';

describe('🌿 lexicalCompressor - stripFillerWords', () => {
  it('should remove prepositions and common grammatical filler words', () => {
    const rawInstruction = 'Heat the olive oil in a large skillet and then carefully cook it.';
    // 'the', 'in', 'a', 'and', 'then', 'carefully' should be stripped
    const result = stripFillerWords(rawInstruction);
    expect(result).not.toContain('the');
    expect(result).not.toContain(' in ');
    expect(result).not.toContain(' a ');
    expect(result).not.toContain('then');
    expect(result).not.toContain('carefully');
    expect(result).toContain('skillet');
    expect(result).toContain('cook');
  });

  it('should trim excess whitespace and handle empty input', () => {
    expect(stripFillerWords('')).toBe('');
    expect(stripFillerWords('  gently    melt  ')).toBe('melt');
  });
});

describe('🌿 lexicalCompressor - compressRecipeForPrompt', () => {
  it('should format a recipe with title, tags, macros, and signatures, omitting staples', () => {
    const recipe = {
      title: 'Zesty Duck Breast',
      tags: ['main', 'duck', 'gourmet'],
      macros: '450kcal (P: 24g, C: 4g, F: 36g)',
      ingredients: ['2 duck breasts', '1 pinch kosher salt', '1 tbsp butter', '1 orange'],
      content: `
## Ingredients
- 2 duck breasts
- 1 pinch kosher salt
- 1 tbsp butter
- 1 orange

## Instructions
First, score the skin of the duck breast. Heat a skillet over medium heat.
Gently sear the duck breasts skin-side down for 8 minutes until crispy.
      `
    };

    const compressed = compressRecipeForPrompt(recipe);

    // Metadata lines
    expect(compressed).toContain('Recipe: Zesty Duck Breast');
    expect(compressed).toContain('Tags: main, duck, gourmet');
    expect(compressed).toContain('Macros: 450kcal (P: 24g, C: 4g, F: 36g)');

    // Signatures should contain 'duck breast' and 'orange', but NOT 'salt' or 'butter' (which are staples)
    expect(compressed).toContain('Signatures: duck breast, orange');
    expect(compressed).not.toContain('salt');
    expect(compressed).not.toContain('butter');

    // Instructions should be stripped of fillers, markdown symbols, and the ingredients header
    expect(compressed).toContain('Steps: First, score skin duck breast. Heat skillet over medium heat. sear duck breasts skin-side down 8 minutes until crispy.');
  });

  it('should handle thought blocks and truncate long instructions', () => {
    const recipe = {
      title: 'Quick Salad',
      content: `
<thought>
Let's make a really short and sweet salad step.
</thought>
## Ingredients
- 1 cucumber
- 1 pinch salt

## Instructions
This is a very long instruction set. We want to test that the compressor truncates instructions at the appropriate threshold of three hundred characters so that the LLM is not overwhelmed with conversational filler or extremely verbose descriptions. Let's add more text to exceed the limit: chop cucumber, place in bowl, add salt, toss, serve, repeat if necessary, enjoy with family and friends!
      `
    };

    const compressed = compressRecipeForPrompt(recipe);

    // Thought block should be completely removed
    expect(compressed).not.toContain('sweet salad step');
    
    // Steps should be truncated and end with '...'
    expect(compressed.endsWith('...')).toBe(true);
    expect(compressed.length).toBeLessThan(450); // Total length is compact
  });
});
