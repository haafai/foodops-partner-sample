import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DishImage } from '../src/components/DishImage';

describe('DishImage', () => {
  it('renders the photo when there is one', () => {
    render(<DishImage src="/images/dishes/classic-burger.jpg" name="Classic Burger" />);
    const img = screen.getByRole('img', { name: 'Classic Burger' });
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', '/images/dishes/classic-burger.jpg');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('renders a branded tile with initials when there is no photo', () => {
    render(<DishImage src={null} name="Onion Rings" />);
    const tile = screen.getByTestId('image-tile');
    expect(tile).toHaveAttribute('role', 'img');
    expect(tile).toHaveAttribute('aria-label', 'Onion Rings');
    expect(tile).toHaveTextContent('OR');
  });

  it('swaps to the tile when the photo fails to load', () => {
    render(<DishImage src="https://cdn.example.test/missing.jpg" name="Classic Burger" />);
    fireEvent.error(screen.getByRole('img', { name: 'Classic Burger' }));
    expect(screen.getByTestId('image-tile')).toHaveTextContent('CB');
  });

  it('tries again when it is given a different photo', () => {
    const { rerender } = render(<DishImage src="https://cdn.example.test/missing.jpg" name="Classic Burger" />);
    fireEvent.error(screen.getByRole('img', { name: 'Classic Burger' }));
    rerender(<DishImage src="https://cdn.example.test/other.jpg" name="Classic Burger" />);
    expect(screen.getByRole('img', { name: 'Classic Burger' }).tagName).toBe('IMG');
  });
});
