"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VaultFilters } from './VaultFilters';
import { VaultRecipe } from '@/lib/vaultParser';
import { X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface VaultGridProps {
  initialRecipes: VaultRecipe[];
}

export function VaultGrid({ initialRecipes }: VaultGridProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<'all' | 'mains' | 'sides'>('all');
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

  const filteredRecipes = useMemo(() => {
    return initialRecipes.filter(recipe => {
      const matchesCategory = activeCategory === 'all' || recipe.category === activeCategory;
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery || 
        recipe.title.toLowerCase().includes(searchLower) ||
        recipe.tags.some(t => t.toLowerCase().includes(searchLower));
      
      return matchesCategory && matchesSearch;
    });
  }, [initialRecipes, searchQuery, activeCategory]);

  const selectedRecipe = initialRecipes.find(r => r.id === selectedId);

  return (
    <div className="w-full relative">
      <VaultFilters 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        activeCategory={activeCategory}
        setActiveCategory={setActiveCategory}
      />

      <motion.div 
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        animate={{ opacity: selectedId ? 0.3 : 1, filter: selectedId ? "blur(8px)" : "blur(0px)" }}
        transition={{ duration: 0.3 }}
      >
        <AnimatePresence>
          {filteredRecipes.map((recipe) => (
            <motion.div
              layoutId={`card-${recipe.id}`}
              key={recipe.id}
              onClick={() => setSelectedId(recipe.id)}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="cursor-pointer group relative overflow-hidden rounded-2xl bg-slate-900/40 border border-white/10 backdrop-blur-2xl p-6 shadow-xl hover:shadow-[0_0_30px_rgba(139,92,246,0.3)] transition-all duration-300"
            >
              {/* Abstract Background Element */}
              <div className="absolute -top-20 -right-20 w-40 h-40 bg-fuchsia-500/20 rounded-full blur-3xl group-hover:bg-fuchsia-500/40 transition-all duration-500"></div>
              
              <motion.h3 layoutId={`title-${recipe.id}`} className="text-2xl font-bold text-white mb-2 z-10 relative">
                {recipe.title}
              </motion.h3>
              
              <div className="grid grid-cols-1 grid-rows-1 mb-6 z-10">
                <motion.div layoutId={`tags-${recipe.id}`} className="col-start-1 row-start-1">
                  <div className="flex flex-wrap items-start content-start gap-2 transition-all duration-300 group-hover:opacity-0 group-hover:-translate-y-4">
                    {recipe.tags.map(tag => (
                      <span key={tag} className="px-2 py-1 text-xs rounded bg-indigo-500/20 text-indigo-200 border border-indigo-500/30">
                        {tag}
                      </span>
                    ))}
                  </div>
                </motion.div>

                {/* Hover Macros */}
                <div className="col-start-1 row-start-1 flex flex-wrap items-start content-start gap-2 opacity-0 translate-y-4 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none">
                  {recipe.macros ? (
                    recipe.macros.split('|').map((macro, idx) => (
                      <span key={idx} className="px-2 py-1 text-xs font-medium rounded bg-fuchsia-500/20 text-fuchsia-200 border border-fuchsia-500/30 shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
                        {macro.trim()}
                      </span>
                    ))
                  ) : (
                    <span className="px-2 py-1 text-xs font-medium rounded bg-fuchsia-500/20 text-fuchsia-200 border border-fuchsia-500/30 shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
                      Macros not calculated
                    </span>
                  )}
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
            {/* Click-away backdrop */}
            <div 
              className="absolute inset-0 pointer-events-auto" 
              onClick={() => setSelectedId(null)}
            />
            
            <motion.div
              layoutId={`card-${selectedId}`}
              className="w-full max-w-3xl max-h-[85vh] flex flex-col bg-slate-900/80 border border-white/20 backdrop-blur-3xl rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5)] pointer-events-auto relative z-10 overflow-hidden"
            >
              {/* Close Button - fixed to top right of modal, outside scroll container */}
              <div className="absolute top-0 right-0 p-6 z-20 bg-gradient-to-bl from-slate-900/80 to-transparent rounded-tr-3xl pointer-events-none">
                <button 
                  onClick={() => setSelectedId(null)}
                  className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors pointer-events-auto"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-8 md:p-12 relative overflow-y-auto custom-scrollbar flex-1">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150%] h-64 bg-gradient-to-b from-indigo-500/20 to-transparent rounded-full blur-3xl pointer-events-none"></div>
                
                <motion.h3 layoutId={`title-${selectedId}`} className="text-4xl md:text-5xl font-bold text-white mb-4 pr-12 relative z-10">
                  {selectedRecipe.title}
                </motion.h3>
                
                <motion.div layoutId={`tags-${selectedId}`} className="flex flex-wrap items-center gap-2 mb-8 relative z-10">
                  {selectedRecipe.tags.map(tag => (
                    <span key={tag} className="px-3 py-1 text-sm rounded-full bg-indigo-500/30 text-indigo-100 border border-indigo-500/50 shadow-[0_0_10px_rgba(99,102,241,0.2)]">
                      {tag}
                    </span>
                  ))}
                  <span className="px-3 py-1 text-sm rounded-full bg-fuchsia-500/20 text-fuchsia-200 border border-fuchsia-500/30 font-medium w-full sm:w-auto mt-2 sm:mt-0">
                    {selectedRecipe.macros}
                  </span>
                </motion.div>

                <div className="prose prose-invert prose-indigo max-w-none relative z-10 mt-8">
                  <div className="bg-black/30 p-6 rounded-xl border border-white/5">
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
