'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Play, Square, Award, Edit2, Check, X, History, Trash2, ShieldAlert } from 'lucide-react';
import useSWR from 'swr';

// ── Types ──────────────────────────────────────────────────
interface FastingLog {
  id: string;
  userId: string;
  startTime: string;
  endTime: string | null;
  targetHours: number;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FastingAPIResponse {
  activeFast: FastingLog | null;
  completedFasts: FastingLog[];
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ── Sage Wellness Insights based on duration ───────────────
function getSageWellnessInsight(hours: number): { title: string; desc: string } {
  if (hours < 4) {
    return {
      title: "Anabolic Phase",
      desc: "🌿 Your body is digesting your last meal. Blood glucose levels rise slightly and insulin is secreted to absorb nutrients.",
    };
  } else if (hours < 8) {
    // 4-8h
    return {
      title: "Post-Absorptive Phase",
      desc: "🌿 Blood sugar begins to return to baseline. Insulin secretion declines, and your digestive system starts resting.",
    };
  } else if (hours < 12) {
    // 8-12h
    return {
      title: "Glycogen Depletion",
      desc: "🌿 Liver glycogen levels decrease. Your body starts transitioning from using food-derived glucose to stored glycogen for fuel.",
    };
  } else if (hours < 18) {
    // 12-18h
    return {
      title: "Ketosis Transition",
      desc: "🌿 Glycogen stores are mostly depleted. Fat oxidation increases, and your liver begins generating ketones for energy.",
    };
  } else if (hours < 24) {
    // 18-24h
    return {
      title: "Autophagy Induction",
      desc: "🌿 Autophagy begins. Cellular rejuvenation kicks in, recycling damaged organelles, misfolded proteins, and pathogenetic structures.",
    };
  } else {
    // >24h
    return {
      title: "Deep Ketosis & Autophagy",
      desc: "🌿 Growth hormone surges, protecting muscle mass. Autophagy peaks, promoting systemic inflammation reduction and metabolic elasticity.",
    };
  }
}

// ── Format helpers ─────────────────────────────────────────
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [
    h.toString().padStart(2, '0'),
    m.toString().padStart(2, '0'),
    s.toString().padStart(2, '0'),
  ].join(':');
}

export function FastingTimer() {
  // ── SWR state ────────────────────────────────────────────
  const { data, mutate } = useSWR<FastingAPIResponse>('/api/fasting', fetcher);
  
  const activeFast = data?.activeFast ?? null;
  const completedFasts = data?.completedFasts ?? [];

  // ── Local interactive UI state ───────────────────────────
  const [selectedTarget, setSelectedTarget] = useState<number>(16);
  const [isCustomTarget, setIsCustomTarget] = useState<boolean>(false);
  const [customHours, setCustomHours] = useState<string>('16');
  
  const [retroactiveHoursAgo, setRetroactiveHoursAgo] = useState<number>(0);
  const [isStartedAgo, setIsStartedAgo] = useState<boolean>(false);

  // Timer ticker
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Edit states
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editStartTime, setEditStartTime] = useState<string>('');
  const [editTargetHours, setEditTargetHours] = useState<number>(16);

  // Toggle history view
  const [showHistory, setShowHistory] = useState<boolean>(false);

  // Update live clock ticking
  useEffect(() => {
    if (!activeFast) {
      setElapsedSeconds(0);
      return;
    }

    const startMs = new Date(activeFast.startTime).getTime();
    
    const updateTicker = () => {
      const diffSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      setElapsedSeconds(diffSec);
    };

    updateTicker();
    const interval = setInterval(updateTicker, 1000);
    return () => clearInterval(interval);
  }, [activeFast]);

  // Preset configuration
  const presets = [
    { label: '16:8', hours: 16 },
    { label: '18:6', hours: 18 },
    { label: '20:4', hours: 20 },
    { label: '24h', hours: 24 },
  ];

