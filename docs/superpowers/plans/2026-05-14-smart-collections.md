# Smart Collections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement three distinct Smart Collections pages (Macro-Optimized, Zero-Waste, Flavor-Profile) with specialized layouts, data fetching, and interaction models.

**Architecture:** We will create three new Next.js route pages under `src/app/collections/`. `macro-optimized` will fetch and pre-sort vault recipes by protein density. `zero-waste` will provide a tailored chat interface using a new `/api/sage/zero-waste` endpoint. `flavor-profile` will map recipe tags to evocative "playlist" categories and display them in horizontal swimlanes.

**Tech Stack:** Next.js (App Router), React, Tailwind CSS, Framer Motion, local file system (vault), Google Generative AI (Gemma 4 31B).

---

### Task 1: Macro-Optimized Collection

**Files:**
- Create: `src/app/collections/macro-optimized/page.tsx`
- Modify: `src/components/layout/Sidebar.tsx` (ensure link exists/correct)

- [ ] **Step 1: Write the failing test**

```typescript
// tests/app/collections/macro-optimized/page.test.tsx
import { render, screen } from '@testing-library/react';
import MacroOptimizedPage from '../../../../src/app/collections/macro-optimized/page';

jest.mock('../../../../src/lib/vaultParser', () => ({
  getAllVaultRecipes: jest.fn(() => [
    { title: 'Chicken', category: 'mains', markdown: '', frontmatter: { recipe: 'Chicken', tags: [], macros: 'Calories: 200 | Protein: 40g | Carbs: 0g | Fat: 5g' } },
    { title: 'Pasta', category: 'mains', markdown: '', frontmatter: { recipe: 'Pasta', tags: [], macros: 'Calories: 400 | Protein: 10g | Carbs: 80g | Fat: 5g' } }
  ])
}));

describe('MacroOptimizedPage', () => {
  it('renders recipes sorted by protein density', async () => {
    render(await MacroOptimizedPage());
    const cards = screen.getAllByRole('heading', { level: 3 });
    expect(cards[0]).toHaveTextContent('Chicken'); // 40/200 = 0.2 density
    expect(cards[1]).toHaveTextContent('Pasta');   // 10/400 = 0.025 density
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/app/collections/macro-optimized/page.test.tsx`
Expected: FAIL (MacroOptimizedPage is not a function/component)

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/app/collections/macro-optimized/page.tsx
import { getAllVaultRecipes } from "../../../lib/vaultParser";

function extractMacros(macroString: string) {
  const calMatch = macroString.match(/Calories:\s*(\d+)/i);
  const proMatch = macroString.match(/Protein:\s*(\d+)g/i);
  const calories = calMatch ? parseInt(calMatch[1], 10) : 0;
  const protein = proMatch ? parseInt(proMatch[1], 10) : 0;
  return { calories, protein };
}

