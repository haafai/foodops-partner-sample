import { describe, expect, it } from 'vitest';
import { BOARD_POLL_MS, pollIntervalMs } from '../src/orders/polling';

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
});
