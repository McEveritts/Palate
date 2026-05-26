"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, Utensils, CupSoda, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface VaultFiltersProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  activeCategory: 'all' | 'mains' | 'sides' | 'appetizers' | 'desserts' | 'beverages' | 'smoothies';
  setActiveCategory: (c: 'all' | 'mains' | 'sides' | 'appetizers' | 'desserts' | 'beverages' | 'smoothies') => void;
}

export function VaultFilters({ searchQuery, setSearchQuery, activeCategory, setActiveCategory }: VaultFiltersProps) {
  const [openDropdown, setOpenDropdown] = useState<'foods' | 'beverages' | null>(null);
  
  const foodsRef = useRef<HTMLDivElement>(null);
  const beveragesRef = useRef<HTMLDivElement>(null);

  // Click outside to close dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        openDropdown === 'foods' && 
        foodsRef.current && 
        !foodsRef.current.contains(event.target as Node)
      ) {
        setOpenDropdown(null);
      }
      if (
        openDropdown === 'beverages' && 
        beveragesRef.current && 
        !beveragesRef.current.contains(event.target as Node)
      ) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openDropdown]);

  const foodCategories = [
    { value: 'mains', label: 'Mains' },
    { value: 'sides', label: 'Sides' },
    { value: 'appetizers', label: 'Appetizers' },
    { value: 'desserts', label: 'Desserts' }
  ] as const;

  const beverageCategories = [
    { value: 'beverages', label: 'All Beverages' },
    { value: 'smoothies', label: 'Smoothies Only' }
  ] as const;

  const isFoodActive = ['mains', 'sides', 'appetizers', 'desserts'].includes(activeCategory);
  const isBeverageActive = ['beverages', 'smoothies'].includes(activeCategory);

  // Get display name for active subcategory
  const getActiveFoodLabel = () => {
    const match = foodCategories.find(c => c.value === activeCategory);
    return match ? `Food: ${match.label}` : 'Food Collections';
  };

  const getActiveBeverageLabel = () => {
    const match = beverageCategories.find(c => c.value === activeCategory);
    return match ? `Beverage: ${match.label.replace(' Only', '')}` : 'Beverages & Smoothies';
  };

  return (
    <div className="flex flex-col md:flex-row gap-4 mb-8 relative z-30">
      {/* Search Input Box */}
      <div className="relative flex-1">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-indigo-400/50" />
        </div>
        <input
          type="text"
          className="glass-input block w-full pl-11 pr-4 py-3 text-white placeholder-indigo-200/40 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50 rounded-2xl bg-slate-900/30 backdrop-blur-xl border border-white/10"
          placeholder="Search recipes, tags, or ingredients..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Premium Dropdown Category Selectors */}
      <div className="flex bg-slate-950/60 p-1.5 rounded-2xl border border-white/10 backdrop-blur-xl shrink-0 gap-1.5 items-center select-none shadow-[0_8px_32px_0_rgba(0,0,0,0.5)]">
        {/* Tab 1: All */}
        <button
          onClick={() => {
            setActiveCategory('all');
            setOpenDropdown(null);
          }}
          className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-1.5 cursor-pointer ${
            activeCategory === 'all'
              ? 'bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow-[0_0_15px_rgba(168,85,247,0.4)] border border-transparent'
              : 'text-indigo-200/60 hover:text-white hover:bg-white/5 border border-transparent'
          }`}
        >
          <Filter className="w-4 h-4" />
          All Recipes
        </button>

        {/* Tab 2: Foods Dropdown */}
        <div ref={foodsRef} className="relative">
          <button
            onClick={() => setOpenDropdown(openDropdown === 'foods' ? null : 'foods')}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2 cursor-pointer border ${
              isFoodActive
                ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300 shadow-[0_0_12px_rgba(99,102,241,0.2)]'
                : openDropdown === 'foods'
                  ? 'border-white/20 text-white bg-white/5'
                  : 'border-transparent text-indigo-200/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <Utensils className="w-4 h-4" />
            <span>{getActiveFoodLabel()}</span>
            <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${openDropdown === 'foods' ? 'rotate-180 text-white' : 'text-indigo-400/50'}`} />
          </button>

          <AnimatePresence>
            {openDropdown === 'foods' && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="absolute left-0 mt-2 w-48 rounded-2xl bg-slate-950/90 backdrop-blur-3xl border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.1)] p-1.5 z-50"
              >
                {foodCategories.map((cat) => (
                  <button
                    key={cat.value}
                    onClick={() => {
                      setActiveCategory(cat.value);
                      setOpenDropdown(null);
                    }}
                    className={`w-full text-left px-4 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer ${
                      activeCategory === cat.value
                        ? 'bg-gradient-to-r from-indigo-500/30 to-fuchsia-500/30 text-indigo-200 border border-indigo-500/20'
                        : 'text-indigo-200/60 hover:text-white hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Tab 3: Beverages & Smoothies Dropdown */}
        <div ref={beveragesRef} className="relative">
          <button
            onClick={() => setOpenDropdown(openDropdown === 'beverages' ? null : 'beverages')}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2 cursor-pointer border ${
              isBeverageActive
                ? 'bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-300 shadow-[0_0_12px_rgba(217,70,239,0.2)]'
                : openDropdown === 'beverages'
                  ? 'border-white/20 text-white bg-white/5'
                  : 'border-transparent text-indigo-200/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <CupSoda className="w-4 h-4" />
            <span>{getActiveBeverageLabel()}</span>
            <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${openDropdown === 'beverages' ? 'rotate-180 text-white' : 'text-fuchsia-400/50'}`} />
          </button>

          <AnimatePresence>
            {openDropdown === 'beverages' && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="absolute right-0 md:left-0 mt-2 w-48 rounded-2xl bg-slate-950/90 backdrop-blur-3xl border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.1)] p-1.5 z-50"
              >
                {beverageCategories.map((cat) => (
                  <button
                    key={cat.value}
                    onClick={() => {
                      setActiveCategory(cat.value);
                      setOpenDropdown(null);
                    }}
                    className={`w-full text-left px-4 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer ${
                      activeCategory === cat.value
                        ? 'bg-gradient-to-r from-indigo-500/30 to-fuchsia-500/30 text-fuchsia-200 border border-fuchsia-500/20'
                        : 'text-indigo-200/60 hover:text-white hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
