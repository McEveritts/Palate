'use client';

import React from 'react';
import { motion } from 'framer-motion';

export interface ContributionDay {
  date: string;
  dayName?: string;
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
  const isWeekly = days.length === 7;

  return (
    <div className={`relative p-6 rounded-[2rem] bg-slate-900/40 backdrop-blur-[32px] border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] overflow-hidden font-sans ${className}`}>
      {/* AetherFlow: Glowing indigo/fuchsia radial orbs */}
      <div className="absolute -top-12 -left-12 w-48 h-48 bg-indigo-500/20 blur-[48px] rounded-full pointer-events-none z-0 mix-blend-screen" />
      <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-fuchsia-500/20 blur-[48px] rounded-full pointer-events-none z-0 mix-blend-screen" />
      
      <div className="relative z-10 flex flex-col gap-5">
        <h3 className="text-sm font-medium tracking-wider text-slate-400 uppercase border-b border-white/5 pb-2.5 flex items-center justify-between">
          <span>{title}</span>
          <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">Telemetry</span>
        </h3>
        
        {isWeekly ? (
          /* Horizontal Premium Weekly View */
          <div className="flex justify-between items-center w-full gap-2 px-1 py-1">
            {days.map((day, index) => {
              const isCompleted = day.completed;
              // Extract the day number (e.g., "26" from "May 26")
              const dayNum = day.date.split(' ').pop() || '';
              const dayLabel = day.dayName || day.date.slice(0, 3);

              return (
                <div key={day.date || index} className="flex flex-col items-center gap-2.5 flex-1 group relative">
                  {/* Weekday Label */}
                  <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold select-none transition-colors group-hover:text-indigo-400">
                    {dayLabel}
                  </span>
                  
                  {/* Status Indicator Orb */}
                  <motion.div
                    role="gridcell"
                    aria-label={`${day.date}: ${day.completed ? 'Logged' : 'No log'}`}
                    tabIndex={0}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ 
                      delay: index * 0.05,
                      type: 'spring',
                      stiffness: 300,
                      damping: 20
                    }}
                    className={`w-7 h-7 rounded-xl relative transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 flex items-center justify-center cursor-help
                      ${isCompleted 
                        ? 'bg-gradient-to-br from-indigo-500 to-fuchsia-500 border border-white/20 shadow-[0_0_15px_rgba(139,92,246,0.55),inset_0_1px_1px_rgba(255,255,255,0.35)]' 
                        : 'bg-slate-950/40 border border-white/5 hover:border-white/15'
                      }
                    `}
                  >
                    {isCompleted ? (
                      <span className="text-[10px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">✓</span>
                    ) : (
                      <span className="text-[9px] font-bold text-slate-500 group-hover:text-slate-400">{dayNum}</span>
                    )}
                    
                    {/* Tooltip on hover or focus */}
                    <div className="absolute opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-all duration-200 bottom-full left-1/2 -translate-x-1/2 mb-2.5 px-3 py-2 bg-slate-950/95 backdrop-blur-xl border border-white/10 rounded-xl text-xs text-white whitespace-nowrap pointer-events-none z-30 shadow-2xl scale-95 group-hover:scale-100">
                      <span className="font-bold tracking-wide">{day.date}</span>
                      <span className="mx-2 text-white/30">•</span>
                      <span className={isCompleted ? 'text-fuchsia-400 drop-shadow-[0_0_8px_rgba(192,38,211,0.5)] font-semibold' : 'text-slate-400 font-medium'}>
                        {isCompleted ? 'Meal Logged' : 'No Activity'}
                      </span>
                    </div>
                  </motion.div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Original Monthly Grid View */
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
        )}
      </div>
    </div>
  );
};
