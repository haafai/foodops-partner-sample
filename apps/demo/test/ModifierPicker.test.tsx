import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ModifierPicker } from '../src/components/ModifierPicker';
import { CLASSIC } from './menu-fixture';

describe('ModifierPicker', () => {
  it('counts two clicks that land in the same render batch twice', () => {
    render(<ModifierPicker item={CLASSIC} onAdd={vi.fn()} />);
    const addCheese = screen.getByRole('button', { name: 'Add Cheese' });
    // Both clicks run before React re-renders, so a handler that read render-time state would see 0 twice.
    act(() => {
      addCheese.click();
      addCheese.click();
    });
    expect(screen.getByLabelText('Cheese quantity')).toHaveTextContent('2');
    const removeCheese = screen.getByRole('button', { name: 'Remove Cheese' });
    act(() => {
      removeCheese.click();
      removeCheese.click();
    });
    expect(screen.getByLabelText('Cheese quantity')).toHaveTextContent('0');
  });
});
