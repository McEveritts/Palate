"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, RefreshCw, AlertCircle, ShieldAlert } from 'lucide-react';
import { extractMacrosFromString } from '../../lib/parser';

interface RecipeNutritionDetailsProps {
  recipeId: string;
  recipeTitle: string;
  initialMacros: string;
}

interface MacroProfile {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  isEstimated: boolean;
}

function parseMacros(macroStr: string): MacroProfile | null {
  if (!macroStr) return null;
  const parsed = extractMacrosFromString(macroStr);
  if (parsed.calories === 0 && parsed.protein === 0 && parsed.carbs === 0 && parsed.fat === 0) {
    return null;
  }
  return parsed;
}

export function RecipeNutritionDetails({ recipeId, recipeTitle, initialMacros }: RecipeNutritionDetailsProps) {
  const [macros, setMacros] = useState<MacroProfile | null>(() => parseMacros(initialMacros));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUSDANutrition = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/nutrition?ingredient=${encodeURIComponent(recipeTitle)}`);
      const result = await response.json();
      
      if (result.success && result.data) {
        const { calories, protein, carbs, fat } = result.data;
        setMacros({
          calories: Math.round(parseFloat(calories)),
          protein: Math.round(parseFloat(protein)),
          carbs: Math.round(parseFloat(carbs)),
          fat: Math.round(parseFloat(fat)),
          isEstimated: false
        });
      } else {
        setError(result.error || `Could not resolve USDA nutrition data.`);
      }
    } catch (err) {
      setError("Network error. Unable to fetch USDA data.");
    } finally {
      setIsLoading(false);
    }
  };

  const hasNoMacros = !macros || (macros.calories === 0 && macros.protein === 0 && macros.carbs === 0 && macros.fat === 0);

  // L5 Fix: Use a ref to track whether auto-fetch has been attempted,
  // preventing infinite re-renders from state dependencies.
  const autoFetchAttempted = React.useRef(false);
  React.useEffect(() => {
    autoFetchAttempted.current = false;
  }, [recipeId, recipeTitle]);
  React.useEffect(() => {
    if (!autoFetchAttempted.current && hasNoMacros && !isLoading && !error) {
      autoFetchAttempted.current = true;
      fetchUSDANutrition();
    }
  }, [recipeId, recipeTitle, hasNoMacros, isLoading, error]);

  return (
    <div className="w-full bg-slate-950/40 border border-white/5 rounded-2xl p-6 relative overflow-hidden backdrop-blur-xl">
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="flex items-center justify-between mb-4 relative z-10">
        <h4 className="text-sm font-bold text-slate-300 tracking-wider uppercase flex items-center gap-2">
          <span>📊 Nutritional Profile</span>
          {macros?.isEstimated && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-bold uppercase animate-pulse">
              Estimated
            </span>
          )}
        </h4>
        
        <button
          onClick={fetchUSDANutrition}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-full bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-200 transition-all font-medium disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
          <span>{isLoading ? 'Syncing...' : 'Sync USDA'}</span>
        </button>
      </div>

      <AnimatePresence mode="wait">
        {isLoading ? (
          // Glowing Framer Motion Skeleton Placeholder
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="h-6 w-24 bg-white/5 rounded-lg animate-pulse border border-white/5"></div>
              <div className="h-8 w-20 bg-white/5 rounded-lg animate-pulse border border-white/5"></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse border border-white/5 flex flex-col justify-center p-3">
                  <div className="h-3 w-10 bg-white/10 rounded mb-2"></div>
                  <div className="h-5 w-16 bg-white/10 rounded"></div>
                </div>
              ))}
            </div>
            <div className="relative w-full h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
              <motion.div 
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-indigo-500 w-1/3"
                animate={{ x: ['-100%', '300%'] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
              />
            </div>
          </motion.div>
        ) : error ? (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm"
          >
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
            <div className="flex-1">
              <p className="font-semibold">USDA Fetch Failed</p>
              <p className="text-xs text-rose-300/80 mt-1">{error}</p>
            </div>
          </motion.div>
        ) : hasNoMacros ? (
          <motion.div
            key="no-macros"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center p-6 text-center rounded-xl bg-slate-900/40 border border-white/5 text-slate-400 text-sm"
          >
            <ShieldAlert className="w-8 h-8 text-slate-500 mb-2" />
            <p className="font-medium text-slate-300">No Macro Data Available</p>
            <p className="text-xs text-slate-500 mt-1 mb-4">USDA data has not been retrieved for this recipe.</p>
            <button
              onClick={fetchUSDANutrition}
              className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-indigo-500 to-fuchsia-500 hover:from-indigo-600 hover:to-fuchsia-600 rounded-full text-white font-bold text-xs shadow-lg shadow-indigo-500/20"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Query USDA Database</span>
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="profile"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            {/* Calories Banner */}
            <div className="flex items-end justify-between border-b border-white/5 pb-3">
              <div>
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Energy Yield</span>
                <div className="text-4xl font-extrabold text-white tracking-tight drop-shadow-[0_0_10px_rgba(255,255,255,0.1)]">
                  {macros.calories} <span className="text-lg font-medium text-slate-400">kcal</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs text-indigo-400 font-bold uppercase bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                  Per 100g
                </span>
              </div>
            </div>

            {/* Protein, Carbs, Fat Grid */}
            <div className="grid grid-cols-3 gap-3">
              {/* Protein */}
              <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-3 flex flex-col">
                <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">Protein</span>
                <span className="text-2xl font-black text-emerald-400 mt-1">{macros.protein}g</span>
              </div>

              {/* Carbs */}
              <div className="bg-sky-500/5 border border-sky-500/10 rounded-xl p-3 flex flex-col">
                <span className="text-[10px] text-sky-400 font-semibold uppercase tracking-wider">Carbs</span>
                <span className="text-2xl font-black text-sky-400 mt-1">{macros.carbs}g</span>
              </div>

              {/* Fat */}
              <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-3 flex flex-col">
                <span className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider">Fat</span>
                <span className="text-2xl font-black text-amber-400 mt-1">{macros.fat}g</span>
              </div>
            </div>

            {/* Micro progress bar ratio */}
            {(() => {
              const total = (macros.protein + macros.carbs + macros.fat) || 1;
              const proPct = (macros.protein / total) * 100;
              const carbPct = (macros.carbs / total) * 100;
              const fatPct = (macros.fat / total) * 100;
              return (
                <div className="w-full">
                  <div className="flex justify-between text-[10px] text-slate-500 font-semibold mb-1">
                    <span>Macro Split Ratio</span>
                    <span className="text-slate-400">{Math.round(proPct)}% P / {Math.round(carbPct)}% C / {Math.round(fatPct)}% F</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden flex border border-white/5">
                    <div style={{ width: `${proPct}%` }} className="bg-emerald-400 h-full"></div>
                    <div style={{ width: `${carbPct}%` }} className="bg-sky-400 h-full"></div>
                    <div style={{ width: `${fatPct}%` }} className="bg-amber-400 h-full"></div>
                  </div>
                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