  // ── Action handlers ──────────────────────────────────────
  const handleStartFast = useCallback(async () => {
    let finalTarget = selectedTarget;
    if (isCustomTarget) {
      const parsed = parseInt(customHours, 10);
      finalTarget = !isNaN(parsed) && parsed > 0 ? parsed : 16;
    }

    const now = new Date();
    if (retroactiveHoursAgo > 0) {
      now.setHours(now.getHours() - retroactiveHoursAgo);
    }

    // Optimistic Update
    mutate(
      (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          activeFast: {
            id: 'temp-fast',
            userId: 'user-id',
            startTime: now.toISOString(),
            endTime: null,
            targetHours: finalTarget,
            completed: false,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
        };
      },
      { revalidate: false }
    );

    try {
      await fetch('/api/fasting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime: now.toISOString(),
          targetHours: finalTarget,
        }),
      });
      mutate();
    } catch (e) {
      console.error(e);
      mutate();
    }
  }, [selectedTarget, isCustomTarget, customHours, retroactiveHoursAgo, mutate]);

  const handleStopFast = useCallback(async () => {
    if (!activeFast) return;

    mutate(
      (prev) => {
        if (!prev || !prev.activeFast) return prev;
        return {
          ...prev,
          activeFast: null,
          completedFasts: [
            {
              ...prev.activeFast,
              endTime: new Date().toISOString(),
              completed: (elapsedSeconds / 3600) >= prev.activeFast.targetHours,
            },
            ...prev.completedFasts,
          ],
        };
      },
      { revalidate: false }
    );

    try {
      await fetch('/api/fasting', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'stop',
        }),
      });
      mutate();
    } catch (e) {
      console.error(e);
      mutate();
    }
  }, [activeFast, elapsedSeconds, mutate]);

  const handleOpenEdit = useCallback(() => {
    if (!activeFast) return;
    // Format to local date time input value (YYYY-MM-DDTHH:MM)
    const d = new Date(activeFast.startTime);
    const tzOffset = d.getTimezoneOffset() * 60000;
    const localISO = new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
    setEditStartTime(localISO);
    setEditTargetHours(activeFast.targetHours);
    setIsEditing(true);
  }, [activeFast]);

  const handleSaveEdit = useCallback(async () => {
    if (!activeFast) return;
    const finalStart = new Date(editStartTime);
    if (isNaN(finalStart.getTime())) return;

    mutate(
      (prev) => {
        if (!prev || !prev.activeFast) return prev;
        return {
          ...prev,
          activeFast: {
            ...prev.activeFast,
            startTime: finalStart.toISOString(),
            targetHours: editTargetHours,
          },
        };
      },
      { revalidate: false }
    );

    try {
      await fetch('/api/fasting', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit',
          id: activeFast.id,
          startTime: finalStart.toISOString(),
          targetHours: editTargetHours,
        }),
      });
      setIsEditing(false);
      mutate();
    } catch (e) {
      console.error(e);
      mutate();
    }
  }, [activeFast, editStartTime, editTargetHours, mutate]);

  const handleDeleteFast = useCallback(async (id: string) => {
    mutate(
      (prev) => {
        if (!prev) return prev;
        return {
          activeFast: prev.activeFast?.id === id ? null : prev.activeFast,
          completedFasts: prev.completedFasts.filter((f) => f.id !== id),
        };
      },
      { revalidate: false }
    );

    try {
      await fetch(`/api/fasting?id=${id}`, {
        method: 'DELETE',
      });
      mutate();
    } catch (e) {
      console.error(e);
      mutate();
    }
  }, [mutate]);

  // ── Derived Math for progress ring ──────────────────────────
  const targetHours = activeFast ? activeFast.targetHours : (isCustomTarget ? parseInt(customHours, 10) || 16 : selectedTarget);
  const targetSeconds = targetHours * 3600;
  const percentage = Math.min((elapsedSeconds / targetSeconds) * 100, 100);

  const RING_SIZE = 170;
  const STROKE_WIDTH = 6;
  const radius = (RING_SIZE - STROKE_WIDTH) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const hoursElapsed = elapsedSeconds / 3600;
  const wellnessInsight = useMemo(() => getSageWellnessInsight(hoursElapsed), [hoursElapsed]);

  return (
    <div className="p-6 rounded-3xl bg-slate-900/30 backdrop-blur-2xl border border-white/5 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] relative overflow-hidden">
      
      {/* Background radial highlight orbs */}
      <div className="absolute top-0 right-0 w-36 h-36 bg-indigo-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-36 h-36 bg-fuchsia-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />

      {/* Card Header */}
      <div className="flex items-center justify-between mb-6 relative z-10">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-indigo-400" />
          <h3 className="text-base font-semibold text-slate-200">Intermittent Fasting</h3>
        </div>
        
        <div className="flex items-center gap-1.5">
          {activeFast && (
            <button
              onClick={handleOpenEdit}
              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
              title="Edit start time or target hours"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`p-1.5 rounded-lg transition-colors ${showHistory ? 'text-indigo-400 bg-indigo-500/10' : 'text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10'}`}
            title="View fasting history"
          >
            <History className="w-4 h-4" />
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {showHistory ? (
          /* ── Fasting History Drawer ── */
          <motion.div
            key="history-panel"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3 }}
            className="space-y-3 min-h-[220px]"
          >
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Completed Fasts</span>
              <button
                onClick={() => setShowHistory(false)}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Back to Timer
              </button>
            </div>
            
            {completedFasts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-500 text-center">
                <Award className="w-8 h-8 text-slate-700 mb-2" />
                <p className="text-xs">No completed fasts recorded yet.</p>
                <p className="text-[10px] text-slate-600 mt-1">Complete your first fast to see metrics here.</p>
              </div>
            ) : (
              <div className="max-h-[240px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {completedFasts.map((fast) => {
                  const start = new Date(fast.startTime);
                  const end = fast.endTime ? new Date(fast.endTime) : null;
                  const elapsedHrs = end ? (end.getTime() - start.getTime()) / 3600000 : 0;
                  
                  return (
                    <div 
                      key={fast.id}
                      className="flex items-center justify-between p-3 rounded-2xl bg-slate-900/50 border border-white/5 hover:border-white/10 transition-colors shadow-sm"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-slate-200">
                            {elapsedHrs.toFixed(1)} hrs Completed
                          </span>
                          {fast.completed ? (
                            <span className="px-1.5 py-0.25 text-[8px] font-bold bg-indigo-500/10 text-indigo-400 rounded-full border border-indigo-500/20 uppercase tracking-wide">
                              Success
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.25 text-[8px] font-bold bg-slate-500/10 text-slate-400 rounded-full border border-slate-500/20 uppercase tracking-wide">
                              Ended early
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 mt-0.5 block">
                          {start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at {start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-500 font-mono">
                          Target: {fast.targetHours}h
                        </span>
                        <button
                          onClick={() => handleDeleteFast(fast.id)}
                          className="p-1 rounded text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          title="Delete entry"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        ) : isEditing ? (
          /* ── Edit Active Fast Modal ── */
          <motion.div
            key="edit-panel"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="space-y-4 py-4 min-h-[220px]"
          >
            <div className="flex items-center gap-2 border-b border-white/5 pb-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-semibold text-slate-200 uppercase tracking-wide">Edit Active Fast</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">
                  Adjust Start Time
                </label>
                <input
                  type="datetime-local"
                  value={editStartTime}
                  onChange={(e) => setEditStartTime(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-950/60 border border-white/10 rounded-xl text-slate-200 outline-none focus:border-indigo-500/40"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">
                  Adjust Target Hours ({editTargetHours}h)
                </label>
                <input
                  type="range"
                  min="4"
                  max="48"
                  step="1"
                  value={editTargetHours}
                  onChange={(e) => setEditTargetHours(parseInt(e.target.value, 10))}
                  className="w-full accent-indigo-500 h-1.5 bg-slate-950/60 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-slate-600 mt-1">
                  <span>4 hrs</span>
                  <span>12 hrs</span>
                  <span>16 hrs</span>
                  <span>24 hrs</span>
                  <span>36 hrs</span>
                  <span>48 hrs</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSaveEdit}
                className="flex-1 py-2 rounded-xl text-xs font-medium bg-gradient-to-r from-indigo-500 to-fuchsia-500 hover:from-indigo-600 hover:to-fuchsia-600 text-white transition-colors cursor-pointer shadow-[0_4px_16px_rgba(139,92,246,0.3)] flex items-center justify-center gap-1"
              >
                <Check className="w-3.5 h-3.5" /> Save Changes
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium bg-slate-800/80 hover:bg-slate-800 text-slate-300 transition-colors border border-white/5 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        ) : activeFast ? (
          /* ── ACTIVE FAST DISPLAY ── */
          <motion.div
            key="active-timer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center"
          >
            {/* Circular Progress Path */}
            <div className="relative mb-5" style={{ width: RING_SIZE, height: RING_SIZE }}>
              <svg
                className="transform -rotate-90 w-full h-full drop-shadow-[0_0_12px_rgba(139,92,246,0.15)]"
                viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
              >
                <defs>
                  <linearGradient id="active-fasting-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#818cf8" /> {/* Indigo-400 */}
                    <stop offset="100%" stopColor="#f472b6" /> {/* Pink-400 */}
                  </linearGradient>
                </defs>

                {/* Outer Ring Shadow Path */}
                <circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={radius}
                  stroke="currentColor"
                  strokeWidth={STROKE_WIDTH}
                  fill="transparent"
                  className="text-slate-800/40"
                />

                {/* Completed Dash Ring */}
                <motion.circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={radius}
                  stroke="url(#active-fasting-gradient)"
                  strokeWidth={STROKE_WIDTH}
                  fill="transparent"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  animate={{ strokeDashoffset }}
                  transition={{ duration: 1.0, ease: 'easeOut' }}
                  style={{ willChange: 'transform' }}
                />
              </svg>

              {/* Ticking Time inside the Ring */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[10px] font-semibold text-indigo-400 tracking-widest uppercase">
                  Fasting
                </span>
                <span className="text-2xl font-mono font-bold text-white tracking-tight leading-none mt-1">
                  {formatDuration(elapsedSeconds)}
                </span>
                <span className="text-[10px] text-slate-500 mt-1">
                  Target: {activeFast.targetHours}h
                </span>
                <span className="text-[9px] font-semibold text-slate-400 mt-0.5">
                  {percentage.toFixed(0)}%
                </span>
              </div>
            </div>

            {/* Stop Fasting triggers */}
            <div className="w-full space-y-4">
              <button
                onClick={handleStopFast}
                className="w-full py-3 rounded-2xl font-medium bg-gradient-to-r from-red-500/20 to-rose-500/20 hover:from-red-500/30 hover:to-rose-500/30 text-rose-400 border border-rose-500/20 transition-all cursor-pointer shadow-lg flex items-center justify-center gap-2 group text-sm"
              >
                <Square className="w-4 h-4 fill-current group-hover:scale-90 transition-transform" />
                End Fast & Log
              </button>

              {/* Sage's Wellness Insight */}
              <div className="p-3.5 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 text-xs shadow-inner">
                <p className="font-semibold text-indigo-300 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
                  {wellnessInsight.title}
                </p>
                <p className="text-slate-400 mt-1 text-[11px] leading-relaxed">
                  {wellnessInsight.desc}
                </p>
              </div>
            </div>
          </motion.div>
        ) : (
          /* ── INACTIVE TIMER SECTOR ── */
          <motion.div
            key="inactive-timer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {/* Fasting Plan Selectors */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-wider text-slate-500 block">
                Fasting Schedule Target
              </label>
              
              <div className="grid grid-cols-4 gap-2">
                {presets.map((p) => (
                  <button
                    key={p.hours}
                    type="button"
                    onClick={() => {
                      setSelectedTarget(p.hours);
                      setIsCustomTarget(false);
                    }}
                    className={`py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      selectedTarget === p.hours && !isCustomTarget
                        ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30 shadow-[0_0_12px_rgba(99,102,241,0.2)]'
                        : 'bg-slate-950/40 text-slate-400 border-white/5 hover:border-white/10 hover:text-slate-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Custom Programs Toggle */}
              <div className="flex gap-2 items-center">
                <button
                  type="button"
                  onClick={() => setIsCustomTarget(!isCustomTarget)}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-semibold border transition-all cursor-pointer ${
                    isCustomTarget
                      ? 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/30'
                      : 'bg-slate-950/40 text-slate-500 border-white/5 hover:border-white/10'
                  }`}
                >
                  Custom Target (Hours)
                </button>
                
                {isCustomTarget && (
                  <input
                    type="number"
                    min="1"
                    max="168"
                    value={customHours}
                    onChange={(e) => setCustomHours(e.target.value)}
                    className="w-16 px-2 py-1 text-xs bg-slate-950/60 border border-fuchsia-500/30 rounded-lg text-fuchsia-300 text-center outline-none focus:border-fuchsia-400"
                  />
                )}
              </div>
            </div>

            {/* Retroactive start checkbox */}
            <div className="space-y-2 pt-1 border-t border-white/5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase tracking-wider text-slate-500">
                  Did you start earlier?
                </label>
                <button
                  type="button"
                  onClick={() => setIsStartedAgo(!isStartedAgo)}
                  className={`text-[10px] font-medium transition-colors ${isStartedAgo ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-400'}`}
                >
                  {isStartedAgo ? 'Adjust Start Time' : 'Started retroactively?'}
                </button>
              </div>

              {isStartedAgo && (
                <div className="p-3 rounded-2xl bg-slate-950/40 border border-white/5 space-y-2">
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Started:</span>
                    <span className="font-semibold text-indigo-400 font-mono">
                      {retroactiveHoursAgo === 0 ? 'Now' : `${retroactiveHoursAgo} ${retroactiveHoursAgo === 1 ? 'hour' : 'hours'} ago`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="24"
                    step="0.5"
                    value={retroactiveHoursAgo}
                    onChange={(e) => setRetroactiveHoursAgo(parseFloat(e.target.value))}
                    className="w-full accent-indigo-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[8px] text-slate-600">
                    <span>Now</span>
                    <span>6h ago</span>
                    <span>12h ago</span>
                    <span>18h ago</span>
                    <span>24h ago</span>
                  </div>
                </div>
              )}
            </div>

            {/* Start Fast Button */}
            <button
              onClick={handleStartFast}
              className="w-full py-3.5 rounded-2xl font-semibold bg-gradient-to-r from-indigo-500 to-fuchsia-500 hover:from-indigo-600 hover:to-fuchsia-600 text-white transition-all cursor-pointer shadow-[0_4px_24px_rgba(139,92,246,0.3)] flex items-center justify-center gap-2 group text-sm relative overflow-hidden"
            >
              <Play className="w-4 h-4 fill-current group-hover:translate-x-0.5 transition-transform" />
              Begin Fasting Phase
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
