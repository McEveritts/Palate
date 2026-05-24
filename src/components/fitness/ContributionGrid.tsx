'use client';

import React from 'react';
import { motion } from 'framer-motion';

export interface ContributionDay {
  date: string;
  completed: boolean;
  intensity?: number; // Optional scaling for intensity (e.g., 1-4)
}

interface ContributionGridProps {
  days: ContributionDay[];
  title?: string;
  className?: string;
}

export const ContributionGrid: React.FC<ContributionGridProps> = ({ 
  days, 
  title = "Monthly Consistency",
  className = ""
}) => {
  return (
    <div className={`relative p-6 rounded-[2rem] bg-slate-900/40 backdrop-blur-[32px] border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] overflow-hidden font-sans ${className}`}>
      {/* AetherFlow: Glowing indigo/fuchsia radial orbs */}
      <div className="absolute -top-12 -left-12 w-48 h-48 bg-indigo-500/20 blur-[48px] rounded-full pointer-events-none z-0 mix-blend-screen" />
      <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-fuchsia-500/20 blur-[48px] rounded-full pointer-events-none z-0 mix-blend-screen" />
      
      <div className="relative z-10 flex flex-col gap-6">
        <h3 className="text-xl font-medium text-white/90 drop-shadow-[0_2px_10px_rgba(255,255,255,0.1)] tracking-wide">
          {title}
        </h3>
        
        <div className="flex gap-3 items-end">
          {/* Day of week labels */}
          <div className="flex flex-col gap-2 text-[10px] uppercase tracking-wider text-white/40 font-medium py-1 select-none">
            <span className="h-4 flex items-center">Mon</span>
            <span className="h-4 flex items-center opacity-0">Tue</span>
            <span className="h-4 flex items-center">Wed</span>
            <span className="h-4 flex items-center opacity-0">Thu</span>
            <span className="h-4 flex items-center">Fri</span>
            <span className="h-4 flex items-center opacity-0">Sat</span>
            <span className="h-4 flex items-center">Sun</span>
          </div>

          <div className="grid grid-rows-7 grid-flow-col gap-2" role="grid" aria-label="Monthly meal tracking consistency">
            {days.map((day, index) => {
              const isCompleted = day.completed;
              // Wire intensity to opacity: default to 1 for completed, 0 for incomplete
              const intensityOpacity = day.completed ? Math.max(0.35, Math.min(day.intensity != null ? day.intensity / 4 : 1, 1)) : 0.08;
              
              return (
                <motion.div
                  key={day.date || index}
                  role="gridcell"
                  aria-label={`${day.date}: ${day.completed ? 'Logged' : 'No log'}`}
                  tabIndex={0}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ 
                    delay: Math.min(index * 0.015, 0.8),
                    type: 'spring',
                    stiffness: 300,
                    damping: 20
                  }}
                  className={`w-4 h-4 rounded-md relative group transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60
                    ${isCompleted 
                      // AetherFlow: Frosted glass squares, glowing drop-shadows, specular edge highlights
                      ? 'bg-white/5 border border-white/20 shadow-[0_0_16px_rgba(139,92,246,0.5),inset_0_1px_1px_rgba(255,255,255,0.4)]' 
                      : 'bg-slate-800/40 border border-white/5 hover:border-white/10'
                    }
                  `}
                  style={intensityOpacity != null ? { opacity: intensityOpacity } : undefined}
                >
                  {/* Tooltip on hover or focus */}
                  <div className="absolute opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-lg text-xs text-white/90 whitespace-nowrap pointer-events-none z-20 shadow-xl">
                    <span className="font-semibold">{day.date}</span>
                    <span className="mx-2 text-white/30">•</span>
                    <span className={isCompleted ? 'text-fuchsia-400 drop-shadow-[0_0_8px_rgba(192,38,211,0.5)]' : 'text-white/50'}>
                      {isCompleted ? 'Completed' : 'Rest'}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
