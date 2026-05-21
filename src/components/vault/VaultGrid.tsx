"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VaultFilters } from './VaultFilters';
import { VaultRecipe } from '@/lib/vaultParser';
import { X, Save, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

import { RecipeNutritionDetails } from './RecipeNutritionDetails';
import { VaultCockpit } from './VaultCockpit';
import { deleteRecipeFromVault } from '@/app/actions';
import { extractMacrosFromString } from '@/lib/parser';

function getProceduralGradient(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const schemes = [
    {
      glow: 'bg-indigo-500/20',
      borderHover: 'group-hover:border-indigo-500/30',
      shadowHover: 'group-hover:shadow-[0_0_30px_rgba(99,102,241,0.25)]',
      tagBg: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.15)]',
    },
    {
      glow: 'bg-fuchsia-500/20',
      borderHover: 'group-hover:border-fuchsia-500/30',
      shadowHover: 'group-hover:shadow-[0_0_30px_rgba(217,70,239,0.25)]',
      tagBg: 'bg-fuchsia-500/10 border-fuchsia-500/20 text-fuchsia-300 shadow-[0_0_10px_rgba(217,70,239,0.15)]',
    },
    {
      glow: 'bg-emerald-500/20',
      borderHover: 'group-hover:border-emerald-500/30',
      shadowHover: 'group-hover:shadow-[0_0_30px_rgba(16,185,129,0.25)]',
      tagBg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.15)]',
    },
    {
      glow: 'bg-amber-500/20',
      borderHover: 'group-hover:border-amber-500/30',
      shadowHover: 'group-hover:shadow-[0_0_30px_rgba(245,158,11,0.25)]',
      tagBg: 'bg-amber-500/10 border-amber-500/20 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.15)]',
    },
    {
      glow: 'bg-cyan-500/20',
      borderHover: 'group-hover:border-cyan-500/30',
      shadowHover: 'group-hover:shadow-[0_0_30px_rgba(6,182,212,0.25)]',
      tagBg: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.15)]',
    },
    {
      glow: 'bg-rose-500/20',
      borderHover: 'group-hover:border-rose-500/30',
      shadowHover: 'group-hover:shadow-[0_0_30px_rgba(244,63,94,0.25)]',
      tagBg: 'bg-rose-500/10 border-rose-500/20 text-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.15)]',
    }
  ];
  const idx = Math.abs(hash) % schemes.length;
  return schemes[idx];
}

interface VaultGridProps {
  initialRecipes: VaultRecipe[];
  onSaveAction?: (id: string) => Promise<void>;
}