export default async function MacroOptimizedPage() {
  const allRecipes = await getAllVaultRecipes();
  
  const optimizedRecipes = allRecipes
    .map(recipe => {
      const { calories, protein } = extractMacros(recipe.frontmatter?.macros || '');
      const density = calories > 0 ? protein / calories : 0;
      return { ...recipe, calories, protein, density };
    })
    .filter(r => r.density > 0)
    .sort((a, b) => b.density - a.density);

  return (
    <div className="w-full min-h-full p-8 md:p-12 max-w-7xl mx-auto">
      <div className="mb-10">
        <h1 className="text-4xl font-bold text-white tracking-tight">Macro-Optimized</h1>
        <p className="text-slate-400 mt-2 text-lg">Your vault, sorted strictly by protein density.</p>
      </div>

      {optimizedRecipes.length === 0 ? (
        <div className="glass-panel p-10 rounded-3xl text-center text-slate-400">
          No macro-tracked recipes found in your vault.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {optimizedRecipes.map((recipe, idx) => (
            <div key={idx} className="glass-panel p-6 rounded-3xl flex flex-col gap-4 border border-white/5 bg-gradient-to-br from-white/[0.02] to-transparent">
              <h3 className="text-xl font-bold text-white line-clamp-1">{recipe.frontmatter?.recipe || recipe.title}</h3>
              
              <div className="flex items-end justify-between mt-auto">
                <div className="flex flex-col">
                  <span className="text-4xl font-black text-emerald-400">{recipe.protein}g</span>
                  <span className="text-sm text-emerald-400/70 font-medium uppercase tracking-wider">Protein</span>
                </div>
                <div className="flex flex-col text-right">
                  <span className="text-2xl font-bold text-slate-300">{recipe.calories}</span>
                  <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Calories</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/app/collections/macro-optimized/page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/collections/macro-optimized/page.tsx tests/app/collections/macro-optimized/page.test.tsx
git commit -m "feat(collections): build macro-optimized page with density sorting"
```

---

### Task 2: Zero-Waste API Endpoint

**Files:**
- Create: `src/app/api/sage/zero-waste/route.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/sage/zero-waste/route.test.ts
import { POST } from '../../../../src/app/api/sage/zero-waste/route';

describe('Zero Waste API', () => {
  it('returns a stream response', async () => {
    const req = new Request('http://localhost/api/sage/zero-waste', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'I have 3 eggs and old spinach.' })
    });
    const res = await POST(req);
    expect(res).toBeDefined();
    expect(res.body).toBeInstanceOf(ReadableStream);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/api/sage/zero-waste/route.test.ts`
Expected: FAIL (Cannot find module)

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/app/api/sage/zero-waste/route.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

export async function POST(req: Request) {
  const { prompt } = await req.json();
  const model = genAI.getGenerativeModel({ model: "gemma-4-31b-it" });

  const systemPrompt = `You are a Zero-Waste Culinary Specialist.
The user will provide a list of random ingredients. 
Your goal is to synthesize a cohesive, delicious recipe that uses these specific ingredients to prevent food waste.
Always wrap your reasoning in <thought> tags before answering. Output the final recipe in Palate's standard Markdown format with YAML frontmatter.`;

  const stream = await model.generateContentStream([
    { text: systemPrompt },
    { text: prompt }
  ]);

  const readableStream = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        controller.enqueue(new TextEncoder().encode(chunk.text()));
      }
      controller.close();
    }
  });

  return new Response(readableStream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/api/sage/zero-waste/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/sage/zero-waste/route.ts tests/api/sage/zero-waste/route.test.ts
git commit -m "feat(api): add dedicated zero-waste sage endpoint"
```

---

### Task 3: Zero-Waste Page UI

**Files:**
- Create: `src/app/collections/zero-waste/page.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/app/collections/zero-waste/page.test.tsx
import { render, screen } from '@testing-library/react';
import ZeroWastePage from '../../../../src/app/collections/zero-waste/page';

describe('ZeroWastePage', () => {
  it('renders the initial zero-waste chat interface', () => {
    render(<ZeroWastePage />);
    expect(screen.getByText('Zero-Waste Kitchen')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e.g. 'I have half an onion/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/app/collections/zero-waste/page.test.tsx`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

*(Note: We adapt the SageHero UI specifically for the Zero-Waste context)*

```tsx
// src/app/collections/zero-waste/page.tsx
"use client";

import { useState } from "react";
import { Leaf, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function ZeroWastePage() {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [response, setResponse] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setResponse("");

    try {
      const res = await fetch("/api/sage/zero-waste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          setResponse(prev => (prev || "") + decoder.decode(value, { stream: true }));
        }
      }
    } catch (err) {
      console.error(err);
      setResponse("⚠️ Failed to connect to Sage.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col justify-center relative max-w-4xl mx-auto p-8">
      <AnimatePresence mode="wait">
        {!response ? (
          <motion.div 
            key="hero"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel p-10 lg:p-14 flex flex-col items-center text-center gap-6 w-full rounded-3xl"
          >
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-2">
              <Leaf size={32} />
            </div>
            
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white m-0">
              Zero-Waste Kitchen
            </h1>
            <p className="text-lg text-slate-400 max-w-xl m-0 leading-relaxed">
              List the expiring ingredients, half-used vegetables, or leftover proteins sitting in your fridge. Sage will synthesize a creative recipe to prevent waste.
            </p>
            
            <form onSubmit={handleSubmit} className="w-full max-w-2xl relative mt-4">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="glass-input pl-6 pr-32 py-5 w-full text-white placeholder-slate-500 text-lg rounded-2xl"
                placeholder="e.g. 'I have half an onion, heavy cream, and wilted spinach...'"
              />
              <button
                type="submit"
                disabled={!prompt.trim()}
                className="absolute right-3 top-3 bottom-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl px-6 flex items-center gap-2 transition-all disabled:opacity-50"
              >
                <Sparkles size={16} /> Rescue
              </button>
            </form>
          </motion.div>
        ) : (
          <motion.div 
            key="chat"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full flex flex-col gap-6 h-full pb-8"
          >
            <div className="glass-panel p-8 rounded-3xl border border-emerald-500/20">
               <h3 className="text-2xl font-bold text-white mb-4 flex items-center gap-2"><Leaf className="text-emerald-400"/> Rescued Recipe</h3>
               <div className="prose prose-invert max-w-none whitespace-pre-wrap">
                 {response}
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/app/collections/zero-waste/page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/collections/zero-waste/page.tsx tests/app/collections/zero-waste/page.test.tsx
git commit -m "feat(collections): build zero-waste chat interface"
```

---

### Task 4: Flavor-Profile Swimlanes

**Files:**
- Create: `src/app/collections/flavor-profile/page.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/app/collections/flavor-profile/page.test.tsx
import { render, screen } from '@testing-library/react';
import FlavorProfilePage from '../../../../src/app/collections/flavor-profile/page';

jest.mock('../../../../src/lib/vaultParser', () => ({
  getAllVaultRecipes: jest.fn(() => [
    { title: 'Chili', category: 'mains', markdown: '', frontmatter: { recipe: 'Chili', tags: ['spicy', 'beef'] } },
    { title: 'Salad', category: 'sides', markdown: '', frontmatter: { recipe: 'Salad', tags: ['fresh', 'light'] } }
  ])
}));

describe('FlavorProfilePage', () => {
  it('renders categorized swimlanes based on tags', async () => {
    render(await FlavorProfilePage());
    expect(screen.getByText('Midnight Umami & Spice')).toBeInTheDocument();
    expect(screen.getByText('Light & Fresh')).toBeInTheDocument();
    expect(screen.getByText('Chili')).toBeInTheDocument();
    expect(screen.getByText('Salad')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/app/collections/flavor-profile/page.test.tsx`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/app/collections/flavor-profile/page.tsx
import { getAllVaultRecipes } from "../../../lib/vaultParser";

export default async function FlavorProfilePage() {
  const allRecipes = await getAllVaultRecipes();

  // Categorization Logic
  const spicy = allRecipes.filter(r => r.frontmatter?.tags?.some(t => ['spicy', 'chili', 'beef', 'heavy', 'umami'].includes(t.toLowerCase())));
  const fresh = allRecipes.filter(r => r.frontmatter?.tags?.some(t => ['fresh', 'light', 'salad', 'citrus', 'herb'].includes(t.toLowerCase())));
  const comfort = allRecipes.filter(r => r.frontmatter?.tags?.some(t => ['comfort', 'soup', 'braise', 'slow-cook', 'pasta'].includes(t.toLowerCase())));

  const playlists = [
    { title: "Midnight Umami & Spice", description: "Bold, heavy, and packed with heat.", recipes: spicy },
    { title: "Light & Fresh", description: "Crisp textures and bright acidity.", recipes: fresh },
    { title: "Rainy Day Comfort", description: "Warm, slow-cooked, and soul-soothing.", recipes: comfort }
  ].filter(p => p.recipes.length > 0);

  return (
    <div className="w-full min-h-full py-12 overflow-x-hidden">
      <div className="px-8 md:px-12 mb-12">
        <h1 className="text-4xl font-bold text-white tracking-tight">Flavor Profiles</h1>
        <p className="text-slate-400 mt-2 text-lg">Curated playlists based on the culinary vibe.</p>
      </div>

      {playlists.length === 0 ? (
        <div className="px-8 md:px-12">
          <div className="glass-panel p-10 rounded-3xl text-center text-slate-400">
            Add more recipes with flavor tags to unlock curated playlists.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-12">
          {playlists.map((playlist, idx) => (
            <div key={idx} className="w-full">
              <div className="px-8 md:px-12 mb-4">
                <h2 className="text-2xl font-bold text-white">{playlist.title}</h2>
                <p className="text-slate-400 text-sm">{playlist.description}</p>
              </div>
              
              <div className="flex overflow-x-auto gap-6 px-8 md:px-12 pb-6 custom-scrollbar snap-x">
                {playlist.recipes.map((recipe, rIdx) => (
                  <div key={rIdx} className="snap-start shrink-0 w-72 h-48 glass-panel rounded-2xl p-6 flex flex-col justify-end relative overflow-hidden group cursor-pointer hover:border-white/20 transition-all">
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/20 to-transparent z-10"></div>
                    
                    <div className="relative z-20">
                      <h3 className="text-lg font-bold text-white mb-1 line-clamp-2 group-hover:text-indigo-300 transition-colors">
                        {recipe.frontmatter?.recipe || recipe.title}
                      </h3>
                      <div className="flex gap-2 text-xs font-medium text-slate-400 uppercase tracking-wider">
                        <span>{recipe.category}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/app/collections/flavor-profile/page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/collections/flavor-profile/page.tsx tests/app/collections/flavor-profile/page.test.tsx
git commit -m "feat(collections): build flavor-profile horizontal swimlanes"
```