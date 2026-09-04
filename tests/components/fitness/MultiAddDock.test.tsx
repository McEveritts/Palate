// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MultiAddDock } from '@/components/fitness/MultiAddDock';

// Mock sub-modals to isolate MultiAddDock testing
vi.mock('@/components/fitness/FoodSearch', () => ({
  default: () => null,
}));
vi.mock('@/components/fitness/BarcodeScanner', () => ({
  default: () => null,
}));
vi.mock('@/components/fitness/MealScanner', () => ({
  default: () => null,
}));
vi.mock('@/components/fitness/ExerciseLogger', () => ({
  default: () => null,
}));
vi.mock('@/components/fitness/QuickCaloriesModal', () => ({
  QuickCaloriesModal: () => null,
}));

describe('MultiAddDock Scroll and Visibility Behaviors', () => {
  let mainContainer: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true });
    // Create the #palate-main-content container simulating layout.tsx
    mainContainer = document.createElement('div');
    mainContainer.id = 'palate-main-content';
    mainContainer.scrollTop = 0;
    document.body.appendChild(mainContainer);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true });
  });

  it('renders quick action buttons inside toolbar', () => {
    render(<MultiAddDock />);
    expect(screen.getByRole('toolbar', { name: /quick add food actions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /search food/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /scan meal/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /scan barcode/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log exercise/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /quick add/i })).toBeInTheDocument();
  });

  it('auto-hides when scrolling down in palate-main-content and reappears when scrolling up', () => {
    render(<MultiAddDock />);

    const toolbar = screen.getByRole('toolbar', { name: /quick add food actions/i });
    const motionWrapper = toolbar.parentElement;
    expect(motionWrapper).not.toBeNull();

    // Initial state: visible
    expect(motionWrapper?.style.pointerEvents).toBe('auto');

    // Scroll down: delta > 10
    act(() => {
      mainContainer.scrollTop = 150;
      mainContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
    });

    // Should hide on scroll down
    expect(motionWrapper?.style.pointerEvents).toBe('none');

    // Scroll up: delta < 0
    act(() => {
      mainContainer.scrollTop = 80;
      mainContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
    });

    // Should reappear on scroll up
    expect(motionWrapper?.style.pointerEvents).toBe('auto');
  });

  it('remains visible when scroll position is near the top (< threshold)', () => {
    render(<MultiAddDock />);

    const toolbar = screen.getByRole('toolbar', { name: /quick add food actions/i });
    const motionWrapper = toolbar.parentElement;

    // Scroll down to hide
    act(() => {
      mainContainer.scrollTop = 200;
      mainContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    expect(motionWrapper?.style.pointerEvents).toBe('none');

    // Return near top (scrollTop = 5 < threshold 10)
    act(() => {
      mainContainer.scrollTop = 5;
      mainContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    expect(motionWrapper?.style.pointerEvents).toBe('auto');
  });

  it('closes radial quick menu when scrolling down and keeps it closed when scrolling back up', async () => {
    render(<MultiAddDock />);

    const quickAddBtn = screen.getByRole('button', { name: /quick add/i });

    // Open quick menu
    fireEvent.click(quickAddBtn);
    expect(screen.getByText('Quick Calories')).toBeInTheDocument();

    // Scroll down in main container
    act(() => {
      mainContainer.scrollTop = 100;
      mainContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
    });

    // Radial menu should automatically close
    await waitFor(() => {
      expect(screen.queryByText('Quick Calories')).not.toBeInTheDocument();
    });

    // Scroll back up in main container
    act(() => {
      mainContainer.scrollTop = 40;
      mainContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
    });

    // Dock should reappear but radial menu MUST stay closed
    const toolbar = screen.getByRole('toolbar', { name: /quick add food actions/i });
    expect(toolbar.parentElement?.style.pointerEvents).toBe('auto');
    expect(screen.queryByText('Quick Calories')).not.toBeInTheDocument();
  });

  it('ignores scroll events originating from nested inner containers (modals, drawers, dropdowns)', () => {
    render(<MultiAddDock />);

    const toolbar = screen.getByRole('toolbar', { name: /quick add food actions/i });
    const motionWrapper = toolbar.parentElement;
    expect(motionWrapper?.style.pointerEvents).toBe('auto');

    // Create an inner scrollable modal list inside document.body
    const innerModal = document.createElement('div');
    innerModal.id = 'inner-modal-list';
    innerModal.scrollTop = 150;
    document.body.appendChild(innerModal);

    // Dispatch scroll from the inner container
    act(() => {
      innerModal.dispatchEvent(new Event('scroll', { bubbles: true }));
    });

    // Dock should still be visible because page did not scroll
    expect(motionWrapper?.style.pointerEvents).toBe('auto');

    document.body.removeChild(innerModal);
  });

  it('initializes lastScrollY on mount so scrolling up from an already-scrolled position reveals dock', () => {
    // Set initial scroll position before mounting component
    mainContainer.scrollTop = 500;

    render(<MultiAddDock />);

    const toolbar = screen.getByRole('toolbar', { name: /quick add food actions/i });
    const motionWrapper = toolbar.parentElement;

    // Scroll up from 500 to 450 (delta < 0)
    act(() => {
      mainContainer.scrollTop = 450;
      mainContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
    });

    // Dock should be visible
    expect(motionWrapper?.style.pointerEvents).toBe('auto');
  });

  it('handles window scroll fallback if main container does not capture scroll', () => {
    render(<MultiAddDock />);

    const toolbar = screen.getByRole('toolbar', { name: /quick add food actions/i });
    const motionWrapper = toolbar.parentElement;

    // Scroll down via window scroll event
    act(() => {
      Object.defineProperty(window, 'scrollY', { value: 120, writable: true });
      window.dispatchEvent(new Event('scroll'));
    });

    expect(motionWrapper?.style.pointerEvents).toBe('none');

    // Scroll back up via window scroll event
    act(() => {
      Object.defineProperty(window, 'scrollY', { value: 20, writable: true });
      window.dispatchEvent(new Event('scroll'));
    });

    expect(motionWrapper?.style.pointerEvents).toBe('auto');
  });

  it('applies responsive bottom positioning classes for mobile clearance', () => {
    const { container } = render(<MultiAddDock />);
    const dockContainer = container.querySelector('div.fixed');
    expect(dockContainer).not.toBeNull();
    expect(dockContainer).toHaveClass('bottom-20');
    expect(dockContainer).toHaveClass('md:bottom-8');
  });

  it('prevents rubber-band rebound jitter at the bottom boundary', () => {
    // Simulate container with 1600px scrollHeight and 600px clientHeight (maxScroll = 1000px)
    Object.defineProperty(mainContainer, 'scrollHeight', { value: 1600, configurable: true });
    Object.defineProperty(mainContainer, 'clientHeight', { value: 600, configurable: true });

    render(<MultiAddDock />);

    const toolbar = screen.getByRole('toolbar', { name: /quick add food actions/i });
    const motionWrapper = toolbar.parentElement;

    // Scroll down to the bottom (1000px)
    act(() => {
      mainContainer.scrollTop = 1000;
      mainContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    expect(motionWrapper?.style.pointerEvents).toBe('none');

    // Rubber-band overscroll past the bottom to 1050px
    act(() => {
      mainContainer.scrollTop = 1050;
      mainContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    expect(motionWrapper?.style.pointerEvents).toBe('none');

    // Elastic snap-back rebound from 1050px back to 1000px
    act(() => {
      mainContainer.scrollTop = 1000;
      mainContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
    });

    // Dock must REMAIN HIDDEN because rebound is not an upward scroll
    expect(motionWrapper?.style.pointerEvents).toBe('none');

    // Now an intentional scroll up from 1000px to 950px should reveal the dock
    act(() => {
      mainContainer.scrollTop = 950;
      mainContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    expect(motionWrapper?.style.pointerEvents).toBe('auto');
  });

  it('handles scroll events originating from document.documentElement and document.body', () => {
    render(<MultiAddDock />);

    const toolbar = screen.getByRole('toolbar', { name: /quick add food actions/i });
    const motionWrapper = toolbar.parentElement;

    // Scroll down via documentElement scroll
    act(() => {
      Object.defineProperty(window, 'scrollY', { value: 140, writable: true });
      document.documentElement.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    expect(motionWrapper?.style.pointerEvents).toBe('none');

    // Scroll back up via document.body scroll
    act(() => {
      Object.defineProperty(window, 'scrollY', { value: 30, writable: true });
      document.body.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    expect(motionWrapper?.style.pointerEvents).toBe('auto');
  });

  it('renders radial quick menu with responsive wrap classes for mobile screens', () => {
    render(<MultiAddDock />);

    const quickAddBtn = screen.getByRole('button', { name: /quick add/i });
    fireEvent.click(quickAddBtn);

    const radialMenu = screen.getByText('Quick Calories').closest('div');
    expect(radialMenu).not.toBeNull();
    expect(radialMenu).toHaveClass('flex-wrap');
    expect(radialMenu).toHaveClass('justify-center');
  });
});
