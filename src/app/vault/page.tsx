import React from 'react';
import { getVaultRecipes } from '@/lib/vaultParser';
import { VaultGrid } from '@/components/vault/VaultGrid';
import { VaultCockpit } from '@/components/vault/VaultCockpit';

export default async function VaultPage() {
  const recipes = await getVaultRecipes();

  return (
    <main className="min-h-screen p-8 md:p-16 relative overflow-hidden bg-slate-950">
      {/* Specular glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 rounded-full blur-[150px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-fuchsia-500/10 rounded-full blur-[150px] pointer-events-none"></div>

      <div className="max-w-7xl mx-auto relative z-10">
        <header className="mb-12">
          <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-white to-fuchsia-300 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] mb-4">
            Recipe Vault
          </h1>
          <p className="text-indigo-200/70 text-lg max-w-2xl font-medium">
            Your personal collection of synthesized culinary compositions.
          </p>
        </header>

        <VaultCockpit recipes={recipes} />

        <VaultGrid initialRecipes={recipes} />
      </div>
    </main>
  );
}
