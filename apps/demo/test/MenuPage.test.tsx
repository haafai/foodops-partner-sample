import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { MenuPage } from '../src/pages/MenuPage';
import { MENU_FIXTURE, OUTLETS_FIXTURE } from './menu-fixture';
import { fakeClient, renderWithProviders } from './render';

function renderMenu(getMenu = vi.fn(async () => ({ modified: true as const, menu: MENU_FIXTURE, etag: '"abc123def456"' }))) {
  const client = fakeClient({ listOutlets: vi.fn(async () => OUTLETS_FIXTURE), getMenu });
  renderWithProviders(<Routes><Route path="/outlets/:outletId/menu" element={<MenuPage />} /></Routes>, { client, route: '/outlets/o-marine/menu' });
  return { getMenu };
}

describe('MenuPage', () => {
  it('shows the price list, partner prices, and greys an unavailable variant', async () => {
    renderMenu();
    expect(await screen.findByText(/Partner \+15%/)).toBeInTheDocument();
    const classic = screen.getByRole('heading', { name: 'Classic Burger' }).closest('section')!;
    expect(within(classic).getByLabelText(/Regular/)).toBeEnabled();
    expect(within(classic).getByLabelText(/Large/)).toBeDisabled();
    expect(classic).toHaveTextContent('95.00');
  });

  it('will not add an item until its required group is picked, and caps a group at its max', async () => {
    const user = userEvent.setup();
    renderMenu();
    const chicken = (await screen.findByRole('heading', { name: 'Chicken Burger' })).closest('section')!;
    const addChicken = within(chicken).getByRole('button', { name: 'Add Chicken Burger to cart' });
    expect(addChicken).toBeDisabled();
    expect(chicken).toHaveTextContent('Spice level: choose at least 1.');
    await user.click(within(chicken).getByRole('button', { name: 'Add Mild' }));
    expect(addChicken).toBeEnabled();

    const classic = screen.getByRole('heading', { name: 'Classic Burger' }).closest('section')!;
    const addCheese = within(classic).getByRole('button', { name: 'Add Cheese' });
    await user.click(addCheese);
    await user.click(addCheese);
    await user.click(addCheese);
    await user.click(within(classic).getByRole('button', { name: 'Add Bacon' }));
    expect(within(classic).getByRole('button', { name: 'Add Classic Burger to cart' })).toBeDisabled();
    expect(classic).toHaveTextContent('Extras: at most 3.');
  });

  it('adds to the cart and shows the estimate', async () => {
    const user = userEvent.setup();
    renderMenu();
    const classic = (await screen.findByRole('heading', { name: 'Classic Burger' })).closest('section')!;
    await user.click(within(classic).getByRole('button', { name: 'Add Cheese' }));
    await user.click(within(classic).getByRole('button', { name: 'Add Classic Burger to cart' }));
    const cart = screen.getByRole('complementary');
    expect(cart).toHaveTextContent('Classic Burger');
    expect(cart).toHaveTextContent('107.00');
    expect(within(cart).getByRole('link', { name: /checkout/i })).toHaveAttribute('href', '/checkout');
  });

  it('re-checks the menu with the last ETag and reports not modified', async () => {
    const user = userEvent.setup();
    const getMenu = vi.fn()
      .mockResolvedValueOnce({ modified: true, menu: MENU_FIXTURE, etag: '"abc123def456"' })
      .mockResolvedValueOnce({ modified: false, etag: '"abc123def456"' });
    renderMenu(getMenu);
    expect(await screen.findByTestId('menu-version')).toHaveTextContent('downloaded');
    await user.click(screen.getByRole('button', { name: /check for changes/i }));
    expect(await screen.findByText(/not modified/)).toBeInTheDocument();
    expect(getMenu).toHaveBeenNthCalledWith(2, 'o-marine', { ifNoneMatch: '"abc123def456"' });
    expect(screen.getByTestId('menu-version')).toHaveTextContent('version abc123de');
  });
});
