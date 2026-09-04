// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CalendarView, getLocalDateString, getMealDateString, formatMealDateFriendly, formatMealDateFriendlyLong } from '@/app/plans/CalendarView';
import type { VaultRecipe } from '@/lib/vaultParser';

// Mock server actions
vi.mock('@/app/actions', () => ({
  scheduleMeal: vi.fn().mockResolvedValue({ success: true }),
  getScheduledMeals: vi.fn().mockResolvedValue({
    success: true,
    meals: [
      {
        id: 'meal-1',
        userId: 'user-1',
        recipeId: 'test-recipe-1',
        date: '2026-09-04T12:00:00Z',
        mealType: 'Dinner',
        plannedYield: 1.5,
        parentMealId: null,
        recipe: {
          id: 'test-recipe-1',
          title: 'Pan-Seared Branzino',
          slug: 'pan-seared-branzino',
          markdown: '### Ingredients\n- 2 fillets branzino\n- 1 lemon',
          frontmatter: {
            macros: 'Calories: 450 | Protein: 40g | Carbs: 5g | Fat: 28g'
          }
        }
      }
    ]
  }),
  moveScheduledMeal: vi.fn().mockResolvedValue({ success: true }),
  cancelScheduledMeal: vi.fn().mockResolvedValue({ success: true })
}));

