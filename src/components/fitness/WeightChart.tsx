'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingDown,
  TrendingUp,
  Minus,
  Scale,
  Plus,
  Calendar,
  Loader2,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface WeightEntry {
  id: string;
  measuredAt: string;
  weightKg: number;
}

interface WeightStats {
  current: number;
  change: number;
  trend: 'losing' | 'gaining' | 'stable';
  average: number;
}

interface WeightAPIResponse {
  entries: WeightEntry[];
  stats: WeightStats;
}

export interface WeightChartProps {
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

type RangeKey = 30 | 90 | 365;

const RANGE_OPTIONS: { label: string; value: RangeKey }[] = [
  { label: '30 D', value: 30 },
  { label: '90 D', value: 90 },
  { label: '1 Y', value: 365 },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** Compute a 7-day simple rolling average. */
function rollingAverage(entries: WeightEntry[], window = 7): number[] {
  return entries.map((_, i, arr) => {
    const start = Math.max(0, i - window + 1);
    const slice = arr.slice(start, i + 1);
    return slice.reduce((s, e) => s + e.weightKg, 0) / slice.length;
  });
}

/** Build an SVG polyline / smooth path from an array of [x,y] pairs. */
function buildSmoothPath(points: [number, number][]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0][0]},${points[0][1]}`;
  return points.reduce((d, [x, y], i) => {
    if (i === 0) return `M${x},${y}`;
    const [px, py] = points[i - 1];
    const cx = (px + x) / 2;
    return `${d} C${cx},${py} ${cx},${y} ${x},${y}`;
  }, '');
}

/* ------------------------------------------------------------------ */
/*  Trend Icon                                                         */
/* ------------------------------------------------------------------ */

const TrendIcon: React.FC<{ trend: WeightStats['trend'] }> = ({ trend }) => {
  if (trend === 'losing')
    return <TrendingDown className="w-5 h-5 text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.6)]" />;
  if (trend === 'gaining')
    return <TrendingUp className="w-5 h-5 text-rose-400 drop-shadow-[0_0_6px_rgba(251,113,133,0.6)]" />;
  return <Minus className="w-5 h-5 text-slate-400" />;
};

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export const WeightChart: React.FC<WeightChartProps> = ({ className = '' }) => {
  const [range, setRange] = useState<RangeKey>(30);
  const [data, setData] = useState<WeightAPIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add-weight form state
  const [weightInput, setWeightInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Tooltip state
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  /* ---- Fetch ---------------------------------------------------- */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/weight?days=${range}`);
      if (!res.ok) throw new Error('Failed to load weight data');
      const json: WeightAPIResponse = await res.json();
      setData(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ---- Submit --------------------------------------------------- */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(weightInput);
    if (!val || val <= 0 || val > 500) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/weight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weightKg: val }),
      });
      if (!res.ok) throw new Error('Failed to log weight');
      setWeightInput('');
      await fetchData();
    } catch {
      /* silent – toast could go here */
    } finally {
      setSubmitting(false);
    }
  };

  /* ---- Chart geometry ------------------------------------------- */
  const CHART_W = 600;
  const CHART_H = 200;
  const PAD = { top: 20, right: 30, bottom: 30, left: 46 };

  const chartMetrics = useMemo(() => {
    if (!data || data.entries.length === 0) return null;

    const entries = data.entries;
    const weights = entries.map((e) => e.weightKg);
    const minW = Math.min(...weights) - 2;
    const maxW = Math.max(...weights) + 2;

    const xScale = (i: number) =>
      PAD.left + (i / Math.max(entries.length - 1, 1)) * (CHART_W - PAD.left - PAD.right);
    const yScale = (w: number) =>
      PAD.top + ((maxW - w) / (maxW - minW || 1)) * (CHART_H - PAD.top - PAD.bottom);

    const points: [number, number][] = entries.map((e, i) => [xScale(i), yScale(e.weightKg)]);
    const linePath = buildSmoothPath(points);

    const avg = rollingAverage(entries);
    const avgPoints: [number, number][] = avg.map((v, i) => [xScale(i), yScale(v)]);
    const avgPath = buildSmoothPath(avgPoints);

    // Y-axis ticks (5 ticks)
    const step = (maxW - minW) / 4;
    const yTicks = Array.from({ length: 5 }, (_, i) => +(minW + step * i).toFixed(1));

    // X-axis date labels (every 5th entry)
    const xLabels = entries
      .map((e, i) => ({ i, label: formatDate(e.measuredAt) }))
      .filter((_, idx) => idx % 5 === 0);

    return { entries, points, linePath, avgPath, yTicks, xLabels, xScale, yScale, minW, maxW };
  }, [data]);

  /* ---- Render --------------------------------------------------- */
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      style={{ willChange: 'transform, opacity' }}
      className={`relative w-full p-6 overflow-hidden rounded-3xl ${className}`}
    >
      {/* ─── Glassmorphism Base ─── */}
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-3xl border border-white/10 rounded-3xl z-0 pointer-events-none" />

      {/* ─── Specular Edge Highlights ─── */}
      <div className="absolute inset-0 rounded-3xl border-t border-t-white/20 border-l border-l-white/10 pointer-events-none z-10" />

      {/* ─── Holographic Radial Orbs ─── */}
      <div className="absolute -top-24 -left-24 w-64 h-64 bg-indigo-500/30 rounded-full blur-[80px] pointer-events-none z-0" />
      <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-fuchsia-500/20 rounded-full blur-[80px] pointer-events-none z-0" />

      {/* ─── Content ─── */}
      <div className="relative z-20 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Scale className="w-5 h-5 text-indigo-400 drop-shadow-[0_0_6px_rgba(129,140,248,0.6)]" />
            <h3 className="text-lg font-medium text-slate-200 tracking-wide font-inter">
              Weight Tracker
            </h3>
          </div>

          {/* Range tabs */}
          <div className="flex gap-1 bg-slate-800/50 rounded-xl p-1">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRange(opt.value)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all duration-200 ${
                  range === opt.value
                    ? 'bg-indigo-500/30 text-indigo-300 shadow-[0_0_8px_rgba(129,140,248,0.3)]'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* ─── Summary Stats ─── */}
        {data && data.stats && (
          <div className="grid grid-cols-3 gap-4">
            {/* Current Weight */}
            <div className="flex flex-col items-center gap-1 py-3 rounded-2xl bg-slate-800/30 border border-white/5">
              <span className="text-[10px] uppercase tracking-widest text-slate-500">Current</span>
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-fuchsia-400 font-inter">
                {data.stats.current.toFixed(1)}
              </span>
              <span className="text-[10px] text-slate-500">kg</span>
            </div>

            {/* Change */}
            <div className="flex flex-col items-center gap-1 py-3 rounded-2xl bg-slate-800/30 border border-white/5">
              <span className="text-[10px] uppercase tracking-widest text-slate-500">Change</span>
              <div className="flex items-center gap-1">
                <TrendIcon trend={data.stats.trend} />
                <span
                  className={`text-xl font-bold font-inter ${
                    data.stats.change < 0
                      ? 'text-emerald-400'
                      : data.stats.change > 0
                        ? 'text-rose-400'
                        : 'text-slate-400'
                  }`}
                >
                  {data.stats.change > 0 ? '+' : ''}
                  {data.stats.change.toFixed(1)}
                </span>
              </div>
              <span className="text-[10px] text-slate-500">kg</span>
            </div>

            {/* Average */}
            <div className="flex flex-col items-center gap-1 py-3 rounded-2xl bg-slate-800/30 border border-white/5">
              <span className="text-[10px] uppercase tracking-widest text-slate-500">Average</span>
              <span className="text-xl font-bold text-slate-200 font-inter">
                {data.stats.average.toFixed(1)}
              </span>
              <span className="text-[10px] text-slate-500">kg</span>
            </div>
          </div>
        )}

        {/* ─── Chart ─── */}
        <div className="relative w-full rounded-2xl bg-slate-800/20 border border-white/5 p-2">
          {loading && (
            <div className="flex items-center justify-center h-[220px]">
              <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-[220px] text-sm text-rose-400">
              {error}
            </div>
          )}

          {!loading && !error && chartMetrics && (
            <svg
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              className="w-full h-auto"
              preserveAspectRatio="xMidYMid meet"
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <defs>
                {/* Glow filter for data points */}
                <filter id="pointGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="rgba(129,140,248,0.6)" />
                </filter>
                {/* Gradient fill under the line */}
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(129,140,248,0.25)" />
                  <stop offset="100%" stopColor="rgba(129,140,248,0)" />
                </linearGradient>
              </defs>

              {/* Grid lines */}
              {chartMetrics.yTicks.map((t) => (
                <line
                  key={t}
                  x1={PAD.left}
                  y1={chartMetrics.yScale(t)}
                  x2={CHART_W - PAD.right}
                  y2={chartMetrics.yScale(t)}
                  stroke="rgba(148,163,184,0.08)"
                  strokeWidth="1"
                />
              ))}

              {/* Y-axis labels */}
              {chartMetrics.yTicks.map((t) => (
                <text
                  key={`yl-${t}`}
                  x={PAD.left - 8}
                  y={chartMetrics.yScale(t) + 4}
                  textAnchor="end"
                  className="fill-slate-500"
                  fontSize="10"
                  fontFamily="Inter, sans-serif"
                >
                  {t}
                </text>
              ))}

              {/* X-axis labels */}
              {chartMetrics.xLabels.map(({ i, label }) => (
                <text
                  key={`xl-${i}`}
                  x={chartMetrics.xScale(i)}
                  y={CHART_H - 4}
                  textAnchor="middle"
                  className="fill-slate-500"
                  fontSize="9"
                  fontFamily="Inter, sans-serif"
                >
                  {label}
                </text>
              ))}

              {/* Area fill under curve */}
              <path
                d={`${chartMetrics.linePath} L${chartMetrics.points[chartMetrics.points.length - 1][0]},${CHART_H - PAD.bottom} L${chartMetrics.points[0][0]},${CHART_H - PAD.bottom} Z`}
                fill="url(#areaGrad)"
              />

              {/* Main data line (animated) */}
              <motion.path
                d={chartMetrics.linePath}
                fill="none"
                stroke="rgb(129,140,248)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.6, ease: 'easeInOut' }}
                className="drop-shadow-[0_0_8px_rgba(129,140,248,0.4)]"
              />

              {/* 7-day rolling average (dashed) */}
              <motion.path
                d={chartMetrics.avgPath}
                fill="none"
                stroke="rgb(232,121,249)"
                strokeWidth="1.5"
                strokeDasharray="6 4"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.8, ease: 'easeInOut', delay: 0.3 }}
                className="drop-shadow-[0_0_6px_rgba(232,121,249,0.3)]"
              />

              {/* Data points */}
              {chartMetrics.points.map(([x, y], i) => (
                <g key={i}>
                  <circle
                    cx={x}
                    cy={y}
                    r={hoveredIndex === i ? 5 : 3.5}
                    fill="rgb(129,140,248)"
                    filter="url(#pointGlow)"
                    className="transition-all duration-150"
                    onMouseEnter={() => setHoveredIndex(i)}
                  />
                  {/* Invisible wider hit area */}
                  <circle
                    cx={x}
                    cy={y}
                    r={12}
                    fill="transparent"
                    onMouseEnter={() => setHoveredIndex(i)}
                  />
                </g>
              ))}

              {/* Tooltip */}
              <AnimatePresence>
                {hoveredIndex !== null && chartMetrics.entries[hoveredIndex] && (() => {
                  const entry = chartMetrics.entries[hoveredIndex];
                  const [tx, ty] = chartMetrics.points[hoveredIndex];
                  const tooltipW = 100;
                  const tooltipH = 38;
                  // Shift tooltip left if near right edge
                  const adjX = tx + tooltipW / 2 > CHART_W - PAD.right ? tx - tooltipW / 2 - 8 : tx - tooltipW / 2;
                  const adjY = ty - tooltipH - 12;
                  return (
                    <motion.g
                      key={hoveredIndex}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <rect
                        x={adjX}
                        y={adjY}
                        width={tooltipW}
                        height={tooltipH}
                        rx={8}
                        fill="rgba(15,23,42,0.85)"
                        stroke="rgba(129,140,248,0.3)"
                        strokeWidth="1"
                      />
                      <text
                        x={adjX + tooltipW / 2}
                        y={adjY + 15}
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight="600"
                        fill="rgb(129,140,248)"
                        fontFamily="Inter, sans-serif"
                      >
                        {entry.weightKg.toFixed(1)} kg
                      </text>
                      <text
                        x={adjX + tooltipW / 2}
                        y={adjY + 30}
                        textAnchor="middle"
                        fontSize="9"
                        fill="rgb(148,163,184)"
                        fontFamily="Inter, sans-serif"
                      >
                        {new Date(entry.measuredAt).toLocaleDateString()}
                      </text>
                    </motion.g>
                  );
                })()}
              </AnimatePresence>
            </svg>
          )}

          {/* Empty state */}
          {!loading && !error && (!data || data.entries.length === 0) && (
            <div className="flex flex-col items-center justify-center h-[220px] gap-2">
              <Scale className="w-8 h-8 text-slate-600" />
              <p className="text-sm text-slate-500">No weight entries yet</p>
              <p className="text-xs text-slate-600">Log your first weight below</p>
            </div>
          )}

          {/* Legend */}
          {chartMetrics && (
            <div className="flex items-center gap-4 mt-2 ml-2">
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 bg-indigo-400 rounded-full" />
                <span className="text-[10px] text-slate-500">Weight</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 border-t border-dashed border-fuchsia-400" />
                <span className="text-[10px] text-slate-500">7-Day Avg</span>
              </div>
            </div>
          )}
        </div>

        {/* ─── Add Weight Form ─── */}
        <form onSubmit={handleSubmit} className="flex items-center gap-3">
          <div className="flex-1 relative">
            <input
              type="number"
              step="0.1"
              min="1"
              max="500"
              placeholder="Weight (kg)"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800/50 border border-white/10 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-400/50 focus:ring-1 focus:ring-indigo-400/20 transition-all font-inter"
            />
            <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
          </div>
          <button
            type="submit"
            disabled={submitting || !weightInput}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-500/20 border border-indigo-400/30 text-sm font-semibold text-indigo-300 hover:bg-indigo-500/30 hover:shadow-[0_0_12px_rgba(129,140,248,0.25)] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 font-inter"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Log Weight
          </button>
        </form>
      </div>
    </motion.div>
  );
};

export default WeightChart;
