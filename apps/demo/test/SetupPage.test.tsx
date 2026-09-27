import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { lineFromSelection } from '../src/cart/cart';
import { useCart } from '../src/cart/CartProvider';
import { SetupPage } from '../src/pages/SetupPage';
import { CLASSIC } from './menu-fixture';
import { renderWithProviders } from './render';

/** Seeds one cached query, as if outlets had been loaded from the old server. */
function SeedQuery() {
  const queryClient = useQueryClient();
  useState(() => queryClient.setQueryData(['outlets', 'old-server'], [{ outletId: 'old' }]));
  return null;
}

/** Prints what survived the save: the cart's line count and the number of cached queries. */
function Probe() {
  const cart = useCart();
  const queryClient = useQueryClient();
  return (
    <div>
      <h1>Outlets here</h1>
      <p data-testid="cart-lines">{cart.lines.length}</p>
      <p data-testid="cached-queries">{queryClient.getQueryCache().getAll().length}</p>
    </div>
  );
}

function renderSetup() {
  return renderWithProviders(
    <Routes>
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/outlets" element={<h1>Outlets here</h1>} />
    </Routes>,
    { route: '/setup', client: null, settings: { baseUrl: '', apiKey: '' } },
  );
}

describe('SetupPage', () => {
  it('blocks a live key against a localhost URL and keeps the key out of the page', async () => {
    const user = userEvent.setup();
    renderSetup();
    await user.type(screen.getByLabelText(/base url/i), 'https://localhost:8443');
    await user.type(screen.getByLabelText(/api key/i), 'hbk_live_k3f7x2m4q6zt_abcDEF123');
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/live key/i);
    expect(document.body.textContent).not.toContain('abcDEF123');
    expect(screen.queryByText('Outlets here')).toBeNull();
  });

  it('saves a test key against the mock URL, shows it redacted, and moves on to outlets', async () => {
    const user = userEvent.setup();
    renderSetup();
    await user.type(screen.getByLabelText(/base url/i), 'http://127.0.0.1:4010/');
    await user.type(screen.getByLabelText(/api key/i), 'hbk_test_mockfull0001_fullscopes');
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText('Outlets here')).toBeInTheDocument();
    expect(sessionStorage.getItem('partner-demo.apiKey')).toBe('hbk_test_mockfull0001_fullscopes');
    expect(localStorage.getItem('partner-demo.baseUrl')).toBe('http://127.0.0.1:4010');
  });

  it('empties the cart and the query cache when the settings are saved', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/setup" element={<><SeedQuery /><SetupPage /></>} />
        <Route path="/outlets" element={<Probe />} />
      </Routes>,
      {
        route: '/setup', client: null, settings: { baseUrl: 'http://127.0.0.1:4010', apiKey: '' },
        cart: { outlet: { outletId: 'o-marine', name: 'Marine Drive' }, lines: [lineFromSelection(CLASSIC, CLASSIC.variants[0], [], 2, '')] },
      },
    );
    await user.type(screen.getByLabelText(/api key/i), 'hbk_test_mockfull0001_fullscopes');
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText('Outlets here')).toBeInTheDocument();
    expect(screen.getByTestId('cart-lines')).toHaveTextContent('0');
    expect(screen.getByTestId('cached-queries')).toHaveTextContent('0');
  });

  it('spells out the mode on the card once a key is saved, and keeps the key redacted', () => {
    renderWithProviders(<SetupPage />, { route: '/setup', mode: 'local' });
    expect(screen.getByTestId('mode-sentence')).toHaveTextContent('Local. Talking to a local or test API with a test key.');
    expect(document.body.textContent).toContain('hbk_test_mockfull0001_…');
    expect(document.body.textContent).not.toContain('fullscopes');
  });

  it('says nothing about the mode before a key is saved', () => {
    renderSetup();
    expect(screen.queryByTestId('mode-sentence')).toBeNull();
  });
});
