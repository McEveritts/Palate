
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { MacroGlassCard } from '@/components/fitness/MacroGlassCard';
import { ContributionGrid } from '@/components/fitness/ContributionGrid';
import { Utensils, Droplet, Flame, Dumbbell, Clock } from 'lucide-react';
import type { DailyLog, FoodLogEntry, ExerciseLogEntry, UserProfile } from '@prisma/client';
import { DiaryClientWrapper } from './DiaryClientWrapper';

export const dynamic = 'force-dynamic';

export default async function DiaryPage() {
  // ── Authentication ──────────────────────────────────────
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/60">Please sign in to view your diary.</p>
      </div>
    );
  }

  const today = new Date();
  const todayStart = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  let dailyLog: (DailyLog & { entries: FoodLogEntry[]; exerciseEntries: ExerciseLogEntry[] }) | null = null;
  let entries: FoodLogEntry[] = [];
  let exerciseEntries: ExerciseLogEntry[] = [];
  let userProfile: UserProfile | null = null;

  try {
    // Fetch user profile for target values
    userProfile = await prisma.userProfile.findUnique({ where: { userId } });

    // Fetch today's daily log scoped to the authenticated user
    dailyLog = await prisma.dailyLog.findFirst({
      where: {
        userId: userId,
        date: {
          gte: todayStart,
          lt: tomorrowStart,
        },
      },
      include: {
        entries: { orderBy: { timestamp: 'asc' } },
        exerciseEntries: { orderBy: { timestamp: 'asc' } },
      },
    });

    if (dailyLog?.entries) {
      entries = dailyLog.entries;
    }
    if (dailyLog?.exerciseEntries) {
      exerciseEntries = dailyLog.exerciseEntries;
    }
  } catch (error) {
    console.error('Error fetching DailyLog:', error);
  }

  // ── Contribution Grid (deterministic, from real data) ───
  let pastWeekLogs: { date: Date; totalCalories: number }[] = [];
  try {
    pastWeekLogs = await prisma.dailyLog.findMany({
      where: {
        userId,
        date: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: { date: true, totalCalories: true },
      orderBy: { date: 'asc' },
    });
  } catch (error) {
    console.error('Error fetching pastWeekLogs:', error);
  }

  // ── Exercise totals ─────────────────────────────────────
  const totalExerciseCalories = exerciseEntries.reduce((sum, e) => sum + e.caloriesBurned, 0);

  // ── Macro Data ──────────────────────────────────────────
  const macroData = {
    protein: {
      label: 'Protein',
      value: dailyLog?.totalProtein ?? 0,
      target: userProfile?.targetProtein ?? 150,
      color: '#8b5cf6', // Indigo
    },
    carbs: {
      label: 'Carbs',
      value: dailyLog?.totalCarbs ?? 0,
      target: userProfile?.targetCarbs ?? 200,
      color: '#d946ef', // Fuchsia
    },
    fats: {
      label: 'Fats',
      value: dailyLog?.totalFat ?? 0,
      target: userProfile?.targetFat ?? 65,
      color: '#f59e0b', // Amber
    },
    calories: {
      current: dailyLog?.totalCalories ?? 0,
      target: userProfile?.targetCalories ?? 2000,
    },
    exerciseCalories: totalExerciseCalories,
  };

  const now = new Date();
  const pastDays = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (6 - i)));
    const dateStr = d.toISOString().slice(0, 10);
    const hasLog = pastWeekLogs.some((log) => {
      return new Date(log.date).toISOString().slice(0, 10) === dateStr;
    });
    return {
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
      completed: hasLog,
    };
  });

  // Group food entries by meal type
  const mealGroups: Record<string, FoodLogEntry[]> = {};
  for (const entry of entries) {
    const mt = entry.mealType;
    if (!mealGroups[mt]) mealGroups[mt] = [];
    mealGroups[mt].push(entry);
  }

  const mealOrder = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
  const mealIcons: Record<string, string> = {
    Breakfast: '🌅',
    Lunch: '☀️',
    Dinner: '🌙',
    Snack: '⚡',
  };

  return (
    <div className="relative min-h-screen w-full p-6 pb-32">
      <div className="max-w-5xl mx-auto space-y-8 relative z-10">
        
        {/* Header */}
        <div className="flex flex-col gap-2 pt-4 pb-2">
          <h1 className="text-3xl font-light text-white tracking-tight">
            Sage <span className="font-semibold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-fuchsia-400 drop-shadow-sm">Fitness</span>
          </h1>
          <p className="text-slate-400 text-sm">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Top Widgets Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <MacroGlassCard {...macroData} />
          
          <div className="flex flex-col gap-6">
            <ContributionGrid days={pastDays} title="Weekly Consistency" />
            
            {/* Active Energy + Hydration Widget */}
            <div className="p-5 rounded-3xl bg-slate-900/30 backdrop-blur-2xl border border-white/5 flex items-center justify-between shadow-[0_8px_32px_0_rgba(0,0,0,0.3)]">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
                  <Droplet size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-medium text-slate-200">Hydration</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Track in settings</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 shadow-[0_0_15px_rgba(249,115,22,0.2)]">
                  <Flame size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-medium text-slate-200">Active Energy</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {totalExerciseCalories > 0 ? `${totalExerciseCalories.toLocaleString()} kcal Burned` : 'No exercise logged'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Exercise Log */}
        {exerciseEntries.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xl font-medium text-white/90 px-1 pt-2 border-b border-white/10 pb-2 flex items-center gap-2">
              <Dumbbell className="w-5 h-5 text-emerald-400" />
              Today&apos;s Exercise
            </h2>
            <div className="flex flex-col gap-2">
              {exerciseEntries.map((ex) => (
                <div
                  key={ex.id}
                  className="flex items-center justify-between p-4 rounded-2xl bg-slate-900/40 backdrop-blur-xl border border-white/5 hover:border-emerald-500/20 transition-colors group shadow-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                      <Dumbbell size={16} />
                    </div>
                    <div>
                      <span className="text-sm font-medium text-slate-200">{ex.exerciseName}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <Clock size={10} />
                          {ex.durationMinutes} min
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-semibold text-emerald-400">-{Math.round(ex.caloriesBurned)}</span>
                    <span className="text-[10px] text-slate-500 uppercase tracking-widest ml-1">kcal</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Food Log Entries (Grouped by Meal Type) */}
        <div className="space-y-4">
          <h2 className="text-xl font-medium text-white/90 px-1 pt-4 border-b border-white/10 pb-2 drop-shadow-sm">
            Today&apos;s Log
          </h2>
          
          {entries.length === 0 ? (
            <div className="p-8 text-center bg-slate-900/20 rounded-3xl border border-white/5 border-dashed">
              <Utensils className="mx-auto text-slate-600 mb-3" size={32} />
              <p className="text-slate-400">No meals logged yet today.</p>
              <p className="text-sm text-slate-500 mt-1">Use the dock below to add your first meal.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {mealOrder.filter((mt) => mealGroups[mt]?.length).map((mealType) => (
                <div key={mealType} className="space-y-2">
                  <h3 className="text-sm font-medium text-slate-400 px-1 flex items-center gap-2">
                    <span className="text-base">{mealIcons[mealType]}</span>
                    {mealType}
                    <span className="text-xs text-slate-600">
                      ({mealGroups[mealType].reduce((s, e) => s + e.calories, 0).toLocaleString()} kcal)
                    </span>
                  </h3>
                  <div className="flex flex-col gap-2">
                    {mealGroups[mealType].map((entry) => (
                      <div 
                        key={entry.id} 
                        className="flex items-center justify-between p-4 rounded-2xl bg-slate-900/40 backdrop-blur-xl border border-white/5 hover:border-white/10 transition-colors group shadow-lg"
                      >
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-indigo-400 font-medium tracking-wide uppercase drop-shadow-[0_0_8px_rgba(129,140,248,0.4)]">
                            {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-base font-medium text-slate-200 group-hover:text-white transition-colors">
                            {entry.customFoodName || 'Unnamed'}
                          </span>
                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                            <span className="text-indigo-300 font-medium">{entry.protein}g P</span>
                            <span className="text-fuchsia-300 font-medium">{entry.carbs}g C</span>
                            <span className="text-amber-300 font-medium">{entry.fat}g F</span>
                          </div>
                        </div>
                        <div className="text-right flex flex-col items-end justify-center">
                          <span className="text-xl font-semibold bg-clip-text text-transparent bg-gradient-to-br from-white to-slate-400">
                            {entry.calories}
                          </span>
                          <span className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">
                            kcal
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Weight Chart Section — rendered in client wrapper */}
        <DiaryClientWrapper userProfile={userProfile ? { gender: userProfile.gender, dateOfBirth: userProfile.dateOfBirth.toISOString(), weightKg: userProfile.weightKg, heightCm: userProfile.heightCm, activityLevel: userProfile.activityLevel, goal: userProfile.goal, targetCalories: userProfile.targetCalories, targetProtein: userProfile.targetProtein, targetCarbs: userProfile.targetCarbs, targetFat: userProfile.targetFat } : null} />
      </div>
    </div>
  );
}
