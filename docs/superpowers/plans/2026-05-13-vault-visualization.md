# Vault Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a visual, interactive representation of the local markdown recipe vault using a fluid masonry layout with shared element transitions.

**Architecture:** We will build a server action to parse the vault's Markdown files (using `gray-matter`) and extract lightweight metadata (title, tags, macros). This data will feed into a client-side Masonry Grid. We will use Framer Motion's `layoutId` to create a seamless "expand in-place" animation when a recipe card is clicked, revealing the full recipe content in a glassmorphic modal.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Framer Motion 12, gray-matter.

---

### Task 1: Vault Parser Server Action

**Files:**
- Create: `src/lib/vaultParser.ts`
- Create: `src/lib/vaultParser.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/vaultParser.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getVaultRecipes } from './vaultParser';
import fs from 'fs/promises';

vi.mock('fs/promises');

describe('vaultParser', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should parse recipes from mains and sides directories', async () => {
    vi.mocked(fs.readdir).mockImplementation(async (dir) => {
      if (dir.toString().includes('mains')) return ['test-main.md'] as any;
      if (dir.toString().includes('sides')) return ['test-side.md'] as any;
      return [];
    });
    
    vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
      if (filePath.toString().includes('test-main.md')) {
        return `---\nrecipe: 'Main Dish'\ntags: ['dinner']\nmacros: 'Calories: 500'\n---\n# Content`;
      }
      return `---\nrecipe: 'Side Dish'\ntags: ['lunch']\nmacros: 'Calories: 200'\n---\n# Content`;
    });

    const recipes = await getVaultRecipes();
    expect(recipes).toHaveLength(2);
    expect(recipes[0].title).toBe('Main Dish');
    expect(recipes[0].category).toBe('mains');
    expect(recipes[1].title).toBe('Side Dish');
    expect(recipes[1].category).toBe('sides');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/vaultParser.test.ts`
Expected: FAIL with "getVaultRecipes is not defined" or similar.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/vaultParser.ts
"use server";

import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

export interface VaultRecipe {
  id: string;
  title: string;
  category: 'mains' | 'sides';
  tags: string[];
  macros: string;
  content: string;
}

export async function getVaultRecipes(): Promise<VaultRecipe[]> {
  const categories: ('mains' | 'sides')[] = ['mains', 'sides'];
  const allRecipes: VaultRecipe[] = [];

  for (const category of categories) {
    const dirPath = path.join(process.cwd(), 'vault', category);
    try {
      const files = await fs.readdir(dirPath);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        
        const filePath = path.join(dirPath, file);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const { data, content } = matter(fileContent);
        
        let tags: string[] = [];
        if (data.tags) {
           tags = Array.isArray(data.tags) ? data.tags : data.tags.split(',').map((t: string) => t.trim());
        }

        allRecipes.push({
          id: `${category}-${file.replace('.md', '')}`,
          title: data.recipe || data.title || file.replace('.md', ''),
          category,
          tags,
          macros: data.macros || '',
          content: content.trim()
        });
      }
    } catch (error) {
      console.warn(`Could not read directory ${dirPath}`);
    }
  }

  return allRecipes;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/vaultParser.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/vaultParser.ts src/lib/vaultParser.test.ts
git commit -m "feat(vault): add server action to parse vault recipes"
```

### Task 2: Filter Bar Component

**Files:**
- Create: `src/components/vault/VaultFilters.tsx`

- [ ] **Step 1: Write implementation**

```tsx
// src/components/vault/VaultFilters.tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/vault/VaultFilters.tsx
git commit -m "feat(vault): add VaultFilters component"
```

### Task 3: Vault Grid & Recipe Card Components

**Files:**
- Create: `src/components/vault/VaultGrid.tsx`

- [ ] **Step 1: Write implementation**

