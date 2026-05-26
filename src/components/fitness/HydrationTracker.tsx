'use client';

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Droplet, History, X, Check } from 'lucide-react';
import useSWR from 'swr';
import { useAppStore } from '@/lib/store';
import { HydrationHistory } from './HydrationHistory';

// ── Types ──────────────────────────────────────────────────

interface HydrationEntry {
  id: string;
  amountMl: number;
  timestamp: string;
}

interface HydrationAPIResponse {
  totalWaterMl: number;
  targetWaterMl: number;
  entries: HydrationEntry[];
  date: string;
}

export interface HydrationTrackerProps {
  initialWaterMl?: number;     // server-fetched current intake
  initialTargetMl?: number;    // server-fetched goal (default 1893)
  onWaterLogged?: () => void;  // callback for diary refresh
}

// ── Helpers ────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const ML_PER_FL_OZ = 29.5735;

function formatVolume(ml: number, system: 'metric' | 'imperial'): string {
  if (system === 'imperial') {
    const oz = ml / ML_PER_FL_OZ;
    return `${Math.round(oz)} oz`;
  }
  if (ml >= 1000) {
    return `${(ml / 1000).toFixed(1).replace(/\.0$/, '')}L`;
  }
  return `${Math.round(ml)} ml`;
}

function formatVolumeShort(ml: number, system: 'metric' | 'imperial'): string {
  if (system === 'imperial') {
    const oz = ml / ML_PER_FL_OZ;
    return `${Math.round(oz)}oz`;
  }
  if (ml >= 1000) {
    return `${(ml / 1000).toFixed(1).replace(/\.0$/, '')}L`;
  }
  return `${Math.round(ml)}ml`;
}

function formatButtonLabel(ml: number, system: 'metric' | 'imperial'): string {
  if (system === 'imperial') {
    const oz = Math.round(ml / ML_PER_FL_OZ);
    return `+${oz}oz`;
  }
  return `+${ml}ml`;
}

// ── Radial Progress Ring ───────────────────────────────────

const RING_SIZE = 44;
const RING_STROKE = 4;

const RadialRing = ({
  current,
  target,
  centerLabel,
}: {
  current: number;
  target: number;
  centerLabel: string;
}) => {
  const radius = (RING_SIZE - RING_STROKE) / 2;
  const circumference = radius * 2 * Math.PI;
  const percentage = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative flex-shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }}>
      <svg
        className="transform -rotate-90 w-full h-full drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]"
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-label={`Hydration: ${current}ml of ${target}ml`}
      >
        {/* Background Ring */}
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={RING_STROKE}
          fill="transparent"
          className="text-slate-800/50"
        />
        {/* Progress Ring */}
        <motion.circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={radius}
          stroke="#22d3ee"
          strokeWidth={RING_STROKE}
          fill="transparent"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          style={{ willChange: 'transform' }}
          className="drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]"
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[9px] font-bold text-cyan-300 tracking-tight leading-none">
          {centerLabel}
        </span>
      </div>
    </div>
  );
};

// ── Quick-Add Button ───────────────────────────────────────

const QuickAddButton = ({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) => {
  const [pulsing, setPulsing] = useState(false);

  const handleClick = useCallback(() => {
    setPulsing(true);
    onClick();
    setTimeout(() => setPulsing(false), 300);
  }, [onClick]);

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      animate={pulsing ? { scale: [1, 1.15, 1] } : { scale: 1 }}
      transition={{ duration: 0.3 }}
      className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors cursor-pointer select-none"
    >
      {label}
    </motion.button>
  );
};

// ── Main Component ─────────────────────────────────────────

