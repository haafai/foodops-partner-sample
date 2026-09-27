import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import type { PartnerMenu } from '@foodops-partner/client';
import { MenuPage } from '../src/pages/MenuPage';
import { CLASSIC, MENU_FIXTURE, NO_VARIANTS, OUTLETS_FIXTURE, SOLD_OUT } from './menu-fixture';
import { fakeClient, renderWithProviders } from './render';

function renderMenu(getMenu = vi.fn(async () => ({ modified: true as const, menu: MENU_FIXTURE, etag: '"abc123def456"' }))) {
  const client = fakeClient({ listOutlets: vi.fn(async () => OUTLETS_FIXTURE), getMenu });
  renderWithProviders(<Routes><Route path="/outlets/:outletId/menu" element={<MenuPage />} /></Routes>, { client, route: '/outlets/o-marine/menu' });
  return { getMenu };
}
const menuWith = (items: PartnerMenu['categories'][number]['items']): PartnerMenu =>
  ({ ...MENU_FIXTURE, categories: [{ id: 'c-burgers', name: 'Burgers', sortOrder: 1, items }] });
const card = (name: string) => screen.getByRole('heading', { name }).closest('article')!;

describe('MenuPage', () => {
  it('shows the price list, the partner prices on the cards, and the category tabs', async () => {
    renderMenu();
    expect(await screen.findByText(/Partner \+15%/)).toBeInTheDocument();
    expect(card('Classic Burger')).toHaveTextContent('from 95.00');
    expect(card('Chicken Burger')).toHaveTextContent('90.00');
    expect(card('Chicken Burger')).not.toHaveTextContent('from');
    const tabs = screen.getByRole('navigation', { name: 'Menu categories' });
    expect(within(tabs).getByRole('link', { name: 'Burgers' })).toHaveAttribute('href', '#category-c-burgers');
    expect(screen.getByRole('heading', { name: 'Burgers' }).closest('section')).toHaveAttribute('id', 'category-c-burgers');
  });

  it('opens the picker in a sheet for an item with sizes or modifiers, and greys an unavailable size', async () => {
    const user = userEvent.setup();
    renderMenu();
    await screen.findByText(/Partner \+15%/);
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Add Classic Burger' }));
    const sheet = screen.getByRole('dialog', { name: 'Classic Burger' });
    expect(within(sheet).getByLabelText(/Regular/)).toBeEnabled();
    expect(within(sheet).getByLabelText(/Large/)).toBeDisabled();
    expect(sheet).toHaveTextContent('95.00');
    expect(within(sheet).queryByRole('heading', { level: 3 })).toBeNull();
  });

  it('will not add an item until its required group is picked, and caps a group at its max', async () => {
    const user = userEvent.setup();
    renderMenu();
    await screen.findByText(/Partner \+15%/);
    await user.click(screen.getByRole('button', { name: 'Add Chicken Burger' }));
    const chicken = screen.getByRole('dialog', { name: 'Chicken Burger' });
    const addChicken = within(chicken).getByRole('button', { name: 'Add Chicken Burger to cart' });
    expect(addChicken).toBeDisabled();
    expect(chicken).toHaveTextContent('Spice level: choose at least 1.');
    await user.click(within(chicken).getByRole('button', { name: 'Add Mild' }));
    expect(addChicken).toBeEnabled();
    await user.click(within(chicken).getByRole('button', { name: 'Close Chicken Burger' }));

    await user.click(screen.getByRole('button', { name: 'Add Classic Burger' }));
    const classic = screen.getByRole('dialog', { name: 'Classic Burger' });
    const addCheese = within(classic).getByRole('button', { name: 'Add Cheese' });
    await user.click(addCheese);
    await user.click(addCheese);
    await user.click(addCheese);
    await user.click(within(classic).getByRole('button', { name: 'Add Bacon' }));
    expect(within(classic).getByRole('button', { name: 'Add Classic Burger to cart' })).toBeDisabled();
    expect(classic).toHaveTextContent('Extras: at most 3.');
  });

  it('adds through the sheet, closes it, and shows the estimate in the cart column', async () => {
    const user = userEvent.setup();
    renderMenu();
    await screen.findByText(/Partner \+15%/);
    await user.click(screen.getByRole('button', { name: 'Add Classic Burger' }));
    const sheet = screen.getByRole('dialog', { name: 'Classic Burger' });
    await user.click(within(sheet).getByRole('button', { name: 'Add Cheese' }));
    await user.click(within(sheet).getByRole('button', { name: 'Add Classic Burger to cart' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const cart = screen.getByRole('complementary');
    expect(cart).toHaveTextContent('Classic Burger');
    expect(cart).toHaveTextContent('107.00');
    expect(within(cart).getByRole('link', { name: /checkout/i })).toHaveAttribute('href', '/checkout');
  });

  it('adds a plain item in one tap, with no sheet', async () => {
    const user = userEvent.setup();
    renderMenu();
    await screen.findByText(/Partner \+15%/);
    const add = screen.getByRole('button', { name: 'Add Veggie Burger' });
    await user.click(add);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(add).toHaveTextContent('Added');
    const cart = screen.getByRole('complementary');
    expect(cart).toHaveTextContent('1 × Veggie Burger (Regular)');
    expect(cart).toHaveTextContent('85.00');
  });

  it('closes the sheet on Escape without adding anything and gives the focus back to the card button', async () => {
    const user = userEvent.setup();
    renderMenu();
    await screen.findByText(/Partner \+15%/);
    const opener = screen.getByRole('button', { name: 'Add Classic Burger' });
    await user.click(opener);
    await user.click(within(screen.getByRole('dialog', { name: 'Classic Burger' })).getByRole('button', { name: 'Add Cheese' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
    expect(screen.getByRole('complementary')).toHaveTextContent('Nothing yet.');
  });

  it('starts the picker fresh each time the sheet is opened', async () => {
    const user = userEvent.setup();
    renderMenu();
    await screen.findByText(/Partner \+15%/);
    await user.click(screen.getByRole('button', { name: 'Add Classic Burger' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add Cheese' }));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Add Classic Burger' }));
    expect(within(screen.getByRole('dialog')).getByLabelText('Cheese quantity')).toHaveTextContent('0');
  });

  it('marks an item sold out when no size is available or it has no sizes at all', async () => {
    renderMenu(vi.fn(async () => ({ modified: true as const, menu: menuWith([SOLD_OUT, NO_VARIANTS]), etag: '"x"' })));
    expect(await screen.findByRole('heading', { name: 'Lobster Roll' })).toBeInTheDocument();
    expect(card('Lobster Roll')).toHaveTextContent('Sold out');
    expect(card('Mystery Special')).toHaveTextContent('Sold out');
    expect(screen.queryByRole('button', { name: 'Add Lobster Roll' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add Mystery Special' })).toBeNull();
  });

  it('truncates a very long dish name and keeps the full name in its title', async () => {
    const LONG = 'Doublesmokedreeffishburgerwithextraeverythingandthenalittlebitmore';
    renderMenu(vi.fn(async () => ({ modified: true as const, menu: menuWith([{ ...CLASSIC, name: LONG }]), etag: '"x"' })));
    const heading = await screen.findByRole('heading', { name: LONG });
    expect(heading).toHaveAttribute('title', LONG);
    expect(heading.className).toContain('truncate');
  });

  it('offers a floating cart bar that opens the cart as a sheet', async () => {
    const user = userEvent.setup();
    renderMenu();
    await screen.findByText(/Partner \+15%/);
    expect(screen.queryByRole('button', { name: /View cart/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Add Veggie Burger' }));
    await user.click(screen.getByRole('button', { name: 'View cart, 1 item, 85.00' }));
    const sheet = screen.getByRole('dialog', { name: 'Your cart' });
    expect(sheet).toHaveTextContent('Veggie Burger');
    expect(within(sheet).getByRole('link', { name: 'Go to checkout' })).toHaveAttribute('href', '/checkout');
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
