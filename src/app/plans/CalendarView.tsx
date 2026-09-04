/* eslint-disable react-hooks/set-state-in-effect, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, Calendar, Trash2, Move, Clock, Scale, 
  Sparkles, CheckCircle2, AlertTriangle, ArrowRight,
  TrendingDown, Link as LinkIcon
} from 'lucide-react';
import { VaultRecipe } from '@/lib/vaultParser';
import { 
  scheduleMeal, 
  getScheduledMeals, 
  moveScheduledMeal, 
  cancelScheduledMeal 
} from '@/app/actions';
import { extractMacrosFromString } from '@/lib/parser';
import { scaleQuantity } from '@/lib/symbolicMath';

export interface CalendarViewProps {
  vaultRecipes: VaultRecipe[];
  currentRecipes: VaultRecipe[];
  archiveRecipes: VaultRecipe[];
  forceMode?: '1-day' | '3-day' | '7-day';
}

export interface ScheduledMealData {
  id: string;
  userId: string;
  recipeId: string;
  date: string;
  mealType: string;
  plannedYield: number;
  parentMealId: string | null;
  recipe: {
    id: string;
    title: string;
    slug: string;
    markdown: string;
    frontmatter: any;
  };
}

export const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

export const getLocalDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getMealDateString = (dateInput: Date | string): string => {
  if (dateInput instanceof Date) {
    return getLocalDateString(dateInput);
  }
  if (typeof dateInput === 'string') {
    return dateInput.split('T')[0];
  }
  return '';
};

export const formatMealDateFriendly = (dateInput: Date | string): string => {
  const dateStr = getMealDateString(dateInput);
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

export const formatMealDateFriendlyLong = (dateInput: Date | string): string => {
  const dateStr = getMealDateString(dateInput);
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
};

/**
 * Lightweight hook utilizing ResizeObserver to observe the container's inline width.
 * Decoupled from viewport size, enabling sidebar/drawer/split-pane responsiveness.
 */
