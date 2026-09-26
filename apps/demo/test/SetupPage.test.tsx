import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { SetupPage } from '../src/pages/SetupPage';
import { renderWithProviders } from './render';

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
    await user.type(screen.getByLabelText(/base url/i), 'https://localhost:7202');
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
});
