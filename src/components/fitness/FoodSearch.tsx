'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Plus, Utensils, Loader2, Check } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface FoodResult {
  id: string;
  name: string;
  brand?: string;
  source: 'usda' | 'openfoodfacts' | 'cache' | 'sage';
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  servingSize?: string;
  confidence?: 'high' | 'medium' | 'low';
  description?: string;
}

export interface FoodSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onFoodSelected?: (food: { name: string; calories: number; protein: number; carbs: number; fat: number; source: string }) => void;
}

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const;
const MEAL_COLORS: Record<string, string> = {
  Breakfast: 'text-amber-400 border-amber-400/30 bg-amber-500/10',
  Lunch: 'text-emerald-400 border-emerald-400/30 bg-emerald-500/10',
  Dinner: 'text-fuchsia-400 border-fuchsia-400/30 bg-fuchsia-500/10',
  Snack: 'text-indigo-400 border-indigo-400/30 bg-indigo-500/10',
};

const SOURCE_BADGES: Record<string, { label: string; className: string }> = {
  usda: { label: 'USDA', className: 'text-emerald-300 bg-emerald-500/15 border-emerald-400/20' },
  cache: { label: 'Cached', className: 'text-indigo-300 bg-indigo-500/15 border-indigo-400/20' },
  openfoodfacts: { label: 'OFF', className: 'text-amber-300 bg-amber-500/15 border-amber-400/20' },
  sage: { label: '🌿 Sage', className: 'text-emerald-200 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border-emerald-400/30' },
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function FoodSearch({ isOpen, onClose, onFoodSelected }: FoodSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectingMealFor, setSelectingMealFor] = useState<FoodResult | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up debounce timer on unmount
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  // Reset on close
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
      setError(null);
      setSelectingMealFor(null);
      setAddedId(null);
    }
  }, [isOpen]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Debounced search
  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    setError(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/food-search?q=${encodeURIComponent(q.trim())}`);
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        setResults(data.results || []);
      } catch {
        setError('Failed to search. Please try again.');
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 500);
  }, []);

  // Log food to diary
  const handleAddFood = useCallback(async (food: FoodResult, mealType: string) => {
    try {
      const res = await fetch('/api/diary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealType,
          customFoodName: food.name,
          amountConsumed: 100,
          calories: food.calories,
          protein: food.protein,
          carbs: food.carbs,
          fat: food.fat,
          fiber: food.fiber ?? 0,
          sugar: food.sugar ?? 0,
          sodium: food.sodium ?? 0,
        }),
      });

      if (!res.ok) throw new Error('Failed to log food');

      setAddedId(food.id);
      setSelectingMealFor(null);
      onFoodSelected?.({ name: food.name, calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat, source: food.source });

      setTimeout(() => setAddedId(null), 2000);
    } catch (err) {
      console.error('[FoodSearch] Log error:', err);
    }
  }, [onFoodSelected]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="food-search-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Card */}
          <motion.div
            className="relative w-full max-w-lg max-h-[80vh] overflow-hidden rounded-3xl border border-white/10 border-t-white/20 bg-slate-900/40 backdrop-blur-3xl shadow-[0_0_40px_rgba(139,92,246,0.15)] flex flex-col"
            initial={{ scale: 0.9, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 24 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          >
            {/* Orbs */}
            <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-indigo-500/30 blur-[80px]" />
            <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-fuchsia-500/20 blur-[80px]" />

            {/* Header */}
            <div className="relative z-10 flex items-center justify-between p-6 pb-0">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
                  <Search className="h-5 w-5" />
                </div>
                <h2 className="text-lg font-semibold text-white/90">Search Foods</h2>
              </div>
              <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-white/40 hover:bg-white/10 hover:text-white/70 transition-colors" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative z-10 px-6 pt-4">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search for a food (e.g., chicken breast)..."
                  autoFocus
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 pl-11 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-indigo-400/50 focus:bg-black/50"
                />
              </div>
            </div>

            {/* Results */}
            <div className="relative z-10 flex-1 overflow-y-auto px-6 py-4 space-y-2 scrollbar-thin">
              {loading && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="h-6 w-6 text-indigo-400 animate-spin" />
                  <p className="text-sm text-slate-400 animate-pulse">Searching databases...</p>
                  <p className="text-[10px] text-slate-500">🌿 Sage will estimate if no matches are found</p>
                </div>
              )}

              {error && (
                <div className="text-center py-8 text-sm text-rose-400">{error}</div>
              )}

              {!loading && !error && results.length === 0 && query.length >= 2 && (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Utensils className="h-8 w-8 text-slate-600" />
                  <p className="text-sm text-slate-400">No results found.</p>
                  <p className="text-xs text-slate-500">Try a different search term.</p>
                </div>
              )}

              {results.map((food) => {
                const badge = SOURCE_BADGES[food.source] || SOURCE_BADGES.usda;
                const isAdded = addedId === food.id;

                return (
                  <motion.div
                    key={food.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between p-4 rounded-xl bg-slate-900/40 backdrop-blur-xl border border-white/5 hover:border-white/10 transition-colors group"
                  >
                    <div className="flex-1 min-w-0 mr-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-slate-200 truncate">{food.name}</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${badge.className}`}>
                          {badge.label}
                        </span>
                        {food.confidence && (
                          <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${
                            food.confidence === 'high' ? 'text-emerald-400 bg-emerald-500/10' :
                            food.confidence === 'medium' ? 'text-amber-400 bg-amber-500/10' :
                            'text-slate-400 bg-slate-500/10'
                          }`}>
                            {food.confidence}
                          </span>
                        )}
                      </div>
                      {food.brand && <span className="text-[10px] text-slate-500">{food.brand}</span>}
                      {food.source === 'sage' && food.description && (
                        <p className="text-[10px] text-slate-400 mt-0.5 truncate">{food.description}</p>
                      )}
                      {food.source === 'sage' && (
                        <span className="text-[9px] text-emerald-500/70 italic">AI Estimated</span>
                      )}
                      <div className="flex items-center gap-3 text-[11px] mt-1">
                        <span className="text-indigo-300 font-medium">{food.protein.toFixed(2)}g P</span>
                        <span className="text-fuchsia-300 font-medium">{food.carbs.toFixed(2)}g C</span>
                        <span className="text-amber-300 font-medium">{food.fat.toFixed(2)}g F</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-sm font-semibold text-white">{food.calories.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                        <span className="text-[10px] text-slate-500 ml-0.5">kcal</span>
                      </div>

                      {isAdded ? (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                          <Check className="h-4 w-4" />
                        </div>
                      ) : (
                        <button
                          onClick={() => setSelectingMealFor(food)}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 hover:shadow-[0_0_12px_rgba(139,92,246,0.3)] transition-all"
                          aria-label={`Add ${food.name}`}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Meal Type Selector */}
            <AnimatePresence>
              {selectingMealFor && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="relative z-20 border-t border-white/10 bg-slate-900/80 backdrop-blur-3xl p-4"
                >
                  <p className="text-xs text-slate-400 mb-3 text-center">
                    Log <span className="text-white font-medium">{selectingMealFor.name}</span> as:
                  </p>
                  <div className="flex justify-center gap-2">
                    {MEAL_TYPES.map((mt) => (
                      <button
                        key={mt}
                        onClick={() => handleAddFood(selectingMealFor, mt)}
                        className={`px-4 py-2 rounded-xl text-xs font-medium border transition-all hover:brightness-125 ${MEAL_COLORS[mt]}`}
                      >
                        {mt}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
