// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import FlavorProfilePage from '../../../../src/app/collections/flavor-profile/page';

vi.mock('../../../../src/lib/vaultParser', () => ({
  getAllVaultRecipes: vi.fn(() => [
    { title: 'Chili', category: 'mains', markdown: '', frontmatter: { recipe: 'Chili', tags: ['spicy', 'beef'] }, slug: 'chili' },
    { title: 'Salad', category: 'sides', markdown: '', frontmatter: { recipe: 'Salad', tags: ['fresh', 'light'] }, slug: 'salad' }
  ])
}));

describe('FlavorProfilePage', () => {
  it('renders categorized swimlanes based on tags', async () => {
    // Await the Server Component
    const resolvedPage = await FlavorProfilePage();
    render(resolvedPage);
    
    expect(screen.getByText('Midnight Umami & Spice')).toBeInTheDocument();
    expect(screen.getByText('Light & Fresh')).toBeInTheDocument();
    expect(screen.getByText('Chili')).toBeInTheDocument();
    expect(screen.getByText('Salad')).toBeInTheDocument();
  });
});
