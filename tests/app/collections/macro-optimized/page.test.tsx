// @vitest-environment jsdom
// tests/app/collections/macro-optimized/page.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import MacroOptimizedPage from '../../../../src/app/collections/macro-optimized/page';

vi.mock('../../../../src/lib/vaultParser', () => ({
  getAllVaultRecipes: vi.fn(() => [
    { title: 'Chicken', category: 'mains', markdown: '', frontmatter: { recipe: 'Chicken', tags: [], macros: 'Calories: 200 | Protein: 40g | Carbs: 0g | Fat: 5g' } },
    { title: 'Pasta', category: 'mains', markdown: '', frontmatter: { recipe: 'Pasta', tags: [], macros: 'Calories: 400 | Protein: 10g | Carbs: 80g | Fat: 5g' } }
  ])
}));

describe('MacroOptimizedPage', () => {
  it('renders recipes sorted by protein density', async () => {
    render(await MacroOptimizedPage());
    const cards = screen.getAllByRole('heading', { level: 3 });
    expect(cards[0]).toHaveTextContent('Chicken'); // 40/200 = 0.2 density
    expect(cards[1]).toHaveTextContent('Pasta');   // 10/400 = 0.025 density
  });
});