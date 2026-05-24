import { prisma } from '@/lib/db';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DietaryPatterns {
  avgCalories7d: number;
  avgProtein7d: number;
  avgCarbs7d: number;
  avgFat7d: number;
  lateNightCarbSpikes: number;
  proteinDeficitStreak: number;
  calorieStdDev7d: number;
  consistencyScore: number;
  loggingStreak: number;
  weightTrend: 'losing' | 'stable' | 'gaining';
  weightVelocity: number;
  totalExerciseCalories7d: number;
}

// ── Main Analysis Function ─────────────────────────────────────────────────────

export async function analyzeDietaryPatterns(
  userId: string,
  targetCalories?: number,
  targetProtein?: number
): Promise<DietaryPatterns> {
  const now = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  // 1. Fetch last 7 days of DailyLogs
  const logs = await prisma.dailyLog.findMany({
    where: { userId, date: { gte: sevenDaysAgo } },
    include: { entries: true, exerciseEntries: true },
    orderBy: { date: 'asc' },
  });

  // 2. Calculate 7-day averages
  const daysWithData = logs.length || 1;
  const avgCalories7d = logs.reduce((s, l) => s + l.totalCalories, 0) / daysWithData;
  const avgProtein7d = logs.reduce((s, l) => s + l.totalProtein, 0) / daysWithData;
  const avgCarbs7d = logs.reduce((s, l) => s + l.totalCarbs, 0) / daysWithData;
  const avgFat7d = logs.reduce((s, l) => s + l.totalFat, 0) / daysWithData;

  // 3. Late-night carb spikes (entries after 9PM where carbs > 50% of entry calories)
  let lateNightCarbSpikes = 0;
  for (const log of logs) {
    for (const entry of log.entries) {
      const hour = new Date(entry.timestamp).getHours();
      if (hour >= 21 && entry.calories > 0) {
        const carbCalorieRatio = (entry.carbs * 4) / entry.calories;
        if (carbCalorieRatio > 0.5) lateNightCarbSpikes++;
      }
    }
  }

  // 4. Protein deficit streak (consecutive days below 80% of target, walking backwards)
  let proteinDeficitStreak = 0;
  const target80 = (targetProtein ?? 150) * 0.8;
  const sortedDesc = [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  for (const log of sortedDesc) {
    if (log.totalProtein < target80) {
      proteinDeficitStreak++;
    } else {
      break;
    }
  }

  // 5. Calorie standard deviation from target
  const tCal = targetCalories ?? 2000;
  const squaredDiffs = logs.map((l) => Math.pow(l.totalCalories - tCal, 2));
  const calorieStdDev7d = squaredDiffs.length > 0
    ? Math.sqrt(squaredDiffs.reduce((s, d) => s + d, 0) / squaredDiffs.length)
    : 0;

  // 6. Consistency score (0-100)
  const loggingFrequency = (logs.length / 7) * 50;
  const daysOnTarget = logs.filter((l) => {
    const deviation = Math.abs(l.totalCalories - tCal) / tCal;
    return deviation <= 0.15; // Within ±15% of target
  }).length;
  const targetAdherence = logs.length > 0 ? (daysOnTarget / logs.length) * 50 : 0;
  const consistencyScore = Math.round(Math.min(100, loggingFrequency + targetAdherence));

  // 7. Logging streak — separate query covering up to 365 days
  const streakLogs = await prisma.dailyLog.findMany({
    where: { userId, entries: { some: {} } },
    orderBy: { date: 'desc' },
    select: { date: true },
    take: 365,
  });

  let loggingStreak = 0;
  for (let i = 0; i < streakLogs.length; i++) {
    const expectedDate = new Date(now);
    expectedDate.setDate(now.getDate() - i);
    expectedDate.setHours(0, 0, 0, 0);

    const logDate = new Date(streakLogs[i].date);
    logDate.setHours(0, 0, 0, 0);

    if (logDate.getTime() === expectedDate.getTime()) {
      loggingStreak++;
    } else if (i === 0) {
      // Today might not have a log yet — try starting from yesterday
      const yesterdayDate = new Date(now);
      yesterdayDate.setDate(now.getDate() - 1);
      yesterdayDate.setHours(0, 0, 0, 0);
      if (logDate.getTime() === yesterdayDate.getTime()) {
        // Shift expectation: streak starts from yesterday
        loggingStreak++;
        // Re-check remaining logs from yesterday onward
        for (let j = i + 1; j < streakLogs.length; j++) {
          const nextExpected = new Date(now);
          nextExpected.setDate(now.getDate() - j);
          nextExpected.setHours(0, 0, 0, 0);

          const nextLogDate = new Date(streakLogs[j].date);
          nextLogDate.setHours(0, 0, 0, 0);

          if (nextLogDate.getTime() === nextExpected.getTime()) {
            loggingStreak++;
          } else {
            break;
          }
        }
        break;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  // 8. Weight trend (from last 14 days of WeightLog)
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  fourteenDaysAgo.setHours(0, 0, 0, 0);

  const weightLogs = await prisma.weightLog.findMany({
    where: { userId, measuredAt: { gte: fourteenDaysAgo } },
    orderBy: { measuredAt: 'asc' },
    select: { weightKg: true, measuredAt: true },
  });

  let weightTrend: 'losing' | 'stable' | 'gaining' = 'stable';
  let weightVelocity = 0;

  if (weightLogs.length >= 2) {
    const first = weightLogs[0];
    const last = weightLogs[weightLogs.length - 1];
    const daysBetween = (new Date(last.measuredAt).getTime() - new Date(first.measuredAt).getTime()) / (1000 * 60 * 60 * 24);
    const weeksBetween = Math.max(daysBetween / 7, 0.14); // At least 1 day
    weightVelocity = +(((last.weightKg - first.weightKg) / weeksBetween).toFixed(2));

    if (weightVelocity < -0.1) weightTrend = 'losing';
    else if (weightVelocity > 0.1) weightTrend = 'gaining';
  }

  // 9. Total exercise calories
  const totalExerciseCalories7d = logs.reduce(
    (sum, log) => sum + log.exerciseEntries.reduce((s, e) => s + e.caloriesBurned, 0),
    0
  );

  return {
    avgCalories7d: +avgCalories7d.toFixed(0),
    avgProtein7d: +avgProtein7d.toFixed(0),
    avgCarbs7d: +avgCarbs7d.toFixed(0),
    avgFat7d: +avgFat7d.toFixed(0),
    lateNightCarbSpikes,
    proteinDeficitStreak,
    calorieStdDev7d: +calorieStdDev7d.toFixed(0),
    consistencyScore,
    loggingStreak,
    weightTrend,
    weightVelocity,
    totalExerciseCalories7d: +totalExerciseCalories7d.toFixed(0),
  };
}

// ── Proactive Context Builder ──────────────────────────────────────────────────

export function buildProactiveContext(
  patterns: DietaryPatterns,
  currentDayTotals: { calories: number; protein: number; carbs: number; fat: number } | null,
  targetCalories: number,
  targetProtein: number,
  timeOfDay: number
): string {
  const parts: string[] = ['BEHAVIORAL CONTEXT:'];
  const hour = timeOfDay;
  const timeLabel = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

  // Current day status
  if (currentDayTotals) {
    const remaining = targetCalories - currentDayTotals.calories;
    const proteinRemaining = targetProtein - currentDayTotals.protein;
    parts.push(
      `The user has consumed ${currentDayTotals.calories.toLocaleString()} of ${targetCalories.toLocaleString()} target calories by this ${timeLabel}.`,
      `They have ${Math.max(0, proteinRemaining).toFixed(0)}g protein remaining and ${Math.max(0, remaining).toFixed(0)} calories of budget.`
    );

    if (remaining < 200 && hour < 18) {
      parts.push('Budget is very tight — suggest calorie-efficient, high-protein options.');
    }
  }

  // 7-day patterns
  if (patterns.lateNightCarbSpikes > 2) {
    parts.push(
      `7-day pattern shows ${patterns.lateNightCarbSpikes} late-night carb spikes. Gently recommend earlier meal timing.`
    );
  }

  if (patterns.proteinDeficitStreak > 0) {
    parts.push(
      `${patterns.proteinDeficitStreak}-day protein deficit streak (below 80% of target). Prioritize protein-rich suggestions.`
    );
  }

  // Weight trend
  if (patterns.weightTrend !== 'stable') {
    const direction = patterns.weightTrend === 'losing' ? 'losing' : 'gaining';
    parts.push(
      `Weight trend: ${direction} at ${Math.abs(patterns.weightVelocity)} kg/week.`
    );
  }

  // Consistency and exercise
  parts.push(`Consistency score: ${patterns.consistencyScore}/100.`);

  if (patterns.totalExerciseCalories7d > 0) {
    parts.push(`Total exercise burn this week: ${patterns.totalExerciseCalories7d} kcal.`);
  }

  if (patterns.loggingStreak > 3) {
    parts.push(`Logging streak: ${patterns.loggingStreak} consecutive days — acknowledge this positively!`);
  }

  // Meal suggestions based on remaining macros
  if (currentDayTotals && hour >= 16) {
    const proteinRemaining = targetProtein - currentDayTotals.protein;
    const calRemaining = targetCalories - currentDayTotals.calories;
    if (proteinRemaining > 30 && calRemaining < 600) {
      parts.push('Suggest a high-protein, low-calorie dinner option.');
    }
  }

  return parts.join(' ');
}
