import { isTerminal } from '@foodops-partner/client';
import type { PartnerOrderStatus } from '@foodops-partner/client';

/** The board has many orders on one key: slower than a single tracking page. */
export const BOARD_POLL_MS = 15_000;

/** With webhooks delivering, polling is only the backstop for an event that was lost: once a minute. */
export const BACKSTOP_POLL_MS = 60_000;

/** The menu is re-checked once a minute; with webhooks delivering, every ten minutes. */
export const MENU_POLL_MS = 60_000;
export const MENU_BACKSTOP_MS = 600_000;

/**
 * 5 s while the restaurant is deciding, 15 s afterwards, never past a terminal status, and Retry-After wins.
 * With `webhookActive` the event brings the change and this is only the safety net, so it slows to a minute.
 * It never stops: delivery is one attempt, and an event can be lost.
 */
export function pollIntervalMs(args: { status: PartnerOrderStatus; createdAt: string; now: number; retryAfterSeconds?: number; webhookActive?: boolean }): number | false {
  if (isTerminal(args.status)) return false;
  if (args.retryAfterSeconds) return args.retryAfterSeconds * 1000;
  if (args.webhookActive) return BACKSTOP_POLL_MS;
  return args.now - Date.parse(args.createdAt) < 120_000 ? 5_000 : 15_000;
}

export const boardPollMs = (webhookActive: boolean): number => (webhookActive ? BACKSTOP_POLL_MS : BOARD_POLL_MS);
export const menuPollMs = (webhookActive: boolean): number => (webhookActive ? MENU_BACKSTOP_MS : MENU_POLL_MS);
