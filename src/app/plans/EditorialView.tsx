"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VaultRecipe } from '@/lib/vaultParser';
import { X, Save } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface EditorialViewProps {
  initialRecipes: VaultRecipe[];
  onSaveAction?: (id: string) => Promise<void>;
}

export function EditorialView({ initialRecipes, onSaveAction }: EditorialViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
        No curated recipes available this week.
      </div>
    );
  }

  const heroRecipe = initialRecipes[0];
  const gridRecipes = initialRecipes.slice(1);

  return (
    <div className="w-full relative">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* HERO CARD */}
        <motion.div
          layoutId={`card-${heroRecipe.id}`}
          onClick={() => setSelectedId(heroRecipe.id)}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: selectedId ? 0.3 : 1, y: 0, filter: selectedId ? "blur(8px)" : "blur(0px)" }}
          transition={{ duration: 0.3 }}
          className="md:col-span-2 min-h-[450px] cursor-pointer group relative overflow-hidden rounded-3xl bg-slate-900/40 border border-white/10 backdrop-blur-2xl p-8 md:p-12 flex flex-col justify-end shadow-2xl transition-all duration-500 hover:shadow-[0_0_40px_rgba(139,92,246,0.2)]"
        >
          {/* Enhanced Aurora Background for Hero */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/40 to-transparent z-0"></div>
          <div className="absolute -top-32 -right-32 w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(217,70,239,0.15)_0%,transparent_70%)] rounded-full blur-3xl group-hover:bg-[radial-gradient(circle,rgba(217,70,239,0.25)_0%,transparent_70%)] transition-all duration-700 z-0"></div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 relative z-10 w-full h-full items-end">
            {/* Left Column: Title and Tags */}
            <div className="flex flex-col justify-end h-full">
              <div className="mb-6">
                <span className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-fuchsia-300 bg-fuchsia-900/30 rounded-full border border-fuchsia-500/30 backdrop-blur-md shadow-[0_0_15px_rgba(217,70,239,0.2)]">
                  Recipe of the Week
                </span>
              </div>

              <motion.h3 layoutId={`title-${heroRecipe.id}`} className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-6 leading-tight tracking-tight drop-shadow-md">
                {heroRecipe.title}
              </motion.h3>
              
              <div className="grid grid-cols-1 grid-rows-1">
                <motion.div layoutId={`tags-${heroRecipe.id}`} className="col-start-1 row-start-1 flex flex-wrap items-start content-start">
                  <div className="flex flex-wrap gap-3 transition-all duration-500 group-hover:opacity-0 group-hover:-translate-y-4">
                    {heroRecipe.tags.map(tag => (
                      <span key={tag} className="px-3 py-1.5 text-sm font-medium rounded-md bg-indigo-500/20 text-indigo-100 border border-indigo-500/30 backdrop-blur-sm">
                        {tag}
                      </span>
                    ))}
                  </div>
                </motion.div>

                <div className="col-start-1 row-start-1 flex flex-wrap items-start content-start gap-3 opacity-0 translate-y-4 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500 pointer-events-none">
                  {heroRecipe.macros ? (
                    heroRecipe.macros.split('|').map((macro, idx) => (
                      <span key={idx} className="px-3 py-1.5 text-sm font-bold rounded-full bg-fuchsia-600/90 text-white shadow-xl backdrop-blur-md border border-fuchsia-400/50">
                        {macro.trim()}
                      </span>
                    ))
                  ) : (
                    <span className="px-3 py-1.5 text-sm font-bold rounded-full bg-fuchsia-600/90 text-white shadow-xl backdrop-blur-md border border-fuchsia-400/50">
                      Macros not calculated
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Editorial Excerpt */}
            <div className="hidden lg:flex flex-col justify-end h-full">
              <div className="prose prose-invert prose-indigo prose-lg max-w-none text-slate-300 line-clamp-5 xl:line-clamp-6 opacity-90 transition-opacity duration-500 group-hover:opacity-100">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {heroRecipe.content.split('\n\n').filter(p => p.trim().length > 30 && !p.match(/^[IVX]+\./)).slice(0, 2).join('\n\n')}
                </ReactMarkdown>
              </div>
              <div className="mt-8 flex items-center text-indigo-400 font-bold tracking-wide group-hover:text-fuchsia-400 transition-colors uppercase text-sm">
                <span>Read Full Editorial</span>
                <span className="ml-2 transform group-hover:translate-x-2 transition-transform text-lg leading-none">→</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* SUB-GRID CARDS */}
        {gridRecipes.map((recipe) => (
          <motion.div
            layoutId={`card-${recipe.id}`}
            key={recipe.id}
            onClick={() => setSelectedId(recipe.id)}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: selectedId ? 0.3 : 1, y: 0, filter: selectedId ? "blur(8px)" : "blur(0px)" }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="cursor-pointer group relative overflow-hidden rounded-2xl bg-slate-900/40 border border-white/10 backdrop-blur-2xl p-8 shadow-xl transition-all duration-300 hover:shadow-[0_0_30px_rgba(99,102,241,0.2)] flex flex-col justify-between min-h-[250px]"
          >
            <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/20 transition-all duration-500"></div>
            
            <motion.h3 layoutId={`title-${recipe.id}`} className="text-2xl md:text-3xl font-bold text-white mb-6 z-10 relative leading-snug">
              {recipe.title}
            </motion.h3>
            
            <div className="grid grid-cols-1 grid-rows-1 z-10 mt-auto">
              <motion.div layoutId={`tags-${recipe.id}`} className="col-start-1 row-start-1 flex flex-wrap items-start content-start">
                <div className="flex flex-wrap gap-2 transition-all duration-300 group-hover:opacity-0 group-hover:-translate-y-4">
                  {recipe.tags.map(tag => (
                    <span key={tag} className="px-2 py-1 text-xs rounded bg-slate-800/80 text-slate-300 border border-slate-700/50">
                      {tag}
                    </span>
                  ))}
                </div>
              </motion.div>

              <div className="col-start-1 row-start-1 flex flex-wrap items-start content-start gap-2 opacity-0 translate-y-4 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none">
                {recipe.macros ? (
                  recipe.macros.split('|').map((macro, idx) => (
                    <span key={idx} className="px-2 py-1 text-xs font-semibold rounded-md bg-indigo-500/80 text-white shadow-lg backdrop-blur-md">
                      {macro.trim()}
                    </span>
                  ))
                ) : (
                  <span className="px-2 py-1 text-xs font-semibold rounded-md bg-indigo-500/80 text-white shadow-lg backdrop-blur-md">
                    Macros not calculated
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Expanded Modal (Same as VaultGrid) */}
      <AnimatePresence>
        {selectedId && selectedRecipe && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            {/* Click-away backdrop */}
            <motion.div 
              className="absolute inset-0 pointer-events-auto bg-slate-950/20 backdrop-blur-sm" 
              onClick={() => setSelectedId(null)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            
            <motion.div
              layoutId={`card-${selectedId}`}
              className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-slate-900/90 border border-white/20 backdrop-blur-3xl rounded-3xl shadow-[0_0_80px_rgba(0,0,0,0.6)] pointer-events-auto relative z-10 overflow-hidden"
            >
              {/* Top action bar: Close Button + Optional Save Button */}
              <div className="absolute top-0 right-0 p-6 z-20 flex gap-3 pointer-events-none">
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

              <div className="p-8 md:p-14 relative overflow-y-auto custom-scrollbar flex-1">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150%] h-80 bg-gradient-to-b from-fuchsia-500/10 via-indigo-500/5 to-transparent rounded-full blur-3xl pointer-events-none"></div>
                
                <motion.h3 layoutId={`title-${selectedId}`} className="text-4xl md:text-6xl font-extrabold text-white mb-6 pr-40 relative z-10 leading-tight">
                  {selectedRecipe.title}
                </motion.h3>
                
                <motion.div layoutId={`tags-${selectedId}`} className="flex flex-wrap items-center gap-3 mb-10 relative z-10">
                  {selectedRecipe.tags.map(tag => (
                    <span key={tag} className="px-4 py-1.5 text-sm font-medium rounded-md bg-indigo-500/20 text-indigo-100 border border-indigo-500/30">
                      {tag}
                    </span>
                  ))}
                  <span className="px-4 py-1.5 text-sm font-bold rounded-full bg-fuchsia-500/20 text-fuchsia-200 border border-fuchsia-500/30 w-full sm:w-auto mt-3 sm:mt-0">
                    {selectedRecipe.macros}
                  </span>
                </motion.div>

                <div className="prose prose-invert prose-lg prose-indigo max-w-none relative z-10 mt-10">
                  <div className="bg-black/20 p-8 md:p-10 rounded-2xl border border-white/5 shadow-inner">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
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
