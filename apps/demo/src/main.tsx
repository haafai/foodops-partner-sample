import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { CartProvider } from './cart/CartProvider';
import { SessionProvider } from './config/SessionProvider';
import { WebhookFeedProvider } from './webhooks/WebhookFeedProvider';
import './index.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionProvider>
          <WebhookFeedProvider>
            <CartProvider>
              <App />
            </CartProvider>
          </WebhookFeedProvider>
        </SessionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
