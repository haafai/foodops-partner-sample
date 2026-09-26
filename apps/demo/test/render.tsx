import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import type { PartnerClient } from '@foodops-partner/client';
import { CartProvider } from '../src/cart/CartProvider';
import type { CartOutlet } from '../src/cart/CartProvider';
import type { CartLine } from '../src/cart/cart';
import { SessionProvider } from '../src/config/SessionProvider';
import type { Mode } from '../src/config/mode';
import type { Settings } from '../src/config/settings';

export const TEST_SETTINGS: Settings = { baseUrl: 'http://127.0.0.1:4010', apiKey: 'hbk_test_mockfull0001_fullscopes' };

export function fakeClient(overrides: Partial<Record<keyof PartnerClient, unknown>> = {}): PartnerClient {
  return {
    listOutlets: vi.fn(async () => []),
    getMenu: vi.fn(),
    createOrder: vi.fn(),
    getOrder: vi.fn(),
    cancelOrder: vi.fn(),
    ...overrides,
  } as unknown as PartnerClient;
}

export interface RenderOptions {
  client?: PartnerClient | null;
  mode?: Mode;
  settings?: Settings;
  route?: string;
  cart?: { outlet: CartOutlet; lines: CartLine[] };
}

export function renderWithProviders(ui: ReactNode, options: RenderOptions = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const client = options.client === undefined ? fakeClient() : options.client;
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[options.route ?? '/']}>
        <SessionProvider initial={{ settings: options.settings ?? TEST_SETTINGS, mode: options.mode ?? 'mock', client }}>
          <CartProvider initial={options.cart}>{ui}</CartProvider>
        </SessionProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