```tsx
// src/components/vault/VaultGrid.tsx
"use client";

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VaultFilters } from './VaultFilters';
import { VaultRecipe } from '@/lib/vaultParser';
import { X } from 'lucide-react';

interface VaultGridProps {
  initialRecipes: VaultRecipe[];
}

export function VaultGrid({ initialRecipes }: VaultGridProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<'all' | 'mains' | 'sides'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
              layoutId={\`card-\${recipe.id}\`}
              key={recipe.id}
              onClick={() => setSelectedId(recipe.id)}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="cursor-pointer group relative overflow-hidden rounded-2xl bg-slate-900/40 border border-white/10 backdrop-blur-2xl p-6 shadow-xl hover:shadow-[0_0_30px_rgba(139,92,246,0.3)] transition-all duration-300"
            >
              {/* Abstract Background Element */}
              <div className="absolute -top-20 -right-20 w-40 h-40 bg-fuchsia-500/20 rounded-full blur-3xl group-hover:bg-fuchsia-500/40 transition-all duration-500"></div>
              
              <motion.h3 layoutId={\`title-\${recipe.id}\`} className="text-2xl font-bold text-white mb-2 z-10 relative">
                {recipe.title}
              </motion.h3>
              
              <motion.div layoutId={\`tags-\${recipe.id}\`} className="flex flex-wrap gap-2 mb-6 z-10 relative">
                {recipe.tags.map(tag => (
                  <span key={tag} className="px-2 py-1 text-xs rounded bg-indigo-500/20 text-indigo-200 border border-indigo-500/30">
                    {tag}
                  </span>
                ))}
              </motion.div>

              {/* Hover Macros */}
              <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-slate-950 to-transparent translate-y-full group-hover:translate-y-0 transition-transform duration-300 z-10">
                <p className="text-sm text-fuchsia-200/80 font-medium">{recipe.macros || "Macros not calculated"}</p>
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
              layoutId={\`card-\${selectedId}\`}
              className="w-full max-w-3xl max-h-[85vh] overflow-y-auto bg-slate-900/80 border border-white/20 backdrop-blur-3xl rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5)] pointer-events-auto relative z-10 custom-scrollbar"
            >
              <button 
                onClick={() => setSelectedId(null)}
                className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors z-20"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="p-8 md:p-12 relative overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150%] h-64 bg-gradient-to-b from-indigo-500/20 to-transparent rounded-full blur-3xl pointer-events-none"></div>
                
                <motion.h3 layoutId={\`title-\${selectedId}\`} className="text-4xl md:text-5xl font-bold text-white mb-4 relative z-10">
                  {selectedRecipe.title}
                </motion.h3>
                
                <motion.div layoutId={\`tags-\${selectedId}\`} className="flex flex-wrap gap-2 mb-8 relative z-10">
                  {selectedRecipe.tags.map(tag => (
                    <span key={tag} className="px-3 py-1 text-sm rounded-full bg-indigo-500/30 text-indigo-100 border border-indigo-500/50 shadow-[0_0_10px_rgba(99,102,241,0.2)]">
                      {tag}
                    </span>
                  ))}
                  <span className="px-3 py-1 text-sm rounded-full bg-fuchsia-500/20 text-fuchsia-200 border border-fuchsia-500/30 ml-auto font-medium">
                    {selectedRecipe.macros}
                  </span>
                </motion.div>

                <div className="prose prose-invert prose-indigo max-w-none relative z-10 mt-8">
                  {/* Basic markdown rendering. For full markdown support, we'd add react-markdown, but pre-rendering the text block is sufficient for the plan */}
                  <div className="whitespace-pre-wrap font-mono text-sm bg-black/30 p-6 rounded-xl border border-white/5">
                    {selectedRecipe.content}
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/vault/VaultGrid.tsx
git commit -m "feat(vault): add VaultGrid with shared element transitions"
```

### Task 4: Vault Page Integration

**Files:**
- Create: `src/app/vault/page.tsx`

- [ ] **Step 1: Write implementation**

```tsx
// src/app/vault/page.tsx
import React from 'react';
import { getVaultRecipes } from '@/lib/vaultParser';
import { VaultGrid } from '@/components/vault/VaultGrid';

export default async function VaultPage() {
  const recipes = await getVaultRecipes();

  return (
    <main className="min-h-screen p-8 md:p-16 relative overflow-hidden">
      {/* Background Elements */}
      <div className="fixed top-0 left-0 w-[800px] h-[800px] bg-indigo-900/20 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
      <div className="fixed bottom-0 right-0 w-[600px] h-[600px] bg-fuchsia-900/10 rounded-full blur-[100px] translate-x-1/3 translate-y-1/3 pointer-events-none"></div>
      
      <div className="max-w-7xl mx-auto relative z-10">
        <header className="mb-12">
          <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-white to-fuchsia-300 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] mb-4">
            Recipe Vault
          </h1>
          <p className="text-indigo-200/70 text-lg max-w-2xl">
            Your personal collection of synthesized culinary compositions.
          </p>
        </header>

        <VaultGrid initialRecipes={recipes} />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/vault/page.tsx
git commit -m "feat(vault): integrate vault grid into new vault page"
```
