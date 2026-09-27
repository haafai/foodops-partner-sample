import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Wordmark } from '../src/components/Wordmark';

describe('Wordmark', () => {
  it('renders the brand name with a decorative glyph', () => {
    const { container } = render(<Wordmark />);
    expect(screen.getByText('kaana')).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
