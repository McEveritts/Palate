"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  ChevronLeft,
  Ruler,
  Weight,
  Calendar,
  Users,
  Flame,
  Target,
  Zap,
  TrendingDown,
  Equal,
  TrendingUp,
  Dumbbell,
  Footprints,
  Bike,
  HeartPulse,
  Trophy,
  Check,
  Loader2,
  Sparkles,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ProfileOnboardingProps {
  onComplete?: () => void;
  existingProfile?: {
    gender: string;
    dateOfBirth: string;
    weightKg: number;
    heightCm: number;
    activityLevel: string;
    goal: string;
    targetCalories: number;
    targetProtein: number;
    targetCarbs: number;
    targetFat: number;
  } | null;
}

type Gender = "MALE" | "FEMALE" | "OTHER";
type ActivityLevel = "SEDENTARY" | "LIGHT" | "MODERATE" | "ACTIVE" | "VERY_ACTIVE";
type Goal = "LOSE" | "MAINTAIN" | "GAIN";

const PAL_MAP: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,
  LIGHT: 1.375,
  MODERATE: 1.55,
  ACTIVE: 1.725,
  VERY_ACTIVE: 1.9,
};

// Maps internal UPPER_CASE enums → PascalCase strings expected by the API / Prisma
const GENDER_API_MAP: Record<Gender, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
};

const ACTIVITY_LEVEL_API_MAP: Record<ActivityLevel, string> = {
  SEDENTARY: 'Sedentary',
  LIGHT: 'Light',
  MODERATE: 'Moderate',
  ACTIVE: 'Active',
  VERY_ACTIVE: 'VeryActive',
};

const GOAL_API_MAP: Record<Goal, string> = {
  LOSE: 'Lose',
  MAINTAIN: 'Maintain',
  GAIN: 'Gain',
};

// Reverse maps: PascalCase (from API/existing profile) → UPPER_CASE (local enum)
const GENDER_REVERSE_MAP: Record<string, Gender> = Object.fromEntries(
  Object.entries(GENDER_API_MAP).map(([k, v]) => [v, k as Gender]),
) as Record<string, Gender>;

const ACTIVITY_LEVEL_REVERSE_MAP: Record<string, ActivityLevel> = Object.fromEntries(
  Object.entries(ACTIVITY_LEVEL_API_MAP).map(([k, v]) => [v, k as ActivityLevel]),
) as Record<string, ActivityLevel>;

const GOAL_REVERSE_MAP: Record<string, Goal> = Object.fromEntries(
  Object.entries(GOAL_API_MAP).map(([k, v]) => [v, k as Goal]),
) as Record<string, Goal>;

/** Safely parse a gender string (UPPER_CASE or PascalCase) into the Gender enum. */
function parseGender(raw: string | undefined | null): Gender {
  if (!raw) return 'MALE';
  const upper = raw.toUpperCase() as Gender;
  if (upper in GENDER_API_MAP) return upper;
  if (raw in GENDER_REVERSE_MAP) return GENDER_REVERSE_MAP[raw];
  return 'MALE';
}

/** Safely parse an activity-level string into the ActivityLevel enum. */
function parseActivityLevel(raw: string | undefined | null): ActivityLevel {
  if (!raw) return 'MODERATE';
  const upper = raw.toUpperCase().replace(/\s+/g, '_') as ActivityLevel;
  if (upper in ACTIVITY_LEVEL_API_MAP) return upper;
  if (raw in ACTIVITY_LEVEL_REVERSE_MAP) return ACTIVITY_LEVEL_REVERSE_MAP[raw];
  return 'MODERATE';
}

/** Safely parse a goal string into the Goal enum. */
function parseGoal(raw: string | undefined | null): Goal {
  if (!raw) return 'MAINTAIN';
  const upper = raw.toUpperCase() as Goal;
  if (upper in GOAL_API_MAP) return upper;
  if (raw in GOAL_REVERSE_MAP) return GOAL_REVERSE_MAP[raw];
  return 'MAINTAIN';
}

