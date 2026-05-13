"use client";

import React from 'react';
import { Search } from 'lucide-react';

interface VaultFiltersProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  activeCategory: 'all' | 'mains' | 'sides';
  setActiveCategory: (c: 'all' | 'mains' | 'sides') => void;
}

export function VaultFilters({ searchQuery, setSearchQuery, activeCategory, setActiveCategory }: VaultFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 mb-8">
      <div className="relative flex-1">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-indigo-400/50" />
        </div>
        <input
          type="text"
          className="block w-full pl-10 pr-3 py-3 border border-white/10 rounded-xl bg-black/40 text-white placeholder-indigo-200/50 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50 backdrop-blur-xl transition-all"
          placeholder="Search recipes, tags, or ingredients..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      <div className="flex bg-black/40 p-1 rounded-xl border border-white/10 backdrop-blur-xl shrink-0">
        {(['all', 'mains', 'sides'] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={\`px-6 py-2 rounded-lg text-sm font-medium transition-all \${
              activeCategory === cat 
                ? 'bg-gradient-to-r from-indigo-500/80 to-fuchsia-500/80 text-white shadow-[0_0_15px_rgba(168,85,247,0.4)]' 
                : 'text-indigo-200/70 hover:text-white hover:bg-white/5'
            }\`}
          >
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}
