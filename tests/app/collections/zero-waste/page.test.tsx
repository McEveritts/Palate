// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ZeroWastePage from '../../../../src/app/collections/zero-waste/page';

describe('ZeroWastePage', () => {
  it('renders the initial zero-waste dashboard with split-pane view', () => {
    render(<ZeroWastePage />);
    // Verify title is rendered
    expect(screen.getByText('Zero-Waste Kitchen Canvas')).toBeInTheDocument();
    
    // Verify that the Synergy Network visual dashboard element "PANTRY DECAY STATUS" is rendered alongside it
    expect(screen.getByText('PANTRY DECAY STATUS')).toBeInTheDocument();
    
    // Verify that the JIT Rescue input panel placeholder is rendered
    expect(screen.getByPlaceholderText(/Click on the canvas, or type e.g. 'Stale sourdough'/)).toBeInTheDocument();
  });
});
