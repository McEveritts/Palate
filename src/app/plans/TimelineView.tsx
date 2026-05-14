"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VaultRecipe } from '@/lib/vaultParser';
import { X, Save, Eye, Code } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface TimelineViewProps {
  initialRecipes: VaultRecipe[];
  onSaveAction?: (id: string) => Promise<void>;
}

export function TimelineView({ initialRecipes, onSaveAction }: TimelineViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRawView, setIsRawView] = useState(false);

  useEffect(() => {
    if (selectedId) {
      document.body.style.overflow = 'hidden';
      setIsRawView(false);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedId]);

  const selectedRecipe = initialRecipes.find(r => r.id === selectedId);

  const handleSaveClick = async () => {
    if (!selectedId || !onSaveAction) return;
    setIsSaving(true);
    await onSaveAction(selectedId);
    setIsSaving(false);
    setSelectedId(null);
  };

  if (initialRecipes.length === 0) {
    return (
      <div className="text-center py-20 text-slate-500 italic">
        The archive is currently empty.
      </div>
    );
  }

  // Chunk recipes into meals of 3 (1 Hero + 2 Sides)
  // Since they are sorted ascending by mtime, we chunk them sequentially, then reverse so the newest meal is at the top.
  const meals: VaultRecipe[][] = [];
  for (let i = 0; i < initialRecipes.length; i += 3) {
    meals.push(initialRecipes.slice(i, i + 3));
  }
  meals.reverse();

  return (
    <div className="w-full flex flex-col gap-16 relative">
      {meals.map((meal, index) => {
        const heroRecipe = meal[0];
        const gridRecipes = meal.slice(1);
        
        return (
          <div key={`meal-${index}`} className="relative pl-8 md:pl-0">
            {/* Timeline Line (Hidden on mobile) */}
            <div className="hidden md:block absolute left-[-40px] top-0 bottom-[-64px] w-px bg-white/10" />
            <div className="hidden md:flex absolute left-[-48px] top-8 w-4 h-4 rounded-full bg-indigo-500 border-4 border-slate-950 shadow-[0_0_15px_rgba(99,102,241,0.5)] items-center justify-center" />

            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white tracking-tight">Curated Meal #{meals.length - index}</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-900/20 p-6 md:p-8 rounded-3xl border border-white/5 shadow-2xl backdrop-blur-sm">
              
              {/* HERO CARD */}
              {heroRecipe && (
                <motion.div
                  layoutId={`archive-card-${heroRecipe.id}`}
                  onClick={() => setSelectedId(heroRecipe.id)}
                  className="md:col-span-2 min-h-[300px] cursor-pointer group relative overflow-hidden rounded-2xl bg-slate-900/40 backdrop-blur-3xl backdrop-saturate-[1.5] border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.15)] p-8 flex flex-col justify-end transition-all duration-300 hover:bg-slate-900/30 hover:shadow-[0_0_40px_rgba(139,92,246,0.2)] hover:backdrop-saturate-[2]"
                >
                  <div className="absolute -top-32 -right-32 w-[400px] h-[400px] bg-[radial-gradient(circle,rgba(217,70,239,0.1)_0%,transparent_70%)] rounded-full blur-3xl group-hover:bg-[radial-gradient(circle,rgba(217,70,239,0.2)_0%,transparent_70%)] transition-all duration-500 z-0"></div>
                  
                  <div className="relative z-10 w-full">
                    <span className="px-3 py-1 mb-4 inline-block text-[10px] font-bold uppercase tracking-widest text-fuchsia-300 bg-fuchsia-900/30 rounded-full border border-fuchsia-500/30">
                      Main Dish
                    </span>
                    <motion.h3 layoutId={`archive-title-${heroRecipe.id}`} className="text-3xl md:text-4xl font-extrabold text-white mb-4 leading-tight">
                      {heroRecipe.title}
                    </motion.h3>
                    <div className="flex flex-wrap gap-2">
                      {heroRecipe.tags.map(tag => (
                        <span key={tag} className="px-2 py-1 text-xs rounded-md bg-indigo-500/20 text-indigo-200 border border-indigo-500/30">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* SIDE CARDS */}
              {gridRecipes.map((recipe) => (
                <motion.div
                  layoutId={`archive-card-${recipe.id}`}
                  key={recipe.id}
                  onClick={() => setSelectedId(recipe.id)}
                  className="cursor-pointer group relative overflow-hidden rounded-xl bg-slate-900/40 backdrop-blur-3xl backdrop-saturate-[1.5] border border-white/5 shadow-lg p-6 transition-all duration-300 hover:bg-slate-900/30 hover:shadow-[0_0_30px_rgba(99,102,241,0.15)] flex flex-col min-h-[200px]"
                >
                  <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition-all duration-500"></div>
                  
                  <div className="z-10 relative flex-1 flex flex-col">
                    <span className="px-2 py-1 mb-3 self-start text-[10px] font-bold uppercase tracking-widest text-indigo-300 bg-indigo-900/30 rounded-full border border-indigo-500/30">
                      Side Dish
                    </span>
                    <motion.h3 layoutId={`archive-title-${recipe.id}`} className="text-xl md:text-2xl font-bold text-white mb-auto leading-snug">
                      {recipe.title}
                    </motion.h3>
                    
                    <div className="flex flex-wrap gap-2 mt-6">
                      {recipe.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="px-2 py-1 text-[10px] rounded bg-slate-800/80 text-slate-300 border border-slate-700/50">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Expanded Modal */}
      <AnimatePresence>
        {selectedId && selectedRecipe && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div 
              className="absolute inset-0 pointer-events-auto bg-slate-950/40 backdrop-blur-md" 
              onClick={() => setSelectedId(null)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            
            <motion.div
              layoutId={`archive-card-${selectedId}`}
              className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-slate-900/60 backdrop-blur-3xl backdrop-saturate-[2] border border-white/10 border-t-white/20 border-l-white/20 rounded-3xl shadow-[0_0_80px_rgba(0,0,0,0.8),inset_0_1px_2px_rgba(255,255,255,0.2)] pointer-events-auto relative z-10 overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-6 z-20 flex gap-3 pointer-events-none">
                <button 
                  onClick={() => setIsRawView(!isRawView)}
                  className="p-2.5 bg-slate-800/50 hover:bg-slate-700/80 border border-slate-600/50 rounded-full text-slate-200 transition-colors pointer-events-auto backdrop-blur-md group relative"
                  title={isRawView ? "Switch to Formatted View" : "Switch to Raw View"}
                >
                  {isRawView ? <Eye className="w-5 h-5" /> : <Code className="w-5 h-5" />}
                  <span className="absolute -bottom-8 right-0 whitespace-nowrap bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                    {isRawView ? 'Eye View' : 'Raw View'}
                  </span>
                </button>

                {onSaveAction && (
                  <button 
                    onClick={handleSaveClick}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-5 py-2.5 bg-fuchsia-600/80 hover:bg-fuchsia-500 border border-fuchsia-400/50 rounded-full text-white shadow-lg backdrop-blur-md transition-all pointer-events-auto disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span className="text-sm font-bold">{isSaving ? 'Saving...' : 'Save to Vault'}</span>
                  </button>
                )}
                <button 
                  onClick={() => setSelectedId(null)}
                  className="p-2.5 bg-slate-800/50 hover:bg-slate-700/80 border border-slate-600/50 rounded-full text-slate-200 transition-colors pointer-events-auto backdrop-blur-md"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-8 md:p-12 relative overflow-y-auto custom-scrollbar flex-1">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-96 bg-gradient-to-b from-fuchsia-500/20 via-indigo-500/10 to-transparent rounded-full blur-[100px] pointer-events-none"></div>
                
                <motion.h3 layoutId={`archive-title-${selectedId}`} className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-white mb-6 pr-16 md:pr-48 relative z-10 leading-tight tracking-tight text-balance">
                  {selectedRecipe.title}
                </motion.h3>
                
                <div className="flex flex-wrap items-center gap-3 mb-10 relative z-10">
                  {selectedRecipe.tags.map(tag => (
                    <span key={tag} className="px-4 py-1.5 text-sm font-medium rounded-md bg-indigo-500/20 text-indigo-100 border border-indigo-500/30">
                      {tag}
                    </span>
                  ))}
                  <span className="px-4 py-1.5 text-sm font-bold rounded-full bg-fuchsia-500/20 text-fuchsia-200 border border-fuchsia-500/30 w-full sm:w-auto mt-3 sm:mt-0">
                    {selectedRecipe.macros}
                  </span>
                </div>

                <div className="relative z-10 mt-10">
                  <div className="bg-black/20 p-8 md:p-10 rounded-2xl border border-white/5 shadow-inner">
                    {isRawView ? (
                      <pre className="text-sm font-mono text-slate-300 whitespace-pre-wrap break-words custom-scrollbar overflow-x-auto">
                        {selectedRecipe.content}
                      </pre>
                    ) : (
                      <div className="prose prose-invert prose-lg prose-indigo max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {selectedRecipe.content}
                        </ReactMarkdown>
                      </div>
                    )}
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
