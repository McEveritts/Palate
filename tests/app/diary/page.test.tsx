// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import DiaryPage from '@/app/diary/page';

// Mock NextAuth session
vi.mock('next-auth', () => ({
  getServerSession: vi.fn().mockResolvedValue({
    user: { id: 'test-user-id', name: 'Test Chef', email: 'chef@example.com' },
  }),
}));

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    userProfile: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'p1',
        userId: 'test-user-id',
        targetCalories: 2000,
        targetProtein: 150,
        targetCarbs: 200,
        targetFat: 65,
        targetWaterMl: 2000,
        gender: 'Male',
        dateOfBirth: new Date('1990-01-01'),
        weightKg: 75,
        heightCm: 175,
        activityLevel: 'Active',
        goal: 'Maintenance',
      }),
    },
    dailyLog: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'dl1',
        userId: 'test-user-id',
        date: new Date(),
        totalCalories: 1500,
        totalProtein: 120,
        totalCarbs: 160,
        totalFat: 50,
        totalFiber: 25,
        totalSugar: 30,
        totalSodium: 1800,
        waterIntakeMl: 1500,
        entries: [],
        exerciseEntries: [],
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

// Mock DiaryClientWrapper to isolate page layout assertions
vi.mock('@/app/diary/DiaryClientWrapper', () => ({
  DiaryClientWrapper: () => <div data-testid="diary-client-wrapper" />,
}));

// Mock FastingTimer and child widgets
vi.mock('@/components/fitness/FastingTimer', () => ({
  FastingTimer: () => <div data-testid="fasting-timer" />,
}));
vi.mock('@/components/fitness/HydrationEnergyRow', () => ({
  HydrationEnergyRow: () => <div data-testid="hydration-energy-row" />,
}));

describe('Sage Fitness DiaryPage Layout and Spacing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with responsive padding on either side and max-w-7xl centered container', async () => {
    const pageJsx = await DiaryPage({ searchParams: Promise.resolve({ date: '2026-09-04' }) });
    const { container } = render(pageJsx);

    // Root page container must have responsive padding on both sides:
    // px-4 on mobile, sm:px-6 on small tablet, md:px-8 on tablet, lg:px-10 on desktop
    const rootDiv = container.firstElementChild as HTMLElement;
    expect(rootDiv).toHaveClass('px-4');
    expect(rootDiv).toHaveClass('sm:px-6');
    expect(rootDiv).toHaveClass('md:px-8');
    expect(rootDiv).toHaveClass('lg:px-10');
    expect(rootDiv).toHaveClass('py-6');
    expect(rootDiv).toHaveClass('pb-32');

    // Content container must expand up to max-w-7xl with mx-auto
    const innerContainer = rootDiv.firstElementChild as HTMLElement;
    expect(innerContainer).toHaveClass('max-w-7xl');
    expect(innerContainer).toHaveClass('mx-auto');
  });

  it('renders the top fitness modules with responsive column gap on either side', async () => {
    const pageJsx = await DiaryPage({ searchParams: Promise.resolve({ date: '2026-09-04' }) });
    const { container } = render(pageJsx);

    // Find the top widgets grid container
    const gridContainer = container.querySelector('.grid.grid-cols-1.lg\\:grid-cols-2');
    expect(gridContainer).not.toBeNull();
    expect(gridContainer).toHaveClass('gap-6');
    expect(gridContainer).toHaveClass('lg:gap-8');

    // Both columns must have proportional vertical spacing matching the grid
    const columns = gridContainer?.children;
    expect(columns).toHaveLength(2);
    expect(columns?.[0]).toHaveClass('gap-6');
    expect(columns?.[0]).toHaveClass('lg:gap-8');
    expect(columns?.[1]).toHaveClass('gap-6');
    expect(columns?.[1]).toHaveClass('lg:gap-8');
  });
});
