// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import FlavorProfilePage from '../../../../src/app/collections/flavor-profile/page';

vi.mock('../../../../src/lib/vaultParser', () => ({
  getVaultRecipes: vi.fn(() => [
    { id: 'chili', title: 'Chili', category: 'mains', tags: ['spicy', 'beef'], macros: '', content: '' },
    { id: 'salad', title: 'Salad', category: 'sides', tags: ['fresh', 'light'], macros: '', content: '' }
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