export function useContainerWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth;
    }
    return 1200;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    if (rect.width > 0) {
      setWidth(rect.width);
    }

    if (typeof ResizeObserver === 'undefined') {
      const handleResize = () => {
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.width > 0) setWidth(r.width);
        }
      };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentBoxSize) {
          const contentBoxSize = Array.isArray(entry.contentBoxSize)
            ? entry.contentBoxSize[0]
            : entry.contentBoxSize;
          if (contentBoxSize && typeof contentBoxSize.inlineSize === 'number' && contentBoxSize.inlineSize > 0) {
            setWidth(contentBoxSize.inlineSize);
            continue;
          }
        }
        if (entry.contentRect && entry.contentRect.width > 0) {
          setWidth(entry.contentRect.width);
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

export function CalendarView({ vaultRecipes, currentRecipes, archiveRecipes, forceMode }: CalendarViewProps) {
  const [scheduledMeals, setScheduledMeals] = useState<ScheduledMealData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  // Container width observation for density rules
  const [containerRef, containerWidth] = useContainerWidth<HTMLDivElement>();

  const mode: '1-day' | '3-day' | '7-day' = useMemo(() => {
    if (forceMode) return forceMode;
    if (containerWidth < 500) return '1-day';
    if (containerWidth < 1048) return '3-day';
    return '7-day';
  }, [forceMode, containerWidth]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Week configuration (starting Sunday of current week)
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day;
    const sunday = new Date(today.setDate(diff));
    sunday.setHours(0, 0, 0, 0);
    return sunday;
  });

  // 1-day mode: selected day index (0 = Sun, 6 = Sat)
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(() => {
    return new Date().getDay();
  });

  // 3-day mode: start date of the 3-day window
  const [threeDayStart, setThreeDayStart] = useState<Date>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });

  const getWeekDays = useCallback(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(currentWeekStart);
      date.setDate(currentWeekStart.getDate() + i);
      days.push(date);
    }
    return days;
  }, [currentWeekStart]);

  const getThreeDays = useCallback(() => {
    const days = [];
    for (let i = 0; i < 3; i++) {
      const date = new Date(threeDayStart);
      date.setDate(threeDayStart.getDate() + i);
      days.push(date);
    }
    return days;
  }, [threeDayStart]);

  const visibleDays = useMemo(() => {
    if (mode === '1-day') {
      const weekDays = getWeekDays();
      return [weekDays[selectedDayIndex] || weekDays[0]];
    }
    if (mode === '3-day') {
      return getThreeDays();
    }
    return getWeekDays();
  }, [mode, selectedDayIndex, getWeekDays, getThreeDays]);

  const loadMeals = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let startDate: string;
      let endDate: string;

      if (mode === '3-day') {
        const threeDays = getThreeDays();
        startDate = getLocalDateString(threeDays[0]);
        endDate = getLocalDateString(threeDays[2]);
      } else {
        const days = getWeekDays();
        startDate = getLocalDateString(days[0]);
        endDate = getLocalDateString(days[6]);
      }

      const res = await getScheduledMeals(startDate, endDate);
      if (res.success && res.meals) {
        setScheduledMeals(res.meals as any[]);
      } else {
        setError(res.error || 'Failed to fetch scheduled meals.');
      }
    } catch {
      setError('Error connecting to calendar server.');
    } finally {
      setIsLoading(false);
    }
  }, [mode, getThreeDays, getWeekDays]);

  useEffect(() => {
    loadMeals();
  }, [currentWeekStart, threeDayStart, mode, loadMeals]);

  // Modal / Interaction states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedMealDetail, setSelectedMealDetail] = useState<ScheduledMealData | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Meal Reschedule / Move state inside details modal
  const [isMovingMeal, setIsMovingMeal] = useState(false);
  const [moveDate, setMoveDate] = useState('');
  const [moveType, setMoveType] = useState('Dinner');
  const [isMovingSaving, setIsMovingSaving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  // New meal form state
  const [newMealRecipeId, setNewMealRecipeId] = useState('');
  const [newMealDate, setNewMealDate] = useState('');
  const [newMealType, setNewMealType] = useState('Dinner');
  const [newMealYield, setNewMealYield] = useState(1.0);
  const [newMealParentId, setNewMealParentId] = useState('');

  // Combine all recipes for selection
  const allRecipes = useMemo(() => {
    return [...vaultRecipes, ...currentRecipes, ...archiveRecipes].reduce((acc: VaultRecipe[], current) => {
      const x = acc.find(item => item.slug === current.slug);
      if (!x) {
        return acc.concat([current]);
      } else {
        return acc;
      }
    }, []);
  }, [vaultRecipes, currentRecipes, archiveRecipes]);

  // Unified navigation handlers adapting to active density mode
  const handlePrev = () => {
    if (mode === '1-day') {
      if (selectedDayIndex > 0) {
        setSelectedDayIndex(prev => prev - 1);
      } else {
        const newStart = new Date(currentWeekStart);
        newStart.setDate(currentWeekStart.getDate() - 7);
        setCurrentWeekStart(newStart);
        setSelectedDayIndex(6);
      }
    } else if (mode === '3-day') {
      const newStart = new Date(threeDayStart);
      newStart.setDate(threeDayStart.getDate() - 3);
      setThreeDayStart(newStart);
    } else {
      const newStart = new Date(currentWeekStart);
      newStart.setDate(currentWeekStart.getDate() - 7);
      setCurrentWeekStart(newStart);
    }
  };

  const handleNext = () => {
    if (mode === '1-day') {
      if (selectedDayIndex < 6) {
        setSelectedDayIndex(prev => prev + 1);
      } else {
        const newStart = new Date(currentWeekStart);
        newStart.setDate(currentWeekStart.getDate() + 7);
        setCurrentWeekStart(newStart);
        setSelectedDayIndex(0);
      }
    } else if (mode === '3-day') {
      const newStart = new Date(threeDayStart);
      newStart.setDate(threeDayStart.getDate() + 3);
      setThreeDayStart(newStart);
    } else {
      const newStart = new Date(currentWeekStart);
      newStart.setDate(currentWeekStart.getDate() + 7);
      setCurrentWeekStart(newStart);
    }
  };

  const handleToday = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day;
    const sunday = new Date(today.setDate(diff));
    sunday.setHours(0, 0, 0, 0);
    setCurrentWeekStart(sunday);

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    setThreeDayStart(now);
    setSelectedDayIndex(now.getDay());
  };

  const handleAddMealSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
    e?.preventDefault();
    setFormError(null);

    // Explicit validation with user-facing feedback
    if (!newMealRecipeId) {
      setFormError('Please select a recipe before scheduling.');
      return;
    }
    if (!newMealDate) {
      setFormError('Please select a date for this meal.');
      return;
    }
    if (!newMealType) {
      setFormError('Please select a meal type (Breakfast, Lunch, Dinner, or Snack).');
      return;
    }

    setIsSaving(true);
    try {
      const res = await scheduleMeal(
        newMealRecipeId,
        newMealDate,
        newMealType,
        newMealYield,
        newMealParentId || undefined
      );

      if (res.success) {
        setNewMealRecipeId('');
        setNewMealDate('');
        setNewMealType('Dinner');
        setNewMealYield(1.0);
        setNewMealParentId('');
        setFormError(null);
        setIsAddModalOpen(false);
        loadMeals();
      } else {
        setFormError(res.error || 'Failed to schedule meal. Please try again.');
      }
    } catch (err: any) {
      setFormError(`Error: ${err?.message || 'Connection error while scheduling meal.'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteMeal = async (mealId: string) => {
    if (!confirm('Are you sure you want to cancel this scheduled meal?')) return;
    try {
      const res = await cancelScheduledMeal(mealId);
      if (res.success) {
        setSelectedMealDetail(null);
        loadMeals();
      } else {
        alert(res.error || 'Failed to cancel meal.');
      }
    } catch {
      alert('Error deleting meal.');
    }
  };

  const handleMoveMealAction = async () => {
    if (!selectedMealDetail || !moveDate || !moveType) return;
    setIsMovingSaving(true);
    setMoveError(null);
    try {
      const res = await moveScheduledMeal(selectedMealDetail.id, moveDate, moveType);
      if (res.success) {
        setIsMovingMeal(false);
        setMoveError(null);
        setSelectedMealDetail(null);
        loadMeals();
      } else {
        setMoveError(res.error || 'Failed to move meal.');
      }
    } catch {
      setMoveError('Error connecting to calendar server to reschedule.');
    } finally {
      setIsMovingSaving(false);
    }
  };

  // Helper: Calculate freshness and decay parameters
  const calculateFreshness = (meal: ScheduledMealData) => {
    let decayDays = 0;
    if (meal.parentMealId) {
      const parent = scheduledMeals.find(m => m.id === meal.parentMealId);
      if (parent) {
        const mealTime = new Date(meal.date).getTime();
        const parentTime = new Date(parent.date).getTime();
        decayDays = Math.max(0, Math.floor((mealTime - parentTime) / (1000 * 60 * 60 * 24)));
      }
    }

    if (decayDays <= 1) {
      return { 
        status: 'Fresh', 
        color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10 shadow-[0_0_10px_rgba(16,185,129,0.15)]',
        glow: 'border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]',
        percentage: 100 
      };
    } else if (decayDays <= 3) {
      return { 
        status: 'Leftover', 
        color: 'text-amber-400 border-amber-500/20 bg-amber-500/10 shadow-[0_0_10px_rgba(245,158,11,0.15)]',
        glow: 'border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.2)]',
        percentage: 70 
      };
    } else {
      return { 
        status: 'Eat Soon', 
        color: 'text-rose-400 border-rose-500/20 bg-rose-500/10 shadow-[0_0_10px_rgba(244,63,94,0.15)]',
        glow: 'border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.2)]',
        percentage: 35 
      };
    }
  };

  const getDayName = (date: Date) => {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  };

  const headerDateLabel = useMemo(() => {
    if (mode === '1-day') {
      const activeDay = getWeekDays()[selectedDayIndex] || new Date();
      return formatMealDateFriendlyLong(activeDay);
    }
    if (mode === '3-day') {
      const threeDays = getThreeDays();
      return `${formatMealDateFriendly(threeDays[0])} – ${formatMealDateFriendly(threeDays[2])}, ${threeDays[2].getFullYear()}`;
    }
    const weekDays = getWeekDays();
    return `Week of ${formatMealDateFriendly(weekDays[0])} – ${formatMealDateFriendly(weekDays[6])}, ${weekDays[6].getFullYear()}`;
  }, [mode, selectedDayIndex, getWeekDays, getThreeDays]);

  return (
    <div ref={containerRef} className="w-full relative min-h-screen text-slate-100 pb-20 @container">
      {/* Specular Ambient Glow Orbs */}
      <div className="absolute top-20 left-10 w-96 h-96 bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-fuchsia-500/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Header controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 bg-slate-950/40 p-4 sm:p-6 rounded-2xl border border-white/5 backdrop-blur-md">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="p-2.5 sm:p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
            <Calendar className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Culinary Scheduler
              <span className="text-[10px] sm:text-xs px-2 sm:px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 uppercase tracking-widest font-extrabold">
                {mode === '1-day' ? '1-Day' : mode === '3-day' ? '3-Day' : '7-Day'}
              </span>
            </h2>
            <p className="text-slate-400 text-xs mt-0.5 font-medium">
              {headerDateLabel}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-end">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button 
              onClick={handlePrev}
              className="px-3 sm:px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 border border-white/5 hover:bg-slate-800 transition-colors"
              title="Previous"
            >
              ← Prev
            </button>
            <button 
              onClick={handleToday}
              className="px-3 sm:px-4 py-2 text-xs font-bold rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/30 text-indigo-200 transition-all"
            >
              Today
            </button>
            <button 
              onClick={handleNext}
              className="px-3 sm:px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 border border-white/5 hover:bg-slate-800 transition-colors"
              title="Next"
            >
              Next →
            </button>
          </div>
          
          <button 
            onClick={() => { 
              setFormError(null); 
              setNewMealDate(getLocalDateString(visibleDays[0] || new Date()));
              setIsAddModalOpen(true); 
            }}
            className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2 bg-gradient-to-r from-indigo-500 to-fuchsia-500 hover:from-indigo-600 hover:to-fuchsia-600 rounded-lg text-white font-bold text-xs shadow-lg shadow-indigo-500/20 transition-all border border-indigo-400/20"
          >
            <Plus className="w-4 h-4" />
            <span>Schedule Meal</span>
          </button>
        </div>
      </div>

      {/* 1-Day Mode: 7-Pill Day Selector Strip */}
      {mode === '1-day' && (
        <div className="flex items-center justify-between gap-1.5 p-2 bg-slate-950/40 rounded-2xl border border-white/5 backdrop-blur-md mb-6 overflow-x-auto custom-scrollbar" data-testid="mobile-day-selector">
          {getWeekDays().map((day, idx) => {
            const isSelected = idx === selectedDayIndex;
            const isTodayDay = isToday(day);
            const dayMeals = scheduledMeals.filter(meal => getMealDateString(meal.date) === getLocalDateString(day));
            const hasMeals = dayMeals.length > 0;

            return (
              <button
                key={`pill-${idx}`}
                type="button"
                onClick={() => setSelectedDayIndex(idx)}
                className={`flex-1 min-w-[42px] py-2 px-1 rounded-xl flex flex-col items-center justify-center transition-all ${
                  isSelected
                    ? 'bg-indigo-600 text-white font-bold shadow-[0_0_15px_rgba(99,102,241,0.5)] border border-indigo-400/50'
                    : isTodayDay
                    ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                    : 'bg-slate-900/40 text-slate-400 hover:text-white hover:bg-slate-800 border border-white/5'
                }`}
                title={formatMealDateFriendlyLong(day)}
                aria-pressed={isSelected}
              >
                <span className="text-[10px] uppercase font-bold tracking-wider">
                  {getDayName(day)}
                </span>
                <span className="text-sm font-extrabold mt-0.5">
                  {day.getDate()}
                </span>
                {hasMeals && (
                  <span className={`w-1.5 h-1.5 rounded-full mt-1 ${isSelected ? 'bg-white' : 'bg-indigo-400'}`} />
                )}
              </button>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin"></div>
          <p className="text-slate-400 text-sm italic">Synchronizing weekly planner...</p>
        </div>
      ) : error ? (
        <div className="p-8 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm max-w-xl mx-auto text-center">
          <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
          <p className="font-semibold text-base mb-1">Calendar Sync Lost</p>
          <p className="text-xs text-rose-300/80">{error}</p>
        </div>
      ) : (
        /* Responsive Calendar Grid adapting to container mode */
        <div 
          data-testid="calendar-grid"
          data-mode={mode}
          className={`grid gap-4 ${
            mode === '1-day' 
              ? 'grid-cols-1' 
              : mode === '3-day' 
              ? 'grid-cols-3' 
              : isMounted
              ? 'grid-cols-7'
              : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7'
          }`}
        >
          {visibleDays.map((day, idx) => {
            const dayMeals = scheduledMeals.filter(meal => getMealDateString(meal.date) === getLocalDateString(day));
            const today = isToday(day);

            return (
              <div 
                key={`day-${getLocalDateString(day)}-${idx}`} 
                className={`flex flex-col h-full min-h-[500px] rounded-2xl transition-all border ${
                  today 
                    ? 'bg-indigo-500/5 border-indigo-500/30 shadow-[0_0_30px_rgba(99,102,241,0.1)]' 
                    : 'bg-slate-900/30 border-white/5 hover:border-white/10'
                } backdrop-blur-md relative overflow-hidden`}
              >
                {/* Header of Column */}
                <div className={`p-4 border-b ${today ? 'border-indigo-500/20 bg-indigo-500/10' : 'border-white/5 bg-slate-950/20'} flex items-center justify-between`}>
                  <div>
                    <span className={`text-xs font-black uppercase tracking-wider ${today ? 'text-indigo-400' : 'text-slate-400'}`}>
                      {getDayName(day)}
                    </span>
                    <h3 className="text-lg font-extrabold text-white mt-0.5 leading-none">
                      {day.getDate()}
                    </h3>
                  </div>
                  {today && (
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-ping shadow-[0_0_8px_rgba(129,140,248,1)]" />
                  )}
                </div>

                {/* Day Meals Container */}
                <div className="p-3 flex-1 flex flex-col gap-3 custom-scrollbar overflow-y-auto">
                  {MEAL_TYPES.map(mealType => {
                    const mealsForType = dayMeals.filter(m => m.mealType === mealType);

                    return (
                      <div key={mealType} className="flex flex-col gap-1.5 min-h-[60px]">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">
                          {mealType}
                        </span>

                        {mealsForType.length === 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setFormError(null);
                              setNewMealDate(getLocalDateString(day));
                              setNewMealType(mealType);
                              setIsAddModalOpen(true);
                            }}
                            className="text-[10px] text-slate-600 hover:text-indigo-300 border border-dashed border-white/5 hover:border-indigo-500/30 rounded-xl p-2.5 flex items-center justify-center select-none bg-slate-950/5 hover:bg-indigo-500/5 transition-all cursor-pointer group/empty"
                            title={`Schedule ${mealType} on ${formatMealDateFriendly(day)}`}
                          >
                            <Plus className="w-3 h-3 mr-1 opacity-0 group-hover/empty:opacity-100 transition-opacity text-indigo-400" />
                            <span>Empty</span>
                          </button>
                        ) : (
                          mealsForType.map(meal => {
                            const freshness = calculateFreshness(meal);
                            const baseMacros = extractMacrosFromString(meal.recipe.frontmatter?.macros || '');
                            const scaledCalories = Math.round(baseMacros.calories * meal.plannedYield);

                            return (
                              <motion.div
                                key={meal.id}
                                layoutId={`meal-card-${meal.id}`}
                                onClick={() => {
                                  setSelectedMealDetail(meal);
                                  setIsMovingMeal(false);
                                  setMoveError(null);
                                  setMoveDate(getMealDateString(meal.date));
                                  setMoveType(meal.mealType);
                                }}
                                className={`cursor-pointer group p-3.5 rounded-xl bg-slate-950/50 hover:bg-slate-950/70 border transition-all relative flex flex-col ${freshness.glow}`}
                              >
                                {/* Leftover Line Indicator if parent meal is present */}
                                {meal.parentMealId && (
                                  <div className="absolute top-0 bottom-0 left-0 w-[3px] bg-indigo-500 rounded-l-full" />
                                )}

                                <div className="flex items-start justify-between gap-1 mb-1.5">
                                  <h4 className="text-xs font-bold text-white line-clamp-2 leading-snug group-hover:text-indigo-300 transition-colors">
                                    {meal.recipe.title}
                                  </h4>
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5 mt-auto">
                                  {/* Yield multiplier */}
                                  <span className="text-[9px] font-extrabold bg-slate-800 border border-white/10 px-1.5 py-0.5 rounded text-indigo-300">
                                    {meal.plannedYield}x
                                  </span>

                                  {/* Calories */}
                                  {scaledCalories > 0 && (
                                    <span className="text-[9px] font-medium bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                                      {scaledCalories} kcal
                                    </span>
                                  )}

                                  {/* Freshness Badge */}
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${freshness.color}`}>
                                    {freshness.status}
                                  </span>
                                </div>
                              </motion.div>
                            );
                          })
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Scheduled Meal Modal */}
      {isMounted && createPortal(
        <AnimatePresence>
          {isAddModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
                onClick={() => setIsAddModalOpen(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />

              <motion.div 
                className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl relative z-10 overflow-hidden"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <div className="p-6 border-b border-white/5 bg-slate-950/20 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-400" />
                    Schedule culinary recipe
                  </h3>
                  <button 
                    onClick={() => setIsAddModalOpen(false)}
                    className="p-1 rounded-md text-slate-400 hover:text-white transition-colors"
                  >
                    ✕
                  </button>
                </div>

                <form noValidate onSubmit={handleAddMealSubmit} className="p-6 space-y-4">
                  {/* Recipe selection */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Select Recipe
                    </label>
                    <select
                      required
                      value={newMealRecipeId}
                      onChange={(e) => setNewMealRecipeId(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-lg p-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="" disabled>-- Pick a recipe --</option>
                      {allRecipes.map(r => (
                        <option key={r.id} value={r.slug}>{r.title}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Date selection */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                        Date
                      </label>
                      <input
                        type="date"
                        required
                        value={newMealDate}
                        onChange={(e) => setNewMealDate(e.target.value)}
                        className="w-full bg-slate-950 border border-white/10 rounded-lg p-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    {/* Meal Type */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                        Meal Type
                      </label>
                      <select
                        value={newMealType}
                        onChange={(e) => setNewMealType(e.target.value)}
                        className="w-full bg-slate-950 border border-white/10 rounded-lg p-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                      >
                        {MEAL_TYPES.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Portion/Yield scaler */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                        Planned portion yield
                      </label>
                      <span className="text-xs font-extrabold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                        {newMealYield.toFixed(2)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="4.0"
                      step="0.1"
                      value={newMealYield}
                      onChange={(e) => setNewMealYield(parseFloat(e.target.value))}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500 font-semibold mt-1">
                      <span>0.10x (Light snack)</span>
                      <span>1.0x (Standard)</span>
                      <span>4.00x (Family pack)</span>
                    </div>
                  </div>

                  {/* Leftovers / Parent Meal DAG select */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1">
                      <LinkIcon className="w-3.5 h-3.5 text-indigo-400" />
                      Leftover of (Batch Cooking DAG)
                    </label>
                    <select
                      value={newMealParentId}
                      onChange={(e) => setNewMealParentId(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-lg p-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">-- Freshly Cooked (No parent) --</option>
                      {scheduledMeals.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.recipe.title} (Scheduled on {formatMealDateFriendly(m.date)} for {m.mealType})
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500 mt-1 pl-1">
                      Links this meal to a prior preparation, enabling advanced leftovers freshness decay visualization.
                    </p>
                  </div>

                  {/* Validation Error Display */}
                  {formError && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-rose-300 font-medium">{formError}</p>
                    </div>
                  )}

                  <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                    <button 
                      type="button"
                      onClick={() => setIsAddModalOpen(false)}
                      className="px-4 py-2.5 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 transition-all text-xs font-bold"
                    >
                      Cancel
                    </button>
                    <button 
                      type="button"
                      disabled={isSaving}
                      onClick={handleAddMealSubmit}
                      className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-fuchsia-500 rounded-lg text-white font-extrabold text-xs shadow-lg shadow-indigo-500/20 border border-indigo-400/20 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                    >
                      {isSaving ? 'Scheduling…' : 'Save Schedule'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Scheduled Meal Details Panel Modal */}
      {isMounted && createPortal(
        <AnimatePresence>
          {selectedMealDetail && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
                onClick={() => setSelectedMealDetail(null)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />

              <motion.div 
                layoutId={`meal-card-${selectedMealDetail.id}`}
                className="w-full max-w-2xl bg-slate-900 border border-white/10 rounded-3xl shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[85vh]"
              >
                {/* Decorative radial blur background */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-80 bg-gradient-to-b from-indigo-500/10 via-fuchsia-500/5 to-transparent rounded-full blur-[80px] pointer-events-none" />

                <div className="p-6 border-b border-white/5 flex items-start justify-between relative z-10">
                  <div>
                    <span className="text-[10px] font-bold bg-indigo-500/15 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/20 uppercase tracking-widest">
                      {selectedMealDetail.mealType} Listing
                    </span>
                    <h3 className="text-xl font-extrabold text-white mt-1 leading-snug">
                      {selectedMealDetail.recipe.title}
                    </h3>
                    <p className="text-slate-400 text-xs mt-0.5 font-medium flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      Scheduled for {formatMealDateFriendlyLong(selectedMealDetail.date)}
                    </p>
                  </div>
                  <button 
                    onClick={() => setSelectedMealDetail(null)}
                    className="p-1 rounded-md text-slate-400 hover:text-white transition-colors"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1 relative z-10">
                  
                  {/* Leftover DAG relation badge */}
                  {selectedMealDetail.parentMealId && (
                    <div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 flex items-start gap-3">
                      <LinkIcon className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold text-indigo-200 uppercase tracking-wider">Batch Leftover Dependency</p>
                        <p className="text-xs text-indigo-300/80 mt-0.5">
                          This meal is mapped as a leftover of the preparation cooked on{' '}
                          {(() => {
                            const p = scheduledMeals.find(m => m.id === selectedMealDetail.parentMealId);
                            return p ? `${formatMealDateFriendly(p.date)} (${p.mealType})` : 'another date';
                          })()}
                          .
                         </p>
                      </div>
                    </div>
                  )}

                  {/* Portions Scale details */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-slate-950/40 border border-white/5 flex flex-col justify-center">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5 flex items-center gap-1">
                        <Scale className="w-3.5 h-3.5" /> Portion Multiplier
                      </span>
                      <span className="text-2xl font-black text-white">
                        {selectedMealDetail.plannedYield}x
                      </span>
                      <span className="text-[10px] text-slate-500 mt-0.5">
                        Adjusts quantities & macros on-the-fly
                      </span>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-950/40 border border-white/5 flex flex-col justify-center">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5 flex items-center gap-1">
                        <TrendingDown className="w-3.5 h-3.5" /> Freshness Status
                      </span>
                      <span className={`text-sm font-bold flex items-center gap-1.5 ${calculateFreshness(selectedMealDetail).status === 'Fresh' ? 'text-emerald-400' : calculateFreshness(selectedMealDetail).status === 'Leftover' ? 'text-amber-400' : 'text-rose-400'}`}>
                        <CheckCircle2 className="w-4 h-4" />
                        {calculateFreshness(selectedMealDetail).status} ({calculateFreshness(selectedMealDetail).percentage}% fresh)
                      </span>
                      <span className="text-[10px] text-slate-500 mt-0.5">
                        Based on dynamic storage decay metrics
                      </span>
                    </div>
                  </div>

                  {/* Reschedule / Move Section */}
                  <div className="p-4 rounded-2xl bg-slate-950/40 border border-white/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Move className="w-3.5 h-3.5 text-indigo-400" /> Reschedule / Move Meal
                      </span>
                      {!isMovingMeal && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsMovingMeal(true);
                            setMoveError(null);
                            setMoveDate(getMealDateString(selectedMealDetail.date));
                            setMoveType(selectedMealDetail.mealType);
                          }}
                          className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition-colors"
                        >
                          Change Date / Type
                        </button>
                      )}
                    </div>

                    {isMovingMeal && (
                      <div className="pt-2 border-t border-white/5 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                              New Date
                            </label>
                            <input
                              type="date"
                              value={moveDate}
                              onChange={(e) => setMoveDate(e.target.value)}
                              className="w-full bg-slate-950 border border-white/10 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                              New Meal Type
                            </label>
                            <select
                              value={moveType}
                              onChange={(e) => setMoveType(e.target.value)}
                              className="w-full bg-slate-950 border border-white/10 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                            >
                              {MEAL_TYPES.map(type => (
                                <option key={type} value={type}>{type}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {moveError && (
                          <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-start gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                            <span>{moveError}</span>
                          </div>
                        )}

                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={isMovingSaving}
                            onClick={() => setIsMovingMeal(false)}
                            className="px-3 py-1.5 rounded-lg border border-white/10 text-slate-400 hover:text-white text-xs font-semibold"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={isMovingSaving || !moveDate}
                            onClick={handleMoveMealAction}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30 disabled:opacity-50"
                          >
                            {isMovingSaving ? 'Moving…' : 'Save Changes'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Portions quantities scaling visualizer */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 pl-1">
                      Scaled Ingredient Quantities (Symbolic Engine)
                    </h4>
                    <div className="p-4 rounded-2xl bg-slate-950/30 border border-white/5 space-y-2.5 max-h-40 overflow-y-auto custom-scrollbar">
                      {(() => {
                        // Extract ingredients from markdown (lines starting with - [ ] or - or *)
                        const ingLines = selectedMealDetail.recipe.markdown
                          .split('\n')
                          .filter(l => l.trim().startsWith('-') || l.trim().startsWith('*'))
                          .slice(0, 8); // Top 8 ingredients

                        if (ingLines.length === 0) {
                          return <p className="text-xs text-slate-500 italic">No detailed ingredients catalog found.</p>;
                        }

                        return ingLines.map((line, i) => {
                          const cleanLine = line.replace(/^[-*\s[\]x]*\s*/, '');
                          // Run our Symbolic Math scaler to output scaled versions
                          const scaledLine = scaleQuantity(cleanLine, selectedMealDetail.plannedYield);
                          
                          return (
                            <div key={i} className="flex items-center justify-between text-xs border-b border-white/5 pb-1.5 last:border-0 last:pb-0">
                              <span className="text-slate-400">{cleanLine}</span>
                              <div className="flex items-center gap-2 font-bold">
                                <span className="text-slate-500 text-[10px]">→</span>
                                <span className="text-indigo-400">{scaledLine}</span>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  {/* Scaled Macro profile */}
                  {(() => {
                    const baseMacros = extractMacrosFromString(selectedMealDetail.recipe.frontmatter?.macros || '');
                    const hasMacros = baseMacros.calories > 0 || baseMacros.protein > 0;
                    
                    if (!hasMacros) return null;

                    const scaledCal = Math.round(baseMacros.calories * selectedMealDetail.plannedYield);
                    const scaledPro = Math.round(baseMacros.protein * selectedMealDetail.plannedYield);
                    const scaledCar = Math.round(baseMacros.carbs * selectedMealDetail.plannedYield);
                    const scaledFat = Math.round(baseMacros.fat * selectedMealDetail.plannedYield);

                    return (
                      <div>
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 pl-1">
                          Scaled Macronutrient Yield
                        </h4>
                        <div className="grid grid-cols-4 gap-2.5">
                          <div className="bg-slate-950/50 p-3 rounded-xl border border-white/5 text-center flex flex-col">
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Calories</span>
                            <span className="text-lg font-black text-white mt-0.5">{scaledCal} kcal</span>
                          </div>
                          <div className="bg-emerald-500/5 p-3 rounded-xl border border-emerald-500/10 text-center flex flex-col">
                            <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider">Protein</span>
                            <span className="text-lg font-black text-emerald-400 mt-0.5">{scaledPro}g</span>
                          </div>
                          <div className="bg-sky-500/5 p-3 rounded-xl border border-sky-500/10 text-center flex flex-col">
                            <span className="text-[9px] text-sky-400 font-bold uppercase tracking-wider">Carbs</span>
                            <span className="text-lg font-black text-sky-400 mt-0.5">{scaledCar}g</span>
                          </div>
                          <div className="bg-amber-500/5 p-3 rounded-xl border border-amber-500/10 text-center flex flex-col">
                            <span className="text-[9px] text-amber-400 font-bold uppercase tracking-wider">Fat</span>
                            <span className="text-lg font-black text-amber-400 mt-0.5">{scaledFat}g</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                </div>

                <div className="p-6 border-t border-white/5 bg-slate-950/20 flex justify-between gap-3 relative z-10">
                  <button 
                    onClick={() => handleDeleteMeal(selectedMealDetail.id)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs font-bold transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Cancel Meal</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setSelectedMealDetail(null)}
                      className="px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all"
                    >
                      Close View
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

    </div>
  );
}
