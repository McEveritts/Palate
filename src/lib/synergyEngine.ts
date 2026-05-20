/**
 * 🌿 Palate - Synergy Engine
 * Principal logic engineer specializing in graph theory and culinary information structures.
 * 
 * Elegant, precise module to compile a bipartite graph mapping expiring pantry
 * signature ingredients to vault recipes, revealing culinary synergies.
 */

import {
  cleanIngredientName,
  isStaple,
  extractIngredients,
  calculateIDF
} from './idfFilter';
import { VaultRecipe } from './vaultParser';

export interface SynergyNode {
  id: string; // Ingredient name or Recipe ID
  label: string; // Capitalized ingredient name or Recipe Title
  type: 'ingredient' | 'recipe';
  decayStatus?: 'fresh' | 'warning' | 'critical';
  size: number; // Degree (connected count) or weight
  macroSummary?: string; // Optional for ingredients
  recipeId?: string; // Original recipe ID if node type is 'recipe'
}

export interface SynergyEdge {
  source: string; // Ingredient name (cleaned)
  target: string; // Recipe ID
  strength: number; // Edge weight derived from IDF or intersection
}

export interface SynergyGraph {
  nodes: SynergyNode[];
  edges: SynergyEdge[];
}

/**
 * Calculates the decay status of an ingredient based on the number of days since creation/schedule.
 * Fresh (🟢, created or scheduled > 4 days)
 * Warning (🟡, scheduled 2-4 days ago)
 * Critical (🔴, scheduled < 2 days or left over)
 */
export function getDecayStatus(daysAgo: number): 'fresh' | 'warning' | 'critical' {
  if (daysAgo > 4) return 'fresh';
  if (daysAgo >= 2) return 'warning';
  return 'critical';
}

/**
 * Returns a culinary-focused mock nutritional macro summary for a given ingredient name.
 * Used to enrich the visualization.
 */
export function getIngredientMacroSummary(ingredientName: string): string {
  const name = ingredientName.toLowerCase().trim();
  if (name.includes('salmon') || name.includes('tuna') || name.includes('fish') || name.includes('shrimp') || name.includes('seafood')) {
    return 'High Protein | Omega-3';
  }
  if (name.includes('chicken') || name.includes('beef') || name.includes('pork') || name.includes('turkey') || name.includes('duck')) {
    return 'High Protein';
  }
  if (name.includes('tofu') || name.includes('tempeh') || name.includes('lentil') || name.includes('bean') || name.includes('chickpea')) {
    return 'Plant Protein | Fiber';
  }
  if (name.includes('avocado') || name.includes('oil') || name.includes('walnut') || name.includes('almond') || name.includes('cheese') || name.includes('butter')) {
    return 'Healthy Fats';
  }
  if (name.includes('spinach') || name.includes('kale') || name.includes('broccoli') || name.includes('asparagus') || name.includes('tomato') || name.includes('pepper') || name.includes('carrot') || name.includes('cabbage')) {
    return 'Low Calorie | Micronutrient Rich';
  }
  if (name.includes('saffron') || name.includes('truffle') || name.includes('vanilla') || name.includes('herb') || name.includes('spice')) {
    return 'Aromatic | Signature Flavor';
  }
  return 'Culinary Signature';
}

/**
 * Compiles a bipartite synergy graph linking expiring pantry ingredients with vault recipes.
 * Only signature ingredients (excluding staples) are considered for mapping culinary synergy.
 *
 * @param recipes Array of vault recipes.
 * @param customPantryIngredients Optional custom list of expiring ingredients.
 */
