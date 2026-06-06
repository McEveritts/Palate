'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';

// Types for the macro data
export interface MacroData {
  label: string;
  value: number; // current value in grams
  target: number; // target value in grams
  color: string; // Color for the ring
}

export interface MacroGlassCardProps {
  protein: MacroData;
  carbs: MacroData;
  fats: MacroData;
  calories: {
    current: number;  // food calories consumed
    target: number;   // daily target
  };
  exerciseCalories?: number;  // calories burned from exercise
}

// Sub-component for individual radial progress rings
const RadialProgress = ({
  data,
  size = 80,
  strokeWidth = 6,
}: {
  data: MacroData;
  size?: number;
  strokeWidth?: number;
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const percentage = data.target > 0 ? Math.min((data.value / data.target) * 100, 100) : 0;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center relative">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          className="transform -rotate-90 w-full h-full"
          viewBox={`0 0 ${size} ${size}`}
          role="progressbar"
          aria-valuenow={data.value}
          aria-valuemin={0}
          aria-valuemax={data.target}
          aria-label={`${data.label}: ${data.value}g of ${data.target}g`}
        >
          <defs>
            <filter id={`glow-${data.label}`} x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor={data.color} floodOpacity="0.6" />
            </filter>
          </defs>
          {/* Background Ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="transparent"
            className="text-slate-800/50"
          />
          {/* Progress Ring with Holographic Glow */}
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={data.color}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1.5, ease: 'easeOut', delay: 0.2 }}
            style={{ willChange: 'transform' }}
            filter={`url(#glow-${data.label})`}
          />
        </svg>
        {/* Value Label inside the ring */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-bold text-slate-100 tracking-wider">
            {data.value}g
          </span>
        </div>
      </div>
      <div className="mt-3 text-center">
        <p className="text-xs font-semibold text-slate-300 uppercase tracking-widest">
          {data.label}
        </p>
        <p className="text-[10px] text-slate-500 mt-1">
          {data.target}g target
        </p>
      </div>
    </div>
  );
};

export const MacroGlassCard: React.FC<MacroGlassCardProps> = ({
  protein,
  carbs,
  fats,
  calories,
  exerciseCalories,
}) => {
  const netCalories = useMemo(
    () => calories.current - (exerciseCalories || 0),
    [calories, exerciseCalories],
  );
  const remaining = useMemo(
    () => calories.target - netCalories,
    [calories.target, netCalories],
  );
  const budgetPercent = useMemo(
    () => calories.target > 0 ? Math.min((netCalories / calories.target) * 100, 100) : 0,
    [netCalories, calories.target],
  );
  const isOverBudget = netCalories > calories.target;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      style={{ willChange: 'transform, opacity' }}
      className="relative w-full p-6 overflow-hidden rounded-3xl"
    >
      {/* Extreme Glassmorphism Base layer */}
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-3xl border border-white/10 rounded-3xl z-0 pointer-events-none" />
      
      {/* Specular Edge Highlights */}
      <div className="absolute inset-0 rounded-3xl border-t border-t-white/20 border-l border-l-white/10 pointer-events-none z-10" />

      {/* Holographic Radial Orbs (Background Glows) */}
      <div className="absolute -top-24 -left-24 w-64 h-64 bg-indigo-500/30 rounded-full blur-[80px] pointer-events-none z-0" />
      <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-fuchsia-500/20 rounded-full blur-[80px] pointer-events-none z-0" />

      {/* Content */}
      <div className="relative z-20 flex flex-col gap-6">
        {/* Header: Calorie Budget Ledger */}
        <div className="flex flex-col gap-3 pb-4 border-b border-slate-700/50">
          {/* Top row: Title + Hero remaining number */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-slate-200 tracking-wide font-inter">
                Daily Macros
              </h3>
              <p className="text-sm text-slate-400 mt-1">
                Precision nutritional tracking
              </p>
            </div>
            <div className="text-right">
              <motion.div
                key={remaining}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                className={`text-3xl font-bold bg-clip-text text-transparent font-inter ${
                  isOverBudget
                    ? 'bg-gradient-to-r from-rose-400 to-rose-500'
                    : 'bg-gradient-to-r from-indigo-400 to-fuchsia-400'
                }`}
                aria-label={`${remaining} kilocalories remaining`}
              >
                {remaining.toLocaleString()}
              </motion.div>
              <div className="text-xs text-slate-400 uppercase tracking-widest mt-1">
                {isOverBudget ? 'over budget' : 'kcal remaining'}
              </div>
            </div>
          </div>

          {/* Ledger Row */}
          <div
            className="flex items-center justify-between gap-2 text-[11px] font-medium tracking-wide font-inter"
            aria-label="Calorie budget breakdown"
          >
            <span className="text-slate-400">
              Goal: {calories.target.toLocaleString()}
            </span>
            <span className="text-slate-700 select-none" aria-hidden>|</span>
            <span className="text-fuchsia-300">
              Food: {calories.current.toLocaleString()}
            </span>
            <span className="text-slate-700 select-none" aria-hidden>|</span>
            <span className="text-emerald-300 inline-flex items-center gap-0.5">
              <Flame className="w-3 h-3 inline-block" aria-hidden />
              Exercise: {(exerciseCalories || 0).toLocaleString()}
            </span>
            <span className="text-slate-700 select-none" aria-hidden>|</span>
            <span className={`font-bold ${isOverBudget ? 'text-rose-400' : 'text-indigo-300'}`}>
              Remaining: {remaining.toLocaleString()}
            </span>
          </div>

          {/* Thin Progress Bar */}
          <div
            className="w-full bg-slate-800/50 rounded-full h-1.5 overflow-hidden"
            role="progressbar"
            aria-valuenow={netCalories}
            aria-valuemin={0}
            aria-valuemax={calories.target}
            aria-label={`Net calorie budget consumed: ${Math.round(budgetPercent)}%`}
          >
            <motion.div
              className={`h-full rounded-full ${
                isOverBudget
                  ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.6)]'
                  : 'bg-gradient-to-r from-indigo-500 to-fuchsia-500 shadow-[0_0_10px_rgba(129,140,248,0.4)]'
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${budgetPercent}%` }}
              transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
            />
          </div>
        </div>

        {/* Macro Rings */}
        <div className="flex justify-between items-end px-2 pt-2">
          <RadialProgress data={protein} size={86} strokeWidth={8} />
          <RadialProgress data={carbs} size={76} strokeWidth={6} />
          <RadialProgress data={fats} size={76} strokeWidth={6} />
        </div>
      </div>
    </motion.div>
  );
};
