import { describe, it, expect } from 'vitest';
import {
  generateSynergyGraph,
  getDecayStatus,
  getIngredientMacroSummary
} from './synergyEngine';
import { VaultRecipe } from './vaultParser';

describe('🌿 SynergyEngine - getDecayStatus', () => {
  it('should assign fresh status to items older than 4 days', () => {
    expect(getDecayStatus(5)).toBe('fresh');
    expect(getDecayStatus(10)).toBe('fresh');
  });

  it('should assign warning status to items scheduled 2 to 4 days ago', () => {
    expect(getDecayStatus(2)).toBe('warning');
    expect(getDecayStatus(3)).toBe('warning');
    expect(getDecayStatus(4)).toBe('warning');
  });

  it('should assign critical status to items scheduled less than 2 days ago', () => {
    expect(getDecayStatus(1)).toBe('critical');
    expect(getDecayStatus(0)).toBe('critical');
  });
});

describe('🌿 SynergyEngine - getIngredientMacroSummary', () => {
  it('should return appropriate nutritional categories', () => {
    expect(getIngredientMacroSummary('salmon fillet')).toContain('Protein');
    expect(getIngredientMacroSummary('chicken breast')).toContain('Protein');
    expect(getIngredientMacroSummary('avocado')).toContain('Fats');
    expect(getIngredientMacroSummary('spinach')).toContain('Micronutrient');
    expect(getIngredientMacroSummary('saffron')).toContain('Aromatic');
  });
});

describe('🌿 SynergyEngine - generateSynergyGraph', () => {
  // Setup sample mock recipes
  const mockRecipes: VaultRecipe[] = [
    {
      id: 'mains-salmon-teriyaki',
      slug: 'salmon-teriyaki',
      title: 'Teriyaki Salmon',
      category: 'mains',
      tags: ['fish', 'dinner'],
      macros: 'Protein: 30g | Carbs: 10g | Fat: 15g',
      content: `
## Ingredients
- 150g fresh salmon fillet
- 2 tbsp soy sauce
- 1 tbsp olive oil
- 1 pinch salt
      `
    },
    {
      id: 'mains-garlic-chicken',
      slug: 'garlic-chicken',
      title: 'Garlic Butter Chicken',
      category: 'mains',
      tags: ['chicken', 'easy'],
      macros: 'Protein: 35g | Carbs: 2g | Fat: 20g',
      content: `
## Ingredients
- 200g chicken breast
- 2 cloves garlic
- 2 tbsp butter
- 1 pinch salt
- 1 pinch black pepper
      `
    },
    {
      id: 'sides-asparagus',
      slug: 'asparagus',
      title: 'Roasted Asparagus',
      category: 'sides',
      tags: ['vegetable', 'healthy'],
      macros: 'Protein: 3g | Carbs: 5g | Fat: 4g',
      content: `
## Ingredients
- 1 bunch fresh asparagus
- 1 tbsp olive oil
- 1 pinch kosher salt
      `
    }
  ];

  it('should exclude staples from custom pantry list and extract signature ingredients', () => {
    // Custom pantry list containing staples (salt, olive oil) and signatures (salmon, chicken)
    const customPantry = ['salt', 'olive oil', 'salmon fillet', 'chicken breast'];

    const graph = generateSynergyGraph(mockRecipes, customPantry);

    // Get nodes of type 'ingredient'
    const ingredientNodes = graph.nodes.filter(n => n.type === 'ingredient');
    const ingredientIds = ingredientNodes.map(n => n.id);

    // Staples like salt and olive oil MUST be excluded using isStaple
    expect(ingredientIds).not.toContain('salt');
    expect(ingredientIds).not.toContain('olive oil');

    // Signatures MUST be included
    expect(ingredientIds).toContain('salmon fillet');
    expect(ingredientIds).toContain('chicken breast');
  });

  it('should compile a stable bipartite graph structure with correct connectivity', () => {
    const customPantry = ['salmon fillet', 'chicken breast', 'asparagus'];
    const graph = generateSynergyGraph(mockRecipes, customPantry);

    // Verify bipartiteness (edges should ONLY connect an ingredient to a recipe)
    graph.edges.forEach(edge => {
      const sourceNode = graph.nodes.find(n => n.id === edge.source);
      const targetNode = graph.nodes.find(n => n.id === edge.target);

      expect(sourceNode).toBeDefined();
      expect(targetNode).toBeDefined();
      
      expect(sourceNode!.type).toBe('ingredient');
      expect(targetNode!.type).toBe('recipe');
    });

    // Check specific connection
    const salmonEdge = graph.edges.find(e => e.source === 'salmon fillet');
    expect(salmonEdge).toBeDefined();
    expect(salmonEdge!.target).toBe('mains-salmon-teriyaki');

    const chickenEdge = graph.edges.find(e => e.source === 'chicken breast');
    expect(chickenEdge).toBeDefined();
    expect(chickenEdge!.target).toBe('mains-garlic-chicken');
  });

  it('should generate a beautiful mock pantry when custom ingredients are not provided', () => {
    const graph = generateSynergyGraph(mockRecipes);

    const ingredientNodes = graph.nodes.filter(n => n.type === 'ingredient');
    expect(ingredientNodes.length).toBeGreaterThan(0);

    // It should extract top signature ingredients like salmon, chicken, asparagus
    const ingredientIds = ingredientNodes.map(n => n.id);
    expect(ingredientIds).toContain('salmon fillet');
    expect(ingredientIds).toContain('chicken breast');
    expect(ingredientIds).toContain('asparagus');

    // It should assign dynamic decay statuses to mock pantry items to show a rich visual spectrum
    const decayStatuses = ingredientNodes.map(n => n.decayStatus);
    expect(decayStatuses).toContain('critical');
    expect(decayStatuses).toContain('warning');
    expect(decayStatuses).toContain('fresh');
  });

  it('should handle edge cases like empty recipes or recipes with only staples gracefully', () => {
    // Empty recipes
    const emptyGraph = generateSynergyGraph([], ['salmon fillet']);
    expect(emptyGraph.nodes).toBeDefined();
    expect(emptyGraph.edges).toEqual([]);

    // Recipes with only staples
    const stapleRecipes: VaultRecipe[] = [
      {
        id: 'staple-only',
        slug: 'staple-only',
        title: 'Salt Water',
        category: 'mains',
        tags: [],
        macros: '',
        content: `
## Ingredients
- salt
- water
        `
      }
    ];

    const graph = generateSynergyGraph(stapleRecipes, ['salt', 'water', 'salmon']);
    
    // Salmon is signature, but not used by recipe. Salt/water are staples, so they are excluded.
    // Node list should only contain salmon (unused signature pantry item)
    const ingredientIds = graph.nodes.filter(n => n.type === 'ingredient').map(n => n.id);
    expect(ingredientIds).toContain('salmon');
    expect(ingredientIds).not.toContain('salt');
    expect(ingredientIds).not.toContain('water');
    expect(graph.edges).toEqual([]);
  });
});