export const HydrationTracker: React.FC<HydrationTrackerProps> = ({
  initialWaterMl = 0,
  initialTargetMl = 1893,
  onWaterLogged,
}) => {
  const measurementSystem = useAppStore((s) => s.measurementSystem);

  // ── SWR Data ───────────────────────────────────────────
  const { data, mutate } = useSWR<HydrationAPIResponse>('/api/hydration', fetcher, {
    fallbackData: {
      totalWaterMl: initialWaterMl,
      targetWaterMl: initialTargetMl,
      entries: [],
      date: new Date().toISOString().slice(0, 10),
    },
    revalidateOnFocus: true,
    dedupingInterval: 5000,
  });

  const totalWaterMl = data?.totalWaterMl ?? initialWaterMl;
  const targetWaterMl = data?.targetWaterMl ?? initialTargetMl;

  // ── Local state ────────────────────────────────────────
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [goalValue, setGoalValue] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const customInputRef = useRef<HTMLInputElement>(null);
  const goalInputRef = useRef<HTMLInputElement>(null);

  // Focus management
  useEffect(() => {
    if (showCustomInput && customInputRef.current) {
      customInputRef.current.focus();
    }
  }, [showCustomInput]);

  useEffect(() => {
    if (isEditingGoal && goalInputRef.current) {
      goalInputRef.current.focus();
    }
  }, [isEditingGoal]);

  // ── Add water ──────────────────────────────────────────
  const addWater = useCallback(
    async (amountMl: number) => {
      if (amountMl <= 0) return;

      // Optimistic update
      mutate(
        (prev) =>
          prev
            ? {
                ...prev,
                totalWaterMl: prev.totalWaterMl + amountMl,
                entries: [
                  ...prev.entries,
                  {
                    id: `temp-${Date.now()}`,
                    amountMl,
                    timestamp: new Date().toISOString(),
                  },
                ],
              }
            : prev,
        { revalidate: false },
      );

      try {
        await fetch('/api/hydration', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amountMl }),
        });
        // Revalidate to get server truth
        mutate();
        onWaterLogged?.();
      } catch {
        // Revert optimistic update on failure
        mutate();
      }
    },
    [mutate, onWaterLogged],
  );

  // ── Custom input submit ────────────────────────────────
  const handleCustomSubmit = useCallback(() => {
    let ml = parseInt(customValue, 10);
    if (measurementSystem === 'imperial') {
      // User enters oz, convert to ml
      ml = Math.round(ml * ML_PER_FL_OZ);
    }
    if (!isNaN(ml) && ml > 0 && ml <= 5000) {
      addWater(ml);
    }
    setCustomValue('');
    setShowCustomInput(false);
  }, [customValue, measurementSystem, addWater]);

  // ── Goal editing ───────────────────────────────────────
  const startEditingGoal = useCallback(() => {
    const displayValue =
      measurementSystem === 'imperial'
        ? Math.round(targetWaterMl / ML_PER_FL_OZ)
        : targetWaterMl;
    setGoalValue(String(displayValue));
    setIsEditingGoal(true);
  }, [targetWaterMl, measurementSystem]);

  const handleGoalSubmit = useCallback(async () => {
    let ml = parseInt(goalValue, 10);
    if (measurementSystem === 'imperial') {
      ml = Math.round(ml * ML_PER_FL_OZ);
    }

    // Validate: min 250ml, max 10000ml
    if (isNaN(ml) || ml < 250 || ml > 10000) {
      setIsEditingGoal(false);
      return;
    }

    // Optimistic update
    mutate(
      (prev) => (prev ? { ...prev, targetWaterMl: ml } : prev),
      { revalidate: false },
    );

    try {
      await fetch('/api/hydration', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetWaterMl: ml }),
      });
      mutate();
    } catch {
      mutate();
    }

    setIsEditingGoal(false);
  }, [goalValue, measurementSystem, mutate]);

  // ── Derived display values ─────────────────────────────
  const centerLabel = useMemo(
    () => formatVolumeShort(totalWaterMl, measurementSystem),
    [totalWaterMl, measurementSystem],
  );
  const currentDisplay = useMemo(
    () => formatVolume(totalWaterMl, measurementSystem),
    [totalWaterMl, measurementSystem],
  );
  const targetDisplay = useMemo(
    () => formatVolume(targetWaterMl, measurementSystem),
    [targetWaterMl, measurementSystem],
  );

  const quickAddAmounts = [250, 500]; // ml

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col gap-2"
      >
        {/* Top row: Ring + Info + History button */}
        <div className="flex items-center gap-3">
          {/* Radial Progress Ring */}
          <RadialRing
            current={totalWaterMl}
            target={targetWaterMl}
            centerLabel={centerLabel}
          />

          {/* Text info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <Droplet size={13} className="text-cyan-400 flex-shrink-0" />
              <h4 className="text-sm font-medium text-slate-200">Hydration</h4>
            </div>

            <div className="mt-0.5">
              {isEditingGoal ? (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-500">{currentDisplay} /</span>
                  <input
                    ref={goalInputRef}
                    type="number"
                    value={goalValue}
                    onChange={(e) => setGoalValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleGoalSubmit();
                      if (e.key === 'Escape') setIsEditingGoal(false);
                    }}
                    className="w-14 px-1 py-0.5 text-xs bg-slate-800/80 border border-cyan-500/30 rounded text-cyan-300 outline-none focus:border-cyan-400/60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    min={measurementSystem === 'imperial' ? 9 : 250}
                    max={measurementSystem === 'imperial' ? 338 : 10000}
                  />
                  <span className="text-[10px] text-slate-600">
                    {measurementSystem === 'imperial' ? 'oz' : 'ml'}
                  </span>
                  <button
                    type="button"
                    onClick={handleGoalSubmit}
                    className="p-0.5 text-cyan-400 hover:text-cyan-300 cursor-pointer"
                    aria-label="Save goal"
                  >
                    <Check size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingGoal(false)}
                    className="p-0.5 text-slate-500 hover:text-slate-300 cursor-pointer"
                    aria-label="Cancel editing goal"
                  >
                    <X size={11} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={startEditingGoal}
                  className="text-xs text-slate-500 hover:text-cyan-400 transition-colors cursor-pointer"
                  title="Click to edit goal"
                >
                  {currentDisplay} / {targetDisplay}
                </button>
              )}
            </div>
          </div>

          {/* History button */}
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors cursor-pointer"
            aria-label="View hydration history"
          >
            <History size={14} />
          </button>
        </div>

        {/* Quick-add row */}
        <div className="flex items-center gap-1.5 pl-[56px]">
          {quickAddAmounts.map((ml) => (
            <QuickAddButton
              key={ml}
              label={formatButtonLabel(ml, measurementSystem)}
              onClick={() => addWater(ml)}
            />
          ))}

          <AnimatePresence mode="wait">
            {showCustomInput ? (
              <motion.div
                key="custom-input"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className="flex items-center gap-1 overflow-hidden"
              >
                <input
                  ref={customInputRef}
                  type="number"
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCustomSubmit();
                    if (e.key === 'Escape') {
                      setShowCustomInput(false);
                      setCustomValue('');
                    }
                  }}
                  placeholder={measurementSystem === 'imperial' ? 'oz' : 'ml'}
                  className="w-12 px-1.5 py-1 rounded-full text-[10px] bg-slate-800/80 border border-cyan-500/30 text-cyan-300 outline-none focus:border-cyan-400/60 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  onClick={handleCustomSubmit}
                  className="p-0.5 text-cyan-400 hover:text-cyan-300 cursor-pointer"
                  aria-label="Add custom amount"
                >
                  <Check size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomInput(false);
                    setCustomValue('');
                  }}
                  className="p-0.5 text-slate-500 hover:text-slate-300 cursor-pointer"
                  aria-label="Cancel custom input"
                >
                  <X size={12} />
                </button>
              </motion.div>
            ) : (
              <QuickAddButton
                key="custom-btn"
                label="Custom"
                onClick={() => setShowCustomInput(true)}
              />
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Hydration History Modal */}
      <HydrationHistory
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
      />
    </>
  );
};
