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
              
              <div className="flex overflow-x-auto gap-6 px-8 md:px-12 pb-8 custom-scrollbar snap-x">
                {playlist.recipes.map((recipe: VaultRecipe) => (
                  <Link href={`/vault/${recipe.id}`} key={recipe.id} className="snap-start shrink-0 w-80 h-52 rounded-2xl p-6 flex flex-col justify-end relative overflow-hidden group cursor-pointer transition-all border border-white/10 hover:border-white/30 hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-500/20 bg-slate-900/80 backdrop-blur-xl">
                    <div className="absolute inset-0 opacity-30 group-hover:opacity-60 transition-opacity bg-gradient-to-br from-indigo-500/30 via-transparent to-purple-500/30"></div>
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/40 to-transparent z-10"></div>
                    
                    <div className="relative z-20 transform group-hover:-translate-y-1 transition-transform duration-300">
                      <h3 className="text-xl font-bold text-white mb-2 leading-tight line-clamp-2 drop-shadow-lg">
                        {recipe.title}
                      </h3>
                      <div className="flex gap-2 text-[0.65rem] font-bold text-indigo-400 uppercase tracking-widest drop-shadow-md">
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
