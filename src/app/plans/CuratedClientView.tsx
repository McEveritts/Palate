"use client";

import { useState } from 'react';
import { VaultRecipe } from '@/lib/vaultParser';
import { VaultGrid } from '@/components/vault/VaultGrid';
import { EditorialView } from './EditorialView';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { saveCuratedToVault } from '@/app/actions';

interface CuratedClientViewProps {
  currentRecipes: VaultRecipe[];
  archiveRecipes: VaultRecipe[];
}

export default function CuratedClientView({ currentRecipes, archiveRecipes }: CuratedClientViewProps) {
  const [view, setView] = useState<'editorial' | 'timeline'>('editorial');
  const router = useRouter();

  const handleSave = async (id: string) => {
    await saveCuratedToVault(id);
    router.refresh();
  };

  const displayedRecipes = view === 'editorial' ? currentRecipes : archiveRecipes;

  return (
    <div className="w-full flex flex-col items-center">
      <div className="flex bg-slate-900/50 backdrop-blur-xl p-1 rounded-full border border-white/10 mb-8 relative">
        <button
          onClick={() => setView('editorial')}
          className={`relative px-6 py-2 rounded-full text-sm font-medium transition-colors ${
            view === 'editorial' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {view === 'editorial' && (
            <motion.div
              layoutId="active-pill"
              className="absolute inset-0 bg-indigo-500/30 border border-indigo-400/50 rounded-full"
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          )}
          <span className="relative z-10">This Week</span>
        </button>
        <button
          onClick={() => setView('timeline')}
          className={`relative px-6 py-2 rounded-full text-sm font-medium transition-colors ${
            view === 'timeline' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {view === 'timeline' && (
            <motion.div
              layoutId="active-pill"
              className="absolute inset-0 bg-indigo-500/30 border border-indigo-400/50 rounded-full"
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          )}
          <span className="relative z-10">Timeline Archive</span>
        </button>
      </div>

      <div className="w-full">
        {displayedRecipes.length === 0 ? (
          <div className="text-center py-20 text-slate-500 italic">
            No curated recipes found for this view.
          </div>
        ) : view === 'editorial' ? (
          <EditorialView initialRecipes={displayedRecipes} onSaveAction={handleSave} />
        ) : (
          <VaultGrid initialRecipes={displayedRecipes} onSaveAction={handleSave} />
        )}
      </div>
    </div>
  );
}
