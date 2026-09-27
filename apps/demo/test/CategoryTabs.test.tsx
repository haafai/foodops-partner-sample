import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CategoryTabs } from '../src/components/CategoryTabs';

const CATEGORIES = [{ id: 'a', name: 'Burgers' }, { id: 'b', name: 'Drinks' }, { id: 'c', name: 'Sides' }];

describe('CategoryTabs', () => {
  it('starts on the first category', () => {
    render(<CategoryTabs categories={CATEGORIES} />);
    expect(screen.getByRole('link', { name: 'Burgers' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('link', { name: 'Sides' })).not.toHaveAttribute('aria-current');
  });

  it('marks the tab you click as the current one', async () => {
    const user = userEvent.setup();
    render(<CategoryTabs categories={CATEGORIES} />);
    await user.click(screen.getByRole('link', { name: 'Sides' }));
    expect(screen.getByRole('link', { name: 'Sides' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('link', { name: 'Burgers' })).not.toHaveAttribute('aria-current');
  });
});
