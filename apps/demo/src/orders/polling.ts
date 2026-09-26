import { isTerminal } from '@foodops-partner/client';
import type { PartnerOrderStatus } from '@foodops-partner/client';

/** The board has many orders on one key: slower than a single tracking page. */
export const BOARD_POLL_MS = 15_000;

/** 5 s while the restaurant is deciding, 15 s afterwards, never past a terminal status, and Retry-After wins. */
export function pollIntervalMs(args: { status: PartnerOrderStatus; createdAt: string; now: number; retryAfterSeconds?: number }): number | false {
  if (isTerminal(args.status)) return false;
  if (args.retryAfterSeconds) return args.retryAfterSeconds * 1000;
  return args.now - Date.parse(args.createdAt) < 120_000 ? 5_000 : 15_000;
}
