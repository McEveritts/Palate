// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { VaultGrid } from '@/components/vault/VaultGrid';
import type { VaultRecipe } from '@/lib/vaultParser';

// Mock server actions
vi.mock('@/app/actions', () => ({
  deleteRecipeFromVault: vi.fn().mockResolvedValue({ success: true }),
  updateRecipeMacros: vi.fn().mockResolvedValue({ success: true })
}));

describe('VaultGrid Component (Phase 4 CSS Grid & Touch Accessibility)', () => {
  const mockRecipes: VaultRecipe[] = [
    {
      id: 'rec-1',
      title: 'Espresso Braised Beef Short Ribs',
      slug: 'espresso-braised-beef-short-ribs',
      content: 'Rich and tender braised ribs.',
      macros: 'Calories: 680 | Protein: 48g | Carbs: 12g | Fat: 44g',
      category: 'mains',
      tags: ['beef', 'dinner']
    },
    {
      id: 'rec-2',
      title: 'Skillet Pressed Pommes Anna',
      slug: 'skillet-pressed-pommes-anna',
      content: 'Crispy layered potatoes.',
      macros: 'Calories: 310 | Protein: 4g | Carbs: 38g | Fat: 16g',
      category: 'sides',
      tags: ['potatoes', 'side']
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders recipes inside a CSS Grid container rather than CSS multi-column', () => {
    const { container } = render(<VaultGrid initialRecipes={mockRecipes} />);

    // Check for CSS grid classes on the main cards grid container
    const gridElement = container.querySelector('.grid.grid-cols-1');
    expect(gridElement).toBeInTheDocument();
    expect(gridElement?.className).toContain('grid-cols-1');
    expect(gridElement?.className).toContain('sm:grid-cols-2');
    expect(gridElement?.className).toContain('lg:grid-cols-3');
    expect(gridElement?.className).toContain('xl:grid-cols-4');
    expect(gridElement?.className).not.toContain('columns-1');
  });

  it('renders the macro dashboard with .vault-macro-dashboard for responsive touch/hover visibility', () => {
    const { container } = render(<VaultGrid initialRecipes={mockRecipes} />);

    const macroDashboards = container.querySelectorAll('.vault-macro-dashboard');
    expect(macroDashboards.length).toBe(2);

    // Verify macro text contents
    expect(screen.getByText('680 kcal')).toBeInTheDocument();
    expect(screen.getByText('48g')).toBeInTheDocument();
  });

  it('renders the delete trashcan button with .touch-visible-hover-reveal for mobile/touch accessibility', () => {
    const { container } = render(<VaultGrid initialRecipes={mockRecipes} />);

    const touchButtons = container.querySelectorAll('.touch-visible-hover-reveal');
    expect(touchButtons.length).toBe(2);

    const deleteBtns = screen.getAllByTitle('Delete recipe');
    expect(deleteBtns.length).toBe(2);
  });

  it('activates confirmation state when delete button is pressed', async () => {
    render(<VaultGrid initialRecipes={mockRecipes} />);

    const deleteBtns = screen.getAllByTitle('Delete recipe');
    fireEvent.click(deleteBtns[0]);

    // Should prompt "Confirm?"
    expect(screen.getByText('Confirm?')).toBeInTheDocument();
  });
});
