import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveTemporalQuery, resolveMealTypeAndDate, calendarToolsDeclarations } from './calendarAgent';
import { scheduleMeal, getScheduledMeals, moveScheduledMeal, cancelScheduledMeal } from '../app/actions';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import fs from 'fs/promises';
import { getAllRecipes } from './vault';

// Set up mocks
vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    recipe: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    scheduledMeal: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    access: vi.fn(),
    unlink: vi.fn(),
  },
}));

vi.mock('./vault', () => ({
  getAllRecipes: vi.fn(() => [
    {
      slug: 'classic-carbonara',
      category: 'mains',
      frontmatter: { title: 'Classic Carbonara' },
      content: 'Carbonara recipe markdown',
    }
  ]),
}));

describe('Temporal NL Resolver', () => {
  // Wednesday, May 20, 2026 (Day index 3)
  const baseDate = new Date('2026-05-20T12:00:00Z');

  it('should resolve simple relative keywords', () => {
    expect(resolveTemporalQuery('today', baseDate)).toBe('2026-05-20');
    expect(resolveTemporalQuery('tonight', baseDate)).toBe('2026-05-20');
    expect(resolveTemporalQuery('tomorrow', baseDate)).toBe('2026-05-21');
    expect(resolveTemporalQuery('yesterday', baseDate)).toBe('2026-05-19');
    expect(resolveTemporalQuery('day after tomorrow', baseDate)).toBe('2026-05-22');
    expect(resolveTemporalQuery('day before yesterday', baseDate)).toBe('2026-05-18');
  });

  it('should resolve days offsets ("in X days" / "X days ago")', () => {
    expect(resolveTemporalQuery('in 5 days', baseDate)).toBe('2026-05-25');
    expect(resolveTemporalQuery('3 days from now', baseDate)).toBe('2026-05-23');
    expect(resolveTemporalQuery('4 days ago', baseDate)).toBe('2026-05-16');
  });

  it('should resolve weekday names correctly', () => {
    // baseDate is Wednesday (3). Next Friday is Friday of next week (May 29).
    expect(resolveTemporalQuery('next Friday', baseDate)).toBe('2026-05-29');
    
    // "this Friday" is the upcoming Friday of this week (May 22).
    expect(resolveTemporalQuery('this Friday', baseDate)).toBe('2026-05-22');
    
    // just "Friday" defaults to closest upcoming Friday (May 22).
    expect(resolveTemporalQuery('Friday', baseDate)).toBe('2026-05-22');

    // "next Monday": next Monday (May 25)
    expect(resolveTemporalQuery('next Monday', baseDate)).toBe('2026-05-25');
  });

  it('should preserve standard ISO format', () => {
    expect(resolveTemporalQuery('2026-06-15', baseDate)).toBe('2026-06-15');
  });

  it('should extract meal type and resolve relative dates simultaneously', () => {
    const res1 = resolveMealTypeAndDate('tomorrow dinner', baseDate);
    expect(res1.dateStr).toBe('2026-05-21');
    expect(res1.mealType).toBe('Dinner');

    const res2 = resolveMealTypeAndDate('lunch in 3 days', baseDate);
    expect(res2.dateStr).toBe('2026-05-23');
    expect(res2.mealType).toBe('Lunch');

    const res3 = resolveMealTypeAndDate('breakfast next Monday', baseDate);
    expect(res3.dateStr).toBe('2026-05-25');
    expect(res3.mealType).toBe('Breakfast');
  });
});

describe('Calendar Tools Declarations Schema Correctness', () => {
  it('should declare all calendar functions correctly', () => {
    expect(calendarToolsDeclarations).toHaveLength(4);
    const names = calendarToolsDeclarations.map(d => d.name);
    expect(names).toContain('schedule_meal');
    expect(names).toContain('get_scheduled_meals');
    expect(names).toContain('move_scheduled_meal');
    expect(names).toContain('cancel_scheduled_meal');

    const schedule = calendarToolsDeclarations.find(d => d.name === 'schedule_meal');
    expect(schedule?.parameters?.required).toContain('recipeId');
    expect(schedule?.parameters?.required).toContain('dateStr');
    expect(schedule?.parameters?.required).toContain('mealType');
  });
});

