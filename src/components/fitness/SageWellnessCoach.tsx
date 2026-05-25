'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, Brain, CheckCircle2, Activity, Dumbbell, 
  Calendar, Flame, Clock, HeartPulse, ChevronDown, 
  ChevronUp, RefreshCw, Scale, AlertCircle 
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { getWorkoutTelemetry } from '@/app/actions';
import { useAppStore } from '@/lib/store';
import { parseSageStream } from '@/lib/parser';

interface ExerciseHistoryItem {
  id: string;
  exerciseName: string;
  durationMinutes: number;
  caloriesBurned: number;
  date: string;
  category: 'Cardio' | 'Strength' | 'Other';
}

interface TelemetryData {
  sessionFrequency: number;
  sessionFrequencyStr: string;
  totalDuration: number;
  totalCalories: number;
  cardioDuration: number;
  strengthDuration: number;
  cardioPct: number;
  strengthPct: number;
  trainingLoadScore: number;
  history: ExerciseHistoryItem[];
}

export default function SageWellnessCoach() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Today's workout selection state
  const [todayWorkout, setTodayWorkout] = useState<
    'Rest Day / Active Recovery' | 'High-Intensity Cardio' | 'High-Intensity Strength' | 'High-Intensity Hybrid (HIIT)'
  >('Rest Day / Active Recovery');

  // AI response streaming state
  const [isGenerating, setIsGenerating] = useState(false);
  const [analysisText, setAnalysisText] = useState('');
  const [thoughtsText, setThoughtsText] = useState('');
  const [openThoughts, setOpenThoughts] = useState<boolean | null>(null);

  const isThoughtsOpen = openThoughts !== null 
    ? openThoughts 
    : (isGenerating && !analysisText);

  const scrollRef = useRef<HTMLDivElement>(null);
  const measurementSystem = useAppStore((state) => state.measurementSystem);
  const geminiApiKey = useAppStore((state) => state.geminiApiKey);

  // Fetch telemetry from server action
  const loadTelemetry = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getWorkoutTelemetry();
      if (res.success && res.telemetry) {
        setTelemetry(res.telemetry as TelemetryData);

        // Auto-detect today's workout category based on logged exercises
        const todayStr = new Date().toISOString().slice(0, 10);
        const todayExercises = (res.telemetry.history as ExerciseHistoryItem[]).filter(
          (ex) => ex.date === todayStr
        );

        if (todayExercises.length > 0) {
          const hasCardio = todayExercises.some((ex) => ex.category === 'Cardio');
          const hasStrength = todayExercises.some((ex) => ex.category === 'Strength');
          
          if (hasCardio && hasStrength) {
            setTodayWorkout('High-Intensity Hybrid (HIIT)');
          } else if (hasStrength) {
            setTodayWorkout('High-Intensity Strength');
          } else if (hasCardio) {
            setTodayWorkout('High-Intensity Cardio');
          }
        }
      } else {
        setError(res.error || 'Failed to fetch exercise telemetry.');
      }
    } catch (err) {
      console.error('[SageWellnessCoach] fetch error:', err);
      setError('Failed to connect to Server Action.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && !telemetry) {
      loadTelemetry();
    }
  }, [isOpen, telemetry, loadTelemetry]);

  // Handle AI analysis streaming
  const handleGenerateAnalysis = async () => {
    if (!telemetry || isGenerating) return;
    setIsGenerating(true);
    setAnalysisText('');
    setThoughtsText('');
    setOpenThoughts(null);

    try {
      const res = await fetch('/api/sage/wellness', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          telemetry: {
            sessionFrequency: telemetry.sessionFrequency,
            sessionFrequencyStr: telemetry.sessionFrequencyStr,
            totalDuration: telemetry.totalDuration,
            totalCalories: telemetry.totalCalories,
            cardioDuration: telemetry.cardioDuration,
            strengthDuration: telemetry.strengthDuration,
            cardioPct: telemetry.cardioPct,
            strengthPct: telemetry.strengthPct,
            trainingLoadScore: telemetry.trainingLoadScore,
          },
          todayWorkout,
          measurementSystem,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to generate analysis');
      }

      if (!res.body) throw new Error('No stream response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let fullText = '';

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          fullText += decoder.decode(value, { stream: true });

          const parsed = parseSageStream(fullText, done);
          setThoughtsText(parsed.thoughts);
          setAnalysisText(parsed.content);
        }
      }

      // Final parse step to guarantee the parser processes the text with isDone = true
      const finalParsed = parseSageStream(fullText, true);
      setThoughtsText(finalParsed.thoughts);
      setAnalysisText(finalParsed.content);
    } catch (err) {
      console.error('[SageWellnessCoach] Streaming failed:', err);
      setAnalysisText('⚠️ Failed to compile recovery analysis. Ensure your Gemini API Key is configured in settings.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Auto-scroll on active stream
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [analysisText, thoughtsText]);

  // Load classification label for Training Load Score
  const getLoadLabel = (score: number) => {
    if (score === 0) return 'Rest / Sedentary';
    if (score < 30) return 'Active Recovery / Light';
    if (score < 65) return 'Optimal Maintenance';
    if (score < 85) return 'Optimal Progressive Overload';
    return 'Extreme / Overtraining Threshold';
  };

  const getLoadColor = (score: number) => {
    if (score < 30) return 'text-sky-400';
    if (score < 65) return 'text-emerald-400';
    if (score < 85) return 'text-indigo-400';
    return 'text-rose-400';
  };

  return (
    <div className="space-y-4">
      {/* Primary Card Accordion */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-1 pt-4 border-b border-white/10 pb-2 group cursor-pointer"
      >
        <h2 className="text-xl font-medium text-white/90 flex items-center gap-2 drop-shadow-sm">
          <HeartPulse className="w-5 h-5 text-indigo-400" />
          Sage Holistic Wellness Coach
        </h2>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden space-y-6"
          >
            {loading ? (
              <div className="w-full flex flex-col items-center justify-center p-12 bg-slate-900/10 rounded-3xl border border-white/5">
                <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
                <p className="text-slate-400 text-sm mt-3 font-medium tracking-wide">Compiling physiological telemetry...</p>
              </div>
            ) : error ? (
              <div className="p-6 rounded-3xl bg-red-500/5 border border-red-500/20 text-center space-y-2">
                <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
                <p className="text-slate-300 font-medium">{error}</p>
                <button
                  onClick={loadTelemetry}
                  className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs hover:bg-white/10 text-white font-medium transition-colors"
                >
                  Retry Load
                </button>
              </div>
            ) : telemetry ? (
              <div className="space-y-6">
                {/* 1. Telemetry Dashboard Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Gauge 1: Session Frequency */}
                  <div className="p-5 rounded-2xl bg-slate-900/40 backdrop-blur-xl border border-white/5 flex flex-col justify-between shadow-lg relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all" />
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Session Frequency</span>
                      <h3 className="text-3xl font-light text-white mt-2 font-mono">
                        {telemetry.sessionFrequency} <span className="text-sm font-sans text-slate-400">/ 14 Days</span>
                      </h3>
                    </div>
                    <div className="flex items-center gap-2 mt-4 text-xs text-slate-400 border-t border-white/5 pt-3">
                      <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{telemetry.sessionFrequency >= 6 ? 'Highly consistent split' : 'Active baseline'}</span>
                    </div>
                  </div>

                  {/* Gauge 2: Training Load Score */}
                  <div className="p-5 rounded-2xl bg-slate-900/40 backdrop-blur-xl border border-white/5 flex flex-col justify-between shadow-lg relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition-all" />
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Training Load Score</span>
                      <h3 className="text-3xl font-light text-white mt-2 font-mono">
                        {telemetry.trainingLoadScore} <span className="text-xs font-sans text-slate-400">/ 100</span>
                      </h3>
                    </div>
                    <div className="flex items-center gap-2 mt-4 text-xs border-t border-white/5 pt-3 w-full">
                      <Clock className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                      <span className={`truncate font-medium ${getLoadColor(telemetry.trainingLoadScore)}`}>
                        {getLoadLabel(telemetry.trainingLoadScore)}
                      </span>
                    </div>
                  </div>

                  {/* Gauge 3: Cardio vs Strength Split */}
                  <div className="p-5 rounded-2xl bg-slate-900/40 backdrop-blur-xl border border-white/5 flex flex-col justify-between shadow-lg relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-fuchsia-500/5 rounded-full blur-2xl group-hover:bg-fuchsia-500/10 transition-all" />
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Cardio vs. Strength Split</span>
                      <div className="flex items-end justify-between mt-2 font-mono">
                        <span className="text-base font-medium text-fuchsia-400">{telemetry.cardioPct}% C</span>
                        <span className="text-base font-medium text-indigo-400">{telemetry.strengthPct}% S</span>
                      </div>
                      
                      {/* Gradient Split Progress Bar */}
                      <div className="w-full h-2 bg-white/5 rounded-full mt-3 overflow-hidden flex">
                        <div className="h-full bg-gradient-to-r from-fuchsia-500 to-fuchsia-400" style={{ width: `${telemetry.cardioPct}%` }} />
                        <div className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400" style={{ width: `${telemetry.strengthPct}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-4 text-xs text-slate-400 border-t border-white/5 pt-3">
                      <Dumbbell className="w-3.5 h-3.5 text-fuchsia-400" />
                      <span>{telemetry.strengthPct > 60 ? 'Strength hypertrophic bias' : telemetry.cardioPct > 60 ? 'Endurance cardiovascular bias' : 'Balanced cross-training'}</span>
                    </div>
                  </div>
                </div>

                {/* 2. Today's Recovery Focus Selector */}
                <div className="p-6 rounded-3xl bg-slate-900/30 backdrop-blur-xl border border-white/5 shadow-lg relative">
                  <div className="absolute top-0 left-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl -translate-y-1/2 -translate-x-1/2" />
                  <h3 className="text-base font-medium text-white/90 mb-3 flex items-center gap-2">
                    <Flame className="w-4 h-4 text-orange-400" />
                    Specify Today&apos;s Workout Focus & Intensity
                  </h3>
                  <p className="text-xs text-slate-400 mb-4 max-w-2xl leading-relaxed">
                    Select the training type or intensity completed/planned for today. Sage will evaluate your metabolic state and cross-reference your Vault to prescribe recovery foods.
                  </p>
                  
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    {[
                      { label: 'Rest Day / Active Recovery', icon: '🧘' },
                      { label: 'High-Intensity Cardio', icon: '🏃' },
                      { label: 'High-Intensity Strength', icon: '🏋️' },
                      { label: 'High-Intensity Hybrid (HIIT)', icon: '⚡' }
                    ].map((item) => {
                      const isActive = todayWorkout === item.label;
                      return (
                        <button
                          key={item.label}
                          onClick={() => setTodayWorkout(item.label as any)}
                          className={`p-3.5 rounded-2xl border text-center transition-all flex flex-col items-center gap-2 cursor-pointer ${
                            isActive
                              ? 'bg-indigo-600/15 border-indigo-500/40 text-white shadow-[0_0_15px_rgba(99,102,241,0.25)]'
                              : 'bg-white/5 border-transparent text-slate-300 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          <span className="text-xl">{item.icon}</span>
                          <span className="text-xs font-semibold tracking-wide leading-tight">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Refetch Trigger */}
                  <button
                    onClick={loadTelemetry}
                    className="absolute top-5 right-5 p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
                    title="Reload telemetry logs"
                  >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                  </button>
                </div>

                {/* 3. Stream Engine CTA */}
                <div className="flex flex-col items-center gap-4">
                  <button
                    onClick={handleGenerateAnalysis}
                    disabled={isGenerating}
                    className={`px-8 py-4 rounded-3xl font-medium text-white shadow-lg cursor-pointer transition-all border w-full md:max-w-md text-center flex items-center justify-center gap-3 relative overflow-hidden ${
                      isGenerating
                        ? 'bg-slate-800/40 border-white/10 cursor-not-allowed text-slate-400'
                        : 'bg-indigo-600/25 hover:bg-indigo-600/45 border-indigo-500/40 hover:shadow-[0_0_25px_rgba(99,102,241,0.3)] animate-pulse'
                    }`}
                  >
                    {isGenerating && (
                      <span className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 via-fuchsia-500/10 to-indigo-500/10 animate-pulse pointer-events-none" />
                    )}
                    <Sparkles className="w-5 h-5 text-indigo-300" suppressHydrationWarning />
                    <span>{isGenerating ? 'Synthesizing Wellness Analysis...' : 'Evaluate Exercise & Prescribe Recovery'}</span>
                  </button>
                </div>

                {/* 4. Streaming Display Panel */}
                <AnimatePresence>
                  {(thoughtsText || analysisText) && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      className="space-y-4"
                    >
                      {/* Collapsible Thoughts Block */}
                      {thoughtsText && (
                        <div className="w-full border border-white/10 rounded-2xl bg-slate-950/45 backdrop-blur-xl shadow-lg overflow-hidden relative">
                          <button
                            onClick={() => setOpenThoughts(isThoughtsOpen ? false : true)}
                            className="w-full px-5 py-3.5 flex items-center justify-between text-xs font-bold text-slate-300 hover:text-white transition-colors focus:outline-none"
                          >
                            <div className="flex items-center gap-2">
                              {isGenerating ? (
                                <Brain size={14} className="text-fuchsia-400 animate-pulse" />
                              ) : (
                                <CheckCircle2 size={14} className="text-emerald-400" />
                              )}
                              <span className="tracking-widest uppercase">
                                {isGenerating ? 'Synthesizing Recovery Reasoning...' : 'Sage AI Reasoning Log'}
                              </span>
                            </div>
                            <span className="font-mono text-[10px] bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                              {isThoughtsOpen ? 'CLOSE LOG' : 'EXPAND LOG'}
                            </span>
                          </button>

                          <AnimatePresence>
                            {isThoughtsOpen && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="px-5 pb-5 pt-2 text-[11px] font-mono text-slate-300 border-t border-white/5 whitespace-pre-wrap leading-relaxed max-h-[220px] overflow-y-auto custom-scrollbar bg-slate-950/30">
                                  {thoughtsText}
                                  {isGenerating && (
                                    <span className="inline-block w-1.5 h-3 ml-1 bg-fuchsia-400 animate-pulse" />
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}

                      {/* Main Rendered Output */}
                      {analysisText && (
                        <div
                          ref={scrollRef}
                          className="p-6 rounded-3xl bg-slate-900/40 backdrop-blur-xl border border-white/5 text-slate-100 shadow-xl overflow-hidden relative min-h-[150px]"
                        >
                          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl" />
                          <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-black/30 prose-pre:border prose-pre:border-white/10 prose-headings:text-indigo-50 prose-a:text-indigo-400 hover:prose-a:text-indigo-300 prose-strong:text-indigo-100">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                              {analysisText}
                            </ReactMarkdown>
                          </div>
                          {isGenerating && (
                            <span className="inline-block w-2 h-4 ml-1 bg-indigo-400 animate-pulse" />
                          )}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