export function VaultGrid({ initialRecipes, onSaveAction }: VaultGridProps) {
  const [recipes, setRecipes] = useState<VaultRecipe[]>(initialRecipes);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<'all' | 'mains' | 'sides' | 'appetizers'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setRecipes(initialRecipes);
  }, [initialRecipes]);

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

  const filteredRecipes = useMemo(() => {
    return recipes.filter(recipe => {
      let matchesCategory = false;
      if (activeCategory === 'all') {
        matchesCategory = true;
      } else if (recipe.category.startsWith('curated')) {
        const isSide = recipe.tags.some(t => t.toLowerCase().includes('side'));
        matchesCategory = activeCategory === 'sides' ? isSide : !isSide;
      } else {
        matchesCategory = recipe.category === activeCategory;
      }

      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery || 
        recipe.title.toLowerCase().includes(searchLower) ||
        recipe.tags.some(t => t.toLowerCase().includes(searchLower));
      
      return matchesCategory && matchesSearch;
    });
  }, [recipes, searchQuery, activeCategory]);

  const selectedRecipe = recipes.find(r => r.id === selectedId);

  const handleSaveClick = async () => {
    if (!selectedId || !onSaveAction) return;
    setIsSaving(true);
    await onSaveAction(selectedId);
    setIsSaving(false);
    setSelectedId(null);
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    
    const previousRecipes = recipes;
    // Optimistic Update
    setRecipes(recipes.filter(r => r.id !== id));
    
    if (selectedId === id) {
      setSelectedId(null);
    }
    
    setIsDeleting(id);
    
    try {
      const result = await deleteRecipeFromVault(id);
      if (!result.success) {
        // Rollback state
        setRecipes(previousRecipes);
        alert(`Failed to delete recipe: ${result.error}`);
      }
    } catch (err) {
      setRecipes(previousRecipes);
      alert("An unexpected error occurred while deleting the recipe.");
    } finally {
      setIsDeleting(null);
      setConfirmDeleteId(null);
    }
  };


  return (
    <div className="w-full relative">
      <VaultFilters 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        activeCategory={activeCategory}
        setActiveCategory={setActiveCategory}
      />

      <VaultCockpit recipes={recipes} />

      <motion.div 
        className="columns-1 md:columns-2 lg:columns-3 gap-6 space-y-6"
        animate={{ opacity: selectedId ? 0.3 : 1, filter: selectedId ? "blur(8px)" : "blur(0px)" }}
        transition={{ duration: 0.3 }}
      >
        <AnimatePresence>
          {filteredRecipes.map((recipe) => {
            const scheme = getProceduralGradient(recipe.title);
            const { protein, carbs, fat, calories } = extractMacrosFromString(recipe.macros);
            
            return (
              <motion.div
                layoutId={`card-${recipe.id}`}
                key={recipe.id}
                onClick={() => setSelectedId(recipe.id)}
                onMouseLeave={() => {
                  if (confirmDeleteId === recipe.id) {
                    setConfirmDeleteId(null);
                  }
                }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`cursor-pointer group relative overflow-hidden rounded-2xl bg-slate-900/30 backdrop-blur-3xl backdrop-saturate-[1.5] border border-white/10 border-t-white/20 border-l-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.1)] p-6 transition-all duration-300 hover:bg-slate-900/20 hover:backdrop-saturate-[2] break-inside-avoid inline-block w-full ${scheme.borderHover} ${scheme.shadowHover}`}
              >
                {/* Abstract Background Element */}
                <div className={`absolute -top-20 -right-20 w-40 h-40 ${scheme.glow} rounded-full blur-3xl group-hover:scale-125 transition-transform duration-500 opacity-60`}></div>
                
                <motion.h3 layoutId={`title-${recipe.id}`} className="text-2xl font-bold text-white mb-2 pr-12 z-10 relative">
                  {recipe.title}
                </motion.h3>

                {/* Glowing category tags */}
                {recipe.tags && recipe.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4 z-10 relative">
                    {recipe.tags.map((tag) => (
                      <span key={tag} className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${scheme.tagBg}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                  
                {/* Hover Macro Dashboard */}
                {(calories > 0 || protein > 0 || carbs > 0 || fat > 0) && (
                  <div className="mt-4 pt-4 border-t border-white/5 opacity-0 max-h-0 group-hover:opacity-100 group-hover:max-h-20 overflow-hidden transition-all duration-300 z-10 relative flex justify-between items-center text-xs">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Calories</span>
                      <span className="text-white font-bold">{calories} kcal</span>
                    </div>
                    <div className="flex gap-3 font-mono">
                      {protein > 0 && (
                        <div className="flex flex-col items-center">
                          <span className="text-[9px] text-emerald-400 font-bold uppercase">P</span>
                          <span className="text-emerald-300 font-semibold">{protein}g</span>
                        </div>
                      )}
                      {carbs > 0 && (
                        <div className="flex flex-col items-center">
                          <span className="text-[9px] text-sky-400 font-bold uppercase">C</span>
                          <span className="text-sky-300 font-semibold">{carbs}g</span>
                        </div>
                      )}
                      {fat > 0 && (
                        <div className="flex flex-col items-center">
                          <span className="text-[9px] text-amber-400 font-bold uppercase">F</span>
                          <span className="text-amber-300 font-semibold">{fat}g</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Secure Hover-Triggered Glassmorphic Trashcan Icon with confirmation */}
                <div className="absolute bottom-4 right-4 z-20 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-auto">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (confirmDeleteId === recipe.id) {
                        handleDelete(recipe.id, e);
                      } else {
                        setConfirmDeleteId(recipe.id);
                      }
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onMouseUp={(e) => e.stopPropagation()}
                    className={`flex items-center gap-1.5 p-2.5 rounded-xl border backdrop-blur-md transition-all duration-300 ${
                      confirmDeleteId === recipe.id
                        ? 'bg-rose-500/25 border-rose-500/50 text-rose-200 shadow-[0_0_15px_rgba(244,63,94,0.4)] animate-pulse'
                        : 'bg-white/5 border-white/10 hover:bg-rose-500/20 hover:border-rose-500/35 text-slate-400 hover:text-rose-200'
                    }`}
                    disabled={isDeleting === recipe.id}
                    title="Delete recipe"
                  >
                    <Trash2 className="w-4 h-4" />
                    {confirmDeleteId === recipe.id && (
                      <span className="text-xs font-semibold select-none pr-1">Confirm?</span>
                    )}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>

      {/* Expanded Modal */}
      <AnimatePresence>
        {selectedId && selectedRecipe && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            {/* Click-away backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 pointer-events-auto bg-slate-950/60 backdrop-blur-md" 
              onClick={() => {
                setSelectedId(null);
                setConfirmDeleteId(null);
              }}
            />
            
            <motion.div
              layoutId={`card-${selectedId}`}
              className="w-full max-w-3xl max-h-[85vh] flex flex-col bg-slate-900/40 backdrop-blur-3xl backdrop-saturate-[2] border border-white/10 border-t-white/20 border-l-white/20 rounded-3xl shadow-[0_0_80px_rgba(0,0,0,0.8),inset_0_1px_2px_rgba(255,255,255,0.2)] pointer-events-auto relative z-10 overflow-hidden"
            >
              {/* Top action bar: Close Button + Optional Save Button + Delete Button */}
              <div className="absolute top-0 right-0 p-6 z-20 flex gap-3 pointer-events-none items-center">
                {/* Delete Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirmDeleteId === selectedId) {
                      handleDelete(selectedId);
                    } else {
                      setConfirmDeleteId(selectedId);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-full text-sm font-medium transition-all duration-300 pointer-events-auto ${
                    confirmDeleteId === selectedId
                      ? 'bg-rose-500/25 border-rose-500/50 text-rose-200 shadow-[0_0_15px_rgba(244,63,94,0.4)] animate-pulse'
                      : 'bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/30 text-rose-300 hover:text-rose-100'
                  }`}
                  disabled={isDeleting === selectedId}
                  title="Delete recipe"
                >
                  <Trash2 className="w-4 h-4" />
                  {confirmDeleteId === selectedId ? 'Confirm Delete?' : 'Delete'}
                </button>

                {onSaveAction && (
                  <button 
                    onClick={handleSaveClick}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-500/20 hover:bg-indigo-500/40 border border-indigo-400/50 rounded-full text-indigo-100 transition-colors pointer-events-auto disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span className="text-sm font-medium">{isSaving ? 'Saving...' : 'Save to Vault'}</span>
                  </button>
                )}
                <button 
                  onClick={() => {
                    setSelectedId(null);
                    setConfirmDeleteId(null);
                  }}
                  className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors pointer-events-auto"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-8 md:p-12 relative overflow-y-auto custom-scrollbar flex-1">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-96 bg-gradient-to-b from-fuchsia-500/20 via-indigo-500/10 to-transparent rounded-full blur-[100px] pointer-events-none"></div>

                <motion.h3 layoutId={`title-${selectedId}`} className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-white mb-6 pr-16 md:pr-48 relative z-10 leading-tight tracking-tight text-balance">
                  {selectedRecipe.title}
                </motion.h3>
                
                <motion.div layoutId={`tags-${selectedId}`} className="flex flex-wrap items-center gap-2 mb-6 relative z-10">
                  {selectedRecipe.tags.map(tag => (
                    <span key={tag} className="px-3 py-1 text-sm rounded-full bg-indigo-500/30 text-indigo-100 border border-indigo-500/50 shadow-[0_0_10px_rgba(99,102,241,0.2)]">
                      {tag}
                    </span>
                  ))}
                </motion.div>

                <div className="mb-8 relative z-10">
                  <RecipeNutritionDetails 
                    recipeId={selectedRecipe.id}
                    recipeTitle={selectedRecipe.title}
                    initialMacros={selectedRecipe.macros}
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
