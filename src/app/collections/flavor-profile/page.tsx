import { getVaultRecipes, VaultRecipe } from "../../../lib/vaultParser";
import Link from "next/link";

export default async function FlavorProfilePage() {
  const allRecipes = await getVaultRecipes();

  // Categorization Logic
  const spicy = allRecipes.filter((r: VaultRecipe) => r.tags?.some((t: string) => ['spicy', 'chili', 'beef', 'heavy', 'umami'].includes(t.toLowerCase())));
  const fresh = allRecipes.filter((r: VaultRecipe) => r.tags?.some((t: string) => ['fresh', 'light', 'salad', 'citrus', 'herb'].includes(t.toLowerCase())));
  const comfort = allRecipes.filter((r: VaultRecipe) => r.tags?.some((t: string) => ['comfort', 'soup', 'braise', 'slow-cook', 'pasta'].includes(t.toLowerCase())));

  const playlists = [
    { title: "Midnight Umami & Spice", description: "Bold, heavy, and packed with heat.", recipes: spicy },
    { title: "Light & Fresh", description: "Crisp textures and bright acidity.", recipes: fresh },
    { title: "Rainy Day Comfort", description: "Warm, slow-cooked, and soul-soothing.", recipes: comfort }
  ].filter(p => p.recipes.length > 0);

  return (
    <div className="w-full min-h-full py-12 overflow-x-hidden">
      <div className="px-8 md:px-12 mb-12">
        <h1 className="text-4xl font-bold text-white tracking-tight">Flavor Profiles</h1>
        <p className="text-slate-400 mt-2 text-lg">Curated playlists based on the culinary vibe.</p>
      </div>

      {playlists.length === 0 ? (
        <div className="px-8 md:px-12">
          <div className="glass-panel p-10 rounded-3xl text-center text-slate-400">
            Add more recipes with flavor tags to unlock curated playlists.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-12">
          {playlists.map((playlist, idx) => (
            <div key={idx} className="w-full">
              <div className="px-8 md:px-12 mb-4">
                <h2 className="text-2xl font-bold text-white">{playlist.title}</h2>
                <p className="text-slate-400 text-sm">{playlist.description}</p>
              </div>
              
              <div className="flex overflow-x-auto gap-6 px-8 md:px-12 pb-6 custom-scrollbar snap-x">
                {playlist.recipes.map((recipe: VaultRecipe) => (
                  <Link href={`/vault/${recipe.id}`} key={recipe.id} className="snap-start shrink-0 w-72 h-48 glass-panel rounded-2xl p-6 flex flex-col justify-end relative overflow-hidden group cursor-pointer hover:border-white/20 transition-all">
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/20 to-transparent z-10"></div>
                    
                    <div className="relative z-20">
                      <h3 className="text-lg font-bold text-white mb-1 line-clamp-2 group-hover:text-indigo-300 transition-colors">
                        {recipe.title}
                      </h3>
                      <div className="flex gap-2 text-xs font-medium text-slate-400 uppercase tracking-wider">
                        <span>{recipe.category}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
