import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dailyUpsert: vi.fn(),
  dailyUpdate: vi.fn(),
  foodCreate: vi.fn(),
  exerciseCreate: vi.fn(),
  waterCreate: vi.fn(),
  weightCreate: vi.fn(),
  profileFind: vi.fn(),
  profileUpdate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    dailyLog: { upsert: mocks.dailyUpsert, update: mocks.dailyUpdate },
    foodLogEntry: { create: mocks.foodCreate },
    exerciseLogEntry: { create: mocks.exerciseCreate },
    waterLogEntry: { create: mocks.waterCreate },
    weightLog: { create: mocks.weightCreate },
    userProfile: { findUnique: mocks.profileFind, update: mocks.profileUpdate },
    $transaction: mocks.transaction,
  },
}));

vi.mock('@/lib/fitness', () => ({
  calculateTargetCalories: vi.fn().mockReturnValue(2100),
  allocateMacros: vi.fn().mockReturnValue({ protein: 160, carbs: 220, fat: 65 }),
}));

import { persistSageToolLog } from '@/lib/sageLogPersistence';

describe('persistSageToolLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dailyUpsert.mockResolvedValue({ id: 'daily-1' });
    mocks.foodCreate.mockResolvedValue({ id: 'food-1' });
    mocks.exerciseCreate.mockResolvedValue({ id: 'exercise-1' });
    mocks.waterCreate.mockResolvedValue({ id: 'water-1' });
    mocks.weightCreate.mockResolvedValue({ id: 'weight-1' });
    mocks.dailyUpdate.mockResolvedValue({
      totalCalories: 500,
      totalProtein: 40,
      totalCarbs: 50,
      totalFat: 15,
      waterIntakeMl: 750,
    });
    mocks.profileFind.mockResolvedValue(null);
    mocks.transaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
  });

  it('persists food and atomically increments aggregate macros', async () => {
    const result = await persistSageToolLog(
      'user-1',
      'log_food_consumption',
      { food_name: 'Salmon', calories: 412.4, protein: 40.2, carbs: 0, fat: 26.1 },
      { localHour: 18 },
    );

    expect(mocks.foodCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dailyLogId: 'daily-1',
        mealType: 'Dinner',
        customFoodName: 'Salmon',
        calories: 412,
        protein: 40,
        carbs: 0,
        fat: 26,
      }),
    });
    expect(mocks.dailyUpdate).toHaveBeenCalledWith({
      where: { id: 'daily-1' },
      data: {
        totalCalories: { increment: 412 },
        totalProtein: { increment: 40 },
        totalCarbs: { increment: 0 },
        totalFat: { increment: 26 },
      },
    });
    expect(result.entryId).toBe('food-1');
  });

  it('persists hydration and updates its aggregate in one transaction', async () => {
    const result = await persistSageToolLog('user-1', 'log_hydration', { amount_ml: 749.6 });
    expect(mocks.waterCreate).toHaveBeenCalledWith({
      data: { dailyLogId: 'daily-1', amountMl: 750 },
    });
    expect(mocks.dailyUpdate).toHaveBeenCalledWith({
      where: { id: 'daily-1' },
      data: { waterIntakeMl: { increment: 750 } },
    });
    expect(result.totalWaterMl).toBe(750);
  });

  it('persists a weight even when no profile exists', async () => {
    const result = await persistSageToolLog('user-1', 'log_weight', { weight_kg: 82.3 });
    expect(mocks.weightCreate).toHaveBeenCalledWith({ data: { userId: 'user-1', weightKg: 82.3 } });
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
    expect(result.entryId).toBe('weight-1');
  });
});
