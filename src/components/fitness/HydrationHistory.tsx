'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Trash2, Droplet } from 'lucide-react';
import { useAppStore } from '@/lib/store';

// ── Types ──────────────────────────────────────────────────

interface HydrationEntry {
  id: string;
  amountMl: number;
  timestamp: string;
}

interface DayData {
  totalWaterMl: number;
  targetWaterMl: number;
  entries: HydrationEntry[];
}

export interface HydrationHistoryProps {
  isOpen: boolean;
  onClose: () => void;
}

// ── Helpers ────────────────────────────────────────────────

const ML_PER_FL_OZ = 29.5735;

function formatVolume(ml: number, system: 'metric' | 'imperial'): string {
  if (system === 'imperial') {
    const oz = ml / ML_PER_FL_OZ;
    return `${Math.round(oz)} fl oz`;
  }
  if (ml >= 1000) {
    return `${(ml / 1000).toFixed(1).replace(/\.0$/, '')}L`;
  }
  return `${Math.round(ml)} ml`;
}

function getMonthDays(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay(); // 0 = Sunday
}

function formatMonthYear(year: number, month: number) {
  return new Date(year, month).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Overlay Animations ─────────────────────────────────────

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const panelVariants = {
  hidden: { opacity: 0, y: 40, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
  exit: { opacity: 0, y: 30, scale: 0.96, transition: { duration: 0.25 } },
};

// ── Component ──────────────────────────────────────────────

export const HydrationHistory: React.FC<HydrationHistoryProps> = ({ isOpen, onClose }) => {
  const measurementSystem = useAppStore((s) => s.measurementSystem);

  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(
    () => toDateKey(today.getFullYear(), today.getMonth(), today.getDate()),
    [today],
  );

  // ── Month navigation ──────────────────────────────────
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());

  // ── Data cache: Record<YYYY-MM-DD, DayData> ──────────
  const [dayCache, setDayCache] = useState<Record<string, DayData>>({});

  // Reset selected day when month changes
  const navigateMonth = useCallback(
    (delta: number) => {
      setViewMonth((prev) => {
        let newMonth = prev + delta;
        let newYear = viewYear;
        if (newMonth < 0) {
          newMonth = 11;
          newYear -= 1;
        } else if (newMonth > 11) {
          newMonth = 0;
          newYear += 1;
        }
        setViewYear(newYear);
        setSelectedDay(null);
        return newMonth;
      });
    },
    [viewYear],
  );

  // ── Fetch month data ──────────────────────────────────
  const monthKey = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    fetch(`/api/hydration?month=${monthKey}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        // Expect either an object keyed by date, or an array
        if (data && typeof data === 'object') {
          if (Array.isArray(data.days)) {
            // Array format: [{ date, totalWaterMl, targetWaterMl, entries }]
            const cache: Record<string, DayData> = {};
            for (const day of data.days) {
              cache[day.date] = {
                totalWaterMl: day.totalWaterMl ?? 0,
                targetWaterMl: day.targetWaterMl ?? 1893,
                entries: day.entries ?? [],
              };
            }
            setDayCache((prev) => ({ ...prev, ...cache }));
          } else if (data.date && data.totalWaterMl !== undefined) {
            // Single day response — store it
            setDayCache((prev) => ({
              ...prev,
              [data.date]: {
                totalWaterMl: data.totalWaterMl,
                targetWaterMl: data.targetWaterMl ?? 1893,
                entries: data.entries ?? [],
              },
            }));
          }
        }
      })
      .catch(() => {
        // Silently fail — calendar will show empty dots
      })
      .finally(() => {
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, monthKey]);

  // ── Fetch individual day when selected ────────────────
  useEffect(() => {
    if (!isOpen || selectedDay === null) return;

    const dateKey = toDateKey(viewYear, viewMonth, selectedDay);
    // Skip if we already have detailed data with entries
    if (dayCache[dateKey]?.entries?.length) return;

    let cancelled = false;

    fetch(`/api/hydration?date=${dateKey}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data) return;
        setDayCache((prev) => ({
          ...prev,
          [dateKey]: {
            totalWaterMl: data.totalWaterMl ?? 0,
            targetWaterMl: data.targetWaterMl ?? 1893,
            entries: data.entries ?? [],
          },
        }));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedDay, viewYear, viewMonth, dayCache]);

  // ── Delete entry ───────────────────────────────────────
  const deleteEntry = useCallback(
    async (entryId: string, dateKey: string) => {
      // Optimistic removal
      setDayCache((prev) => {
        const day = prev[dateKey];
        if (!day) return prev;
        const entry = day.entries.find((e) => e.id === entryId);
        const removedMl = entry?.amountMl ?? 0;
        return {
          ...prev,
          [dateKey]: {
            ...day,
            totalWaterMl: Math.max(0, day.totalWaterMl - removedMl),
            entries: day.entries.filter((e) => e.id !== entryId),
          },
        };
      });

      try {
        await fetch(`/api/hydration?id=${entryId}`, { method: 'DELETE' });
      } catch {
        // Revert by refetching
        const res = await fetch(`/api/hydration?date=${dateKey}`);
        const data = await res.json();
        if (data) {
          setDayCache((prev) => ({
            ...prev,
            [dateKey]: {
              totalWaterMl: data.totalWaterMl ?? 0,
              targetWaterMl: data.targetWaterMl ?? 1893,
              entries: data.entries ?? [],
            },
          }));
        }
      }
    },
    [],
  );

  // ── Calendar grid computation ─────────────────────────
  const daysInMonth = getMonthDays(viewYear, viewMonth);
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth);
  const isFutureMonth =
    viewYear > today.getFullYear() ||
    (viewYear === today.getFullYear() && viewMonth > today.getMonth());

  // ── Monthly summary stats ─────────────────────────────
  const monthStats = useMemo(() => {
    let totalIntake = 0;
    let daysWithData = 0;
    let daysGoalMet = 0;
    let currentStreak = 0;
    let streakBroken = false;

    // Walk backwards from today (or last day of month) to compute streak
    const lastDay =
      viewYear === today.getFullYear() && viewMonth === today.getMonth()
        ? today.getDate()
        : daysInMonth;

    for (let d = lastDay; d >= 1; d--) {
      const key = toDateKey(viewYear, viewMonth, d);
      const day = dayCache[key];
      if (day && day.totalWaterMl > 0) {
        totalIntake += day.totalWaterMl;
        daysWithData++;
        if (day.totalWaterMl >= day.targetWaterMl) {
          daysGoalMet++;
          if (!streakBroken) currentStreak++;
        } else {
          streakBroken = true;
        }
      } else {
        // If it's a past day with no data, break streak
        const dayDate = new Date(viewYear, viewMonth, d);
        if (dayDate <= today) {
          streakBroken = true;
        }
      }
    }

    const avgDaily = daysWithData > 0 ? Math.round(totalIntake / daysWithData) : 0;

    return { avgDaily, daysGoalMet, currentStreak };
  }, [dayCache, viewYear, viewMonth, daysInMonth, today]);

  // ── Selected day data ─────────────────────────────────
  const selectedDateKey =
    selectedDay !== null ? toDateKey(viewYear, viewMonth, selectedDay) : null;
  const selectedDayData = selectedDateKey ? dayCache[selectedDateKey] : null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xl flex items-start justify-center overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative max-w-lg w-full mx-4 mt-20 mb-8 p-6 rounded-3xl bg-slate-900/80 backdrop-blur-3xl border border-white/10 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Specular edges */}
            <div className="absolute inset-0 rounded-3xl border-t border-t-white/20 border-l border-l-white/10 pointer-events-none" />

            {/* Radial orbs */}
            <div className="absolute -top-20 -left-20 w-56 h-56 bg-cyan-500/15 rounded-full blur-[80px] pointer-events-none" />
            <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-blue-500/10 rounded-full blur-[80px] pointer-events-none" />

            {/* Header */}
            <div className="relative flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Droplet size={18} className="text-cyan-400" />
                <h2 className="text-lg font-semibold text-slate-100">Hydration History</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Month navigation */}
            <div className="relative flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={() => navigateMonth(-1)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Previous month"
              >
                <ChevronLeft size={18} />
              </button>
              <h3 className="text-sm font-medium text-slate-300">
                {formatMonthYear(viewYear, viewMonth)}
              </h3>
              <button
                type="button"
                onClick={() => navigateMonth(1)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Next month"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Calendar grid */}
            <div className="relative">
              {/* Weekday headers */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {WEEKDAY_LABELS.map((label) => (
                  <div
                    key={label}
                    className="text-[10px] font-medium text-slate-500 text-center uppercase tracking-wider"
                  >
                    {label}
                  </div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7 gap-1">
                {/* Empty cells for offset */}
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-10" />
                ))}

                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dateKey = toDateKey(viewYear, viewMonth, day);
                  const isToday = dateKey === todayKey;
                  const isSelected = selectedDay === day;
                  const dayData = dayCache[dateKey];

                  // Determine if this is a future day
                  const isFutureDay =
                    isFutureMonth ||
                    (viewYear === today.getFullYear() &&
                      viewMonth === today.getMonth() &&
                      day > today.getDate());

                  // Dot color
                  let dotClass = 'bg-slate-700';
                  if (isFutureDay) {
                    dotClass = 'bg-slate-800/50';
                  } else if (dayData) {
                    const pct =
                      dayData.targetWaterMl > 0
                        ? dayData.totalWaterMl / dayData.targetWaterMl
                        : 0;
                    if (pct >= 1) dotClass = 'bg-cyan-400';
                    else if (pct >= 0.5) dotClass = 'bg-cyan-400/50';
                  }

                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        if (!isFutureDay) setSelectedDay(day);
                      }}
                      disabled={isFutureDay}
                      className={`
                        relative h-10 flex flex-col items-center justify-center gap-0.5 rounded-lg transition-colors cursor-pointer
                        ${isSelected ? 'bg-cyan-500/15' : 'hover:bg-white/5'}
                        ${isToday ? 'ring-1 ring-cyan-400/50' : ''}
                        ${isFutureDay ? 'opacity-40 cursor-default' : ''}
                      `}
                      aria-label={`${day} ${formatMonthYear(viewYear, viewMonth)}`}
                    >
                      <span
                        className={`text-xs ${
                          isSelected
                            ? 'text-cyan-300 font-semibold'
                            : isToday
                              ? 'text-cyan-400 font-medium'
                              : 'text-slate-400'
                        }`}
                      >
                        {day}
                      </span>
                      <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected day detail */}
            <AnimatePresence mode="wait">
              {selectedDay !== null && selectedDateKey && (
                <motion.div
                  key={selectedDateKey}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 overflow-hidden"
                >
                  <div className="p-4 rounded-2xl bg-slate-800/40 border border-white/5">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium text-slate-200">
                        {new Date(viewYear, viewMonth, selectedDay).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </h4>
                      <span className="text-xs font-medium text-cyan-400">
                        {selectedDayData
                          ? formatVolume(selectedDayData.totalWaterMl, measurementSystem)
                          : '0 ml'}
                      </span>
                    </div>

                    {!selectedDayData || selectedDayData.entries.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-3">
                        No entries recorded
                      </p>
                    ) : (
                      <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                        {selectedDayData.entries.map((entry) => (
                          <div
                            key={entry.id}
                            className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-900/40 border border-white/5"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-500 font-mono">
                                {new Date(entry.timestamp).toLocaleTimeString('en-US', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                              <span className="text-xs text-slate-300">
                                {formatVolume(entry.amountMl, measurementSystem)}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => deleteEntry(entry.id, selectedDateKey)}
                              className="p-1 text-slate-600 hover:text-rose-400 transition-colors cursor-pointer"
                              aria-label={`Delete entry of ${entry.amountMl}ml`}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Monthly summary stats */}
            <div className="relative mt-5 grid grid-cols-3 gap-3">
              <div className="flex flex-col items-center p-3 rounded-2xl bg-slate-800/30 border border-white/5">
                <span className="text-lg font-semibold text-cyan-300">
                  {formatVolume(monthStats.avgDaily, measurementSystem)}
                </span>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">
                  Avg / Day
                </span>
              </div>
              <div className="flex flex-col items-center p-3 rounded-2xl bg-slate-800/30 border border-white/5">
                <span className="text-lg font-semibold text-cyan-300">
                  {monthStats.daysGoalMet}
                </span>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">
                  Goals Met
                </span>
              </div>
              <div className="flex flex-col items-center p-3 rounded-2xl bg-slate-800/30 border border-white/5">
                <span className="text-lg font-semibold text-cyan-300">
                  {monthStats.currentStreak}
                </span>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">
                  Streak 🔥
                </span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
