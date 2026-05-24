export type Gender = 'male' | 'female' | 'other';

export interface BMRParams {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  gender: Gender | string; // Accept string for wider compatibility
}

/**
 * Calculates Basal Metabolic Rate (BMR) using the Mifflin-St Jeor equation.
 *
 * Male:   BMR = (10 × m) + (6.25 × h) - (5 × a) + 5
 * Female: BMR = (10 × m) + (6.25 × h) - (5 × a) - 161
 * Other:  BMR = (10 × m) + (6.25 × h) - (5 × a) - 78  (average of +5 and -161)
 */
export function calculateBMR({ weightKg, heightCm, ageYears, gender }: BMRParams): number {
  if (!weightKg || weightKg <= 0 || !heightCm || heightCm <= 0 || !ageYears || ageYears <= 0) {
    throw new Error('BMR inputs must be positive numbers');
  }
  const normalizedGender = gender.toLowerCase();

  if (normalizedGender === 'male') {
    return 10 * weightKg + 6.25 * heightCm - 5 * ageYears + 5;
  } else if (normalizedGender === 'female') {
    return 10 * weightKg + 6.25 * heightCm - 5 * ageYears - 161;
  } else {
    // 'other' or any unrecognised value — average of male (+5) and female (-161)
    return 10 * weightKg + 6.25 * heightCm - 5 * ageYears - 78;
  }
}

export const PAL_COEFFICIENTS = {
  // Prisma-matching PascalCase keys
  Sedentary: 1.2,
  Light: 1.375,
  Moderate: 1.55,
  Active: 1.725,
  VeryActive: 1.9,
  // Lowercase / camelCase aliases
  sedentary: 1.2,
  lightlyActive: 1.375,
  moderatelyActive: 1.55,
  veryActive: 1.725,
  extraActive: 1.9,
} as const;

export type ActivityLevel = keyof typeof PAL_COEFFICIENTS;

export interface TDEEParams extends BMRParams {
  activityLevel: string;
}

/**
 * Calculates Total Daily Energy Expenditure (TDEE).
 * TDEE = BMR × PAL
 */
export function calculateTDEE(params: TDEEParams): number {
  const bmr = calculateBMR(params);

  const pal =
    (PAL_COEFFICIENTS as Record<string, number>)[params.activityLevel] ??
    PAL_COEFFICIENTS.Sedentary;

  if (!(params.activityLevel in PAL_COEFFICIENTS)) {
    console.warn(`Unknown activityLevel '${params.activityLevel}', defaulting to Sedentary.`);
  }

  return bmr * pal;
}

export interface TargetCaloriesParams extends TDEEParams {
  goalDelta: number; // The user's objective (ΔE)
}

/**
 * Calculates Target Caloric Threshold.
 * E_target = TDEE + ΔE
 */
export function calculateTargetCalories(params: TargetCaloriesParams): number {
  const tdee = calculateTDEE(params);
  return Math.max(tdee + params.goalDelta, 0);
}

export interface MacroVector {
  protein: number;
  carbs: number;
  fat: number;
}

export interface MacroAllocationParams {
  targetCalories: number;
  weightKg: number;
  proteinPerKg?: number; // Default 2.2g/kg
  fatPercentage?: number; // Default 0.25 (25%)
}

/**
 * Calculates Macronutrient Vector Allocation.
 * Returns macronutrients in grams.
 *
 * 1. Protein (P): Fixed scalar based on total mass (default 2.2g / kg).
 * 2. Fat (F): Percentage constraint of targetCalories (default 0.25 * targetCalories / 9).
 * 3. Carbohydrates (C): The remaining caloric delta divided by 4.
 */
export function allocateMacros({
  targetCalories,
  weightKg,
  proteinPerKg = 2.2,
  fatPercentage = 0.25,
}: MacroAllocationParams): MacroVector {
  if (targetCalories <= 0 || weightKg <= 0) {
    return { protein: 0, carbs: 0, fat: 0 };
  }

  // Protein (P)
  const proteinGrams = weightKg * proteinPerKg;
  const proteinCalories = proteinGrams * 4;

  // Fat (F)
  const fatCalories = targetCalories * fatPercentage;
  const fatGrams = fatCalories / 9;

  // Carbohydrates (C)
  const remainingCalories = targetCalories - proteinCalories - fatCalories;
  const carbsGrams = remainingCalories > 0 ? remainingCalories / 4 : 0;

  return {
    protein: Math.round(proteinGrams),
    carbs: Math.round(carbsGrams),
    fat: Math.round(fatGrams),
  };
}