describe('Calendar Server Actions - Authenticated Mode', () => {
  const mockUserId = 'user-123';
  const mockRecipe = { id: 'recipe-abc', userId: mockUserId, slug: 'classic-carbonara', title: 'Classic Carbonara' };

  beforeEach(() => {
    vi.resetAllMocks();
    // Setup authenticated session
    (getServerSession as any).mockResolvedValue({
      user: { id: mockUserId, email: 'test@example.com' }
    });
  });

  it('should schedule meal via database when authenticated', async () => {
    (prisma.recipe.findFirst as any).mockResolvedValue(mockRecipe);
    (prisma.scheduledMeal.create as any).mockResolvedValue({
      id: 'meal-789',
      recipeId: mockRecipe.id,
      date: new Date('2026-05-21'),
      mealType: 'Dinner',
      plannedYield: 1.0,
      recipe: mockRecipe
    });

    const res = await scheduleMeal('classic-carbonara', '2026-05-21', 'Dinner');

    expect(res.success).toBe(true);
    expect(res.meal?.id).toBe('meal-789');
    expect(prisma.scheduledMeal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: mockUserId,
        recipeId: mockRecipe.id,
        mealType: 'Dinner',
        plannedYield: 1.0
      }),
      include: { recipe: true }
    });
  });

  it('should retrieve scheduled meals via database when authenticated', async () => {
    const mockMeals = [
      { id: 'm1', recipeId: 'r1', date: new Date('2026-05-20'), mealType: 'Lunch', recipe: mockRecipe }
    ];
    (prisma.scheduledMeal.findMany as any).mockResolvedValue(mockMeals);

    const res = await getScheduledMeals('2026-05-19', '2026-05-21');

    expect(res.success).toBe(true);
    expect(res.meals).toEqual(mockMeals);
    expect(prisma.scheduledMeal.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: mockUserId
      }),
      include: { recipe: true },
      orderBy: { date: 'asc' }
    });
  });

  it('should move scheduled meal via database when authenticated', async () => {
    const mockUpdatedMeal = { id: 'meal-789', date: new Date('2026-05-22'), mealType: 'Lunch', recipe: mockRecipe };
    (prisma.scheduledMeal.update as any).mockResolvedValue(mockUpdatedMeal);

    const res = await moveScheduledMeal('meal-789', '2026-05-22', 'Lunch');

    expect(res.success).toBe(true);
    expect(res.meal).toEqual(mockUpdatedMeal);
    expect(prisma.scheduledMeal.update).toHaveBeenCalledWith({
      where: { id: 'meal-789', userId: mockUserId },
      data: { date: new Date('2026-05-22'), mealType: 'Lunch' },
      include: { recipe: true }
    });
  });

  it('should cancel scheduled meal via database when authenticated', async () => {
    const res = await cancelScheduledMeal('meal-789');

    expect(res.success).toBe(true);
    expect(prisma.scheduledMeal.delete).toHaveBeenCalledWith({
      where: { id: 'meal-789', userId: mockUserId }
    });
  });
});

describe('Calendar Server Actions - Guest Mode Fallback', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Setup guest session (null session)
    (getServerSession as any).mockResolvedValue(null);
  });

  it('should save scheduled meal to local JSON store in guest mode', async () => {
    (fs.readFile as any).mockResolvedValue('[]'); // initially empty array
    (fs.writeFile as any).mockResolvedValue(undefined);

    const res = await scheduleMeal('classic-carbonara', '2026-05-21', 'Dinner');

    expect(res.success).toBe(true);
    expect(res.meal?.userId).toBe('guest');
    expect(res.meal?.recipeId).toBe('classic-carbonara');
    expect(res.meal?.mealType).toBe('Dinner');
    expect(fs.writeFile).toHaveBeenCalled();
  });

  it('should retrieve guest scheduled meals and merge vault recipes', async () => {
    const guestMeals = [
      { id: 'guest-m1', userId: 'guest', recipeId: 'classic-carbonara', date: '2026-05-21T00:00:00.000Z', mealType: 'Dinner', plannedYield: 1 }
    ];
    (fs.readFile as any).mockResolvedValue(JSON.stringify(guestMeals));

    const res = await getScheduledMeals('2026-05-20', '2026-05-22');

    expect(res.success).toBe(true);
    expect(res.meals).toBeDefined();
    const meals = res.meals!;
    expect(meals).toHaveLength(1);
    expect(meals[0].id).toBe('guest-m1');
    expect(meals[0].recipe).toBeDefined();
    expect(meals[0].recipe!.title).toBe('Classic Carbonara');
    expect(meals[0].recipe!.slug).toBe('classic-carbonara');
  });

  it('should update guest scheduled meal in local JSON store', async () => {
    const guestMeals = [
      { id: 'guest-m1', userId: 'guest', recipeId: 'classic-carbonara', date: '2026-05-21T00:00:00.000Z', mealType: 'Dinner', plannedYield: 1 }
    ];
    (fs.readFile as any).mockResolvedValue(JSON.stringify(guestMeals));
    (fs.writeFile as any).mockResolvedValue(undefined);

    const res = await moveScheduledMeal('guest-m1', '2026-05-22', 'Lunch');

    expect(res.success).toBe(true);
    expect(res.meal?.date).toContain('2026-05-22');
    expect(res.meal?.mealType).toBe('Lunch');
    expect(fs.writeFile).toHaveBeenCalled();
  });

  it('should cancel guest scheduled meal in local JSON store', async () => {
    const guestMeals = [
      { id: 'guest-m1', userId: 'guest', recipeId: 'classic-carbonara', date: '2026-05-21T00:00:00.000Z', mealType: 'Dinner', plannedYield: 1 }
    ];
    (fs.readFile as any).mockResolvedValue(JSON.stringify(guestMeals));
    (fs.writeFile as any).mockResolvedValue(undefined);

    const res = await cancelScheduledMeal('guest-m1');

    expect(res.success).toBe(true);
    // Verifying it saved empty array after deleting the only meal
    const writtenData = JSON.parse((fs.writeFile as any).mock.calls[0][1]);
    expect(writtenData).toHaveLength(0);
  });
});