const ACTIVITY_OPTIONS: {
  value: ActivityLevel;
  label: string;
  description: string;
  icon: typeof Footprints;
  color: string;
}[] = [
  { value: "SEDENTARY", label: "Sedentary", description: "Little to no exercise", icon: Footprints, color: "text-slate-400" },
  { value: "LIGHT", label: "Light", description: "Light exercise 1-3 days/week", icon: Bike, color: "text-sky-400" },
  { value: "MODERATE", label: "Moderate", description: "Moderate exercise 3-5 days/week", icon: Dumbbell, color: "text-indigo-400" },
  { value: "ACTIVE", label: "Active", description: "Hard exercise 6-7 days/week", icon: HeartPulse, color: "text-fuchsia-400" },
  { value: "VERY_ACTIVE", label: "Very Active", description: "Very hard exercise, physical job", icon: Trophy, color: "text-amber-400" },
];

const GOAL_OPTIONS: {
  value: Goal;
  label: string;
  description: string;
  icon: typeof TrendingDown;
  color: string;
  gradient: string;
}[] = [
  { value: "LOSE", label: "Lose", description: "Calorie deficit (-500 kcal)", icon: TrendingDown, color: "text-sky-400", gradient: "from-sky-500/30 to-indigo-500/30" },
  { value: "MAINTAIN", label: "Maintain", description: "Maintenance calories", icon: Equal, color: "text-emerald-400", gradient: "from-emerald-500/30 to-teal-500/30" },
  { value: "GAIN", label: "Gain", description: "Calorie surplus (+300 kcal)", icon: TrendingUp, color: "text-amber-400", gradient: "from-amber-500/30 to-orange-500/30" },
];

// ─── Helpers ────────────────────────────────────────────────────────────────────