export function generateSynergyGraph(
  recipes: VaultRecipe[],
  customPantryIngredients?: string[]
): SynergyGraph {
  // 1. Calculate IDF weights to accurately filter out staples and calculate edge strength
  const idfMap = calculateIDF(recipes);

  // 2. Determine the pantry ingredients to map (expiring items)
  let pantrySignatures: { name: string; decayStatus: 'fresh' | 'warning' | 'critical' }[] = [];

  if (customPantryIngredients && customPantryIngredients.length > 0) {
    // If custom pantry ingredients are provided, clean and filter out staples
    pantrySignatures = customPantryIngredients
      .map(ing => cleanIngredientName(ing))
      .filter(Boolean)
      .filter(cleaned => !isStaple(cleaned, idfMap))
      .map((cleaned, index) => {
        // Dynamic decay status for a beautiful visual spectrum
        // We'll cycle through critical, warning, and fresh for the custom ingredients
        const decayStatuses: ('fresh' | 'warning' | 'critical')[] = ['critical', 'warning', 'fresh'];
        return {
          name: cleaned,
          decayStatus: decayStatuses[index % 3]
        };
      });
  } else {
    // If not provided, scan all signature ingredients in the vault to generate a mock pantry
    const signatureFrequencies: Record<string, number> = {};

    recipes.forEach(recipe => {
      const recipeIngs = extractIngredients(recipe);
      const uniqueRecipeSignatures = new Set(
        recipeIngs
          .map(ing => cleanIngredientName(ing))
          .filter(Boolean)
          .filter(cleaned => !isStaple(cleaned, idfMap))
      );

      uniqueRecipeSignatures.forEach(sig => {
        signatureFrequencies[sig] = (signatureFrequencies[sig] || 0) + 1;
      });
    });

    // Sort by frequency descending and pick top signatures to populate the mock pantry
    const topSignatures = Object.entries(signatureFrequencies)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10) // Limit to top 10 for a clear, beautiful visualization
      .map(([name]) => name);

    pantrySignatures = topSignatures.map((name, index) => {
      // Assign dynamic decay statuses based on simulated timeframes to create a rich visual spectrum
      // Let's mock:
      // index % 3 === 0 -> critical (e.g. left over or scheduled 1 day ago)
      // index % 3 === 1 -> warning (e.g. scheduled 3 days ago)
      // index % 3 === 2 -> fresh (e.g. scheduled 6 days ago)
      const simulatedDaysAgo = index % 3 === 0 ? 1 : index % 3 === 1 ? 3 : 6;
      return {
        name,
        decayStatus: getDecayStatus(simulatedDaysAgo)
      };
    });
  }

  // Create a map/set of pantry signature names for quick lookup
  const pantryNameSet = new Set(pantrySignatures.map(p => p.name));

  // 3. Track connectivity and build the graph
  const nodesMap: Map<string, SynergyNode> = new Map();
  const edges: SynergyEdge[] = [];
  
  // Track connections per ingredient node to dynamically calculate node size
  const ingredientConnections: Record<string, number> = {};

  // For each recipe, check which expiring pantry ingredients it uses
  recipes.forEach(recipe => {
    const recipeIngs = extractIngredients(recipe);
    const uniqueRecipeSigs = new Set(
      recipeIngs
        .map(ing => cleanIngredientName(ing))
        .filter(Boolean)
        .filter(cleaned => !isStaple(cleaned, idfMap))
    );

    // Find the intersection with the pantry ingredients
    const intersectingPantrySignatures = Array.from(uniqueRecipeSigs).filter(sig =>
      pantryNameSet.has(sig)
    );

    if (intersectingPantrySignatures.length > 0) {
      // This recipe has culinary synergy!
      const recipeId = recipe.id;

      // Add the recipe node if it doesn't exist
      if (!nodesMap.has(recipeId)) {
        nodesMap.set(recipeId, {
          id: recipeId,
          label: recipe.title,
          type: 'recipe',
          recipeId: recipe.id,
          size: intersectingPantrySignatures.length // Initial size is the intersection count (synergy score)
        });
      }

      // Connect each intersecting pantry signature
      intersectingPantrySignatures.forEach(sig => {
        // Track the connection count for the ingredient node size
        ingredientConnections[sig] = (ingredientConnections[sig] || 0) + 1;

        // Calculate edge strength based on the ingredient's IDF weight (capped/refined)
        const rawStrength = idfMap[sig] !== undefined ? idfMap[sig] : 2.0;
        const roundedStrength = Math.round(rawStrength * 100) / 100;

        edges.push({
          source: sig,
          target: recipeId,
          strength: roundedStrength
        });
      });
    }
  });

  // Now add the ingredient nodes to the nodes map
  pantrySignatures.forEach(pantrySig => {
    const name = pantrySig.name;
    const connections = ingredientConnections[name] || 0;
    
    // Add all pantry signature ingredients as nodes, even if they have 0 connections (helps zero-waste mapping)
    nodesMap.set(name, {
      id: name,
      label: name.charAt(0).toUpperCase() + name.slice(1), // Capitalize label for elegant display
      type: 'ingredient',
      decayStatus: pantrySig.decayStatus,
      size: connections > 0 ? connections : 1, // Minimum size of 1
      macroSummary: getIngredientMacroSummary(name)
    });
  });

  // Clean up nodes array
  const nodes = Array.from(nodesMap.values());

  return {
    nodes,
    edges
  };
}
