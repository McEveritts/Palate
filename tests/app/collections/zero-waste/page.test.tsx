// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ZeroWastePage from '../../../../src/app/collections/zero-waste/page';

describe('ZeroWastePage', () => {
  it('renders the initial zero-waste chat interface', () => {
    render(<ZeroWastePage />);
    expect(screen.getByText('Zero-Waste Kitchen')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e.g. 'I have half an onion/)).toBeInTheDocument();
  });
});
