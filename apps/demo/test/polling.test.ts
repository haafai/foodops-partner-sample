import { describe, expect, it } from 'vitest';
import { BACKSTOP_POLL_MS, BOARD_POLL_MS, MENU_BACKSTOP_MS, boardPollMs, menuPollMs, pollIntervalMs } from '../src/orders/polling';

const createdAt = '2026-09-26T09:00:00.000Z';
const at = (seconds: number) => Date.parse(createdAt) + seconds * 1000;

describe('pollIntervalMs', () => {
  it('polls every 5 s for the first two minutes, then every 15 s', () => {
    expect(pollIntervalMs({ status: 'pending', createdAt, now: at(10) })).toBe(5_000);
    expect(pollIntervalMs({ status: 'accepted', createdAt, now: at(119) })).toBe(5_000);
    expect(pollIntervalMs({ status: 'preparing', createdAt, now: at(121) })).toBe(15_000);
  });
  it('stops at a terminal status', () => {
    expect(pollIntervalMs({ status: 'picked_up', createdAt, now: at(10) })).toBe(false);
    expect(pollIntervalMs({ status: 'rejected', createdAt, now: at(10) })).toBe(false);
    expect(pollIntervalMs({ status: 'cancelled', createdAt, now: at(10) })).toBe(false);
  });
  it('waits Retry-After when the server asked for it', () => {
    expect(pollIntervalMs({ status: 'pending', createdAt, now: at(10), retryAfterSeconds: 30 })).toBe(30_000);
  });
  it('the board polls more slowly than a single order', () => {
    expect(BOARD_POLL_MS).toBe(15_000);
  });
  it('slows to a one-minute backstop while webhooks are delivering, but never stops before a final status', () => {
    expect(BACKSTOP_POLL_MS).toBe(60_000);
    expect(pollIntervalMs({ status: 'pending', createdAt, now: at(10), webhookActive: true })).toBe(60_000);
    expect(pollIntervalMs({ status: 'preparing', createdAt, now: at(500), webhookActive: true })).toBe(60_000);
    expect(pollIntervalMs({ status: 'picked_up', createdAt, now: at(10), webhookActive: true })).toBe(false);
  });
  it('Retry-After still wins over the backstop', () => {
    expect(pollIntervalMs({ status: 'pending', createdAt, now: at(10), retryAfterSeconds: 90, webhookActive: true })).toBe(90_000);
  });
  it('the board and the menu have a backstop pace too', () => {
    expect(boardPollMs(false)).toBe(15_000);
    expect(boardPollMs(true)).toBe(60_000);
    expect(menuPollMs(false)).toBe(60_000);
    expect(menuPollMs(true)).toBe(MENU_BACKSTOP_MS);
    expect(MENU_BACKSTOP_MS).toBe(600_000);
  });
});
