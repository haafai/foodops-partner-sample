import { createContext, useContext } from 'react';

export interface WebhookFeedValue {
  /** True while this key's webhook points at our receiver, and the receiver is answering and holds a secret. Polling may then slow down. */
  active: boolean;
}

/** How often the page asks its own receiver what arrived. This is a local call, not one to the restaurant. */
export const FEED_POLL_MS = 2_000;
/** The API may serve a cached menu for up to 60 s, so a re-fetch right after `menu.updated` can still be the old one. */
export const MENU_RECHECK_MS = 65_000;

// Outside the provider (most tests, and any page rendered alone) the answer is simply "not active".
export const WebhookFeedContext = createContext<WebhookFeedValue>({ active: false });

export function useWebhookFeed(): WebhookFeedValue {
  return useContext(WebhookFeedContext);
}
