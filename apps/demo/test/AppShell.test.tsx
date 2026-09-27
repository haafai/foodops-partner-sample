import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { lineFromSelection } from '../src/cart/cart';
import { AppShell } from '../src/components/AppShell';
import { CLASSIC, OUTLETS_FIXTURE } from './menu-fixture';
import { fakeClient, renderWithProviders } from './render';

const twoLines = {
  outlet: { outletId: 'o-marine', name: 'Marine Drive' },
  lines: [lineFromSelection(CLASSIC, CLASSIC.variants[0], [], 1, ''), lineFromSelection(CLASSIC, CLASSIC.variants[0], [], 2, '')],
};
const client = () => fakeClient({ listOutlets: vi.fn(async () => OUTLETS_FIXTURE) });

describe('AppShell', () => {
  it('shows the wordmark, the mode pill and the four destinations', () => {
    renderWithProviders(<AppShell><p>page</p></AppShell>, { client: client(), route: '/orders' });
    expect(screen.getByRole('link', { name: 'Kaana home' })).toHaveAttribute('href', '/outlets');
    expect(screen.getByTestId('mode-banner')).toHaveTextContent('Mock');
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/outlets');
    expect(within(nav).getByRole('link', { name: 'Orders' })).toHaveAttribute('href', '/orders');
    expect(within(nav).getByRole('link', { name: 'Setup' })).toHaveAttribute('href', '/setup');
    expect(within(nav).getByRole('button', { name: 'Cart' })).toBeInTheDocument();
    expect(screen.queryByTestId('cart-badge')).toBeNull();
    expect(screen.getByText('page')).toBeInTheDocument();
  });

  it('counts the cart lines on the badge and in the button name', () => {
    renderWithProviders(<AppShell><p>page</p></AppShell>, { client: client(), route: '/orders', cart: twoLines });
    expect(screen.getByTestId('cart-badge')).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: 'Cart, 2 items' })).toBeInTheDocument();
  });

  it('names the outlet on the menu route and on checkout, and nowhere else', async () => {
    renderWithProviders(<AppShell><p>menu</p></AppShell>, { client: client(), route: '/outlets/o-marine/menu' });
    expect(await screen.findByTestId('outlet-chip')).toHaveTextContent('Marine Drive');
  });

  it('names the cart outlet on checkout', () => {
    renderWithProviders(<AppShell><p>checkout</p></AppShell>, { client: client(), route: '/checkout', cart: twoLines });
    expect(screen.getByTestId('outlet-chip')).toHaveTextContent('Marine Drive');
  });

  it('shows no outlet chip on the orders route', () => {
    renderWithProviders(<AppShell><p>orders</p></AppShell>, { client: client(), route: '/orders', cart: twoLines });
    expect(screen.queryByTestId('outlet-chip')).toBeNull();
  });

  it('opens an empty cart as a sheet that says so and offers no checkout', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppShell><p>page</p></AppShell>, { client: client(), route: '/orders' });
    await user.click(screen.getByRole('button', { name: 'Cart' }));
    const sheet = screen.getByRole('dialog', { name: 'Your cart' });
    expect(sheet).toHaveTextContent('Nothing yet.');
    expect(within(sheet).queryByRole('link', { name: /checkout/i })).toBeNull();
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('opens a filled cart with its lines and a checkout link, and closes when that link is followed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppShell><p>page</p></AppShell>, { client: client(), route: '/orders', cart: twoLines });
    await user.click(screen.getByRole('button', { name: 'Cart, 2 items' }));
    const sheet = screen.getByRole('dialog', { name: 'Your cart' });
    expect(sheet).toHaveTextContent('Classic Burger');
    expect(sheet).toHaveTextContent('285.00');
    await user.click(within(sheet).getByRole('link', { name: 'Go to checkout' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lets the tab bar sit at the bottom of the screen: no ancestor of the navigation creates a containing block', () => {
    renderWithProviders(<AppShell><p>page</p></AppShell>, { client: client(), route: '/orders' });
    // A filter, a backdrop filter or a transform on an ancestor makes it the containing block of a fixed
    // descendant, and the tab bar lands on the header. jsdom has no layout, so the classes are the guard.
    for (let el = screen.getByRole('navigation', { name: 'Primary' }).parentElement; el; el = el.parentElement) {
      expect(el.className).not.toMatch(/\b(backdrop-|blur|filter|transform|translate|scale-|rotate|perspective)/);
    }
  });

  it('starts every page at the top', async () => {
    const user = userEvent.setup();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    renderWithProviders(<AppShell><p>page</p></AppShell>, { client: client(), route: '/outlets' });
    scrollTo.mockClear();
    await user.click(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', { name: 'Orders' }));
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    scrollTo.mockRestore();
  });
});
