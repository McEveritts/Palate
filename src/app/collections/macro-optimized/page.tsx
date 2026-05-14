import { getAllVaultRecipes } from "../../../lib/vaultParser";

function extractMacros(macroString: string) {
  const calMatch = macroString.match(/Calories:\s*(\d+)/i);
  const proMatch = macroString.match(/Protein:\s*(\d+)g/i);
  const calories = calMatch ? parseInt(calMatch[1], 10) : 0;
  const protein = proMatch ? parseInt(proMatch[1], 10) : 0;
  return { calories, protein };
}

export default async function MacroOptimizedPage() {
  const allRecipes = await getAllVaultRecipes();
  
  const optimizedRecipes = allRecipes
    .map(recipe => {
      const { calories, protein } = extractMacros(recipe.frontmatter?.macros || '');
      const density = calories > 0 ? protein / calories : 0;
      return { ...recipe, calories, protein, density };
    })
    .filter(r => r.density > 0)
    .sort((a, b) => b.density - a.density);

  return (
    <div className="w-full min-h-full p-8 md:p-12 max-w-7xl mx-auto">
      <div className="mb-10">
        <h1 className="text-4xl font-bold text-white tracking-tight">Macro-Optimized</h1>
        <p className="text-slate-400 mt-2 text-lg">Your vault, sorted strictly by protein density.</p>
      </div>

      {optimizedRecipes.length === 0 ? (
        <div className="glass-panel p-10 rounded-3xl text-center text-slate-400">
          No macro-tracked recipes found in your vault.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {optimizedRecipes.map((recipe, idx) => (
            <div key={idx} className="glass-panel p-6 rounded-3xl flex flex-col gap-4 border border-white/5 bg-gradient-to-br from-white/[0.02] to-transparent">
              <h3 className="text-xl font-bold text-white line-clamp-1">{recipe.frontmatter?.recipe || recipe.title}</h3>
              
              <div className="flex items-end justify-between mt-auto">
                <div className="flex flex-col">
                  <span className="text-4xl font-black text-emerald-400">{recipe.protein}g</span>
                  <span className="text-sm text-emerald-400/70 font-medium uppercase tracking-wider">Protein</span>
                </div>
                <div className="flex flex-col text-right">
                  <span className="text-2xl font-bold text-slate-300">{recipe.calories}</span>
                  <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Calories</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}