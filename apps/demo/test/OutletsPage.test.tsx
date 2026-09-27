import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OutletsPage } from '../src/pages/OutletsPage';
import { OUTLETS_FIXTURE } from './menu-fixture';
import { fakeClient, renderWithProviders } from './render';

// The page is tested on tiles, whatever photos have been generated since.
vi.mock('../src/images/manifest', () => ({ AVAILABLE_IMAGES: new Set<string>() }));

const LONG = 'Thebestlittleseasidegrillandjuicebarinthewholeofthegreatermaleregion';

function renderHome(outlets = OUTLETS_FIXTURE) {
  const client = fakeClient({ listOutlets: vi.fn(async () => outlets) });
  renderWithProviders(<OutletsPage />, { client, route: '/outlets' });
}

describe('OutletsPage', () => {
  it('lists outlets with their accepting badge, timeout and a menu link', async () => {
    renderHome();
    expect(await screen.findByText('Marine Drive')).toBeInTheDocument();
    const marine = screen.getByText('Marine Drive').closest('article')!;
    expect(marine).toHaveTextContent('Accepting orders');
    expect(marine).toHaveTextContent('Auto-reject after 10 min');
    expect(marine.querySelector('a')).toHaveAttribute('href', '/outlets/o-marine/menu');
    expect(screen.getByText('Lagoon Kiosk').closest('article')).toHaveTextContent('Not accepting orders');
  });

  it('greets the customer and shows a tile where a photo has not been generated', async () => {
    renderHome();
    expect(await screen.findByRole('heading', { name: "Hungry? Kaana's got you." })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Marine Drive' })).toHaveTextContent('MD');
  });

  it('filters the restaurants by name as you type, ignoring case', async () => {
    const user = userEvent.setup();
    renderHome();
    await screen.findByText('Marine Drive');
    await user.type(screen.getByLabelText('Find a restaurant'), 'LAGOON');
    expect(screen.queryByText('Marine Drive')).toBeNull();
    expect(screen.getByText('Lagoon Kiosk')).toBeInTheDocument();
  });

  it('says so when nothing matches, and recovers when the filter is cleared', async () => {
    const user = userEvent.setup();
    renderHome();
    await screen.findByText('Marine Drive');
    const field = screen.getByLabelText('Find a restaurant');
    await user.type(field, 'pizza');
    expect(screen.getByText(/No restaurant matches/)).toHaveTextContent('pizza');
    await user.clear(field);
    expect(screen.getByText('Marine Drive')).toBeInTheDocument();
    expect(screen.getByText('Lagoon Kiosk')).toBeInTheDocument();
  });

  it('truncates a very long name and keeps the full name in its title', async () => {
    renderHome([{ ...OUTLETS_FIXTURE[0], name: LONG }]);
    const heading = await screen.findByRole('heading', { name: LONG });
    expect(heading).toHaveAttribute('title', LONG);
    expect(heading.className).toContain('truncate');
  });

  it('says that this key has no restaurants when the API returns none', async () => {
    renderHome([]);
    expect(await screen.findByText(/No restaurants are available to this key yet/)).toBeInTheDocument();
    expect(screen.queryByText(/No restaurant matches/)).toBeNull();
  });
});
