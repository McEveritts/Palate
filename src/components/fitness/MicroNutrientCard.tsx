'use client';

import React from 'react';
import { Leaf, Flame, ShieldAlert } from 'lucide-react';

interface MicroNutrientCardProps {
  fiber: number;
  sugar: number;
  sodium: number;
  gender?: 'Male' | 'Female' | 'Other' | string;
}

export function MicroNutrientCard({ fiber, sugar, sodium, gender }: MicroNutrientCardProps) {
  const fiberTarget = 30; // 30g
  const sugarTarget = gender?.toLowerCase() === 'female' ? 25 : 37.5; // g (AHA guidelines)
  const sodiumTarget = 2300; // mg

  const fiberPercent = Math.min((fiber / fiberTarget) * 100, 100);
  const sugarPercent = Math.min((sugar / sugarTarget) * 100, 100);
  const sodiumPercent = Math.min((sodium / sodiumTarget) * 100, 100);

  const isSugarOver = sugar > sugarTarget;
  const isSodiumOver = sodium > sodiumTarget;

  return (
    <div className="p-6 rounded-3xl bg-slate-900/40 backdrop-blur-3xl border border-white/5 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] flex flex-col gap-5 relative overflow-hidden group">
      {/* speculative glowing spot */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-36 w-36 rounded-full bg-emerald-500/10 blur-[50px] transition-opacity duration-500 group-hover:opacity-100" />
      
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <h3 className="text-sm font-medium tracking-wider text-slate-400 uppercase flex items-center gap-2">
          <span>🌿 Micronutrient Budgets</span>
        </h3>
        <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">USDA Clinical</span>
      </div>

      <div className="space-y-5">
        {/* Fiber Progress */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-emerald-400 font-medium flex items-center gap-1.5">
              <Leaf size={12} />
              Dietary Fiber
            </span>
            <span className="text-slate-300 font-mono">
              {fiber.toFixed(1)}g <span className="text-slate-500 text-[10px]">/ {fiberTarget}g</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-950/80 overflow-hidden relative border border-white/5 shadow-inner">
            <div 
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_12px_rgba(52,211,153,0.4)] transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)]" 
              style={{ width: `${fiberPercent}%` }}
            />
          </div>
        </div>

        {/* Sugar Progress */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className={`font-medium flex items-center gap-1.5 ${isSugarOver ? "text-rose-400 animate-pulse" : "text-amber-300"}`}>
              <Flame size={12} />
              Daily Sugars
            </span>
            <span className="text-slate-300 font-mono">
              {sugar.toFixed(1)}g <span className="text-slate-500 text-[10px]">/ {sugarTarget}g</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-950/80 overflow-hidden relative border border-white/5 shadow-inner">
            <div 
              className={`h-full transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] bg-gradient-to-r ${
                isSugarOver 
                  ? "from-rose-600 to-red-500 shadow-[0_0_12px_rgba(244,63,94,0.5)]" 
                  : "from-amber-400 to-yellow-300 shadow-[0_0_12px_rgba(251,191,36,0.3)]"
              }`}
              style={{ width: `${sugarPercent}%` }}
            />
          </div>
        </div>

        {/* Sodium Progress */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className={`font-medium flex items-center gap-1.5 ${isSodiumOver ? "text-rose-400 animate-pulse" : "text-sky-400"}`}>
              <ShieldAlert size={12} />
              Sodium Intake
            </span>
            <span className="text-slate-300 font-mono">
              {Math.round(sodium)}mg <span className="text-slate-500 text-[10px]">/ {sodiumTarget}mg</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-950/80 overflow-hidden relative border border-white/5 shadow-inner">
            <div 
              className={`h-full transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] bg-gradient-to-r ${
                isSodiumOver 
                  ? "from-rose-600 to-red-500 shadow-[0_0_12px_rgba(244,63,94,0.5)]" 
                  : "from-sky-500 to-indigo-400 shadow-[0_0_12px_rgba(56,189,248,0.3)]"
              }`}
              style={{ width: `${sodiumPercent}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