describe('CalendarView Component (Phase 4 Container-Driven Density)', () => {
  const mockVaultRecipes: VaultRecipe[] = [
    {
      id: 'rec-1',
      title: 'Pan-Seared Branzino',
      slug: 'pan-seared-branzino',
      content: '# Branzino',
      macros: 'Calories: 450 | Protein: 40g | Carbs: 5g | Fat: 28g',
      category: 'mains',
      tags: ['seafood', 'keto']
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders in 1-day mode with 7-pill day selector strip and exactly 1 day column', async () => {
    render(
      <CalendarView 
        vaultRecipes={mockVaultRecipes} 
        currentRecipes={[]} 
        archiveRecipes={[]} 
        forceMode="1-day"
      />
    );

    // Verify mode badge
    expect(screen.getByText('1-Day')).toBeInTheDocument();

    // Verify 7-pill day selector strip is rendered
    const daySelector = await screen.findByTestId('mobile-day-selector');
    expect(daySelector).toBeInTheDocument();

    // Should have 7 pill buttons
    const pillButtons = daySelector.querySelectorAll('button');
    expect(pillButtons.length).toBe(7);

    // Wait for meals to load and verify grid renders exactly 1 day column
    const grid = await screen.findByTestId('calendar-grid');
    expect(grid).toBeInTheDocument();
    expect(grid.getAttribute('data-mode')).toBe('1-day');
    expect(grid.children.length).toBe(1);
  });

  it('renders in 3-day mode with exactly 3 columns side-by-side', async () => {
    render(
      <CalendarView 
        vaultRecipes={mockVaultRecipes} 
        currentRecipes={[]} 
        archiveRecipes={[]} 
        forceMode="3-day"
      />
    );

    expect(screen.getByText('3-Day')).toBeInTheDocument();

    // In 3-day mode, the 7-pill strip should NOT be present
    expect(screen.queryByTestId('mobile-day-selector')).toBeNull();

    const grid = await screen.findByTestId('calendar-grid');
    expect(grid).toBeInTheDocument();
    expect(grid.getAttribute('data-mode')).toBe('3-day');
    expect(grid.children.length).toBe(3);
  });

  it('renders in 7-day mode with full 7 columns', async () => {
    render(
      <CalendarView 
        vaultRecipes={mockVaultRecipes} 
        currentRecipes={[]} 
        archiveRecipes={[]} 
        forceMode="7-day"
      />
    );

    expect(screen.getByText('7-Day')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-day-selector')).toBeNull();

    const grid = await screen.findByTestId('calendar-grid');
    expect(grid).toBeInTheDocument();
    expect(grid.getAttribute('data-mode')).toBe('7-day');
    expect(grid.children.length).toBe(7);
  });

  it('allows tapping pills in 1-day mode to switch the active day', async () => {
    render(
      <CalendarView 
        vaultRecipes={mockVaultRecipes} 
        currentRecipes={[]} 
        archiveRecipes={[]} 
        forceMode="1-day"
      />
    );

    const daySelector = await screen.findByTestId('mobile-day-selector');
    const pillButtons = daySelector.querySelectorAll('button');

    // Click on the first pill (Sunday)
    fireEvent.click(pillButtons[0]);
    expect(pillButtons[0].getAttribute('aria-pressed')).toBe('true');

    // Click on the third pill (Tuesday)
    fireEvent.click(pillButtons[2]);
    expect(pillButtons[2].getAttribute('aria-pressed')).toBe('true');
  });

  it('steps navigation by day in 1-day mode, by 3 days in 3-day mode, and by week in 7-day mode', async () => {
    const { unmount } = render(
      <CalendarView 
        vaultRecipes={mockVaultRecipes} 
        currentRecipes={[]} 
        archiveRecipes={[]} 
        forceMode="3-day"
      />
    );

    const nextBtn = screen.getByTitle('Next');
    const prevBtn = screen.getByTitle('Previous');
    const todayBtn = screen.getByText('Today');

    expect(nextBtn).toBeInTheDocument();
    expect(prevBtn).toBeInTheDocument();
    expect(todayBtn).toBeInTheDocument();

    // Click Next in 3-day mode
    fireEvent.click(nextBtn);
    // Click Today in 3-day mode
    fireEvent.click(todayBtn);

    unmount();
  });

  it('date formatting helpers format dates consistently and timezone-safely', () => {
    const testDate = new Date(2026, 8, 4); // Sep 4, 2026
    expect(getLocalDateString(testDate)).toBe('2026-09-04');
    expect(getMealDateString(testDate)).toBe('2026-09-04');
    expect(getMealDateString('2026-09-04T12:00:00Z')).toBe('2026-09-04');
    expect(formatMealDateFriendly(testDate)).toContain('Sep 4');
    expect(formatMealDateFriendlyLong(testDate)).toContain('September 4, 2026');
  });

  it('clicking an empty slot opens the schedule meal modal pre-populated with that day and meal type', async () => {
    render(
      <CalendarView 
        vaultRecipes={mockVaultRecipes} 
        currentRecipes={[]} 
        archiveRecipes={[]} 
        forceMode="1-day"
      />
    );

    const emptySlots = await screen.findAllByRole('button', { name: /Empty/i });
    expect(emptySlots.length).toBeGreaterThan(0);

    fireEvent.click(emptySlots[0]);

    // Modal title should appear
    expect(screen.getByText('Schedule culinary recipe')).toBeInTheDocument();
  });

  it('allows opening meal details and initiating reschedule workflow', async () => {
    render(
      <CalendarView 
        vaultRecipes={mockVaultRecipes} 
        currentRecipes={[]} 
        archiveRecipes={[]} 
        forceMode="7-day"
      />
    );

    // Wait for the scheduled meal card to appear
    const mealCardTitle = await screen.findByText('Pan-Seared Branzino');
    expect(mealCardTitle).toBeInTheDocument();

    // Click to open meal detail modal
    fireEvent.click(mealCardTitle);

    // Details modal should be open
    expect(screen.getByText('Reschedule / Move Meal')).toBeInTheDocument();

    const changeDateBtn = screen.getByText('Change Date / Type');
    expect(changeDateBtn).toBeInTheDocument();
    fireEvent.click(changeDateBtn);

    // Reschedule form should now display
    expect(screen.getByText('New Date')).toBeInTheDocument();
    expect(screen.getByText('New Meal Type')).toBeInTheDocument();
    expect(screen.getByText('Save Changes')).toBeInTheDocument();
  });
});
