import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OutletsPage } from '../src/pages/OutletsPage';
import { OUTLETS_FIXTURE } from './menu-fixture';
import { fakeClient, renderWithProviders } from './render';

describe('OutletsPage', () => {
  it('lists outlets with their accepting badge, timeout and a menu link', async () => {
    const client = fakeClient({ listOutlets: vi.fn(async () => OUTLETS_FIXTURE) });
    renderWithProviders(<OutletsPage />, { client, route: '/outlets' });
    expect(await screen.findByText('Marine Drive')).toBeInTheDocument();
    const marine = screen.getByText('Marine Drive').closest('article')!;
    expect(marine).toHaveTextContent('Accepting orders');
    expect(marine).toHaveTextContent('Auto-reject after 10 min');
    expect(marine.querySelector('a')).toHaveAttribute('href', '/outlets/o-marine/menu');
    expect(screen.getByText('Lagoon Kiosk').closest('article')).toHaveTextContent('Not accepting orders');
  });
});
