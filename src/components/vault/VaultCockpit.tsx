"use client";

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VaultRecipe } from '@/lib/vaultParser';
import { Scale, Sparkles, Brain, Check, TrendingUp, Layers, Activity, Info, Network, RotateCcw } from 'lucide-react';
import Link from 'next/link';

interface VaultCockpitProps {
  recipes: VaultRecipe[];
}

export function VaultCockpit({ recipes }: VaultCockpitProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredMacro, setHoveredMacro] = useState<'protein' | 'carbs' | 'fat' | null>(null);
  const [hoveredTag, setHoveredTag] = useState<string | null>(null);
  const [portionScale, setPortionScale] = useState<number>(1.0); // Dynamic portion multiplier

  // Helper to parse ingredients from recipes
  const recipeIngredients = useMemo(() => {
    const fillers = new Set(['or', 'and', 'with', 'for', 'to', 'in', 'a', 'of', 'cooked', 'sliced', 'diced', 'chopped', 'fresh', 'raw', 'warm', 'to taste']);
    
    return recipes.map(recipe => {
      // Find list items under ingredients header
      const match = recipe.content.match(/##\s*Ingredients\n([\s\S]*?)(?:\n##|$)/i);
      const rawList = match 
        ? match[1].split('\n').map(l => l.trim()).filter(l => l.startsWith('-') || l.startsWith('*')).map(l => l.replace(/^[-*]\s*/, ''))
        : [];

      // Extract clean keywords
      const keywords = new Set<string>();
      rawList.forEach(rawIng => {
        let clean = rawIng.toLowerCase();
        clean = clean.replace(/[\d\/\.\-\u00BC-\u00BE]/g, ''); // remove numbers and fractions
        clean = clean.replace(/\b(oz|ounce|ounces|g|gram|grams|ml|cup|cups|tbsp|tsp|tablespoon|tablespoons|teaspoon|teaspoons|sliced|chopped|diced|cooked|to taste|seasoning|fillet|fillets|fresh|raw|warm|clove|cloves|head|heads|pound|pounds|lb|lbs|dash|dashes|pinch|pinches|can|cans)\b/g, '');
        clean = clean.replace(/[,;.]/g, ''); // remove punctuation
        
        clean.split(/\s+/).forEach(word => {
          const trimmed = word.trim();
          if (trimmed.length > 2 && !fillers.has(trimmed)) {
            keywords.add(trimmed);
          }
        });
      });

      return {
        id: recipe.id,
        title: recipe.title,
        keywords,
        rawList
      };
    });
  }, [recipes]);

  // Zero-Waste Pantry Synergy Overlap Calculation
  const synergyPairs = useMemo(() => {
    const pairs: { r1: string; r2: string; overlap: string[]; count: number }[] = [];
    
    for (let i = 0; i < recipeIngredients.length; i++) {
      for (let j = i + 1; j < recipeIngredients.length; j++) {
        const r1 = recipeIngredients[i];
        const r2 = recipeIngredients[j];
        
        const intersection = [...r1.keywords].filter(x => r2.keywords.has(x));
        if (intersection.length > 0) {
          pairs.push({
            r1: r1.title,
            r2: r2.title,
            overlap: intersection,
            count: intersection.length
          });
        }
      }
    }
    
    return pairs.sort((a, b) => b.count - a.count).slice(0, 4); // Top 4 zero-waste pairs
  }, [recipeIngredients]);

  // Parse macros from recipes
  const parsedMacros = useMemo(() => {
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;
    let totalCalories = 0;

    const recipeBreakdown = recipes.map(recipe => {
      const macrosStr = recipe.macros || '';
      
      const protein = parseInt(macrosStr.match(/protein:\s*(\d+)/i)?.[1] || "0");
      const carbs = parseInt(macrosStr.match(/carbs?:\s*(\d+)/i)?.[1] || macrosStr.match(/carbohydrates?:\s*(\d+)/i)?.[1] || "0");
      const fat = parseInt(macrosStr.match(/fat:\s*(\d+)/i)?.[1] || "0");
      const calories = parseInt(macrosStr.match(/calories?:\s*(\d+)/i)?.[1] || macrosStr.match(/cal?:\s*(\d+)/i)?.[1] || "0");

      totalProtein += protein;
      totalCarbs += carbs;
      totalFat += fat;
      totalCalories += calories;

      return {
        id: recipe.id,
        title: recipe.title,
        protein,
        carbs,
        fat,
        calories
      };
    });

    const scaledCalories = totalCalories * portionScale;
    const scaledProtein = totalProtein * portionScale;
    const scaledCarbs = totalCarbs * portionScale;
    const scaledFat = totalFat * portionScale;
    const totalGrams = scaledProtein + scaledCarbs + scaledFat || 1;

    return {
      totalCalories: Math.round(scaledCalories),
      protein: { grams: Math.round(scaledProtein), pct: Math.round((scaledProtein / totalGrams) * 100) },
      carbs: { grams: Math.round(scaledCarbs), pct: Math.round((scaledCarbs / totalGrams) * 100) },
      fat: { grams: Math.round(scaledFat), pct: Math.round((scaledFat / totalGrams) * 100) },
      donors: {
        protein: [...recipeBreakdown].sort((a, b) => b.protein - a.protein).slice(0, 3),
        carbs: [...recipeBreakdown].sort((a, b) => b.carbs - a.carbs).slice(0, 3),
        fat: [...recipeBreakdown].sort((a, b) => b.fat - a.fat).slice(0, 3)
      }
    };
  }, [recipes, portionScale]);

  // Segment recipes into 6 distinct culinary dimensions and plot them in a hexagon radar space
  const radarDimensions = useMemo(() => {
    const dimensions = [
      { key: 'plantBased', label: '🌿 Plant-Based', color: '#10b981', matches: 0, hoverText: 'Plant-focused, clean preparations' },
      { key: 'quickPrep', label: '⚡ Quick Prep', color: '#eab308', matches: 0, hoverText: 'Ready in under 30 minutes' },
      { key: 'proteinRich', label: '💪 Protein-Rich', color: '#ec4899', matches: 0, hoverText: 'High protein macro split' },
      { key: 'fieryBold', label: '🔥 Fiery & Bold', color: '#f97316', matches: 0, hoverText: 'Spicy, bold flavor profile' },
      { key: 'comfortRich', label: '🥖 Comfort & Rich', color: '#8b5cf6', matches: 0, hoverText: 'Hearty, warming comfort food' },
      { key: 'lowCarb', label: '📉 Low Carb', color: '#3b82f6', matches: 0, hoverText: 'Ketogenic or light carbohydrate' }
    ];

    recipes.forEach(recipe => {
      const tags = recipe.tags.map(t => t.toLowerCase());
      const macrosStr = recipe.macros || '';
      const protein = parseInt(macrosStr.match(/protein:\s*(\d+)/i)?.[1] || "0");
      const carbs = parseInt(macrosStr.match(/carbs?:\s*(\d+)/i)?.[1] || macrosStr.match(/carbohydrates?:\s*(\d+)/i)?.[1] || "0");

      // 1. Plant-Based
      if (tags.some(t => ['vegan', 'vegetarian', 'plant-based', 'salad', 'vegetables', 'veg', 'greens'].includes(t))) {
        dimensions[0].matches += 1;
      }
      // 2. Quick Prep
      if (tags.some(t => ['quick', 'fast', 'under-30', 'easy', 'simple', 'quick-prep', 'speedy'].includes(t))) {
        dimensions[1].matches += 1;
      }
      // 3. Protein-Rich
      if (protein >= 20) {
        dimensions[2].matches += 1;
      }
      // 4. Fiery & Bold
      if (tags.some(t => ['spicy', 'chili', 'curry', 'bold', 'mexican', 'indian', 'asian', 'fiery', 'kick'].includes(t))) {
        dimensions[3].matches += 1;
      }
      // 5. Comfort & Rich
      if (tags.some(t => ['comfort-food', 'comfort', 'rich', 'baking', 'dessert', 'warm', 'hearty', 'cozy'].includes(t))) {
        dimensions[4].matches += 1;
      }
      // 6. Low Carb
      if (carbs > 0 && carbs <= 20) {
        dimensions[5].matches += 1;
      }
    });

    const maxVal = Math.max(...dimensions.map(d => d.matches), 1);
    
    // Geometry layout: Arrange in a hexagon (6 vertices)
    const centerX = 160;
    const centerY = 110;
    const maxRadius = 70; // Slightly smaller to leave comfortable breathing room for labels

    const vertices = dimensions.map((d, index) => {
      const angle = (index / 6) * 2 * Math.PI - Math.PI / 2; // Start from top
      const percentage = d.matches / maxVal;
      const radius = 12 + percentage * (maxRadius - 12); // Minimum radius to keep interactive structure
      
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);

      // Outer label coordinates
      const labelRadius = maxRadius + 22;
      const lx = centerX + labelRadius * Math.cos(angle);
      const ly = centerY + labelRadius * Math.sin(angle);

      return {
        ...d,
        x,
        y,
        lx,
        ly,
        percentage,
        angle
      };
    });

    return { vertices, centerX, centerY, maxRadius, maxVal };
  }, [recipes]);

  // Nested progress rings geometry
  const ringRadius = [72, 54, 36];
  const ringStroke = 12;
  const ringCenter = 100;
  
  const getRingCircumference = (radius: number) => 2 * Math.PI * radius;
  
  // Calculate stroke offsets (max value is 100%)
  const getStrokeOffset = (pct: number, radius: number) => {
    const circumference = getRingCircumference(radius);
    const validPct = Math.min(100, Math.max(0, pct));
    return circumference - (validPct / 100) * circumference;
  };

  return (
    <div className="w-full mb-10 relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-6 py-4 rounded-2xl glass-panel bg-slate-900/40 hover:bg-slate-900/60 border border-white/10 hover:border-white/20 transition-all text-white font-bold tracking-wide relative overflow-hidden group shadow-lg"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition-colors pointer-events-none" />
        <div className="flex items-center gap-3 relative z-10">
          <Activity className="text-indigo-400 animate-pulse w-5 h-5" />
          <span>AetherFlow Visual Analytics Cockpit</span>
        </div>
        <span className="text-indigo-400 group-hover:text-indigo-300 font-mono text-sm relative z-10 transition-colors">
          {isOpen ? "CLOSE COCKPIT ▲" : "EXPAND COCKPIT ▼"}
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 24 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden w-full flex flex-col gap-6"
          >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Panel A: Interactive Macronutrient Rings */}
              <section className="glass-panel p-6 rounded-2xl border border-white/5 relative overflow-hidden flex flex-col justify-between min-h-[360px] bg-gradient-to-b from-slate-950/80 to-slate-900/40">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Layers className="text-emerald-400 w-4 h-4" />
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider">Nutrient Balance Ring</h3>
                    </div>
                    <div className="flex items-center gap-1 bg-black/40 border border-white/5 px-2 py-1 rounded-md text-[10px] font-mono text-slate-400">
                      <Scale size={10} />
                      <span>x{portionScale.toFixed(1)} Portions</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 mt-2">
                    {/* Nested SVG Rings */}
                    <div className="relative w-[200px] h-[200px] flex-shrink-0 flex items-center justify-center">
                      <svg width="200" height="200" className="-rotate-90">
                        {/* Background circles */}
                        <circle cx={ringCenter} cy={ringCenter} r={ringRadius[0]} fill="transparent" stroke="rgba(52, 211, 153, 0.05)" strokeWidth={ringStroke} />
                        <circle cx={ringCenter} cy={ringCenter} r={ringRadius[1]} fill="transparent" stroke="rgba(244, 63, 94, 0.05)" strokeWidth={ringStroke} />
                        <circle cx={ringCenter} cy={ringCenter} r={ringRadius[2]} fill="transparent" stroke="rgba(99, 102, 241, 0.05)" strokeWidth={ringStroke} />

                        {/* Active Progress Rings */}
                        <circle
                          cx={ringCenter}
                          cy={ringCenter}
                          r={ringRadius[0]}
                          fill="transparent"
                          stroke="url(#protein-grad)"
                          strokeWidth={ringStroke}
                          strokeDasharray={getRingCircumference(ringRadius[0])}
                          strokeDashoffset={getStrokeOffset(parsedMacros.protein.pct, ringRadius[0])}
                          strokeLinecap="round"
                          className="transition-all duration-1000 ease-out cursor-pointer"
                          onMouseEnter={() => setHoveredMacro('protein')}
                          onMouseLeave={() => setHoveredMacro(null)}
                        />
                        <circle
                          cx={ringCenter}
                          cy={ringCenter}
                          r={ringRadius[1]}
                          fill="transparent"
                          stroke="url(#fat-grad)"
                          strokeWidth={ringStroke}
                          strokeDasharray={getRingCircumference(ringRadius[1])}
                          strokeDashoffset={getStrokeOffset(parsedMacros.fat.pct, ringRadius[1])}
                          strokeLinecap="round"
                          className="transition-all duration-1000 ease-out cursor-pointer"
                          onMouseEnter={() => setHoveredMacro('fat')}
                          onMouseLeave={() => setHoveredMacro(null)}
                        />
                        <circle
                          cx={ringCenter}
                          cy={ringCenter}
                          r={ringRadius[2]}
                          fill="transparent"
                          stroke="url(#carb-grad)"
                          strokeWidth={ringStroke}
                          strokeDasharray={getRingCircumference(ringRadius[2])}
                          strokeDashoffset={getStrokeOffset(parsedMacros.carbs.pct, ringRadius[2])}
                          strokeLinecap="round"
                          className="transition-all duration-1000 ease-out cursor-pointer"
                          onMouseEnter={() => setHoveredMacro('carbs')}
                          onMouseLeave={() => setHoveredMacro(null)}
                        />

                        {/* Definitions for gorgeous HSL spec gradients */}
                        <defs>
                          <linearGradient id="protein-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#10b981" />
                            <stop offset="100%" stopColor="#059669" />
                          </linearGradient>
                          <linearGradient id="fat-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#f43f5e" />
                            <stop offset="100%" stopColor="#be123c" />
                          </linearGradient>
                          <linearGradient id="carb-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#6366f1" />
                            <stop offset="100%" stopColor="#4f46e5" />
                          </linearGradient>
                        </defs>
                      </svg>
                      
                      {/* Central readouts */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none text-center">
                        {hoveredMacro ? (
                          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${
                              hoveredMacro === 'protein' ? 'text-emerald-400' : hoveredMacro === 'fat' ? 'text-rose-400' : 'text-indigo-400'
                            }`}>
                              {hoveredMacro}
                            </span>
                            <h4 className="text-2xl font-black text-white leading-none mt-0.5">
                              {hoveredMacro === 'protein' ? `${parsedMacros.protein.pct}%` : hoveredMacro === 'fat' ? `${parsedMacros.fat.pct}%` : `${parsedMacros.carbs.pct}%`}
                            </h4>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {hoveredMacro === 'protein' ? `${parsedMacros.protein.grams}g` : hoveredMacro === 'fat' ? `${parsedMacros.fat.grams}g` : `${parsedMacros.carbs.grams}g`}
                            </span>
                          </motion.div>
                        ) : (
                          <div>
                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest leading-none block">Calories</span>
                            <h4 className="text-3xl font-black text-white leading-none mt-1 tracking-tight">
                              {parsedMacros.totalCalories}
                            </h4>
                            <span className="text-[9px] text-indigo-300 font-bold bg-indigo-500/10 px-1.5 py-0.5 rounded-md mt-1.5 inline-block">
                              METRIC AGG
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Ring legend */}
                    <div className="flex flex-col gap-3 justify-center">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                        <div>
                          <p className="leading-none text-[11px] text-slate-400">Protein ({parsedMacros.protein.pct}%)</p>
                          <p className="font-mono text-white text-[13px]">{parsedMacros.protein.grams}g</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                        <div>
                          <p className="leading-none text-[11px] text-slate-400">Fat ({parsedMacros.fat.pct}%)</p>
                          <p className="font-mono text-white text-[13px]">{parsedMacros.fat.grams}g</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                        <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                        <div>
                          <p className="leading-none text-[11px] text-slate-400">Carbs ({parsedMacros.carbs.pct}%)</p>
                          <p className="font-mono text-white text-[13px]">{parsedMacros.carbs.grams}g</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Portion scaling slider */}
                <div className="mt-4 bg-black/30 border border-white/5 p-3 rounded-xl flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Portion Scale</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="3.0"
                    step="0.5"
                    value={portionScale}
                    onChange={(e) => setPortionScale(parseFloat(e.target.value))}
                    className="flex-1 accent-emerald-500 h-1 rounded-full bg-slate-800"
                  />
                  <span className="font-mono text-xs text-emerald-300 font-bold">{portionScale.toFixed(1)}x</span>
                  <button 
                    onClick={() => setPortionScale(1.0)} 
                    className="p-1 hover:bg-white/10 rounded-md text-slate-400 hover:text-white transition-colors"
                    title="Reset to default (1.0x)"
                  >
                    <RotateCcw size={12} />
                  </button>
                </div>
              </section>

              {/* Panel B: Visual Culinary Radar (AetherFlow Stat Wheel) */}
              <section className="glass-panel p-6 rounded-2xl border border-white/5 relative overflow-hidden flex flex-col justify-between min-h-[360px] bg-gradient-to-b from-slate-950/80 to-slate-900/40">
                <div className="absolute top-0 right-0 w-24 h-24 bg-fuchsia-500/5 rounded-full blur-2xl pointer-events-none" />
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Activity className="text-fuchsia-400 w-4 h-4" />
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider">Culinary Radar</h3>
                    </div>
                    {hoveredTag && (
                      <span className="bg-fuchsia-500/10 border border-fuchsia-500/30 text-[9px] font-mono px-2 py-0.5 rounded text-fuchsia-300">
                        {radarDimensions.vertices.find(v => v.key === hoveredTag)?.label || hoveredTag}
                      </span>
                    )}
                  </div>

                  {/* SVG Radar Map */}
                  <div className="relative w-full h-[220px] flex items-center justify-center mt-2 bg-black/10 rounded-2xl border border-white/5 overflow-hidden">
                    <svg width="320" height="220" className="absolute">
                      {/* Definitions for gorgeous HSL gradients and filters */}
                      <defs>
                        <linearGradient id="radar-glow-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#d946ef" stopOpacity="0.2" />
                          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.2" />
                        </linearGradient>
                        <linearGradient id="radar-stroke-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#d946ef" />
                          <stop offset="100%" stopColor="#6366f1" />
                        </linearGradient>
                      </defs>

                      {/* 1. Concentric Background Hexagons */}
                      {[0.25, 0.5, 0.75, 1.0].map((scale) => {
                        const radius = scale * radarDimensions.maxRadius;
                        const points = radarDimensions.vertices.map((v, index) => {
                          const angle = (index / 6) * 2 * Math.PI - Math.PI / 2;
                          const x = radarDimensions.centerX + radius * Math.cos(angle);
                          const y = radarDimensions.centerY + radius * Math.sin(angle);
                          return `${x},${y}`;
                        }).join(' ');
                        
                        return (
                          <polygon
                            key={`grid-${scale}`}
                            points={points}
                            fill="transparent"
                            stroke="rgba(255, 255, 255, 0.05)"
                            strokeWidth="1"
                          />
                        );
                      })}

                      {/* 2. Spoke Axis Lines */}
                      {radarDimensions.vertices.map((v, i) => {
                        const outerX = radarDimensions.centerX + radarDimensions.maxRadius * Math.cos(v.angle);
                        const outerY = radarDimensions.centerY + radarDimensions.maxRadius * Math.sin(v.angle);
                        return (
                          <line
                            key={`axis-${i}`}
                            x1={radarDimensions.centerX}
                            y1={radarDimensions.centerY}
                            x2={outerX}
                            y2={outerY}
                            stroke="rgba(255, 255, 255, 0.05)"
                            strokeWidth="1"
                            strokeDasharray="2,2"
                          />
                        );
                      })}

                      {/* 3. Active Colored Data Polygon */}
                      {radarDimensions.vertices.length > 0 && (
                        <polygon
                          points={radarDimensions.vertices.map(v => `${v.x},${v.y}`).join(' ')}
                          fill="url(#radar-glow-grad)"
                          stroke="url(#radar-stroke-grad)"
                          strokeWidth="2.5"
                          className="transition-all duration-700 ease-out"
                        />
                      )}

                      {/* 4. Textual Labels */}
                      {radarDimensions.vertices.map((v, i) => {
                        const cos = Math.cos(v.angle);
                        let textAnchor: "inherit" | "end" | "middle" | "start" | undefined = "middle";
                        if (cos > 0.1) textAnchor = "start";
                        else if (cos < -0.1) textAnchor = "end";

                        return (
                          <text
                            key={`label-${i}`}
                            x={v.lx}
                            y={v.ly + 4}
                            fill={hoveredTag === v.key ? "#ffffff" : "rgba(255, 255, 255, 0.6)"}
                            fontSize="8"
                            fontWeight={hoveredTag === v.key ? "bold" : "normal"}
                            textAnchor={textAnchor}
                            className="transition-all duration-200 font-mono select-none"
                          >
                            {v.label}
                          </text>
                        );
                      })}

                      {/* 5. Interactive Vertex Dots & Hover Halos */}
                      {radarDimensions.vertices.map((v, i) => {
                        const isHovered = hoveredTag === v.key;
                        return (
                          <g
                            key={`vertex-group-${i}`}
                            className="cursor-pointer"
                            onMouseEnter={() => setHoveredTag(v.key)}
                            onMouseLeave={() => setHoveredTag(null)}
                          >
                            {/* Larger invisible trigger circle for easy hovering */}
                            <circle
                              cx={v.x}
                              cy={v.y}
                              r={12}
                              fill="transparent"
                              className="select-none"
                            />
                            
                            {/* Glowing halo */}
                            {isHovered && (
                              <circle
                                cx={v.x}
                                cy={v.y}
                                r={10}
                                fill="transparent"
                                stroke={v.color}
                                strokeWidth={1}
                                className="animate-ping opacity-60"
                              />
                            )}

                            {/* Active dot */}
                            <circle
                              cx={v.x}
                              cy={v.y}
                              r={isHovered ? 6 : 4}
                              fill={v.color}
                              stroke="#ffffff"
                              strokeWidth={1.5}
                              className="transition-all duration-200"
                            />
                          </g>
                        );
                      })}
                    </svg>

                    {/* Dynamic Hover Details Overlay */}
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-center pointer-events-none select-none text-center">
                      <span className="text-[10px] text-slate-400 font-medium tracking-wide uppercase bg-slate-950/80 border border-white/5 px-3 py-1.5 rounded-full backdrop-blur-md max-w-[90%] truncate">
                        {hoveredTag ? (
                          <>
                            <strong className="text-white">
                              {radarDimensions.vertices.find(v => v.key === hoveredTag)?.matches || 0}
                            </strong>
                            {' '}recipes match{' '}
                            <span className="text-indigo-300 font-semibold font-mono uppercase">
                              {radarDimensions.vertices.find(v => v.key === hoveredTag)?.label.split(' ')[1] || hoveredTag}
                            </span>
                          </>
                        ) : (
                          "Hover vertices to analyze culinary composition"
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 bg-black/30 border border-white/5 p-3 rounded-xl flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold text-slate-300 font-mono">Statistical Split:</span>
                  <span className="text-[10px] font-mono text-fuchsia-300">
                    6 Dimensions Mapped
                  </span>
                </div>
              </section>

              {/* Panel C: Zero-Waste Pantry Synergy Grid */}
              <section className="glass-panel p-6 rounded-2xl border border-white/5 relative overflow-hidden flex flex-col justify-between min-h-[360px] bg-gradient-to-b from-slate-950/80 to-slate-900/40">
                <div className="absolute top-0 right-0 w-24 h-24 bg-fuchsia-500/5 rounded-full blur-2xl pointer-events-none" />
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="text-indigo-400 w-4 h-4 animate-spin" />
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Zero-Waste Synergy Pairs</h3>
                  </div>

                  <div className="flex flex-col gap-3 mt-2">
                    {synergyPairs.length > 0 ? (
                      synergyPairs.map((pair, idx) => (
                        <div
                          key={`synergy-${idx}`}
                          className="bg-black/30 border border-white/5 hover:border-indigo-500/30 p-3 rounded-xl transition-all duration-300 relative group/pair flex flex-col gap-1.5"
                        >
                          <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-indigo-500/5 to-transparent rounded-full blur-xl group-hover/pair:from-indigo-500/10" />
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-black text-indigo-200 tracking-tight leading-none max-w-[70%] truncate">
                              {pair.r1} + {pair.r2}
                            </span>
                            <span className="bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-black px-2 py-0.5 rounded-md text-emerald-300 uppercase tracking-widest font-mono shrink-0">
                              ♻️ {pair.count} Shared
                            </span>
                          </div>
                          
                          <div className="flex flex-wrap gap-1 text-[9px]">
                            {pair.overlap.slice(0, 4).map((ing, i) => (
                              <span key={i} className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded font-medium text-slate-400">
                                {ing}
                              </span>
                            ))}
                            {pair.overlap.length > 4 && (
                              <span className="px-1.5 py-0.5 bg-indigo-500/10 border border-indigo-500/20 rounded font-medium text-indigo-300">
                                +{pair.overlap.length - 4} more
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="bg-black/20 border border-white/5 p-8 rounded-xl text-center text-slate-500 text-xs font-semibold">
                        No overlapping ingredient sets found in the current recipes. Synthesize more recipes to unlock overlaps!
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  <div className="bg-gradient-to-r from-indigo-600/10 to-fuchsia-600/10 border border-white/5 p-3 rounded-xl text-[10px] text-indigo-200 font-semibold leading-relaxed flex items-start gap-2 shadow-inner">
                    <Info size={14} className="text-indigo-400 shrink-0 mt-0.5" />
                    <span>Synergy recommendations help you design multi-dish menus with overlapping ingredients.</span>
                  </div>
                  
                  <Link
                    href="/collections/zero-waste"
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 hover:from-indigo-500 hover:to-fuchsia-500 text-white font-bold text-xs text-center transition-all duration-300 shadow-lg shadow-indigo-500/10 hover:shadow-indigo-500/20 border border-white/10 flex items-center justify-center gap-2"
                  >
                    <Sparkles size={12} className="animate-pulse text-indigo-200" />
                    <span>Enter Zero-Waste SageAI Page</span>
                  </Link>
                </div>
              </section>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