function computeAge(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function ProfileOnboarding({ onComplete, existingProfile }: ProfileOnboardingProps) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [gender, setGender] = useState<Gender>(
    parseGender(existingProfile?.gender)
  );
  const [dateOfBirth, setDateOfBirth] = useState(
    existingProfile?.dateOfBirth
      ? existingProfile.dateOfBirth.split("T")[0]
      : ""
  );
  const [heightCm, setHeightCm] = useState(
    existingProfile?.heightCm?.toString() || ""
  );
  const [weightKg, setWeightKg] = useState(
    existingProfile?.weightKg?.toString() || ""
  );
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(
    parseActivityLevel(existingProfile?.activityLevel)
  );
  const [goal, setGoal] = useState<Goal>(
    parseGoal(existingProfile?.goal)
  );

  // ─── Computed Nutrition ─────────────────────────────────────────────────────

  const nutrition = useMemo(() => {
    const w = parseFloat(weightKg) || 0;
    const h = parseFloat(heightCm) || 0;
    const age = dateOfBirth ? computeAge(dateOfBirth) : 25;

    let bmr: number;
    if (gender === "FEMALE") {
      bmr = 10 * w + 6.25 * h - 5 * age - 161;
    } else {
      bmr = 10 * w + 6.25 * h - 5 * age + 5;
    }

    const tdee = bmr * PAL_MAP[activityLevel];

    let targetCalories: number;
    if (goal === "LOSE") targetCalories = tdee - 500;
    else if (goal === "GAIN") targetCalories = tdee + 300;
    else targetCalories = tdee;

    const proteinG = Math.round((targetCalories * 0.3) / 4);
    const fatG = Math.round((targetCalories * 0.25) / 9);
    const carbsG = Math.round((targetCalories - proteinG * 4 - fatG * 9) / 4);

    return {
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      targetCalories: Math.round(targetCalories),
      proteinG,
      fatG,
      carbsG,
    };
  }, [gender, dateOfBirth, heightCm, weightKg, activityLevel, goal]);

  // ─── Validation ─────────────────────────────────────────────────────────────

  const canAdvance = useMemo(() => {
    switch (step) {
      case 0:
        return (
          gender &&
          dateOfBirth &&
          parseFloat(heightCm) > 0 &&
          parseFloat(weightKg) > 0
        );
      case 1:
        return !!activityLevel;
      case 2:
        return !!goal;
      case 3:
        return true;
      default:
        return false;
    }
  }, [step, gender, dateOfBirth, heightCm, weightKg, activityLevel, goal]);

  // ─── Navigation ─────────────────────────────────────────────────────────────

  const next = () => {
    if (step < 3 && canAdvance) {
      setDirection(1);
      setStep((s) => s + 1);
    }
  };

  const prev = () => {
    if (step > 0) {
      setDirection(-1);
      setStep((s) => s - 1);
    }
  };

  // ─── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gender: GENDER_API_MAP[gender],
          dateOfBirth,
          weightKg: parseFloat(weightKg),
          heightCm: parseFloat(heightCm),
          activityLevel: ACTIVITY_LEVEL_API_MAP[activityLevel],
          goal: GOAL_API_MAP[goal],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to save profile.");
      }
      setSubmitted(true);
      setTimeout(() => onComplete?.(), 1500);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Step Labels ────────────────────────────────────────────────────────────

  const STEPS = [
    { label: "Biometrics", icon: Ruler },
    { label: "Activity", icon: Flame },
    { label: "Goal", icon: Target },
    { label: "Review", icon: Sparkles },
  ];

  // ─── Slide Variants ─────────────────────────────────────────────────────────

  const slideVariants = {
    enter: (d: number) => ({ x: d > 0 ? 80 : -80, opacity: 0, scale: 0.97 }),
    center: { x: 0, opacity: 1, scale: 1 },
    exit: (d: number) => ({ x: d > 0 ? -80 : 80, opacity: 0, scale: 0.97 }),
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="relative">
      {/* Background Orbs */}
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-indigo-500/30 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-fuchsia-500/20 rounded-full blur-[80px] pointer-events-none" />

      {/* Step Indicator */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === step;
          const isDone = i < step;
          return (
            <div key={s.label} className="flex items-center gap-2">
              <motion.div
                animate={{
                  scale: isActive ? 1.1 : 1,
                  opacity: isActive || isDone ? 1 : 0.4,
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold tracking-wide transition-colors ${
                  isActive
                    ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                    : isDone
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-slate-800/40 text-slate-500 border border-white/5"
                }`}
              >
                {isDone ? (
                  <Check className="w-3 h-3" />
                ) : (
                  <Icon className="w-3 h-3" />
                )}
                <span className="hidden sm:inline">{s.label}</span>
              </motion.div>
              {i < STEPS.length - 1 && (
                <div
                  className={`w-6 h-px ${
                    isDone ? "bg-emerald-500/40" : "bg-white/10"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <div className="relative min-h-[340px]">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* ─── Step 0: Biometrics ─────────────────────────────── */}
            {step === 0 && (
              <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/10 rounded-3xl p-6 md:p-8 border-t-white/20 border-l-white/10 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                <h3 className="text-xl font-bold text-white mb-1 tracking-tight">Biometrics</h3>
                <p className="text-slate-400 text-sm mb-6">Tell us about yourself so we can compute your baseline.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Gender */}
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="gender-select" className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-indigo-400" />
                      Gender
                    </label>
                    <select
                      id="gender-select"
                      value={gender}
                      onChange={(e) => {
                        const parsed = parseGender(e.target.value);
                        setGender(parsed);
                      }}
                      className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-medium"
                    >
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>

                  {/* Date of Birth */}
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="dob-input" className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-fuchsia-400" />
                      Date of Birth
                    </label>
                    <input
                      id="dob-input"
                      type="date"
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50 transition-all font-medium [color-scheme:dark]"
                    />
                  </div>

                  {/* Height */}
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="height-input" className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Ruler className="w-3.5 h-3.5 text-emerald-400" />
                      Height (cm)
                    </label>
                    <input
                      id="height-input"
                      type="number"
                      value={heightCm}
                      onChange={(e) => setHeightCm(e.target.value)}
                      placeholder="175"
                      min={100}
                      max={250}
                      className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-medium placeholder-slate-600"
                    />
                  </div>

                  {/* Weight */}
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="weight-input" className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Weight className="w-3.5 h-3.5 text-amber-400" />
                      Weight (kg)
                    </label>
                    <input
                      id="weight-input"
                      type="number"
                      value={weightKg}
                      onChange={(e) => setWeightKg(e.target.value)}
                      placeholder="70"
                      min={30}
                      max={300}
                      className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all font-medium placeholder-slate-600"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ─── Step 1: Activity Level ─────────────────────────── */}
            {step === 1 && (
              <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/10 rounded-3xl p-6 md:p-8 border-t-white/20 border-l-white/10 relative overflow-hidden">
                <div className="absolute bottom-0 left-0 w-40 h-40 bg-fuchsia-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />
                <h3 className="text-xl font-bold text-white mb-1 tracking-tight">Activity Level</h3>
                <p className="text-slate-400 text-sm mb-6">How active are you on a typical week?</p>

                <div className="flex flex-col gap-3">
                  {ACTIVITY_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const selected = activityLevel === opt.value;
                    return (
                      <motion.button
                        key={opt.value}
                        onClick={() => setActivityLevel(opt.value)}
                        whileTap={{ scale: 0.98 }}
                        className={`flex items-center gap-4 p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                          selected
                            ? "bg-indigo-500/15 border-indigo-500/30 shadow-lg shadow-indigo-500/5"
                            : "bg-black/20 border-white/5 hover:border-white/10 hover:bg-black/30"
                        }`}
                      >
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            selected
                              ? "bg-indigo-500/20 border border-indigo-500/30"
                              : "bg-slate-800/60 border border-white/5"
                          }`}
                        >
                          <Icon className={`w-5 h-5 ${opt.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`font-bold text-sm ${selected ? "text-white" : "text-slate-300"}`}>
                            {opt.label}
                            <span className="ml-2 text-xs font-normal text-slate-500">
                              PAL {PAL_MAP[opt.value]}
                            </span>
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">{opt.description}</p>
                        </div>
                        {selected && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="w-6 h-6 rounded-full bg-indigo-500/30 flex items-center justify-center border border-indigo-500/40"
                          >
                            <Check className="w-3.5 h-3.5 text-indigo-300" />
                          </motion.div>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ─── Step 2: Goal ───────────────────────────────────── */}
            {step === 2 && (
              <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/10 rounded-3xl p-6 md:p-8 border-t-white/20 border-l-white/10 relative overflow-hidden">
                <div className="absolute top-0 left-1/2 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 -translate-x-1/2 pointer-events-none" />
                <h3 className="text-xl font-bold text-white mb-1 tracking-tight">Your Goal</h3>
                <p className="text-slate-400 text-sm mb-6">What are you optimizing for?</p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {GOAL_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const selected = goal === opt.value;
                    return (
                      <motion.button
                        key={opt.value}
                        onClick={() => setGoal(opt.value)}
                        whileTap={{ scale: 0.96 }}
                        className={`flex flex-col items-center gap-3 p-6 rounded-2xl border text-center transition-all cursor-pointer ${
                          selected
                            ? `bg-gradient-to-br ${opt.gradient} border-white/15 shadow-lg`
                            : "bg-black/20 border-white/5 hover:border-white/10 hover:bg-black/30"
                        }`}
                      >
                        <div
                          className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                            selected
                              ? "bg-white/10 border border-white/20"
                              : "bg-slate-800/60 border border-white/5"
                          }`}
                        >
                          <Icon className={`w-6 h-6 ${opt.color}`} />
                        </div>
                        <div>
                          <p className={`font-bold ${selected ? "text-white" : "text-slate-300"}`}>
                            {opt.label}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">{opt.description}</p>
                        </div>
                        {selected && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center"
                          >
                            <Check className="w-3 h-3 text-white" />
                          </motion.div>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ─── Step 3: Review ─────────────────────────────────── */}
            {step === 3 && (
              <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/10 rounded-3xl p-6 md:p-8 border-t-white/20 border-l-white/10 relative overflow-hidden">
                <div className="absolute -top-10 -right-10 w-48 h-48 bg-indigo-500/15 rounded-full blur-[80px] pointer-events-none" />
                <div className="absolute -bottom-10 -left-10 w-36 h-36 bg-fuchsia-500/10 rounded-full blur-[80px] pointer-events-none" />

                <h3 className="text-xl font-bold text-white mb-1 tracking-tight">Review & Confirm</h3>
                <p className="text-slate-400 text-sm mb-6">Here&apos;s your personalized nutrition plan.</p>

                {/* Summary Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  <div className="bg-black/30 rounded-2xl p-4 border border-white/5 text-center">
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">BMR</p>
                    <p className="text-2xl font-black text-white">{nutrition.bmr}</p>
                    <p className="text-[10px] text-slate-500">kcal/day</p>
                  </div>
                  <div className="bg-black/30 rounded-2xl p-4 border border-white/5 text-center">
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">TDEE</p>
                    <p className="text-2xl font-black text-indigo-300">{nutrition.tdee}</p>
                    <p className="text-[10px] text-slate-500">kcal/day</p>
                  </div>
                  <div className="bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 rounded-2xl p-4 border border-indigo-500/20 text-center col-span-2">
                    <p className="text-xs text-indigo-300 font-bold uppercase tracking-wider mb-1">Target</p>
                    <p className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-fuchsia-300">
                      {nutrition.targetCalories}
                    </p>
                    <p className="text-[10px] text-slate-400">kcal/day · {goal.toLowerCase()}</p>
                  </div>
                </div>

                {/* Macro Split */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                  <div className="bg-black/30 rounded-2xl p-4 border border-emerald-500/10 text-center">
                    <p className="text-xs text-emerald-400 font-bold uppercase tracking-wider mb-1">Protein</p>
                    <p className="text-xl font-black text-emerald-300">{nutrition.proteinG}g</p>
                    <p className="text-[10px] text-slate-500">30%</p>
                  </div>
                  <div className="bg-black/30 rounded-2xl p-4 border border-amber-500/10 text-center">
                    <p className="text-xs text-amber-400 font-bold uppercase tracking-wider mb-1">Fat</p>
                    <p className="text-xl font-black text-amber-300">{nutrition.fatG}g</p>
                    <p className="text-[10px] text-slate-500">25%</p>
                  </div>
                  <div className="bg-black/30 rounded-2xl p-4 border border-sky-500/10 text-center">
                    <p className="text-xs text-sky-400 font-bold uppercase tracking-wider mb-1">Carbs</p>
                    <p className="text-xl font-black text-sky-300">{nutrition.carbsG}g</p>
                    <p className="text-[10px] text-slate-500">remaining</p>
                  </div>
                </div>

                {/* Profile Summary */}
                <div className="bg-black/20 rounded-xl p-4 border border-white/5 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-400">
                  <span><strong className="text-slate-300">Gender:</strong> {gender.charAt(0) + gender.slice(1).toLowerCase()}</span>
                  <span><strong className="text-slate-300">Age:</strong> {dateOfBirth ? computeAge(dateOfBirth) : "—"}</span>
                  <span><strong className="text-slate-300">Height:</strong> {heightCm} cm</span>
                  <span><strong className="text-slate-300">Weight:</strong> {weightKg} kg</span>
                  <span><strong className="text-slate-300">Activity:</strong> {activityLevel.replace("_", " ").toLowerCase()}</span>
                  <span><strong className="text-slate-300">Goal:</strong> {goal.toLowerCase()}</span>
                </div>

                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-rose-400 text-sm mt-4 font-medium"
                  >
                    {error}
                  </motion.p>
                )}

                {submitted && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm font-medium"
                  >
                    <Check className="w-4 h-4" />
                    Profile saved successfully!
                  </motion.div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6">
        <button
          onClick={prev}
          disabled={step === 0}
          className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl font-bold text-sm text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>

        {step < 3 ? (
          <button
            onClick={next}
            disabled={!canAdvance}
            className="flex items-center gap-1.5 px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-fuchsia-600 hover:from-indigo-500 hover:to-fuchsia-500 text-white font-bold rounded-xl disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg"
          >
            Continue
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting || submitted}
            className="flex items-center gap-2 px-8 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-500/20"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : submitted ? (
              <>
                <Check className="w-4 h-4" />
                Saved!
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Save Profile
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
