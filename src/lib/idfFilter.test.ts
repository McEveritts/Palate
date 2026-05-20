import { describe, it, expect } from 'vitest';
import {
  cleanIngredientName,
  extractIngredients,
  calculateIDF,
  isStaple,
  isSignature,
  categorizeIngredients,
  COMMON_STAPLES
} from './idfFilter';

describe('🌿 idfFilter - cleanIngredientName', () => {
  it('should lowercase and trim whitespace', () => {
    expect(cleanIngredientName('  Saffron  ')).toBe('saffron');
  });

  it('should strip quantities, decimals, fractions, and ranges', () => {
    expect(cleanIngredientName('1 1/2 cups saffron')).toBe('saffron');
    expect(cleanIngredientName('2.5 grams salt')).toBe('salt');
    expect(cleanIngredientName('3-4 cloves garlic')).toBe('garlic');
    expect(cleanIngredientName('¼ tsp saffron')).toBe('saffron');
  });

  it('should remove common culinary units', () => {
    expect(cleanIngredientName('1 pinch of saffron')).toBe('saffron');
    expect(cleanIngredientName('2 cans of chopped tomatoes')).toBe('tomato');
    expect(cleanIngredientName('3 bunches of asparagus')).toBe('asparagus');
  });

  it('should remove preparation states and descriptors', () => {
    expect(cleanIngredientName('extra virgin olive oil')).toBe('olive oil');
    expect(cleanIngredientName('fresh chopped organic onions')).toBe('onion');
    expect(cleanIngredientName('finely grated cheese')).toBe('cheese');
  });

  it('should normalize plurals to singular forms', () => {
    expect(cleanIngredientName('onions')).toBe('onion');
    expect(cleanIngredientName('potatoes')).toBe('potato');
    expect(cleanIngredientName('tomatoes')).toBe('tomato');
    expect(cleanIngredientName('carrots')).toBe('carrot');
  });
});

describe('🌿 idfFilter - extractIngredients', () => {
  it('should extract ingredients directly from an ingredients array', () => {
    const recipe = {
      title: 'Simple Dish',
      ingredients: ['1 pinch salt', '2 cloves fresh garlic', '100g salmon fillet']
    };
    expect(extractIngredients(recipe)).toEqual(['salt', 'garlic', 'salmon fillet']);
  });

  it('should parse ingredients from markdown content', () => {
    const recipe = {
      title: 'Steamed Salmon',
      content: `
# Steamed Salmon
Delicious steamed salmon.

## Ingredients
- 100g fresh salmon fillet
* 1 pinch kosher salt
- 1 tsp olive oil

## Instructions
Steam it.
      `
    };
    expect(extractIngredients(recipe)).toEqual(['salmon fillet', 'salt', 'olive oil']);
  });

  it('should return empty array if no ingredients section is found', () => {
    const recipe = {
      title: 'Invisible Dish',
      content: '# Invisible Dish\nNo ingredients list here!'
    };
    expect(extractIngredients(recipe)).toEqual([]);
  });
});

describe('🌿 idfFilter - calculateIDF', () => {
  it('should compute IDF values properly based on document frequency', () => {
    const recipes = [
      {
        title: 'Dish 1',
        ingredients: ['salt', 'garlic', 'salmon']
      },
      {
        title: 'Dish 2',
        ingredients: ['salt', 'olive oil', 'saffron']
      },
      {
        title: 'Dish 3',
        ingredients: ['salt', 'garlic', 'chicken']
      }
    ];

    const idfMap = calculateIDF(recipes);

    // 'salt' appears in all 3 recipes (DF = 3, N = 3)
    // IDF = ln(1 + 3 / 3) = ln(2) ≈ 0.693
    expect(idfMap['salt']).toBeCloseTo(Math.log(2));

    // 'garlic' appears in 2 recipes (DF = 2, N = 3)
    // IDF = ln(1 + 3 / 2) = ln(2.5) ≈ 0.916
    expect(idfMap['garlic']).toBeCloseTo(Math.log(2.5));

    // 'salmon' appears in 1 recipe (DF = 1, N = 3)
    // IDF = ln(1 + 3 / 1) = ln(4) ≈ 1.386
    expect(idfMap['salmon']).toBeCloseTo(Math.log(4));
  });
});

describe('🌿 idfFilter - isStaple & isSignature', () => {
  it('should identify predefined common staples', () => {
    expect(isStaple('kosher salt')).toBe(true);
    expect(isStaple('black pepper')).toBe(true);
    expect(isStaple('olive oil')).toBe(true);
    expect(isStaple('water')).toBe(true);
  });

  it('should utilize idfMap to classify low-IDF ingredients as staples', () => {
    const idfMap = {
      'salmon': 1.8, // signature
      'butter': 0.8, // low IDF => staple
      'saffron': 2.3  // signature
    };

    expect(isStaple('butter', idfMap)).toBe(true);
    expect(isStaple('salmon', idfMap)).toBe(false);
    expect(isSignature('salmon', idfMap)).toBe(true);
    expect(isSignature('saffron', idfMap)).toBe(true);
  });
});

describe('🌿 idfFilter - categorizeIngredients', () => {
  it('should categorize ingredients in recipes into staples and signatures', () => {
    const recipes = [
      {
        title: 'Garlic Salmon',
        ingredients: ['100g salmon', '1 pinch salt', '2 cloves garlic']
      },
      {
        title: 'Saffron Salmon',
        ingredients: ['100g salmon', '1 pinch salt', '1 pinch saffron']
      }
    ];

    const result = categorizeIngredients(recipes);

    // salt is a predefined staple
    expect(result.staples).toContain('salt');
    expect(result.staples).toContain('garlic'); // garlic is in COMMON_STAPLES

    // salmon and saffron are signatures
    expect(result.signatures).toContain('salmon');
    expect(result.signatures).toContain('saffron');
  });
});
