"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VaultRecipe } from '@/lib/vaultParser';
import { X, Save, Eye, Code } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

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

  // Sort descending by date (newest first)
  const sortedRecipes = [...initialRecipes].sort((a, b) => {
    if (a.date && b.date) {
      return b.date.localeCompare(a.date);
    }
    return 0; // Fallback
  });

  return (
    <div className="w-full flex flex-col gap-12 relative pl-8 md:pl-12">
      {/* Central continuous vertical timeline line */}
      <div className="absolute left-3.5 md:left-5 top-2 bottom-2 w-px bg-gradient-to-b from-indigo-500 via-fuchsia-500 to-indigo-950/20" />
      
      {sortedRecipes.map((recipe) => {
        // Date formatting
        let formattedDate = "";
        if (recipe.date) {
          const dateObj = new Date(recipe.date + "T12:00:00"); // Avoid timezone shift
          formattedDate = dateObj.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });
        }

        // Determine if it's a Side or Main based on tags
        const isSide = recipe.tags.some(tag => tag.toLowerCase().includes('side'));
        
        return (
          <div key={recipe.id} className="relative group">
            {/* Timeline Node Orb */}
            <div className="absolute left-[-26px] md:left-[-36px] top-6 -translate-x-1/2 w-5 h-5 rounded-full bg-slate-950 border-[3px] border-indigo-400 shadow-[0_0_12px_rgba(129,140,248,0.6)] group-hover:scale-125 group-hover:border-fuchsia-400 group-hover:shadow-[0_0_20px_rgba(240,171,252,0.8)] transition-all duration-300 z-10 flex items-center justify-center" />
            
            <div className="flex flex-col gap-3">
              {/* Date Header Node */}
              <div className="flex items-center gap-2 pl-1">
                <span className="text-xs md:text-sm font-black uppercase tracking-widest text-indigo-400 group-hover:text-fuchsia-300 transition-colors">
                  {formattedDate || recipe.date || "Past Curation"}
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                <span className={`text-[9px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded border ${
                  isSide 
                    ? 'text-indigo-300 bg-indigo-500/10 border-indigo-500/20' 
                    : 'text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/20'
                }`}>
                  {isSide ? 'Side Dish' : 'Main Dish'}
                </span>
              </div>

              {/* CARD COMPONENT */}
              <motion.div
                layoutId={`archive-card-${recipe.id}`}
                onClick={() => setSelectedId(recipe.id)}
                className="cursor-pointer relative overflow-hidden rounded-2xl bg-slate-900/30 hover:bg-slate-900/20 backdrop-blur-3xl border border-white/5 hover:border-white/10 hover:shadow-[0_0_40px_rgba(99,102,241,0.1)] transition-all duration-300 p-6 md:p-8 flex flex-col justify-between min-h-[140px]"
              >
                {/* Specular glows inside cards */}
                <div className="absolute -top-24 -right-24 w-64 h-64 bg-[radial-gradient(circle,rgba(99,102,241,0.06)_0%,transparent_70%)] rounded-full blur-2xl group-hover:bg-[radial-gradient(circle,rgba(240,171,252,0.08)_0%,transparent_70%)] transition-all duration-500 pointer-events-none" />
                
                <div className="relative z-10 w-full flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <motion.h3 
                      layoutId={`archive-title-${recipe.id}`} 
                      className="text-xl md:text-2xl font-black text-white group-hover:text-indigo-300 transition-colors tracking-tight leading-snug"
                    >
                      {recipe.title}
                    </motion.h3>
                    <p className="text-slate-400 text-xs mt-2 line-clamp-2 md:line-clamp-1 max-w-3xl font-medium">
                      {recipe.content.replace(/^#\s+.*$/m, '').replace(/^[*\-#\s[\]x]*\s*/gm, ' ').slice(0, 140).trim()}...
                    </p>
                  </div>
                  
                  {/* Macros Badge */}
                  <div className="shrink-0 flex items-center">
                    <span className="px-3.5 py-1.5 text-xs font-bold rounded-full bg-slate-950/60 text-slate-300 border border-white/5 group-hover:border-white/10 group-hover:text-white transition-all shadow-inner">
                      {recipe.macros}
                    </span>
                  </div>
                </div>
              </motion.div>
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
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
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
