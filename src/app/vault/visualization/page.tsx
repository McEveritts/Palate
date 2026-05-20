import React from 'react';
import Link from 'next/link';
import { getVaultRecipes, getCuratedRecipes } from '@/lib/vaultParser';
import { VaultGraph3D } from '@/components/vault/VaultGraph3D';
import { Grid, Eye } from 'lucide-react';

export default async function VaultVisualizationPage() {
  const mainsAndSides = await getVaultRecipes();
  const curatedCurrent = await getCuratedRecipes('current');
  const allRecipes = [...mainsAndSides, ...curatedCurrent];

  return (
    <main className="min-h-screen p-8 md:p-16 relative overflow-hidden bg-slate-950">
      {/* Dynamic specular glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 rounded-full blur-[150px] pointer-events-none animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-fuchsia-500/10 rounded-full blur-[150px] pointer-events-none animate-pulse"></div>

      <div className="max-w-7xl mx-auto relative z-10">
        <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-white to-fuchsia-300 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] mb-4">
              Cosmos Visualizer
            </h1>
            <p className="text-indigo-200/70 text-lg max-w-2xl font-medium">
              Explore the multidimensional culinary relationships and tags of your recipe vault.
            </p>
          </div>

          <div className="flex gap-3 shrink-0">
            <Link
              href="/vault"
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-all text-sm font-semibold shadow-lg backdrop-blur-md"
            >
              <Grid className="w-4 h-4" />
              <span>Grid View</span>
            </Link>
            
            <div
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-200 transition-all text-sm font-bold shadow-lg shadow-indigo-500/10 backdrop-blur-md"
            >
              <Eye className="w-4 h-4" />
              <span>3D Visualizer</span>
            </div>
          </div>
        </header>

        <section className="w-full">
          <VaultGraph3D recipes={allRecipes} />
        </section>
      </div>
    </main>
  );
}
