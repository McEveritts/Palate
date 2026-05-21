"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VaultRecipe } from '@/lib/vaultParser';
import { X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { RecipeNutritionDetails } from '../vault/RecipeNutritionDetails';

interface MacroRecipe extends VaultRecipe {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  density: number;
}

interface MacroGridProps {
  recipes: MacroRecipe[];
}

export function MacroGrid({ recipes }: MacroGridProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedId) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedId]);

  const selectedRecipe = recipes.find(r => r.id === selectedId);

  return (
    <div className="w-full relative">
      <motion.div 
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        animate={{ opacity: selectedId ? 0.3 : 1, filter: selectedId ? "blur(8px)" : "blur(0px)" }}
        transition={{ duration: 0.3 }}
      >
        <AnimatePresence>
          {recipes.map((recipe) => (
            <motion.div
              layoutId={`card-${recipe.id}`}
              key={recipe.id}
              onClick={() => setSelectedId(recipe.id)}
              className="cursor-pointer glass-panel p-6 rounded-3xl flex flex-col gap-4 border border-white/5 bg-gradient-to-br from-white/[0.02] to-transparent hover:bg-white/[0.05] transition-colors"
            >
              <motion.h3 layoutId={`title-${recipe.id}`} className="text-xl font-bold text-white line-clamp-1">{recipe.title}</motion.h3>
              
              <div className="flex items-end justify-between mt-auto">
                <div className="flex gap-4">
                  <div className="flex flex-col">
                    <span className="text-4xl font-black text-emerald-400">{recipe.protein}g</span>
                    <span className="text-sm text-emerald-400/70 font-medium uppercase tracking-wider">Protein</span>
                  </div>
                  <div className="flex flex-col justify-end pb-0.5">
                    <span className="text-lg font-bold text-sky-400">{recipe.carbs}g</span>
                    <span className="text-[0.65rem] text-sky-400/70 font-medium uppercase tracking-wider">Carbs</span>
                  </div>
                  <div className="flex flex-col justify-end pb-0.5">
                    <span className="text-lg font-bold text-amber-400">{recipe.fat}g</span>
                    <span className="text-[0.65rem] text-amber-400/70 font-medium uppercase tracking-wider">Fat</span>
                  </div>
                </div>
                <div className="flex flex-col text-right">
                  <span className="text-2xl font-bold text-slate-300">{recipe.calories}</span>
                  <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Calories</span>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      {/* Expanded Modal */}
      <AnimatePresence>
        {selectedId && selectedRecipe && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div 
              className="absolute inset-0 pointer-events-auto" 
              onClick={() => setSelectedId(null)}
            />
            
            <motion.div
              layoutId={`card-${selectedId}`}
              className="w-full max-w-3xl max-h-[85vh] flex flex-col bg-slate-900/40 backdrop-blur-3xl backdrop-saturate-[2] border border-white/10 border-t-white/20 border-l-white/20 rounded-3xl shadow-[0_0_80px_rgba(0,0,0,0.8),inset_0_1px_2px_rgba(255,255,255,0.2)] pointer-events-auto relative z-10 overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-6 z-20 flex gap-3 pointer-events-none">
                <button 
                  onClick={() => setSelectedId(null)}
                  className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors pointer-events-auto"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-8 md:p-12 relative overflow-y-auto custom-scrollbar flex-1">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-96 bg-gradient-to-b from-fuchsia-500/20 via-indigo-500/10 to-transparent rounded-full blur-[100px] pointer-events-none"></div>

                <motion.h3 layoutId={`title-${selectedId}`} className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-white mb-6 pr-16 relative z-10 leading-tight tracking-tight text-balance">
                  {selectedRecipe.title}
                </motion.h3>
                
                <div className="mb-8 relative z-10">
                  <RecipeNutritionDetails 
                    recipeId={selectedRecipe.id}
                    recipeTitle={selectedRecipe.title}
                    initialMacros={`Protein: ${selectedRecipe.protein}g | Carbs: ${selectedRecipe.carbs}g | Fat: ${selectedRecipe.fat}g | Calories: ${selectedRecipe.calories}`}
                  />
                </div>

                <div className="prose prose-invert prose-indigo max-w-none relative z-10 mt-8">
                  <div className="bg-black/30 p-6 rounded-xl border border-white/5">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                      {selectedRecipe.content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}