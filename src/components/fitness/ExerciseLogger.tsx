'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dumbbell,
  Flame,
  Clock,
  X,
  Check,
  Zap,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────
export interface ExerciseEntry {
  exerciseName: string;
  durationMinutes: number;
  caloriesBurned: number;
}

export interface ExerciseLoggerProps {
  isOpen: boolean;
  onClose: () => void;
  onLogged?: (entry: ExerciseEntry) => void;
}

// ── MET values for preset exercises ────────────────────────────────────────────
const EXERCISE_PRESETS: { label: string; met: number; icon: React.ReactNode }[] = [
  { label: 'Walking',         met: 3.5, icon: <Zap   className="w-3.5 h-3.5" /> },
  { label: 'Running',         met: 8.0, icon: <Flame className="w-3.5 h-3.5" /> },
  { label: 'Cycling',         met: 6.0, icon: <Zap   className="w-3.5 h-3.5" /> },
  { label: 'Swimming',        met: 7.0, icon: <Zap   className="w-3.5 h-3.5" /> },
  { label: 'Weight Training', met: 5.0, icon: <Dumbbell className="w-3.5 h-3.5" /> },
  { label: 'Yoga',            met: 3.0, icon: <Zap   className="w-3.5 h-3.5" /> },
  { label: 'HIIT',            met: 8.5, icon: <Flame className="w-3.5 h-3.5" /> },
  { label: 'Dancing',         met: 5.5, icon: <Zap   className="w-3.5 h-3.5" /> },
];

const DEFAULT_WEIGHT_KG = 70;

/** Calculate calories burned using the MET formula */
function estimateCalories(met: number, durationMinutes: number, weightKg = DEFAULT_WEIGHT_KG): number {
  return Math.round((met * 3.5 * weightKg) / 200 * durationMinutes);
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function ExerciseLogger({ isOpen, onClose, onLogged }: ExerciseLoggerProps) {
  const [exerciseName, setExerciseName] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [caloriesBurned, setCaloriesBurned] = useState(0);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [manualCalories, setManualCalories] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Re-estimate calories when preset or duration changes (unless manual override)
  useEffect(() => {
    if (manualCalories || !selectedPreset) return;
    const preset = EXERCISE_PRESETS.find((p) => p.label === selectedPreset);
    if (preset) {
      setCaloriesBurned(estimateCalories(preset.met, durationMinutes));
    }
  }, [selectedPreset, durationMinutes, manualCalories]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setExerciseName('');
      setDurationMinutes(30);
      setCaloriesBurned(0);
      setSelectedPreset(null);
      setManualCalories(false);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handlePresetSelect = useCallback((label: string) => {
    setSelectedPreset(label);
    setExerciseName(label);
    setManualCalories(false);
    const preset = EXERCISE_PRESETS.find((p) => p.label === label);
    if (preset) {
      setCaloriesBurned(estimateCalories(preset.met, durationMinutes));
    }
  }, [durationMinutes]);

  const handleCaloriesChange = useCallback((value: number) => {
    setManualCalories(true);
    setCaloriesBurned(Math.max(0, value));
  }, []);

  const handleDurationChange = useCallback((delta: number) => {
    setDurationMinutes((prev) => Math.max(1, prev + delta));
  }, []);

  const canSubmit = exerciseName.trim().length > 0 && durationMinutes > 0 && caloriesBurned >= 0;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || isSubmitting) return;
    setIsSubmitting(true);

    const entry: ExerciseEntry = {
      exerciseName: exerciseName.trim(),
      durationMinutes,
      caloriesBurned,
    };

    try {
      const res = await fetch('/api/exercise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });

      if (!res.ok) throw new Error('Failed to log exercise');

      onLogged?.(entry);
      onClose();
    } catch (err) {
      console.error('[ExerciseLogger] submit error:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [canSubmit, isSubmitting, exerciseName, durationMinutes, caloriesBurned, onLogged, onClose]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="exercise-logger-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Card */}
          <motion.div
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 border-t-white/20 bg-slate-900/40 backdrop-blur-3xl shadow-[0_0_40px_rgba(139,92,246,0.15)]"
            initial={{ scale: 0.9, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 24 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          >
            {/* Glowing orbs */}
            <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-indigo-500/30 blur-[80px]" />
            <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-fuchsia-500/20 blur-[80px]" />

            {/* Content */}
            <div className="relative z-10 p-6 space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
                    <Dumbbell className="h-5 w-5" />
                  </div>
                  <h2 className="text-lg font-semibold text-white/90">Log Exercise</h2>
                </div>
                <button
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white/70"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Exercise name input */}
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider text-white/50">
                  Exercise Name
                </label>
                <input
                  type="text"
                  value={exerciseName}
                  onChange={(e) => {
                    setExerciseName(e.target.value);
                    if (selectedPreset && e.target.value !== selectedPreset) {
                      setSelectedPreset(null);
                    }
                  }}
                  placeholder="e.g. Morning run"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-indigo-400/50 focus:bg-white/[0.07]"
                />
              </div>

              {/* Preset chips */}
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider text-white/50">
                  Quick Select
                </label>
                <div className="flex flex-wrap gap-2">
                  {EXERCISE_PRESETS.map((preset) => {
                    const active = selectedPreset === preset.label;
                    return (
                      <button
                        key={preset.label}
                        onClick={() => handlePresetSelect(preset.label)}
                        className={`
                          flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all
                          ${active
                            ? 'border-indigo-400/50 bg-indigo-500/20 text-indigo-300 shadow-[0_0_12px_rgba(139,92,246,0.3)]'
                            : 'border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:bg-white/10 hover:text-white/80'
                          }
                        `}
                      >
                        {preset.icon}
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Duration */}
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-white/50">
                  <Clock className="h-3.5 w-3.5 text-amber-400" />
                  Duration (minutes)
                </label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleDurationChange(-5)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/60 transition-colors hover:bg-white/10 hover:text-white/80"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-20 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center text-sm text-white outline-none transition-colors focus:border-indigo-400/50"
                  />
                  <button
                    onClick={() => handleDurationChange(5)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/60 transition-colors hover:bg-white/10 hover:text-white/80"
                  >
                    +
                  </button>
                  <span className="text-xs text-white/40">min</span>
                </div>
              </div>

              {/* Calories */}
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-white/50">
                  <Flame className="h-3.5 w-3.5 text-orange-400" />
                  Calories Burned
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={0}
                    value={caloriesBurned}
                    onChange={(e) => handleCaloriesChange(parseInt(e.target.value) || 0)}
                    className="w-24 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center text-sm text-white outline-none transition-colors focus:border-orange-400/50"
                  />
                  <span className="text-xs text-white/40">kcal</span>
                  {selectedPreset && !manualCalories && (
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                      auto-estimated
                    </span>
                  )}
                </div>
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={!canSubmit || isSubmitting}
                className={`
                  flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold text-white transition-all
                  ${canSubmit && !isSubmitting
                    ? 'bg-gradient-to-r from-indigo-600 to-fuchsia-600 shadow-[0_0_20px_rgba(139,92,246,0.6)] hover:shadow-[0_0_30px_rgba(139,92,246,0.8)] hover:brightness-110'
                    : 'cursor-not-allowed bg-white/10 text-white/30'
                  }
                `}
              >
                {isSubmitting ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {isSubmitting ? 'Logging…' : 'Log Exercise'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
