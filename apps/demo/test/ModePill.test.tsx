import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ModePill } from '../src/components/ModePill';
import { MODE_INFO } from '../src/config/modeInfo';
import { renderWithProviders } from './render';

describe('ModePill', () => {
  it.each(['mock', 'local', 'live'] as const)('shows the %s label with its sentence as the title', (mode) => {
    renderWithProviders(<ModePill />, { mode });
    const pill = screen.getByTestId('mode-banner');
    expect(pill).toHaveTextContent(MODE_INFO[mode].label);
    expect(pill).toHaveAttribute('title', MODE_INFO[mode].hint);
  });

  it('keeps the three sentences the demo has always shown', () => {
    expect(MODE_INFO.mock.hint).toBe('Talking to the built-in mock. Nothing here is real.');
    expect(MODE_INFO.local.hint).toBe('Talking to a local or test API with a test key.');
    expect(MODE_INFO.live.hint).toBe('Talking to production with a live key. Orders here reach a real kitchen.');
  });
});
