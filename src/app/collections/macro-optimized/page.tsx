import { getVaultRecipes } from "../../../lib/vaultParser";
import { MacroGrid } from "../../../components/collections/MacroGrid";

function extractMacros(macroString: string) {
  const calMatch = macroString.match(/Calories:\s*([\d.]+)/i);
  const proMatch = macroString.match(/Protein:\s*([\d.]+)g/i);
  const carbMatch = macroString.match(/Carbs:\s*([\d.]+)g/i);
  const fatMatch = macroString.match(/Fat:\s*([\d.]+)g/i);
  
  const calories = calMatch ? parseFloat(calMatch[1]) : 0;
  const protein = proMatch ? parseFloat(proMatch[1]) : 0;
  const carbs = carbMatch ? parseFloat(carbMatch[1]) : 0;
  const fat = fatMatch ? parseFloat(fatMatch[1]) : 0;
  
  return { calories, protein, carbs, fat };
}

export default async function MacroOptimizedPage() {
  const allRecipes = await getVaultRecipes();
  
  const optimizedRecipes = allRecipes
    .map(recipe => {
      const { calories, protein, carbs, fat } = extractMacros(recipe.macros || '');
      const density = calories > 0 ? protein / calories : 0;
      return { ...recipe, calories, protein, carbs, fat, density };
    })
    .filter(r => r.density > 0)
    .sort((a, b) => b.density - a.density);

  return (
    <div className="w-full flex-1 p-8 md:p-12 max-w-7xl mx-auto">
      <div className="mb-10">
        <h1 className="text-4xl font-bold text-white tracking-tight">Macro-Optimized</h1>
        <p className="text-slate-400 mt-2 text-lg">Your vault, sorted strictly by protein density.</p>
      </div>

      {optimizedRecipes.length === 0 ? (
        <div className="glass-panel p-10 rounded-3xl text-center text-slate-400">
          No macro-tracked recipes found in your vault.
        </div>
      ) : (
        <MacroGrid recipes={optimizedRecipes} />
      )}
    </div>
  );
}