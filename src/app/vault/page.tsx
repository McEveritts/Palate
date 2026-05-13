import React from 'react';
import { getVaultRecipes } from '@/lib/vaultParser';
import { VaultGrid } from '@/components/vault/VaultGrid';

export default async function VaultPage() {
  const recipes = await getVaultRecipes();

  return (
    <main className="min-h-screen p-8 md:p-16 relative overflow-hidden">
      {/* Background Elements */}
      <div className="fixed top-0 left-0 w-[800px] h-[800px] bg-indigo-900/20 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
      <div className="fixed bottom-0 right-0 w-[600px] h-[600px] bg-fuchsia-900/10 rounded-full blur-[100px] translate-x-1/3 translate-y-1/3 pointer-events-none"></div>
      
      <div className="max-w-7xl mx-auto relative z-10">
        <header className="mb-12">
          <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-white to-fuchsia-300 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] mb-4">
            Recipe Vault
          </h1>
          <p className="text-indigo-200/70 text-lg max-w-2xl">
            Your personal collection of synthesized culinary compositions.
          </p>
        </header>

        <VaultGrid initialRecipes={recipes} />
      </div>
    </main>
  );
}
